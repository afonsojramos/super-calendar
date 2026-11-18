import { memo, useCallback, useLayoutEffect, useRef, type ComponentRef } from "react";
import {
  type LayoutChangeEvent,
  type LayoutRectangle,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { ResolvedSlot } from "../utils/slots";

export interface MonthCellGeometry {
  minimumHeight: number;
  top: number;
  bottom: number;
  gap: number;
  overlayTop: number;
  weekMargin: number;
  weekMarginTop: number;
}

type ProbeView = ComponentRef<typeof View>;
type Part = "frame" | "row" | "cell" | "date" | "lane" | "overlay";
const MARKER_HEIGHT = 1;
const hiddenProbeProps = {
  pointerEvents: "none",
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
  ...(Platform.OS === "web" ? { "aria-hidden": true, inert: "inert" } : {}),
} as const;

// Zero-height weeks leave only the grid's padding, borders and gaps. The outer
// box also includes its margins. Neither measurement depends on the drawn rows.
export const MonthGridSpacingProbe = memo(function MonthGridSpacingProbe({
  grid,
  weeks,
  onInnerHeight,
  onOuterHeight,
}: {
  grid: ResolvedSlot<ViewStyle>;
  weeks: number;
  onInnerHeight: (height: number) => void;
  onOuterHeight: (height: number) => void;
}) {
  return (
    <View
      {...hiddenProbeProps}
      style={styles.frame}
      onLayout={(e) => onOuterHeight(e.nativeEvent.layout.height)}
    >
      <View
        {...grid}
        style={[grid.style, styles.gridSpacing]}
        onLayout={(e) => onInnerHeight(e.nativeEvent.layout.height)}
      >
        {Array.from({ length: weeks }, (_, index) => (
          <View key={index} style={styles.emptyWeek} />
        ))}
      </View>
    </View>
  );
});

// The two markers take the place of the date and the first event. Their natural
// positions include spacing applied by a class, including on the enclosing week.
// The probe has no fixed height, so measuring it cannot grow the visible rows.
export const MonthCellProbe = memo(function MonthCellProbe({
  id,
  week,
  day,
  cellStyle,
  onMeasure,
}: {
  id: string;
  week: ResolvedSlot<ViewStyle>;
  day: ResolvedSlot<ViewStyle>;
  cellStyle: StyleProp<ViewStyle>;
  onMeasure: (id: string, geometry: MonthCellGeometry) => void;
}) {
  const layouts = useRef<Partial<Record<Part, LayoutRectangle>>>({});
  const nodes = useRef<Partial<Record<Part, ProbeView | null>>>({});
  const report = useCallback(
    (
      height: number,
      row: Pick<LayoutRectangle, "y" | "height">,
      top: number,
      laneTop: number,
      laneHeight: number,
      overlayTop: number,
    ) => {
      if (height > 0)
        onMeasure(id, {
          minimumHeight: height,
          top,
          gap: Math.max(0, laneTop - top - MARKER_HEIGHT),
          bottom: height - laneTop - laneHeight,
          overlayTop,
          weekMargin: height - row.height,
          weekMarginTop: row.y,
        });
    },
    [id, onMeasure],
  );

  // React Native Web's onLayout observes resizing. Changing padding can move both
  // markers without resizing either one, so read their current positions together.
  const readWeb = useCallback(() => {
    if (Platform.OS !== "web" || typeof Element === "undefined") return false;
    const rect = (part: Part) => {
      const node = nodes.current[part];
      return node instanceof Element ? node.getBoundingClientRect() : undefined;
    };
    const frame = rect("frame"),
      row = rect("row"),
      date = rect("date"),
      lane = rect("lane"),
      overlay = rect("overlay");
    if (!frame || !row || !date || !lane || !overlay) return false;
    report(
      frame.height,
      { y: row.top - frame.top, height: row.height },
      date.top - frame.top,
      lane.top - frame.top,
      lane.height,
      overlay.top - frame.top,
    );
    return true;
  }, [report]);

  useLayoutEffect(() => {
    readWeb();
  }, [readWeb, week, day, cellStyle]);

  function observe(part: Part) {
    return {
      ...(Platform.OS === "web" && {
        ref: (node: ProbeView | null) => {
          nodes.current[part] = node;
        },
      }),
      onLayout: (event: LayoutChangeEvent) => {
        if (readWeb()) return;
        layouts.current[part] = event.nativeEvent.layout;
        const { frame, row, cell, date, lane, overlay } = layouts.current;
        if (!frame || !row || !cell || !date || !lane || !overlay) return;
        const cellTop = row.y + cell.y;
        report(
          frame.height,
          row,
          cellTop + date.y,
          cellTop + lane.y,
          lane.height,
          row.y + overlay.y,
        );
      },
    };
  }
  return (
    <View {...observe("frame")} style={styles.frame} collapsable={false} {...hiddenProbeProps}>
      <View
        {...observe("row")}
        {...week}
        style={[week.style, styles.intrinsic]}
        collapsable={false}
      >
        <TouchableOpacity
          {...day}
          style={[day.style, cellStyle, styles.stacked]}
          disabled
          onLayout={observe("cell").onLayout}
        >
          <View {...observe("date")} style={styles.marker} collapsable={false} />
          <View {...observe("lane")} style={styles.laneMarker} collapsable={false} />
        </TouchableOpacity>
        <View {...observe("overlay")} style={StyleSheet.absoluteFill} collapsable={false} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { position: "absolute", top: 0, left: 0, right: 0, opacity: 0 },
  gridSpacing: { height: "auto", minHeight: 0, maxHeight: "auto", flex: 0 },
  emptyWeek: { height: 0 },
  intrinsic: { height: "auto", minHeight: 0 },
  stacked: { justifyContent: "flex-start", alignSelf: "stretch" },
  marker: { height: MARKER_HEIGHT },
  // Fill space reserved by the day height so it does not count as bottom padding.
  laneMarker: { height: MARKER_HEIGHT, flexGrow: 1 },
});
