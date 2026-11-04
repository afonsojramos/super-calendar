import { type ReactElement, type RefObject, useEffect, useId, useRef, useState } from "react";
import type { ResolvedSlot, SlotDefault } from "./slots";
import type { DomCalendarTheme } from "./theme";

/** Styleable parts of the built-in move and resize actions. */
export type EventActionsSlot =
  | "eventActionsTrigger"
  | "eventActionsList"
  | "eventActions"
  | "eventAction";

/** One move or resize the actions dialog offers. */
export interface EventEditAction {
  id: string;
  label: string;
  /** False when the change is refused before reaching `onDragEvent` (e.g. below one step). */
  available: boolean;
}

function moveFocus(event: { key: string; preventDefault(): void }, container: HTMLElement | null) {
  const buttons = [...(container?.querySelectorAll<HTMLElement>("button") ?? [])];
  const index = buttons.indexOf(document.activeElement as HTMLElement);
  const target =
    event.key === "ArrowDown"
      ? buttons[(index + 1) % buttons.length]
      : event.key === "ArrowUp"
        ? buttons[index < 0 ? buttons.length - 1 : (index - 1 + buttons.length) % buttons.length]
        : event.key === "Home"
          ? buttons[0]
          : event.key === "End"
            ? buttons[buttons.length - 1]
            : undefined;
  if (!target) return;
  event.preventDefault();
  target.focus();
}

type SlotFn = (name: EventActionsSlot, defaults?: SlotDefault) => ResolvedSlot;

/**
 * Open/close state for one component's actions dialog. `commit` applies an
 * action through the component's drag path and returns a matcher for the event
 * the consumer will render in its place, or null when the change was refused.
 * The dialog follows that replacement so repeated steps keep working, and
 * closes when its event disappears or can no longer be edited.
 */
export function useEventActions<E extends object>(
  events: readonly E[],
  actionsFor: (event: E) => EventEditAction[],
  commit: (event: E, actionId: string) => ((candidate: E) => boolean) | null,
) {
  const [openEvent, setOpenEvent] = useState<E | null>(null);
  // Read by handlers that can run before the next render (see `current`).
  const openRef = useRef<E | null>(null);
  const show = (event: E | null) => {
    openRef.current = event;
    setOpenEvent(event);
  };
  const triggers = useRef(new WeakMap<E, HTMLElement>());
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pending = useRef<{
    from: E;
    events: readonly E[];
    matches: (candidate: E) => boolean;
  } | null>(null);

  // The open event as the consumer renders it now: itself, or the event that
  // replaced it after an accepted change. Handlers can run after that update
  // renders but before the dialog follows it, so they resolve it here too.
  const current = (): E | undefined => {
    const event = openRef.current;
    if (!event) return undefined;
    if (events.includes(event)) return event;
    const committed = pending.current;
    if (committed?.from !== event) return undefined;
    // Without stable IDs, replacing other event objects makes identity ambiguous.
    if (committed.events.some((previous) => previous !== event && !events.includes(previous)))
      return undefined;
    // A matching event that already existed is not the consumer's replacement.
    const replacements = events.filter(
      (candidate) => !committed.events.includes(candidate) && committed.matches(candidate),
    );
    return replacements.length === 1 ? replacements[0] : undefined;
  };

  const close = (restoreFocus: boolean, fallbackToRoot = false) => {
    const event = openRef.current;
    if (!event) return;
    const shown = current() ?? event;
    pending.current = null;
    const dialog = dialogRef.current;
    // Close before moving focus: the page behind a modal dialog is inert.
    if (dialog?.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    if (restoreFocus) {
      // Back to the button that opened the dialog, or, when its event is gone
      // (moved off the page, removed), to the first control in the calendar.
      const trigger = triggers.current.get(shown);
      (fallbackToRoot
        ? rootRef.current
        : trigger?.isConnected
          ? trigger
          : ([
              ...(rootRef.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), [tabindex="0"]',
              ) ?? []),
            ].find((element) => !dialog?.contains(element)) ?? rootRef.current)
      )?.focus();
    }
    show(null);
  };

  useEffect(() => {
    if (!openRef.current) return;
    const next = current();
    // Once the events change after a commit, that change has settled.
    if (pending.current && pending.current.events !== events) pending.current = null;
    if (next && actionsFor(next).length > 0) {
      if (next !== openEvent) show(next);
      return;
    }
    close(
      document.activeElement === document.body ||
        !!dialogRef.current?.contains(document.activeElement),
      true,
    );
  });

  const run = (actionId: string) => {
    const event = current();
    if (!event) return;
    openRef.current = event;
    pending.current = null;
    const matches = commit(event, actionId);
    if (matches) pending.current = { from: event, events, matches };
  };

  const select = (event: E, trigger: HTMLElement) => {
    triggers.current.set(event, trigger);
    show(event);
  };

  return { openEvent, close, run, select, dialogRef, rootRef };
}

export function EventActionsMenu<E extends object>({
  events,
  label,
  labelFor,
  descriptionFor,
  onSelect,
  rootRef,
  slot,
  theme,
}: {
  events: readonly E[];
  label: string;
  labelFor: (event: E) => string;
  descriptionFor: (event: E) => string;
  onSelect: (event: E, trigger: HTMLElement) => void;
  rootRef: RefObject<HTMLElement | null>;
  slot: SlotFn;
  theme: DomCalendarTheme;
}): ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (expanded) listRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [expanded]);
  const id = useId();
  const focused = useRef<HTMLElement | null>(null);
  const keys = useRef(new WeakMap<E, number>());
  const nextKey = useRef(0);
  const keyFor = (event: E) => {
    let key = keys.current.get(event);
    if (key === undefined) {
      key = nextKey.current++;
      keys.current.set(event, key);
    }
    return key;
  };
  useEffect(() => {
    const previous = focused.current;
    if (!previous || document.activeElement !== document.body) return;
    (previous.isConnected ? previous : (trigger.current ?? rootRef.current))?.focus();
  });
  if (!events.length) return null;
  return (
    <div
      onFocusCapture={(e) => {
        focused.current = e.target as HTMLElement;
      }}
      onBlurCapture={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node))
          focused.current = null;
      }}
      onKeyDown={(e) => {
        if (!expanded) return;
        if (e.key !== "Escape") {
          moveFocus(e, listRef.current);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        setExpanded(false);
        trigger.current?.focus();
      }}
    >
      <button
        ref={trigger}
        id={id}
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? id + "-list" : undefined}
        onClick={() => setExpanded(!expanded)}
        {...slot("eventActionsTrigger", {
          base: { minHeight: 32, font: "inherit", cursor: "pointer" },
          themed: {
            margin: "4px 0",
            padding: "4px 10px",
            border: `1px solid ${theme.gridLine}`,
            borderRadius: 6,
            background: theme.surface,
            color: theme.text,
          },
        })}
      >
        {label}
      </button>
      {expanded ? (
        <div
          ref={listRef}
          id={id + "-list"}
          role="group"
          aria-labelledby={id}
          {...slot("eventActionsList", {
            base: {
              display: "flex",
              flexDirection: "column",
              gap: 4,
              maxHeight: "min(20rem, 50vh)",
              overflowY: "auto",
            },
            themed: {
              padding: 4,
              background: theme.surface,
              border: `1px solid ${theme.gridLine}`,
              borderRadius: 6,
            },
          })}
        >
          {events.map((event, index) => (
            <button
              key={keyFor(event)}
              type="button"
              aria-haspopup="dialog"
              aria-label={labelFor(event)}
              aria-describedby={id + "-" + index}
              onClick={() => {
                setExpanded(false);
                focused.current = null;
                onSelect(event, trigger.current!);
              }}
              {...slot("eventAction", {
                base: { minHeight: 32, font: "inherit", cursor: "pointer", textAlign: "left" },
                themed: {
                  padding: "6px 10px",
                  border: `1px solid ${theme.gridLine}`,
                  borderRadius: 6,
                  background: theme.surface,
                  color: theme.text,
                },
              })}
            >
              <span>{labelFor(event)}</span>
              <small id={id + "-" + index} style={{ display: "block" }}>
                {descriptionFor(event)}
              </small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The modal dialog listing an event's move and resize actions. */
export function EventActionsDialog({
  dialogRef,
  title,
  description,
  actions,
  closeLabel,
  onAction,
  onClose,
  slot,
  theme,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  description: string;
  actions: EventEditAction[];
  closeLabel: string;
  onAction: (actionId: string) => void;
  onClose: () => void;
  slot: SlotFn;
  theme: DomCalendarTheme;
}): ReactElement {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    // jsdom has no showModal; the open attribute shows it there.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }, [dialogRef]);

  // Keep focus inside: land on the first action when opening, and again if the
  // focused action goes away when the dialog follows a moved event.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement))
      dialog.querySelector<HTMLElement>("button")?.focus();
  });

  const buttonSlot = (available: boolean) =>
    slot("eventAction", {
      base: {
        display: "block",
        width: "100%",
        minHeight: 32,
        boxSizing: "border-box",
        textAlign: "left",
        font: "inherit",
        cursor: available ? "pointer" : "default",
      },
      themed: {
        padding: "6px 10px",
        border: `1px solid ${theme.gridLine}`,
        borderRadius: 8,
        background: theme.surface,
        color: theme.text,
        fontSize: 13,
        opacity: available ? 1 : 0.5,
      },
    });

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // Other close requests (e.g. a platform back gesture) close it natively;
      // sync the state and restore focus.
      onClose={() => onClose()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the backdrop targets the dialog itself (the content fills it).
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      // Arrow keys step through the actions, alongside Tab (which some
      // platforms limit to form fields and links).
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
          return;
        }
        moveFocus(e, e.currentTarget);
      }}
      {...slot("eventActions", {
        base: {
          padding: 0,
          width: "max-content",
          maxWidth: "min(22rem, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxSizing: "border-box",
        },
        themed: {
          fontFamily: theme.fontFamily,
          background: theme.surface,
          color: theme.text,
          border: `1px solid ${theme.gridLine}`,
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        },
      })}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12 }}>
        <p id={titleId} style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>
          {title}
        </p>
        {/* Announces the event's new time after an accepted change. */}
        <p
          id={descriptionId}
          aria-live="polite"
          style={{ margin: "0 0 4px", fontSize: 12, color: theme.textMuted }}
        >
          {description}
        </p>
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            data-action={action.id}
            aria-disabled={action.available ? undefined : true}
            onClick={() => {
              if (action.available) onAction(action.id);
            }}
            {...buttonSlot(action.available)}
          >
            {action.label}
          </button>
        ))}
        <button type="button" data-action="close" onClick={() => onClose()} {...buttonSlot(true)}>
          {closeLabel}
        </button>
      </div>
    </dialog>
  );
}
