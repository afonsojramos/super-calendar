import { vi } from "vitest";
// Reanimated 4's built-in mock pulls in the native worklets module, which throws
// in the test renderer. Mock just the hooks/components our code uses: run worklets inline
// and treat animated views as plain views.
// Gesture Handler reaches for a native TurboModule on import, which isn't
// registered in the test renderer. Mock the bits our grid uses: a passthrough
// GestureDetector and a chainable Gesture builder (every method returns the
// builder, so `Gesture.Pan().enabled(x).onStart(fn)` works without natives).
// Each builder also records the callbacks it is given, and every builder made
// during a test is pushed to `__gestures`, so a test can drive a gesture
// directly: `__gestures.at(-1).handlers.onStart({ x, y })`.
// RNGH drops the handlers of a detector that unmounts, so a finger still on the
// screen sends them no further events, not even `onFinalize`. The detector
// stand-in marks each gesture it carried as `dropped` when it unmounts, so a
// test can release only the gestures a device would still deliver to.
vi.mock("react-native-gesture-handler", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  const gestures = [];
  // `kind` and `args` are the constructor name and arguments (`Gesture.Race(pan,
  // tap)` records kind "Race" with the two chains), so a test can check how
  // gestures were composed.
  const makeChain = (kind, args) => {
    const handlers = {};
    const calls = {};
    const meta = { dropped: false };
    const chain = new Proxy(() => chain, {
      get: (_target, prop) =>
        prop === "handlers"
          ? handlers
          : prop === "calls"
            ? calls
            : prop === "kind"
              ? kind
              : prop === "args"
                ? args
                : prop === "meta"
                  ? meta
                  : (...methodArgs) => {
                      calls[prop] = methodArgs;
                      const callback = methodArgs.find((arg) => typeof arg === "function");
                      if (callback) handlers[prop] = callback;
                      return chain;
                    },
    });
    gestures.push(chain);
    return chain;
  };
  return {
    __esModule: true,
    GestureDetector: function GestureDetector({ gesture, children }) {
      const carried = React.useRef(new Set());
      const mark = (chain) => {
        if (typeof chain !== "function" || !chain.meta) return;
        carried.current.add(chain);
        for (const arg of chain.args ?? []) {
          for (const inner of Array.isArray(arg) ? arg : [arg]) mark(inner);
        }
      };
      mark(gesture);
      React.useEffect(
        () => () => {
          for (const chain of carried.current) chain.meta.dropped = true;
        },
        [],
      );
      return children;
    },
    GestureHandlerRootView: View,
    Gesture: new Proxy(
      {},
      {
        get:
          (_target, kind) =>
          (...args) =>
            makeChain(kind, args),
      },
    ),
    __gestures: gestures,
  };
});

vi.mock("react-native-reanimated", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  const reactions = [];
  const jsQueue = [];
  let deferJS = false;
  const flushAnimatedReactions = () => {
    // Snapshot the list because callbacks can mount components and register more reactions.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const reaction of [...reactions]) {
      const next = reaction.prepare();
      const previous = reaction.previous;
      reaction.previous = next;
      if (next !== previous) reaction.react(next, previous);
    }
  };
  // Records `scrollTo` calls on globalThis so a test can assert programmatic
  // vertical scrolls.
  const ScrollView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      scrollTo: (arg) => {
        (globalThis.__scrollToCalls = globalThis.__scrollToCalls || []).push(arg);
      },
      getScrollableNode: () => null,
    }));
    return React.createElement(View, props);
  });
  return {
    __esModule: true,
    default: { View, ScrollView, createAnimatedComponent: (component) => component },
    useAnimatedStyle: (factory) => factory(),
    useDerivedValue: (factory) => {
      const factoryRef = React.useRef(factory);
      factoryRef.current = factory;
      const valueRef = React.useRef();
      if (!valueRef.current) {
        valueRef.current = Object.defineProperty({}, "value", {
          configurable: true,
          get: () => factoryRef.current(),
        });
      }
      return valueRef.current;
    },
    useSharedValue: (initial) => React.useRef({ value: initial }).current,
    useAnimatedRef: () => React.useRef(null),
    useAnimatedReaction: (prepare, react) => {
      const reactionRef = React.useRef();
      if (!reactionRef.current) {
        const current = prepare();
        reactionRef.current = { prepare, react, previous: current };
        reactions.push(reactionRef.current);
        react(current, null);
      } else {
        reactionRef.current.prepare = prepare;
        reactionRef.current.react = react;
      }
    },
    useAnimatedScrollHandler:
      ({ onScroll }) =>
      ({ nativeEvent }) =>
        onScroll(nativeEvent),
    useReducedMotion: () => false,
    runOnJS:
      (fn) =>
      (...args) => {
        if (deferJS) jsQueue.push(() => fn(...args));
        else fn(...args);
      },
    __jsQueue: jsQueue,
    __deferRunOnJS: (enabled) => {
      deferJS = enabled;
      jsQueue.length = 0;
    },
    scrollTo: () => {},
    __reactions: reactions,
    __flushAnimatedReactions: flushAnimatedReactions,
  };
});

// The time grid's pager is LegendList's Reanimated flavour. Like the plain
// LegendList stand-ins in the component tests, render only the initial page
// through `renderItem` (the real list can't lay out in the test renderer) and expose the
// props on `globalThis.__listProps` for assertions.
// With `globalThis.__virtualizedPager` set, it virtualizes like the real list
// instead: `scrollToIndex` moves it, and it mounts, keyed by `keyExtractor`, the
// pages within `drawDistance` of that page plus the `alwaysRender` indices, so a
// page scrolled out of reach unmounts with everything on it.
vi.mock("@legendapp/list/reanimated", async () => {
  const React = await import("react");
  return {
    __esModule: true,
    AnimatedLegendList: React.forwardRef((props, ref) => {
      // A scroll event moves the list's live offset, as the real list's scroll
      // handler does, before the grid's own handler sees it.
      const scrollOffset = props.sharedValues?.scrollOffset;
      globalThis.__listProps =
        props.onScroll && scrollOffset
          ? {
              ...props,
              onScroll: (event) => {
                scrollOffset.value = event.nativeEvent.contentOffset.x;
                props.onScroll(event);
              },
            }
          : props;
      const [scrolledIndex, setScrolledIndex] = React.useState(props.initialScrollIndex ?? 0);
      // Expose the imperative API the grid drives (scrollToIndex), recording calls
      // on globalThis so a test can assert the fast-fling re-anchor.
      React.useImperativeHandle(ref, () => ({
        scrollToIndex: (arg) => {
          (globalThis.__scrollToIndexCalls = globalThis.__scrollToIndexCalls || []).push(arg);
          if (globalThis.__virtualizedPager) setScrolledIndex(arg.index);
        },
      }));
      // Count mounts so a test can assert the list is resized in place, not remounted.
      React.useEffect(() => {
        globalThis.__listMounts = (globalThis.__listMounts || 0) + 1;
      }, []);
      if (globalThis.__virtualizedPager) {
        const itemSize = props.getFixedItemSize?.() ?? 0;
        const reach = itemSize > 0 ? Math.floor((props.drawDistance ?? 0) / itemSize) : 0;
        const indices = new Set(props.alwaysRender?.indices ?? []);
        for (let offset = -reach; offset <= reach; offset++) indices.add(scrolledIndex + offset);
        return [...indices]
          .filter((index) => props.data?.[index] !== undefined)
          .sort((a, b) => a - b)
          .map((index) =>
            React.createElement(
              React.Fragment,
              { key: props.keyExtractor(props.data[index], index) },
              props.renderItem({ item: props.data[index], index }),
            ),
          );
      }
      const index = props.initialScrollIndex ?? 0;
      const item = props.data?.[index];
      return item === undefined ? null : props.renderItem({ item, index });
    }),
  };
});
