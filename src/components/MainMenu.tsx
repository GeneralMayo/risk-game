import { Button } from "@/components/ui/button";
import { useGameStore } from "@/state/gameStore";
import { Play, BookOpen, Sparkles, Upload } from "lucide-react";

export function MainMenu({
  onStart,
  onOpenHelp,
  onOpenAIConfig,
}: {
  onStart: () => void;
  onOpenHelp: () => void;
  onOpenAIConfig: () => void;
}) {
  const loadGame = useGameStore((s) => s.loadGame);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="animate-dramatic-pop max-w-md text-center">
        <div className="mb-2 text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
          World Domination
        </div>
        <h1
          className="font-display text-8xl tracking-[0.4em] text-accent"
          style={{ textShadow: "0 2px 20px rgba(250,204,21,0.3)" }}
        >
          RISK
        </h1>

        <div className="mt-10 flex flex-col gap-2">
          <Button variant="accent" size="lg" onClick={onStart}>
            <Play className="h-4 w-4" />
            New game
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              if (!loadGame()) alert("No save found.");
            }}
          >
            <Upload className="h-4 w-4" />
            Resume saved game
          </Button>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={onOpenHelp}>
              <BookOpen className="h-4 w-4" />
              How to play
            </Button>
            <Button variant="ghost" onClick={onOpenAIConfig}>
              <Sparkles className="h-4 w-4" />
              AI strategy
            </Button>
          </div>
        </div>

        <p className="mt-8 text-[11px] text-muted-foreground">
          Play against a local model (Ollama) or two cloud LLMs (OpenAI vs
          Claude) playing as historical personas.
        </p>
      </div>
    </div>
  );
}
