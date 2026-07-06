// Per-slot styling for the DOM renderer.
//
// Every component styles itself with inline styles driven by the theme object, so
// zero-config consumers get a full look with no stylesheet. But inline styles beat
// external CSS, so a Tailwind (or plain CSS) class can't override them. This module
// closes that gap: each styleable element is a named "slot" that accepts a `class`
// and/or an inline `style` override.
//
// The contract: a slot's *structural* styles (the layout the component needs to not
// fall apart -- grid templates, flex, positioning) always apply. Its *themed* styles
// (colours, typography, spacing, borders) apply only when no class is supplied for
// that slot; supply a class and you own those, so your Tailwind classes win instead
// of losing to inline styles. A per-slot inline `style` override always merges last.

import type { CSSProperties } from "react";

/** Join truthy class names (a dependency-free clsx-lite). */
export function cn(...parts: Array<string | false | null | undefined>): string | undefined {
  const out = parts.filter(Boolean).join(" ");
  return out || undefined;
}

/**
 * Per-slot styling overrides. Give a slot a Tailwind/CSS class and/or an inline
 * style; missing slots keep the built-in look.
 */
export interface SlotStyleProps<Slot extends string> {
  /**
   * Class names per slot (e.g. Tailwind). Supplying a class for a slot drops the
   * built-in *themed* inline styles for that slot so the class fully controls its
   * look; the *structural* styles the layout depends on are kept.
   */
  classNames?: Partial<Record<Slot, string>>;
  /** Inline style overrides per slot, merged last (win over defaults and classes). */
  styles?: Partial<Record<Slot, CSSProperties>>;
}

/** A slot's built-in styling, split so classes can replace the look but not the layout. */
export interface SlotDefault {
  /** Structural styles kept even when a class is supplied. */
  base?: CSSProperties;
  /** Themed styles (colour, type, spacing) dropped when a class is supplied. */
  themed?: CSSProperties;
}

/** The props a resolved slot spreads onto an element. */
export interface ResolvedSlot {
  className: string | undefined;
  style: CSSProperties | undefined;
  "data-slot": string;
}

/**
 * Build a slot resolver for one render. `slot(name, defaults)` returns the props to
 * spread on that element: a merged `className`, the resolved inline `style`, and a
 * stable `data-slot` hook for CSS/testing.
 */
export function createSlots<Slot extends string>({ classNames, styles }: SlotStyleProps<Slot>) {
  return (name: Slot, defaults?: SlotDefault): ResolvedSlot => {
    const slotClass = classNames?.[name];
    const override = styles?.[name];
    const style: CSSProperties = {
      ...defaults?.base,
      ...(slotClass ? undefined : defaults?.themed),
      ...override,
    };
    return {
      className: cn(slotClass),
      // Omit an empty style object so the DOM stays clean when a slot has no styles.
      style: Object.keys(style).length ? style : undefined,
      "data-slot": name,
    };
  };
}

/**
 * Turn a map of boolean state flags into present/absent `data-*` attributes, so
 * consumers can target state with CSS/Tailwind variants (e.g. `data-[today]:...`).
 * A true flag renders the attribute (empty value); a false/undefined one omits it.
 */
export function dataState(
  flags: Record<string, boolean | undefined>,
): Record<string, "" | undefined> {
  const out: Record<string, "" | undefined> = {};
  for (const key in flags) if (flags[key]) out[key] = "";
  return out;
}
