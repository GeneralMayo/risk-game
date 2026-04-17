import { useEffect } from "react";
import { useGameStore } from "@/state/gameStore";
import { cn } from "@/lib/utils";

/**
 * Tiny non-blocking hint toast shown at the top of the board. Used to give
 * gentle feedback on invalid clicks ("Not adjacent", "Need 2 armies", etc.).
 *
 * Auto-clears itself 1.6s after the latest hint, so the toast never gets
 * stuck. Never intercepts pointer events.
 */
export function HintToast() {
  const hint = useGameStore((s) => s.hint);
  const clearHint = useGameStore((s) => s.clearHint);
  const lastBattleTs = useGameStore((s) => s.lastBattle?.timestamp ?? 0);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => {
      // Only clear if this specific hint is still current
      if (useGameStore.getState().hint?.id === hint.id) clearHint();
    }, 1600);
    return () => clearTimeout(t);
  }, [hint, clearHint]);

  if (!hint) return null;

  // Hide hints while a battle result is actively animating to avoid stacking.
  const now = Date.now();
  if (lastBattleTs && now - lastBattleTs < 1600) return null;

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 animate-fade-in"
      key={hint.id}
    >
      <div
        className={cn(
          "rounded-full border px-3 py-1 text-[11px] shadow-lg backdrop-blur-sm",
          hint.tone === "warn"
            ? "border-red-500/60 bg-red-950/90 text-red-100"
            : "border-border/60 bg-[#140a04]/95 text-muted-foreground"
        )}
      >
        {hint.message}
      </div>
    </div>
  );
}
