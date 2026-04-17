import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Single-screen quick reference — scannable bullets over prose.
 */
export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>How to play</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] text-foreground/90">
          <Section title="Goal">
            Conquer every territory. You are <b className="text-red-400">red</b>.
          </Section>
          <Section title="Reinforce">
            Get <code>⌊terr/3⌋</code> + continent bonuses. Click owned
            territories to place.
          </Section>
          <Section title="Attack">
            Select yours (≥ 2 armies), click an adjacent enemy. Blitz until
            conquered or stop.
          </Section>
          <Section title="Fortify">
            Move armies between two adjacent owned territories once. Ends turn.
          </Section>
          <Section title="Cards">
            Conquer to draw (max 1/turn). Trade any 3 matching or
            all-different for a bonus.
          </Section>
          <Section title="Continents">
            NA +5 · SA +2 · EU +5 · AF +3 · AS +7 · AU +2
          </Section>
        </div>

        <div className="mt-2 rounded-md border border-border/40 bg-black/20 px-3 py-2 text-[11px] text-muted-foreground">
          <b className="text-foreground">Shortcuts</b> ·{" "}
          <Key>Esc</Key> deselect · <Key>Space</Key> end phase ·{" "}
          <Key>A</Key> AI strategy · <Key>C</Key> cards ·{" "}
          <Key>?</Key> this help
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-[0.2em] text-accent">
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
      {children}
    </kbd>
  );
}
