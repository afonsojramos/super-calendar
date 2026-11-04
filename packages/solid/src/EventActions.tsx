import { type JSX } from "@solidjs/web";
import { format } from "date-fns";
import { createEffect, createSignal, createUniqueId, For, onSettled, untrack } from "solid-js";
import type { ResolvedSlot, SlotDefault } from "./slots";
import type { ElementRef } from "./styles";
import type { SolidCalendarTheme } from "./theme";

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

export function describeEventDates(event: { start: Date; end: Date }): string {
  const start = format(event.start, "yyyy-MM-dd");
  const end = format(event.end, "yyyy-MM-dd");
  return start === end ? start : `${start} - ${end}`;
}

/**
 * Open/close state for one component's actions dialog. `commit` applies an
 * action through the component's drag path and returns a matcher for the event
 * the consumer will render in its place, or null when the change was refused.
 * The dialog follows that replacement so repeated steps keep working, and
 * closes when its event disappears or can no longer be edited.
 */
export function createEventActions<E extends object>(
  events: () => readonly E[],
  actionsFor: (event: E) => EventEditAction[],
  commit: (event: E, actionId: string) => ((candidate: E) => boolean) | null,
  getEventId: () => ((event: E) => string | number) | undefined = () => undefined,
) {
  const [openEvent, setOpenEvent] = createSignal<E | null>(null);
  const [rejections, setRejections] = createSignal(0);
  let identity: { id: string | number } | null = null;
  // Read by handlers, which can run before signal writes settle.
  const openRef: ElementRef<E | null> = { current: null };
  const show = (event: E | null) => {
    openRef.current = event;
    setOpenEvent(() => event);
  };
  const triggers = new WeakMap<E, HTMLElement>();
  const dialogRef: ElementRef<HTMLDialogElement | null> = { current: null };
  const rootRef: ElementRef<HTMLElement | null> = { current: null };
  const pending: ElementRef<{
    from: E;
    events: readonly E[];
    matches: (candidate: E) => boolean;
  } | null> = { current: null };

  // The open event as the consumer renders it now: itself, or the event that
  // replaced it after an accepted change. Handlers can run after that update
  // renders but before the dialog follows it, so they resolve it here too.
  const current = (list: readonly E[], identify = untrack(getEventId)): E | undefined => {
    const event = openRef.current;
    if (!event) return undefined;
    if (identity) {
      if (!identify) return undefined;
      const id = identity.id;
      const matches = list.filter((candidate) => identify(candidate) === id);
      return matches.length === 1 ? matches[0] : undefined;
    }
    if (identify) return undefined;
    if (list.includes(event)) return event;
    const committed = pending.current;
    if (committed?.from !== event) return undefined;
    // Without stable IDs, replacing other event objects makes identity ambiguous.
    if (committed.events.some((previous) => previous !== event && !list.includes(previous)))
      return undefined;
    // A matching event that already existed is not the consumer's replacement.
    const replacements = list.filter(
      (candidate) => !committed.events.includes(candidate) && committed.matches(candidate),
    );
    return replacements.length === 1 ? replacements[0] : undefined;
  };

  // `list` comes from the caller: effect callbacks must not read props.
  const close = (restoreFocus: boolean, list = untrack(events), fallbackToRoot = false) => {
    const event = openRef.current;
    if (!event) return;
    const shown = current(list) ?? event;
    pending.current = null;
    const dialog = dialogRef.current;
    // Close before moving focus: the page behind a modal dialog is inert.
    if (dialog?.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    show(null);
    if (restoreFocus)
      onSettled(() => {
        // Back to the button that opened the dialog, or, when its event is gone
        // (moved off the page, removed), to the first control in the calendar.
        const trigger = triggers.get(shown);
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
      });
  };

  createEffect(
    () => {
      if (!openEvent()) return null;
      const list = events();
      const next = current(list, getEventId());
      return { list, next, editable: next ? actionsFor(next).length > 0 : false };
    },
    (state) => {
      if (!state || !openRef.current) return;
      // Once the events change after a commit, that change has settled.
      if (pending.current && pending.current.events !== state.list) pending.current = null;
      if (state.next && state.editable) {
        if (state.next !== openRef.current) show(state.next);
        return;
      }
      close(
        document.activeElement === document.body ||
          !!dialogRef.current?.contains(document.activeElement),
        state.list,
        true,
      );
    },
  );

  const run = (actionId: string) => {
    const list = untrack(events);
    const event = current(list);
    if (!event) return;
    openRef.current = event;
    pending.current = null;
    const matches = commit(event, actionId);
    setRejections((count) => (matches ? 0 : count + 1));
    if (matches) pending.current = { from: event, events: list, matches };
  };

  const select = (event: E, trigger: HTMLElement) => {
    const identify = untrack(getEventId);
    identity = identify ? { id: identify(event) } : null;
    setRejections(0);
    triggers.set(event, trigger);
    show(event);
  };

  return { openEvent, close, run, select, dialogRef, rootRef, rejections };
}

export function EventActionsMenu<E extends object>(props: {
  events: readonly E[];
  label: string;
  labelFor: (event: E) => string;
  descriptionFor: (event: E) => string;
  onSelect: (event: E, trigger: HTMLElement) => void;
  rootRef: ElementRef<HTMLElement | null>;
  slot: SlotFn;
  theme: SolidCalendarTheme;
}): JSX.Element {
  const [expanded, setExpanded] = createSignal(false);
  const trigger: ElementRef<HTMLButtonElement | null> = { current: null };
  const listRef: ElementRef<HTMLDivElement | null> = { current: null };
  createEffect(expanded, (open) => {
    if (open) onSettled(() => listRef.current?.querySelector<HTMLElement>("button")?.focus());
  });
  const id = createUniqueId();
  const focused: ElementRef<HTMLElement | null> = { current: null };
  createEffect(
    () => ({ events: props.events, root: props.rootRef }),
    ({ root }) =>
      onSettled(() => {
        const previous = focused.current;
        if (!previous || document.activeElement !== document.body) return;
        (previous.isConnected
          ? previous
          : trigger.current?.isConnected
            ? trigger.current
            : root.current
        )?.focus();
      }),
  );
  return (
    <>
      {props.events.length ? (
        <div
          onFocusIn={(e) => {
            focused.current = e.target as HTMLElement;
          }}
          onFocusOut={(e) => {
            if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node))
              focused.current = null;
          }}
          onKeyDown={(e) => {
            if (!expanded()) return;
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
            ref={(el) => (trigger.current = el)}
            id={id}
            type="button"
            aria-expanded={expanded() ? "true" : "false"}
            aria-controls={expanded() ? id + "-list" : undefined}
            onClick={() => setExpanded(!expanded())}
            {...props.slot("eventActionsTrigger", {
              base: { minHeight: 32, font: "inherit", cursor: "pointer" },
              themed: {
                margin: "4px 0",
                padding: "4px 10px",
                border: `1px solid ${props.theme.gridLine}`,
                borderRadius: 6,
                background: props.theme.surface,
                color: props.theme.text,
              },
            })}
          >
            {props.label}
          </button>
          {expanded() ? (
            <div
              ref={(element) => (listRef.current = element)}
              id={id + "-list"}
              role="group"
              aria-labelledby={id}
              {...props.slot("eventActionsList", {
                base: {
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  maxHeight: "min(20rem, 50vh)",
                  overflowY: "auto",
                },
                themed: {
                  padding: 4,
                  background: props.theme.surface,
                  border: `1px solid ${props.theme.gridLine}`,
                  borderRadius: 6,
                },
              })}
            >
              <For each={props.events}>
                {(event, index) => (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={props.labelFor(event)}
                    aria-describedby={id + "-" + index()}
                    onClick={() => {
                      setExpanded(false);
                      focused.current = null;
                      props.onSelect(event, trigger.current!);
                    }}
                    {...props.slot("eventAction", {
                      base: {
                        minHeight: 32,
                        font: "inherit",
                        cursor: "pointer",
                        textAlign: "left",
                      },
                      themed: {
                        padding: "6px 10px",
                        border: `1px solid ${props.theme.gridLine}`,
                        borderRadius: 6,
                        background: props.theme.surface,
                        color: props.theme.text,
                      },
                    })}
                  >
                    <span>{props.labelFor(event)}</span>
                    <small id={id + "-" + index()} style={{ display: "block" }}>
                      {props.descriptionFor(event)}
                    </small>
                  </button>
                )}
              </For>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** The modal dialog listing an event's move and resize actions. */
export function EventActionsDialog(props: {
  dialogRef: ElementRef<HTMLDialogElement | null>;
  title: string;
  description: string;
  actions: EventEditAction[];
  closeLabel: string;
  rejectedLabel: string;
  rejections: number;
  onAction: (actionId: string) => void;
  onClose: () => void;
  slot: SlotFn;
  theme: SolidCalendarTheme;
}): JSX.Element {
  const titleId = createUniqueId();
  const descriptionId = createUniqueId();
  // The action last focused, so focus stays on it when the list re-renders for a
  // moved event (rows are reused by position).
  let focusedAction: string | undefined;
  const keepFocusInside = () => {
    const dialog = props.dialogRef.current;
    if (!dialog) return;
    const kept = focusedAction
      ? dialog.querySelector<HTMLElement>(`[data-action="${focusedAction}"]`)
      : null;
    if (kept && kept !== document.activeElement) kept.focus();
    else if (!kept && !dialog.contains(document.activeElement))
      dialog.querySelector<HTMLElement>("button")?.focus();
  };

  onSettled(() => {
    const dialog = props.dialogRef.current;
    if (!dialog || dialog.open) return;
    // jsdom has no showModal; the open attribute shows it there.
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    keepFocusInside();
  });
  // Land on the first action again if the focused one goes away when the
  // dialog follows a moved event.
  createEffect(
    () => props.actions.map((action) => action.id).join(),
    () => {
      keepFocusInside();
    },
  );

  const buttonSlot = (available: boolean) =>
    props.slot("eventAction", {
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
        border: `1px solid ${props.theme.gridLine}`,
        borderRadius: 8,
        background: props.theme.surface,
        color: props.theme.text,
        fontSize: 13,
        opacity: available ? 1 : 0.5,
      },
    });

  return (
    <dialog
      ref={(element) => (props.dialogRef.current = element)}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // Other close requests (e.g. a platform back gesture) close it natively;
      // sync the state and restore focus.
      onFocusIn={(e) => {
        focusedAction = (e.target as HTMLElement).dataset.action;
      }}
      onClose={() => props.onClose()}
      onCancel={(e) => {
        e.preventDefault();
        props.onClose();
      }}
      // A click on the backdrop targets the dialog itself (the content fills it).
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
      // Arrow keys step through the actions, alongside Tab (which some
      // platforms limit to form fields and links).
      onKeyDown={(e) => {
        if (e.key === "PageUp" || e.key === "PageDown") e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          props.onClose();
          return;
        }
        moveFocus(e, e.currentTarget);
      }}
      {...props.slot("eventActions", {
        base: {
          padding: 0,
          width: "max-content",
          maxWidth: "min(22rem, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxSizing: "border-box",
        },
        themed: {
          fontFamily: props.theme.fontFamily,
          background: props.theme.surface,
          color: props.theme.text,
          border: `1px solid ${props.theme.gridLine}`,
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        },
      })}
    >
      <div style={{ display: "flex", "flex-direction": "column", gap: "6px", padding: "12px" }}>
        <p id={titleId} style={{ margin: 0, "font-weight": 600, "font-size": "14px" }}>
          {props.title}
        </p>
        {/* Announces the event's new time after an accepted change. */}
        <p
          id={descriptionId}
          aria-live="polite"
          style={{ margin: "0 0 4px", "font-size": "12px", color: props.theme.textMuted }}
        >
          {props.description}
        </p>
        <For each={props.actions} keyed={false}>
          {(action) => (
            <button
              type="button"
              data-action={action().id}
              aria-disabled={action().available ? undefined : "true"}
              onClick={() => {
                if (action().available) props.onAction(action().id);
              }}
              {...buttonSlot(action().available)}
            >
              {action().label}
            </button>
          )}
        </For>
        <div role="status" aria-atomic="true" style={{ "font-size": "13px" }}>
          <For each={props.rejections > 0 ? [props.rejections] : []}>
            {() => <span>{props.rejectedLabel}</span>}
          </For>
        </div>
        <button
          type="button"
          data-action="close"
          onClick={() => props.onClose()}
          {...buttonSlot(true)}
        >
          {props.closeLabel}
        </button>
      </div>
    </dialog>
  );
}
