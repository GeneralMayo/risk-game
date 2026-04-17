import { useGameStore } from "@/state/gameStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  calculateReinforcements,
  findValidCardSet,
} from "@/lib/GameLogic";
import { ArrowRight, Brain, Crown, Swords, Shield } from "lucide-react";

const STEPS: Array<{ id: "reinforce" | "attack" | "fortify"; label: string }> = [
  { id: "reinforce", label: "Reinforce" },
  { id: "attack", label: "Attack" },
  { id: "fortify", label: "Fortify" },
];

/**
 * A single calm status strip above the map. Left side names the current phase,
 * middle shows the 3-step progression as tiny dots, right holds the primary
 * CTA (e.g. "End Attack" or "Place 14") — the only button the player ever
 * needs to advance their turn.
 */
export function PhaseBanner({ onOpenCards }: { onOpenCards: () => void }) {
  const state = useGameStore();
  const {
    phase,
    currentPlayer,
    turnNumber,
    aiThinking,
    winner,
    players,
    pendingConquer,
    board,
    endPhase,
  } = state;

  const inSetup = phase === "setup-claim" || phase === "setup-reinforce";
  const currentStepIdx = STEPS.findIndex((s) => s.id === phase);
  const activeStep = STEPS[currentStepIdx];

  // ---------- primary CTA label / state ----------
  const humanToPlace = players.human.armiesToPlace;
  const canEnd = (() => {
    if (winner) return false;
    if (currentPlayer !== "human") return false;
    if (pendingConquer) return false;
    if (inSetup) return false;
    if (phase === "reinforce" && humanToPlace > 0) return false;
    return true;
  })();

  const hasCardSet =
    currentPlayer === "human" &&
    phase === "reinforce" &&
    findValidCardSet(players.human.cards) !== null;

  let ctaLabel = "End Phase";
  if (winner) ctaLabel = winner === "human" ? "Victory" : "Defeat";
  else if (aiThinking) ctaLabel = "AI is thinking…";
  else if (inSetup && currentPlayer === "human")
    ctaLabel = `Place ${humanToPlace}`;
  else if (inSetup) ctaLabel = "AI placing…";
  else if (currentPlayer !== "human") ctaLabel = "AI turn";
  else if (phase === "reinforce") {
    const r = calculateReinforcements(board, "human");
    ctaLabel = humanToPlace > 0 ? `Place ${humanToPlace}` : `End Reinforce`;
    void r;
  } else if (phase === "attack") ctaLabel = "End Attack";
  else if (phase === "fortify") ctaLabel = "End Turn";

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-wood/40 bg-card/60 px-4 py-2 backdrop-blur">
      {/* Left: turn + phase name */}
      <div className="flex items-center gap-3">
        <span
          className="font-display text-sm uppercase tracking-[0.25em] text-muted-foreground"
          style={{ letterSpacing: "0.3em" }}
        >
          {winner
            ? winner === "human"
              ? "Victory"
              : "Defeat"
            : inSetup
              ? "Setup"
              : `Turn ${turnNumber}`}
        </span>
        {!winner && !inSetup && activeStep && (
          <span className="flex items-center gap-1.5 font-display text-base tracking-wider text-accent">
            <PhaseIcon id={activeStep.id} />
            {activeStep.label}
          </span>
        )}
      </div>

      {/* Middle: 3-step dots */}
      {!winner && !inSetup && (
        <div className="hidden items-center gap-1 sm:flex">
          {STEPS.map((s, i) => {
            const isCurrent = i === currentStepIdx;
            const isDone = i < currentStepIdx;
            return (
              <div key={s.id} className="flex items-center gap-1">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full transition-all",
                    isCurrent
                      ? "w-5 bg-accent shadow-[0_0_8px_rgba(250,204,21,0.7)]"
                      : isDone
                        ? "bg-accent/40"
                        : "bg-muted-foreground/30"
                  )}
                />
                {i < STEPS.length - 1 && (
                  <span className="h-px w-2 bg-muted-foreground/20" />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Right: primary CTA + subtle card hint */}
      <div className="flex items-center gap-2">
        {hasCardSet && (
          <button
            onClick={onOpenCards}
            className="hidden items-center gap-1 rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-xs text-accent animate-pulse hover:bg-accent/20 md:inline-flex"
            title="You have a card set ready to trade"
          >
            +bonus
          </button>
        )}
        {aiThinking ? (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-card px-3 py-1.5 text-xs text-accent">
            <Brain className="h-3.5 w-3.5 animate-pulse" />
            <span>AI thinking…</span>
          </span>
        ) : (
          <Button
            variant={canEnd ? "accent" : "secondary"}
            size="sm"
            disabled={!canEnd}
            onClick={endPhase}
            title={disabledReason(
              canEnd,
              phase,
              humanToPlace,
              pendingConquer !== null
            )}
            className="min-w-[140px]"
          >
            {ctaLabel}
            {canEnd && <ArrowRight className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

function PhaseIcon({ id }: { id: string }) {
  if (id === "attack") return <Swords className="h-4 w-4" />;
  if (id === "fortify") return <Shield className="h-4 w-4" />;
  return <Crown className="h-4 w-4" />;
}

function disabledReason(
  canEnd: boolean,
  phase: string,
  toPlace: number,
  pending: boolean
): string | undefined {
  if (canEnd) return undefined;
  if (pending) return "Advance your armies first.";
  if (phase === "reinforce" && toPlace > 0)
    return `Place your ${toPlace} remaining armies first.`;
  if (phase === "setup-reinforce" || phase === "setup-claim")
    return "Finish placing starting armies.";
  return undefined;
}
