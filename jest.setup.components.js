// Reanimated 4's built-in mock pulls in the native worklets module, which throws
// under Jest. Mock just the hooks/components our code uses: run worklets inline
// and treat animated views as plain views.
// Gesture Handler reaches for a native TurboModule on import, which isn't
// registered under Jest. Mock the bits our grid uses: a passthrough
// GestureDetector and a chainable Gesture builder (every method returns the
// builder, so `Gesture.Pan().enabled(x).onStart(fn)` works without natives).
jest.mock("react-native-gesture-handler", () => {
  const { View } = require("react-native");
  const makeChain = () => {
    const chain = new Proxy(() => chain, { get: () => () => chain });
    return chain;
  };
  return {
    __esModule: true,
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: View,
    Gesture: new Proxy({}, { get: () => () => makeChain() }),
  };
});

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View, ScrollView: View, createAnimatedComponent: (component) => component },
    useAnimatedStyle: (factory) => factory(),
    useDerivedValue: (factory) => ({ value: factory() }),
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedReaction: () => {},
    useAnimatedScrollHandler: () => () => {},
    useReducedMotion: () => false,
    runOnJS: (fn) => fn,
    scrollTo: () => {},
  };
});
