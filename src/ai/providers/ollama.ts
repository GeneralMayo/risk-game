import {
  parseDecision,
  type LLMDecision,
  type Provider,
  type ProviderRequest,
} from "./types";
import { getLimiter } from "./rateLimiter";

export class OllamaProvider implements Provider {
  readonly id = "ollama" as const;
  readonly label = "Ollama";
  model: string;
  private baseUrl: string;

  constructor(opts: { model?: string; baseUrl?: string }) {
    this.model = opts.model ?? "llama3.1:8b";
    this.baseUrl = opts.baseUrl ?? "http://localhost:11434";
  }

  async decide(req: ProviderRequest): Promise<LLMDecision | null> {
    const limiter = getLimiter(this.id);
    try {
      await limiter.acquire(req.abortSignal);
    } catch {
      return null;
    }
    try {
      const res = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            stream: false,
            format: "json",
            options: { temperature: req.temperature ?? 0.5 },
            messages: [
              { role: "system", content: req.systemPrompt },
              { role: "user", content: req.userPrompt },
            ],
          }),
          signal: req.abortSignal,
        }
      );
      if (res.status === 429) {
        limiter.markRateLimited(res.headers.get("retry-after"));
        return null;
      }
      if (!res.ok) {
        console.warn("[Ollama] HTTP", res.status);
        return null;
      }
      limiter.markSuccess();
      req.onUsage?.();
      const data = await res.json();
      const text: string = data?.message?.content ?? "";
      return parseDecision(text);
    } catch (err) {
      if ((err as Error).name === "AbortError") return null;
      console.warn("[Ollama] error", err);
      return null;
    }
  }

  async validate(): Promise<{ ok: boolean; message: string }> {
    try {
      const res = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/api/tags`
      );
      if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
      const data = await res.json();
      const names = Array.isArray(data?.models)
        ? (data.models as Array<{ name: string }>).map((m) => m.name)
        : [];
      return {
        ok: true,
        message: names.length
          ? `Connected · ${names.length} models`
          : "Connected · no models installed",
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }
}
