import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

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
export function useScrollbarWidth(ref: RefObject<HTMLElement | null>, enabled = true): number {
  const [width, setWidth] = useState(0);
  // Mirrors `width` so an unchanged measurement schedules no render.
  const widthRef = useRef(0);
  useClientLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;
    const measure = (commit: (update: () => void) => void) => {
      const next = verticalScrollbarWidth(element);
      if (next === widthRef.current) return;
      widthRef.current = next;
      commit(() => setWidth(next));
    };
    measure((update) => update());
    if (typeof ResizeObserver === "undefined") return;
    // A scrollbar appearing or disappearing resizes the content box. Rendering
    // synchronously keeps the stacked rows from painting one frame out of line.
    const observer = new ResizeObserver(() => measure(flushSync));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, enabled]);
  return enabled ? width : 0;
}
