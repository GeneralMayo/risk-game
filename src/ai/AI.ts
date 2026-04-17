/**
 * AI orchestrator — player-agnostic, provider-agnostic.
 *
 * For each AI player's turn, the orchestrator:
 *   1. Asks the configured provider (or heuristic) for a structured decision
 *      of the form { thinking: "...", action: {...} }.
 *   2. Publishes the thinking narration to the store so the UI can stream it.
 *   3. Pauses for at least `pacing.minActionMs` from the time thinking was
 *      revealed, so the user can read it.
 *   4. Executes the action against the store.
 *   5. Sleeps `pacing.betweenActionsMs` before the next action.
 *
 * Heuristic fallback is used when the provider returns null (LLM failure,
 * aborted, rate-limited past retries).
 */

import { CONTINENTS, TERRITORIES, TERRITORY_MAP } from "@/data/board";
import type { GameState, PlayerId, TerritoryId } from "@/data/types";
import {
  cardSetBonus,
  continentsControlledBy,
  findValidCardSet,
  maxAttackDice,
  territoriesOwnedBy,
} from "@/lib/GameLogic";
import { SFX } from "@/lib/sound";
import { registerAbort, useGameStore } from "@/state/gameStore";
import { getProvider } from "./providers/registry";
import type { LLMDecision, Provider } from "./providers/types";

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

// ============================================================================
// Lean game-state summary for the LLM
// ============================================================================

function summarizeState(s: GameState, player: PlayerId) {
  const opponent: PlayerId = player === "human" ? "ai" : "human";
  const owned = territoriesOwnedBy(s.board, player);
  const oppOwned = territoriesOwnedBy(s.board, opponent);
  const frontier = owned.filter((t) =>
    TERRITORY_MAP[t].neighbors.some((n) => s.board.owner[n] !== player)
  );
  const terrs = TERRITORIES.map((t) => ({
    id: t.id,
    c: t.continent,
    o: s.board.owner[t.id] === player ? "me" : "enemy",
    a: s.board.armies[t.id],
    n: t.neighbors,
  }));
  return {
    phase: s.phase,
    turn: s.turnNumber,
    me: {
      territories: owned.length,
      armies: owned.reduce((sum, t) => sum + s.board.armies[t], 0),
      to_place: s.players[player].armiesToPlace,
      continents: continentsControlledBy(s.board, player),
      cards: s.players[player].cards.length,
      next_set_bonus: cardSetBonus(s.cardTradeCount),
      frontier: frontier.map((t) => ({
        id: t,
        armies: s.board.armies[t],
        weakest_enemy_neighbor: weakestEnemyNeighbor(s, t, player),
      })),
    },
    enemy: {
      territories: oppOwned.length,
      armies: oppOwned.reduce((sum, t) => sum + s.board.armies[t], 0),
      continents: continentsControlledBy(s.board, opponent),
      cards: s.players[opponent].cards.length,
    },
    continents: Object.values(CONTINENTS).map((c) => ({
      id: c.id,
      bonus: c.bonus,
    })),
    territories: terrs,
  };
}

function weakestEnemyNeighbor(
  s: GameState,
  from: TerritoryId,
  player: PlayerId
): { id: string; armies: number } | null {
  const enemies = TERRITORY_MAP[from].neighbors
    .filter((n) => s.board.owner[n] !== player)
    .map((n) => ({ id: n, armies: s.board.armies[n] }));
  if (!enemies.length) return null;
  enemies.sort((a, b) => a.armies - b.armies);
  return enemies[0];
}

// ============================================================================
// Heuristic fallback
// ============================================================================

export function parseStyle(prompt: string) {
  const p = prompt.toLowerCase();
  return {
    aggressive: /aggress|ruthless|conquer|offens|pressure|attack|caesar|rubicon/.test(p),
    defensive: /defens|cautio|turtle|fortif|safe|patient|washington|attrition/.test(p),
    continent: /continent|bonus|hoard|hold|cleopatra|australia|south america/.test(p),
    focus: {
      australia: /\baustralia\b/.test(p),
      south_america: /south america/.test(p),
      asia: /\basia\b/.test(p),
      africa: /\bafrica\b/.test(p),
      europe: /\beurope\b/.test(p),
      north_america: /north america/.test(p),
    },
  };
}

function heuristicThinking(
  persona: string,
  phase: "reinforce" | "attack" | "fortify",
  details: string
): string {
  const name = persona || "Strategist";
  if (phase === "reinforce")
    return `${name}: ${details}`;
  if (phase === "attack")
    return `${name}: ${details}`;
  return `${name}: ${details}`;
}

function heuristicReinforcements(
  s: GameState,
  player: PlayerId,
  style: ReturnType<typeof parseStyle>
): Array<{ territory: TerritoryId; count: number }> {
  const armies = s.players[player].armiesToPlace;
  if (armies <= 0) return [];
  const owned = territoriesOwnedBy(s.board, player);
  const frontier = owned.filter((t) =>
    TERRITORY_MAP[t].neighbors.some((n) => s.board.owner[n] !== player)
  );
  if (frontier.length === 0) return [{ territory: owned[0], count: armies }];

  const focusContinents: string[] = [];
  if (style.focus.australia) focusContinents.push("AU");
  if (style.focus.south_america) focusContinents.push("SA");
  if (style.focus.asia) focusContinents.push("AS");
  if (style.focus.africa) focusContinents.push("AF");
  if (style.focus.europe) focusContinents.push("EU");
  if (style.focus.north_america) focusContinents.push("NA");

  const ranked = frontier
    .map((t) => {
      const enemyNeighbors = TERRITORY_MAP[t].neighbors.filter(
        (n) => s.board.owner[n] !== player
      );
      const enemyStrength = Math.max(
        0,
        ...enemyNeighbors.map((n) => s.board.armies[n])
      );
      const bonus = focusContinents.includes(TERRITORY_MAP[t].continent) ? 5 : 0;
      return { t, score: enemyStrength - s.board.armies[t] + bonus };
    })
    .sort((a, b) => b.score - a.score);

  const picks = ranked.slice(0, Math.min(3, ranked.length));
  const placements: Array<{ territory: TerritoryId; count: number }> = [];
  let remaining = armies;
  const weights = style.defensive ? [0.5, 0.3, 0.2] : [0.65, 0.2, 0.15];
  for (let i = 0; i < picks.length; i++) {
    const c =
      i === picks.length - 1
        ? remaining
        : Math.max(1, Math.floor(armies * (weights[i] ?? 0.1)));
    const use = Math.min(c, remaining);
    if (use > 0) placements.push({ territory: picks[i].t, count: use });
    remaining -= use;
  }
  return placements;
}

function heuristicAttack(
  s: GameState,
  player: PlayerId,
  style: ReturnType<typeof parseStyle>
): { from: TerritoryId; to: TerritoryId } | null {
  const owned = territoriesOwnedBy(s.board, player);
  const margin = style.aggressive ? 0 : style.defensive ? 2 : 1;
  type Cand = { from: TerritoryId; to: TerritoryId; delta: number };
  const cands: Cand[] = [];
  for (const t of owned) {
    const myArmies = s.board.armies[t];
    if (myArmies < 3) continue;
    const enemies = TERRITORY_MAP[t].neighbors
      .filter((n) => s.board.owner[n] !== player)
      .map((n) => ({ n, a: s.board.armies[n] }))
      .sort((x, y) => x.a - y.a);
    if (!enemies.length) continue;
    const weakest = enemies[0];
    if (myArmies >= weakest.a + margin + 1) {
      cands.push({ from: t, to: weakest.n, delta: myArmies - weakest.a });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.delta - a.delta);
  return { from: cands[0].from, to: cands[0].to };
}

function heuristicFortify(
  s: GameState,
  player: PlayerId
): { from: TerritoryId; to: TerritoryId; count: number } | null {
  const owned = territoriesOwnedBy(s.board, player);
  const interior = owned.filter(
    (t) =>
      s.board.armies[t] >= 2 &&
      TERRITORY_MAP[t].neighbors.every((n) => s.board.owner[n] === player)
  );
  if (!interior.length) return null;
  for (const src of interior.sort(
    (a, b) => s.board.armies[b] - s.board.armies[a]
  )) {
    const candidates = TERRITORY_MAP[src].neighbors.filter(
      (n) =>
        s.board.owner[n] === player &&
        TERRITORY_MAP[n].neighbors.some((nn) => s.board.owner[nn] !== player)
    );
    if (!candidates.length) continue;
    const dest = candidates.sort(
      (a, b) =>
        TERRITORY_MAP[b].neighbors.filter((n) => s.board.owner[n] !== player)
          .length -
        TERRITORY_MAP[a].neighbors.filter((n) => s.board.owner[n] !== player)
          .length
    )[0];
    return { from: src, to: dest, count: s.board.armies[src] - 1 };
  }
  return null;
}

// ============================================================================
// Prompt builders (now asking for {thinking, action})
// ============================================================================

const JSON_CONTRACT_REINFORCE = `Respond with strict JSON of this shape ONLY:
{
  "thinking": "<1-2 short sentences, IN CHARACTER, explaining your intent>",
  "action": { "placements": [{"territory": "<id>", "count": <int>}] }
}
Rules:
- Only use territory IDs where o === "me".
- placements counts must sum to exactly the "to_place" value.`;

const JSON_CONTRACT_ATTACK = `Respond with strict JSON of this shape ONLY:
{
  "thinking": "<1-2 short sentences, IN CHARACTER>",
  "action": { "attacks": [{"from": "<my_id>", "to": "<adjacent_enemy_id>"}] }
}
Rules:
- "from" must be a territory you own (o === "me") with a >= 2.
- "to" must be adjacent to "from" and owned by the enemy.
- Return {"action": {"attacks": []}} to end the attack phase.
- Exactly ONE attack per response — we will call you again for the next one.`;

const JSON_CONTRACT_FORTIFY = `Respond with strict JSON of this shape ONLY:
{
  "thinking": "<1-2 short sentences, IN CHARACTER>",
  "action": { "fortify": {"from": "<my_id>", "to": "<my_adjacent_id>", "count": <int>} }
}
Rules:
- Both territories must be owned by you and directly adjacent.
- Leave >= 1 army behind (from.armies - count >= 1).
- Use {"action": {"fortify": null}} to skip fortifying.`;

function buildPrompt(
  s: GameState,
  player: PlayerId,
  voice: string,
  phase: "reinforce" | "attack" | "fortify"
): { systemPrompt: string; userPrompt: string } {
  const summary = summarizeState(s, player);
  const pName = s.players[player].name;
  const ai = s.players[player].ai!;
  const system = `${ai.systemPrompt}\n\n${voice}\n\nYou MUST respond with the exact JSON contract the user describes. Keep "thinking" short and in character.`;
  const contract =
    phase === "reinforce"
      ? JSON_CONTRACT_REINFORCE
      : phase === "attack"
        ? JSON_CONTRACT_ATTACK
        : JSON_CONTRACT_FORTIFY;
  const header = `You are ${pName}. It is your ${phase.toUpperCase()} phase.`;
  const user = `${header}\n\nGame state (compact JSON — o:"me" means you own it):\n${JSON.stringify(summary)}\n\n${contract}`;
  return { systemPrompt: system, userPrompt: user };
}

// ============================================================================
// Provider call with abort + thinking stream + pacing
// ============================================================================

async function requestDecision(
  player: PlayerId,
  phase: "reinforce" | "attack" | "fortify"
): Promise<LLMDecision | null> {
  const s = useGameStore.getState();
  const ai = s.players[player].ai;
  if (!ai) return null;

  const { registerAbort: reg, setPlayerThinking, bumpProviderUsage, reportRateLimit } =
    {
      registerAbort,
      setPlayerThinking: s.setPlayerThinking,
      bumpProviderUsage: s.bumpProviderUsage,
      reportRateLimit: s.reportRateLimit,
    };

  if (ai.provider === "heuristic") return null;

  const provider: Provider | null = getProvider(
    { id: ai.provider, model: ai.model, baseUrl: ai.baseUrl },
    s.apiKeys
  );
  if (!provider) return null;

  const { controller, release } = reg();
  try {
    const { systemPrompt, userPrompt } = buildPrompt(s, player, ai.personaName, phase);
    const decision = await provider.decide({
      systemPrompt,
      userPrompt,
      temperature: ai.temperature,
      abortSignal: controller.signal,
      onUsage: () => bumpProviderUsage(ai.provider),
      onRateLimited: (ms) => {
        reportRateLimit(ai.provider, ms);
      },
    });
    if (decision?.thinking) {
      // Stream it character-by-character.
      await streamThinking(player, decision.thinking, controller.signal);
    }
    return decision;
  } catch (err) {
    if ((err as Error).name === "AbortError") return null;
    console.warn("[AI] provider error", err);
    return null;
  } finally {
    release();
    // Only clear rate-limit waiting indicator if no further cooldowns are set.
    setTimeout(() => {
      const cur = useGameStore.getState();
      if (cur.rateLimitWait && Date.now() >= cur.rateLimitWait.resumesAt) {
        cur.clearRateLimitWait();
      }
    }, 100);
  }
}

/**
 * Stream the thinking narration word-by-word at a readable pace (rather than
 * character-by-character, which reads like a flicker). Targets ~140-180wpm.
 */
async function streamThinking(
  player: PlayerId,
  text: string,
  signal: AbortSignal
) {
  useGameStore.getState().setPlayerThinking(player, "");
  // Split keeping whitespace so the output always matches the input exactly.
  const tokens = text.split(/(\s+)/);
  let out = "";
  for (const tok of tokens) {
    if (signal.aborted) return;
    out += tok;
    useGameStore.getState().setPlayerThinking(player, out);
    // Pace: short words faster, punctuation gets a tiny beat.
    const endsWithPause = /[.!?,;:—]$/.test(tok);
    const delay = endsWithPause ? 140 : 55 + Math.min(80, tok.length * 8);
    await sleep(delay);
  }
}

// ============================================================================
// Orchestrator
// ============================================================================

const runningFor = new Set<PlayerId>();
const setupRunningFor = new Set<PlayerId>();

export async function runAITurn(player?: PlayerId) {
  const store = useGameStore.getState();
  const who = player ?? store.currentPlayer;
  if (runningFor.has(who)) return;
  if (store.winner) return;
  if (store.lifecycle !== "in-progress") return;
  if (store.currentPlayer !== who) return;
  if (!store.players[who].ai) return;

  runningFor.add(who);
  store.setAIThinking(true);

  const pacing = store.pacing;
  const ai = store.players[who].ai!;
  const style = parseStyle(ai.systemPrompt);

  try {
    // === REINFORCE ===
    await aiMaybeTradeCards(who);

    const state0 = useGameStore.getState();
    const actionStart = Date.now();
    const llm = await requestDecision(who, "reinforce");
    let placements: Array<{ territory: TerritoryId; count: number }> | null =
      null;
    if (llm && llm.action.type === "reinforce") {
      placements = llm.action.placements
        .filter((p) => TERRITORY_MAP[p.territory])
        .map((p) => ({
          territory: p.territory,
          count: Math.max(1, Math.floor(p.count)),
        }));
    }
    if (!placements || placements.length === 0) {
      placements = heuristicReinforcements(state0, who, style);
      useGameStore
        .getState()
        .setPlayerThinking(
          who,
          heuristicThinking(
            ai.personaName,
            "reinforce",
            "Reinforce the most-threatened frontier."
          )
        );
    }

    const max = state0.players[who].armiesToPlace;
    let sum = 0;
    placements = placements
      .filter((p) => state0.board.owner[p.territory] === who)
      .map((p) => {
        const c = Math.min(p.count, Math.max(0, max - sum));
        sum += c;
        return { territory: p.territory, count: c };
      });
    if (sum < max) {
      const owned = territoriesOwnedBy(state0.board, who);
      const fallback =
        owned.find((t) =>
          TERRITORY_MAP[t].neighbors.some((n) => state0.board.owner[n] !== who)
        ) ?? owned[0];
      if (fallback) {
        const existing = placements.find((p) => p.territory === fallback);
        if (existing) existing.count += max - sum;
        else placements.push({ territory: fallback, count: max - sum });
      }
    }

    // Pace the overall "reinforce beat" before starting
    await waitActionBudget(actionStart, pacing.minActionMs);

    for (const p of placements) {
      if (p.count <= 0) continue;
      useGameStore.getState().aiPlaceArmies([p]);
      SFX.place();
      await sleep(Math.min(300, pacing.betweenActionsMs));
    }
    useGameStore.getState().endPhase(); // -> attack
    await sleep(pacing.betweenActionsMs);

    // === ATTACK ===
    let attackIters = 0;
    while (attackIters++ < 25) {
      const s = useGameStore.getState();
      if (s.winner || s.phase !== "attack" || s.currentPlayer !== who) break;
      if (s.lifecycle !== "in-progress") break;

      const start = Date.now();
      const llm = await requestDecision(who, "attack");
      let next: { from: TerritoryId; to: TerritoryId } | null = null;
      if (llm && llm.action.type === "attack" && llm.action.attacks.length) {
        const a = llm.action.attacks[0];
        if (TERRITORY_MAP[a.from] && TERRITORY_MAP[a.to])
          next = { from: a.from, to: a.to };
      }
      if (!next) {
        next = heuristicAttack(s, who, style);
        if (next) {
          useGameStore
            .getState()
            .setPlayerThinking(
              who,
              heuristicThinking(
                ai.personaName,
                "attack",
                `Strike from ${TERRITORY_MAP[next.from].name} at ${TERRITORY_MAP[next.to].name}.`
              )
            );
        } else {
          useGameStore
            .getState()
            .setPlayerThinking(
              who,
              heuristicThinking(
                ai.personaName,
                "attack",
                "No favourable attack — holding position."
              )
            );
        }
      }

      if (!next) break;

      const sNow = useGameStore.getState();
      if (
        sNow.board.owner[next.from] !== who ||
        sNow.board.owner[next.to] === who ||
        sNow.board.armies[next.from] < 2 ||
        !TERRITORY_MAP[next.from].neighbors.includes(next.to)
      ) {
        break;
      }

      await waitActionBudget(start, pacing.minActionMs);

      // Blitz
      SFX.diceRoll();
      let blitzGuard = 0;
      while (blitzGuard++ < 20) {
        const cur = useGameStore.getState();
        if (cur.winner || cur.lifecycle !== "in-progress") break;
        if (cur.board.owner[next.from] !== who) break;
        if (cur.board.owner[next.to] === who) break;
        if (cur.board.armies[next.from] < 2) break;
        const d = maxAttackDice(cur.board.armies[next.from]);
        cur.performAttack(next.from, next.to, d);
        await sleep(280);
        const after = useGameStore.getState();
        if (after.pendingConquer) {
          const pc = after.pendingConquer;
          after.moveAfterConquer(pc.from, pc.to, pc.maxMove);
          SFX.conquer();
          await sleep(260);
          break;
        }
        SFX.battleHit();
      }
      await sleep(pacing.betweenActionsMs);
    }

    // === FORTIFY ===
    {
      const s = useGameStore.getState();
      if (!s.winner && s.phase === "attack" && s.currentPlayer === who) {
        s.endPhase();
        await sleep(pacing.betweenActionsMs);
      }
    }
    const sFort = useGameStore.getState();
    if (
      !sFort.winner &&
      sFort.phase === "fortify" &&
      sFort.currentPlayer === who &&
      sFort.lifecycle === "in-progress"
    ) {
      const start = Date.now();
      const llm = await requestDecision(who, "fortify");
      let fort: { from: TerritoryId; to: TerritoryId; count: number } | null =
        null;
      if (
        llm &&
        llm.action.type === "fortify" &&
        llm.action.fortify &&
        TERRITORY_MAP[llm.action.fortify.from] &&
        TERRITORY_MAP[llm.action.fortify.to]
      ) {
        fort = {
          from: llm.action.fortify.from,
          to: llm.action.fortify.to,
          count: Math.max(1, Math.floor(llm.action.fortify.count)),
        };
      }
      if (!fort) {
        fort = heuristicFortify(sFort, who);
        useGameStore
          .getState()
          .setPlayerThinking(
            who,
            heuristicThinking(
              ai.personaName,
              "fortify",
              fort
                ? `Shift ${fort.count} to ${TERRITORY_MAP[fort.to].name}.`
                : "Hold all positions."
            )
          );
      }

      await waitActionBudget(start, pacing.minActionMs);

      if (
        fort &&
        sFort.board.owner[fort.from] === who &&
        sFort.board.owner[fort.to] === who &&
        TERRITORY_MAP[fort.from].neighbors.includes(fort.to) &&
        sFort.board.armies[fort.from] >= 2
      ) {
        useGameStore
          .getState()
          .performFortify(fort.from, fort.to, fort.count);
      } else {
        useGameStore.getState().endPhase();
      }
    }
  } finally {
    useGameStore.getState().setAIThinking(false);
    runningFor.delete(who);
  }
}

async function aiMaybeTradeCards(who: PlayerId) {
  const s = useGameStore.getState();
  if (s.phase !== "reinforce") return;
  if (s.currentPlayer !== who) return;
  const hand = s.players[who].cards;
  const set = findValidCardSet(hand);
  if (!set) return;
  s.tradeCards(set);
  useGameStore
    .getState()
    .addLog("ai", `${s.players[who].name} traded a card set for bonus armies.`, who);
}

/** Ensure we don't return from an action faster than pacing.minActionMs. */
async function waitActionBudget(startedAt: number, minMs: number) {
  const elapsed = Date.now() - startedAt;
  const rem = minMs - elapsed;
  if (rem > 0) await sleep(rem);
}

// ============================================================================
// Setup-phase one-army placement
// ============================================================================

export async function runAISetupPlacement(player?: PlayerId) {
  const store = useGameStore.getState();
  const who = player ?? store.currentPlayer;
  if (setupRunningFor.has(who)) return;
  setupRunningFor.add(who);
  try {
    if (store.phase !== "setup-reinforce") return;
    if (store.currentPlayer !== who) return;
    if (store.players[who].armiesToPlace <= 0) return;
    if (!store.players[who].ai && store.players[who].controller !== "human") return;
    if (store.lifecycle !== "in-progress") return;

    const owned = territoriesOwnedBy(store.board, who);
    const frontier = owned.filter((t) =>
      TERRITORY_MAP[t].neighbors.some((n) => store.board.owner[n] !== who)
    );
    const pool = frontier.length ? frontier : owned;
    pool.sort((a, b) => store.board.armies[a] - store.board.armies[b]);
    const pick = pool[0] ?? owned[0];
    await sleep(Math.min(260, store.pacing.betweenActionsMs));
    store.placeArmy(pick, 1);
    SFX.place();
  } finally {
    setupRunningFor.delete(who);
  }
}
