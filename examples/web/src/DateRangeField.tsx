import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { type CalendarSlot, MonthList, useDateRange } from "@super-calendar/dom";

// A date-range <input>-style field with a popover calendar, composed entirely from
// the library's `MonthList` + `useDateRange` — the pattern most apps want on top of
// a calendar. It's an example (not a shipped component): super-calendar stays a
// headless calendar you compose the trigger/popover around. The calendar inside is
// restyled through the per-slot `classNames` API, so it matches the field's look
// without touching the theme.

const PANEL_SLOTS: Partial<Record<CalendarSlot, string>> = {
  weekdays: "border-b border-slate-100",
  weekday: "text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 py-1",
  title: "px-3 pt-2 pb-1 text-sm font-semibold text-slate-700",
  day: "transition-colors hover:bg-indigo-50",
  dayBadge:
    "text-sm rounded-full data-[selected]:bg-indigo-600 data-[selected]:text-white data-[range]:bg-indigo-100 data-[outside]:text-slate-300",
};

function label(range: { start: Date; end?: Date | null } | null): string {
  if (!range) return "Select dates";
  const start = format(range.start, "d MMM yyyy");
  if (!range.end) return `${start} → …`;
  return `${start} → ${format(range.end, "d MMM yyyy")}`;
}

export function DateRangeField() {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => new Date(), []);
  const { range, onPressDate, reset } = useDateRange({ minDate: today });
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape — the two behaviours every popover needs.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block w-80 text-slate-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium shadow-sm hover:border-slate-300"
      >
        <span className={range ? "text-slate-900" : "text-slate-400"}>{label(range)}</span>
        <span aria-hidden className="text-slate-400">
          📅
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose a date range"
          className="absolute z-10 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <MonthList
            date={today}
            minDate={today}
            weekStartsOn={1}
            selectedRange={range ?? undefined}
            onPressDay={onPressDate}
            height={320}
            classNames={PANEL_SLOTS}
          />
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={reset}
              className="text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={!range?.end}
              className="rounded-md bg-indigo-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-40"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
