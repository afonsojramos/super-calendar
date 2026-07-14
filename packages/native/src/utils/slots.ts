// Per-slot styling for the native renderer.
//
// Every component styles itself from the theme, so zero-config consumers get a
// full look with no setup. This module mirrors the dom renderer's slot contract
// for consumers who style with Tailwind classes instead: each styleable element
// is a named "slot" that accepts a `className` (resolved by a Tailwind runtime
// such as uniwind or NativeWind, which compile the library's source through the
// consumer's bundler) and/or a style override.
//
// The contract, shared with the dom renderer: a slot's *structural* styles (the
// layout the component needs to not fall apart) always apply. Its *themed*
// styles (colours, typography, spacing) apply only when no class is supplied
// for that slot; supply a class and you own those. A per-slot `styles` override
// always merges last. Without a Tailwind runtime, `className` is an unknown
// prop React Native silently ignores, so the props are safe to pass everywhere.

import type { StyleProp, TextStyle } from "react-native";

/**
 * Per-slot styling overrides. Give a slot a Tailwind class (uniwind/NativeWind)
 * and/or a style override; missing slots keep the built-in look.
 */
export interface SlotStyleProps<Slot extends string> {
  /**
   * Class names per slot. Supplying a class for a slot drops the built-in
   * *themed* styles for that slot so the class fully controls its look; the
   * *structural* styles the layout depends on are kept. Requires a Tailwind
   * runtime (uniwind, NativeWind) in the consuming app.
   */
  classNames?: Partial<Record<Slot, string>>;
  /** Style overrides per slot, merged last (win over defaults and classes). */
  styles?: Partial<Record<Slot, StyleProp<TextStyle>>>;
}

/** A slot's built-in styling, split so classes can replace the look but not the layout. */
export interface SlotDefault {
  /** Structural styles kept even when a class is supplied. */
  base?: StyleProp<TextStyle>;
  /** Themed styles (colour, type, spacing) dropped when a class is supplied. */
  themed?: StyleProp<TextStyle>;
}

/** The props a resolved slot spreads onto an element. */
export interface ResolvedSlot {
  style: StyleProp<TextStyle>;
  className?: string;
}

/**
 * Build a slot resolver for one render. `slot(name, defaults)` returns the
 * props to spread on that element: the resolved `style` array and, when the
 * consumer supplied one, a `className` for the Tailwind runtime to pick up.
 */
export function createSlots<Slot extends string>({ classNames, styles }: SlotStyleProps<Slot>) {
  return (name: Slot, defaults?: SlotDefault): ResolvedSlot => {
    const slotClass = classNames?.[name];
    return {
      style: [defaults?.base, slotClass ? undefined : defaults?.themed, styles?.[name]],
      ...(slotClass ? { className: slotClass } : null),
    };
  };
}
