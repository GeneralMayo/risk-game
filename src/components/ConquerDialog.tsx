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

export function ConquerDialog() {
  const pendingConquer = useGameStore((s) => s.pendingConquer);
  const moveAfterConquer = useGameStore((s) => s.moveAfterConquer);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const winner = useGameStore((s) => s.winner);
  const [count, setCount] = useState(0);
  const open = !!pendingConquer && currentPlayer === "human" && !winner;

  useEffect(() => {
    if (pendingConquer) setCount(pendingConquer.maxMove);
  }, [pendingConquer]);

  // Safety valve — if the dialog somehow gets stuck (e.g. navigation), a
  // 12-second idle timer auto-commits the max-move so the game never freezes.
  useEffect(() => {
    if (!pendingConquer || !open) return;
    const t = setTimeout(() => {
      const s = useGameStore.getState();
      if (
        s.pendingConquer &&
        s.pendingConquer.from === pendingConquer.from &&
        s.pendingConquer.to === pendingConquer.to
      ) {
        moveAfterConquer(
          pendingConquer.from,
          pendingConquer.to,
          pendingConquer.maxMove
        );
      }
    }, 12_000);
    return () => clearTimeout(t);
  }, [pendingConquer, open, moveAfterConquer]);

  if (!pendingConquer || !open) return null;
  const { from, to, minMove, maxMove } = pendingConquer;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) moveAfterConquer(from, to, count);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Advance into {TERRITORY_MAP[to].name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-center font-display text-5xl text-accent tabular-nums">
            {count}
          </div>
          <input
            type="range"
            min={minMove}
            max={maxMove}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value))}
            className="w-full"
            autoFocus
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Leaves {maxMove + 1 - count} behind</span>
            <span>
              min {minMove} · max {maxMove}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="accent"
            onClick={() => moveAfterConquer(from, to, count)}
          >
            Advance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
