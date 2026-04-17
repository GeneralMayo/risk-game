/**
 * Shared helpers that turn raw provider model-list responses into the
 * `ModelInfo[]` our UI consumes: chat-capable only, sorted by capability,
 * with human-friendly display names alongside the raw ID.
 */

import type { ModelInfo } from "./types";

// ---------------------------------------------------------------------------
// OpenAI
// ---------------------------------------------------------------------------

/** Filter in: chat-capable families. Filter out: embeddings, audio, image, etc. */
export function isOpenAIChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (
    /(embed|whisper|dall-?e|tts|audio|image|moderation|search|similarity|instruct)/.test(
      lower
    )
  )
    return false;
  if (/^(davinci|ada|babbage|curie|text-)/.test(lower)) return false;
  return /^(gpt-|o1-|o1$|o3-|o3$|o4-|o4$|chatgpt)/.test(lower);
}

/** Bigger = better. Breaks ties on date suffix when present. */
export function rankOpenAI(id: string): number {
  const l = id.toLowerCase();
  let s = 10;
  if (l.startsWith("o4")) s = 105;
  else if (l.startsWith("o3")) s = 100;
  else if (l.startsWith("o1")) s = 92;
  else if (l.startsWith("gpt-4o")) s = 88;
  else if (l.startsWith("gpt-4.5") || l.startsWith("gpt-4-turbo")) s = 78;
  else if (l.startsWith("gpt-4")) s = 68;
  else if (l.startsWith("chatgpt")) s = 60;
  else if (l.startsWith("gpt-3.5")) s = 40;
  if (l.includes("mini")) s -= 5;
  if (l.includes("nano")) s -= 6;
  // Date suffix tiebreaker, e.g. gpt-4o-2024-11-20
  const m = l.match(/(\d{4})-?(\d{2})-?(\d{2})/);
  if (m) s += (parseInt(m[1]) - 2020) * 0.4 + parseInt(m[2]) * 0.01;
  return s;
}

export function labelOpenAI(id: string): string {
  const l = id.toLowerCase();
  if (l.startsWith("gpt-4o")) {
    if (l.includes("mini")) return "GPT-4o Mini";
    if (l.includes("audio")) return "GPT-4o Audio";
    return "GPT-4o";
  }
  if (l.startsWith("gpt-4.5")) return "GPT-4.5";
  if (l.startsWith("gpt-4-turbo")) return "GPT-4 Turbo";
  if (l.startsWith("gpt-4")) return "GPT-4";
  if (l.startsWith("gpt-3.5-turbo")) return "GPT-3.5 Turbo";
  if (l.startsWith("chatgpt-4o")) return "ChatGPT-4o";
  if (l.startsWith("o4")) {
    if (l.includes("mini")) return "o4 Mini";
    return "o4";
  }
  if (l.startsWith("o3")) {
    if (l.includes("mini")) return "o3 Mini";
    return "o3";
  }
  if (l.startsWith("o1")) {
    if (l.includes("mini")) return "o1 Mini";
    if (l.includes("preview")) return "o1 Preview";
    return "o1";
  }
  return id;
}

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

export function isAnthropicChatModel(id: string): boolean {
  return id.toLowerCase().startsWith("claude-");
}

export function rankAnthropic(id: string): number {
  const l = id.toLowerCase();
  let s = 10;
  if (l.includes("opus-4")) s = 100;
  else if (l.includes("sonnet-4")) s = 92;
  else if (l.includes("haiku-4")) s = 80;
  else if (l.includes("3-7-sonnet")) s = 88;
  else if (l.includes("3-5-sonnet")) s = 78;
  else if (l.includes("3-5-haiku")) s = 68;
  else if (l.includes("3-opus")) s = 72;
  else if (l.includes("3-sonnet")) s = 55;
  else if (l.includes("3-haiku")) s = 45;
  if (l.includes("latest")) s += 0.5;
  const m = l.match(/(20\d{6})/);
  if (m) s += parseInt(m[1].slice(-4)) / 10000;
  return s;
}

export function labelAnthropic(id: string): string {
  const l = id.toLowerCase();
  const pretty = (kind: string, gen: string) => `Claude ${gen} ${kind}`;
  if (l.includes("opus-4-5")) return pretty("Opus", "4.5");
  if (l.includes("opus-4")) return pretty("Opus", "4");
  if (l.includes("sonnet-4-5")) return pretty("Sonnet", "4.5");
  if (l.includes("sonnet-4")) return pretty("Sonnet", "4");
  if (l.includes("haiku-4-5")) return pretty("Haiku", "4.5");
  if (l.includes("haiku-4")) return pretty("Haiku", "4");
  if (l.includes("3-7-sonnet")) return pretty("Sonnet", "3.7");
  if (l.includes("3-5-sonnet")) return pretty("Sonnet", "3.5");
  if (l.includes("3-5-haiku")) return pretty("Haiku", "3.5");
  if (l.includes("3-opus")) return pretty("Opus", "3");
  if (l.includes("3-sonnet")) return pretty("Sonnet", "3");
  if (l.includes("3-haiku")) return pretty("Haiku", "3");
  return id;
}

/**
 * Curated fallback list used when Anthropic's `/v1/models` endpoint is
 * unavailable or returns an unexpected shape. We intentionally keep this short
 * and conservative — the UI shows a tooltip noting the list came from fallback.
 */
export const ANTHROPIC_FALLBACK_IDS: string[] = [
  "claude-opus-4-5",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
  "claude-opus-4",
  "claude-sonnet-4",
  "claude-3-7-sonnet-latest",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
  "claude-3-opus-latest",
];

export function toModelInfos(
  raw: string[],
  provider: "openai" | "anthropic"
): ModelInfo[] {
  const accept =
    provider === "openai" ? isOpenAIChatModel : isAnthropicChatModel;
  const rank = provider === "openai" ? rankOpenAI : rankAnthropic;
  const label = provider === "openai" ? labelOpenAI : labelAnthropic;
  const unique = Array.from(new Set(raw)).filter(accept);
  const items: ModelInfo[] = unique.map((id) => ({
    id,
    label: label(id),
    rank: rank(id),
  }));
  items.sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
  return items;
}
