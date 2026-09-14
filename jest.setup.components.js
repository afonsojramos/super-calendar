// Reanimated 4's built-in mock pulls in the native worklets module, which throws
// under Jest. Mock just the hooks/components our code uses: run worklets inline
// and treat animated views as plain views.
// Gesture Handler reaches for a native TurboModule on import, which isn't
// registered under Jest. Mock the bits our grid uses: a passthrough
// GestureDetector and a chainable Gesture builder (every method returns the
// builder, so `Gesture.Pan().enabled(x).onStart(fn)` works without natives).
// Each builder also records the callbacks it is given, and every builder made
// during a test is pushed to `__gestures`, so a test can drive a gesture
// directly: `__gestures.at(-1).handlers.onStart({ x, y })`.
jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  const gestures = [];
  const makeChain = () => {
    const handlers = {};
    const calls = {};
    const chain = new Proxy(() => chain, {
      get: (_target, prop) =>
        prop === "handlers"
          ? handlers
          : prop === "calls"
            ? calls
            : (...args) => {
                calls[prop] = args;
                const callback = args.find((arg) => typeof arg === "function");
                if (callback) handlers[prop] = callback;
                return chain;
              },
    });
    gestures.push(chain);
    return chain;
  };
  return {
    __esModule: true,
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: View,
    Gesture: new Proxy({}, { get: () => () => makeChain() }),
    __gestures: gestures,
  };
});

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View } = require("react-native");
  const reactions = [];
  const flushAnimatedReactions = () => {
    for (const reaction of [...reactions]) {
      const next = reaction.prepare();
      const previous = reaction.previous;
      reaction.previous = next;
      if (next !== previous) reaction.react(next, previous);
    }
  };
  return {
    __esModule: true,
    default: { View, ScrollView: View, createAnimatedComponent: (component) => component },
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
    useAnimatedRef: () => ({ current: null }),
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
    useAnimatedScrollHandler: () => () => {},
    useReducedMotion: () => false,
    runOnJS: (fn) => fn,
    scrollTo: () => {},
    __reactions: reactions,
    __flushAnimatedReactions: flushAnimatedReactions,
  };
});

// The time grid's pager is LegendList's Reanimated flavour. Like the plain
// LegendList stand-ins in the component tests, render only the initial page
// through `renderItem` (the real list can't lay out under Jest) and expose the
// props on `globalThis.__listProps` for assertions.
jest.mock("@legendapp/list/reanimated", () => {
  const React = require("react");
  return {
    __esModule: true,
    AnimatedLegendList: React.forwardRef((props, ref) => {
      globalThis.__listProps = props;
      // Expose the imperative API the grid drives (scrollToIndex), recording calls
      // on globalThis so a test can assert the fast-fling re-anchor.
      React.useImperativeHandle(ref, () => ({
        scrollToIndex: (arg) => {
          (globalThis.__scrollToIndexCalls = globalThis.__scrollToIndexCalls || []).push(arg);
        },
      }));
      const index = props.initialScrollIndex ?? 0;
      const item = props.data?.[index];
      return item === undefined ? null : props.renderItem({ item, index });
    }),
  };
});
