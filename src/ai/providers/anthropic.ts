import {
  parseDecision,
  type LLMDecision,
  type ListModelsResult,
  type Provider,
  type ProviderRequest,
} from "./types";
import { getLimiter, RateLimitedError } from "./rateLimiter";
import { ANTHROPIC_FALLBACK_IDS, toModelInfos } from "./modelCatalog";

/**
 * Anthropic Messages API. Calling the API directly from a browser requires
 * the `anthropic-dangerous-direct-browser-access: true` header (since the
 * user is deliberately pasting their own key into a local app).
 */
export class AnthropicProvider implements Provider {
  readonly id = "anthropic" as const;
  readonly label = "Claude";
  model: string;
  private apiKey: string;
  private baseUrl: string;
  private version: string;

  constructor(opts: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
    version?: string;
  }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "claude-3-5-haiku-latest";
    this.baseUrl = opts.baseUrl ?? "https://api.anthropic.com/v1";
    this.version = opts.version ?? "2023-06-01";
  }

  private headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": this.version,
      "anthropic-dangerous-direct-browser-access": "true",
    };
  }

  async decide(req: ProviderRequest): Promise<LLMDecision | null> {
    const limiter = getLimiter(this.id);
    let attempt = 0;
    while (attempt++ < 3) {
      try {
        await limiter.acquire(req.abortSignal);
      } catch {
        return null;
      }
      try {
        const res = await fetch(`${this.baseUrl}/messages`, {
          method: "POST",
          headers: this.headers(),
          body: JSON.stringify({
            model: this.model,
            max_tokens: 800,
            temperature: req.temperature ?? 0.5,
            system: req.systemPrompt,
            messages: [{ role: "user", content: req.userPrompt }],
          }),
          signal: req.abortSignal,
        });

        if (res.status === 429) {
          const retry = limiter.markRateLimited(res.headers.get("retry-after"));
          req.onRateLimited?.(retry);
          continue;
        }
        if (!res.ok) {
          console.warn(
            "[Anthropic] HTTP",
            res.status,
            await res.text().catch(() => "")
          );
          return null;
        }
        limiter.markSuccess();
        req.onUsage?.();
        const data = await res.json();
        // content is an array of blocks; we want the first text block.
        const block = Array.isArray(data?.content)
          ? data.content.find(
              (b: { type?: string }) => b?.type === "text"
            )
          : null;
        const text: string = block?.text ?? "";
        return parseDecision(text);
      } catch (err) {
        if ((err as Error).name === "AbortError") return null;
        if (err instanceof RateLimitedError) continue;
        console.warn("[Anthropic] error", err);
        return null;
      }
    }
    return null;
  }

  async validate(): Promise<{ ok: boolean; message: string }> {
    try {
      // Prefer the cheaper GET /models endpoint for validation — it's a free
      // metadata call and also tells us keys that lack model access.
      const res = await fetch(`${this.baseUrl}/models?limit=1`, {
        method: "GET",
        headers: this.headers(),
      });
      if (res.status === 401) return { ok: false, message: "Key rejected" };
      if (res.status === 429)
        return { ok: true, message: "Key verified (currently rate-limited)" };
      if (res.status === 404) {
        // Older clients may not support the /models endpoint — fall back to a
        // 4-token ping against /messages.
        return this.validateViaMessages();
      }
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      return { ok: true, message: "Key verified" };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  private async validateViaMessages(): Promise<{
    ok: boolean;
    message: string;
  }> {
    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (res.status === 401) return { ok: false, message: "Key rejected" };
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      return { ok: true, message: "Key verified" };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async listModels(): Promise<ListModelsResult> {
    try {
      const res = await fetch(`${this.baseUrl}/models?limit=1000`, {
        method: "GET",
        headers: this.headers(),
      });
      if (res.status === 401) return { ok: false, message: "Key rejected" };
      if (!res.ok) {
        // Fall back to the curated list
        return {
          ok: true,
          models: toModelInfos(ANTHROPIC_FALLBACK_IDS, "anthropic"),
          source: "fallback",
        };
      }
      const data = await res.json();
      if (!Array.isArray(data?.data)) {
        return {
          ok: true,
          models: toModelInfos(ANTHROPIC_FALLBACK_IDS, "anthropic"),
          source: "fallback",
        };
      }
      const ids = (data.data as Array<{ id?: unknown }>)
        .map((m) => (typeof m.id === "string" ? m.id : null))
        .filter((s): s is string => !!s);
      const models = toModelInfos(ids, "anthropic");
      if (models.length === 0) {
        return {
          ok: true,
          models: toModelInfos(ANTHROPIC_FALLBACK_IDS, "anthropic"),
          source: "fallback",
        };
      }
      return { ok: true, models, source: "api" };
    } catch {
      return {
        ok: true,
        models: toModelInfos(ANTHROPIC_FALLBACK_IDS, "anthropic"),
        source: "fallback",
      };
    }
  }
}
