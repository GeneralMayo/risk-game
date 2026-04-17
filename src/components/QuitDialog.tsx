import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function QuitDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quit to menu?</DialogTitle>
          <DialogDescription>
            Your current game will be discarded. Any in-flight AI requests will
            be cancelled.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep playing
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Quit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
