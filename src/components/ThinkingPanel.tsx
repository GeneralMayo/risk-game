import { useGameStore } from "@/state/gameStore";
import type { PlayerId } from "@/data/types";
import { cn } from "@/lib/utils";
import { ChevronDown, Quote } from "lucide-react";

/**
 * AI player's inner monologue. Styled with a subtle left-border accent in the
 * player's colour, italic serif voice, and a quiet card background — meant to
 * feel contained, not splashy.
 */
export function ThinkingPanel({ playerId }: { playerId: PlayerId }) {
  const player = useGameStore((s) => s.players[playerId]);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const aiThinking = useGameStore((s) => s.aiThinking);
  const toggle = useGameStore((s) => s.togglePlayerThinkingVisible);

  if (!player.ai) return null;
  const accent = playerId === "human" ? "#c23b3b" : "#3b7dc2";
  const isActive = currentPlayer === playerId && aiThinking;
  const visible = player.ai.thinkingVisible;
  const text = player.ai.thinking;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md transition-all duration-200",
        isActive ? "opacity-100" : "opacity-75"
      )}
      style={{
        background:
          "linear-gradient(180deg, rgba(26,19,15,0.85) 0%, rgba(14,9,7,0.85) 100%)",
        borderLeft: `2px solid ${accent}`,
        boxShadow: isActive
          ? `inset 0 0 0 1px ${accent}33, 0 2px 10px rgba(0,0,0,0.35)`
          : `inset 0 0 0 1px ${accent}18`,
      }}
    >
      <button
        onClick={() => toggle(playerId)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <span className="font-medium" style={{ color: accent }}>
            {player.name}
          </span>
          <span className="text-muted-foreground/70">
            {isActive ? "thinking" : "idle"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            !visible && "-rotate-90"
          )}
        />
      </button>

      {visible && (
        <div className="relative px-3 pb-2.5 pt-0.5">
          <Quote
            className="absolute left-2 top-1 h-3 w-3 opacity-20"
            style={{ color: accent }}
          />
          <p
            className="pl-3 text-[12px] italic leading-relaxed text-foreground/85"
            style={{ fontFamily: "Cinzel, Georgia, serif", fontWeight: 400 }}
          >
            {text ? (
              <>
                {text}
                {isActive && <span className="caret ml-0.5">▍</span>}
              </>
            ) : (
              <span className="text-muted-foreground/70">
                {isActive ? "…" : "Awaiting their turn."}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
