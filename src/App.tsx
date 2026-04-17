import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { Board } from "@/components/Board";
import { Sidebar } from "@/components/Sidebar";
import { PhaseBanner } from "@/components/PhaseBanner";
import { AIConfigDialog } from "@/components/AIConfigDialog";
import { HelpDialog } from "@/components/HelpDialog";
import { CardsDialog } from "@/components/CardsDialog";
import { ConquerDialog } from "@/components/ConquerDialog";
import { FortifyDialog } from "@/components/FortifyDialog";
import { AttackDialog } from "@/components/AttackDialog";
import { BattleResultDialog } from "@/components/BattleResultDialog";
import { HintToast } from "@/components/HintToast";
import { SelfPlayDialog } from "@/components/SelfPlayDialog";
import { MainMenu } from "@/components/MainMenu";
import { NewGameSetup } from "@/components/NewGameSetup";
import { QuitDialog } from "@/components/QuitDialog";
import { RateLimitOverlay } from "@/components/RateLimitOverlay";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGameStore } from "@/state/gameStore";
import { TERRITORY_MAP } from "@/data/board";
import { canAttack, canFortify } from "@/lib/GameLogic";
import { runAISetupPlacement, runAITurn } from "@/ai/AI";
import { SFX } from "@/lib/sound";
import type { TerritoryId } from "@/data/types";

export default function App() {
  const state = useGameStore();
  const {
    lifecycle,
    phase,
    currentPlayer,
    selectedTerritory,
    selectTerritory,
    placeArmy,
    winner,
    aiThinking,
    aiThinkingSince,
    pendingConquer,
    players,
    setAIThinking,
    showHint,
    newGame,
    quitToMenu,
    goToMenu,
  } = state;

  const [aiConfigOpen, setAIConfigOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [selfPlayOpen, setSelfPlayOpen] = useState(false);
  const [attackTarget, setAttackTarget] = useState<TerritoryId | null>(null);
  const [fortifyTarget, setFortifyTarget] = useState<TerritoryId | null>(null);
  const [quitDialogOpen, setQuitDialogOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);

  useEffect(() => {
    if (lifecycle === "in-progress" && setupOpen) setSetupOpen(false);
  }, [lifecycle, setupOpen]);

  const devMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("dev") === "true";
  }, []);

  // ----------------------------------------------------------------------
  // Defensive cleanup on phase / turn / winner transitions
  // ----------------------------------------------------------------------
  useEffect(() => {
    setAttackTarget(null);
    setFortifyTarget(null);
  }, [phase, currentPlayer, winner, lifecycle]);

  // Drop a stale selection belonging to a player who is no longer the current
  // actor, or whose territory is no longer theirs.
  useEffect(() => {
    if (!selectedTerritory) return;
    const owner = state.board.owner[selectedTerritory];
    // In AI-vs-AI mode there's no human to "select" — so any selection gets
    // cleared when an AI takes over.
    const activePlayer = players[currentPlayer];
    if (activePlayer.controller !== "human") {
      selectTerritory(null);
      return;
    }
    if (owner !== currentPlayer) selectTerritory(null);
  }, [selectedTerritory, currentPlayer, state.board.owner, selectTerritory, players]);

  // Close all secondary dialogs on game-over.
  useEffect(() => {
    if (!winner) return;
    setAttackTarget(null);
    setFortifyTarget(null);
    setAIConfigOpen(false);
    setCardsOpen(false);
    setSelfPlayOpen(false);
  }, [winner]);

  // ----------------------------------------------------------------------
  // AI watchdog — if thinking state hangs > 75s, recover.
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (!aiThinking || !aiThinkingSince) return;
    const t = setTimeout(() => {
      const s = useGameStore.getState();
      if (
        s.aiThinking &&
        s.aiThinkingSince === aiThinkingSince &&
        Date.now() - aiThinkingSince > 75_000
      ) {
        setAIThinking(false);
        s.addLog(
          "system",
          "AI took too long — recovering with the fallback heuristic."
        );
      }
    }, 76_000);
    return () => clearTimeout(t);
  }, [aiThinking, aiThinkingSince, setAIThinking]);

  // ----------------------------------------------------------------------
  // Confetti / SFX on victory
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (lifecycle !== "game-over") return;
    if (winner === "human" && players.human.controller === "human") {
      SFX.victory();
      const end = Date.now() + 1800;
      (function frame() {
        confetti({
          particleCount: 4,
          angle: 60,
          spread: 60,
          origin: { x: 0 },
          colors: ["#facc15", "#c23b3b", "#e9dcc1", "#8b5a2b"],
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 60,
          origin: { x: 1 },
          colors: ["#facc15", "#c23b3b", "#e9dcc1", "#8b5a2b"],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    } else if (winner === "ai" && players.human.controller === "human") {
      SFX.defeat();
    } else if (winner) {
      // AI vs AI — neutral flourish
      confetti({ particleCount: 60, spread: 90, origin: { y: 0.4 } });
    }
  }, [lifecycle, winner, players.human.controller]);

  // ----------------------------------------------------------------------
  // Drive AI turns for any AI-controlled active player (works for both
  // Human-vs-AI and AI-vs-AI modes).
  // ----------------------------------------------------------------------
  useEffect(() => {
    if (winner) return;
    if (lifecycle !== "in-progress") return;
    if (selfPlayOpen) return;
    const active = players[currentPlayer];
    if (active.controller !== "ai") return;
    if (aiThinking) return;
    if (phase === "setup-reinforce") runAISetupPlacement(currentPlayer);
    else if (phase === "reinforce") runAITurn(currentPlayer);
  }, [currentPlayer, phase, aiThinking, winner, selfPlayOpen, lifecycle, players]);

  // ----------------------------------------------------------------------
  // Keyboard shortcuts
  // ----------------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
      }
      if (e.key === "Escape") {
        if (lifecycle === "in-progress") {
          selectTerritory(null);
          setAttackTarget(null);
          setFortifyTarget(null);
        }
      } else if (e.key === " " || e.key === "Enter") {
        if (lifecycle === "in-progress") {
          useGameStore.getState().endPhase();
          e.preventDefault();
        }
      } else if (e.key === "?") {
        setHelpOpen((o) => !o);
      } else if (e.key.toLowerCase() === "a") {
        setAIConfigOpen((o) => !o);
      } else if (e.key.toLowerCase() === "n") {
        if (lifecycle === "menu") setSetupOpen(true);
        else if (confirm("Start a new game?")) newGame();
      } else if (e.key.toLowerCase() === "c") {
        if (lifecycle === "in-progress") setCardsOpen((o) => !o);
      } else if (e.key.toLowerCase() === "s" && devMode) {
        setSelfPlayOpen((o) => !o);
      } else if (e.key.toLowerCase() === "q") {
        if (lifecycle === "in-progress") setQuitDialogOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectTerritory, newGame, devMode, lifecycle]);

  // ----------------------------------------------------------------------
  // Territory click handler — only active when a human controls the active
  // player AND we are actually in-progress.
  // ----------------------------------------------------------------------
  function handleClick(id: TerritoryId) {
    if (winner) return;
    if (lifecycle !== "in-progress") return;
    const s = useGameStore.getState();
    if (s.players[currentPlayer].controller !== "human") {
      showHint("AI's turn — please wait.", "info");
      return;
    }
    if (pendingConquer) {
      showHint("Finish advancing armies first.", "info");
      return;
    }
    const owner = s.board.owner[id];
    const name = TERRITORY_MAP[id]?.name ?? id;

    if (phase === "setup-reinforce" || phase === "reinforce") {
      if (s.players.human.armiesToPlace <= 0) {
        showHint("No armies left to place — end the phase.", "info");
        return;
      }
      if (owner !== "human") {
        showHint(`${name} isn't yours.`, "warn");
        return;
      }
      placeArmy(id, 1);
      SFX.place();
      return;
    }

    if (phase === "attack") {
      if (!selectedTerritory) {
        if (owner !== "human") {
          showHint("Select one of your territories first.", "info");
          return;
        }
        if (s.board.armies[id] < 2) {
          showHint(`${name} needs at least 2 armies to attack.`, "info");
          return;
        }
        selectTerritory(id);
        return;
      }
      if (id === selectedTerritory) {
        selectTerritory(null);
        return;
      }
      if (owner === "human") {
        if (s.board.armies[id] < 2) {
          showHint(`${name} needs at least 2 armies to attack.`, "info");
          return;
        }
        selectTerritory(id);
        return;
      }
      if (!canAttack(s, selectedTerritory, id)) {
        const attacker = TERRITORY_MAP[selectedTerritory].name;
        if (!TERRITORY_MAP[selectedTerritory].neighbors.includes(id)) {
          showHint(`${name} isn't adjacent to ${attacker}.`, "warn");
        } else if (s.board.armies[selectedTerritory] < 2) {
          showHint(`${attacker} needs at least 2 armies.`, "warn");
        } else {
          showHint("Invalid target.", "warn");
        }
        return;
      }
      setAttackTarget(id);
      return;
    }

    if (phase === "fortify") {
      if (!selectedTerritory) {
        if (owner !== "human") {
          showHint("Select one of your territories.", "info");
          return;
        }
        if (s.board.armies[id] < 2) {
          showHint(`${name} has nothing to move.`, "info");
          return;
        }
        selectTerritory(id);
        return;
      }
      if (id === selectedTerritory) {
        selectTerritory(null);
        return;
      }
      if (owner !== "human") {
        showHint("Fortify only moves between your own territories.", "warn");
        return;
      }
      if (canFortify(s, selectedTerritory, id)) {
        setFortifyTarget(id);
        return;
      }
      const src = TERRITORY_MAP[selectedTerritory].name;
      if (!TERRITORY_MAP[selectedTerritory].neighbors.includes(id)) {
        showHint(`${name} isn't adjacent to ${src}.`, "warn");
      } else if (s.board.armies[selectedTerritory] < 2) {
        showHint(`${src} needs at least 2 armies to move any.`, "warn");
      } else {
        selectTerritory(id);
      }
    }
  }

  // ----------------------------------------------------------------------
  // Render per lifecycle
  // ----------------------------------------------------------------------

  // MENU — show main menu
  if (lifecycle === "menu" && !setupOpen) {
    return (
      <TooltipProvider delayDuration={250}>
        <div className="h-screen w-screen overflow-hidden">
          <MainMenu
            onStart={() => setSetupOpen(true)}
            onOpenHelp={() => setHelpOpen(true)}
            onOpenAIConfig={() => setAIConfigOpen(true)}
          />
          <AIConfigDialog
            open={aiConfigOpen}
            onOpenChange={setAIConfigOpen}
          />
          <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
        </div>
      </TooltipProvider>
    );
  }

  // INITIALIZING / setup wizard — shown from either menu or a live game (New Game)
  if (setupOpen) {
    return (
      <TooltipProvider delayDuration={250}>
        <div className="h-screen w-screen overflow-hidden">
          <NewGameSetup
            onCancel={() => {
              setSetupOpen(false);
              if (lifecycle !== "in-progress") goToMenu();
            }}
          />
        </div>
      </TooltipProvider>
    );
  }

  // IN_PROGRESS / PAUSED / ENDING / GAME_OVER all render the board layout.
  const isAIActing =
    !winner &&
    (players[currentPlayer].controller === "ai" || aiThinking);

  const allAI = players.human.controller === "ai";

  const victoryText = winner === "human" ? "VICTORY" : "DEFEAT";
  const aiVsAiVictoryText = winner
    ? `${players[winner].name} WINS`
    : "";

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-screen w-screen overflow-hidden">
        <main className="relative flex flex-1 flex-col gap-3 p-4">
          <PhaseBanner onOpenCards={() => setCardsOpen(true)} />

          <div className="relative flex-1">
            <Board onTerritoryClick={handleClick} aiActing={isAIActing} />
            <BattleResultDialog />
            <HintToast />
            <RateLimitOverlay />
          </div>

          {(lifecycle === "game-over" || lifecycle === "ending") && winner && (
            <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-background/85 backdrop-blur-md">
              <div className="animate-dramatic-pop text-center">
                <h2
                  className="font-display text-7xl tracking-[0.35em] text-accent"
                  style={{ textShadow: "0 2px 24px rgba(250,204,21,0.35)" }}
                >
                  {allAI ? aiVsAiVictoryText : victoryText}
                </h2>
                <p className="mt-3 text-sm uppercase tracking-[0.35em] text-muted-foreground">
                  {allAI
                    ? `${players[winner === "human" ? "ai" : "human"].name} has fallen`
                    : winner === "human"
                      ? "The world is yours"
                      : "Your forces are crushed"}
                </p>
                {lifecycle === "game-over" && (
                  <div className="mt-8 flex justify-center gap-2">
                    <Button variant="accent" onClick={() => setSetupOpen(true)}>
                      New game
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        quitToMenu();
                        setSetupOpen(false);
                      }}
                    >
                      Main menu
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        <Sidebar
          onOpenAIConfig={() => setAIConfigOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenCards={() => setCardsOpen(true)}
          onOpenSelfPlay={() => setSelfPlayOpen(true)}
          onQuit={() => setQuitDialogOpen(true)}
          devMode={devMode}
        />

        <AIConfigDialog open={aiConfigOpen} onOpenChange={setAIConfigOpen} />
        <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
        <CardsDialog open={cardsOpen} onOpenChange={setCardsOpen} />
        <QuitDialog
          open={quitDialogOpen}
          onOpenChange={setQuitDialogOpen}
          onConfirm={() => {
            setQuitDialogOpen(false);
            quitToMenu();
            setSetupOpen(false);
          }}
        />
        {devMode && (
          <SelfPlayDialog open={selfPlayOpen} onOpenChange={setSelfPlayOpen} />
        )}
        {selectedTerritory && attackTarget && !winner && (
          <AttackDialog
            from={selectedTerritory}
            to={attackTarget}
            onClose={() => setAttackTarget(null)}
          />
        )}
        {selectedTerritory && fortifyTarget && !winner && (
          <FortifyDialog
            from={selectedTerritory}
            to={fortifyTarget}
            onClose={() => setFortifyTarget(null)}
          />
        )}
        <ConquerDialog />
      </div>
    </TooltipProvider>
  );
}
