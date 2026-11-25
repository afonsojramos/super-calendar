import { fireEvent, render as rtlRender, type RenderResult } from "@testing-library/react-native";
import { Dimensions, StyleSheet } from "react-native";

// The time grid mounts its pager list only after the pager has laid out, and
// The test renderer lays nothing out. Fire that layout at the width the grid estimates
// before measuring (the window minus the hour column, read from the wrapper's
// own `left` and `right`), so the list mounts and geometry assertions keep their numbers.
export const firePagerLayout = async (result: RenderResult) => {
  const pager = result.queryByTestId("time-grid-pager");
  if (!pager) return;
  const { left = 0, right = 0 } = StyleSheet.flatten(pager.props.style) as {
    left?: number;
    right?: number;
  };
  const width = Dimensions.get("window").width - left - right;
  await fireEvent(pager, "layout", {
    nativeEvent: { layout: { x: left, y: 0, width, height: 0 } },
  });
};

// `render` that also lays out the time grid's pager when one is on screen.
export const render = async (...args: Parameters<typeof rtlRender>): Promise<RenderResult> => {
  const result = await rtlRender(...args);
  await firePagerLayout(result);
  return result;
};
