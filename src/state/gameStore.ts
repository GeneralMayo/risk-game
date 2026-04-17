import { create } from "zustand";
import { TERRITORIES, TERRITORY_MAP, validateBoard } from "@/data/board";
import type {
  AIConfig,
  ApiKeys,
  GameMode,
  GameState,
  Lifecycle,
  LogEntry,
  PacingConfig,
  Player,
  PlayerAIConfig,
  PlayerId,
  ProviderId,
  ProviderStatusMap,
  RiskCard,
  TerritoryId,
} from "@/data/types";
import { DEFAULT_PERSONA_ID, getPersona } from "@/ai/personas";
import { resetAllLimiters } from "@/ai/providers/rateLimiter";
import { clearProviderCache } from "@/ai/providers/registry";
import {
  STARTING_ARMIES_PER_PLAYER,
  buildCardDeck,
  calculateReinforcements,
  canAttack,
  canFortify,
  cardSetBonus,
  findValidCardSet,
  isValidSet,
  maxAttackDice,
  maxDefenseDice,
  randomAssignTerritories,
  resolveBattle,
  territoriesOwnedBy,
} from "@/lib/GameLogic";

const DEFAULT_AI_SYSTEM_PROMPT = `You are a calculating general commanding the BLUE armies in the classic board game RISK.
Your goals, in priority order:
1. Never lose a continent bonus you already own.
2. Capture and hold Australia or South America early for an easy, defensible bonus.
3. Concentrate forces on a single front — do not spread thin.
4. Attack only when you have a clear numerical advantage (attacker armies ≥ defender armies + 2) unless you can finish a continent.
5. Trade in card sets as soon as you legally have one.
6. Eliminate the opponent when possible (wiping them takes all their cards).

Respond ONLY with the JSON format requested. Be concise.`;

const LOCAL_STORAGE_KEY = "risk-game-save-v1";
const AI_CONFIG_KEY = "risk-game-ai-config-v1";

function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(AI_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AIConfig;
      return {
        useLLM: parsed.useLLM ?? true,
        baseUrl: parsed.baseUrl ?? "http://localhost:11434",
        model: parsed.model ?? "llama3.1:8b",
        systemPrompt: parsed.systemPrompt ?? DEFAULT_AI_SYSTEM_PROMPT,
        temperature: parsed.temperature ?? 0.4,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    useLLM: true,
    baseUrl: "http://localhost:11434",
    model: "llama3.1:8b",
    systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
    temperature: 0.4,
  };
}

function saveAIConfig(cfg: AIConfig) {
  try {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

// ============================================================================
// Defaults for the new lifecycle / provider / pacing state
// ============================================================================

const DEFAULT_PACING: PacingConfig = {
  minActionMs: 1400,
  betweenActionsMs: 650,
};

const BLANK_PROVIDER_STATUS: ProviderStatusMap = {
  openai: { usage: 0, cooldownUntil: 0, lastRateLimit: null },
  anthropic: { usage: 0, cooldownUntil: 0, lastRateLimit: null },
  ollama: { usage: 0, cooldownUntil: 0, lastRateLimit: null },
};

const PERSISTED_KEYS_KEY = "risk-api-keys-v1";
function loadPersistedKeys(): ApiKeys | null {
  try {
    const raw = localStorage.getItem(PERSISTED_KEYS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ApiKeys;
  } catch {
    return null;
  }
}
function persistKeys(keys: ApiKeys) {
  try {
    localStorage.setItem(PERSISTED_KEYS_KEY, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}
function clearPersistedKeys() {
  try {
    localStorage.removeItem(PERSISTED_KEYS_KEY);
  } catch {
    /* ignore */
  }
}

/** Build a per-player AI config from a persona id + provider spec. */
export function makePlayerAIConfig(opts: {
  personaId: string;
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  temperature?: number;
}): PlayerAIConfig {
  const persona = getPersona(opts.personaId);
  return {
    provider: opts.provider,
    model: opts.model,
    baseUrl: opts.baseUrl,
    personaId: persona.id,
    personaName: persona.name,
    systemPrompt: persona.prompt,
    temperature: opts.temperature ?? 0.55,
    thinking: "",
    thinkingVisible: true,
  };
}

let logIdCounter = 1;
function makeLog(
  type: LogEntry["type"],
  message: string,
  player?: PlayerId
): LogEntry {
  return { id: logIdCounter++, type, message, player, timestamp: Date.now() };
}

// ============================================================================
// In-flight-request registry (abort on quit / new game)
// ============================================================================

const inFlight = new Set<AbortController>();

/**
 * Create a tracked AbortController. Call `release()` when the request finishes
 * normally. `abortAllInFlight()` cancels everything — used by the lifecycle
 * actions below.
 */
export function registerAbort(): {
  controller: AbortController;
  release: () => void;
} {
  const c = new AbortController();
  inFlight.add(c);
  return {
    controller: c,
    release: () => {
      inFlight.delete(c);
    },
  };
}

export function abortAllInFlight() {
  for (const c of inFlight) {
    try {
      c.abort();
    } catch {
      /* ignore */
    }
  }
  inFlight.clear();
}

// Card deck lives outside the React store (non-serializable-heavy, and we
// reconstruct on new game / load). It is the pool from which players draw.
let cardDeck: RiskCard[] = buildCardDeck();
let cardDiscard: RiskCard[] = [];

function drawCard(): RiskCard | null {
  if (cardDeck.length === 0) {
    if (cardDiscard.length === 0) return null;
    cardDeck = cardDiscard.sort(() => Math.random() - 0.5);
    cardDiscard = [];
  }
  return cardDeck.pop() ?? null;
}

export interface NewGameOptions {
  mode: GameMode;
  /** Per-player AI setups (only used for ai-controlled players). */
  humanAI?: PlayerAIConfig | null;
  aiAI?: PlayerAIConfig | null;
}

function freshInitialState(opts?: NewGameOptions): GameState {
  const errs = validateBoard();
  if (errs.length) console.warn("[Board] validation issues:", errs);

  cardDeck = buildCardDeck();
  cardDiscard = [];
  resetAllLimiters();
  clearProviderCache();

  const board = randomAssignTerritories();

  const humanLeft = STARTING_ARMIES_PER_PLAYER - territoriesOwnedBy(board, "human").length;
  const aiLeft = STARTING_ARMIES_PER_PLAYER - territoriesOwnedBy(board, "ai").length;

  const mode: GameMode = opts?.mode ?? "human-vs-ai";
  const isAIvAI = mode === "ai-vs-ai";

  const humanController = isAIvAI ? "ai" : "human";
  const humanAI =
    humanController === "ai"
      ? (opts?.humanAI ??
          makePlayerAIConfig({
            personaId: DEFAULT_PERSONA_ID,
            provider: "heuristic",
            model: "",
          }))
      : null;
  const aiAI =
    opts?.aiAI ??
    makePlayerAIConfig({
      personaId: isAIvAI ? "washington" : DEFAULT_PERSONA_ID,
      provider: "heuristic",
      model: "",
    });

  const humanName = humanController === "ai" ? humanAI!.personaName : "You";
  const aiName = aiAI.personaName;

  return {
    lifecycle: "in-progress",
    mode,
    phase: "setup-reinforce",
    currentPlayer: "human",
    turnNumber: 0,
    players: {
      human: {
        id: "human",
        name: humanName,
        color: "#c23b3b",
        armiesToPlace: humanLeft,
        cards: [],
        eliminated: false,
        conqueredThisTurn: false,
        controller: humanController,
        ai: humanAI,
      },
      ai: {
        id: "ai",
        name: aiName,
        color: "#3b7dc2",
        armiesToPlace: aiLeft,
        cards: [],
        eliminated: false,
        conqueredThisTurn: false,
        controller: "ai",
        ai: aiAI,
      },
    },
    board,
    selectedTerritory: null,
    lastBattle: null,
    log: [
      makeLog("system", "New game started. Each player has 40 armies."),
      makeLog(
        "phase",
        "Setup: place reinforcements on your territories, alternating turns."
      ),
    ],
    cardTradeCount: 0,
    aiConfig: loadAIConfig(),
    aiThinking: false,
    aiThinkingSince: null,
    winner: null,
    pendingFortify: null,
    hasConqueredThisTurn: false,
    hint: null,
    apiKeys: loadPersistedKeys() ?? {},
    persistApiKeys: !!loadPersistedKeys(),
    providerStatus: { ...BLANK_PROVIDER_STATUS },
    pacing: DEFAULT_PACING,
    rateLimitWait: null,
  };
}

/** "Empty" state shown before any game is started (lifecycle=menu). */
function menuInitialState(): GameState {
  const base = freshInitialState();
  return { ...base, lifecycle: "menu" };
}

// ============================================================================
// Store
// ============================================================================

interface GameStoreActions {
  // ---- lifecycle ---------------------------------------------------------
  startNewGame: (opts: NewGameOptions) => void;
  quitToMenu: () => void;
  goToMenu: () => void;

  // ---- api keys / per-player AI config -----------------------------------
  setApiKey: (provider: "openai" | "anthropic", key: string) => void;
  setPersistApiKeys: (persist: boolean) => void;
  setPlayerAI: (id: PlayerId, cfg: PlayerAIConfig) => void;
  setPlayerThinking: (id: PlayerId, thinking: string) => void;
  togglePlayerThinkingVisible: (id: PlayerId) => void;
  bumpProviderUsage: (id: ProviderId) => void;
  reportRateLimit: (id: ProviderId, waitMs: number) => void;
  clearRateLimitWait: () => void;
  setPacing: (p: Partial<PacingConfig>) => void;

  // ---- game actions ------------------------------------------------------
  newGame: () => void;
  saveGame: () => void;
  loadGame: () => boolean;
  selectTerritory: (id: TerritoryId | null) => void;
  placeArmy: (id: TerritoryId, count?: number) => void;
  performAttack: (from: TerritoryId, to: TerritoryId, attackDice?: number) => void;
  moveAfterConquer: (from: TerritoryId, to: TerritoryId, count: number) => void;
  performFortify: (from: TerritoryId, to: TerritoryId, count: number) => void;
  endPhase: () => void;
  tradeCards: (indices: number[]) => void;
  setAIConfig: (cfg: Partial<AIConfig>) => void;
  setAIThinking: (v: boolean) => void;
  addLog: (type: LogEntry["type"], message: string, player?: PlayerId) => void;
  showHint: (message: string, tone?: "info" | "warn") => void;
  clearHint: () => void;
  aiPlaceArmies: (placements: Array<{ territory: TerritoryId; count: number }>) => void;
  pendingConquer: null | { from: TerritoryId; to: TerritoryId; minMove: number; maxMove: number };
  setPendingConquer: (v: GameStoreActions["pendingConquer"]) => void;
}

export type GameStore = GameState & GameStoreActions;

export const useGameStore = create<GameStore>((set, get) => ({
  ...menuInitialState(),
  pendingConquer: null,

  // ----------------------------------------------------------------------
  // Lifecycle transitions
  // ----------------------------------------------------------------------
  startNewGame: (opts) => {
    // INITIALIZING -> IN_PROGRESS. Abort any in-flight calls from the
    // previous game, reset limiters/usage, then enter the fresh game.
    abortAllInFlight();
    const keepKeys = get().apiKeys;
    const keepPersist = get().persistApiKeys;
    const fresh = freshInitialState(opts);
    set({
      ...fresh,
      apiKeys: keepKeys,
      persistApiKeys: keepPersist,
      pendingConquer: null,
      aiThinking: false,
      aiThinkingSince: null,
      hint: null,
      providerStatus: { ...BLANK_PROVIDER_STATUS },
      rateLimitWait: null,
    });
  },
  quitToMenu: () => {
    abortAllInFlight();
    const keepKeys = get().apiKeys;
    const keepPersist = get().persistApiKeys;
    set({
      ...menuInitialState(),
      apiKeys: keepKeys,
      persistApiKeys: keepPersist,
      pendingConquer: null,
      aiThinking: false,
      aiThinkingSince: null,
      hint: null,
    });
  },
  goToMenu: () => set({ lifecycle: "menu" }),

  // ----------------------------------------------------------------------
  // API keys / per-player AI config
  // ----------------------------------------------------------------------
  setApiKey: (provider, key) => {
    const next = { ...get().apiKeys, [provider]: key };
    set({ apiKeys: next });
    if (get().persistApiKeys) persistKeys(next);
  },
  setPersistApiKeys: (persist) => {
    set({ persistApiKeys: persist });
    if (persist) persistKeys(get().apiKeys);
    else clearPersistedKeys();
  },
  setPlayerAI: (id, cfg) =>
    set((s) => ({
      players: {
        ...s.players,
        [id]: { ...s.players[id], ai: cfg, name: cfg.personaName },
      },
    })),
  setPlayerThinking: (id, thinking) =>
    set((s) => {
      const p = s.players[id];
      if (!p.ai) return {};
      return {
        players: {
          ...s.players,
          [id]: { ...p, ai: { ...p.ai, thinking } },
        },
      };
    }),
  togglePlayerThinkingVisible: (id) =>
    set((s) => {
      const p = s.players[id];
      if (!p.ai) return {};
      return {
        players: {
          ...s.players,
          [id]: {
            ...p,
            ai: { ...p.ai, thinkingVisible: !p.ai.thinkingVisible },
          },
        },
      };
    }),
  bumpProviderUsage: (id) => {
    if (id === "heuristic") return;
    set((s) => ({
      providerStatus: {
        ...s.providerStatus,
        [id]: {
          ...s.providerStatus[id],
          usage: s.providerStatus[id].usage + 1,
        },
      },
    }));
  },
  reportRateLimit: (id, waitMs) => {
    if (id === "heuristic") return;
    set((s) => ({
      providerStatus: {
        ...s.providerStatus,
        [id]: {
          ...s.providerStatus[id],
          cooldownUntil: Date.now() + waitMs,
          lastRateLimit: waitMs,
        },
      },
      rateLimitWait: { providerId: id, resumesAt: Date.now() + waitMs },
    }));
  },
  clearRateLimitWait: () => set({ rateLimitWait: null }),
  setPacing: (p) => set((s) => ({ pacing: { ...s.pacing, ...p } })),

  // ----------------------------------------------------------------------
  // Legacy aliases (kept working, just route to the new lifecycle fn)
  // ----------------------------------------------------------------------
  newGame: () => {
    const s = get();
    if (s.lifecycle === "menu") return;
    s.startNewGame({ mode: s.mode });
  },

  saveGame: () => {
    const s = get();
    const snapshot = {
      phase: s.phase,
      currentPlayer: s.currentPlayer,
      turnNumber: s.turnNumber,
      players: s.players,
      board: s.board,
      cardTradeCount: s.cardTradeCount,
      log: s.log.slice(-200),
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
      get().addLog("system", "Game saved to local storage.");
    } catch (e) {
      console.error("save failed", e);
    }
  },

  loadGame: () => {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!raw) return false;
      const snapshot = JSON.parse(raw);
      set({
        ...get(),
        phase: snapshot.phase,
        currentPlayer: snapshot.currentPlayer,
        turnNumber: snapshot.turnNumber,
        players: snapshot.players,
        board: snapshot.board,
        cardTradeCount: snapshot.cardTradeCount,
        log: [
          ...snapshot.log,
          makeLog("system", "Game loaded from local storage."),
        ],
        selectedTerritory: null,
        pendingFortify: null,
        pendingConquer: null,
        winner: null,
        aiThinking: false,
        aiThinkingSince: null,
        hasConqueredThisTurn: false,
        hint: null,
      });
      return true;
    } catch (e) {
      console.error("load failed", e);
      return false;
    }
  },

  selectTerritory: (id) => set({ selectedTerritory: id }),

  addLog: (type, message, player) =>
    set((s) => ({ log: [...s.log, makeLog(type, message, player)] })),

  placeArmy: (territory, count = 1) => {
    const s = get();
    if (s.board.owner[territory] !== s.currentPlayer) return;
    const player = s.players[s.currentPlayer];
    if (player.armiesToPlace <= 0) return;
    const n = Math.min(count, player.armiesToPlace);

    const newBoard = {
      ...s.board,
      armies: { ...s.board.armies, [territory]: s.board.armies[territory] + n },
    };
    const newPlayers = {
      ...s.players,
      [s.currentPlayer]: { ...player, armiesToPlace: player.armiesToPlace - n },
    };

    const next: Partial<GameState> = {
      board: newBoard,
      players: newPlayers,
    };

    // If in setup-reinforce, alternate turn after each single placement.
    if (s.phase === "setup-reinforce") {
      const humanLeft = newPlayers.human.armiesToPlace;
      const aiLeft = newPlayers.ai.armiesToPlace;
      if (humanLeft === 0 && aiLeft === 0) {
        next.phase = "reinforce";
        next.currentPlayer = "human";
        next.turnNumber = 1;
        next.log = [
          ...s.log,
          makeLog("phase", "Setup complete. Turn 1 begins — Reinforcement phase."),
        ];
        // Give first player their reinforcements
        const r = calculateReinforcements(newBoard, "human");
        newPlayers.human.armiesToPlace = r.total;
        next.log.push(
          makeLog(
            "info",
            `You receive ${r.total} reinforcements (${r.fromTerritories} from territories${
              r.fromContinents ? ` + ${r.fromContinents} continent bonus` : ""
            }).`,
            "human"
          )
        );
      } else {
        // swap turn if the other player still has armies to place
        const other: PlayerId = s.currentPlayer === "human" ? "ai" : "human";
        if (newPlayers[other].armiesToPlace > 0) next.currentPlayer = other;
      }
    } else if (s.phase === "reinforce") {
      if (newPlayers[s.currentPlayer].armiesToPlace === 0) {
        // auto-advance to attack
        next.phase = "attack";
        next.log = [
          ...s.log,
          makeLog("phase", `${player.name}: Attack phase.`, s.currentPlayer),
        ];
      }
    }

    set(next as GameState);
  },

  performAttack: (from, to, attackDice) => {
    const s = get();
    if (s.phase !== "attack") return;
    if (!canAttack(s, from, to)) return;

    const attackerArmies = s.board.armies[from];
    const defenderArmies = s.board.armies[to];
    const aDice = attackDice ?? maxAttackDice(attackerArmies);
    const dDice = maxDefenseDice(defenderArmies);

    const result = resolveBattle(aDice, dDice);

    const newArmies = { ...s.board.armies };
    newArmies[from] = attackerArmies - result.attackerLost;
    newArmies[to] = defenderArmies - result.defenderLost;

    const newOwner = { ...s.board.owner };
    const conquered = newArmies[to] <= 0;
    let nextPendingConquer: GameStore["pendingConquer"] = null;
    let hasConqueredThisTurn = s.hasConqueredThisTurn;

    if (conquered) {
      newOwner[to] = s.currentPlayer;
      hasConqueredThisTurn = true;
      // Attacker must move at least as many armies as dice rolled, up to (from.armies - 1)
      const minMove = aDice;
      const maxMove = newArmies[from] - 1;
      // Place minMove immediately; UI will ask the human for exact amount up to maxMove.
      newArmies[from] -= minMove;
      newArmies[to] = minMove;
      nextPendingConquer = { from, to, minMove, maxMove };
    }

    const newLog = [
      ...s.log,
      makeLog(
        "battle",
        `${TERRITORY_MAP[from].name} attacks ${TERRITORY_MAP[to].name}: ` +
          `A[${result.attackerDice.join(",")}] vs D[${result.defenderDice.join(",")}] — ` +
          `attacker -${result.attackerLost}, defender -${result.defenderLost}${
            conquered ? ` · CONQUERED` : ""
          }.`,
        s.currentPlayer
      ),
    ];

    // Check win / elimination
    const opponent: PlayerId = s.currentPlayer === "human" ? "ai" : "human";
    const opponentOwned = Object.values(newOwner).filter((o) => o === opponent).length;
    let winner: PlayerId | null = null;
    let phase: GameState["phase"] = s.phase;
    let updatedPlayers = s.players;

    if (opponentOwned === 0) {
      winner = s.currentPlayer;
      phase = "game-over";
      updatedPlayers = {
        ...s.players,
        [opponent]: { ...s.players[opponent], eliminated: true },
      };
      nextPendingConquer = null; // don't block the victory overlay
      newLog.push(
        makeLog(
          "victory",
          `${s.players[s.currentPlayer].name} conquered the world!`,
          s.currentPlayer
        )
      );
    }

    // If the game ended here, we first enter ENDING so the UI can play its
    // transition, then after a short beat move to GAME_OVER.
    const lifecycle: Lifecycle = winner ? "ending" : s.lifecycle;

    set({
      board: { owner: newOwner, armies: newArmies },
      lastBattle: {
        from,
        to,
        attackerDice: result.attackerDice,
        defenderDice: result.defenderDice,
        attackerLost: result.attackerLost,
        defenderLost: result.defenderLost,
        conquered,
        timestamp: Date.now(),
      },
      log: newLog,
      pendingConquer: nextPendingConquer,
      hasConqueredThisTurn,
      winner,
      phase,
      lifecycle,
      players: updatedPlayers,
    });

    if (winner) {
      // Cancel any in-flight API calls so no new actions are dispatched
      // during the ENDING phase.
      abortAllInFlight();
      setTimeout(() => {
        const cur = get();
        if (cur.lifecycle === "ending" && cur.winner === winner) {
          set({ lifecycle: "game-over" });
        }
      }, 900);
    }
  },

  moveAfterConquer: (from, to, count) => {
    const s = get();
    if (!s.pendingConquer) return;
    const pc = s.pendingConquer;
    if (pc.from !== from || pc.to !== to) return;
    const extra = Math.max(0, Math.min(count - pc.minMove, pc.maxMove - pc.minMove));
    const newArmies = { ...s.board.armies };
    newArmies[from] -= extra;
    newArmies[to] += extra;
    set({
      board: { ...s.board, armies: newArmies },
      pendingConquer: null,
      selectedTerritory: null,
    });
  },

  performFortify: (from, to, count) => {
    const s = get();
    if (s.phase !== "fortify") return;
    if (!canFortify(s, from, to)) return;
    const max = s.board.armies[from] - 1;
    const n = Math.max(1, Math.min(count, max));
    const newArmies = { ...s.board.armies };
    newArmies[from] -= n;
    newArmies[to] += n;
    set({
      board: { ...s.board, armies: newArmies },
      log: [
        ...s.log,
        makeLog(
          "info",
          `Fortified ${n} armies from ${TERRITORY_MAP[from].name} to ${TERRITORY_MAP[to].name}.`,
          s.currentPlayer
        ),
      ],
    });
    // Fortify ends the turn.
    get().endPhase();
  },

  endPhase: () => {
    const s = get();
    if (s.phase === "reinforce") {
      set({
        phase: "attack",
        selectedTerritory: null,
        log: [
          ...s.log,
          makeLog("phase", `${s.players[s.currentPlayer].name}: Attack phase.`, s.currentPlayer),
        ],
      });
    } else if (s.phase === "attack") {
      // If the player conquered ≥1 territory this turn, draw a card
      const updates: Partial<GameState> = {};
      const logs: LogEntry[] = [];
      if (s.hasConqueredThisTurn) {
        const card = drawCard();
        if (card) {
          const updatedPlayers = {
            ...s.players,
            [s.currentPlayer]: {
              ...s.players[s.currentPlayer],
              cards: [...s.players[s.currentPlayer].cards, card],
            },
          };
          updates.players = updatedPlayers;
          logs.push(
            makeLog(
              "info",
              `${s.players[s.currentPlayer].name} drew a RISK card (${card.type}${
                card.territory ? ` · ${TERRITORY_MAP[card.territory].name}` : ""
              }).`,
              s.currentPlayer
            )
          );
        }
      }
      set({
        ...updates,
        phase: "fortify",
        selectedTerritory: null,
        pendingConquer: null,
        log: [
          ...s.log,
          ...logs,
          makeLog(
            "phase",
            `${s.players[s.currentPlayer].name}: Fortify phase (optional).`,
            s.currentPlayer
          ),
        ],
      });
    } else if (s.phase === "fortify") {
      advanceToNextTurn(set, get);
    }
  },

  tradeCards: (indices) => {
    const s = get();
    if (s.phase !== "reinforce") return;
    if (indices.length !== 3) return;
    const player = s.players[s.currentPlayer];
    const set3 = indices.map((i) => player.cards[i]);
    if (!isValidSet(set3)) return;

    const bonus = cardSetBonus(s.cardTradeCount);

    // +2 bonus for territories you own from the traded cards
    let territoryBonus = 0;
    for (const c of set3) {
      if (c.territory && s.board.owner[c.territory] === s.currentPlayer) {
        // classic rule: up to +2 to a single occupied territory in the set
        territoryBonus = 2;
        break;
      }
    }

    const remainingCards = player.cards.filter((_, i) => !indices.includes(i));
    cardDiscard.push(...set3);

    const updatedPlayers = {
      ...s.players,
      [s.currentPlayer]: {
        ...player,
        cards: remainingCards,
        armiesToPlace: player.armiesToPlace + bonus + territoryBonus,
      },
    };

    set({
      players: updatedPlayers,
      cardTradeCount: s.cardTradeCount + 1,
      log: [
        ...s.log,
        makeLog(
          "info",
          `${player.name} traded a card set for +${bonus}${
            territoryBonus ? ` (+${territoryBonus} territory bonus)` : ""
          } armies.`,
          s.currentPlayer
        ),
      ],
    });
  },

  setAIConfig: (cfg) => {
    const merged = { ...get().aiConfig, ...cfg };
    saveAIConfig(merged);
    set({ aiConfig: merged });
  },

  setAIThinking: (v) =>
    set({
      aiThinking: v,
      aiThinkingSince: v ? Date.now() : null,
    }),

  showHint: (message, tone = "info") =>
    set({
      hint: { id: logIdCounter++, message, tone, timestamp: Date.now() },
    }),

  clearHint: () => set({ hint: null }),

  aiPlaceArmies: (placements) => {
    const s = get();
    const player = s.players[s.currentPlayer];
    const newArmies = { ...s.board.armies };
    let remaining = player.armiesToPlace;
    for (const p of placements) {
      if (remaining <= 0) break;
      if (s.board.owner[p.territory] !== s.currentPlayer) continue;
      const n = Math.min(p.count, remaining);
      newArmies[p.territory] += n;
      remaining -= n;
    }
    set({
      board: { ...s.board, armies: newArmies },
      players: {
        ...s.players,
        [s.currentPlayer]: { ...player, armiesToPlace: remaining },
      },
    });
  },

  setPendingConquer: (v) => set({ pendingConquer: v }),
}));

function advanceToNextTurn(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore
) {
  const s = get();
  const next: PlayerId = s.currentPlayer === "human" ? "ai" : "human";
  const newBoard = s.board;
  const r = calculateReinforcements(newBoard, next);

  // Auto-trade cards if the player is REQUIRED to (≥5 cards — classic rule).
  let updatedPlayer = {
    ...s.players[next],
    armiesToPlace: r.total,
    conqueredThisTurn: false,
  };
  const newLog: LogEntry[] = [...s.log];
  while (updatedPlayer.cards.length >= 5) {
    const indices = findValidCardSet(updatedPlayer.cards);
    if (!indices) break;
    const set3 = indices.map((i) => updatedPlayer.cards[i]);
    const bonus = cardSetBonus(s.cardTradeCount);
    cardDiscard.push(...set3);
    updatedPlayer = {
      ...updatedPlayer,
      cards: updatedPlayer.cards.filter((_, i) => !indices.includes(i)),
      armiesToPlace: updatedPlayer.armiesToPlace + bonus,
    };
    newLog.push(
      makeLog(
        "info",
        `${updatedPlayer.name} was forced to trade a card set for +${bonus} armies.`,
        next
      )
    );
  }

  newLog.push(
    makeLog(
      "phase",
      `Turn ${s.turnNumber + 1}: ${updatedPlayer.name}'s Reinforcement (${r.total} armies` +
        `${r.fromContinents ? `; +${r.fromContinents} continent bonus` : ""}).`,
      next
    )
  );

  set({
    phase: "reinforce",
    currentPlayer: next,
    turnNumber: s.turnNumber + 1,
    selectedTerritory: null,
    pendingFortify: null,
    pendingConquer: null,
    hasConqueredThisTurn: false,
    players: { ...s.players, [next]: updatedPlayer },
    log: newLog,
  });
}

// ============================================================================
// Utility: list territories you can attack from your selected territory
// ============================================================================

export function getValidAttackTargets(s: GameState, from: TerritoryId): TerritoryId[] {
  return TERRITORY_MAP[from].neighbors.filter(
    (n) =>
      s.board.owner[n] !== s.currentPlayer &&
      s.board.armies[from] >= 2
  );
}

export function getValidFortifyTargets(s: GameState, from: TerritoryId): TerritoryId[] {
  return TERRITORY_MAP[from].neighbors.filter(
    (n) => s.board.owner[n] === s.currentPlayer && s.board.armies[from] >= 2
  );
}

// Export for AI
export { TERRITORIES };
