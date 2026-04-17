import { CONTINENTS, TERRITORIES, TERRITORY_MAP } from "@/data/board";
import type {
  BoardState,
  CardType,
  GameState,
  PlayerId,
  RiskCard,
  TerritoryId,
} from "@/data/types";

// ============================================================================
// Dice & battles
// ============================================================================

export function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

export function rollDice(n: number): number[] {
  return Array.from({ length: n }, () => rollDie()).sort((a, b) => b - a);
}

export interface BattleResult {
  attackerDice: number[];
  defenderDice: number[];
  attackerLost: number;
  defenderLost: number;
}

/**
 * Classic RISK dice resolution: highest-vs-highest, second-highest-vs-second-highest.
 * Ties go to the defender.
 */
export function resolveBattle(numAttackDice: number, numDefenseDice: number): BattleResult {
  const attackerDice = rollDice(numAttackDice);
  const defenderDice = rollDice(numDefenseDice);
  let attackerLost = 0;
  let defenderLost = 0;
  const comparisons = Math.min(numAttackDice, numDefenseDice);
  for (let i = 0; i < comparisons; i++) {
    if (attackerDice[i] > defenderDice[i]) defenderLost++;
    else attackerLost++;
  }
  return { attackerDice, defenderDice, attackerLost, defenderLost };
}

// ============================================================================
// Reinforcement calculations
// ============================================================================

export function territoriesOwnedBy(board: BoardState, player: PlayerId): TerritoryId[] {
  return Object.keys(board.owner).filter((t) => board.owner[t] === player);
}

export function continentsControlledBy(board: BoardState, player: PlayerId): string[] {
  const controlled: string[] = [];
  for (const c of Object.values(CONTINENTS)) {
    const ts = TERRITORIES.filter((t) => t.continent === c.id);
    if (ts.every((t) => board.owner[t.id] === player)) controlled.push(c.id);
  }
  return controlled;
}

export function calculateReinforcements(board: BoardState, player: PlayerId): {
  total: number;
  fromTerritories: number;
  fromContinents: number;
  continents: string[];
} {
  const owned = territoriesOwnedBy(board, player);
  const fromTerritories = Math.max(3, Math.floor(owned.length / 3));
  const continents = continentsControlledBy(board, player);
  const fromContinents = continents.reduce((sum, cid) => sum + CONTINENTS[cid].bonus, 0);
  return {
    total: fromTerritories + fromContinents,
    fromTerritories,
    fromContinents,
    continents,
  };
}

// Classic escalating set trade bonuses: 4, 6, 8, 10, 12, 15, 20, 25, 30, ...
export function cardSetBonus(tradeIndex: number): number {
  const sequence = [4, 6, 8, 10, 12, 15];
  if (tradeIndex < sequence.length) return sequence[tradeIndex];
  return 15 + (tradeIndex - 5) * 5;
}

// ============================================================================
// Cards
// ============================================================================

const CARD_TYPES: CardType[] = ["Infantry", "Cavalry", "Artillery"];

export function buildCardDeck(): RiskCard[] {
  const deck: RiskCard[] = TERRITORIES.map((t, i) => ({
    id: `c-${t.id}`,
    territory: t.id,
    type: CARD_TYPES[i % 3],
  }));
  deck.push({ id: "wild-1", territory: null, type: "Wild" });
  deck.push({ id: "wild-2", territory: null, type: "Wild" });
  // shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Find a valid trade-in set of 3 cards from a hand, if one exists.
 * Valid sets: three of a kind, one of each (I+C+A), or any combo including wild(s).
 * Returns the indices of the 3 cards to trade, or null.
 */
export function findValidCardSet(cards: RiskCard[]): number[] | null {
  const n = cards.length;
  if (n < 3) return null;
  for (let i = 0; i < n - 2; i++) {
    for (let j = i + 1; j < n - 1; j++) {
      for (let k = j + 1; k < n; k++) {
        if (isValidSet([cards[i], cards[j], cards[k]])) return [i, j, k];
      }
    }
  }
  return null;
}

export function isValidSet(three: RiskCard[]): boolean {
  if (three.length !== 3) return false;
  const wilds = three.filter((c) => c.type === "Wild").length;
  const nonWild = three.filter((c) => c.type !== "Wild").map((c) => c.type);
  if (wilds >= 1) return true; // any combo with a wild is valid
  const allSame = nonWild.every((t) => t === nonWild[0]);
  const allDiff =
    nonWild.includes("Infantry") &&
    nonWild.includes("Cavalry") &&
    nonWild.includes("Artillery");
  return allSame || allDiff;
}

// ============================================================================
// Move validation
// ============================================================================

export function canAttack(state: GameState, from: TerritoryId, to: TerritoryId): boolean {
  const { board, currentPlayer } = state;
  if (board.owner[from] !== currentPlayer) return false;
  if (board.owner[to] === currentPlayer) return false;
  if (!TERRITORY_MAP[from].neighbors.includes(to)) return false;
  if (board.armies[from] < 2) return false;
  return true;
}

export function canFortify(state: GameState, from: TerritoryId, to: TerritoryId): boolean {
  const { board, currentPlayer } = state;
  if (from === to) return false;
  if (board.owner[from] !== currentPlayer) return false;
  if (board.owner[to] !== currentPlayer) return false;
  if (board.armies[from] < 2) return false;
  // Classic: fortify only between directly adjacent territories (single move).
  if (!TERRITORY_MAP[from].neighbors.includes(to)) return false;
  return true;
}

export function maxAttackDice(armiesOnAttacker: number): number {
  return Math.min(3, Math.max(1, armiesOnAttacker - 1));
}

export function maxDefenseDice(armiesOnDefender: number): number {
  return Math.min(2, Math.max(1, armiesOnDefender));
}

// ============================================================================
// Setup helpers
// ============================================================================

export const STARTING_ARMIES_PER_PLAYER = 40; // Classic 2-player rule

/**
 * In the 2-player variant, the third "neutral" army isn't used because we only
 * have Human vs AI. We keep it simple: each player gets 40 armies, placed one
 * per turn after all territories are claimed. Territories are auto-assigned
 * randomly at game start for speed, but the player still places armies one at a
 * time during the setup-reinforce phase.
 *
 * (The rules spec allows both "pick territories" and "random deal" — we use
 * random deal so setup is fast and the LLM/heuristic AI doesn't slow things down.)
 */
export function createInitialBoard(): BoardState {
  return {
    owner: Object.fromEntries(TERRITORIES.map((t) => [t.id, null])),
    armies: Object.fromEntries(TERRITORIES.map((t) => [t.id, 0])),
  };
}

export function randomAssignTerritories(): BoardState {
  const shuffled = [...TERRITORIES].sort(() => Math.random() - 0.5);
  const board: BoardState = createInitialBoard();
  shuffled.forEach((t, i) => {
    board.owner[t.id] = i % 2 === 0 ? "human" : "ai";
    board.armies[t.id] = 1;
  });
  return board;
}
