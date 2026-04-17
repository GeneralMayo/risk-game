/**
 * AI orchestrator — player-agnostic, provider-agnostic.
 *
 * Plan-then-execute model:
 *   1. At the START of each AI turn, one LLM call produces a full `TurnPlan`:
 *        { summary, placements[], attacks[], fortify }.
 *   2. The plan's `summary` is streamed into the ThinkingPanel (1-2 sentences).
 *   3. The orchestrator executes the plan step-by-step with visible pacing
 *      (≈900 ms between actions). During execution it shows ONLY a minimal
 *      action label like "Attacking India from China" — no per-action
 *      narration.
 *   4. After each attack, we check for "major disruption" (a planned attack
 *      that failed so badly that the rest of the plan no longer makes sense).
 *      If disrupted, the orchestrator requests a fresh plan, shows the new
 *      short summary, and continues with the new plan. Minor setbacks are
 *      tolerated silently.
 *
 * Heuristic fallback builds the same TurnPlan shape so the executor code path
 * is identical whether the LLM is on or off.
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
import type { LLMDecision, LLMTurnPlan, Provider } from "./providers/types";

/**
 * Sleep that honours the spectator controls:
 *   - `pacing.speed`  — multiplier applied to elapsed time. 2 = twice as fast,
 *                       0.5 = half speed. So a 900 ms sleep at speed=2 resolves
 *                       in ~450 real ms.
 *   - `paused`        — while true, elapsed time does not accumulate. Resumes
 *                       seamlessly when paused flips back to false.
 *
 * Aborts as soon as the signal fires (Quit, New Game, etc.).
 */
const SLEEP_POLL_MS = 50;
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));

    let elapsed = 0;
    let lastCheck = Date.now();
    let timer: number | undefined;

    const onAbort = () => {
      if (timer) clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const tick = () => {
      if (signal?.aborted) return; // onAbort already rejected
      const s = useGameStore.getState();
      const now = Date.now();
      const real = now - lastCheck;
      lastCheck = now;
      if (!s.paused) {
        const speed = s.pacing.speed > 0 ? s.pacing.speed : 1;
        elapsed += real * speed;
      }
      if (elapsed >= ms) {
        signal?.removeEventListener("abort", onAbort);
        resolve();
        return;
      }
      timer = window.setTimeout(tick, SLEEP_POLL_MS);
    };
    timer = window.setTimeout(tick, SLEEP_POLL_MS);
  });

// ============================================================================
// Plan shape (internal — normalised version of LLMTurnPlan)
// ============================================================================

interface TurnPlan {
  summary: string;
  placements: Array<{ territory: TerritoryId; count: number }>;
  attacks: Array<{ from: TerritoryId; to: TerritoryId }>;
  fortify: { from: TerritoryId; to: TerritoryId; count: number } | null;
}

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
// Heuristic fallback — produces a TurnPlan, same contract as the LLM
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

function heuristicAttackList(
  s: GameState,
  player: PlayerId,
  style: ReturnType<typeof parseStyle>
): Array<{ from: TerritoryId; to: TerritoryId }> {
  const margin = style.aggressive ? 0 : style.defensive ? 2 : 1;
  // Greedy — pick the best favourable attack, pretend it conquers, repeat up to 3.
  const plans: Array<{ from: TerritoryId; to: TerritoryId }> = [];
  const simulated: Record<TerritoryId, number> = { ...s.board.armies };
  const owner: Record<TerritoryId, PlayerId | null> = { ...s.board.owner };
  for (let i = 0; i < 3; i++) {
    const owned = TERRITORIES.map((t) => t.id).filter((t) => owner[t] === player);
    type Cand = { from: TerritoryId; to: TerritoryId; delta: number };
    const cands: Cand[] = [];
    for (const t of owned) {
      if (simulated[t] < 3) continue;
      const enemies = TERRITORY_MAP[t].neighbors
        .filter((n) => owner[n] !== player)
        .map((n) => ({ n, a: simulated[n] }))
        .sort((x, y) => x.a - y.a);
      if (!enemies.length) continue;
      const weakest = enemies[0];
      if (simulated[t] >= weakest.a + margin + 1) {
        cands.push({ from: t, to: weakest.n, delta: simulated[t] - weakest.a });
      }
    }
    if (!cands.length) break;
    cands.sort((a, b) => b.delta - a.delta);
    const best = cands[0];
    plans.push({ from: best.from, to: best.to });
    // Simulate conquest: mover mostly moves to new territory.
    const moving = Math.max(1, simulated[best.from] - 2);
    simulated[best.from] -= moving;
    simulated[best.to] = moving;
    owner[best.to] = player;
  }
  return plans;
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

function heuristicPlan(
  s: GameState,
  player: PlayerId,
  style: ReturnType<typeof parseStyle>,
  persona: string
): TurnPlan {
  const placements = heuristicReinforcements(s, player, style);
  const attacks = heuristicAttackList(s, player, style);
  const fortify = heuristicFortify(s, player);

  // Build a short, in-character summary from what we decided.
  const firstAttack = attacks[0];
  let intent: string;
  if (firstAttack) {
    intent = `press ${TERRITORY_MAP[firstAttack.to].name}`;
    if (attacks.length > 1) intent += ` then swing further`;
  } else {
    intent = style.defensive ? `hold the line` : `fortify and wait`;
  }
  const summary = `${persona || "Strategist"}: reinforce the frontier and ${intent}.`;
  return { summary, placements, attacks, fortify };
}

// ============================================================================
// Prompt builders
// ============================================================================

const JSON_CONTRACT_PLAN = `Respond with strict JSON of this shape ONLY:
{
  "thinking": "<your private reasoning, <= 60 words>",
  "summary": "<1-2 sentences in character: the headline plan the player will see>",
  "action": {
    "placements": [{"territory": "<my_id>", "count": <int>}],
    "attacks":    [{"from": "<my_id>", "to": "<adjacent_enemy_id>"}],
    "fortify":    {"from": "<my_id>", "to": "<my_adjacent_id>", "count": <int>} | null
  }
}

Rules:
- placements counts must sum to exactly the "to_place" value. All "territory" values must be ones you own (o === "me").
- attacks is an ORDERED list of attacks to attempt this turn. Each "from" must be yours with a >= 2, and each "to" must be an enemy territory adjacent to "from" at the moment the attack starts. Up to 3 entries — pick the highest-value ones. Empty list means you attack nothing this turn.
- fortify may be null (skip). When provided, both territories must be yours and directly adjacent, with from.armies - count >= 1.
- The SUMMARY is a SHORT player-facing headline (1-2 sentences). The THINKING field is longer private reasoning, but keep it brief.`;

function buildPlanPrompt(
  s: GameState,
  player: PlayerId,
  voice: string,
  replanHint?: string
): { systemPrompt: string; userPrompt: string } {
  const summary = summarizeState(s, player);
  const pName = s.players[player].name;
  const ai = s.players[player].ai!;
  const system = `${ai.systemPrompt}\n\n${voice}\n\nYou must respond with the exact JSON contract the user describes.`;
  const header = `You are ${pName}. It is the start of your turn.`;
  const replan = replanHint
    ? `\n\nYour previous plan was disrupted: ${replanHint} Build a FRESH plan from the current state; do not repeat moves that already happened.\n`
    : "";
  const user = `${header}${replan}\n\nGame state (compact JSON — o:"me" means you own it):\n${JSON.stringify(summary)}\n\n${JSON_CONTRACT_PLAN}`;
  return { systemPrompt: system, userPrompt: user };
}

// ============================================================================
// Provider call for the plan
// ============================================================================

async function requestPlan(
  player: PlayerId,
  replanHint?: string
): Promise<LLMTurnPlan | null> {
  const s = useGameStore.getState();
  const ai = s.players[player].ai;
  if (!ai || ai.provider === "heuristic") return null;

  const provider: Provider | null = getProvider(
    { id: ai.provider, model: ai.model, baseUrl: ai.baseUrl },
    s.apiKeys
  );
  if (!provider) return null;

  const { controller, release } = registerAbort();
  try {
    const { systemPrompt, userPrompt } = buildPlanPrompt(
      s,
      player,
      ai.personaName,
      replanHint
    );
    const decision: LLMDecision | null = await provider.decide({
      systemPrompt,
      userPrompt,
      temperature: ai.temperature,
      abortSignal: controller.signal,
      onUsage: () => s.bumpProviderUsage(ai.provider),
      onRateLimited: (ms) => s.reportRateLimit(ai.provider, ms),
    });
    if (!decision) return null;
    if (decision.action.type !== "plan") return null;
    return decision.action;
  } catch (err) {
    if ((err as Error).name === "AbortError") return null;
    console.warn("[AI] plan request error", err);
    return null;
  } finally {
    release();
    setTimeout(() => {
      const cur = useGameStore.getState();
      if (cur.rateLimitWait && Date.now() >= cur.rateLimitWait.resumesAt) {
        cur.clearRateLimitWait();
      }
    }, 100);
  }
}

/**
 * Stream the plan summary word-by-word at a readable pace into the thinking
 * panel's plan field. Targets ~140-180 wpm.
 */
async function streamPlanSummary(
  player: PlayerId,
  text: string,
  signal: AbortSignal
) {
  useGameStore.getState().setPlayerPlan(player, "");
  const tokens = text.split(/(\s+)/);
  let out = "";
  for (const tok of tokens) {
    if (signal.aborted) return;
    out += tok;
    useGameStore.getState().setPlayerPlan(player, out);
    const endsWithPause = /[.!?,;:—]$/.test(tok);
    const delay = endsWithPause ? 120 : 45 + Math.min(60, tok.length * 6);
    await sleep(delay);
  }
}

// ============================================================================
// Plan sanitisation + execution
// ============================================================================

function sanitisePlan(
  raw: LLMTurnPlan | null,
  s: GameState,
  player: PlayerId,
  style: ReturnType<typeof parseStyle>,
  persona: string
): TurnPlan {
  if (!raw) return heuristicPlan(s, player, style, persona);

  const known = (t: TerritoryId) => !!TERRITORY_MAP[t];
  const placements = raw.placements
    .filter((p) => known(p.territory) && s.board.owner[p.territory] === player)
    .map((p) => ({
      territory: p.territory,
      count: Math.max(1, Math.floor(p.count)),
    }));

  const attacks = raw.attacks
    .filter(
      (a) =>
        known(a.from) &&
        known(a.to) &&
        TERRITORY_MAP[a.from].neighbors.includes(a.to)
    )
    .slice(0, 5); // cap

  let fortify = raw.fortify;
  if (fortify) {
    if (
      !known(fortify.from) ||
      !known(fortify.to) ||
      !TERRITORY_MAP[fortify.from].neighbors.includes(fortify.to)
    ) {
      fortify = null;
    }
  }

  // If the plan has NO placements but we owe armies, fall back to heuristic
  // placements so we never stall.
  const fallback = heuristicPlan(s, player, style, persona);
  const finalPlacements = placements.length ? placements : fallback.placements;
  const finalAttacks = attacks.length ? attacks : fallback.attacks;

  return {
    summary:
      (raw.summary && raw.summary.trim()) ||
      fallback.summary,
    placements: finalPlacements,
    attacks: finalAttacks,
    fortify: fortify ?? fallback.fortify,
  };
}

/** Trim placements so the total equals armiesToPlace, and top up via fallback. */
function normalisePlacements(
  placements: Array<{ territory: TerritoryId; count: number }>,
  s: GameState,
  player: PlayerId
): Array<{ territory: TerritoryId; count: number }> {
  const max = s.players[player].armiesToPlace;
  let sum = 0;
  const trimmed = placements
    .filter((p) => s.board.owner[p.territory] === player)
    .map((p) => {
      const c = Math.min(p.count, Math.max(0, max - sum));
      sum += c;
      return { territory: p.territory, count: c };
    })
    .filter((p) => p.count > 0);

  if (sum < max) {
    const owned = territoriesOwnedBy(s.board, player);
    const fallback =
      owned.find((t) =>
        TERRITORY_MAP[t].neighbors.some((n) => s.board.owner[n] !== player)
      ) ?? owned[0];
    if (fallback) {
      const existing = trimmed.find((p) => p.territory === fallback);
      if (existing) existing.count += max - sum;
      else trimmed.push({ territory: fallback, count: max - sum });
    }
  }
  return trimmed;
}

// ============================================================================
// Orchestrator
// ============================================================================

const runningFor = new Set<PlayerId>();
const setupRunningFor = new Set<PlayerId>();

/** How long a single in-turn action label is visible before the next one. */
const ACTION_STEP_MS = 900;

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
  // Reset prior turn's transient narration/label so the panel starts clean.
  store.setPlayerThinking(who, "");
  store.setPlayerActionLabel(who, "");

  const ai = store.players[who].ai!;
  const style = parseStyle(ai.systemPrompt);

  try {
    // Trade cards once up-front so reinforcements in the plan are aware of the
    // bonus armies.
    await aiMaybeTradeCards(who);

    // --- Plan (LLM or heuristic) --------------------------------------------
    const s0 = useGameStore.getState();
    const rawPlan = await requestPlan(who);
    let plan = sanitisePlan(rawPlan, s0, who, style, ai.personaName);
    plan = {
      ...plan,
      placements: normalisePlacements(plan.placements, s0, who),
    };

    // Stream the plan summary into the panel. The ThinkingPanel will show it
    // prominently; keep the legacy `thinking` field in sync for a minute to
    // avoid a jarring empty-panel transition for old UI listeners.
    const { controller: planStreamCtrl, release: releaseStream } = registerAbort();
    try {
      await streamPlanSummary(who, plan.summary, planStreamCtrl.signal);
    } finally {
      releaseStream();
    }

    // Tiny beat before the first placement so the reader registers the plan.
    await sleep(450);

    // --- Execute placements --------------------------------------------------
    await executePlacements(who, plan.placements);

    // End reinforce -> enter attack
    {
      const s = useGameStore.getState();
      if (!s.winner && s.phase === "reinforce" && s.currentPlayer === who) {
        s.endPhase();
        await sleep(350);
      }
    }

    // --- Execute attack list, with replanning on major disruption -----------
    plan = await executeAttackQueue(who, plan, style, ai.personaName);

    // End attack -> fortify (if nothing forced it already)
    {
      const s = useGameStore.getState();
      if (!s.winner && s.phase === "attack" && s.currentPlayer === who) {
        s.endPhase();
        await sleep(300);
      }
    }

    // --- Execute fortify -----------------------------------------------------
    await executeFortify(who, plan.fortify);
  } finally {
    const cur = useGameStore.getState();
    cur.setAIThinking(false);
    cur.setPlayerActionLabel(who, "");
    runningFor.delete(who);
  }
}

// ----------------------------------------------------------------------------
// Reinforce
// ----------------------------------------------------------------------------

async function executePlacements(
  who: PlayerId,
  placements: Array<{ territory: TerritoryId; count: number }>
) {
  const store = useGameStore.getState();
  for (const p of placements) {
    if (!p.count) continue;
    const s = useGameStore.getState();
    if (s.winner || s.lifecycle !== "in-progress") return;
    if (s.currentPlayer !== who || s.phase !== "reinforce") return;
    store.setPlayerActionLabel(
      who,
      `Reinforcing ${TERRITORY_MAP[p.territory]?.name ?? p.territory} (+${p.count})`
    );
    s.aiPlaceArmies([p]);
    SFX.place();
    await sleep(ACTION_STEP_MS);
  }
  store.setPlayerActionLabel(who, "");
}

// ----------------------------------------------------------------------------
// Attack queue
// ----------------------------------------------------------------------------

/** True if a planned attack was a "major disruption" worth replanning over. */
function isMajorDisruption(
  atkBefore: number,
  atkAfter: number,
  conquered: boolean,
  defenderAtStart: number
): boolean {
  if (conquered) return false;
  // Attacker wiped down to 1 is always major.
  if (atkAfter <= 1) return true;
  // Lost >= 60% of attacker force AND had clear numerical superiority (attacker
  // had at least +2 over defender at start) — i.e. the plan was predicated on
  // winning this attack.
  const lost = atkBefore - atkAfter;
  if (atkBefore >= defenderAtStart + 2 && lost / atkBefore >= 0.6) return true;
  return false;
}

async function executeAttackQueue(
  who: PlayerId,
  initialPlan: TurnPlan,
  style: ReturnType<typeof parseStyle>,
  persona: string
): Promise<TurnPlan> {
  const store = useGameStore.getState();
  let plan = initialPlan;
  let safety = 0;
  let replansUsed = 0;
  const MAX_REPLANS = 2;

  while (safety++ < 25) {
    const s = useGameStore.getState();
    if (s.winner || s.lifecycle !== "in-progress") break;
    if (s.currentPlayer !== who || s.phase !== "attack") break;

    // Pop the next planned attack; if the queue is empty, we're done.
    const next = plan.attacks.shift();
    if (!next) break;

    // Validate mid-flight — the board may have moved since the plan was built.
    if (
      s.board.owner[next.from] !== who ||
      s.board.owner[next.to] === who ||
      s.board.armies[next.from] < 2 ||
      !TERRITORY_MAP[next.from].neighbors.includes(next.to)
    ) {
      // Stale step — silently skip to the next one.
      continue;
    }

    const fromName = TERRITORY_MAP[next.from].name;
    const toName = TERRITORY_MAP[next.to].name;
    store.setPlayerActionLabel(who, `Attacking ${toName} from ${fromName}`);

    // Snapshot the armies before we start the blitz so we can detect a badly
    // failed attack afterwards.
    const atkBefore = s.board.armies[next.from];
    const defBefore = s.board.armies[next.to];

    SFX.diceRoll();
    let blitzGuard = 0;
    let conquered = false;
    while (blitzGuard++ < 30) {
      const cur = useGameStore.getState();
      if (cur.winner || cur.lifecycle !== "in-progress") break;
      if (cur.board.owner[next.from] !== who) break;
      if (cur.board.owner[next.to] === who) {
        conquered = true;
        break;
      }
      if (cur.board.armies[next.from] < 2) break;
      const d = maxAttackDice(cur.board.armies[next.from]);
      cur.performAttack(next.from, next.to, d);
      await sleep(280);
      const after = useGameStore.getState();
      if (after.pendingConquer) {
        const pc = after.pendingConquer;
        after.moveAfterConquer(pc.from, pc.to, pc.maxMove);
        SFX.conquer();
        conquered = true;
        await sleep(260);
        break;
      }
      SFX.battleHit();
    }

    await sleep(ACTION_STEP_MS);

    // Replan check
    const atkAfter = useGameStore.getState().board.armies[next.from] ?? 0;
    if (
      replansUsed < MAX_REPLANS &&
      isMajorDisruption(atkBefore, atkAfter, conquered, defBefore)
    ) {
      replansUsed++;
      store.setPlayerActionLabel(who, "Reassessing…");
      const s2 = useGameStore.getState();
      if (s2.winner || s2.lifecycle !== "in-progress") break;
      if (s2.currentPlayer !== who || s2.phase !== "attack") break;

      const hint = `the assault on ${toName} from ${fromName} failed (${atkAfter} left).`;
      const rawReplan = await requestPlan(who, hint);
      let replan: TurnPlan;
      if (rawReplan) {
        replan = sanitisePlan(rawReplan, s2, who, style, persona);
      } else {
        // LLM replan failed — ask heuristic for a fresh attack list so the
        // turn keeps moving.
        replan = heuristicPlan(s2, who, style, persona);
      }
      // Stream the new summary over the old one.
      const { controller, release } = registerAbort();
      try {
        await streamPlanSummary(who, replan.summary, controller.signal);
      } finally {
        release();
      }
      await sleep(350);

      // Keep the existing plan's fortify if the replan doesn't propose one.
      plan = {
        summary: replan.summary,
        placements: [],
        attacks: replan.attacks,
        fortify: replan.fortify ?? plan.fortify,
      };
    }
  }

  store.setPlayerActionLabel(who, "");
  return plan;
}

// ----------------------------------------------------------------------------
// Fortify
// ----------------------------------------------------------------------------

async function executeFortify(
  who: PlayerId,
  fortify: TurnPlan["fortify"]
) {
  const s = useGameStore.getState();
  if (s.winner || s.lifecycle !== "in-progress") return;
  if (s.currentPlayer !== who || s.phase !== "fortify") return;

  if (
    fortify &&
    s.board.owner[fortify.from] === who &&
    s.board.owner[fortify.to] === who &&
    TERRITORY_MAP[fortify.from].neighbors.includes(fortify.to) &&
    s.board.armies[fortify.from] >= 2
  ) {
    const fromName = TERRITORY_MAP[fortify.from].name;
    const toName = TERRITORY_MAP[fortify.to].name;
    s.setPlayerActionLabel(who, `Fortifying ${toName} from ${fromName}`);
    await sleep(ACTION_STEP_MS);
    useGameStore.getState().performFortify(fortify.from, fortify.to, fortify.count);
  } else {
    s.setPlayerActionLabel(who, "Holding position");
    await sleep(600);
    useGameStore.getState().endPhase();
  }
  useGameStore.getState().setPlayerActionLabel(who, "");
}

// ----------------------------------------------------------------------------
// Setup & cards helpers
// ----------------------------------------------------------------------------

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

// ============================================================================
// Setup-phase one-army placement (unchanged)
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
