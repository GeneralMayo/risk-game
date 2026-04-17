import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/state/gameStore";
import { CONTINENTS } from "@/data/board";
import {
  continentsControlledBy,
  territoriesOwnedBy,
} from "@/lib/GameLogic";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";
import type { PlayerId } from "@/data/types";
import { cn } from "@/lib/utils";
import {
  Brain,
  HelpCircle,
  Volume2,
  VolumeX,
  Sparkles,
  Menu,
  ScrollText,
  RefreshCw,
  Save,
  Upload,
  ChevronDown,
  CreditCard,
  LogOut,
} from "lucide-react";
import { ThinkingPanel } from "./ThinkingPanel";

const CONTINENT_ABBR: Record<string, string> = {
  NA: "NA",
  SA: "SA",
  EU: "EU",
  AF: "AF",
  AS: "AS",
  AU: "AU",
};

function PlayerRow({ id }: { id: PlayerId }) {
  const player = useGameStore((s) => s.players[id]);
  const board = useGameStore((s) => s.board);
  const currentPlayer = useGameStore((s) => s.currentPlayer);
  const aiThinking = useGameStore((s) => s.aiThinking);
  const owned = territoriesOwnedBy(board, id);
  const armies = owned.reduce((sum, t) => sum + board.armies[t], 0);
  const conts = continentsControlledBy(board, id);
  const isActive = currentPlayer === id;
  const accent = id === "human" ? "#c23b3b" : "#3b7dc2";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 transition-opacity",
        !isActive && "opacity-55"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-black/40"
          style={{
            background: `radial-gradient(circle at 30% 30%, #fff8, ${accent} 60%, #000)`,
          }}
        />
        <span
          className="truncate font-display text-sm tracking-widest"
          style={{ color: accent }}
        >
          {player.name}
        </span>
        {id === "ai" && aiThinking && (
          <Brain className="h-3 w-3 text-accent animate-pulse" />
        )}
      </div>

      <div className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
        <span title="Territories">{owned.length}</span>
        <span className="opacity-40">·</span>
        <span title="Armies">
          <span className="font-semibold text-foreground">{armies}</span>
          <span className="opacity-60"> armies</span>
        </span>
        {player.cards.length > 0 && (
          <>
            <span className="opacity-40">·</span>
            <span
              className="inline-flex items-center gap-0.5"
              title={`${player.cards.length} card${player.cards.length === 1 ? "" : "s"}`}
            >
              <CreditCard className="h-3 w-3 opacity-70" />
              {player.cards.length}
            </span>
          </>
        )}
      </div>

      {conts.length > 0 && (
        <div className="flex shrink-0 items-center gap-0.5">
          {conts.map((c) => (
            <span
              key={c}
              className="rounded px-1 py-px text-[9px] font-bold tracking-wider text-white"
              style={{
                background: CONTINENTS[c].color + "cc",
              }}
              title={`${CONTINENTS[c].name} · +${CONTINENTS[c].bonus}`}
            >
              {CONTINENT_ABBR[c]}+{CONTINENTS[c].bonus}
            </span>
          ))}
        </div>
      )}

      {player.armiesToPlace > 0 && (
        <span
          className="shrink-0 rounded bg-accent/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-accent"
          title="Armies left to place"
        >
          +{player.armiesToPlace}
        </span>
      )}
    </div>
  );
}

export function Sidebar({
  onOpenAIConfig,
  onOpenHelp,
  onOpenCards,
  onOpenSelfPlay,
  onQuit,
  devMode,
}: {
  onOpenAIConfig: () => void;
  onOpenHelp: () => void;
  onOpenCards: () => void;
  onOpenSelfPlay?: () => void;
  onQuit: () => void;
  devMode: boolean;
}) {
  const { log, newGame, saveGame, loadGame, players } = useGameStore();
  const [soundOn, setSoundOnState] = useState(isSoundEnabled());
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // auto-scroll log when it opens or grows
  useEffect(() => {
    if (logOpen) logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length, logOpen]);

  // close menu on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const lastLogs = log.slice(-40);

  return (
    <aside className="relative flex h-full w-full max-w-[320px] flex-col border-l border-border/60 bg-card/30 backdrop-blur-sm">
      {/* Header: logo + minimal icon buttons */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="leading-none">
          <div className="font-display text-xl tracking-[0.3em] text-accent">
            RISK
          </div>
        </div>
        <div className="flex gap-0.5 text-muted-foreground">
          <IconButton onClick={onOpenHelp} title="Help (?)">
            <HelpCircle className="h-4 w-4" />
          </IconButton>
          <IconButton
            onClick={() => {
              const next = !soundOn;
              setSoundEnabled(next);
              setSoundOnState(next);
            }}
            title={soundOn ? "Mute" : "Unmute"}
          >
            {soundOn ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </IconButton>
          <IconButton onClick={onOpenAIConfig} title="AI Strategy (A)">
            <Sparkles className="h-4 w-4 text-accent" />
          </IconButton>
          <div className="relative" ref={menuRef}>
            <IconButton
              onClick={() => setMenuOpen((o) => !o)}
              title="Game menu"
            >
              <Menu className="h-4 w-4" />
            </IconButton>
            {menuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-md border border-border bg-popover shadow-xl animate-fade-in">
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    newGame();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  New game
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    saveGame();
                  }}
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    if (!loadGame()) alert("No save found.");
                  }}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Load
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenCards();
                  }}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  View cards
                </MenuItem>
                {devMode && onOpenSelfPlay && (
                  <MenuItem
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenSelfPlay();
                    }}
                  >
                    <Brain className="h-3.5 w-3.5" />
                    Self-play…
                  </MenuItem>
                )}
                <div className="border-t border-border/40" />
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    onQuit();
                  }}
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Quit to menu
                </MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Two compact player rows */}
      <div className="mx-2 overflow-hidden rounded-md border border-border/40 bg-card/40">
        <PlayerRow id="human" />
        <div className="border-t border-border/40" />
        <PlayerRow id="ai" />
      </div>

      {/* Thinking panels (one per AI-controlled player) */}
      <div className="mx-2 mt-2 space-y-1.5">
        {players.human.ai && <ThinkingPanel playerId="human" />}
        {players.ai.ai && <ThinkingPanel playerId="ai" />}
      </div>

      {/* Unobtrusive collapsible usage bar — utility, not a feature */}
      <UsageBar />

      <div className="flex-1" />

      {/* Collapsible log drawer */}
      <div className="border-t border-border/60">
        <button
          onClick={() => setLogOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-card/40"
        >
          <span className="flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5" />
            <span className="font-display tracking-widest">Battle Log</span>
            <span className="rounded-full bg-muted/40 px-1.5 text-[10px]">
              {log.length}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              logOpen && "rotate-180"
            )}
          />
        </button>
        {logOpen && (
          <div className="log-scroll max-h-[34vh] overflow-y-auto border-t border-border/50 bg-black/30 px-3 py-2 text-[11px] leading-relaxed">
            {lastLogs.map((entry) => (
              <div
                key={entry.id}
                className={cn(
                  "mb-0.5 border-l-2 pl-2 py-0.5 animate-fade-in",
                  entry.type === "battle"
                    ? "border-red-500/60 text-red-200"
                    : entry.type === "ai"
                      ? "border-blue-400/60 text-blue-200"
                      : entry.type === "phase"
                        ? "border-accent/60 text-accent"
                        : entry.type === "victory"
                          ? "border-yellow-400/80 font-bold text-yellow-300"
                          : entry.type === "system"
                            ? "border-border text-muted-foreground"
                            : "border-border text-foreground/80"
                )}
              >
                {entry.message}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </aside>
  );
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={onClick}
      title={title}
      className="h-8 w-8"
    >
      {children}
    </Button>
  );
}

function UsageBar() {
  const providerStatus = useGameStore((s) => s.providerStatus);
  const mode = useGameStore((s) => s.mode);
  const [open, setOpen] = useState(false);
  const total =
    providerStatus.openai.usage +
    providerStatus.anthropic.usage +
    providerStatus.ollama.usage;
  if (total === 0) return null;
  return (
    <div className="mx-2 mt-2 text-[10px] text-muted-foreground/80">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded px-1.5 py-1 transition-colors duration-150 hover:bg-card/50"
      >
        <span className="uppercase tracking-[0.2em]">API · {total} calls</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            !open && "-rotate-90"
          )}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 rounded-md border border-border/30 bg-black/20 px-2 py-1.5">
          {providerStatus.openai.usage > 0 && (
            <Row label="OpenAI" v={providerStatus.openai.usage} />
          )}
          {providerStatus.anthropic.usage > 0 && (
            <Row label="Anthropic" v={providerStatus.anthropic.usage} />
          )}
          {providerStatus.ollama.usage > 0 && (
            <Row label="Ollama" v={providerStatus.ollama.usage} />
          )}
          {mode === "ai-vs-ai" && (
            <div className="mt-1 border-t border-border/30 pt-1 text-center uppercase tracking-[0.2em] text-accent/80">
              AI vs AI
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{v}</span>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground transition-colors duration-150 hover:bg-secondary/60"
    >
      {children}
    </button>
  );
}
