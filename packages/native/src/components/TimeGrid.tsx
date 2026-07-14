import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
  type OnViewableItemsChangedInfo,
} from "@legendapp/list/react-native";
import {
  addDays,
  differenceInCalendarDays,
  format,
  getHours,
  getISOWeek,
  getMinutes,
  type Locale,
  startOfDay,
  startOfWeek,
} from "date-fns";
import { memo, type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  scrollTo,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";
import { useCalendarTheme } from "../theme";
import type {
  BusinessHours,
  CalendarEvent,
  CalendarMode,
  EventKeyExtractor,
  RenderEvent,
  TimeGridMode,
  WeekStartsOn,
} from "../types";
import {
  getIsToday,
  getViewDays,
  isSameCalendarDay,
  isWeekend,
  viewDayCount,
} from "@super-calendar/core";
import {
  cellRangeFromDrag,
  closedHourBands,
  resolveDraggedBounds,
  snapDeltaMinutes,
} from "@super-calendar/core";
import { formatHour, layoutDayEvents, type PositionedEvent } from "@super-calendar/core";
import type { EventAccessibilityLabeler } from "@super-calendar/core";
import { type WeekdayFormat, weekdayFormatToken } from "@super-calendar/core";
import { SlotStylesProvider, type SlotStyleProps, useSlots } from "../utils/slots";
import { useWebGridZoom } from "../utils/useWebGridZoom";
import { useWebPagerKeys } from "../utils/useWebPagerKeys";
import { withEventAccessibilityLabel } from "../utils/withEventAccessibilityLabel";
import { AllDayLane } from "./AllDayLane";

// Horizontal swipe paging doesn't translate to web; there we disable it and page
// with the arrow keys instead.
const isWeb = Platform.OS === "web";

// Minimal DOM shapes for the web-only Escape listener (the library targets React
// Native, so the TS "DOM" lib isn't available).
type WebKeyEvent = { key: string };
type WebKeyTarget = {
  addEventListener: (type: "keydown", listener: (event: WebKeyEvent) => void) => void;
  removeEventListener: (type: "keydown", listener: (event: WebKeyEvent) => void) => void;
};

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;
// Steps rendered either side of the current page. LegendList virtualises, so
// only a few mount at once; a wide window means the user effectively never runs
// out of pages to swipe. Items are keyed by date and never recycled.
const PAGE_WINDOW = 180;
// A page must be ~fully on screen before it becomes the committed date.
const PAGE_VIEWABILITY = { itemVisiblePercentThreshold: 90 };

// Matches the dom renderer's default so both grids start at the same density.
/** Default height in pixels of one hour row on the time grid. */
export const DEFAULT_HOUR_HEIGHT = 48;
const DEFAULT_MIN_HOUR_HEIGHT = 32;
const DEFAULT_MAX_HOUR_HEIGHT = 160;
const DEFAULT_HOUR_COLUMN_WIDTH = 56;
// Short events would otherwise render only a few pixels tall and clip their
// content; keep them tall enough to stay legible and tappable.
const MIN_EVENT_HEIGHT = 32;
// Inset each event box within its slot so adjacent boxes (and column edges) get a
// little breathing room instead of butting edge-to-edge.
const EVENT_GAP = 2;
// Hold this long before drag-to-create (sweeping empty grid space) begins on
// native, so a normal scroll/tap isn't hijacked.
const DRAG_ACTIVATE_MS = 300;
// Moving an existing event takes a longer, deliberate hold, so a tap or scroll
// over a busy day never picks one up by accident.
const MOVE_ACTIVATE_MS = 500;
// Web has no long-press, so a drag-to-move activates only after the pointer
// moves this far vertically — below it a press stays a click (select /
// right-click menu).
const DRAG_ACTIVATE_PX = 8;
// Height of the resize grip at the bottom of a draggable event box.
const RESIZE_HANDLE_HEIGHT = 14;
// Default minutes a drag snaps to when `dragStepMinutes` isn't set.
const DEFAULT_DRAG_STEP_MINUTES = 15;

/**
 * Called when an event is dragged (moved or resized) to new start/end times.
 * Return `false` to reject the drop — the event snaps back to where it started
 * (e.g. to forbid overlaps or out-of-bounds slots). Any other return accepts it.
 */
export type EventDragHandler<T> = (
  event: CalendarEvent<T>,
  start: Date,
  end: Date,
) => void | boolean;
/**
 * Called when a move or resize gesture begins, before any change is committed:
 * on grab for a move (after the long-press), and when the resize drag starts.
 * Handy for haptic feedback (e.g. `expo-haptics`). Requires drag to be enabled
 * via `onDragEvent`.
 */
export type EventDragStartHandler<T> = (event: CalendarEvent<T>) => void;
// Hour labels are nudged up so the number sits centred on its grid line. Pad the
// scroll content by the same amount so the top-most label is never clipped.
const HOUR_LABEL_TOP_INSET = 12;
const HOUR_LABEL_NUDGE = 6;
const NOW_TICK_MS = 60_000;

// A `Date` that advances every minute while `enabled`, so the now-indicator
// tracks the wall clock instead of freezing at mount. Off-screen pages pass
// `enabled = false` and re-read the time when they become active.
function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

type AnimatedEventBoxProps<T> = {
  positioned: PositionedEvent<T>;
  cellHeight: SharedValue<number>;
  minHour: number;
  left: number;
  width: number;
  // Drag-to-move across days needs the column width and this box's day index
  // within the visible range, so a horizontal drag maps to (and clamps to) days.
  dayWidth: number;
  dayIndex: number;
  dayCount: number;
  mode: CalendarMode;
  renderEvent: RenderEvent<T>;
  snapMinutes: number;
  onPress: (event: CalendarEvent<T>) => void;
  onLongPress?: (event: CalendarEvent<T>) => void;
  onDragEvent?: EventDragHandler<T>;
  onDragStart?: EventDragStartHandler<T>;
  showDragHandle: boolean;
};

function AnimatedEventBox<T>({
  positioned,
  cellHeight,
  minHour,
  left,
  width,
  dayWidth,
  dayIndex,
  dayCount,
  mode,
  renderEvent,
  snapMinutes,
  onPress,
  onLongPress,
  onDragEvent,
  onDragStart,
  showDragHandle,
}: AnimatedEventBoxProps<T>) {
  const RenderEventComponent = renderEvent;
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  // Drag-to-move/resize. Native picks the event up on long-press (so a tap or
  // scroll isn't hijacked); web activates after a small drag threshold, so a
  // plain click still selects and a right-click still opens a context menu.
  const draggable = onDragEvent != null && !positioned.event.disabled;
  // Only the segment that owns the real end may be resized.
  const resizable = draggable && !positioned.continuesAfter;

  // Live preview offsets (px), reset to 0 once the committed change re-renders.
  // moveOffsetX shifts the box across day columns during a cross-day drag.
  const moveOffset = useSharedValue(0);
  const moveOffsetX = useSharedValue(0);
  const resizeDelta = useSharedValue(0);

  // Pull the geometry out as primitives so the worklets below close over plain
  // numbers, not `positioned` itself. Referencing `positioned.*` inside a
  // worklet captures the whole object, and `positioned.event` holds `Date`s,
  // which react-native-worklets >=0.10 refuses to copy to the UI thread
  // ("Cannot copy value of type `Date`").
  const startHours = positioned.startHours;
  const durationHours = positioned.durationHours;

  // Live pixel height of the box, driven on the UI thread by the shared
  // cellHeight (plus any in-progress resize). Handed to renderEvent so custom
  // renderers can reveal detail progressively as the grid zooms, without
  // re-rendering. Explicit deps so the worklet re-captures the event's geometry.
  const boxHeight = useDerivedValue(
    () => Math.max(durationHours * cellHeight.value + resizeDelta.value, MIN_EVENT_HEIGHT),
    [durationHours],
  );

  const boxStyle = useAnimatedStyle(
    () => ({
      top: (startHours - minHour) * cellHeight.value + moveOffset.value,
      height: boxHeight.value,
      transform: [{ translateX: moveOffsetX.value }],
    }),
    [startHours, durationHours, minHour],
  );

  // Clear the drag preview once the committed change re-renders this box at its
  // new geometry. The gesture holds the snapped offset through the commit (so the
  // box never flashes back to the original spot); this drops it the moment the
  // new start/duration lands, for consumers whose keyExtractor keeps it mounted.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    moveOffset.value = 0;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    moveOffsetX.value = 0;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    resizeDelta.value = 0;
  }, [positioned.startHours, positioned.durationHours, moveOffset, moveOffsetX, resizeDelta]);

  // Keep the latest event/handler in a ref so the gestures stay memoized but
  // never call into a stale closure.
  const latest = useRef({ event: positioned.event, onDragEvent, onDragStart });
  latest.current = { event: positioned.event, onDragEvent, onDragStart };

  // Snap the box back to where it started (drop rejected or degenerate).
  const snapBack = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    moveOffset.value = 0;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    moveOffsetX.value = 0;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    resizeDelta.value = 0;
  }, [moveOffset, moveOffsetX, resizeDelta]);

  const commitDrag = useCallback(
    (deltaStartMin: number, deltaEndMin: number) => {
      const { event, onDragEvent: handler } = latest.current;
      if (!handler) return;
      // Returns null when a resize would collapse below one step — snap back.
      const next = resolveDraggedBounds(
        event.start,
        event.end,
        deltaStartMin,
        deltaEndMin,
        snapMinutes,
      );
      if (!next) {
        snapBack();
        return;
      }
      // A handler may return false to reject the drop (e.g. an overlap or an
      // out-of-bounds slot); snap the box back to its original place.
      if (handler(event, next.start, next.end) === false) snapBack();
    },
    [snapMinutes, snapBack],
  );

  // Fired on the JS thread when the gesture grabs the event, so consumers can
  // trigger haptics or other side effects the instant drag mode begins.
  const notifyDragStart = useCallback(() => {
    latest.current.onDragStart?.(latest.current.event);
  }, []);

  const moveGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(draggable)
      .onStart(() => {
        runOnJS(notifyDragStart)();
      })
      .onUpdate((event) => {
        moveOffset.value = event.translationY;
        moveOffsetX.value = event.translationX;
      })
      .onEnd((event) => {
        const minuteDelta = snapDeltaMinutes(event.translationY, cellHeight.value, snapMinutes);
        // Map the horizontal drag to whole day columns, clamped so the event
        // can't leave the visible range.
        const rawDayDelta = dayWidth > 0 ? Math.round(event.translationX / dayWidth) : 0;
        const targetDay = Math.min(Math.max(dayIndex + rawDayDelta, 0), dayCount - 1);
        const dayDelta = targetDay - dayIndex;
        if (minuteDelta === 0 && dayDelta === 0) {
          moveOffset.value = 0;
          moveOffsetX.value = 0;
          return;
        }
        // Hold the snapped position so the box doesn't flash back to the
        // original before the committed re-render lands.
        moveOffset.value = (minuteDelta / MINUTES_PER_HOUR) * cellHeight.value;
        moveOffsetX.value = dayDelta * dayWidth;
        // Fold the day shift into the minute delta; shiftMinutes carries it into
        // the date, so both edges move together and the duration is preserved.
        const totalDelta = minuteDelta + dayDelta * MINUTES_PER_DAY;
        runOnJS(commitDrag)(totalDelta, totalDelta);
      });
    // Native: long-press to pick up. Web: activate past a small drag in either
    // axis so clicks/right-clicks pass through but horizontal drags still move.
    return isWeb
      ? pan
          .activeOffsetX([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
          .activeOffsetY([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
      : pan.activateAfterLongPress(MOVE_ACTIVATE_MS);
  }, [
    draggable,
    snapMinutes,
    cellHeight,
    moveOffset,
    moveOffsetX,
    dayWidth,
    dayIndex,
    dayCount,
    commitDrag,
    notifyDragStart,
  ]);

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(resizable)
        .onStart(() => {
          runOnJS(notifyDragStart)();
        })
        .onUpdate((event) => {
          resizeDelta.value = event.translationY;
        })
        .onEnd((event) => {
          const delta = snapDeltaMinutes(event.translationY, cellHeight.value, snapMinutes);
          if (delta === 0) {
            resizeDelta.value = 0;
            return;
          }
          resizeDelta.value = (delta / MINUTES_PER_HOUR) * cellHeight.value;
          runOnJS(commitDrag)(0, delta);
        }),
    [resizable, snapMinutes, cellHeight, resizeDelta, commitDrag, notifyDragStart],
  );

  const handlePress = () => onPress(positioned.event);
  // When draggable, a long press grabs the event to move it, so don't also fire
  // the consumer's long-press handler.
  const handleLongPress =
    !draggable && onLongPress ? () => onLongPress(positioned.event) : undefined;

  // Dragging is gesture-only, so expose the same move/resize commit path as
  // discrete screen-reader actions (VoiceOver/TalkBack invoke them from the
  // actions menu). Steps are one `snapMinutes` unit, matching a drag snap.
  const unit = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;
  const accessibilityActions = draggable
    ? [
        { name: "move-later", label: `Move ${unit(snapMinutes)} later` },
        { name: "move-earlier", label: `Move ${unit(snapMinutes)} earlier` },
        ...(resizable
          ? [
              { name: "extend", label: `Extend by ${unit(snapMinutes)}` },
              { name: "shrink", label: `Shorten by ${unit(snapMinutes)}` },
            ]
          : []),
      ]
    : undefined;
  const handleAccessibilityAction = draggable
    ? (e: AccessibilityActionEvent) => {
        switch (e.nativeEvent.actionName) {
          case "move-later":
            commitDrag(snapMinutes, snapMinutes);
            break;
          case "move-earlier":
            commitDrag(-snapMinutes, -snapMinutes);
            break;
          case "extend":
            commitDrag(0, snapMinutes);
            break;
          case "shrink":
            commitDrag(0, -snapMinutes);
            break;
        }
      }
    : undefined;

  const eventSlot = slot("event", {
    base: [styles.eventBox, { left, width }],
    themed: theme.containers.timeGridEvent,
  });
  const box = (
    <Animated.View {...eventSlot} style={[eventSlot.style, boxStyle]}>
      <RenderEventComponent
        event={positioned.event}
        mode={mode}
        boxHeight={boxHeight}
        continuesBefore={positioned.continuesBefore}
        continuesAfter={positioned.continuesAfter}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={handleAccessibilityAction}
        onPress={handlePress}
        onLongPress={handleLongPress}
      />
      {resizable ? (
        <GestureDetector gesture={resizeGesture}>
          <Animated.View style={styles.resizeHandle}>
            {/* The grip is the only visible drag affordance; hiding it keeps the
                resize gesture working but removes the indicator. */}
            {showDragHandle ? (
              <View style={[styles.resizeGrip, { backgroundColor: theme.colors.eventText }]} />
            ) : null}
          </Animated.View>
        </GestureDetector>
      ) : null}
    </Animated.View>
  );

  if (!draggable) return box;
  return <GestureDetector gesture={moveGesture}>{box}</GestureDetector>;
}

/** Replace the hour-axis label. Receives the hour (0–23) and the `ampm` flag. */
export type HourRenderer = (hour: number, ampm: boolean) => React.ReactNode;

type HourRowProps = {
  hour: number;
  minHour: number;
  cellHeight: SharedValue<number>;
  hourColumnWidth: number;
  label: string;
  ampm: boolean;
  hourComponent?: HourRenderer;
};

const HourRow = ({
  hour,
  minHour,
  cellHeight,
  hourColumnWidth,
  label,
  ampm,
  hourComponent,
}: HourRowProps) => {
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  // Position via `top` (a layout prop), not a transform. The per-row layout pass
  // as cellHeight animates keeps the ScrollView's content size in sync while
  // zooming; a transform is composited and leaves the scroll range stale.
  const animatedStyle = useAnimatedStyle(
    () => ({ top: (hour - minHour) * cellHeight.value }),
    [hour, minHour],
  );

  return (
    <Animated.View style={[styles.hourRow, styles.nonInteractive, animatedStyle]}>
      {hourComponent ? (
        <View style={{ width: hourColumnWidth }}>{hourComponent(hour, ampm)}</View>
      ) : (
        <Text
          {...slot("hourLabel", {
            base: [styles.hourLabel, { width: hourColumnWidth }],
            themed: [theme.text.hourLabel, { color: theme.colors.textMuted }],
          })}
          allowFontScaling={false}
        >
          {label}
        </Text>
      )}
      <View
        {...slot("gridLines", {
          base: styles.hourLine,
          themed: { backgroundColor: theme.colors.gridLine },
        })}
      />
    </Animated.View>
  );
};

type TimeslotLineProps = {
  hour: number;
  minHour: number;
  fraction: number;
  cellHeight: SharedValue<number>;
  hourColumnWidth: number;
};

// A faint divider inside an hour row, marking a sub-hour slot (e.g. half hours).
const TimeslotLine = ({
  hour,
  minHour,
  fraction,
  cellHeight,
  hourColumnWidth,
}: TimeslotLineProps) => {
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  const animatedStyle = useAnimatedStyle(
    () => ({ top: (hour - minHour + fraction) * cellHeight.value }),
    [hour, minHour, fraction],
  );
  const lineSlot = slot("gridLines", {
    base: [styles.timeslotLine, styles.nonInteractive, { left: hourColumnWidth }],
    themed: { backgroundColor: theme.colors.gridLine },
  });
  return <Animated.View {...lineSlot} style={[lineSlot.style, animatedStyle]} />;
};

type NowIndicatorProps = {
  cellHeight: SharedValue<number>;
  nowHours: number;
  minHour: number;
  left: number;
  width: number;
  color: string;
};

const NowIndicator = ({ cellHeight, nowHours, minHour, left, width, color }: NowIndicatorProps) => {
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  const animatedStyle = useAnimatedStyle(
    () => ({ top: (nowHours - minHour) * cellHeight.value }),
    [nowHours, minHour],
  );

  const lineSlot = slot("nowIndicator", {
    base: [styles.nowIndicator, styles.nonInteractive, { left, width }],
    themed: [{ backgroundColor: color }, theme.containers.nowIndicator],
  });
  return <Animated.View {...lineSlot} style={[lineSlot.style, animatedStyle]} />;
};

type ShadeBandProps = {
  cellHeight: SharedValue<number>;
  startHour: number;
  endHour: number;
  minHour: number;
  left: number;
  width: number;
  color: string;
};

// A muted band over a closed hour-range of one day column (driven by the live
// cellHeight so it tracks the zoom).
const ShadeBand = ({
  cellHeight,
  startHour,
  endHour,
  minHour,
  left,
  width,
  color,
}: ShadeBandProps) => {
  const slot = useSlots<TimeGridSlot>();
  const animatedStyle = useAnimatedStyle(
    () => ({
      top: (startHour - minHour) * cellHeight.value,
      height: (endHour - startHour) * cellHeight.value,
    }),
    [startHour, endHour, minHour],
  );
  const bandSlot = slot("businessHours", {
    base: [styles.shadeBand, styles.nonInteractive, { left, width }],
    themed: { backgroundColor: color },
  });
  return (
    <Animated.View
      testID="business-hours-shade"
      {...bandSlot}
      style={[bandSlot.style, animatedStyle]}
    />
  );
};

type TimetablePageProps<T> = {
  mode: TimeGridMode;
  numberOfDays: number;
  date: Date;
  events: CalendarEvent<T>[];
  cellHeight: SharedValue<number>;
  hourHeight: number;
  // The zoom committed at the end of the last pinch. Off-screen pages animate off
  // this (it changes once per gesture) instead of the live cellHeight (which
  // changes every frame), so a pinch only re-runs the visible page's worklets.
  committedCellHeight: SharedValue<number>;
  scrollY: SharedValue<number>;
  isActive: boolean;
  /** Initial vertical scroll position (px): the live shared offset, so a page that
   * mounts after a scroll appears there rather than snapping from the default. */
  initialScrollY: number;
  /** Record the rested vertical offset (px) so later-mounted pages seed from it. */
  onSettleOffset: (y: number) => void;
  weekStartsOn: WeekStartsOn;
  weekEndsOn?: WeekStartsOn;
  /** Full grid width (hour gutter + day columns). Comes from the container, not the window. */
  width: number;
  hourColumnWidth: number;
  minHour: number;
  maxHour: number;
  ampm: boolean;
  timeslots: number;
  isRTL: boolean;
  showAllDayEventCell: boolean;
  showVerticalScrollIndicator: boolean;
  verticalScrollEnabled: boolean;
  hourComponent?: HourRenderer;
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  businessHours?: BusinessHours;
  minHourHeight: number;
  maxHourHeight: number;
  showNowIndicator: boolean;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  snapMinutes: number;
  showDragHandle: boolean;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onDragEvent?: EventDragHandler<T>;
  onDragStart?: EventDragStartHandler<T>;
  onPressCell?: (date: Date) => void;
  onLongPressCell?: (date: Date) => void;
  onCreateEvent?: (start: Date, end: Date) => void;
};

// A single date's grid: the pinch-zoomable, vertically-scrolling time column.
// Three of these are mounted side by side inside the pager so the previous and
// next dates are ready to drag into view.
function TimetablePageInner<T>({
  mode,
  numberOfDays,
  date,
  events,
  cellHeight,
  hourHeight,
  committedCellHeight,
  scrollY,
  isActive,
  initialScrollY,
  onSettleOffset,
  weekStartsOn,
  weekEndsOn,
  width,
  hourColumnWidth,
  minHour,
  maxHour,
  ampm,
  timeslots,
  isRTL,
  showAllDayEventCell,
  showVerticalScrollIndicator,
  verticalScrollEnabled,
  hourComponent,
  calendarCellStyle,
  minHourHeight,
  maxHourHeight,
  showNowIndicator,
  businessHours,
  renderEvent,
  keyExtractor,
  snapMinutes,
  showDragHandle,
  onPressEvent,
  onLongPressEvent,
  onDragEvent,
  onDragStart,
  onPressCell,
  onLongPressCell,
  onCreateEvent,
}: TimetablePageProps<T>) {
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // The visible page tracks the live cellHeight (animates every pinch frame);
  // off-screen pages track committedCellHeight (settles once per gesture).
  const heightSource = isActive ? cellHeight : committedCellHeight;

  // Keep every page locked to the same vertical scroll position so the prev/next
  // pages are already aligned before they drag into view — no post-swipe jump.
  // Only a genuine user drag (and its momentum) updates the shared offset. The
  // contentOffset seed and the programmatic scrolls that fire during paging also
  // emit onScroll events; letting those write `scrollY` could broadcast a transient
  // 0 to every page (the random "snaps to midnight" behaviour), so they're ignored.
  const isDragging = useSharedValue(false);
  // Mirror `isActive` to a shared value so the scroll worklet reads the *current*
  // active state. A plain `isActive` captured in the worklet goes stale, so only the
  // page active when the handler was first created would record its scrolls — which
  // is why a position set on a later page was lost and an earlier one came back.
  const isActiveShared = useSharedValue(isActive);
  useEffect(() => {
    isActiveShared.value = isActive;
  }, [isActive, isActiveShared]);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      // Native captures the active page's scroll on a real drag. (Web is handled by
      // the container-level scroll listener in TimeGridInner, because LegendList
      // recycles the page containers there and per-page `isActive` can't reliably
      // tell which DOM node the user is actually scrolling.)
      if (isActiveShared.value && isDragging.value) {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
        scrollY.value = event.contentOffset.y;
      }
    },
    onBeginDrag: () => {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      isDragging.value = true;
    },
    onEndDrag: (event) => {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      isDragging.value = false;
      // Capture the rested position. The mid-drag onScroll above stops at the
      // finger-lift point; without this, the momentum tail after it is lost and the
      // saved offset falls short of where the page actually settles.
      if (!isWeb && isActiveShared.value) {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
        scrollY.value = event.contentOffset.y;
        runOnJS(onSettleOffset)(event.contentOffset.y);
      }
    },
    onMomentumEnd: (event) => {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      isDragging.value = false;
      if (!isWeb && isActiveShared.value) {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
        scrollY.value = event.contentOffset.y;
        runOnJS(onSettleOffset)(event.contentOffset.y);
      }
    },
  });

  // Keep *inactive* pages aligned to the shared offset as it changes, so they're
  // already in position before they drag into view. Reads `isActiveShared` (not the
  // captured `isActive`) so the worklet sees the current state.
  useAnimatedReaction(
    () => scrollY.value,
    (current, previous) => {
      if (!isActiveShared.value && current !== previous) {
        scrollTo(scrollRef, 0, current, false);
      }
    },
  );

  // When a page becomes the active one (paged or jumped to), align it to the shared
  // offset. The reaction above only syncs *inactive* pages, and only when `scrollY`
  // changes, so a page that paged in after the last change (the third page on from a
  // drag, say) would keep its seeded default. Uses reanimated's `scrollTo` worklet:
  // the imperative `scrollRef.current.scrollTo()` does not take effect on a
  // useAnimatedRef, which is why that page stayed at the default. Native only; web is
  // handled by the container-level effect in TimeGridInner.
  useAnimatedReaction(
    () => isActiveShared.value,
    (active, previous) => {
      if (isWeb || !active || active === previous) return;
      scrollTo(scrollRef, 0, scrollY.value, false);
    },
  );

  const days = useMemo(
    () => getViewDays(mode, date, weekStartsOn, numberOfDays, isRTL, weekEndsOn),
    [mode, date, weekStartsOn, numberOfDays, isRTL, weekEndsOn],
  );

  // Plain number for worklets to close over: reading `days.length` inside a
  // gesture worklet would capture the whole `days` array (of `Date`s), which
  // react-native-worklets >=0.10 refuses to copy to the UI thread.
  const dayCount = days.length;
  const dayWidth = (width - hourColumnWidth) / dayCount;
  const dayLeft = (dayIndex: number) => hourColumnWidth + dayIndex * dayWidth;

  const dayLayouts = useMemo(() => days.map((day) => layoutDayEvents(events, day)), [days, events]);

  // Map a tap on empty grid space back to the date+time it represents. Reads the
  // live row height on the JS thread to convert the touch Y into minutes.
  const cellDateFromTouch = (event: GestureResponderEvent): Date | null => {
    const { locationX, locationY } = event.nativeEvent;
    const dayIndex = days.length === 1 ? 0 : Math.floor(locationX / dayWidth);
    const day = days[dayIndex];
    if (!day) return null;
    const minutes = Math.round((minHour + locationY / heightSource.value) * MINUTES_PER_HOUR);
    const pressed = new Date(day);
    pressed.setHours(0, 0, 0, 0);
    pressed.setMinutes(minutes);
    return pressed;
  };
  const handleBackgroundPress = (event: GestureResponderEvent) => {
    const date = onPressCell && cellDateFromTouch(event);
    if (date) onPressCell?.(date);
  };
  const handleBackgroundLongPress = (event: GestureResponderEvent) => {
    const date = onLongPressCell && cellDateFromTouch(event);
    if (date) onLongPressCell?.(date);
  };

  // The hours (rows/labels) visible in the window [minHour, maxHour).
  const hoursRange = useMemo(
    () => Array.from({ length: maxHour - minHour }, (_, index) => minHour + index),
    [minHour, maxHour],
  );

  const now = useNow(showNowIndicator && isActive);
  const nowDayIndex = days.findIndex((day) => getIsToday(day));
  const nowHours = (getHours(now) * MINUTES_PER_HOUR + getMinutes(now)) / MINUTES_PER_HOUR;
  const nowInWindow = nowHours >= minHour && nowHours <= maxHour;

  const fullHeightStyle = useAnimatedStyle(
    () => ({ height: (maxHour - minHour) * heightSource.value }),
    [minHour, maxHour, heightSource],
  );

  // Capture the row height when the pinch starts and apply `event.scale`
  // (relative to that start) rather than multiplying per-frame deltas — deltas
  // compound float error and the zoom never settles on a clean level.
  const pinchStartCellHeight = useSharedValue(hourHeight);
  const zoomGesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onStart(() => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
        pinchStartCellHeight.value = cellHeight.value;
      })
      .onUpdate((event) => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
        cellHeight.value = Math.min(
          maxHourHeight,
          Math.max(minHourHeight, pinchStartCellHeight.value * event.scale),
        );
      })
      .onEnd(() => {
        // Publish the final zoom to the off-screen pages in one update.
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
        committedCellHeight.value = cellHeight.value;
      });
    // Recognise the pinch and the ScrollView's native scroll together so the
    // scroll never cancels an in-progress zoom.
    return Gesture.Simultaneous(pinch, Gesture.Native());
  }, [cellHeight, committedCellHeight, pinchStartCellHeight, minHourHeight, maxHourHeight]);

  // Drag-to-create: sweep out a new event on empty grid. Native long-presses
  // first (so a tap/scroll isn't hijacked); web uses a drag threshold like move,
  // so a tap still creates a point via onPressCell and the wheel still scrolls
  // (dragging empty space creates instead of scrolling, as on desktop calendars).
  const createEnabled = onCreateEvent != null;
  // Live ghost-box geometry (px), driven on the UI thread during the sweep.
  const createActive = useSharedValue(0);
  const createTop = useSharedValue(0);
  const createHeight = useSharedValue(0);
  const createLeft = useSharedValue(0);
  const createWidth = useSharedValue(0);
  const createStartY = useSharedValue(0);
  const createDayIndex = useSharedValue(0);
  // Set when the sweep is cancelled mid-drag (Escape on web); the gesture then
  // bails instead of committing.
  const createCancelled = useSharedValue(0);

  const commitCreate = useCallback(
    (startY: number, endY: number, dayIndex: number) => {
      const day = days[dayIndex];
      if (!day) return;
      const range = cellRangeFromDrag(day, startY, endY, heightSource.value, minHour, snapMinutes);
      if (range) onCreateEvent?.(range.start, range.end);
    },
    [days, heightSource, minHour, snapMinutes, onCreateEvent],
  );

  // Web taps fall through to here: react-native-web doesn't fire the background
  // Pressable's onPress, so a click on empty space reports the cell via a Tap
  // gesture instead. Mirrors cellDateFromTouch.
  const tapCell = useCallback(
    (x: number, y: number) => {
      const dayIndex = days.length === 1 ? 0 : Math.floor(x / dayWidth);
      const day = days[dayIndex];
      if (!day) return;
      const minutes = Math.round((minHour + y / heightSource.value) * MINUTES_PER_HOUR);
      const pressed = new Date(day);
      pressed.setHours(0, 0, 0, 0);
      pressed.setMinutes(minutes);
      onPressCell?.(pressed);
    },
    [days, dayWidth, minHour, heightSource, onPressCell],
  );

  const createGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(createEnabled)
      .onStart((event) => {
        const idx = dayCount === 1 ? 0 : Math.floor(event.x / dayWidth);
        createDayIndex.value = idx;
        createStartY.value = event.y;
        createLeft.value = hourColumnWidth + idx * dayWidth;
        createWidth.value = dayWidth;
        createTop.value = event.y;
        createHeight.value = 0;
        createActive.value = 1;
        createCancelled.value = 0;
      })
      .onUpdate((event) => {
        if (createCancelled.value) return;
        const stepPx = (snapMinutes / MINUTES_PER_HOUR) * heightSource.value;
        const snap = (y: number) => (stepPx > 0 ? Math.round(y / stepPx) * stepPx : y);
        const startSnap = snap(createStartY.value);
        const endSnap = snap(createStartY.value + event.translationY);
        createTop.value = Math.min(startSnap, endSnap);
        createHeight.value = Math.max(Math.abs(endSnap - startSnap), stepPx);
      })
      .onEnd((event) => {
        createActive.value = 0;
        createHeight.value = 0;
        if (createCancelled.value) return; // Escape pressed mid-sweep
        runOnJS(commitCreate)(
          createStartY.value,
          createStartY.value + event.translationY,
          createDayIndex.value,
        );
      });
    // Native: hold to start. Web: activate past a small vertical drag so a plain
    // tap still falls through to onPressCell.
    return isWeb
      ? pan.activeOffsetY([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
      : pan.activateAfterLongPress(DRAG_ACTIVATE_MS);
  }, [
    createEnabled,
    dayCount,
    dayWidth,
    hourColumnWidth,
    heightSource,
    snapMinutes,
    commitCreate,
    createActive,
    createTop,
    createHeight,
    createLeft,
    createWidth,
    createStartY,
    createDayIndex,
    createCancelled,
  ]);

  // Compose with a Tap so a plain web click reports the cell (onPressCell);
  // Exclusive gives the drag-to-create priority, so a real drag still creates.
  const backgroundGesture = useMemo(() => {
    const tap =
      isWeb && onPressCell != null
        ? Gesture.Tap().onEnd((event) => {
            runOnJS(tapCell)(event.x, event.y);
          })
        : null;
    if (createEnabled && tap) return Gesture.Exclusive(createGesture, tap);
    if (createEnabled) return createGesture;
    return tap;
  }, [createEnabled, createGesture, onPressCell, tapCell]);

  // Web: Escape cancels an in-progress sweep before it commits.
  useEffect(() => {
    if (!isWeb || !createEnabled) return;
    const doc = (globalThis as { document?: WebKeyTarget }).document;
    if (!doc) return;
    const handler = (event: WebKeyEvent) => {
      if (event.key !== "Escape" || !createActive.value) return;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      createCancelled.value = 1;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      createActive.value = 0;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      createHeight.value = 0;
    };
    doc.addEventListener("keydown", handler);
    return () => doc.removeEventListener("keydown", handler);
  }, [createEnabled, createActive, createCancelled, createHeight]);

  const createGhostStyle = useAnimatedStyle(() => ({
    top: createTop.value,
    height: createHeight.value,
    left: createLeft.value,
    width: createWidth.value,
    opacity: createActive.value,
  }));

  const ghostSlot = slot("createGhost", {
    base: [styles.createGhost, { pointerEvents: "none" }],
    themed: {
      backgroundColor: theme.colors.eventBackground,
      borderColor: theme.colors.todayBackground,
    },
  });

  // The tap/long-press layer behind events; wrapped in the create gesture when
  // drag-to-create is on. Hidden from screen readers (a convenience gesture).
  const cellLayer =
    onPressCell || onLongPressCell || createEnabled ? (
      <Pressable
        style={[styles.cellPressLayer, { left: hourColumnWidth }]}
        onPress={onPressCell ? handleBackgroundPress : undefined}
        // When create is on, a long-press starts the create-drag, so don't also
        // fire the consumer's long-press handler.
        onLongPress={!createEnabled && onLongPressCell ? handleBackgroundLongPress : undefined}
        // Pointer-only create surface: drag to sweep out an event. On web it's
        // deliberately not a tab stop (react-native-web makes a Pressable focusable
        // by default), so keyboard focus moves through events only — matching dom.
        tabIndex={-1}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
    ) : null;

  return (
    <View style={styles.container}>
      {showAllDayEventCell ? (
        <AllDayLane
          days={days}
          events={events}
          mode={mode}
          hourColumnWidth={hourColumnWidth}
          dayWidth={dayWidth}
          renderEvent={renderEvent}
          keyExtractor={keyExtractor}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
        />
      ) : null}
      <GestureDetector gesture={zoomGesture}>
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={showVerticalScrollIndicator}
          scrollEnabled={verticalScrollEnabled}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingTop: HOUR_LABEL_TOP_INSET }}
          contentOffset={{ x: 0, y: initialScrollY }}
        >
          <Animated.View style={[styles.content, fullHeightStyle]}>
            {/* Behind the events, so empty-space taps/drags create while event
                taps still hit their box. */}
            {cellLayer && backgroundGesture ? (
              <GestureDetector gesture={backgroundGesture}>{cellLayer}</GestureDetector>
            ) : (
              cellLayer
            )}

            {days.map((day, dayIndex) => {
              if (!isWeekend(day)) return null;
              const shadeSlot = slot("weekendShade", {
                base: [
                  styles.weekendColumn,
                  styles.nonInteractive,
                  { left: dayLeft(dayIndex), width: dayWidth },
                ],
                themed: { backgroundColor: theme.colors.weekendBackground },
              });
              return (
                <Animated.View
                  key={`weekend-${day.toISOString()}`}
                  {...shadeSlot}
                  style={[shadeSlot.style, fullHeightStyle]}
                />
              );
            })}

            {calendarCellStyle
              ? days.map((day, dayIndex) => {
                  const cellStyle = calendarCellStyle(day);
                  return cellStyle ? (
                    <Animated.View
                      key={`cell-${day.toISOString()}`}
                      style={[
                        styles.weekendColumn,
                        styles.nonInteractive,
                        { left: dayLeft(dayIndex), width: dayWidth },
                        cellStyle,
                        fullHeightStyle,
                      ]}
                    />
                  ) : null;
                })
              : null}

            {businessHours
              ? days.flatMap((day, dayIndex) =>
                  closedHourBands(day, businessHours, minHour, maxHour).map((band, bandIndex) => (
                    <ShadeBand
                      key={`closed-${day.toISOString()}-${bandIndex}`}
                      cellHeight={heightSource}
                      startHour={band.start}
                      endHour={band.end}
                      minHour={minHour}
                      left={dayLeft(dayIndex)}
                      width={dayWidth}
                      color={theme.colors.outsideHoursBackground}
                    />
                  )),
                )
              : null}

            {days.map((day, dayIndex) => {
              const separatorSlot = slot("daySeparator", {
                base: [styles.daySeparator, styles.nonInteractive, { left: dayLeft(dayIndex) }],
                themed: { backgroundColor: theme.colors.gridLine },
              });
              return (
                <Animated.View
                  key={`separator-${day.toISOString()}`}
                  {...separatorSlot}
                  style={[separatorSlot.style, fullHeightStyle]}
                />
              );
            })}

            {hoursRange.map((hour) => (
              <HourRow
                key={hour}
                hour={hour}
                minHour={minHour}
                cellHeight={heightSource}
                hourColumnWidth={hourColumnWidth}
                label={formatHour(hour, { ampm })}
                ampm={ampm}
                hourComponent={hourComponent}
              />
            ))}

            {timeslots > 1
              ? hoursRange.flatMap((hour) =>
                  Array.from({ length: timeslots - 1 }, (_, i) => (
                    <TimeslotLine
                      key={`slot-${hour}-${i}`}
                      hour={hour}
                      minHour={minHour}
                      fraction={(i + 1) / timeslots}
                      cellHeight={heightSource}
                      hourColumnWidth={hourColumnWidth}
                    />
                  )),
                )
              : null}

            {dayLayouts.flatMap((layout, dayIndex) =>
              layout
                // Skip events that fall entirely outside the [minHour, maxHour) window.
                .filter((p) => p.startHours < maxHour && p.startHours + p.durationHours > minHour)
                .map((positioned, eventIndex) => {
                  const columnWidth = dayWidth / positioned.columns;
                  return (
                    <AnimatedEventBox
                      // Prefix with the day so a multi-day event's per-day segments
                      // (which share the same event key) stay unique across the
                      // flattened list of all days' boxes.
                      key={`${dayIndex}:${keyExtractor(positioned.event, eventIndex)}`}
                      positioned={positioned}
                      cellHeight={heightSource}
                      minHour={minHour}
                      left={dayLeft(dayIndex) + positioned.column * columnWidth}
                      width={columnWidth}
                      dayWidth={dayWidth}
                      dayIndex={dayIndex}
                      dayCount={days.length}
                      mode={mode}
                      renderEvent={renderEvent}
                      snapMinutes={snapMinutes}
                      showDragHandle={showDragHandle}
                      onPress={onPressEvent}
                      onLongPress={onLongPressEvent}
                      onDragEvent={onDragEvent}
                      onDragStart={onDragStart}
                    />
                  );
                }),
            )}

            {showNowIndicator && nowDayIndex >= 0 && nowInWindow ? (
              <NowIndicator
                cellHeight={heightSource}
                nowHours={nowHours}
                minHour={minHour}
                left={dayLeft(nowDayIndex)}
                width={dayWidth}
                color={theme.colors.nowIndicator}
              />
            ) : null}

            {createEnabled ? (
              <Animated.View {...ghostSlot} style={[ghostSlot.style, createGhostStyle]} />
            ) : null}
          </Animated.View>
        </Animated.ScrollView>
      </GestureDetector>
    </View>
  );
}

const TimetablePage = memo(TimetablePageInner) as typeof TimetablePageInner;

/**
 * The styleable parts of {@link TimeGrid}. Mirrors the dom renderer's slot names
 * where the structure matches; `columnHeaderDateText`, `weekendShade` and
 * `daySeparator` are native-only (the dom grid styles those through its
 * `dayColumn`/`columnHeaderDate` elements). Slots rendered as Reanimated views
 * (`gridLines` sub-hour dividers, `businessHours`, `weekendShade`,
 * `daySeparator`, `event`, `nowIndicator`, `createGhost`) always honour the
 * `styles` map; their `className` reaches the element but needs a Tailwind
 * runtime that styles Animated components.
 */
export type TimeGridSlot =
  | "header"
  | "weekNumber"
  | "columnHeader"
  | "columnHeaderWeekday"
  | "columnHeaderDate"
  | "columnHeaderDateText"
  | "allDayLane"
  | "allDayLabel"
  | "allDayColumn"
  | "allDayEvent"
  | "hourLabel"
  | "gridLines"
  | "businessHours"
  | "weekendShade"
  | "daySeparator"
  | "event"
  | "nowIndicator"
  | "createGhost";

/** Props for {@link TimeGrid}, the day/week timetable view. */
export type TimeGridProps<T> = SlotStyleProps<TimeGridSlot> & {
  mode: TimeGridMode;
  /** Day columns to show in `custom` mode. Ignored by day/3days/week. Default 1. */
  numberOfDays?: number;
  /**
   * Last weekday of a `custom` partial-week view (0–6). When set, `custom` shows
   * `weekStartsOn`…`weekEndsOn` of `date`'s week and pages by week, taking
   * precedence over `numberOfDays`. Ignored by other modes.
   */
  weekEndsOn?: WeekStartsOn;
  date: Date;
  events: CalendarEvent<T>[];
  cellHeight: SharedValue<number>;
  /** Initial per-hour row height in px; seeds scroll/zoom without reading the shared value during render. */
  hourHeight?: number;
  weekStartsOn: WeekStartsOn;
  /** Column-header weekday label width: `narrow` ("M"), `short` ("Mon", default), or `long` ("Monday"). */
  weekdayFormat?: WeekdayFormat;
  renderEvent: RenderEvent<T>;
  /**
   * Override the screen-reader label for each event. Receives the event and a
   * `{ mode, isAllDay, ampm }` context; return the full text to announce. Defaults
   * to the built-in title-and-time label.
   */
  eventAccessibilityLabel?: EventAccessibilityLabeler<T>;
  keyExtractor: EventKeyExtractor<T>;
  scrollOffsetMinutes?: number;
  hourColumnWidth?: number;
  /** Hide the left hour-axis column (lines stay, labels/gutter go). Default false. */
  hideHours?: boolean;
  /** Sub-hour divider lines per hour (e.g. 2 = half-hours). Default 1 (none). */
  timeslots?: number;
  /** Show the all-day lane above the grid. Default true. */
  showAllDayEventCell?: boolean;
  /** Per-date style merged onto each day column. */
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  businessHours?: BusinessHours;
  /** Show the ISO week number in the header gutter. Default false. */
  showWeekNumber?: boolean;
  /** Element rendered between the day header and the grid. */
  headerComponent?: React.ReactNode;
  /** First hour shown (0–23). Default 0. */
  minHour?: number;
  /** Last hour shown, exclusive (1–24). Default 24. */
  maxHour?: number;
  /** Show hour labels in 12-hour AM/PM form. Default false (24h). */
  ampm?: boolean;
  /** Reverse day-column order (right-to-left). Default false. */
  isRTL?: boolean;
  minHourHeight?: number;
  maxHourHeight?: number;
  showNowIndicator?: boolean;
  locale?: Locale;
  freeSwipe?: boolean;
  /** Allow swiping between pages. Default true. */
  swipeEnabled?: boolean;
  /** Show the vertical scroll indicator on the time grid. Default true. */
  showVerticalScrollIndicator?: boolean;
  /** Allow vertical scrolling of the time grid. Default true. */
  verticalScrollEnabled?: boolean;
  /** Prefix for the week-number label (e.g. "W"). Default "W". */
  weekNumberPrefix?: string;
  /** Replace the hour-axis label. Receives the hour (0–23) and `ampm`. */
  hourComponent?: HourRenderer;
  /** Highlight this date in the header instead of the real "today". */
  activeDate?: Date;
  /** After an empty-cell press, snap the pager back to the active page. Default false. */
  resetPageOnPressCell?: boolean;
  /** Minutes a drag-to-move/resize snaps to. Default 15. */
  dragStepMinutes?: number;
  /**
   * Show the resize grip on draggable events. Default true. Set false to keep
   * drag-to-move and drag-to-resize working while hiding the visible indicator.
   */
  showDragHandle?: boolean;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  /**
   * Enable drag-to-move and drag-to-resize on the week/day grid. Called with the
   * event's new start/end (snapped to `dragStepMinutes`); update your own state.
   */
  onDragEvent?: EventDragHandler<T>;
  /** Fired the moment an event is grabbed for a move or resize (e.g. for haptics). */
  onDragStart?: EventDragStartHandler<T>;
  onPressCell?: (date: Date) => void;
  onLongPressCell?: (date: Date) => void;
  onCreateEvent?: (start: Date, end: Date) => void;
  /** Tap a day's column header (default header only). */
  onPressDateHeader?: (date: Date) => void;
  onChangeDate: (date: Date) => void;
  /** Optional header above the grid (e.g. weekday labels). Rendered full-width. */
  renderHeader?: (days: Date[]) => React.ReactNode;
};

function TimeGridInner<T>({
  mode,
  numberOfDays = 1,
  weekEndsOn,
  date,
  events,
  cellHeight,
  hourHeight = DEFAULT_HOUR_HEIGHT,
  weekStartsOn,
  weekdayFormat = "short",
  renderEvent,
  eventAccessibilityLabel,
  keyExtractor,
  scrollOffsetMinutes = 0,
  hourColumnWidth: hourColumnWidthProp = DEFAULT_HOUR_COLUMN_WIDTH,
  hideHours = false,
  timeslots = 1,
  showAllDayEventCell = true,
  calendarCellStyle,
  businessHours,
  showWeekNumber = false,
  headerComponent,
  minHour = 0,
  maxHour = HOURS_PER_DAY,
  ampm = false,
  isRTL = false,
  minHourHeight = DEFAULT_MIN_HOUR_HEIGHT,
  maxHourHeight = DEFAULT_MAX_HOUR_HEIGHT,
  showNowIndicator = true,
  locale,
  freeSwipe = false,
  swipeEnabled = true,
  showVerticalScrollIndicator = true,
  verticalScrollEnabled = true,
  weekNumberPrefix = "W",
  hourComponent,
  activeDate,
  resetPageOnPressCell = false,
  dragStepMinutes = DEFAULT_DRAG_STEP_MINUTES,
  showDragHandle = true,
  onPressEvent,
  onLongPressEvent,
  onDragEvent,
  onDragStart,
  onPressCell,
  onLongPressCell,
  onCreateEvent,
  onPressDateHeader,
  onChangeDate,
  renderHeader,
  classNames,
  styles: styleOverrides,
}: TimeGridProps<T>): ReactElement {
  // Guard against an inverted/out-of-range window so the grid never collapses.
  const clampedMinHour = Math.max(0, Math.min(minHour, HOURS_PER_DAY - 1));
  const clampedMaxHour = Math.max(clampedMinHour + 1, Math.min(maxHour, HOURS_PER_DAY));
  // Collapse the hour gutter to zero when hours are hidden.
  const hourColumnWidth = hideHours ? 0 : hourColumnWidthProp;

  // Inject a consumer's `eventAccessibilityLabel` override into every event once,
  // so the timed columns and the all-day lane share it without threading a prop
  // through each. Passes the grid's `ampm` so the label can match the clock.
  const labeledRenderEvent = useMemo(
    () => withEventAccessibilityLabel(renderEvent, eventAccessibilityLabel, ampm),
    [renderEvent, eventAccessibilityLabel, ampm],
  );

  const { width, height } = useWindowDimensions();
  const listRef = useRef<LegendListRef>(null);
  // The grid's outer view; on web its ref resolves to the DOM node we attach the
  // Ctrl/Cmd + scroll zoom listener to.
  const containerRef = useRef<View>(null);
  // Web: ignore scroll events until this time (ms). Set around a page change so the
  // recycle-reset and the offset-restore aren't mistaken for a user scroll.
  const suppressCaptureUntilRef = useRef(0);
  // Horizontal list items need an explicit cross-axis height; seed it with the
  // window height (so it renders immediately and in tests) and refine on layout.
  const [pageHeight, setPageHeight] = useState(height);
  // The grid sizes to its container width, not the window, so it fits a
  // constrained layout on the web (e.g. a max-width card). On native the grid
  // fills the window, so this equals the window width and behaviour is unchanged.
  // Seeded with the window width for the first paint, refined on layout.
  const [containerWidth, setContainerWidth] = useState(width);
  // The list must remount exactly once — when the real height replaces the
  // window-height seed — or it keeps the oversized seed and clips. It must NOT
  // remount on later height changes (e.g. a taller day header vs a shorter week
  // header on a mode switch): a remount blanks the visible page for a frame.
  const [measured, setMeasured] = useState(false);
  // Week-anchored modes page by a full week and align pages to the week start:
  // `week`, and `custom` when a `weekEndsOn` defines a partial-week span.
  const weekAnchored = mode === "week" || (mode === "custom" && weekEndsOn != null);
  // Days advanced per page: a full week when week-anchored, else the column count.
  const step = weekAnchored ? 7 : viewDayCount(mode, numberOfDays);
  // Shared vertical scroll offset so every mounted page stays aligned. Seeded
  // from the numeric hourHeight rather than reading cellHeight.value (which
  // would warn about reading a shared value during render).
  const seedDefaultY =
    Math.max(0, scrollOffsetMinutes / MINUTES_PER_HOUR - clampedMinHour) * hourHeight;
  const scrollY = useSharedValue(seedDefaultY);
  // Plain mirror of the last settled vertical offset. A page that mounts after a
  // scroll seeds its contentOffset here instead of the default, so it appears at the
  // saved time straight away rather than rendering at the default and snapping (the
  // one-frame flash). Null until the first scroll, when `seedDefaultY` is used.
  const offsetSeedRef = useRef<number | null>(null);
  const captureOffsetSeed = useCallback((y: number) => {
    offsetSeedRef.current = y;
  }, []);
  // Zoom committed at the end of the last pinch; off-screen pages animate off
  // this so they don't re-run their worklets every frame while the visible page
  // zooms.
  const committedCellHeight = useSharedValue(hourHeight);

  // Web stand-in for pinch: Ctrl/Cmd + scroll zooms the grid via the same shared
  // values the pinch gesture drives.
  useWebGridZoom(
    isWeb,
    containerRef,
    cellHeight,
    committedCellHeight,
    minHourHeight,
    maxHourHeight,
  );

  // A fixed window of page dates, anchored once and aligned to the page boundary
  // (day or week start). The array never shifts as the date changes.
  const [anchorDate] = useState(date);
  const anchor = useMemo(
    () => (weekAnchored ? startOfWeek(anchorDate, { weekStartsOn }) : startOfDay(anchorDate)),
    [weekAnchored, anchorDate, weekStartsOn],
  );
  const pageDates = useMemo(
    () =>
      Array.from({ length: PAGE_WINDOW * 2 + 1 }, (_, i) =>
        addDays(anchor, (i - PAGE_WINDOW) * step),
      ),
    [anchor, step],
  );
  const indexOfDate = useCallback(
    (target: Date) => {
      const aligned = weekAnchored ? startOfWeek(target, { weekStartsOn }) : startOfDay(target);
      // Floor so an arbitrary date lands on the page whose range contains it
      // (exact for day/week, where dates are already page-aligned).
      return Math.floor(differenceInCalendarDays(aligned, anchor) / step) + PAGE_WINDOW;
    },
    [anchor, weekAnchored, step, weekStartsOn],
  );

  // The committed date's page is the centred/active one. `viewedIndexRef` tracks
  // where the list actually sits, telling swipe-driven changes from external ones.
  const activeIndex = indexOfDate(date);
  const viewedIndexRef = useRef(activeIndex);
  // While a programmatic scroll (a "today" button, prev/next, or any date set from
  // outside) is settling, this holds its target index. Viewability ticks for the
  // intermediate pages it crosses are ignored until it lands, so they can't report
  // a page in between back as the new date — which made jumps land one page short.
  const pendingScrollIndexRef = useRef<number | null>(null);

  // Header days track the active page (page-aligned), so they always match the
  // columns below and a swipe never flashes another day's label.
  const headerDays = useMemo(
    () =>
      getViewDays(
        mode,
        pageDates[activeIndex] ?? date,
        weekStartsOn,
        numberOfDays,
        isRTL,
        weekEndsOn,
      ),
    [mode, pageDates, activeIndex, date, weekStartsOn, numberOfDays, isRTL, weekEndsOn],
  );

  const handleViewableItemsChanged = useCallback(
    (info: OnViewableItemsChangedInfo<Date>) => {
      // On the web the pager can't be swiped (overflow is hidden); every page change
      // is a programmatic scroll driven by `date` (prev/next/today/keys). Viewability
      // there only echoes that scroll back, and can report an intermediate page that
      // fights it (a multi-page "today" jump landing one page short), so ignore it.
      if (isWeb) return;
      const settled = info.viewableItems.find((token) => token.isViewable);
      if (settled?.index == null) return;
      // A programmatic scroll is settling: ignore the pages it crosses, and clear
      // the pending target (without reporting a date) once it reaches the target.
      if (pendingScrollIndexRef.current != null) {
        if (settled.index === pendingScrollIndexRef.current) {
          pendingScrollIndexRef.current = null;
          viewedIndexRef.current = settled.index;
        }
        return;
      }
      if (settled.index === viewedIndexRef.current) return;
      viewedIndexRef.current = settled.index;
      if (settled.item) onChangeDate(settled.item);
    },
    [onChangeDate],
  );

  // Realign the list when the date changes from outside a swipe (e.g. a "today"
  // button or a month-view tap). Swipe-driven changes already match.
  useEffect(() => {
    if (activeIndex === viewedIndexRef.current) return;
    viewedIndexRef.current = activeIndex;
    pendingScrollIndexRef.current = activeIndex;
    void listRef.current?.scrollToIndex({ index: activeIndex, animated: false });
  }, [activeIndex]);

  // react-native-web only: paging recycles the page containers and resets their
  // vertical scroll, so the on-screen page randomly lands at the top. After the
  // page settles, restore the shared offset directly on the visible page's scroll
  // node — the one lever that reliably works on the web. Deferred a frame (twice,
  // for safety) so the paged-in grid has laid out before we scroll it.
  useEffect(() => {
    if (!isWeb) return;
    const root = containerRef.current as unknown as HTMLElement | null;
    if (!root) return;
    const restoreVisiblePage = () => {
      const vw = (root.ownerDocument?.defaultView ?? globalThis).innerWidth;
      for (const el of root.querySelectorAll<HTMLElement>("*")) {
        const style = getComputedStyle(el);
        const scrollable =
          (style.overflowY === "scroll" || style.overflowY === "auto") &&
          el.scrollHeight > el.clientHeight + 20 &&
          el.clientHeight > 100;
        if (!scrollable) continue;
        const rect = el.getBoundingClientRect();
        if (rect.left > -50 && rect.right <= vw + 50) {
          el.scrollTop = scrollY.value;
          break;
        }
      }
    };
    // Don't capture the scroll events this transition emits (recycle-reset, restore).
    suppressCaptureUntilRef.current = Date.now() + 400;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      restoreVisiblePage();
      raf2 = requestAnimationFrame(restoreVisiblePage);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
    // `pageHeight` is included so this also runs once the pager measures its real
    // height on first open (the mount pass runs before the pages have laid out).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef/scrollY are stable
  }, [activeIndex, pageHeight]);

  // Web: record the on-screen page's scroll into the shared offset on genuine user
  // scrolls, so switching pages preserves the position. Programmatic scrolls (the
  // recycle-reset and the restore above) are skipped via the suppression window, so
  // they can't clobber it. Scoped to the visible page so off-screen sync is ignored.
  useEffect(() => {
    if (!isWeb) return;
    const root = containerRef.current as unknown as HTMLElement | null;
    if (!root) return;
    const onScrollCapture = (event: Event) => {
      if (Date.now() < suppressCaptureUntilRef.current) return;
      const el = event.target as HTMLElement | null;
      if (!el || typeof el.scrollTop !== "number" || el.clientHeight <= 100) return;
      const rect = el.getBoundingClientRect();
      const vw = (root.ownerDocument?.defaultView ?? globalThis).innerWidth;
      if (rect.left <= -50 || rect.right > vw + 50) return;
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      scrollY.value = el.scrollTop;
      offsetSeedRef.current = el.scrollTop;
    };
    root.addEventListener("scroll", onScrollCapture, true);
    return () => root.removeEventListener("scroll", onScrollCapture, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef/scrollY are stable
  }, []);

  // Web: LegendList's horizontal scroll container is `overflow-x: auto`, so a
  // trackpad swipe or horizontal wheel would scroll between pages. Paging should be
  // arrow-keys/toolbar only, so disable user horizontal scrolling on it (programmatic
  // scrollToIndex still works through `overflow: hidden`). `touch-action: pan-y`
  // keeps vertical scrolling of the grid working.
  useEffect(() => {
    if (!isWeb) return;
    const root = containerRef.current as unknown as HTMLElement | null;
    if (!root) return;
    const lockHorizontal = () => {
      for (const el of root.querySelectorAll<HTMLElement>("*")) {
        if (el.scrollWidth <= el.clientWidth + 20 || el.clientWidth <= 100) continue;
        const overflowX = getComputedStyle(el).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          el.style.overflowX = "hidden";
          el.style.touchAction = "pan-y";
        }
      }
    };
    const raf = requestAnimationFrame(lockHorizontal);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef is stable
  }, [pageHeight]);

  // Web arrow-key paging (swipe is disabled there); the effect above scrolls to
  // the new page once `onChangeDate` updates `date`.
  const goToPage = useCallback(
    (delta: number) => {
      const target = pageDates[activeIndex + delta];
      if (target) onChangeDate(target);
    },
    [pageDates, activeIndex, onChangeDate],
  );
  useWebPagerKeys(swipeEnabled, goToPage);

  // Honour the OS "reduce motion" setting: the pager's one animated transition
  // (the snap-back below) becomes an instant jump when it's on.
  const reduceMotion = useReducedMotion();

  // Optionally snap the pager back to the active page after an empty-cell press
  // (so tapping a far-swiped page returns to the committed date).
  const handlePressCell = useMemo(() => {
    if (!onPressCell) return undefined;
    if (!resetPageOnPressCell) return onPressCell;
    return (cellDate: Date) => {
      onPressCell(cellDate);
      void listRef.current?.scrollToIndex({ index: activeIndex, animated: !reduceMotion });
    };
  }, [onPressCell, resetPageOnPressCell, activeIndex, reduceMotion]);

  const snapToIndices = useMemo(() => pageDates.map((_, index) => index), [pageDates]);
  const keyExtractorList = useCallback((item: Date) => item.toISOString(), []);
  const getFixedItemSize = useCallback(() => containerWidth, [containerWidth]);
  const renderItem = useCallback(
    ({ item, index }: LegendListRenderItemProps<Date>) => (
      <View style={{ width: containerWidth, height: pageHeight }}>
        <TimetablePage
          mode={mode}
          numberOfDays={numberOfDays}
          date={item}
          width={containerWidth}
          events={events}
          cellHeight={cellHeight}
          hourHeight={hourHeight}
          committedCellHeight={committedCellHeight}
          scrollY={scrollY}
          isActive={index === activeIndex}
          initialScrollY={offsetSeedRef.current ?? seedDefaultY}
          onSettleOffset={captureOffsetSeed}
          weekStartsOn={weekStartsOn}
          weekEndsOn={weekEndsOn}
          hourColumnWidth={hourColumnWidth}
          minHour={clampedMinHour}
          maxHour={clampedMaxHour}
          ampm={ampm}
          timeslots={timeslots}
          isRTL={isRTL}
          showAllDayEventCell={showAllDayEventCell}
          showVerticalScrollIndicator={showVerticalScrollIndicator}
          verticalScrollEnabled={verticalScrollEnabled}
          hourComponent={hourComponent}
          calendarCellStyle={calendarCellStyle}
          businessHours={businessHours}
          minHourHeight={minHourHeight}
          maxHourHeight={maxHourHeight}
          showNowIndicator={showNowIndicator}
          renderEvent={labeledRenderEvent}
          keyExtractor={keyExtractor}
          snapMinutes={Math.max(1, dragStepMinutes)}
          showDragHandle={showDragHandle}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
          onDragEvent={onDragEvent}
          onDragStart={onDragStart}
          onPressCell={handlePressCell}
          onLongPressCell={onLongPressCell}
          onCreateEvent={onCreateEvent}
        />
      </View>
    ),
    [
      containerWidth,
      pageHeight,
      mode,
      numberOfDays,
      events,
      cellHeight,
      hourHeight,
      committedCellHeight,
      scrollY,
      activeIndex,
      seedDefaultY,
      captureOffsetSeed,
      weekStartsOn,
      weekEndsOn,
      hourColumnWidth,
      clampedMinHour,
      clampedMaxHour,
      ampm,
      timeslots,
      isRTL,
      showAllDayEventCell,
      showVerticalScrollIndicator,
      verticalScrollEnabled,
      hourComponent,
      calendarCellStyle,
      businessHours,
      minHourHeight,
      maxHourHeight,
      showNowIndicator,
      labeledRenderEvent,
      keyExtractor,
      dragStepMinutes,
      showDragHandle,
      onPressEvent,
      onLongPressEvent,
      onDragEvent,
      onDragStart,
      handlePressCell,
      onLongPressCell,
      onCreateEvent,
    ],
  );

  // Pages are keyed by date, so LegendList keeps the items it has already rendered
  // and only re-renders them when `data` or `extraData` changes. Feed both `events`
  // (so a moved event repaints in place) and `activeIndex` (so each page's
  // `isActive` updates as you swipe). Without `activeIndex`, a page that pages in
  // never learns it became active and stays at its seeded scroll offset.
  const listExtraData = useMemo(() => ({ events, activeIndex }), [events, activeIndex]);

  return (
    <SlotStylesProvider classNames={classNames} styles={styleOverrides}>
      <View ref={containerRef} style={styles.container}>
        {renderHeader ? (
          renderHeader(headerDays)
        ) : (
          <DefaultHeader
            days={headerDays}
            mode={mode}
            width={containerWidth}
            hourColumnWidth={hourColumnWidth}
            showWeekNumber={showWeekNumber}
            weekNumberPrefix={weekNumberPrefix}
            weekdayFormat={weekdayFormat}
            locale={locale}
            activeDate={activeDate}
            onPressDateHeader={onPressDateHeader}
          />
        )}

        {headerComponent}

        <View
          style={styles.pager}
          onLayout={(event) => {
            setPageHeight(event.nativeEvent.layout.height);
            setContainerWidth(event.nativeEvent.layout.width);
            setMeasured(true);
          }}
        >
          <LegendList
            // Remount only on the seed→measured transition (see `measured`), not on
            // every height change, so a day↔week header-height difference resizes the
            // items in place instead of remounting and blanking the page.
            key={measured ? "grid" : "grid-seed"}
            ref={listRef}
            style={isWeb ? [styles.pagerList, styles.webNoScroll] : styles.pagerList}
            data={pageDates}
            extraData={listExtraData}
            horizontal
            recycleItems={false}
            keyExtractor={keyExtractorList}
            getFixedItemSize={getFixedItemSize}
            // On web LegendList ignores these RN scroll props (it leaks them to the
            // DOM as unknown attributes), so omit them there and disable horizontal
            // scroll via `webNoScroll`; paging is driven by the arrow keys instead.
            // Native: paging makes each swipe hard-stop at the adjacent page, while
            // `freeSwipe` lets momentum carry across pages and snap to a boundary.
            {...(isWeb
              ? null
              : {
                  scrollEnabled: swipeEnabled,
                  pagingEnabled: !freeSwipe,
                  snapToIndices: freeSwipe ? snapToIndices : undefined,
                })}
            initialScrollIndex={activeIndex}
            showsHorizontalScrollIndicator={false}
            viewabilityConfig={PAGE_VIEWABILITY}
            onViewableItemsChanged={handleViewableItemsChanged}
            renderItem={renderItem}
          />
        </View>
      </View>
    </SlotStylesProvider>
  );
}

/**
 * The timetable view used in day, 3days, week, and custom modes: an
 * hour-by-hour grid with positioned event boxes, an all-day lane, pinch-to-zoom
 * density, and optional drag-to-move/resize/create. Pages horizontally between
 * date ranges, reporting the committed range through `onChangeDate`.
 *
 * @example
 * ```tsx
 * import { TimeGrid } from "@super-calendar/native";
 *
 * <TimeGrid
 *   mode="week"
 *   date={date}
 *   events={events}
 *   onChangeDate={setDate}
 *   onPressEvent={(e) => console.log(e.title)}
 * />
 * ```
 */
export const TimeGrid = memo(TimeGridInner) as typeof TimeGridInner;

type DefaultHeaderProps = {
  days: Date[];
  mode: CalendarMode;
  width: number;
  hourColumnWidth: number;
  showWeekNumber?: boolean;
  weekNumberPrefix?: string;
  weekdayFormat?: WeekdayFormat;
  locale?: Locale;
  activeDate?: Date;
  onPressDateHeader?: (date: Date) => void;
};

const DefaultHeader = ({
  days,
  mode,
  width,
  hourColumnWidth,
  showWeekNumber,
  weekNumberPrefix = "W",
  weekdayFormat,
  locale,
  activeDate,
  onPressDateHeader,
}: DefaultHeaderProps) => {
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  // Match the grid below: an hour-column spacer, then one column per day.
  const dayWidth = (width - hourColumnWidth) / days.length;

  return (
    <View
      {...slot("header", {
        base: styles.headerRow,
        themed: { borderBottomColor: theme.colors.gridLine },
      })}
    >
      <View style={[styles.weekNumberGutter, { width: hourColumnWidth }]}>
        {showWeekNumber && hourColumnWidth > 0 && days[0] ? (
          <Text
            {...slot("weekNumber", {
              themed: [theme.text.hourLabel, { color: theme.colors.textMuted }],
            })}
            allowFontScaling={false}
          >
            {/* Reference the visible Thursday: an ISO week is defined by its Thursday,
                so a Sunday-start week still shows the week number its Mon–Sat body
                belongs to. */}
            {`${weekNumberPrefix}${getISOWeek(days.find((d) => d.getDay() === 4) ?? days[0])}`}
          </Text>
        ) : null}
      </View>
      {days.map((day) => (
        <DayHeader
          key={day.toISOString()}
          day={day}
          mode={mode}
          width={dayWidth}
          weekdayFormat={weekdayFormat}
          locale={locale}
          activeDate={activeDate}
          onPressDateHeader={onPressDateHeader}
        />
      ))}
    </View>
  );
};

type DayHeaderProps = {
  day: Date;
  mode: CalendarMode;
  width: number;
  weekdayFormat?: WeekdayFormat;
  locale?: Locale;
  activeDate?: Date;
  onPressDateHeader?: (date: Date) => void;
};

const DayHeader = ({
  day,
  width,
  weekdayFormat = "short",
  locale,
  activeDate,
  onPressDateHeader,
}: DayHeaderProps) => {
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  const isToday = getIsToday(day);
  // Highlight the chosen `activeDate` when supplied, else the real today.
  const isHighlighted = activeDate ? isSameCalendarDay(day, activeDate) : isToday;

  // One accessible name for the whole header (the weekday + number below are
  // decorative). `accessible` groups the children so a screen reader announces
  // this once, not label-by-label.
  const accessibilityLabel = `${format(day, "EEEE d MMMM", { locale })}${isToday ? ", today" : ""}`;
  const headerSlot = slot("columnHeader", {
    base: [styles.dayHeader, { width }],
    themed: theme.containers.columnHeader,
  });
  // Mirrors the dom renderer's header: the muted weekday label sits above the day
  // number, and the number's circle fills for today / the active date. Theme text
  // merges after the muted colour so a themed colour wins.
  const content = (
    <>
      <Text
        {...slot("columnHeaderWeekday", {
          themed: [{ color: theme.colors.textMuted }, theme.text.columnHeaderWeekday],
        })}
        allowFontScaling={false}
      >
        {format(day, weekdayFormatToken(weekdayFormat), { locale })}
      </Text>
      <View
        testID="column-header-badge"
        {...slot("columnHeaderDate", {
          base: styles.dayHeaderBadge,
          themed: [
            theme.containers.columnHeaderBadge,
            isHighlighted && { backgroundColor: theme.colors.todayBackground },
          ],
        })}
      >
        <Text
          {...slot("columnHeaderDateText", {
            themed: [
              theme.text.dayNumber,
              // The state colour stays last so a themed dayNumber can't break the
              // today/active contrast.
              { color: isHighlighted ? theme.colors.todayText : theme.colors.text },
            ],
          })}
          allowFontScaling={false}
        >
          {day.getDate()}
        </Text>
      </View>
    </>
  );
  // Interactive → a labelled button. Otherwise a labelled `header`, so screen
  // readers still perceive (and announce) which day each column is.
  return onPressDateHeader ? (
    <Pressable
      {...headerSlot}
      onPress={() => onPressDateHeader(day)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {content}
    </Pressable>
  ) : (
    <View
      {...headerSlot}
      accessible
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel}
    >
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  pagerList: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    // Center the weekday/number block vertically; the day header's own symmetric
    // paddingVertical provides the spacing, matching the dom renderer (no extra
    // bottom padding that would push the content up).
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  weekNumberGutter: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  dayHeader: {
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
  },
  dayHeaderBadge: {
    // A fixed circle so the today/active fill never shifts the header's height.
    width: 28,
    height: 28,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "100%",
    position: "relative",
  },
  cellPressLayer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
  },
  createGhost: {
    position: "absolute",
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: EVENT_GAP,
  },
  weekendColumn: {
    position: "absolute",
    top: 0,
  },
  shadeBand: {
    position: "absolute",
  },
  daySeparator: {
    position: "absolute",
    top: 0,
    width: StyleSheet.hairlineWidth,
  },
  hourRow: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  hourLabel: {
    marginTop: -HOUR_LABEL_NUDGE,
    textAlign: "right",
    paddingRight: 6,
  },
  hourLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  timeslotLine: {
    position: "absolute",
    right: 0,
    height: StyleSheet.hairlineWidth,
    opacity: 0.5,
  },
  resizeHandle: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: RESIZE_HANDLE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  resizeGrip: {
    width: 24,
    height: 3,
    borderRadius: 2,
    opacity: 0.4,
  },
  eventBox: {
    position: "absolute",
    overflow: "hidden",
    // Border-box padding insets the visible box (the flex child) on all sides,
    // giving a small gap without touching the slot geometry above.
    padding: EVENT_GAP,
  },
  nowIndicator: {
    position: "absolute",
    height: 2,
  },
  // `pointerEvents` as a style (not a prop) — the prop form is deprecated on web.
  nonInteractive: {
    pointerEvents: "none",
  },
  // Disable user-driven horizontal scroll on web; programmatic paging still works.
  webNoScroll: {
    overflow: "hidden",
  },
});
