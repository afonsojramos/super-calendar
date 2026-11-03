import { Dynamic, type JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onSettled, untrack } from "solid-js";

interface VirtualListProps<T> {
  data: readonly T[];
  keyExtractor: (item: T) => string;
  estimatedItemSize: number;
  initialScrollIndex?: number;
  style?: JSX.CSSProperties;
  renderItem: (props: { item: T }) => JSX.Element;
}

function rowAt(offsets: number[], top: number): number {
  let lo = 0;
  let hi = Math.max(0, offsets.length - 2);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (offsets[mid] <= top) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Variable-height windowing shared by the month list and agenda. */
export function VirtualList<T>(props: VirtualListProps<T>): JSX.Element {
  let viewport: HTMLDivElement | undefined;
  const heights = new Map<string, number>();
  const [revision, setRevision] = createSignal(0);
  const initial = untrack(() => Math.max(0, props.initialScrollIndex ?? 0));
  const [top, setTop] = createSignal(untrack(() => initial * props.estimatedItemSize));
  const [height, setHeight] = createSignal(480);
  const items = createMemo(
    () => new Map(props.data.map((item) => [props.keyExtractor(item), item])),
  );
  const keys = createMemo(() => [...items().keys()]);
  const offsets = createMemo(() => {
    revision();
    const out = [0];
    for (const key of keys())
      out.push(out[out.length - 1] + (heights.get(key) ?? props.estimatedItemSize));
    return out;
  });
  const range = createMemo(() => ({
    start: Math.max(0, rowAt(offsets(), top()) - 2),
    end: Math.min(keys().length, rowAt(offsets(), top() + height()) + 3),
  }));
  const positions = createMemo(() => new Map(keys().map((key, i) => [key, offsets()[i]])));

  createEffect(keys, (current) => {
    const retained = new Set(current);
    for (const key of heights.keys()) if (!retained.has(key)) heights.delete(key);
  });

  onSettled(() => {
    if (!viewport) return;
    viewport.scrollTop = offsets()[Math.min(initial, Math.max(0, keys().length - 1))] ?? 0;
    setTop(viewport.scrollTop);
    const measure = () => {
      if (viewport) setHeight(viewport.clientHeight || 480);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(viewport);
    return () => observer?.disconnect();
  });

  const Row = (row: { id: string }): JSX.Element => {
    let element: HTMLDivElement | undefined;
    onSettled(() => {
      if (!element) return;
      const measure = () => {
        if (!element) return;
        const next = element.getBoundingClientRect().height;
        const before = heights.get(row.id) ?? props.estimatedItemSize;
        if (next <= 0 || Math.abs(next - before) < 0.5) return;
        const position = positions().get(row.id) ?? 0;
        // Keep the visible row anchored when an earlier row's measured height changes.
        if (viewport && position + before <= viewport.scrollTop) {
          viewport.scrollTop += next - before;
          setTop(viewport.scrollTop);
        }
        heights.set(row.id, next);
        setRevision((value) => value + 1);
      };
      measure();
      const observer =
        typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
      observer?.observe(element);
      return () => observer?.disconnect();
    });
    return (
      <div
        ref={(value) => {
          element = value;
        }}
        data-virtual-row={row.id}
        style={{ position: "absolute", top: `${positions().get(row.id) ?? 0}px`, width: "100%" }}
      >
        <Dynamic component={props.renderItem} item={items().get(row.id)!} />
      </div>
    );
  };

  return (
    <div
      ref={(value) => {
        viewport = value;
      }}
      data-virtual-list
      style={{ ...props.style, position: "relative", "overflow-anchor": "none" }}
      onScroll={(event) => setTop(event.currentTarget.scrollTop)}
    >
      <div style={{ position: "relative", height: `${offsets().at(-1) ?? 0}px` }}>
        <For each={keys().slice(range().start, range().end)}>{(key) => <Row id={key} />}</For>
      </div>
    </div>
  );
}
