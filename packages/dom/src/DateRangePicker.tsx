import { format } from "date-fns";
import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  type DateRange,
  type DateSelectionConstraints,
  nextDateRange,
  type WeekStartsOn,
} from "@super-calendar/core";
import { MonthList, type MonthListSlot } from "./MonthList";
import { createSlots, type SlotStyleProps } from "./slots";
import { type DomCalendarTheme, mergeDomTheme } from "./theme";

/** Styleable chrome of the pickers (the calendar's own slots forward through too). */
export type DatePickerSlot = "trigger" | "popover" | "footer" | "clear";

interface PickerBaseProps
  extends DateSelectionConstraints, SlotStyleProps<DatePickerSlot | MonthListSlot> {
  /** First day of the week. Sunday = 0 (default) … Saturday = 6. */
  weekStartsOn?: WeekStartsOn;
  /** Height of the popover calendar viewport in px (default 320). */
  height?: number;
  /** Placeholder shown on the trigger when nothing is selected. */
  placeholder?: string;
  /** Disable the field and close its popover. Re-enabling leaves the popover closed. */
  disabled?: boolean;
  /** Theme overrides for the calendar. */
  theme?: Partial<DomCalendarTheme>;
  /** Class applied to the root element. */
  className?: string;
  /** Inline styles applied to the root element. */
  style?: CSSProperties;
}

const triggerDefault: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minWidth: 220,
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
};

const popoverDefault: CSSProperties = {
  position: "absolute",
  zIndex: 20,
  marginTop: 6,
  overflow: "hidden",
  borderRadius: 12,
  minWidth: 300,
};

// Where keyboard focus lands when the popover opens: the picked (or today's)
// day, else that month's roving tab stop, else an enabled day in that month. Unavailable days
// stay focusable for arrow navigation but are skipped as a starting point.
function initialPickerFocus(dialog: HTMLElement, day: string): HTMLElement | null {
  const usable = ':not([aria-disabled="true"]):not([data-outside])';
  return (
    dialog.querySelector<HTMLElement>(`[data-day="${day}"]${usable}`) ??
    dialog.querySelector<HTMLElement>(`[data-day^="${day.slice(0, 7)}"][tabindex="0"]${usable}`) ??
    dialog.querySelector<HTMLElement>(`[data-day^="${day.slice(0, 7)}"]${usable}`)
  );
}

/**
 * The shared popover shell: a trigger button and a calendar panel that closes on
 * outside-click and Escape, and returns focus to the trigger. `renderCalendar`
 * gets a close callback so a single-date pick can dismiss immediately.
 */
function usePopover(disabled: boolean | undefined) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    if (disabled) {
      setOpen(false);
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, disabled]);

  return { open: open && !disabled, setOpen, rootRef, triggerRef };
}

interface ShellProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  rootRef: React.RefObject<HTMLDivElement | null>;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  theme: DomCalendarTheme;
  slot: ReturnType<typeof createSlots<DatePickerSlot | MonthListSlot>>;
  label: string;
  hasValue: boolean;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
  /** The day (`yyyy-MM-dd`) to focus when the popover opens. */
  focusDay: string;
  children: ReactNode;
}

function PickerShell({
  open,
  setOpen,
  rootRef,
  triggerRef,
  theme,
  slot,
  label,
  hasValue,
  placeholder,
  disabled,
  className,
  style,
  ariaLabel,
  focusDay,
  children,
}: ShellProps): ReactElement {
  const dialogId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const focusDayRef = useRef(focusDay);
  focusDayRef.current = focusDay;
  // Move focus into the popover once per opening (not on every re-render), so
  // keyboard users land on a date. Wait for the intended month to mount instead
  // of focusing a neighbouring virtualized row that happens to render first.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const place = () => {
      if (dialog.contains(document.activeElement)) {
        observer.disconnect();
        return;
      }
      const target = initialPickerFocus(dialog, focusDayRef.current);
      const monthMounted = dialog.querySelector(
        `[data-day^="${focusDayRef.current.slice(0, 7)}"]:not([data-outside])`,
      );
      if (target || monthMounted) {
        (target ?? dialog).focus();
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(place);
    observer.observe(dialog, { childList: true, subtree: true });
    place();
    return () => observer.disconnect();
  }, [open]);
  return (
    <div
      ref={rootRef}
      className={className}
      style={{
        position: "relative",
        display: "inline-block",
        fontFamily: theme.fontFamily,
        ...style,
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen(!open)}
        {...slot("trigger", {
          base: triggerDefault,
          themed: {
            border: `1px solid ${theme.gridLine}`,
            background: theme.surface,
            color: hasValue ? theme.text : theme.textMuted,
            opacity: disabled ? 0.5 : 1,
          },
        })}
      >
        <span>{hasValue ? label : placeholder}</span>
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        <div
          ref={dialogRef}
          id={dialogId}
          role="dialog"
          tabIndex={-1}
          aria-label={ariaLabel}
          {...slot("popover", {
            base: popoverDefault,
            themed: { background: theme.surface, border: `1px solid ${theme.gridLine}` },
          })}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Props for {@link DatePicker}. */
export interface DatePickerProps extends PickerBaseProps {
  /** The selected day, or `null`. */
  value: Date | null;
  /** Called with the day the user picks. */
  onChange: (date: Date) => void;
  /** Format the trigger label. Default: `d MMM yyyy`. */
  formatLabel?: (date: Date) => string;
}

/**
 * A single-date input with a popover calendar. Controlled via `value` / `onChange`.
 * Composed from {@link MonthList}; forward calendar slots (e.g. `dayBadge`) through
 * `classNames` to restyle the popover.
 *
 * @example
 * ```tsx
 * const [value, setValue] = useState<Date | null>(null);
 * <DatePicker value={value} onChange={setValue} />
 * ```
 */
export function DatePicker({
  value,
  onChange,
  formatLabel = (d) => format(d, "d MMM yyyy"),
  weekStartsOn = 0,
  height = 320,
  placeholder = "Select a date",
  disabled,
  theme: themeOverrides,
  className,
  style,
  classNames,
  styles,
  minDate,
  maxDate,
  isDateDisabled,
}: DatePickerProps): ReactElement {
  const theme = mergeDomTheme(themeOverrides);
  const slot = createSlots<DatePickerSlot | MonthListSlot>({ classNames, styles });
  const { open, setOpen, rootRef, triggerRef } = usePopover(disabled);

  return (
    <PickerShell
      open={open}
      setOpen={setOpen}
      rootRef={rootRef}
      triggerRef={triggerRef}
      theme={theme}
      slot={slot}
      label={value ? formatLabel(value) : ""}
      hasValue={!!value}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      style={style}
      ariaLabel="Choose a date"
      focusDay={format(value ?? new Date(), "yyyy-MM-dd")}
    >
      <MonthList
        theme={themeOverrides}
        date={value ?? new Date()}
        weekStartsOn={weekStartsOn}
        selectedDates={value ? [value] : []}
        minDate={minDate}
        maxDate={maxDate}
        isDateDisabled={isDateDisabled}
        onPressDay={(day) => {
          onChange(day);
          setOpen(false);
          triggerRef.current?.focus();
        }}
        height={height}
        classNames={classNames}
        styles={styles}
      />
    </PickerShell>
  );
}

/** Props for {@link DateRangePicker}. */
export interface DateRangePickerProps extends PickerBaseProps {
  /** The selected range, or `null`. `end` is `null` while only the start is picked. */
  value: DateRange | null;
  /** Called with the next range on each pick (start-only, then complete). */
  onChange: (range: DateRange | null) => void;
  /** Format the trigger label. Default: `d MMM – d MMM yyyy`. */
  formatLabel?: (range: DateRange) => string;
}

function defaultRangeLabel(range: DateRange): string {
  const start = format(range.start, "d MMM yyyy");
  return range.end ? `${start} – ${format(range.end, "d MMM yyyy")}` : `${start} – …`;
}

/**
 * A date-range input with a popover calendar. Controlled via `value` / `onChange`;
 * each pick advances the range through {@link nextDateRange} (start, then end), and
 * the popover closes once both ends are set.
 *
 * @example
 * ```tsx
 * const [range, setRange] = useState<DateRange | null>(null);
 * <DateRangePicker value={range} onChange={setRange} />
 * ```
 */
export function DateRangePicker({
  value,
  onChange,
  formatLabel = defaultRangeLabel,
  weekStartsOn = 0,
  height = 320,
  placeholder = "Select dates",
  disabled,
  theme: themeOverrides,
  className,
  style,
  classNames,
  styles,
  minDate,
  maxDate,
  isDateDisabled,
}: DateRangePickerProps): ReactElement {
  const theme = mergeDomTheme(themeOverrides);
  const slot = createSlots<DatePickerSlot | MonthListSlot>({ classNames, styles });
  const { open, setOpen, rootRef, triggerRef } = usePopover(disabled);
  const constraints: DateSelectionConstraints = { minDate, maxDate, isDateDisabled };

  return (
    <PickerShell
      open={open}
      setOpen={setOpen}
      rootRef={rootRef}
      triggerRef={triggerRef}
      theme={theme}
      slot={slot}
      label={value ? formatLabel(value) : ""}
      hasValue={!!value}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      style={style}
      ariaLabel="Choose a date range"
      focusDay={format(value?.start ?? new Date(), "yyyy-MM-dd")}
    >
      <MonthList
        theme={themeOverrides}
        date={value?.start ?? new Date()}
        weekStartsOn={weekStartsOn}
        selectedRange={value ?? undefined}
        minDate={minDate}
        maxDate={maxDate}
        isDateDisabled={isDateDisabled}
        onPressDay={(day) => {
          const next = nextDateRange(value, day, constraints);
          onChange(next);
          // Close once a full range is set.
          if (next?.end) {
            setOpen(false);
            triggerRef.current?.focus();
          }
        }}
        height={height}
        classNames={classNames}
        styles={styles}
      />
      <div
        {...slot("footer", {
          base: { display: "flex", justifyContent: "flex-end", padding: "8px 10px" },
          themed: { borderTop: `1px solid ${theme.gridLine}` },
        })}
      >
        <button
          type="button"
          onClick={() => onChange(null)}
          {...slot("clear", {
            base: { border: "none", background: "transparent", cursor: "pointer", font: "inherit" },
            themed: { color: theme.textMuted },
          })}
        >
          Clear
        </button>
      </div>
    </PickerShell>
  );
}
