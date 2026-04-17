import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, type SelectOption } from "@/components/ui/select";
import { useGameStore, makePlayerAIConfig } from "@/state/gameStore";
import { PERSONAS } from "@/ai/personas";
import type {
  PlayerAIConfig,
  PlayerId,
  ProviderId,
} from "@/data/types";
import { AnthropicProvider } from "@/ai/providers/anthropic";
import { OpenAIProvider } from "@/ai/providers/openai";
import { OllamaProvider } from "@/ai/providers/ollama";
import type { ModelInfo } from "@/ai/providers/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Bot,
  Server,
  Sparkles,
  Play,
  Pencil,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types / constants
// ---------------------------------------------------------------------------

type PlayerKey = "p1" | "p2";
type ValidationState = "idle" | "pending" | "ok" | "bad";

interface PlayerForm {
  controller: "human" | "ai";
  provider: ProviderId; // "heuristic" for "None (free)"
  model: string;
  personaId: string; // "custom" = use customPrompt
  customPrompt: string;
}

const DEFAULT_MODELS: Record<ProviderId, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  ollama: "llama3.1:8b",
  heuristic: "",
};

const PROVIDER_CHOICES: Array<{
  id: ProviderId;
  label: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "openai", label: "OpenAI", sub: "GPT models", icon: OpenAIMark },
  { id: "anthropic", label: "Anthropic", sub: "Claude models", icon: ClaudeMark },
  { id: "ollama", label: "Ollama", sub: "Local", icon: Server },
  { id: "heuristic", label: "None", sub: "Built-in heuristic", icon: Sparkles },
];

// ---------------------------------------------------------------------------
// Inline brand marks (small neutral glyphs, no trademark risk)
// ---------------------------------------------------------------------------

function OpenAIMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M21.18 10.49a5.4 5.4 0 0 0-.47-4.45 5.47 5.47 0 0 0-5.89-2.62A5.46 5.46 0 0 0 10.67 1.7 5.47 5.47 0 0 0 5.3 5.54a5.4 5.4 0 0 0-3.6 2.62 5.47 5.47 0 0 0 .67 6.41 5.4 5.4 0 0 0 .46 4.45 5.47 5.47 0 0 0 5.9 2.62 5.46 5.46 0 0 0 4.13 1.71 5.47 5.47 0 0 0 5.37-3.84 5.4 5.4 0 0 0 3.6-2.62 5.47 5.47 0 0 0-.65-6.4Zm-8.14 11.26a4.06 4.06 0 0 1-2.6-.94l.13-.08 4.32-2.5a.7.7 0 0 0 .36-.62v-6.1l1.83 1.06a.07.07 0 0 1 .04.05v5.06a4.06 4.06 0 0 1-4.08 4.07Zm-8.73-3.72a4 4 0 0 1-.48-2.72l.13.08 4.32 2.5a.7.7 0 0 0 .71 0l5.28-3.05v2.11a.07.07 0 0 1-.03.06l-4.37 2.52a4.08 4.08 0 0 1-5.56-1.5Zm-1.14-9.44a4.06 4.06 0 0 1 2.12-1.79v5.17a.7.7 0 0 0 .35.62l5.26 3.03-1.83 1.06a.07.07 0 0 1-.07 0L4.67 14.12a4.08 4.08 0 0 1-1.5-5.53Zm14.97 3.48L12.86 9 14.7 7.94a.07.07 0 0 1 .07 0l4.37 2.52a4.07 4.07 0 0 1-.61 7.34v-5.18a.7.7 0 0 0-.35-.61ZM19.86 8l-.13-.08-4.31-2.5a.7.7 0 0 0-.71 0L9.43 8.47V6.36a.07.07 0 0 1 .03-.06l4.37-2.52a4.07 4.07 0 0 1 6.03 4.22ZM8.44 12.48l-1.83-1.06a.07.07 0 0 1-.04-.05V6.31a4.07 4.07 0 0 1 6.67-3.13l-.13.08-4.32 2.5a.7.7 0 0 0-.36.61Zm.99-2.14L11.78 9l2.35 1.35v2.7l-2.35 1.35-2.35-1.35Z"
      />
    </svg>
  );
}

function ClaudeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M5.5 18L9.7 7.6h2.1L16 18h-2.3l-.8-2.3H8.6L7.8 18H5.5Zm3.8-4.1h3.3l-1.6-4.7h-.1l-1.6 4.7Z"
      />
      <circle cx="18.5" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewGameSetup({ onCancel }: { onCancel: () => void }) {
  const startNewGame = useGameStore((s) => s.startNewGame);
  const setApiKey = useGameStore((s) => s.setApiKey);
  const setPersistApiKeys = useGameStore((s) => s.setPersistApiKeys);
  const apiKeys = useGameStore((s) => s.apiKeys);
  const persistKeys = useGameStore((s) => s.persistApiKeys);

  const [mode, setMode] = useState<"human-vs-ai" | "ai-vs-ai">(
    "human-vs-ai"
  );
  const [p1, setP1] = useState<PlayerForm>({
    controller: "human",
    provider: "heuristic",
    model: "",
    personaId: "washington",
    customPrompt: "",
  });
  const [p2, setP2] = useState<PlayerForm>({
    controller: "ai",
    provider: "heuristic",
    model: DEFAULT_MODELS.heuristic,
    personaId: "machiavelli",
    customPrompt: "",
  });

  // When mode toggles, pull P1 into the right shape
  useEffect(() => {
    setP1((p) => ({
      ...p,
      controller: mode === "ai-vs-ai" ? "ai" : "human",
      provider:
        mode === "ai-vs-ai" && p.provider === "heuristic"
          ? "openai"
          : p.provider,
      model:
        mode === "ai-vs-ai" && !p.model
          ? DEFAULT_MODELS[p.provider === "heuristic" ? "openai" : p.provider]
          : p.model,
    }));
  }, [mode]);

  // ----- key validation + model caches (shared per provider) ----------------
  type KeyValidation = { state: ValidationState; message: string };
  const [openaiValid, setOpenaiValid] = useState<KeyValidation>({
    state: "idle",
    message: "",
  });
  const [anthValid, setAnthValid] = useState<KeyValidation>({
    state: "idle",
    message: "",
  });
  const [ollamaValid, setOllamaValid] = useState<KeyValidation>({
    state: "idle",
    message: "",
  });

  type ModelList =
    | { state: "idle" }
    | { state: "loading" }
    | {
        state: "loaded";
        models: ModelInfo[];
        source: "api" | "fallback";
      }
    | { state: "error"; message: string };

  const [openaiModels, setOpenaiModels] = useState<ModelList>({
    state: "idle",
  });
  const [anthModels, setAnthModels] = useState<ModelList>({ state: "idle" });
  const [ollamaModels, setOllamaModels] = useState<ModelList>({
    state: "idle",
  });

  const openaiKey = apiKeys.openai ?? "";
  const anthKey = apiKeys.anthropic ?? "";

  async function validateOpenAI() {
    if (!openaiKey) {
      setOpenaiValid({ state: "bad", message: "No key entered" });
      return;
    }
    setOpenaiValid({ state: "pending", message: "Verifying…" });
    const v = await new OpenAIProvider({ apiKey: openaiKey }).validate();
    if (!v.ok) {
      setOpenaiValid({ state: "bad", message: v.message });
      return;
    }
    setOpenaiValid({ state: "ok", message: v.message });
    fetchOpenAIModels();
  }
  async function fetchOpenAIModels() {
    if (!openaiKey) return;
    setOpenaiModels({ state: "loading" });
    const r = await new OpenAIProvider({ apiKey: openaiKey }).listModels!();
    if (!r.ok) {
      setOpenaiModels({ state: "error", message: r.message });
      return;
    }
    setOpenaiModels({
      state: "loaded",
      models: r.models,
      source: r.source,
    });
    // If the currently chosen model isn't in the list, auto-select the top one.
    const top = r.models[0];
    setP1((p) =>
      p.provider === "openai" && !r.models.some((m) => m.id === p.model)
        ? { ...p, model: top?.id ?? p.model }
        : p
    );
    setP2((p) =>
      p.provider === "openai" && !r.models.some((m) => m.id === p.model)
        ? { ...p, model: top?.id ?? p.model }
        : p
    );
  }

  async function validateAnthropic() {
    if (!anthKey) {
      setAnthValid({ state: "bad", message: "No key entered" });
      return;
    }
    setAnthValid({ state: "pending", message: "Verifying…" });
    const v = await new AnthropicProvider({ apiKey: anthKey }).validate();
    if (!v.ok) {
      setAnthValid({ state: "bad", message: v.message });
      return;
    }
    setAnthValid({ state: "ok", message: v.message });
    fetchAnthModels();
  }
  async function fetchAnthModels() {
    if (!anthKey) return;
    setAnthModels({ state: "loading" });
    const r = await new AnthropicProvider({ apiKey: anthKey }).listModels!();
    if (!r.ok) {
      setAnthModels({ state: "error", message: r.message });
      return;
    }
    setAnthModels({
      state: "loaded",
      models: r.models,
      source: r.source,
    });
    const top = r.models[0];
    setP1((p) =>
      p.provider === "anthropic" && !r.models.some((m) => m.id === p.model)
        ? { ...p, model: top?.id ?? p.model }
        : p
    );
    setP2((p) =>
      p.provider === "anthropic" && !r.models.some((m) => m.id === p.model)
        ? { ...p, model: top?.id ?? p.model }
        : p
    );
  }

  async function validateOllama() {
    setOllamaValid({ state: "pending", message: "Checking…" });
    const v = await new OllamaProvider({}).validate();
    if (!v.ok) {
      setOllamaValid({ state: "bad", message: v.message });
      return;
    }
    setOllamaValid({ state: "ok", message: v.message });
    fetchOllamaModels();
  }
  async function fetchOllamaModels() {
    setOllamaModels({ state: "loading" });
    try {
      const res = await fetch("http://localhost:11434/api/tags");
      const data = await res.json();
      const models: ModelInfo[] = (data?.models ?? [])
        .map((m: { name?: string }) =>
          typeof m.name === "string"
            ? { id: m.name, label: m.name, rank: 0 }
            : null
        )
        .filter(Boolean) as ModelInfo[];
      if (!models.length) {
        setOllamaModels({
          state: "error",
          message: "No models installed — run `ollama pull llama3.1:8b`",
        });
      } else {
        setOllamaModels({ state: "loaded", models, source: "api" });
      }
    } catch (err) {
      setOllamaModels({
        state: "error",
        message: (err as Error).message,
      });
    }
  }

  // Auto-fetch Ollama models on mount if ollama is selected by either player
  const anyOllama = p1.provider === "ollama" || p2.provider === "ollama";
  const ollamaDidFetchRef = useRef(false);
  useEffect(() => {
    if (anyOllama && !ollamaDidFetchRef.current) {
      ollamaDidFetchRef.current = true;
      validateOllama();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyOllama]);

  // Which providers need keys? (heuristic and ollama don't)
  const needsOpenAIKey =
    (p1.controller === "ai" && p1.provider === "openai") ||
    (p2.controller === "ai" && p2.provider === "openai");
  const needsAnthKey =
    (p1.controller === "ai" && p1.provider === "anthropic") ||
    (p2.controller === "ai" && p2.provider === "anthropic");

  const openaiReady = openaiValid.state === "ok";
  const anthReady = anthValid.state === "ok";

  function modelsFor(prov: ProviderId): ModelList {
    if (prov === "openai") return openaiModels;
    if (prov === "anthropic") return anthModels;
    if (prov === "ollama") return ollamaModels;
    return { state: "idle" };
  }
  function refetchFor(prov: ProviderId) {
    if (prov === "openai") fetchOpenAIModels();
    else if (prov === "anthropic") fetchAnthModels();
    else if (prov === "ollama") fetchOllamaModels();
  }

  function providerReady(prov: ProviderId): boolean {
    if (prov === "heuristic") return true;
    if (prov === "ollama") return ollamaValid.state === "ok";
    if (prov === "openai") return openaiReady;
    if (prov === "anthropic") return anthReady;
    return false;
  }

  const configured = useMemo(() => {
    function ok(p: PlayerForm): boolean {
      if (p.controller === "human") return true;
      if (!providerReady(p.provider)) return false;
      if (p.provider !== "heuristic" && !p.model) return false;
      if (p.personaId === "custom" && !p.customPrompt.trim()) return false;
      return true;
    }
    return ok(p1) && ok(p2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p1, p2, openaiValid, anthValid, ollamaValid]);

  function buildAIConfig(form: PlayerForm): PlayerAIConfig | null {
    if (form.controller !== "ai") return null;
    const cfg = makePlayerAIConfig({
      personaId: form.personaId === "custom" ? "machiavelli" : form.personaId,
      provider: form.provider,
      model: form.model || DEFAULT_MODELS[form.provider],
    });
    if (form.personaId === "custom") {
      return {
        ...cfg,
        personaId: "custom",
        personaName: "Custom",
        systemPrompt: form.customPrompt.trim(),
      };
    }
    return cfg;
  }

  function start() {
    if (!configured) return;
    startNewGame({
      mode,
      humanAI: buildAIConfig(p1),
      aiAI: buildAIConfig(p2)!,
    });
  }

  return (
    <div className="flex h-full w-full items-start justify-center overflow-y-auto bg-background/60 px-6 py-8">
      <div className="w-full max-w-5xl space-y-6 animate-fade-in">
        {/* header */}
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={onCancel}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Configure
            </div>
            <h2 className="font-display text-2xl tracking-[0.25em] text-accent">
              NEW GAME
            </h2>
          </div>
        </div>

        {/* mode toggle */}
        <div className="flex items-center gap-2">
          <ToggleChip
            active={mode === "human-vs-ai"}
            onClick={() => setMode("human-vs-ai")}
            icon={<User className="h-3.5 w-3.5" />}
            label="You vs AI"
          />
          <ToggleChip
            active={mode === "ai-vs-ai"}
            onClick={() => setMode("ai-vs-ai")}
            icon={<Bot className="h-3.5 w-3.5" />}
            label="AI vs AI"
          />
        </div>

        {/* two mirrored columns */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <PlayerColumn
            playerKey="p1"
            accent="#c23b3b"
            title="Red Army"
            form={p1}
            setForm={setP1}
            allowHuman={mode === "human-vs-ai"}
            // provider shared config
            apiKeys={apiKeys}
            setApiKey={setApiKey}
            openaiValid={openaiValid}
            anthValid={anthValid}
            ollamaValid={ollamaValid}
            onValidateOpenAI={validateOpenAI}
            onValidateAnth={validateAnthropic}
            onValidateOllama={validateOllama}
            modelsFor={modelsFor}
            refetchFor={refetchFor}
          />
          <PlayerColumn
            playerKey="p2"
            accent="#3b7dc2"
            title="Blue Army"
            form={p2}
            setForm={setP2}
            allowHuman={false}
            apiKeys={apiKeys}
            setApiKey={setApiKey}
            openaiValid={openaiValid}
            anthValid={anthValid}
            ollamaValid={ollamaValid}
            onValidateOpenAI={validateOpenAI}
            onValidateAnth={validateAnthropic}
            onValidateOllama={validateOllama}
            modelsFor={modelsFor}
            refetchFor={refetchFor}
          />
        </div>

        {(needsOpenAIKey || needsAnthKey) && (
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              checked={persistKeys}
              onChange={(e) => setPersistApiKeys(e.target.checked)}
            />
            Save keys to this browser (plain text in localStorage)
          </label>
        )}

        {/* CTA */}
        <div className="sticky bottom-0 -mx-6 flex justify-center bg-gradient-to-t from-background via-background/95 to-transparent px-6 pb-2 pt-6">
          <Button
            variant="accent"
            size="lg"
            disabled={!configured}
            onClick={start}
            className={cn(
              "min-w-[200px] transition-all duration-200",
              !configured && "opacity-50"
            )}
          >
            <Play className="h-4 w-4" />
            Start game
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player column
// ---------------------------------------------------------------------------

interface ColumnProps {
  playerKey: PlayerKey;
  accent: string;
  title: string;
  form: PlayerForm;
  setForm: (f: PlayerForm | ((f: PlayerForm) => PlayerForm)) => void;
  allowHuman: boolean;
  apiKeys: { openai?: string; anthropic?: string };
  setApiKey: (id: "openai" | "anthropic", v: string) => void;
  openaiValid: { state: ValidationState; message: string };
  anthValid: { state: ValidationState; message: string };
  ollamaValid: { state: ValidationState; message: string };
  onValidateOpenAI: () => void;
  onValidateAnth: () => void;
  onValidateOllama: () => void;
  modelsFor: (p: ProviderId) =>
    | { state: "idle" }
    | { state: "loading" }
    | { state: "loaded"; models: ModelInfo[]; source: "api" | "fallback" }
    | { state: "error"; message: string };
  refetchFor: (p: ProviderId) => void;
}

function PlayerColumn({
  accent,
  title,
  form,
  setForm,
  allowHuman,
  apiKeys,
  setApiKey,
  openaiValid,
  anthValid,
  ollamaValid,
  onValidateOpenAI,
  onValidateAnth,
  onValidateOllama,
  modelsFor,
  refetchFor,
}: ColumnProps) {
  const isHuman = form.controller === "human";
  const keyVal =
    form.provider === "openai"
      ? openaiValid
      : form.provider === "anthropic"
        ? anthValid
        : form.provider === "ollama"
          ? ollamaValid
          : { state: "ok" as ValidationState, message: "" };
  const keyReady = keyVal.state === "ok";
  const needsKey =
    form.controller === "ai" &&
    (form.provider === "openai" || form.provider === "anthropic");
  const keyValue =
    form.provider === "openai"
      ? apiKeys.openai ?? ""
      : form.provider === "anthropic"
        ? apiKeys.anthropic ?? ""
        : "";
  const onValidate =
    form.provider === "openai"
      ? onValidateOpenAI
      : form.provider === "anthropic"
        ? onValidateAnth
        : onValidateOllama;
  const modelList = modelsFor(form.provider);

  const modelOptions: SelectOption[] =
    modelList.state === "loaded"
      ? modelList.models.map((m) => ({
          value: m.id,
          label: m.label,
          sublabel: m.id !== m.label ? m.id : undefined,
        }))
      : [];
  const modelLoading = modelList.state === "loading";
  const modelError =
    modelList.state === "error" ? modelList.message : null;

  return (
    <div
      className="relative space-y-4 rounded-lg border border-border/50 bg-card/30 p-4 transition-colors duration-200"
      style={{
        boxShadow: `inset 0 0 0 1px ${accent}1F`,
      }}
    >
      {/* Title bar */}
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            background: `radial-gradient(circle at 30% 30%, #fff8, ${accent} 60%, #000)`,
          }}
        />
        <h3
          className="font-display text-base tracking-[0.3em]"
          style={{ color: accent }}
        >
          {title.toUpperCase()}
        </h3>
        <div className="ml-auto flex items-center gap-1">
          {allowHuman && (
            <>
              <MiniToggle
                active={isHuman}
                onClick={() =>
                  setForm((p) => ({ ...p, controller: "human" }))
                }
                label="Human"
                icon={<User className="h-3 w-3" />}
              />
              <MiniToggle
                active={!isHuman}
                onClick={() =>
                  setForm((p) => ({
                    ...p,
                    controller: "ai",
                    provider: p.provider === "heuristic" ? "openai" : p.provider,
                    model:
                      p.model ||
                      DEFAULT_MODELS[
                        p.provider === "heuristic" ? "openai" : p.provider
                      ],
                  }))
                }
                label="AI"
                icon={<Bot className="h-3 w-3" />}
              />
            </>
          )}
        </div>
      </div>

      {isHuman ? (
        <div className="rounded-md border border-border/40 bg-black/20 p-4 text-center text-sm text-muted-foreground">
          You play this side — no configuration needed.
        </div>
      ) : (
        <>
          {/* ---- Step 1: Provider ---- */}
          <StepSection label="Provider">
            <div className="grid grid-cols-4 gap-1.5">
              {PROVIDER_CHOICES.map((choice) => {
                const Icon = choice.icon;
                const active = form.provider === choice.id;
                return (
                  <button
                    key={choice.id}
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        provider: choice.id,
                        model: DEFAULT_MODELS[choice.id],
                      }))
                    }
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[11px] transition-all duration-200",
                      active
                        ? "border-accent bg-accent/10 text-foreground shadow-[inset_0_0_0_1px_rgba(250,204,21,0.25)]"
                        : "border-border/60 text-muted-foreground hover:border-accent/50 hover:text-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        active ? "text-accent" : "text-muted-foreground"
                      )}
                    />
                    <span className="font-medium">{choice.label}</span>
                    <span className="text-[9px] text-muted-foreground">
                      {choice.sub}
                    </span>
                  </button>
                );
              })}
            </div>
          </StepSection>

          {/* ---- Step 2: API key (or local / heuristic) ---- */}
          {form.provider === "heuristic" ? null : form.provider === "ollama" ? (
            <StepSection label="Local server">
              <ServerCheckRow
                valid={ollamaValid}
                onRevalidate={onValidateOllama}
                urlLabel="http://localhost:11434"
                help="No key required. Start the Ollama desktop app."
              />
            </StepSection>
          ) : (
            <StepSection
              label={
                form.provider === "openai" ? "OpenAI key" : "Anthropic key"
              }
            >
              {keyReady ? (
                <VerifiedKeyBadge
                  providerLabel={
                    form.provider === "openai" ? "OpenAI" : "Anthropic"
                  }
                  onChange={() =>
                    form.provider === "openai"
                      ? setApiKey("openai", "")
                      : setApiKey("anthropic", "")
                  }
                />
              ) : (
                <KeyField
                  value={keyValue}
                  onChange={(v) =>
                    setApiKey(
                      form.provider === "openai" ? "openai" : "anthropic",
                      v
                    )
                  }
                  placeholder={
                    form.provider === "openai" ? "sk-…" : "sk-ant-…"
                  }
                  valid={keyVal}
                  onTest={onValidate}
                />
              )}
            </StepSection>
          )}

          {/* ---- Step 3: Model ---- */}
          {needsKey && !keyReady ? null : form.provider === "heuristic" ? null : (
            <StepSection label="Model">
              <Select
                value={form.model || null}
                options={modelOptions}
                onChange={(v) => setForm((p) => ({ ...p, model: v }))}
                placeholder="Pick a model"
                loading={modelLoading}
                loadingText="Fetching available models…"
                error={modelError}
                onRetry={() => refetchFor(form.provider)}
                note={
                  modelList.state === "loaded" &&
                  modelList.source === "fallback"
                    ? "Using a curated fallback list — the live model endpoint was unavailable."
                    : undefined
                }
              />
            </StepSection>
          )}

          {/* ---- Step 4: Persona ---- */}
          {needsKey && !keyReady ? null : form.provider === "heuristic" ||
            form.model ? (
            <StepSection label="Persona">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {PERSONAS.map((p) => {
                  const active = form.personaId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() =>
                        setForm((f) => ({ ...f, personaId: p.id }))
                      }
                      className={cn(
                        "flex flex-col gap-0.5 rounded-md border p-2 text-left transition-all duration-200",
                        active
                          ? "border-accent bg-accent/10 shadow-[inset_0_0_0_1px_rgba(250,204,21,0.25)]"
                          : "border-border/60 hover:border-accent/50"
                      )}
                    >
                      <span className="text-[12px] font-semibold">
                        {p.name}
                      </span>
                      <span className="text-[10px] leading-snug text-muted-foreground">
                        {shortTag(p.tagline)}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() =>
                    setForm((f) => ({ ...f, personaId: "custom" }))
                  }
                  className={cn(
                    "flex flex-col gap-0.5 rounded-md border p-2 text-left transition-all duration-200",
                    form.personaId === "custom"
                      ? "border-accent bg-accent/10"
                      : "border-dashed border-border/60 hover:border-accent/50"
                  )}
                >
                  <span className="flex items-center gap-1 text-[12px] font-semibold">
                    <Pencil className="h-3 w-3" />
                    Custom
                  </span>
                  <span className="text-[10px] leading-snug text-muted-foreground">
                    Write your own prompt
                  </span>
                </button>
              </div>

              {form.personaId === "custom" && (
                <Textarea
                  className="mt-2 min-h-[110px] font-mono text-xs"
                  placeholder="Describe the commander's goals, doctrine, and voice…"
                  value={form.customPrompt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, customPrompt: e.target.value }))
                  }
                />
              )}
            </StepSection>
          ) : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function StepSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 animate-fade-in">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function MiniToggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-all duration-200",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted-foreground hover:border-accent/50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ToggleChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-all duration-200",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-muted-foreground hover:border-accent/50"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function KeyField({
  value,
  onChange,
  placeholder,
  valid,
  onTest,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  valid: { state: ValidationState; message: string };
  onTest: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <Input
          type={show ? "text" : "password"}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value.trim())}
          className="h-9 flex-1 font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShow((v) => !v)}
          className="h-9"
        >
          {show ? "Hide" : "Show"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onTest}
          className="h-9"
        >
          Verify
        </Button>
      </div>
      {valid.state !== "idle" && (
        <div
          className={cn(
            "flex items-center gap-1 text-[11px]",
            valid.state === "ok"
              ? "text-green-400"
              : valid.state === "bad"
                ? "text-red-400"
                : "text-muted-foreground"
          )}
        >
          <StateIcon state={valid.state} />
          <span>{valid.message}</span>
        </div>
      )}
    </div>
  );
}

function VerifiedKeyBadge({
  providerLabel,
  onChange,
}: {
  providerLabel: string;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-green-500/40 bg-green-950/20 px-3 py-2 text-xs text-green-300">
      <span className="flex items-center gap-1.5">
        <CheckCircle2 className="h-4 w-4" />
        {providerLabel} key verified · shared across players
      </span>
      <button
        onClick={onChange}
        className="text-[11px] text-green-200/80 transition-colors hover:text-green-100"
      >
        Change
      </button>
    </div>
  );
}

function ServerCheckRow({
  valid,
  onRevalidate,
  urlLabel,
  help,
}: {
  valid: { state: ValidationState; message: string };
  onRevalidate: () => void;
  urlLabel: string;
  help: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md border border-border/50 bg-black/20 p-3 text-xs">
      <div className="min-w-0">
        <div className="font-medium">{urlLabel}</div>
        <div className="text-[10px] text-muted-foreground">{help}</div>
        {valid.state !== "idle" && (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 text-[11px]",
              valid.state === "ok"
                ? "text-green-400"
                : valid.state === "bad"
                  ? "text-red-400"
                  : "text-muted-foreground"
            )}
          >
            <StateIcon state={valid.state} />
            <span>{valid.message}</span>
          </div>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={onRevalidate}>
        {valid.state === "ok" ? "Re-check" : "Check"}
      </Button>
    </div>
  );
}

function StateIcon({ state }: { state: ValidationState }) {
  if (state === "pending")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  if (state === "ok") return <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />;
  if (state === "bad") return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
  return null;
}

/** Shorten a persona tagline to one concise line for the card. */
function shortTag(t: string): string {
  const first = t.split(".")[0].trim();
  return first.length > 70 ? first.slice(0, 70) + "…" : first;
}
