/**
 * Abstract LLM provider interface. Each concrete provider translates our
 * canonical request format into an HTTP call, and adapts the response to our
 * `LLMDecision` shape.
 *
 * The decision contract is always the same:
 *   { "thinking": "<in-character narration>", "action": {<move-specific>} }
 */

export type ProviderId = "openai" | "anthropic" | "ollama" | "heuristic";

/** A chat-capable model as shown in the New Game setup dropdown. */
export interface ModelInfo {
  id: string;
  /** Friendly display name, e.g. "GPT-4o Mini". */
  label: string;
  /** Higher = more capable / more recent. Used for sort order. */
  rank: number;
}

export type ListModelsResult =
  | { ok: true; models: ModelInfo[]; source: "api" | "fallback" }
  | { ok: false; message: string };

export interface LLMDecision {
  thinking: string;
  action: LLMAction;
}

export interface LLMPlacementAction {
  type: "reinforce";
  placements: Array<{ territory: string; count: number }>;
}
export interface LLMAttackAction {
  type: "attack";
  attacks: Array<{ from: string; to: string }>;
}
export interface LLMFortifyAction {
  type: "fortify";
  fortify: { from: string; to: string; count: number } | null;
}

/** Full-turn plan: one LLM call, then executed step-by-step by the orchestrator. */
export interface LLMTurnPlan {
  type: "plan";
  /** 1-2 sentence high-level summary, in character. */
  summary: string;
  placements: Array<{ territory: string; count: number }>;
  /** Ordered list of intended attacks — tried in order, at-most-one-conquest each. */
  attacks: Array<{ from: string; to: string }>;
  fortify: { from: string; to: string; count: number } | null;
}

export type LLMAction =
  | LLMPlacementAction
  | LLMAttackAction
  | LLMFortifyAction
  | LLMTurnPlan
  | { type: "noop" };

export interface ProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  abortSignal?: AbortSignal;
  /** Called when a 429 is observed and the provider will retry after this delay. */
  onRateLimited?: (retryInMs: number) => void;
  /** Called whenever a successful request counts against usage. */
  onUsage?: () => void;
}

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  /** Model identifier used on the wire. */
  model: string;
  /**
   * Resolve a decision as structured JSON (our contract above) or return
   * null if the call failed irrecoverably — caller will fall back to the
   * heuristic.
   */
  decide(req: ProviderRequest): Promise<LLMDecision | null>;
  /** Quick, cheap "is this API key valid?" probe. */
  validate(): Promise<{ ok: boolean; message: string }>;
  /** Fetch the list of chat-capable models for this account. */
  listModels?(): Promise<ListModelsResult>;
}

/** Parse the model output into a LLMDecision. Tolerates noise around the JSON. */
export function parseDecision(raw: string): LLMDecision | null {
  if (!raw) return null;
  let text = raw.trim();
  // Strip Markdown code fences if the model wrapped output
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    const obj = JSON.parse(text);
    return normalizeDecision(obj);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const obj = JSON.parse(match[0]);
      return normalizeDecision(obj);
    } catch {
      return null;
    }
  }
}

function normalizeDecision(raw: unknown): LLMDecision | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const thinking = typeof o.thinking === "string" ? o.thinking : "";

  // Accept either {action: {...}} or top-level placements/attacks/fortify for
  // backwards compat with the original Ollama prompt shape.
  let actionRaw: Record<string, unknown> | null = null;
  if (o.action && typeof o.action === "object") {
    actionRaw = o.action as Record<string, unknown>;
  } else {
    actionRaw = o;
  }

  // --- Turn plan (summary + placements + attacks + fortify in one response) ---
  // Recognised by the presence of a top-level "summary" string alongside any
  // of the three action buckets.
  const summaryRaw = (o.summary ?? actionRaw.summary) as unknown;
  if (typeof summaryRaw === "string" && summaryRaw.trim()) {
    const placementsRaw = Array.isArray(actionRaw.placements)
      ? actionRaw.placements
      : [];
    const attacksRaw = Array.isArray(actionRaw.attacks) ? actionRaw.attacks : [];
    const fortifyRaw = actionRaw.fortify as
      | null
      | { from?: unknown; to?: unknown; count?: unknown }
      | undefined;

    const placements = (placementsRaw as unknown[])
      .filter(
        (p): p is { territory: string; count: number } =>
          !!p &&
          typeof (p as { territory?: unknown }).territory === "string" &&
          typeof (p as { count?: unknown }).count === "number"
      )
      .map((p) => ({
        territory: p.territory,
        count: Math.max(1, Math.floor(p.count)),
      }));

    const attacks = (attacksRaw as unknown[])
      .filter(
        (a): a is { from: string; to: string } =>
          !!a &&
          typeof (a as { from?: unknown }).from === "string" &&
          typeof (a as { to?: unknown }).to === "string"
      )
      .map((a) => ({ from: a.from, to: a.to }));

    let fortify: { from: string; to: string; count: number } | null = null;
    if (
      fortifyRaw &&
      typeof fortifyRaw === "object" &&
      typeof fortifyRaw.from === "string" &&
      typeof fortifyRaw.to === "string"
    ) {
      fortify = {
        from: fortifyRaw.from,
        to: fortifyRaw.to,
        count:
          typeof fortifyRaw.count === "number"
            ? Math.max(1, Math.floor(fortifyRaw.count))
            : 1,
      };
    }

    return {
      thinking,
      action: {
        type: "plan",
        summary: summaryRaw.trim(),
        placements,
        attacks,
        fortify,
      },
    };
  }

  const placements = actionRaw.placements;
  if (Array.isArray(placements)) {
    return {
      thinking,
      action: {
        type: "reinforce",
        placements: placements
          .filter(
            (p): p is { territory: string; count: number } =>
              !!p &&
              typeof (p as { territory?: unknown }).territory === "string" &&
              typeof (p as { count?: unknown }).count === "number"
          )
          .map((p) => ({
            territory: p.territory,
            count: Math.max(1, Math.floor(p.count)),
          })),
      },
    };
  }

  const attacks = actionRaw.attacks;
  if (Array.isArray(attacks)) {
    return {
      thinking,
      action: {
        type: "attack",
        attacks: attacks
          .filter(
            (a): a is { from: string; to: string } =>
              !!a &&
              typeof (a as { from?: unknown }).from === "string" &&
              typeof (a as { to?: unknown }).to === "string"
          )
          .map((a) => ({ from: a.from, to: a.to })),
      },
    };
  }

  if ("fortify" in actionRaw) {
    const f = actionRaw.fortify as
      | null
      | { from?: unknown; to?: unknown; count?: unknown };
    if (f === null) {
      return { thinking, action: { type: "fortify", fortify: null } };
    }
    if (
      f &&
      typeof f === "object" &&
      typeof f.from === "string" &&
      typeof f.to === "string"
    ) {
      return {
        thinking,
        action: {
          type: "fortify",
          fortify: {
            from: f.from,
            to: f.to,
            count:
              typeof f.count === "number" ? Math.max(1, Math.floor(f.count)) : 1,
          },
        },
      };
    }
    return { thinking, action: { type: "fortify", fortify: null } };
  }

  return null;
}
