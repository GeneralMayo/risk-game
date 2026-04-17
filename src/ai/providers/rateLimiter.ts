/**
 * Per-provider rate limiter with cooldowns, exponential backoff + jitter.
 *
 * Usage:
 *   const limiter = getLimiter("openai");
 *   await limiter.acquire(); // blocks until safe to call
 *   try {
 *     const res = await fetch(...);
 *     if (res.status === 429) {
 *       const retry = limiter.markRateLimited(res.headers.get("retry-after"));
 *       onRateLimited?.(retry);
 *       throw new RateLimitedError(retry);
 *     }
 *     limiter.markSuccess();
 *   } catch (err) { ... }
 */

import type { ProviderId } from "./types";

interface LimiterOptions {
  /** Minimum gap between requests to this provider (ms). */
  minDelayMs: number;
  /** Max delay ever applied by backoff (ms). */
  maxBackoffMs: number;
}

const DEFAULTS: Record<ProviderId, LimiterOptions> = {
  openai: { minDelayMs: 2000, maxBackoffMs: 60_000 },
  anthropic: { minDelayMs: 2000, maxBackoffMs: 60_000 },
  ollama: { minDelayMs: 0, maxBackoffMs: 10_000 },
  heuristic: { minDelayMs: 0, maxBackoffMs: 0 },
};

export class RateLimiter {
  private nextAvailableAt = 0;
  private consecutive429s = 0;
  readonly id: ProviderId;
  readonly opts: LimiterOptions;

  constructor(id: ProviderId, opts?: Partial<LimiterOptions>) {
    this.id = id;
    this.opts = { ...DEFAULTS[id], ...(opts ?? {}) };
  }

  /** Block until it's legal to call the API. Throws if aborted. */
  async acquire(signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const wait = this.nextAvailableAt - now;
    if (wait > 0) {
      await delay(wait, signal);
    }
    this.nextAvailableAt = Date.now() + this.opts.minDelayMs;
  }

  /** Call after a successful request. */
  markSuccess() {
    this.consecutive429s = 0;
    this.nextAvailableAt = Date.now() + this.opts.minDelayMs;
  }

  /**
   * Register a 429. Returns the delay we will wait before the next acquire()
   * succeeds (caller can show this to the user).
   */
  markRateLimited(retryAfterHeader?: string | null): number {
    this.consecutive429s += 1;
    let wait = 0;
    if (retryAfterHeader) {
      const v = parseFloat(retryAfterHeader);
      if (!Number.isNaN(v) && v > 0) {
        wait = Math.min(v * 1000, this.opts.maxBackoffMs);
      }
    }
    if (!wait) {
      // Exponential backoff: 2 ^ n seconds, capped, plus jitter
      const base = Math.min(
        2 ** this.consecutive429s * 1000,
        this.opts.maxBackoffMs
      );
      wait = base * (0.5 + Math.random() * 0.5);
    }
    this.nextAvailableAt = Date.now() + wait;
    return wait;
  }

  /** Milliseconds until the next acquire() will succeed (0 if already free). */
  waitMs(): number {
    return Math.max(0, this.nextAvailableAt - Date.now());
  }
}

export class RateLimitedError extends Error {
  retryInMs: number;
  constructor(retryInMs: number, message = "Rate limited") {
    super(message);
    this.retryInMs = retryInMs;
    this.name = "RateLimitedError";
  }
}

const limiters = new Map<ProviderId, RateLimiter>();
export function getLimiter(id: ProviderId): RateLimiter {
  let l = limiters.get(id);
  if (!l) {
    l = new RateLimiter(id);
    limiters.set(id, l);
  }
  return l;
}

/** Reset all limiters (used when a new game begins). */
export function resetAllLimiters() {
  for (const l of limiters.values()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l as any).nextAvailableAt = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l as any).consecutive429s = 0;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}
