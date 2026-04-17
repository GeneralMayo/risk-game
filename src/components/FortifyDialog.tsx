import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/state/gameStore";
import { TERRITORY_MAP } from "@/data/board";

export function FortifyDialog({
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
  const performFortify = useGameStore((s) => s.performFortify);
  const max = Math.max(0, board.armies[from] - 1);
  const [count, setCount] = useState(max);

  // Self-close if this move becomes invalid (phase change, turn change, win,
  // or the source/target have been disturbed).
  useEffect(() => {
    const invalid =
      winner ||
      phase !== "fortify" ||
      currentPlayer !== "human" ||
      board.owner[from] !== "human" ||
      board.owner[to] !== "human" ||
      max <= 0;
    if (invalid) onClose();
  }, [winner, phase, currentPlayer, board, from, to, max, onClose]);

  if (max <= 0) return null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move to {TERRITORY_MAP[to].name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-center font-display text-5xl text-accent tabular-nums">
            {Math.min(count, max)}
          </div>
          <input
            type="range"
            min={1}
            max={max}
            value={Math.min(count, max)}
            onChange={(e) => setCount(parseInt(e.target.value))}
            className="w-full"
            autoFocus
          />
          <div className="text-center text-[11px] text-muted-foreground">
            from {TERRITORY_MAP[from].name} ·{" "}
            {board.armies[from] - Math.min(count, max)} stays behind
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => {
              performFortify(from, to, Math.min(count, max));
              onClose();
            }}
          >
            Move & end turn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
