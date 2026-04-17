/**
 * Developer self-play: runs both sides with AI logic for N games, collecting
 * outcome statistics and asserting the engine never lands in an invalid state
 * (wrong army counts, out-of-range armiesToPlace, adjacency violations, etc.).
 *
 * Enabled via `?dev=true` in the URL.
 */

import { CONTINENTS, TERRITORIES, TERRITORY_MAP } from "@/data/board";
import type { AIConfig, GameState, PlayerId } from "@/data/types";
import { runAISetupPlacement, runAITurn } from "./AI";
import { useGameStore } from "@/state/gameStore";
import { territoriesOwnedBy } from "@/lib/GameLogic";

export interface GameReport {
  index: number;
  turns: number;
  winner: PlayerId | "draw";
  humanFinalTerritories: number;
  aiFinalTerritories: number;
  totalBattles: number;
  assertionFailures: string[];
  durationMs: number;
}

/** Runs a single self-play game until a winner or turn cap is reached. */
export async function runSelfPlayGame(
  index: number,
  opts: {
    humanConfig?: AIConfig;
    aiConfig?: AIConfig;
    turnCap?: number;
    onProgress?: (msg: string) => void;
    speed?: number;
  } = {}
): Promise<GameReport> {
  const { humanConfig, aiConfig, turnCap = 60, onProgress, speed = 0.05 } = opts;
  const start = performance.now();
  const report: GameReport = {
    index,
    turns: 0,
    winner: "draw",
    humanFinalTerritories: 0,
    aiFinalTerritories: 0,
    totalBattles: 0,
    assertionFailures: [],
    durationMs: 0,
  };

  const store = useGameStore.getState();
  store.newGame();

  // === Setup phase (auto-played by both) ===
  let setupGuard = 0;
  while (useGameStore.getState().phase === "setup-reinforce") {
    if (setupGuard++ > 500) break;
    const who = useGameStore.getState().currentPlayer;
    await runAISetupPlacement(who);
  }

  // === Main game loop ===
  const battleCountStart = countBattlesInLog();
  while (true) {
    const s = useGameStore.getState();
    if (s.winner) break;
    if (s.turnNumber > turnCap) {
      report.assertionFailures.push(`Turn cap hit at ${turnCap}.`);
      break;
    }
    const who = s.currentPlayer;
    onProgress?.(`Game ${index} · turn ${s.turnNumber} · ${s.players[who].name}`);
    await runAITurn(who);
    void speed;
    void humanConfig;
    void aiConfig;

    // Integrity checks after each turn
    const check = validateInvariants(useGameStore.getState());
    if (check.length) {
      report.assertionFailures.push(...check.map((e) => `T${s.turnNumber}: ${e}`));
    }
  }

  const final = useGameStore.getState();
  report.turns = final.turnNumber;
  report.winner = final.winner ?? "draw";
  report.humanFinalTerritories = territoriesOwnedBy(final.board, "human").length;
  report.aiFinalTerritories = territoriesOwnedBy(final.board, "ai").length;
  report.totalBattles = countBattlesInLog() - battleCountStart;
  report.durationMs = performance.now() - start;
  return report;
}

function countBattlesInLog() {
  return useGameStore.getState().log.filter((e) => e.type === "battle").length;
}

/**
 * Runtime invariants that must hold between turns. Each returns an error
 * string — empty array means all good.
 */
function validateInvariants(s: GameState): string[] {
  const errs: string[] = [];

  // 1. Every territory has a (non-null) owner and at least 1 army.
  for (const t of TERRITORIES) {
    const owner = s.board.owner[t.id];
    const armies = s.board.armies[t.id];
    if (!owner) errs.push(`Territory ${t.id} has no owner`);
    if (armies < 1 && s.phase !== "setup-reinforce")
      errs.push(`${t.id} has ${armies} armies (expected ≥ 1)`);
  }

  // 2. armiesToPlace should never go negative.
  for (const p of Object.values(s.players)) {
    if (p.armiesToPlace < 0)
      errs.push(`${p.name} has ${p.armiesToPlace} armies to place`);
    if (p.cards.length > 20)
      errs.push(`${p.name} has absurd card count ${p.cards.length}`);
  }

  // 3. If currentPlayer has been eliminated, game should be over.
  const current = s.currentPlayer;
  const owned = territoriesOwnedBy(s.board, current).length;
  if (owned === 0 && !s.winner)
    errs.push(`Current player ${current} owns 0 territories but no winner set`);

  // 4. Continent ownership sanity: the bonus can't be negative.
  for (const c of Object.values(CONTINENTS)) {
    if (c.bonus < 0) errs.push(`Negative bonus on continent ${c.id}`);
  }

  // 5. Adjacency symmetry (just sample-check a few to catch data drift).
  const sample = TERRITORIES.slice(0, 5);
  for (const t of sample) {
    for (const n of t.neighbors) {
      if (!TERRITORY_MAP[n].neighbors.includes(t.id))
        errs.push(`Adjacency asymmetry ${t.id} <-> ${n}`);
    }
  }

  return errs;
}

export async function runSelfPlayBatch(
  n: number,
  onProgress?: (msg: string) => void,
  overrides: { humanConfig?: AIConfig; aiConfig?: AIConfig } = {}
): Promise<{ reports: GameReport[]; summary: string }> {
  const reports: GameReport[] = [];
  for (let i = 0; i < n; i++) {
    onProgress?.(`Starting game ${i + 1}/${n}…`);
    const r = await runSelfPlayGame(i + 1, {
      onProgress,
      ...overrides,
    });
    reports.push(r);
  }
  const wins = { human: 0, ai: 0, draw: 0 } as Record<string, number>;
  let totalFailures = 0;
  for (const r of reports) {
    wins[r.winner] = (wins[r.winner] ?? 0) + 1;
    totalFailures += r.assertionFailures.length;
  }
  const avgTurns = Math.round(
    reports.reduce((s, r) => s + r.turns, 0) / reports.length
  );
  const summary =
    `${n} games · red ${wins.human} / blue ${wins.ai} / draw ${wins.draw} · ` +
    `avg ${avgTurns} turns · ${totalFailures} integrity issues`;
  onProgress?.(summary);
  return { reports, summary };
}
