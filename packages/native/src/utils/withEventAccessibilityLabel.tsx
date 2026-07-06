import type { EventAccessibilityLabeler } from "@super-calendar/core";
import type { RenderEvent, RenderEventArgs } from "../types";

/**
 * Wrap an event renderer so it injects a consumer's `eventAccessibilityLabel`
 * override into `RenderEventArgs.accessibilityLabel`. The built-in renderers use
 * that string in place of their default label, and custom renderers can read it
 * too. Returns the renderer unchanged when no override is set, so the common path
 * pays nothing.
 */
export function withEventAccessibilityLabel<T>(
  renderEvent: RenderEvent<T>,
  labeler: EventAccessibilityLabeler<T> | undefined,
  ampm: boolean,
): RenderEvent<T> {
  if (!labeler) return renderEvent;
  const Base = renderEvent;
  return function LabeledEvent(props: RenderEventArgs<T>) {
    return (
      <Base
        {...props}
        accessibilityLabel={labeler(props.event, {
          mode: props.mode,
          isAllDay: props.isAllDay ?? false,
          ampm,
        })}
      />
    );
  };
}
