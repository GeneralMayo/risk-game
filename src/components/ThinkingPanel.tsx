import { useGameStore } from "@/state/gameStore";
import type { PlayerId } from "@/data/types";
import { cn } from "@/lib/utils";
import { ChevronDown, Quote } from "lucide-react";

/**
 * AI player's turn plan + current action.
 *
 * Since the AI refactor to plan-then-execute:
 *   - `plan` holds the 1-2 sentence headline the player sees for the whole turn
 *   - `actionLabel` holds a transient "what's happening right now" label that
 *     updates as each placement / attack / fortify executes
 *
 * `thinking` is kept for back-compat but is empty during normal play.
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
  const plan = player.ai.plan ?? "";
  const actionLabel = player.ai.actionLabel ?? "";
  const thinking = player.ai.thinking ?? "";
  const headline = plan || thinking;

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
            {isActive ? (actionLabel ? "acting" : "planning") : "idle"}
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
            {headline ? (
              <>
                {headline}
                {isActive && !actionLabel && (
                  <span className="caret ml-0.5">▍</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground/70">
                {isActive ? "…" : "Awaiting their turn."}
              </span>
            )}
          </p>
          {actionLabel && (
            <p className="mt-1.5 pl-3 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="tabular-nums" style={{ color: accent }}>
                ▸{" "}
              </span>
              {actionLabel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
