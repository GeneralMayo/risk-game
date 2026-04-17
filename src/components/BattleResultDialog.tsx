import { useEffect, useState } from "react";
import { useGameStore } from "@/state/gameStore";
import { TERRITORY_MAP } from "@/data/board";
import { cn } from "@/lib/utils";

/**
 * Non-blocking floating toast that shows the result of the last battle.
 * Appears pinned to the top of the map, auto-dismisses after ~1.6s (or
 * longer on a conquest). Does NOT obscure the rest of the board.
 */
export function BattleResultDialog() {
  const lastBattle = useGameStore((s) => s.lastBattle);
  const pendingConquer = useGameStore((s) => s.pendingConquer);
  const [visibleTs, setVisibleTs] = useState<number | null>(null);

  useEffect(() => {
    if (!lastBattle) return;
    setVisibleTs(lastBattle.timestamp);
    const holdMs = lastBattle.conquered ? 2200 : 1500;
    const t = setTimeout(() => {
      setVisibleTs((cur) => (cur === lastBattle.timestamp ? null : cur));
    }, holdMs);
    return () => clearTimeout(t);
  }, [lastBattle]);

  // Let the ConquerDialog take focus when it's the player's choice to advance
  useEffect(() => {
    if (pendingConquer) setVisibleTs(null);
  }, [pendingConquer]);

  if (!lastBattle || visibleTs !== lastBattle.timestamp) return null;

  const fromName = TERRITORY_MAP[lastBattle.from]?.name ?? lastBattle.from;
  const toName = TERRITORY_MAP[lastBattle.to]?.name ?? lastBattle.to;

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 animate-dramatic-pop">
      <div className="flex items-center gap-3 rounded-full border border-wood/60 bg-[#140a04]/95 px-4 py-1.5 shadow-xl backdrop-blur-sm">
        <DiceRow
          values={lastBattle.attackerDice}
          color="attacker"
          loss={lastBattle.attackerLost}
        />
        <span
          className="font-display text-xs tracking-[0.2em] text-muted-foreground"
          style={{ minWidth: 120, textAlign: "center" }}
        >
          {fromName} → {toName}
        </span>
        <DiceRow
          values={lastBattle.defenderDice}
          color="defender"
          loss={lastBattle.defenderLost}
        />
        {lastBattle.conquered && (
          <span
            className={cn(
              "ml-1 rounded bg-accent px-2 py-0.5 font-display text-[10px] tracking-[0.2em] text-accent-foreground"
            )}
          >
            CONQUERED
          </span>
        )}
      </div>
    </div>
  );
}

function DiceRow({
  values,
  color,
  loss,
}: {
  values: number[];
  color: "attacker" | "defender";
  loss: number;
}) {
  return (
    <div className="flex items-center gap-1">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn("die-mini", color)}
          style={{ animationDelay: `${i * 40}ms` }}
        >
          {v}
        </span>
      ))}
      {loss > 0 && (
        <span className="text-[10px] font-bold text-red-400">−{loss}</span>
      )}
    </div>
  );
}
