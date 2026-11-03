import { vi, type MockInstance } from "vitest";
import type { JSX } from "@solidjs/web";
import { render as renderRoot } from "@solidjs/web";
import {
  fireEvent as dispatch,
  getQueriesForElement,
  type BoundFunction,
  type queries,
} from "@testing-library/dom";
import { createSignal, flush, type Component } from "solid-js";

const roots: Array<() => void> = [];
let warnings: MockInstance;
let errors: MockInstance;

beforeEach(() => {
  warnings = vi.spyOn(console, "warn");
  errors = vi.spyOn(console, "error");
});

export function cleanup() {
  for (const dispose of roots.splice(0)) dispose();
  document.body.replaceChildren();
}

afterEach(() => {
  try {
    cleanup();
    expect(warnings).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  } finally {
    warnings.mockRestore();
    errors.mockRestore();
  }
});

export function mount(view: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.append(container);
  const dispose = renderRoot(view, container);
  roots.push(dispose);
  flush();
  const boundQueries: { [Name in keyof typeof queries]: BoundFunction<(typeof queries)[Name]> } =
    getQueriesForElement(container);
  return { container, dispose, unmount: dispose, ...boundQueries };
}

export function mountProps<T extends object>(View: Component<T>, initial: T) {
  const [props, setProps] = createSignal({ value: initial });
  return {
    ...mount(() => <View {...props().value} />),
    update: (next: Partial<T>) => {
      setProps((previous) => ({ value: { ...previous.value, ...next } }));
      flush();
    },
    rerender: (next: T) => {
      setProps({ value: next });
      flush();
    },
  };
}

export function render<View extends (props: never) => JSX.Element>(
  View: View,
  ...args: Parameters<View>
) {
  return mountProps<Parameters<View>[0]>(View, args[0]);
}

export function renderState<T, P extends object>(factory: (props: P) => T, initial: P) {
  let result!: T;
  const view = mountProps((props: P) => {
    result = factory(props);
    return null;
  }, initial);
  return { ...view, result };
}

export function act(action: () => Promise<unknown>): Promise<void>;
export function act(action: () => void): void;
export function act(action: () => void | Promise<unknown>): void | Promise<void> {
  const result = action();
  if (result instanceof Promise)
    return result.then(() => {
      flush();
    });
  flush();
}

export const fireEvent = new Proxy(dispatch, {
  apply(target, receiver, args) {
    const result = Reflect.apply(target, receiver, args);
    flush();
    return result;
  },
  get(target, property, receiver) {
    const method: unknown = Reflect.get(target, property, receiver);
    if (typeof method !== "function") return method;
    return (...args: unknown[]) => {
      const result: unknown = Reflect.apply(method, target, args);
      flush();
      return result;
    };
  },
});

export function pointer(
  target: Element | Document | Window,
  kind: "down" | "move" | "up" | "cancel",
  options: PointerEventInit = {},
) {
  target.dispatchEvent(
    new PointerEvent(`pointer${kind}`, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      ...options,
    }),
  );
  flush();
}

export function click(target: Element) {
  dispatch.click(target);
  flush();
}

export function key(target: Element, value: string, shiftKey = false) {
  dispatch.keyDown(target, { key: value, shiftKey });
  flush();
}
