import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { runSelfPlayBatch, type GameReport } from "@/ai/selfPlay";
import { Brain, Play, Square } from "lucide-react";

export function SelfPlayDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [n, setN] = useState(3);
  const [status, setStatus] = useState<string>("idle");
  const [running, setRunning] = useState(false);
  const [reports, setReports] = useState<GameReport[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  async function start() {
    setRunning(true);
    setSummary(null);
    setReports([]);
    setStatus("booting…");
    try {
      const res = await runSelfPlayBatch(n, (msg) => setStatus(msg));
      setReports(res.reports);
      setSummary(res.summary);
      console.group("Self-play results");
      for (const r of res.reports) console.log(r);
      console.log("summary:", res.summary);
      console.groupEnd();
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-wood/60 leather-panel">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-accent" /> Developer Self-Play
          </DialogTitle>
          <DialogDescription>
            Run AI-vs-AI games back-to-back to verify game-engine invariants and
            balance. Each game mutates the on-screen board — you'll see it fly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Games</label>
            <Input
              type="number"
              min={1}
              max={25}
              value={n}
              onChange={(e) => setN(Math.max(1, Math.min(25, parseInt(e.target.value) || 1)))}
              className="w-20"
            />
            <Button
              size="sm"
              variant={running ? "destructive" : "accent"}
              disabled={running}
              onClick={start}
            >
              {running ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? "Running…" : "Run"}
            </Button>
          </div>

          <div className="rounded-md border border-border bg-black/40 px-3 py-2 font-mono text-xs text-muted-foreground">
            {status}
          </div>

          {summary && (
            <div className="rounded-md border border-accent/60 bg-accent/10 px-3 py-2 font-mono text-xs text-accent">
              {summary}
            </div>
          )}

          {reports.length > 0 && (
            <div className="max-h-[260px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1">#</th>
                    <th>Winner</th>
                    <th>Turns</th>
                    <th>Red</th>
                    <th>Blue</th>
                    <th>Battles</th>
                    <th>Issues</th>
                    <th>ms</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr
                      key={r.index}
                      className="border-t border-border/40"
                    >
                      <td className="py-1">{r.index}</td>
                      <td
                        className={
                          r.winner === "human"
                            ? "font-bold text-red-400"
                            : r.winner === "ai"
                              ? "font-bold text-blue-400"
                              : "text-muted-foreground"
                        }
                      >
                        {r.winner}
                      </td>
                      <td>{r.turns}</td>
                      <td>{r.humanFinalTerritories}</td>
                      <td>{r.aiFinalTerritories}</td>
                      <td>{r.totalBattles}</td>
                      <td
                        className={
                          r.assertionFailures.length > 0
                            ? "text-red-400"
                            : "text-green-400"
                        }
                      >
                        {r.assertionFailures.length}
                      </td>
                      <td>{Math.round(r.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {reports.some((r) => r.assertionFailures.length > 0) && (
                <div className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  <div className="mb-1 font-bold">Integrity issues:</div>
                  {reports
                    .flatMap((r) =>
                      r.assertionFailures.map((a) => `G${r.index}: ${a}`)
                    )
                    .slice(0, 20)
                    .map((msg, i) => (
                      <div key={i} className="font-mono">
                        · {msg}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
