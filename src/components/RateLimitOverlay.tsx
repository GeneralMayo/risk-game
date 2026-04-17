import { useEffect, useState } from "react";
import { useGameStore } from "@/state/gameStore";
import { Loader2 } from "lucide-react";

/**
 * Gentle "waiting for API" indicator. Neutral tone — the game is pausing
 * gracefully, not breaking. Dismisses itself the moment the cooldown expires.
 */
export function RateLimitOverlay() {
  const rateLimitWait = useGameStore((s) => s.rateLimitWait);
  const clearRateLimitWait = useGameStore((s) => s.clearRateLimitWait);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!rateLimitWait) return;
    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= rateLimitWait.resumesAt) clearRateLimitWait();
    }, 250);
    return () => clearInterval(interval);
  }, [rateLimitWait, clearRateLimitWait]);

  if (!rateLimitWait) return null;
  const secs = Math.max(0, Math.ceil((rateLimitWait.resumesAt - now) / 1000));
  const provider =
    rateLimitWait.providerId === "openai"
      ? "OpenAI"
      : rateLimitWait.providerId === "anthropic"
        ? "Anthropic"
        : "Ollama";

  return (
    <div className="pointer-events-none absolute left-1/2 top-14 z-20 -translate-x-1/2 animate-fade-in">
      <div className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-[#140a04]/90 px-3 py-1 text-[11px] text-muted-foreground shadow-lg backdrop-blur-sm animate-pulse-soft">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>
          Waiting for {provider} API · resumes in{" "}
          <span className="tabular-nums text-foreground">{secs}s</span>
        </span>
      </div>
    </div>
  );
}
