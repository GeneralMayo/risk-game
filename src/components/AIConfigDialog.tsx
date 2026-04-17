import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGameStore } from "@/state/gameStore";
import {
  Flame,
  Shield,
  Mountain,
  Dice3,
  Globe2,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PRESETS: Array<{
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  prompt: string;
}> = [
  {
    id: "balanced",
    name: "Balanced",
    icon: Globe2,
    prompt: `You are a calculating general commanding the BLUE armies in RISK.
1. Never lose a continent bonus you already own.
2. Capture Australia or South America early for an easy, defensible bonus.
3. Concentrate forces on a single front — do not spread thin.
4. Attack only when you have a clear numerical advantage (attacker ≥ defender + 2) unless you can finish a continent.
5. Trade in card sets as soon as legally allowed.
6. Eliminate the opponent when possible.
Respond ONLY with the JSON the user requests.`,
  },
  {
    id: "aggressive",
    name: "Aggressive",
    icon: Flame,
    prompt: `You are a ruthless, aggressive commander of the BLUE armies in RISK.
- Attack whenever you have any numerical advantage, even marginal.
- Prioritise eliminating the opponent over accumulating bonuses.
- Trade cards as soon as you hold a valid set.
- Never turtle. Always pressure the most vulnerable enemy front.
Respond ONLY with the JSON the user requests.`,
  },
  {
    id: "defensive",
    name: "Defensive",
    icon: Shield,
    prompt: `You are a patient, defensive commander of the BLUE armies in RISK.
- Only attack when you have at least +3 armies over the defender OR you complete a continent.
- Always reinforce the most threatened border territory.
- Hold at least 3 armies on every frontier territory.
- Trade cards only when forced (≥ 5 cards).
Respond ONLY with the JSON the user requests.`,
  },
  {
    id: "continent",
    name: "Hoarder",
    icon: Mountain,
    prompt: `You are an AI RISK player obsessed with holding continents.
- First goal: take and hold Australia (+2) or South America (+2). They have the fewest borders.
- Then: take Africa (+3), then Europe/North America.
- Never surrender an owned continent. Reinforce continent choke points first.
- Attack only when the move advances a continent goal.
Respond ONLY with the JSON the user requests.`,
  },
  {
    id: "chaos",
    name: "Chaos",
    icon: Dice3,
    prompt: `You are a gleefully unpredictable commander of the BLUE armies in RISK.
- Occasionally attack hopeless odds for the drama.
- Prefer attacks on the strongest enemy territory to break their front.
- Spread your armies widely rather than stacking.
- Pick surprising fortifies.
Respond ONLY with the JSON the user requests.`,
  },
];

export function AIConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const cfg = useGameStore((s) => s.aiConfig);
  const setAIConfig = useGameStore((s) => s.setAIConfig);

  const [useLLM, setUseLLM] = useState(cfg.useLLM);
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl);
  const [model, setModel] = useState(cfg.model);
  const [systemPrompt, setSystemPrompt] = useState(cfg.systemPrompt);
  const [temperature, setTemperature] = useState(cfg.temperature);
  const [advanced, setAdvanced] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  async function testOllama() {
    setTestStatus("Testing…");
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
      if (!res.ok) {
        setTestStatus(`Failed · HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      const names: string[] = (data.models ?? []).map(
        (m: { name: string }) => m.name
      );
      setTestStatus(
        names.length ? `Connected · ${names.join(", ")}` : "Connected · (no models)"
      );
    } catch {
      setTestStatus("Failed · Ollama not running?");
    }
  }

  function save() {
    setAIConfig({ useLLM, baseUrl, model, systemPrompt, temperature });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-wood/60 leather-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            AI strategy
          </DialogTitle>
        </DialogHeader>

        {/* Presets */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => {
            const Icon = p.icon;
            const active = systemPrompt.trim() === p.prompt.trim();
            return (
              <button
                key={p.id}
                onClick={() => setSystemPrompt(p.prompt)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-all",
                  active
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-muted-foreground hover:border-accent/60 hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {p.name}
              </button>
            );
          })}
        </div>

        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          className="min-h-[150px] font-mono text-xs"
          placeholder="Write any natural-language strategy prompt for the AI…"
        />

        {/* Advanced (collapsed by default) */}
        <button
          onClick={() => setAdvanced((a) => !a)}
          className="inline-flex items-center gap-1 self-start text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              advanced && "rotate-180"
            )}
          />
          Advanced
        </button>
        {advanced && (
          <div className="space-y-2 rounded-md border border-border/50 bg-black/20 p-3 text-xs">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={useLLM}
                onChange={(e) => setUseLLM(e.target.checked)}
              />
              Use local LLM (Ollama)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="text-xs"
              />
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="llama3.1:8b"
                className="text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted-foreground">
                Creativity · {temperature.toFixed(2)}
              </label>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={testOllama}>
                Test connection
              </Button>
              {testStatus && (
                <span className="text-[11px] text-muted-foreground">
                  {testStatus}
                </span>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="accent" onClick={save}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
