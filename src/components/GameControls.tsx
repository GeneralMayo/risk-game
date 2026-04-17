import { useGameStore } from "@/state/gameStore";
import { cn } from "@/lib/utils";
import { Pause, Play } from "lucide-react";

/**
 * Spectator controls pinned to the top-left of the board. Pause/resume the AI
 * mid-turn, and scrub the speed of AI pacing. Non-blocking — the rest of the
 * map stays interactive. Hidden for purely human turns with no AI running,
 * since there's nothing to pace.
 */
const SPEEDS: number[] = [0.5, 1, 2, 3];

export function GameControls() {
  const paused = useGameStore((s) => s.paused);
  const togglePause = useGameStore((s) => s.togglePause);
  const speed = useGameStore((s) => s.pacing.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);
  const aiThinking = useGameStore((s) => s.aiThinking);
  const humanController = useGameStore((s) => s.players.human.controller);
  const aiController = useGameStore((s) => s.players.ai.controller);
  const winner = useGameStore((s) => s.winner);

  // Hidden when there's no AI in the game at all (pure-human setup: there
  // won't be any — but keep the guard for completeness).
  const anyAI = humanController === "ai" || aiController === "ai";
  if (!anyAI) return null;
  if (winner) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto absolute left-3 top-3 z-20 flex items-center gap-2 rounded-full",
        "border border-border/60 bg-[#140a04]/90 px-1.5 py-1 shadow-lg backdrop-blur-sm",
        "text-[11px] text-muted-foreground animate-fade-in"
      )}
      role="group"
      aria-label="Game speed controls"
    >
      <button
        onClick={togglePause}
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors",
          paused
            ? "bg-accent text-accent-foreground hover:bg-accent/90"
            : "bg-card/60 text-foreground hover:bg-card"
        )}
        title={paused ? "Resume (Space)" : "Pause (Space)"}
        aria-pressed={paused}
      >
        {paused ? (
          <Play className="h-3 w-3" fill="currentColor" />
        ) : (
          <Pause className="h-3 w-3" fill="currentColor" />
        )}
      </button>

      <div className="h-4 w-px bg-border/60" />

      <div className="flex items-center gap-0.5">
        {SPEEDS.map((v) => (
          <button
            key={v}
            onClick={() => setSpeed(v)}
            className={cn(
              "min-w-[28px] rounded-full px-1.5 py-0.5 text-[11px] tabular-nums transition-colors",
              v === speed
                ? "bg-accent/20 text-accent"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={`${v}× speed`}
            aria-pressed={v === speed}
          >
            {v === 1 ? "1×" : v === 0.5 ? "½×" : `${v}×`}
          </button>
        ))}
      </div>

      {/* Small status chip on the right, visible when anything meaningful is
          happening. Gives pause context when the banner is offscreen. */}
      {(paused || aiThinking) && (
        <>
          <div className="h-4 w-px bg-border/60" />
          <span
            className={cn(
              "px-1.5 text-[10px] uppercase tracking-[0.2em]",
              paused ? "text-accent" : "text-muted-foreground"
            )}
          >
            {paused ? "Paused" : "AI acting"}
          </span>
        </>
      )}
    </div>
  );
}
