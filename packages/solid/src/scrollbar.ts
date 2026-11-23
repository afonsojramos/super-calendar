import { type Accessor, createEffect, createSignal, untrack } from "solid-js";
import type { ElementRef } from "./styles";

/** The width a classic vertical scrollbar takes from `element`; 0 for overlay scrollbars. */
export function verticalScrollbarWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  const borders = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
  return Math.max(0, element.offsetWidth - element.clientWidth - (borders || 0));
}

/**
 * Track the vertical scrollbar width of the scroll container in `ref`, so rows
 * stacked above it can reserve the same space and keep their columns aligned.
 */
export function createScrollbarWidth(
  ref: ElementRef<HTMLElement | null | undefined>,
  enabled: () => boolean = () => true,
): Accessor<number> {
  const [width, setWidth] = createSignal(0);
  createEffect(enabled, (on) =>
    untrack(() => {
      const element = ref.current;
      if (!on || !element) {
        setWidth(0);
        return;
      }
      const measure = () => setWidth(verticalScrollbarWidth(element));
      measure();
      if (typeof ResizeObserver === "undefined") return;
      // A scrollbar appearing or disappearing resizes the content box.
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }),
  );
  return width;
}
