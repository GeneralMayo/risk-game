export type PlayerId = "human" | "ai";

/** Top-level game lifecycle, independent of the inner turn phase. */
export type Lifecycle =
  | "menu"
  | "initializing"
  | "in-progress"
  | "paused"
  | "ending"
  | "game-over";

export type GameMode = "human-vs-ai" | "ai-vs-ai";

export type Controller = "human" | "ai";

export type ProviderId = "openai" | "anthropic" | "ollama" | "heuristic";

export interface PlayerAIConfig {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  personaId: string;
  personaName: string;
  /** Full system prompt (persona + doctrine). */
  systemPrompt: string;
  temperature: number;
  /** In-flight or recent reasoning narration. */
  thinking: string;
  /** User can hide the thinking panel for this player. */
  thinkingVisible: boolean;
}

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
}

export interface ProviderStatus {
  usage: number; // successful calls this game
  cooldownUntil: number; // epoch ms when next call is allowed
  lastRateLimit: number | null; // ms of the last rate-limit wait, for UI
}

export interface ProviderStatusMap {
  openai: ProviderStatus;
  anthropic: ProviderStatus;
  ollama: ProviderStatus;
}

export interface PacingConfig {
  /** Minimum wall-clock duration per AI action (ms). */
  minActionMs: number;
  /** Delay between consecutive AI actions within one turn (ms). */
  betweenActionsMs: number;
}

export type ContinentId =
  | "NA"
  | "SA"
  | "EU"
  | "AF"
  | "AS"
  | "AU";

export type TerritoryId = string;

export type CardType = "Infantry" | "Cavalry" | "Artillery" | "Wild";

export interface RiskCard {
  id: string;
  territory: TerritoryId | null; // null for Wild
  type: CardType;
}

export interface Territory {
  id: TerritoryId;
  name: string;
  continent: ContinentId;
  neighbors: TerritoryId[];
  x: number; // coordinate on board (0-1000 viewBox width)
  y: number; // coordinate on board (0-600 viewBox height)
}

export interface Continent {
  id: ContinentId;
  name: string;
  bonus: number;
  color: string;
}

export interface Player {
  id: PlayerId;
  name: string;
  color: string;
  armiesToPlace: number;
  cards: RiskCard[];
  eliminated: boolean;
  conqueredThisTurn: boolean;
  /** Who controls this player (a human at the keyboard, or the AI loop). */
  controller: Controller;
  /** Only present when controller === "ai". */
  ai: PlayerAIConfig | null;
}

export type Phase =
  | "setup-claim" // alternate claiming empty territories
  | "setup-reinforce" // alternate placing remaining starting armies
  | "reinforce" // main phase: place reinforcements
  | "attack"
  | "fortify"
  | "game-over";

export interface BoardState {
  owner: Record<TerritoryId, PlayerId | null>;
  armies: Record<TerritoryId, number>;
}

export interface LastBattle {
  from: TerritoryId;
  to: TerritoryId;
  attackerDice: number[];
  defenderDice: number[];
  attackerLost: number;
  defenderLost: number;
  conquered: boolean;
  timestamp: number;
}

export interface LogEntry {
  id: number;
  type: "info" | "battle" | "ai" | "phase" | "system" | "victory";
  message: string;
  player?: PlayerId;
  timestamp: number;
}

/**
 * Legacy global AI config (kept for compatibility with single-player v1 and
 * the existing AI Strategy dialog). For AI-vs-AI, the per-player `PlayerAIConfig`
 * is authoritative.
 */
export interface AIConfig {
  useLLM: boolean;
  baseUrl: string; // e.g. http://localhost:11434
  model: string; // e.g. llama3.1:8b
  systemPrompt: string;
  temperature: number;
}

/** Tiny ephemeral UI message shown above the map (invalid click, etc.). */
export interface Hint {
  id: number;
  message: string;
  tone?: "info" | "warn";
  timestamp: number;
}

export interface GameState {
  lifecycle: Lifecycle;
  mode: GameMode;
  phase: Phase;
  currentPlayer: PlayerId;
  turnNumber: number;
  players: Record<PlayerId, Player>;
  board: BoardState;
  selectedTerritory: TerritoryId | null;
  lastBattle: LastBattle | null;
  log: LogEntry[];
  cardTradeCount: number;
  aiConfig: AIConfig;
  aiThinking: boolean;
  aiThinkingSince: number | null;
  winner: PlayerId | null;
  pendingFortify: {
    from: TerritoryId;
    to: TerritoryId;
  } | null;
  hasConqueredThisTurn: boolean;
  hint: Hint | null;
  apiKeys: ApiKeys;
  /** When true, keys persist to localStorage after this session. */
  persistApiKeys: boolean;
  providerStatus: ProviderStatusMap;
  pacing: PacingConfig;
  /** Transient UI flag: "AI is waiting on rate limit" for which provider. */
  rateLimitWait: {
    providerId: ProviderId;
    resumesAt: number;
  } | null;
}
