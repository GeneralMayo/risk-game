import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/state/gameStore";
import { TERRITORY_MAP } from "@/data/board";
import { maxAttackDice } from "@/lib/GameLogic";
import { SFX } from "@/lib/sound";
import { Swords, Zap, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Minimal "battle plan" modal. Blitz is the primary action; a single-roll is
 * available as an advanced/collapsed option for precise play. Auto-closes on
 * conquer (ConquerDialog takes over) or when attacker falls below 2 armies.
 */
export function AttackDialog({
  from,
  to,
  onClose,
}: {
  from: string;
  to: string;
  onClose: () => void;
}) {
  const board = useGameStore((s) => s.board);
  const phase = useGameStore((s) => s.phase);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const winner = useGameStore((s) => s.winner);
  const performAttack = useGameStore((s) => s.performAttack);
  const pendingConquer = useGameStore((s) => s.pendingConquer);
  const attackerArmies = board.armies[from];
  const defenderArmies = board.armies[to];
  const maxDice = maxAttackDice(attackerArmies);
  const [advanced, setAdvanced] = useState(false);
  const [dice, setDice] = useState(maxDice);

  const conquered = board.owner[to] === "human";
  const attackerDead = board.armies[from] < 2;
  const done =
    (pendingConquer?.from === from && pendingConquer?.to === to) ||
    conquered ||
    attackerDead;

  // Self-close defensively whenever this dialog becomes stale.
  useEffect(() => {
    if (winner) onClose();
    else if (phase !== "attack") onClose();
    else if (currentPlayer !== "human") onClose();
    // If attacker ran out of armies and we aren't pending a conquer resolution,
    // the modal has nothing useful to offer.
    else if (attackerDead && !pendingConquer) onClose();
    // If target was conquered and ConquerDialog will take over, step aside.
    else if (pendingConquer?.from === from && pendingConquer?.to === to) {
      onClose();
    }
  }, [
    winner,
    phase,
    currentPlayer,
    attackerDead,
    pendingConquer,
    from,
    to,
    onClose,
  ]);

  async function blitz() {
    SFX.diceRoll();
    let guard = 0;
    while (guard++ < 40) {
      const s = useGameStore.getState();
      if (
        s.pendingConquer ||
        s.board.owner[to] === "human" ||
        s.board.armies[from] < 2
      )
        break;
      const d = maxAttackDice(s.board.armies[from]);
      s.performAttack(from, to, d);
      await new Promise((r) => setTimeout(r, 110));
    }
    SFX.diceLand();
    if (useGameStore.getState().pendingConquer) SFX.conquer();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm border-wood/60 leather-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Swords className="h-4 w-4" />
            Battle plan
          </DialogTitle>
        </DialogHeader>

        {/* Compact from → to with army counts */}
        <div className="flex items-center justify-between rounded-md border border-border/40 bg-black/20 px-3 py-2 text-sm">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#c23b3b]" />
            <span className="font-semibold">{TERRITORY_MAP[from].name}</span>
            <span className="text-muted-foreground">{attackerArmies}</span>
          </span>
          <span className="text-accent">→</span>
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">{defenderArmies}</span>
            <span className="font-semibold">{TERRITORY_MAP[to].name}</span>
            <span className="h-2 w-2 rounded-full bg-[#3b7dc2]" />
          </span>
        </div>

        {/* Primary action */}
        <div className="flex gap-2">
          <Button
            variant="destructive"
            className="flex-1"
            disabled={done}
            onClick={blitz}
            autoFocus
          >
            <Zap className="h-4 w-4" />
            Blitz
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>

        {/* Advanced: single-roll with dice selector */}
        <button
          onClick={() => setAdvanced((a) => !a)}
          className="inline-flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground"
        >
          {advanced ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          Single roll
        </button>
        {advanced && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Dice:</span>
            {Array.from({ length: maxDice }, (_, i) => i + 1).map((n) => (
              <Button
                key={n}
                size="sm"
                variant={dice === n ? "accent" : "outline"}
                onClick={() => setDice(n)}
                className="h-7 w-7 p-0"
              >
                {n}
              </Button>
            ))}
            <Button
              size="sm"
              variant="secondary"
              disabled={done}
              className="ml-auto"
              onClick={() => {
                SFX.diceRoll();
                performAttack(from, to, dice);
                setTimeout(() => SFX.diceLand(), 180);
                setDice((d) =>
                  Math.min(d, maxAttackDice(useGameStore.getState().board.armies[from]))
                );
              }}
            >
              Roll {dice}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
