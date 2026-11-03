import type { JSX } from "@solidjs/web";
import type * as CSS from "csstype";

/** Inline styles accept CSS property names or camelCase names. Numeric lengths use pixels. */
export type CSSProperties = CSS.Properties<string | number> &
  CSS.PropertiesHyphen<string | number> & {
    [key: `--${string}`]: string | number | undefined;
  };

export interface ElementRef<T> {
  current: T;
}

export type DomKeyboardEvent<T = HTMLElement> = KeyboardEvent & { currentTarget: T };
export type DomPointerEvent<T = HTMLElement> = PointerEvent & { currentTarget: T };
export type DomMouseEvent<T = HTMLElement> = MouseEvent & { currentTarget: T };

const UNITLESS = new Set([
  "animation-iteration-count",
  "aspect-ratio",
  "border-image-outset",
  "border-image-slice",
  "border-image-width",
  "column-count",
  "fill-opacity",
  "flex",
  "flex-grow",
  "flex-shrink",
  "font-weight",
  "grid-area",
  "grid-column",
  "grid-column-end",
  "grid-column-start",
  "grid-row",
  "grid-row-end",
  "grid-row-start",
  "line-height",
  "opacity",
  "order",
  "orphans",
  "scale",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-miterlimit",
  "stroke-opacity",
  "stroke-width",
  "tab-size",
  "widows",
  "z-index",
  "zoom",
  "-webkit-line-clamp",
]);

export function css(style?: CSSProperties): JSX.CSSProperties | undefined {
  if (!style) return undefined;
  const result: Record<string, string | number> = {};
  for (const [property, value] of Object.entries(style)) {
    if (value == null) continue;
    const name = property.startsWith("--")
      ? property
      : property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^ms-/, "-ms-");
    result[name] =
      typeof value === "number" && value !== 0 && !UNITLESS.has(name) && !name.startsWith("--")
        ? `${value}px`
        : value;
  }
  return result;
}
