import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  /** Primary label (bold). */
  label: string;
  /** Secondary label shown next to it (muted). */
  sublabel?: string;
}

interface Props {
  value: string | null;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  error?: string | null;
  onRetry?: () => void;
  /** Tooltip shown on the trigger. */
  title?: string;
  /** Short hint shown below the select (e.g. "from fallback list"). */
  note?: string;
  className?: string;
}

/**
 * Minimal, purpose-built dropdown for the model picker. Shows:
 *  - a shimmer skeleton while loading
 *  - an inline error + retry link if a fetch failed
 *  - a clean list of options with primary + secondary label when loaded
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled,
  loading,
  loadingText = "Loading…",
  error,
  onRetry,
  title,
  note,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Loading skeleton
  if (loading) {
    return (
      <div className={cn("space-y-1", className)}>
        <div
          className="relative flex h-9 w-full items-center gap-2 overflow-hidden rounded-md border border-border bg-input px-3 text-sm"
          role="status"
          title={title}
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">{loadingText}</span>
          <span className="pointer-events-none absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        </div>
        {note && (
          <div className="text-[10px] text-muted-foreground">{note}</div>
        )}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={cn("space-y-1", className)}>
        <div className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-red-500/40 bg-red-950/30 px-3 text-sm text-red-200">
          <span className="truncate">{error}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-red-100 transition-colors hover:bg-red-900/40"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title={title}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-border bg-input px-3 text-sm transition-[border-color,background-color,box-shadow] duration-200",
          "hover:border-accent/60",
          open && "border-accent/70 ring-1 ring-accent/30",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{selected.label}</span>
            {selected.sublabel && (
              <span className="shrink-0 truncate text-xs text-muted-foreground">
                {selected.sublabel}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full animate-fade-in overflow-y-auto rounded-md border border-border bg-popover py-1 text-sm shadow-xl">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-muted-foreground">No options</div>
          ) : (
            options.map((o) => {
              const isSel = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors duration-150",
                    isSel ? "bg-secondary/60 text-foreground" : "hover:bg-secondary/40"
                  )}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{o.label}</span>
                    {o.sublabel && (
                      <span className="truncate text-[10px] text-muted-foreground">
                        {o.sublabel}
                      </span>
                    )}
                  </span>
                  {isSel && <Check className="h-4 w-4 shrink-0 text-accent" />}
                </button>
              );
            })
          )}
        </div>
      )}

      {note && (
        <div className="mt-1 text-[10px] text-muted-foreground">{note}</div>
      )}
    </div>
  );
}
