import { useEffect } from "react";
import { Platform } from "react-native";

// Minimal DOM shapes so this compiles without the TS "DOM" lib (the library
// targets React Native). Only the bits we touch are typed.
type FocusedElement = { tagName?: string; isContentEditable?: boolean } | null;
type KeyEvent = {
  key: string;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
};
type WebDocument = {
  activeElement: FocusedElement;
  addEventListener: (type: "keydown", listener: (event: KeyEvent) => void) => void;
  removeEventListener: (type: "keydown", listener: (event: KeyEvent) => void) => void;
};

const getDocument = (): WebDocument | undefined =>
  (globalThis as { document?: WebDocument }).document;

// Don't hijack arrow keys while the user is typing or moving a caret.
const isTextEntry = (element: FocusedElement): boolean => {
  const tag = element?.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element?.isContentEditable === true
  );
};

/**
 * Web-only: page the calendar with the ← / → arrow keys, standing in for the
 * horizontal swipe that the grid disables on web. No-op off web or when
 * `enabled` is false. `onPage(delta)` receives -1 (previous) or +1 (next).
 */
export function useWebPagerKeys(enabled: boolean, onPage: (delta: number) => void): void {
  useEffect(() => {
    if (Platform.OS !== "web" || !enabled) return;
    const doc = getDocument();
    if (!doc) return;
    const handler = (event: KeyEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTextEntry(doc.activeElement)) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        onPage(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPage(-1);
      }
    };
    doc.addEventListener("keydown", handler);
    return () => doc.removeEventListener("keydown", handler);
  }, [enabled, onPage]);
}
