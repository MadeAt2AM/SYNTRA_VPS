import { useEffect, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")); // "01"…"12"
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));     // "00"…"59"
const PERIODS = ["AM", "PM"] as const;

function parseTo12h(time24: string): { h12: string; min: string; period: "AM" | "PM" } {
  const [hStr = "09", mStr = "00"] = (time24 || "09:00").split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  // Guard against NaN from malformed input
  const safeH = Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 9;
  const safeM = Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : 0;
  const period: "AM" | "PM" = safeH >= 12 ? "PM" : "AM";
  const h12 = safeH === 0 ? 12 : safeH > 12 ? safeH - 12 : safeH;
  return { h12: String(h12).padStart(2, "0"), min: String(safeM).padStart(2, "0"), period };
}

function to24h(h12: string, min: string, period: "AM" | "PM"): string {
  let h = parseInt(h12, 10);
  if (period === "AM") { if (h === 12) h = 0; }
  else                 { if (h !== 12) h += 12; }
  return `${String(h).padStart(2, "0")}:${min}`;
}

// ─── Scroll Column ────────────────────────────────────────────────────────────

const ITEM_H   = 36; // px — must match h-9
const SPACER_H = 72; // px — 2 items, keeps selected item centred in 180px window

function ScrollCol({
  items,
  selected,
  onSelect,
  className,
}: {
  items: readonly string[];
  selected: string;
  onSelect: (v: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = items.indexOf(selected);
    if (idx < 0) return;
    el.scrollTop = idx * ITEM_H;
  }, [selected, items]);

  return (
    <div
      ref={ref}
      className={cn(
        "h-[180px] overflow-y-auto overscroll-contain",
        // Hide scrollbar but keep functionality
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {/* Top spacer — centres first item */}
      <div style={{ height: SPACER_H }} />

      {items.map((item) => {
        const isSelected = item === selected;
        return (
          <button
            key={item}
            type="button"
            onClick={() => onSelect(item)}
            className={cn(
              "w-full flex items-center justify-center font-mono text-sm transition-all rounded-md",
              "h-9 cursor-pointer select-none",
              isSelected
                ? "text-primary font-bold scale-110"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item}
          </button>
        );
      })}

      {/* Bottom spacer — centres last item */}
      <div style={{ height: SPACER_H }} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TimePickerProps {
  /** 24-hour "HH:mm" string */
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
}

export function TimePicker({ value, onChange, className, label }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const { h12, min, period } = parseTo12h(value);

  const set = (h = h12, m = min, p = period) => onChange(to24h(h, m, p));

  const display = (() => {
    const h = parseInt(h12, 10);
    return `${h}:${min} ${period}`;
  })();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-9 w-full justify-start font-mono text-sm gap-2 px-3",
            "hover:bg-accent transition-colors",
            className,
          )}
        >
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-semibold tracking-tight">{display}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="p-0 w-[220px] overflow-hidden shadow-xl border border-border/60"
        align="start"
        sideOffset={6}
      >
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-border/50 bg-muted/30">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground text-center">
            {label ?? "Select Time"}
          </p>
          <p className="text-center font-mono text-lg font-bold tracking-tight mt-0.5">
            {display}
          </p>
        </div>

        {/* Picker body */}
        <div className="relative px-2 py-1">
          {/* Centre-line indicator */}
          <div className="pointer-events-none absolute inset-x-2 top-[calc(72px+4px)] h-9 rounded-lg bg-primary/10 border border-primary/25 z-10" />

          <div className="flex gap-0.5 items-stretch">
            {/* Hours */}
            <ScrollCol
              items={HOURS}
              selected={h12}
              onSelect={(h) => set(h)}
              className="flex-1"
            />

            {/* Separator */}
            <div className="flex items-start justify-center" style={{ paddingTop: SPACER_H + 4 }}>
              <span className="h-9 flex items-center font-mono text-base font-bold text-muted-foreground px-0.5 select-none">
                :
              </span>
            </div>

            {/* Minutes */}
            <ScrollCol
              items={MINUTES}
              selected={min}
              onSelect={(m) => set(h12, m)}
              className="flex-1"
            />

            {/* Divider */}
            <div className="w-px bg-border/40 mx-1 self-stretch" />

            {/* AM / PM */}
            <div className="flex flex-col justify-center gap-1 py-2 w-10">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set(h12, min, p)}
                  className={cn(
                    "h-8 rounded-md text-xs font-bold transition-all font-mono",
                    p === period
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer confirm */}
        <div className="border-t border-border/50 px-3 py-2 bg-muted/20">
          <Button
            size="sm"
            className="w-full h-8 text-xs font-semibold"
            onClick={() => setOpen(false)}
          >
            Confirm {display}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
