import { AnthropicProvider } from "./anthropic";
import { OllamaProvider } from "./ollama";
import { OpenAIProvider } from "./openai";
import type { Provider, ProviderId } from "./types";

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
}

export interface ProviderSpec {
  id: ProviderId;
  model?: string;
  baseUrl?: string;
}

/** Cache providers so rate-limiters and keys stick across calls. */
const cache = new Map<string, Provider>();

function cacheKey(spec: ProviderSpec, keys: ApiKeys): string {
  return [
    spec.id,
    spec.model ?? "",
    spec.baseUrl ?? "",
    spec.id === "openai"
      ? (keys.openai ?? "").slice(0, 4)
      : spec.id === "anthropic"
        ? (keys.anthropic ?? "").slice(0, 4)
        : "",
  ].join("|");
}

export function getProvider(
  spec: ProviderSpec,
  keys: ApiKeys
): Provider | null {
  const key = cacheKey(spec, keys);
  const hit = cache.get(key);
  if (hit) return hit;
  let p: Provider | null = null;
  switch (spec.id) {
    case "openai":
      if (!keys.openai) return null;
      p = new OpenAIProvider({ apiKey: keys.openai, model: spec.model });
      break;
    case "anthropic":
      if (!keys.anthropic) return null;
      p = new AnthropicProvider({
        apiKey: keys.anthropic,
        model: spec.model,
      });
      break;
    case "ollama":
      p = new OllamaProvider({ model: spec.model, baseUrl: spec.baseUrl });
      break;
    case "heuristic":
      return null; // handled directly by the fallback path
  }
  if (p) cache.set(key, p);
  return p;
}

export function clearProviderCache() {
  cache.clear();
}
