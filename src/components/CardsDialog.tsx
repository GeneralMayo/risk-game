import { useState } from "react";
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
import { cardSetBonus, isValidSet } from "@/lib/GameLogic";
import { cn } from "@/lib/utils";

const CARD_ICON: Record<string, string> = {
  Infantry: "I",
  Cavalry: "C",
  Artillery: "A",
  Wild: "★",
};

export function CardsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const cards = useGameStore((s) => s.players.human.cards);
  const phase = useGameStore((s) => s.phase);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const cardTradeCount = useGameStore((s) => s.cardTradeCount);
  const tradeCards = useGameStore((s) => s.tradeCards);
  const [selected, setSelected] = useState<number[]>([]);

  const canTradeNow = currentPlayer === "human" && phase === "reinforce";
  const selectedCards = selected.map((i) => cards[i]).filter(Boolean);
  const validSelection =
    selectedCards.length === 3 && isValidSet(selectedCards);

  function toggle(i: number) {
    setSelected((s) =>
      s.includes(i) ? s.filter((x) => x !== i) : s.length >= 3 ? s : [...s, i]
    );
  }

  function doTrade() {
    if (!validSelection) return;
    tradeCards(selected);
    setSelected([]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cards</DialogTitle>
        </DialogHeader>

        {cards.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No cards yet. Conquer a territory to draw one.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {cards.map((c, i) => {
                const isSel = selected.includes(i);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggle(i)}
                    className={cn(
                      "group relative overflow-hidden rounded-md border bg-secondary/30 p-2 text-left text-xs transition-all",
                      isSel
                        ? "border-accent shadow-[0_0_0_2px_rgba(250,204,21,0.35)]"
                        : "border-border/60 hover:border-accent/60"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-6 w-6 items-center justify-center rounded bg-accent/25 font-bold text-accent">
                        {CARD_ICON[c.type] ?? "?"}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {c.type}
                      </span>
                    </div>
                    <div className="mt-2 truncate font-semibold">
                      {c.territory ? TERRITORY_MAP[c.territory].name : "Wild"}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              Next set bonus:{" "}
              <b className="text-accent">+{cardSetBonus(cardTradeCount)}</b>{" "}
              armies.
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="accent"
            disabled={!canTradeNow || !validSelection}
            onClick={doTrade}
          >
            Trade +{cardSetBonus(cardTradeCount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
