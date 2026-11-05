import { createElement, type HTMLAttributes } from "react";

export function InertDiv(props: HTMLAttributes<HTMLDivElement>) {
  // React 18 needs a string; React 19 needs a nonempty value. The canonical
  // attribute value works in both and applies before children can take focus.
  return createElement("div", { ...props, inert: props.inert ? "inert" : undefined });
}
