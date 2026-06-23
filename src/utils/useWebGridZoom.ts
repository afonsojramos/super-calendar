import { useEffect } from "react";
import { Platform } from "react-native";
import type { SharedValue } from "react-native-reanimated";

// Minimal DOM shapes so this compiles without the TS "DOM" lib (the library
// targets React Native). Only the bits we touch are typed.
type WheelEventLike = {
  ctrlKey: boolean;
  metaKey: boolean;
  deltaY: number;
  preventDefault: () => void;
};
type WheelTarget = {
  addEventListener: (
    type: "wheel",
    listener: (event: WheelEventLike) => void,
    options?: { passive?: boolean },
  ) => void;
  removeEventListener: (type: "wheel", listener: (event: WheelEventLike) => void) => void;
};

// A scroll notch scales the row height by this ratio; matching pinch's feel.
const ZOOM_SENSITIVITY = 0.002;

/**
 * Web-only: zoom the time grid with Ctrl/Cmd + scroll, standing in for the pinch
 * gesture that web has no equivalent of. `target` is the grid's host node — on
 * web a React Native View ref resolves to its DOM element. No-op off web, when
 * `enabled` is false, or before the node mounts. Plain scroll is left untouched.
 */
export function useWebGridZoom(
  enabled: boolean,
  target: { current: unknown },
  cellHeight: SharedValue<number>,
  committedCellHeight: SharedValue<number>,
  minHeight: number,
  maxHeight: number,
): void {
  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return;
    const node = target.current as WheelTarget | null;
    if (!node) return;
    const handler = (event: WheelEventLike) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      // Exponential so each notch scales by a constant ratio, like pinch.
      const next = Math.min(
        maxHeight,
        Math.max(minHeight, cellHeight.value * Math.exp(-event.deltaY * ZOOM_SENSITIVITY)),
      );
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      cellHeight.value = next;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      committedCellHeight.value = next;
    };
    node.addEventListener("wheel", handler, { passive: false });
    return () => node.removeEventListener("wheel", handler);
  }, [enabled, target, cellHeight, committedCellHeight, minHeight, maxHeight]);
}
