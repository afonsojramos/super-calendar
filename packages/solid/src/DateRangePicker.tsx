import { type JSX } from "@solidjs/web";
import {
  type DateRange,
  type DateSelectionConstraints,
  nextDateRange,
  type WeekStartsOn,
} from "@super-calendar/core/vanilla";
import { format } from "date-fns";
import { createEffect, createMemo, createSignal, createUniqueId, untrack } from "solid-js";
import { MonthList, type MonthListSlot } from "./MonthList";
import { withDefaults } from "./props";
import { createSlots, type SlotStyleProps } from "./slots";
import { css, type CSSProperties, type ElementRef } from "./styles";
import { mergeSolidTheme, type SolidCalendarTheme } from "./theme";

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
  theme?: Partial<SolidCalendarTheme>;
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

/**
 * The shared popover shell: a trigger button and a calendar panel that closes on
 * outside-click and Escape, and returns focus to the trigger. `renderCalendar`
 * gets a close callback so a single-date pick can dismiss immediately.
 */
function createPopover(disabled: () => boolean | undefined) {
  const [open, setOpen] = createSignal(false);
  const rootRef: ElementRef<HTMLDivElement | null> = {
    current: null,
  };
  const triggerRef: ElementRef<HTMLButtonElement | null> = {
    current: null,
  };
  createEffect(
    () => [open(), disabled()],
    () =>
      untrack(() => {
        if (!open()) return;
        if (disabled()) {
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
      }),
  );
  return {
    open: () => open() && !disabled(),
    setOpen,
    rootRef,
    triggerRef,
  };
}
interface ShellProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  rootRef: ElementRef<HTMLDivElement | null>;
  triggerRef: ElementRef<HTMLButtonElement | null>;
  theme: SolidCalendarTheme;
  slot: ReturnType<typeof createSlots<DatePickerSlot | MonthListSlot>>;
  label: string;
  hasValue: boolean;
  placeholder: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
  children: JSX.Element;
}
function PickerShell(props: ShellProps): JSX.Element {
  const dialogId = createUniqueId();
  return (
    <div
      ref={(el) => (props.rootRef.current = el)}
      class={props.className}
      style={css({
        position: "relative",
        display: "inline-block",
        fontFamily: props.theme.fontFamily,
        ...props.style,
      })}
    >
      <button
        ref={(el) => (props.triggerRef.current = el)}
        type="button"
        disabled={props.disabled}
        aria-haspopup="dialog"
        aria-expanded={props.open == null ? undefined : props.open ? "true" : "false"}
        aria-controls={props.open ? dialogId : undefined}
        onClick={() => props.setOpen(!props.open)}
        {...props.slot("trigger", {
          base: triggerDefault,
          themed: {
            border: `1px solid ${props.theme.gridLine}`,
            background: props.theme.surface,
            color: props.hasValue ? props.theme.text : props.theme.textMuted,
            opacity: props.disabled ? 0.5 : 1,
          },
        })}
      >
        <span>{props.hasValue ? props.label : props.placeholder}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {props.open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-label={props.ariaLabel}
          {...props.slot("popover", {
            base: popoverDefault,
            themed: {
              background: props.theme.surface,
              border: `1px solid ${props.theme.gridLine}`,
            },
          })}
        >
          {props.children}
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
 * const [value, setValue] = createSignal<Date | null>(null);
 * <DatePicker value={value} onChange={setValue} />
 * ```
 */
export function DatePicker(incoming: DatePickerProps): JSX.Element {
  const props = withDefaults(
    {
      formatLabel: (d) => format(d, "d MMM yyyy"),
      weekStartsOn: 0,
      height: 320,
      placeholder: "Select a date",
    } satisfies Partial<DatePickerProps>,
    incoming,
  );
  const theme = createMemo(() => mergeSolidTheme(props.theme));
  const slot = createSlots<DatePickerSlot | MonthListSlot>(props);
  const { open, setOpen, rootRef, triggerRef } = createPopover(() => props.disabled);
  return (
    <PickerShell
      open={open()}
      setOpen={setOpen}
      rootRef={rootRef}
      triggerRef={triggerRef}
      theme={theme()}
      slot={slot}
      label={props.value ? props.formatLabel(props.value) : ""}
      hasValue={!!props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      className={props.className}
      style={props.style}
      ariaLabel="Choose a date"
    >
      <MonthList
        theme={props.theme}
        date={props.value ?? new Date()}
        weekStartsOn={props.weekStartsOn}
        selectedDates={props.value ? [props.value] : []}
        minDate={props.minDate}
        maxDate={props.maxDate}
        isDateDisabled={props.isDateDisabled}
        onPressDay={(day) => {
          props.onChange(day);
          setOpen(false);
          triggerRef.current?.focus();
        }}
        height={props.height}
        classNames={props.classNames}
        styles={props.styles}
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
 * const [range, setRange] = createSignal<DateRange | null>(null);
 * <DateRangePicker value={range} onChange={setRange} />
 * ```
 */
export function DateRangePicker(incoming: DateRangePickerProps): JSX.Element {
  const props = withDefaults(
    {
      formatLabel: defaultRangeLabel,
      weekStartsOn: 0,
      height: 320,
      placeholder: "Select dates",
    } satisfies Partial<DateRangePickerProps>,
    incoming,
  );
  const theme = createMemo(() => mergeSolidTheme(props.theme));
  const slot = createSlots<DatePickerSlot | MonthListSlot>(props);
  const { open, setOpen, rootRef, triggerRef } = createPopover(() => props.disabled);
  const constraints = createMemo<DateSelectionConstraints>(() => ({
    minDate: props.minDate,
    maxDate: props.maxDate,
    isDateDisabled: props.isDateDisabled,
  }));
  return (
    <PickerShell
      open={open()}
      setOpen={setOpen}
      rootRef={rootRef}
      triggerRef={triggerRef}
      theme={theme()}
      slot={slot}
      label={props.value ? props.formatLabel(props.value) : ""}
      hasValue={!!props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      className={props.className}
      style={props.style}
      ariaLabel="Choose a date range"
    >
      <MonthList
        theme={props.theme}
        date={props.value?.start ?? new Date()}
        weekStartsOn={props.weekStartsOn}
        selectedRange={props.value ?? undefined}
        minDate={props.minDate}
        maxDate={props.maxDate}
        isDateDisabled={props.isDateDisabled}
        onPressDay={(day) => {
          const next = nextDateRange(props.value, day, constraints());
          props.onChange(next);
          // Close once a full range is set.
          if (next?.end) {
            setOpen(false);
            triggerRef.current?.focus();
          }
        }}
        height={props.height}
        classNames={props.classNames}
        styles={props.styles}
      />
      <div
        {...slot("footer", {
          base: {
            display: "flex",
            justifyContent: "flex-end",
            padding: "8px 10px",
          },
          themed: {
            borderTop: `1px solid ${theme().gridLine}`,
          },
        })}
      >
        <button
          type="button"
          onClick={() => props.onChange(null)}
          {...slot("clear", {
            base: {
              border: "none",
              background: "transparent",
              cursor: "pointer",
              font: "inherit",
            },
            themed: {
              color: theme().textMuted,
            },
          })}
        >
          Clear
        </button>
      </div>
    </PickerShell>
  );
}
