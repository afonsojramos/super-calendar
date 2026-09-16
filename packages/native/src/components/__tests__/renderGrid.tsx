import { fireEvent, render as rtlRender, type RenderResult } from "@testing-library/react-native";
import { Dimensions, StyleSheet } from "react-native";

// The time grid mounts its pager list only after the pager has laid out, and
// Jest lays nothing out. Fire that layout at the width the grid estimates
// before measuring (the window minus the hour column, read from the wrapper's
// own `left`), so the list mounts and geometry assertions keep their numbers.
export const firePagerLayout = async (result: RenderResult) => {
  const pager = result.queryByTestId("time-grid-pager");
  if (!pager) return;
  const left = (StyleSheet.flatten(pager.props.style) as { left?: number }).left ?? 0;
  const width = Dimensions.get("window").width - left;
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
