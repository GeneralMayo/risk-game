import {
  parseDecision,
  type LLMDecision,
  type ListModelsResult,
  type Provider,
  type ProviderRequest,
} from "./types";
import { getLimiter, RateLimitedError } from "./rateLimiter";
import { toModelInfos } from "./modelCatalog";

export class OpenAIProvider implements Provider {
  readonly id = "openai" as const;
  readonly label = "OpenAI";
  model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(opts: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
  }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? "gpt-4o-mini";
    this.baseUrl = opts.baseUrl ?? "https://api.openai.com/v1";
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
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: req.temperature ?? 0.5,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: req.systemPrompt },
              { role: "user", content: req.userPrompt },
            ],
          }),
          signal: req.abortSignal,
        });

        if (res.status === 429) {
          const retry = limiter.markRateLimited(res.headers.get("retry-after"));
          req.onRateLimited?.(retry);
          continue; // loop and retry after cooldown
        }
        if (!res.ok) {
          console.warn("[OpenAI] HTTP", res.status, await res.text().catch(() => ""));
          return null;
        }
        limiter.markSuccess();
        req.onUsage?.();
        const data = await res.json();
        const text: string = data?.choices?.[0]?.message?.content ?? "";
        return parseDecision(text);
      } catch (err) {
        if ((err as Error).name === "AbortError") return null;
        if (err instanceof RateLimitedError) continue;
        console.warn("[OpenAI] error", err);
        return null;
      }
    }
    return null;
  }

  async validate(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (res.status === 401)
        return { ok: false, message: "Key rejected" };
      if (res.status === 429)
        return { ok: true, message: "Key verified (currently rate-limited)" };
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      return { ok: true, message: "Key verified" };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  async listModels(): Promise<ListModelsResult> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (res.status === 401) return { ok: false, message: "Key rejected" };
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      const data = await res.json();
      if (!Array.isArray(data?.data))
        return { ok: false, message: "Unexpected response" };
      const ids = (data.data as Array<{ id?: unknown }>)
        .map((m) => (typeof m.id === "string" ? m.id : null))
        .filter((s): s is string => !!s);
      const models = toModelInfos(ids, "openai");
      if (models.length === 0)
        return { ok: false, message: "No chat-capable models on this key" };
      return { ok: true, models, source: "api" };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}
