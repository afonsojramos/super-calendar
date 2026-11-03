import { merge } from "solid-js";

type Defaulted<P, D> = Omit<P, keyof D> & {
  [K in keyof D]-?: K extends keyof P ? Exclude<P[K], undefined> : D[K];
};

// Solid 2's merge preserves explicit undefined. Forwarded optional calendar props
// need the same defaults as omitted props, while keeping false, zero, and empty strings.
export function withDefaults<P extends object, D extends Partial<P>>(
  fallback: D,
  props: P,
): Defaulted<P, D> {
  const resolved: Record<string, unknown> = {};
  for (const key of Object.keys(fallback)) {
    Object.defineProperty(resolved, key, {
      enumerable: true,
      get() {
        const value: unknown = Reflect.get(props, key);
        return value === undefined ? Reflect.get(fallback, key) : value;
      },
    });
  }
  return merge(props, resolved) as Defaulted<P, D>;
}
