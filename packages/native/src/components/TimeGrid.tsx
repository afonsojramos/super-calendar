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
import {
  createContext,
  type Dispatch,
  memo,
  type ReactElement,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  type StyleProp,
  Text,
  type TextStyle,
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
  BusinessHoursBand,
  CalendarEvent,
  CalendarMode,
  EventDragHandler,
  EventDragStartHandler,
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
  backgroundBandsForDay,
  cellRangeFromDrag,
  clampMoveStartMinutes,
  useNow,
  closedHourBands,
  overlapsOtherEvents,
  pageStepDays,
  resolveDraggedBounds,
  snapDeltaMinutes,
} from "@super-calendar/core";
import { formatHour, layoutDayEvents, type PositionedEvent } from "@super-calendar/core";
import type { EventAccessibilityLabeler } from "@super-calendar/core";
import { type WeekdayFormat, weekdayFormatToken } from "@super-calendar/core";
import {
  type ResolvedSlot,
  SlotStylesProvider,
  type SlotStyleProps,
  useSlots,
} from "../utils/slots";
import { useWebGridZoom } from "../utils/useWebGridZoom";
import { useWebPagerKeys } from "../utils/useWebPagerKeys";
import { withEventAccessibilityLabel } from "../utils/withEventAccessibilityLabel";
import { AllDayLane } from "./AllDayLane";
import { type MultiDayMove, MultiDayMovePreview } from "./MultiDayMovePreview";

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
// content; keep them tall enough to stay legible and tappable. Overridable per
// grid via `minEventHeight`.
const DEFAULT_MIN_EVENT_HEIGHT = 32;
// Inset each event box within its slot so adjacent boxes (and column edges) get a
// little breathing room instead of butting edge-to-edge. Overridable per grid via
// `eventGap`.
const DEFAULT_EVENT_GAP = 2;
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
// zIndex applied to an event while it's being dragged/resized so it sits above
// every other event (RN stacks siblings by order, so without this a dragged box
// moved over a later event would fall behind it).
const DRAG_EVENT_Z = 100;
// How long to hold the dragged event past the visible columns before the view
// pages one period toward that edge.
const EDGE_DWELL_MS = 500;
// How close (px) the dragging finger must get to the pager's left/right edge to
// count as "past the columns". Detecting by finger position, not by how many
// columns the drag has crossed, so an event in any column can reach either edge
// (a column-delta test can't reach the far edge from a near-side column).
const EDGE_ZONE_PX = 36;

/**
 * Lets a per-event drag worklet, deep inside the pager, drive a cross-week drag:
 * locate the pager's edges, freeze the swipe scroll while paging (a native
 * programmatic scroll is otherwise deferred until the touch ends, so the view
 * would only advance once the finger lifts), and hand the event off to a floating
 * ghost that survives the source page paging away, then commit on release.
 */
type EdgePaging = {
  // Pager frame in window space, so the worklet can find the edges and place the
  // ghost (its top-left is the window origin the finger coords are relative to).
  pagerLeft: SharedValue<number>;
  pagerTop: SharedValue<number>;
  pagerWidth: SharedValue<number>;
  lockScroll: (locked: boolean) => void;
  // The floating "held" copy of the dragged event: pager-local top-left, size, and
  // visibility, driven on the UI thread so it tracks the finger across the page.
  ghostX: SharedValue<number>;
  ghostY: SharedValue<number>;
  ghostW: SharedValue<number>;
  ghostH: SharedValue<number>;
  ghostVisible: SharedValue<number>;
  // Show the ghost for `event`, then drop it at pager-local `ghostLocalX` shifted
  // in time by `minuteDelta` (clearing the ghost either way).
  beginLift: (event: CalendarEvent<unknown>) => void;
  commitLiftedDrop: (ghostLocalX: number, minuteDelta: number) => void;
};
const EdgePagingContext = createContext<EdgePaging | null>(null);

const noop = () => {};

/**
 * The tail of a move that runs past midnight, drawn at the top of the next day's
 * column so the drop reads on both days before the finger lifts. Mounted only
 * while a drag is actually spilling (see `spillHeight`), so an idle grid pays
 * nothing for it; its geometry is driven on the UI thread from there.
 */
function MoveSpillPreview<T>({
  spillHeight,
  moveOffsetX,
  cellHeight,
  dayLeftPx,
  dayWidth,
  nextDayDirection,
  minHour,
  event,
  mode,
  renderEvent,
  eventGap,
  slotProps,
}: {
  spillHeight: SharedValue<number>;
  moveOffsetX: SharedValue<number>;
  cellHeight: SharedValue<number>;
  dayLeftPx: number;
  dayWidth: number;
  nextDayDirection: number;
  minHour: number;
  event: CalendarEvent<T>;
  mode: CalendarMode;
  renderEvent: RenderEvent<T>;
  eventGap: number;
  slotProps: ResolvedSlot<ViewStyle>;
}): ReactElement {
  const RenderEventComponent = renderEvent;
  const style = useAnimatedStyle(
    () => ({
      height: spillHeight.value,
      opacity: spillHeight.value > 0 ? 1 : 0,
      zIndex: spillHeight.value > 0 ? DRAG_EVENT_Z : 0,
      transform: [
        { translateX: moveOffsetX.value + nextDayDirection * dayWidth },
        // The box's `top` is the `minHour` gridline, but the tail starts at
        // midnight. With a window that starts after 00:00 this pushes the preview
        // out of view, exactly like the continuation the drop will commit.
        { translateY: -minHour * cellHeight.value },
      ],
    }),
    [dayWidth, nextDayDirection, minHour],
  );
  return (
    <Animated.View
      {...slotProps}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.eventBox,
        styles.nonInteractive,
        { left: dayLeftPx, width: dayWidth, top: 0, padding: eventGap },
        slotProps.style,
        style,
      ]}
    >
      <RenderEventComponent
        event={event}
        mode={mode}
        boxHeight={spillHeight}
        continuesBefore
        continuesAfter={false}
        onPress={noop}
      />
    </Animated.View>
  );
}

/**
 * The floating copy of a dragged event, rendered above the pager so a cross-week
 * drag stays visible after its source page pages away. Position, size, and
 * visibility are driven on the UI thread by the shared values so it tracks the
 * finger without a React re-render.
 */
function DragGhost<T>({
  x,
  y,
  w,
  h,
  visible,
  event,
  mode,
  renderEvent,
  eventGap,
}: {
  x: SharedValue<number>;
  y: SharedValue<number>;
  w: SharedValue<number>;
  h: SharedValue<number>;
  visible: SharedValue<number>;
  event: CalendarEvent<T>;
  mode: CalendarMode;
  renderEvent: RenderEvent<T>;
  eventGap: number;
}): ReactElement {
  const RenderEventComponent = renderEvent;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
    width: w.value,
    height: h.value,
    opacity: visible.value,
  }));
  return (
    <Animated.View
      style={[styles.eventBox, styles.dragGhost, { padding: eventGap }, style]}
      pointerEvents="none"
    >
      <RenderEventComponent event={event} mode={mode} boxHeight={h} onPress={noop} />
    </Animated.View>
  );
}

// The drag handler types live in `../types` so the Reanimated-free month view can
// share them; re-exported here because both are part of this module's public API.
export type { EventDragHandler, EventDragStartHandler } from "../types";

// Hour labels are nudged up so the number sits centred on its grid line. Pad the
// scroll content by the same amount so the top-most label is never clipped.
const HOUR_LABEL_TOP_INSET = 12;
const HOUR_LABEL_NUDGE = 6;

type AnimatedEventBoxProps<T> = {
  positioned: PositionedEvent<T>;
  eventIndex: number;
  movingEvent: CalendarEvent<T> | null;
  onMovePreview: Dispatch<SetStateAction<MultiDayMove<T> | null>>;
  cellHeight: SharedValue<number>;
  minHour: number;
  maxHour: number;
  left: number;
  width: number;
  // Left edge of the whole day column (the box's own `left` is inset by its
  // overlap column), so the "runs past midnight" preview can span the next column.
  dayLeftPx: number;
  // Which way the next calendar day lies, in columns: +1 normally, -1 under RTL.
  nextDayDirection: number;
  // Drag-to-move across days needs the column width and this box's day index
  // within the visible range, so a horizontal drag maps to (and clamps to) days.
  dayWidth: number;
  dayIndex: number;
  dayCount: number;
  // Calendar-day offset of each visible column from the first (plain numbers, so
  // the worklet can close over them). Lets a cross-day move map a column delta to
  // the right calendar-day delta when hiddenDays makes the columns non-contiguous.
  dayOrdinals: number[];
  mode: CalendarMode;
  // Calendar days one page spans, for the "move to next/previous page" screen-
  // reader actions (the accessible equivalent of dragging an event to the edge).
  daysPerPage: number;
  renderEvent: RenderEvent<T>;
  snapMinutes: number;
  // Floor for the box's pixel height (and the `boxHeight` handed to renderEvent).
  minEventHeight: number;
  // Inset between the box and its slot, applied as border-box padding.
  eventGap: number;
  onPress: (event: CalendarEvent<T>) => void;
  onLongPress?: (event: CalendarEvent<T>) => void;
  onDragEvent?: EventDragHandler<T>;
  onDragStart?: EventDragStartHandler<T>;
  showDragHandle: boolean;
  // Grid-level defaults for move/resize, overridden per event by
  // `startEditable`/`durationEditable`.
  eventStartEditable: boolean;
  eventDurationEditable: boolean;
  // Page the view one period (dir -1/+1) when the event is dragged past the
  // visible columns and held there. Absent disables edge auto-advance.
  onEdgeAdvance?: (dir: number) => void;
};

function AnimatedEventBox<T>({
  positioned,
  eventIndex,
  movingEvent,
  onMovePreview,
  cellHeight,
  minHour,
  maxHour,
  left,
  width,
  dayLeftPx,
  nextDayDirection,
  dayWidth,
  dayIndex,
  dayCount,
  dayOrdinals,
  mode,
  daysPerPage,
  renderEvent,
  snapMinutes,
  minEventHeight,
  eventGap,
  onPress,
  onLongPress,
  onDragEvent,
  onDragStart,
  onEdgeAdvance,
  showDragHandle,
  eventStartEditable,
  eventDurationEditable,
}: AnimatedEventBoxProps<T>) {
  const RenderEventComponent = renderEvent;
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  // Pager geometry + scroll lock, so a cross-week edge drag can find the edges
  // and page the view live under the finger (see EdgePaging). The two edge
  // shared values are pulled out so the move worklet closes over them directly
  // rather than over the whole context object (which also holds a JS callback).
  const edgePaging = useContext(EdgePagingContext);
  const pagerLeftSV = edgePaging?.pagerLeft;
  const pagerTopSV = edgePaging?.pagerTop;
  const pagerWidthSV = edgePaging?.pagerWidth;
  const ghostXSV = edgePaging?.ghostX;
  const ghostYSV = edgePaging?.ghostY;
  const commitLiftedDrop = edgePaging?.commitLiftedDrop;
  // Drag-to-move/resize. Native picks the event up on long-press (so a tap or
  // scroll isn't hijacked); web activates after a small drag threshold, so a
  // plain click still selects and a right-click still opens a context menu.
  // `draggable: false` locks a single event (keeps taps, blocks move/resize);
  // `startEditable`/`durationEditable` (per event, falling back to the grid
  // defaults) split whether it can be moved vs resized.
  const editable =
    onDragEvent != null && !positioned.event.disabled && positioned.event.draggable !== false;
  const canMove = editable && (positioned.event.startEditable ?? eventStartEditable);
  const canResize = editable && (positioned.event.durationEditable ?? eventDurationEditable);
  // Only the segment that owns the real end may be resized.
  const resizable = canResize && !positioned.continuesAfter;
  // Only the segment that owns the real start may be resized from the top edge.
  // Disabled on react-native-web: moving the box's top during its own child
  // gesture drops the gesture there (a web-only gesture-handler quirk); on a
  // device the top grip wins over the long-press move as usual. The dom renderer
  // provides top-edge resize on the web.
  const resizableFromStart = canResize && !positioned.continuesBefore && !isWeb;

  // Live preview offsets (px), reset to 0 once the committed change re-renders.
  // moveOffsetX shifts the box across day columns during a cross-day drag.
  const moveOffset = useSharedValue(0);
  const moveOffsetX = useSharedValue(0);
  // Bottom-edge resize (changes the end) and top-edge resize (changes the start).
  const resizeDelta = useSharedValue(0);
  const resizeStartDelta = useSharedValue(0);
  // Raised to DRAG_EVENT_Z while a gesture is active so the dragged event floats
  // above all the others, then back to 0 when it settles.
  const dragZ = useSharedValue(0);
  // 1 while a move gesture is running. Only gates the spill preview: the box's own
  // clip is geometric, so it can't disagree with the box during the frames between
  // release and the committed re-render.
  const moving = useSharedValue(0);
  // Edge auto-advance: which side the drag has pushed past the visible columns
  // (-1 left / 0 none / +1 right).
  const edgeDir = useSharedValue(0);
  // 1 once the event has been lifted into the floating ghost (cross-week drag),
  // plus where in the box it was grabbed and the live finger position, so the
  // ghost can be seeded from the JS dwell timer and track the finger after.
  const lifted = useSharedValue(0);
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const liveAbsX = useSharedValue(0);
  const liveAbsY = useSharedValue(0);

  // Pull the geometry out as primitives so the worklets below close over plain
  // numbers, not `positioned` itself. Referencing `positioned.*` inside a
  // worklet captures the whole object, and `positioned.event` holds `Date`s,
  // which react-native-worklets >=0.10 refuses to copy to the UI thread
  // ("Cannot copy value of type `Date`").
  const startHours = positioned.startHours;
  const durationHours = positioned.durationHours;
  const ownsStart = !positioned.continuesBefore;
  const multiDay = positioned.continuesBefore || positioned.continuesAfter;
  const hiddenForMove = positioned.event === movingEvent;
  // Where the move gesture clamps from, mirrored into a shared value so it isn't a
  // gesture dependency. A gesture memoized on a value the dragged event carries
  // would be rebuilt under the finger, and so torn down mid-drag, the moment a
  // consumer updates `events` (the same reason `commitDrag` reads the event
  // through `latest`). `ownsStart` is false on a segment the layout clipped from
  // an earlier day, whose 00:00 top edge isn't where the event starts.
  const dragStartSV = useDerivedValue(
    () => ({
      minutes: startHours * MINUTES_PER_HOUR,
      ownsStart,
    }),
    [startHours, ownsStart],
  );

  // Live pixel height of the box, driven on the UI thread by the shared
  // cellHeight (plus any in-progress resize). Handed to renderEvent so custom
  // renderers can reveal detail progressively as the grid zooms, without
  // re-rendering. Explicit deps so the worklet re-captures the event's geometry.
  const boxHeight = useDerivedValue(
    () =>
      Math.max(
        durationHours * cellHeight.value + resizeDelta.value - resizeStartDelta.value,
        minEventHeight,
      ),
    [durationHours, minEventHeight],
  );

  // The source segment may stop at midnight while the full event continues in
  // the next column. Keep the height passed to custom renderers identical to the
  // wrapper they fill, while `boxHeight` retains the complete duration for drag
  // math and the floating cross-page ghost.
  const visibleBoxHeight = useDerivedValue(() => {
    const top =
      (startHours - minHour) * cellHeight.value + moveOffset.value + resizeStartDelta.value;
    const dayEnd = (HOURS_PER_DAY - minHour) * cellHeight.value;
    return Math.max(Math.min(boxHeight.value, dayEnd - top), minEventHeight);
  }, [startHours, minHour, minEventHeight]);

  const boxStyle = useAnimatedStyle(() => {
    // A top-edge resize pushes the box down and shortens it (start moves later).
    const top =
      (startHours - minHour) * cellHeight.value + moveOffset.value + resizeStartDelta.value;
    // Cut the box off at midnight; whatever runs past it shows in the next column
    // instead (see MoveSpillPreview), the way a committed event spanning midnight
    // already renders. Purely geometric, so a resting box (already clipped to the
    // day by `layoutDayEvents`) is untouched and the height doesn't jump when a
    // drag commits.
    return {
      top,
      height: visibleBoxHeight.value,
      transform: [{ translateX: moveOffsetX.value }],
      zIndex: dragZ.value,
    };
  }, [startHours, minHour]);

  // Pixel height of the part of a move that runs past midnight, or 0 when nothing
  // spills. Measured against the end of the day, not `maxHour`: a narrowed window
  // leaves plenty of events hanging below the last visible hour without them
  // reaching the next day. Bails on the first line for a box that isn't being
  // moved, which is every box but one.
  const spillHeight = useDerivedValue(() => {
    if (multiDay || !moving.value || lifted.value || cellHeight.value <= 0) return 0;
    const liveStartHours = startHours + moveOffset.value / cellHeight.value;
    const overflowHours = liveStartHours + durationHours - HOURS_PER_DAY;
    if (overflowHours <= 0) return 0;
    const columnDelta = dayWidth > 0 ? Math.round(moveOffsetX.value / dayWidth) : 0;
    const target = Math.min(Math.max(dayIndex + columnDelta, 0), dayCount - 1);
    const next = target + nextDayDirection;
    // Only when that column really is the next calendar day (`hiddenDays` can
    // break the run), since the tail would otherwise land off-view.
    if (next < 0 || next >= dayCount || dayOrdinals[next] - dayOrdinals[target] !== 1) return 0;
    return Math.min(overflowHours, maxHour - minHour) * cellHeight.value;
  }, [
    startHours,
    durationHours,
    minHour,
    maxHour,
    dayWidth,
    dayIndex,
    dayCount,
    dayOrdinals,
    nextDayDirection,
    multiDay,
  ]);

  // Mount the spill preview only while a drag is actually spilling, off the UI
  // thread. It's one extra view plus the consumer's event renderer, so mounting it
  // on every box would inflate the grid's node count for something that is almost
  // never showing. Mounting it at the grab would also re-render at the most
  // jank-sensitive moment of the gesture.
  const [previewMounted, setPreviewMounted] = useState(false);
  useAnimatedReaction(
    () => spillHeight.value > 0,
    (spilling, previous) => {
      // `previous` is null on the reaction's first run, which would otherwise cost
      // every box on every page a thread hop to set the state it already has.
      if (previous !== null && spilling !== previous) runOnJS(setPreviewMounted)(spilling);
    },
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
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    resizeStartDelta.value = 0;
  }, [
    positioned.startHours,
    positioned.durationHours,
    moveOffset,
    moveOffsetX,
    resizeDelta,
    resizeStartDelta,
  ]);

  // Keep the latest event/handler in a ref so the gestures stay memoized but
  // never call into a stale closure.
  const latest = useRef({ event: positioned.event, eventIndex, onDragEvent, onDragStart });
  latest.current = { event: positioned.event, eventIndex, onDragEvent, onDragStart };

  // Snap the box back to where it started (drop rejected or degenerate).
  const snapBack = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    moveOffset.value = 0;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    moveOffsetX.value = 0;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    resizeDelta.value = 0;
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    resizeStartDelta.value = 0;
  }, [moveOffset, moveOffsetX, resizeDelta, resizeStartDelta]);

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
      if (handler(event, next.start, next.end) === false) {
        snapBack();
        onMovePreview(null);
      } else if (multiDay && deltaStartMin === deltaEndMin) {
        onMovePreview((move) => (move ? { ...move, phase: "dropped" } : null));
      }
    },
    [snapMinutes, snapBack, multiDay, onMovePreview],
  );

  // Fired on the JS thread when the gesture grabs the event, so consumers can
  // trigger haptics or other side effects the instant drag mode begins.
  const notifyDragStart = useCallback(() => {
    latest.current.onDragStart?.(latest.current.event);
  }, []);

  const beginMovePreview = useCallback(() => {
    if (multiDay) {
      onMovePreview({
        event: latest.current.event,
        eventIndex: latest.current.eventIndex,
        phase: "dragging",
        dayIndex,
        offsetX: moveOffsetX,
        offsetY: moveOffset,
        lifted,
      });
    }
  }, [multiDay, onMovePreview, dayIndex, moveOffsetX, moveOffset, lifted]);
  const endMovePreview = useCallback(() => onMovePreview(null), [onMovePreview]);

  // Edge auto-advance dwell. Dragging the event past the visible columns and
  // holding there pages the view one period and carries the event onto it: same
  // weekday, keeping whatever time the vertical drag has reached. It fires once
  // per drag (the box unmounts as the page changes), matching "hold at the edge
  // to move to the next/previous week"; the tested commit path does the move.
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disarmEdge = useCallback(() => {
    if (dwellTimer.current) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
  }, []);
  // Cancel a pending dwell and hand the pager's swipe scroll back. Runs on every
  // gesture end so a lock taken by an edge-page is always released.
  const releaseEdge = useCallback(() => {
    disarmEdge();
    edgePaging?.lockScroll(false);
  }, [disarmEdge, edgePaging]);
  const armEdge = useCallback(
    (dir: number) => {
      disarmEdge();
      dwellTimer.current = setTimeout(() => {
        dwellTimer.current = null;
        if (!edgePaging) return;
        // Freeze the pager's own swipe before paging: on native a programmatic
        // scroll is deferred while the touch is tracked, so without this the view
        // wouldn't advance until the finger lifts.
        edgePaging.lockScroll(true);
        // First edge fire: lift the event into the floating ghost. It must NOT
        // commit here — committing relocates the event off this page, which
        // unmounts the dragging box and kills the gesture. Instead the ghost
        // (seeded at the current finger position) carries the event across the
        // page, and the drop commits on release. The source box stays mounted, so
        // the same gesture keeps tracking after the page changes.
        if (!lifted.value) {
          lifted.value = 1;
          edgePaging.ghostW.value = width;
          edgePaging.ghostH.value = boxHeight.value;
          edgePaging.ghostX.value = liveAbsX.value - grabX.value - edgePaging.pagerLeft.value;
          edgePaging.ghostY.value = liveAbsY.value - grabY.value - edgePaging.pagerTop.value;
          edgePaging.ghostVisible.value = 1;
          edgePaging.beginLift(latest.current.event as CalendarEvent<unknown>);
        }
        onEdgeAdvance?.(dir);
      }, EDGE_DWELL_MS);
    },
    [
      disarmEdge,
      edgePaging,
      lifted,
      width,
      boxHeight,
      liveAbsX,
      liveAbsY,
      grabX,
      grabY,
      onEdgeAdvance,
    ],
  );

  const moveGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(canMove)
      .onStart((event) => {
        dragZ.value = DRAG_EVENT_Z;
        moving.value = 1;
        edgeDir.value = 0;
        lifted.value = 0;
        // Where in the box the finger grabbed, and the live finger position, so
        // the ghost can be seeded and tracked in window space (see armEdge).
        grabX.value = event.x;
        grabY.value = event.y;
        liveAbsX.value = event.absoluteX;
        liveAbsY.value = event.absoluteY;
        runOnJS(beginMovePreview)();
        runOnJS(notifyDragStart)();
      })
      .onUpdate((event) => {
        liveAbsX.value = event.absoluteX;
        liveAbsY.value = event.absoluteY;
        // Once lifted, the box itself has paged off-screen; the ghost (a sibling of
        // the pager) tracks the finger in pager-local space instead.
        if (lifted.value && pagerLeftSV && pagerTopSV && ghostXSV && ghostYSV) {
          ghostXSV.value = event.absoluteX - grabX.value - pagerLeftSV.value;
          ghostYSV.value = event.absoluteY - grabY.value - pagerTopSV.value;
        } else if (cellHeight.value > 0) {
          // Hold the start inside the day; the end is free to run past it (the
          // spill preview shows where it lands). Same rule the commit applies, so
          // the box never previews a position it can't be dropped in.
          const { minutes: startMinutes, ownsStart } = dragStartSV.value;
          const dragged = startMinutes + (event.translationY / cellHeight.value) * MINUTES_PER_HOUR;
          const held = ownsStart
            ? clampMoveStartMinutes(dragged, minHour, maxHour, snapMinutes)
            : dragged;
          moveOffset.value = ((held - startMinutes) / MINUTES_PER_HOUR) * cellHeight.value;
          moveOffsetX.value = event.translationX;
        }
        // Dragging the finger to the pager's left/right edge arms an edge dwell
        // that pages the view. Measured by absolute finger position (not by how
        // many columns the drag crossed), so an event in any column can reach
        // either edge. `onEdgeAdvance` is only wired when paging is available.
        if (onEdgeAdvance && pagerLeftSV && pagerWidthSV) {
          const fx = event.absoluteX - pagerLeftSV.value;
          const dir = fx > pagerWidthSV.value - EDGE_ZONE_PX ? 1 : fx < EDGE_ZONE_PX ? -1 : 0;
          if (dir !== edgeDir.value) {
            edgeDir.value = dir;
            if (dir === 0) runOnJS(disarmEdge)();
            else runOnJS(armEdge)(dir);
          }
        }
      })
      .onEnd((event) => {
        // A cross-week drag is committed in onFinalize (which fires whether the
        // gesture ends cleanly or is cancelled as the page moves under it), so the
        // drop lands even when onEnd doesn't fire on device. Nothing to do here.
        if (lifted.value) return;
        const { minutes: startMinutes, ownsStart } = dragStartSV.value;
        // Snap the vertical drag, then hold the start inside the day: a move keeps
        // its duration, so the end may run past midnight and continue on the next
        // day, but the event still starts in the column it was dropped on. A
        // segment clipped from an earlier day is exempt: it doesn't own the start,
        // so holding it would stop the whole event from being dragged earlier.
        const snapped = snapDeltaMinutes(event.translationY, cellHeight.value, snapMinutes);
        const minuteDelta = ownsStart
          ? clampMoveStartMinutes(startMinutes + snapped, minHour, maxHour, snapMinutes) -
            startMinutes
          : snapped;
        // Map the horizontal drag to whole day columns, clamped so the event
        // can't leave the visible range.
        const rawDayDelta = dayWidth > 0 ? Math.round(event.translationX / dayWidth) : 0;
        const targetDay = Math.min(Math.max(dayIndex + rawDayDelta, 0), dayCount - 1);
        const dayDelta = targetDay - dayIndex;
        if (minuteDelta === 0 && dayDelta === 0) {
          moveOffset.value = 0;
          moveOffsetX.value = 0;
          runOnJS(endMovePreview)();
          return;
        }
        // Hold the snapped position so the box doesn't flash back to the
        // original before the committed re-render lands.
        moveOffset.value = (minuteDelta / MINUTES_PER_HOUR) * cellHeight.value;
        moveOffsetX.value = dayDelta * dayWidth;
        // Map the column shift to a calendar-day shift: with hiddenDays the
        // columns aren't contiguous days, so a one-column move can span several
        // calendar days. Fold that into the minute delta; shiftMinutes carries it
        // into the date, so both edges move together and the duration is preserved.
        const calendarDayDelta = dayOrdinals[targetDay] - dayOrdinals[dayIndex];
        const totalDelta = minuteDelta + calendarDayDelta * MINUTES_PER_DAY;
        runOnJS(commitDrag)(totalDelta, totalDelta);
      })
      .onFinalize((_event, success) => {
        dragZ.value = 0;
        // Commit the cross-week drop here: onFinalize fires on every gesture end,
        // including the cancel RNGH reports when the source page moves under the
        // touch, so committing from the last finger position (ghost column + the
        // vertical drag) guarantees the drop lands instead of silently vanishing.
        if (lifted.value && ghostXSV && ghostYSV && commitLiftedDrop) {
          runOnJS(commitLiftedDrop)(ghostXSV.value, ghostYSV.value);
          moveOffset.value = 0;
          moveOffsetX.value = 0;
          lifted.value = 0;
          runOnJS(endMovePreview)();
        }
        // The preview unmounts from the `spillHeight` reaction once the commit
        // lands and clears `moveOffset`; this is the safety net for a cancel,
        // where `onEnd` never runs.
        moving.value = 0;
        if (multiDay && !success) {
          moveOffset.value = 0;
          moveOffsetX.value = 0;
          runOnJS(endMovePreview)();
        }
        runOnJS(releaseEdge)();
      });
    // Native: long-press to pick up. Web: activate past a small drag in either
    // axis so clicks/right-clicks pass through but horizontal drags still move.
    return isWeb
      ? pan
          .activeOffsetX([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
          .activeOffsetY([-DRAG_ACTIVATE_PX, DRAG_ACTIVATE_PX])
      : pan.activateAfterLongPress(MOVE_ACTIVATE_MS);
  }, [
    canMove,
    snapMinutes,
    cellHeight,
    moveOffset,
    moveOffsetX,
    dragZ,
    moving,
    dragStartSV,
    minHour,
    maxHour,
    edgeDir,
    lifted,
    grabX,
    grabY,
    liveAbsX,
    liveAbsY,
    pagerLeftSV,
    pagerTopSV,
    pagerWidthSV,
    ghostXSV,
    ghostYSV,
    commitLiftedDrop,
    dayWidth,
    dayIndex,
    dayCount,
    dayOrdinals,
    commitDrag,
    multiDay,
    beginMovePreview,
    endMovePreview,
    notifyDragStart,
    onEdgeAdvance,
    armEdge,
    disarmEdge,
    releaseEdge,
  ]);

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(resizable)
        .onStart(() => {
          dragZ.value = DRAG_EVENT_Z;
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
        })
        .onFinalize(() => {
          dragZ.value = 0;
        }),
    [resizable, snapMinutes, cellHeight, resizeDelta, dragZ, commitDrag, notifyDragStart],
  );

  // Top-edge resize: dragging the top changes the start (end fixed). Mirrors the
  // bottom resize but commits a start-delta and previews via resizeStartDelta.
  const resizeStartGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(resizableFromStart)
        .onStart(() => {
          dragZ.value = DRAG_EVENT_Z;
          runOnJS(notifyDragStart)();
        })
        .onUpdate((event) => {
          resizeStartDelta.value = event.translationY;
        })
        .onEnd((event) => {
          const delta = snapDeltaMinutes(event.translationY, cellHeight.value, snapMinutes);
          if (delta === 0) {
            resizeStartDelta.value = 0;
            return;
          }
          resizeStartDelta.value = (delta / MINUTES_PER_HOUR) * cellHeight.value;
          runOnJS(commitDrag)(delta, 0);
        })
        .onFinalize(() => {
          dragZ.value = 0;
        }),
    [
      resizableFromStart,
      snapMinutes,
      cellHeight,
      resizeStartDelta,
      dragZ,
      commitDrag,
      notifyDragStart,
    ],
  );

  const handlePress = () => onPress(positioned.event);
  // When movable, a long press grabs the event to move it, so don't also fire
  // the consumer's long-press handler.
  const handleLongPress = !canMove && onLongPress ? () => onLongPress(positioned.event) : undefined;

  // Dragging is gesture-only, so expose the same move/resize commit path as
  // discrete screen-reader actions (VoiceOver/TalkBack invoke them from the
  // actions menu). Steps are one `snapMinutes` unit, matching a drag snap.
  const unit = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;
  // Label the whole-page move by what a page means in this mode.
  const pageUnit =
    mode === "week"
      ? "week"
      : daysPerPage === 1
        ? "day"
        : `${daysPerPage} day${daysPerPage === 1 ? "" : "s"}`;
  const dragActions = [
    ...(canMove
      ? [
          { name: "move-later", label: `Move ${unit(snapMinutes)} later` },
          { name: "move-earlier", label: `Move ${unit(snapMinutes)} earlier` },
        ]
      : []),
    ...(resizable
      ? [
          { name: "extend", label: `Extend by ${unit(snapMinutes)}` },
          { name: "shrink", label: `Shorten by ${unit(snapMinutes)}` },
        ]
      : []),
    ...(canMove
      ? [
          { name: "move-next-page", label: `Move to next ${pageUnit}` },
          { name: "move-previous-page", label: `Move to previous ${pageUnit}` },
        ]
      : []),
  ];
  const accessibilityActions = dragActions.length ? dragActions : undefined;
  const handleAccessibilityAction = accessibilityActions
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
          case "move-next-page":
            commitDrag(daysPerPage * MINUTES_PER_DAY, daysPerPage * MINUTES_PER_DAY);
            break;
          case "move-previous-page":
            commitDrag(-daysPerPage * MINUTES_PER_DAY, -daysPerPage * MINUTES_PER_DAY);
            break;
        }
      }
    : undefined;

  const eventSlot = slot("event", {
    base: [styles.eventBox, { left, width, padding: eventGap }],
    themed: theme.containers.timeGridEvent,
  });
  const box = (
    <Animated.View
      {...eventSlot}
      style={[eventSlot.style, boxStyle, hiddenForMove ? { opacity: 0 } : null]}
    >
      <RenderEventComponent
        event={positioned.event}
        mode={mode}
        boxHeight={visibleBoxHeight}
        continuesBefore={positioned.continuesBefore}
        continuesAfter={positioned.continuesAfter}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={handleAccessibilityAction}
        onPress={handlePress}
        onLongPress={handleLongPress}
      />
      {resizableFromStart ? (
        <GestureDetector gesture={resizeStartGesture}>
          <Animated.View style={styles.resizeHandleTop}>
            {showDragHandle ? (
              <View style={[styles.resizeGrip, { backgroundColor: theme.colors.eventText }]} />
            ) : null}
          </Animated.View>
        </GestureDetector>
      ) : null}
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

  // Only wrap in the move gesture when movable; the resize grips inside `box`
  // carry their own gestures, so a resize-only event still works.
  if (!canMove) return box;
  return (
    <>
      <GestureDetector gesture={moveGesture}>{box}</GestureDetector>
      {/* Skipped for a segment that already continues after: it owns a real
          next-day box, so a preview on top of it would just double up. */}
      {previewMounted && !positioned.continuesAfter ? (
        <MoveSpillPreview
          spillHeight={spillHeight}
          moveOffsetX={moveOffsetX}
          cellHeight={cellHeight}
          dayLeftPx={dayLeftPx}
          dayWidth={dayWidth}
          nextDayDirection={nextDayDirection}
          minHour={minHour}
          event={positioned.event}
          mode={mode}
          renderEvent={renderEvent}
          eventGap={eventGap}
          slotProps={slot("event", { themed: theme.containers.timeGridEvent })}
        />
      ) : null}
    </>
  );
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
          {...slot<TextStyle>("hourLabel", {
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
  /** Themed fill. Omit when a render override owns the band's look. */
  color?: string;
  /** Which slot/testID the band belongs to (closed hours vs background events). */
  slotName?: "businessHours" | "backgroundEvent";
  testID?: string;
  children?: React.ReactNode;
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
  slotName = "businessHours",
  testID = "business-hours-shade",
  children,
}: ShadeBandProps) => {
  const slot = useSlots<TimeGridSlot>();
  const animatedStyle = useAnimatedStyle(
    () => ({
      top: (startHour - minHour) * cellHeight.value,
      height: (endHour - startHour) * cellHeight.value,
    }),
    [startHour, endHour, minHour],
  );
  const bandSlot = slot(slotName, {
    base: [styles.shadeBand, styles.nonInteractive, { left, width }],
    themed: color === undefined ? undefined : { backgroundColor: color },
  });
  return (
    <Animated.View
      testID={testID}
      // Decorative, like the dom bands' aria-hidden: never announced or focused.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...bandSlot}
      style={[bandSlot.style, animatedStyle]}
    >
      {children}
    </Animated.View>
  );
};

type TimetablePageProps<T> = {
  mode: TimeGridMode;
  numberOfDays: number;
  hiddenDays?: number[];
  now?: Date;
  nowTimeZone?: string;
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
  highlightWeekends: boolean;
  showVerticalScrollIndicator: boolean;
  verticalScrollEnabled: boolean;
  hourComponent?: HourRenderer;
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  businessHours?: BusinessHours;
  renderBusinessHours?: (band: BusinessHoursBand) => React.ReactNode;
  minHourHeight: number;
  maxHourHeight: number;
  showNowIndicator: boolean;
  renderEvent: RenderEvent<T>;
  keyExtractor: EventKeyExtractor<T>;
  snapMinutes: number;
  minEventHeight: number;
  eventGap: number;
  showDragHandle: boolean;
  eventStartEditable: boolean;
  eventDurationEditable: boolean;
  onPressEvent: (event: CalendarEvent<T>) => void;
  onLongPressEvent?: (event: CalendarEvent<T>) => void;
  onDragEvent?: EventDragHandler<T>;
  onDragStart?: EventDragStartHandler<T>;
  onPressCell?: (date: Date) => void;
  onLongPressCell?: (date: Date) => void;
  onCreateEvent?: (start: Date, end: Date) => void;
  onEdgeAdvance?: (dir: number) => void;
  /** Report this page's hour-grid top (below the all-day lane), while it is the
   * active page, so a cross-week drop can map a ghost's Y to the right time. */
  onGridTop?: (y: number) => void;
};

// A single date's grid: the pinch-zoomable, vertically-scrolling time column.
// Three of these are mounted side by side inside the pager so the previous and
// next dates are ready to drag into view.
function TimetablePageInner<T>({
  mode,
  numberOfDays,
  hiddenDays,
  now: nowProp,
  nowTimeZone,
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
  highlightWeekends,
  showVerticalScrollIndicator,
  verticalScrollEnabled,
  hourComponent,
  calendarCellStyle,
  minHourHeight,
  maxHourHeight,
  showNowIndicator,
  businessHours,
  renderBusinessHours,
  renderEvent,
  keyExtractor,
  snapMinutes,
  minEventHeight,
  eventGap,
  showDragHandle,
  eventStartEditable,
  eventDurationEditable,
  onPressEvent,
  onLongPressEvent,
  onDragEvent,
  onDragStart,
  onPressCell,
  onLongPressCell,
  onCreateEvent,
  onEdgeAdvance,
  onGridTop,
}: TimetablePageProps<T>) {
  const theme = useCalendarTheme();
  const slot = useSlots<TimeGridSlot>();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // The hour grid sits below the all-day lane; capture its top on layout and
  // report it up while this page is active (the lane height differs per week).
  const gridTopRef = useRef(0);
  useEffect(() => {
    if (isActive) onGridTop?.(gridTopRef.current);
  }, [isActive, onGridTop]);

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
    () => getViewDays(mode, date, weekStartsOn, numberOfDays, isRTL, weekEndsOn, hiddenDays),
    [mode, date, weekStartsOn, numberOfDays, isRTL, weekEndsOn, hiddenDays],
  );
  // Calendar days one page spans (7 for week, the column count otherwise), for
  // the "move to next/previous page" screen-reader actions.
  const daysPerPage = pageStepDays(mode, date, weekStartsOn, numberOfDays);

  // Plain number for worklets to close over: reading `days.length` inside a
  // gesture worklet would capture the whole `days` array (of `Date`s), which
  // react-native-worklets >=0.10 refuses to copy to the UI thread.
  const dayCount = days.length;
  const dayWidth = (width - hourColumnWidth) / dayCount;
  const dayLeft = (dayIndex: number) => hourColumnWidth + dayIndex * dayWidth;

  // Calendar-day offset of each column from the first, as plain numbers a drag
  // worklet can close over. Identity (0,1,2,…) for contiguous days; with
  // hiddenDays the gaps widen, so a cross-day move shifts by the right number of
  // calendar days. Signed correctly for RTL (columns run high→low).
  const dayOrdinals = useMemo(
    () => days.map((day) => differenceInCalendarDays(day, days[0])),
    [days],
  );

  const dayLayouts = useMemo(() => days.map((day) => layoutDayEvents(events, day)), [days, events]);
  const [multiDayMove, setMultiDayMove] = useState<MultiDayMove<T> | null>(null);
  const movingEvent = multiDayMove
    ? (events.find(
        (event, index) =>
          keyExtractor(event, index) === keyExtractor(multiDayMove.event, multiDayMove.eventIndex),
      ) ?? null)
    : null;
  useEffect(() => {
    if (
      multiDayMove?.phase === "dropped" &&
      (!movingEvent ||
        movingEvent.start.getTime() !== multiDayMove.event.start.getTime() ||
        movingEvent.end.getTime() !== multiDayMove.event.end.getTime())
    ) {
      setMultiDayMove(null);
    }
  }, [multiDayMove, movingEvent]);

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

  const now = useNow(showNowIndicator && isActive, { now: nowProp, timeZone: nowTimeZone });
  // "Today" follows the (possibly zone-shifted or overridden) now, so the line
  // lands in the column the events are displayed in.
  const nowDayIndex = days.findIndex((day) => isSameCalendarDay(day, now));
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
    base: [styles.createGhost, { marginHorizontal: eventGap, pointerEvents: "none" }],
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
          onLayout={(event) => {
            // The scroll view's offset within the page equals the all-day lane
            // height above it: the hour grid's top. Report it while active.
            gridTopRef.current = event.nativeEvent.layout.y;
            if (isActive) onGridTop?.(gridTopRef.current);
          }}
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
              if (!highlightWeekends || !isWeekend(day)) return null;
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
                  testID="weekend-shade"
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
                      color={renderBusinessHours ? undefined : theme.colors.outsideHoursBackground}
                    >
                      {renderBusinessHours?.({ date: day, start: band.start, end: band.end })}
                    </ShadeBand>
                  )),
                )
              : null}

            {/* Background events: shaded, non-interactive time ranges. */}
            {days.flatMap((day, dayIndex) =>
              backgroundBandsForDay(events, day)
                .map((b) => ({
                  ...b,
                  startHours: Math.max(b.startHours, minHour),
                  endHours: Math.min(b.endHours, maxHour),
                }))
                .filter((b) => b.endHours > b.startHours)
                .map((b, bandIndex) => (
                  <ShadeBand
                    key={`bg-${day.toISOString()}-${bandIndex}`}
                    cellHeight={heightSource}
                    startHour={b.startHours}
                    endHour={b.endHours}
                    minHour={minHour}
                    left={dayLeft(dayIndex)}
                    width={dayWidth}
                    color={theme.colors.backgroundEvent}
                    slotName="backgroundEvent"
                    testID="background-event-shade"
                  />
                )),
            )}

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
                      eventIndex={events.indexOf(positioned.event)}
                      movingEvent={movingEvent}
                      onMovePreview={setMultiDayMove}
                      cellHeight={heightSource}
                      minHour={minHour}
                      maxHour={maxHour}
                      left={dayLeft(dayIndex) + positioned.column * columnWidth}
                      width={columnWidth}
                      dayLeftPx={dayLeft(dayIndex)}
                      nextDayDirection={isRTL ? -1 : 1}
                      dayWidth={dayWidth}
                      dayIndex={dayIndex}
                      dayCount={days.length}
                      dayOrdinals={dayOrdinals}
                      mode={mode}
                      daysPerPage={daysPerPage}
                      renderEvent={renderEvent}
                      snapMinutes={snapMinutes}
                      minEventHeight={minEventHeight}
                      eventGap={eventGap}
                      showDragHandle={showDragHandle}
                      eventStartEditable={eventStartEditable}
                      eventDurationEditable={eventDurationEditable}
                      onPress={onPressEvent}
                      onLongPress={onLongPressEvent}
                      onDragEvent={onDragEvent}
                      onDragStart={onDragStart}
                      onEdgeAdvance={onEdgeAdvance}
                    />
                  );
                }),
            )}

            {multiDayMove ? (
              <MultiDayMovePreview
                move={multiDayMove}
                days={days}
                cellHeight={heightSource}
                dayWidth={dayWidth}
                hourColumnWidth={hourColumnWidth}
                minHour={minHour}
                mode={mode}
                renderEvent={renderEvent}
                minEventHeight={minEventHeight}
                eventGap={eventGap}
              />
            ) : null}

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
  | "backgroundEvent"
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
  /** Weekdays (0=Sunday…6=Saturday) hidden from the grid, e.g. `[0, 6]` for weekends off. */
  hiddenDays?: number[];
  /** Fixed "now" instant for the indicator (doesn't tick). Defaults to the device clock. */
  now?: Date;
  /** Shift the now indicator into this IANA zone (pair with `eventsInTimeZone`). */
  timeZone?: string;
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
  /** Tint Saturday/Sunday columns with the weekend background. Default true. Set
   * false to treat weekends like any other day. */
  highlightWeekends?: boolean;
  /** Per-date style merged onto each day column. */
  calendarCellStyle?: (date: Date) => StyleProp<ViewStyle>;
  businessHours?: BusinessHours;
  /**
   * Render a closed-hours band's content yourself (a label, icon, pattern).
   * The grid keeps positioning the band; when set, the themed tint is dropped
   * and your output fills the band instead. Decorative only: the
   * band stays non-interactive and hidden from assistive tech.
   */
  renderBusinessHours?: (band: BusinessHoursBand) => React.ReactNode;
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
  /**
   * Minimum pixel height of a timed event box, so short events stay legible and
   * tappable. Also the floor of the `boxHeight` handed to `renderEvent`. Default
   * 32; pass 0 to size every box strictly by its duration.
   */
  minEventHeight?: number;
  /**
   * Inset in pixels between a timed event box and its slot (each side), so
   * adjacent boxes and column edges get some breathing room. Default 2; pass 0
   * to let events fill their slot.
   */
  eventGap?: number;
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
  /** Allow moving events by default (per-event `startEditable` overrides). Default true. */
  eventStartEditable?: boolean;
  /** Allow resizing events by default (per-event `durationEditable` overrides). Default true. */
  eventDurationEditable?: boolean;
  /** Allow a dragged/resized event to overlap another (default true). Set false to
   * reject a drop that would collide, snapping the event back. */
  eventOverlap?: boolean;
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
  highlightWeekends = true,
  calendarCellStyle,
  businessHours,
  renderBusinessHours,
  showWeekNumber = false,
  headerComponent,
  minHour = 0,
  maxHour = HOURS_PER_DAY,
  ampm = false,
  isRTL = false,
  minHourHeight = DEFAULT_MIN_HOUR_HEIGHT,
  maxHourHeight = DEFAULT_MAX_HOUR_HEIGHT,
  minEventHeight = DEFAULT_MIN_EVENT_HEIGHT,
  eventGap = DEFAULT_EVENT_GAP,
  showNowIndicator = true,
  locale,
  freeSwipe = false,
  swipeEnabled = true,
  showVerticalScrollIndicator = true,
  verticalScrollEnabled = true,
  weekNumberPrefix = "W",
  hiddenDays,
  now,
  timeZone,
  hourComponent,
  activeDate,
  resetPageOnPressCell = false,
  dragStepMinutes = DEFAULT_DRAG_STEP_MINUTES,
  showDragHandle = true,
  eventStartEditable = true,
  eventDurationEditable = true,
  eventOverlap = true,
  onPressEvent,
  onLongPressEvent,
  onDragEvent: onDragEventProp,
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

  // Reject a drop that would overlap another event when `eventOverlap` is false,
  // so every commit path (drag, resize, cross-week, screen-reader actions) enforces
  // it without the consumer wiring it in `onDragEvent`.
  const onDragEvent = useMemo(() => {
    if (!onDragEventProp || eventOverlap !== false) return onDragEventProp;
    return (event: CalendarEvent<T>, start: Date, end: Date) =>
      overlapsOtherEvents(events, event, start, end) ? false : onDragEventProp(event, start, end);
  }, [onDragEventProp, eventOverlap, events]);

  const { width, height } = useWindowDimensions();
  const listRef = useRef<LegendListRef>(null);
  // The pager's own view; measured in the window so an event drag can locate the
  // horizontal edges (its screen-space left and width) for cross-week paging.
  const pagerRef = useRef<View>(null);
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
  // Pager frame in window space (refined on layout) and a swipe-scroll freeze,
  // shared with the event drag worklets through EdgePagingContext so a cross-week
  // edge drag can detect the edges and page the view live under a held finger.
  const pagerLeft = useSharedValue(0);
  const pagerTop = useSharedValue(0);
  const pagerWidth = useSharedValue(width);
  const [edgePagingLock, setEdgePagingLock] = useState(false);
  // Floating "held" ghost that carries a dragged event across a page change (see
  // EdgePaging): pager-local top-left, size, visibility, and the event to draw.
  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);
  const ghostW = useSharedValue(0);
  const ghostH = useSharedValue(0);
  const ghostVisible = useSharedValue(0);
  // Pager-local top of the active page's hour grid (the all-day lane above it
  // varies in height per week), so a cross-week drop maps the ghost's screen
  // position to the right time on the page it lands on.
  const gridTop = useSharedValue(0);
  const [liftedEvent, setLiftedEvent] = useState<CalendarEvent<T> | null>(null);
  const liftedEventRef = useRef<CalendarEvent<T> | null>(null);
  // The drop commit needs the live page's columns and handler; keep them in a ref
  // refreshed each render so the callbacks below stay identity-stable. A changing
  // context value would re-memo every event's gesture and tear down an in-progress
  // drag (the gesture must outlive the page change to finish a cross-week drop).
  const dropRef = useRef({
    headerDays: [] as Date[],
    containerWidth,
    hourColumnWidth,
    minHour: clampedMinHour,
    maxHour: clampedMaxHour,
    snapMinutes: Math.max(1, dragStepMinutes),
    onDragEvent,
    onChangeDate,
  });
  const beginLift = useCallback((event: CalendarEvent<unknown>) => {
    liftedEventRef.current = event as CalendarEvent<T>;
    setLiftedEvent(event as CalendarEvent<T>);
  }, []);
  const clearLift = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
    ghostVisible.value = 0;
    liftedEventRef.current = null;
    setLiftedEvent(null);
    setEdgePagingLock(false);
  }, [ghostVisible]);
  const commitLiftedDrop = useCallback(
    (ghostLocalX: number, ghostLocalY: number) => {
      const {
        headerDays: days,
        containerWidth: cw,
        hourColumnWidth: hcw,
        minHour: min,
        maxHour: max,
        snapMinutes: snap,
        onDragEvent: onDrag,
        onChangeDate: onDate,
      } = dropRef.current;
      const ev = liftedEventRef.current;
      const duration = ev ? ev.end.getTime() - ev.start.getTime() : 0;
      clearLift();
      if (!ev || !onDrag || days.length === 0) return;
      // Map the ghost's drawn position on the page it landed on back to a cell:
      // its left edge picks the day column, its top edge picks the time. Reading
      // the live grid geometry (the all-day lane pushes the grid down, the grid
      // scrolls, pinch changes the row height) keeps the drop under the ghost.
      const dayWidth = (cw - hcw) / days.length;
      const col = Math.min(
        Math.max(Math.floor((ghostLocalX - hcw) / dayWidth), 0),
        days.length - 1,
      );
      const hoursFromMin =
        (ghostLocalY - gridTop.value - HOUR_LABEL_TOP_INSET + scrollY.value) / cellHeight.value;
      const rawMinutes = (min + hoursFromMin) * MINUTES_PER_HOUR;
      // Same rule as an in-page move: the start stays in the day it landed on,
      // while the duration is free to carry the end past midnight.
      const minutes = clampMoveStartMinutes(Math.round(rawMinutes / snap) * snap, min, max, snap);
      const start = new Date(days[col]);
      start.setHours(0, 0, 0, 0);
      start.setMinutes(minutes);
      const end = new Date(start.getTime() + duration);
      // A rejected drop (handler returned false) leaves the event on its original
      // week, which the drag has paged away from. Page back to it so the reject
      // reads as a visible snap-back instead of the event seeming to vanish.
      if (onDrag(ev, start, end) === false) onDate(ev.start);
    },
    [clearLift, gridTop, scrollY, cellHeight],
  );
  const handleGridTop = useCallback(
    (y: number) => {
      // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
      gridTop.value = y;
    },
    [gridTop],
  );
  const edgePaging = useMemo<EdgePaging>(
    () => ({
      pagerLeft,
      pagerTop,
      pagerWidth,
      lockScroll: setEdgePagingLock,
      ghostX,
      ghostY,
      ghostW,
      ghostH,
      ghostVisible,
      beginLift,
      commitLiftedDrop,
    }),
    [
      pagerLeft,
      pagerTop,
      pagerWidth,
      ghostX,
      ghostY,
      ghostW,
      ghostH,
      ghostVisible,
      beginLift,
      commitLiftedDrop,
    ],
  );
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
        hiddenDays,
      ),
    [mode, pageDates, activeIndex, date, weekStartsOn, numberOfDays, isRTL, weekEndsOn, hiddenDays],
  );

  // Keep the cross-week drop's page columns + handler current without changing the
  // identity-stable EdgePaging callbacks (see dropRef).
  dropRef.current = {
    headerDays,
    containerWidth,
    hourColumnWidth,
    minHour: clampedMinHour,
    maxHour: clampedMaxHour,
    snapMinutes: Math.max(1, dragStepMinutes),
    onDragEvent,
    onChangeDate,
  };

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
          hiddenDays={hiddenDays}
          now={now}
          nowTimeZone={timeZone}
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
          highlightWeekends={highlightWeekends}
          showVerticalScrollIndicator={showVerticalScrollIndicator}
          verticalScrollEnabled={verticalScrollEnabled}
          hourComponent={hourComponent}
          calendarCellStyle={calendarCellStyle}
          businessHours={businessHours}
          renderBusinessHours={renderBusinessHours}
          minHourHeight={minHourHeight}
          maxHourHeight={maxHourHeight}
          showNowIndicator={showNowIndicator}
          renderEvent={labeledRenderEvent}
          keyExtractor={keyExtractor}
          snapMinutes={Math.max(1, dragStepMinutes)}
          minEventHeight={minEventHeight}
          eventGap={eventGap}
          showDragHandle={showDragHandle}
          eventStartEditable={eventStartEditable}
          eventDurationEditable={eventDurationEditable}
          onPressEvent={onPressEvent}
          onLongPressEvent={onLongPressEvent}
          onDragEvent={onDragEvent}
          onDragStart={onDragStart}
          onPressCell={handlePressCell}
          onLongPressCell={onLongPressCell}
          onCreateEvent={onCreateEvent}
          onEdgeAdvance={goToPage}
          onGridTop={handleGridTop}
        />
      </View>
    ),
    [
      containerWidth,
      pageHeight,
      handleGridTop,
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
      highlightWeekends,
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
      minEventHeight,
      eventGap,
      showDragHandle,
      eventStartEditable,
      eventDurationEditable,
      onPressEvent,
      onLongPressEvent,
      onDragEvent,
      onDragStart,
      handlePressCell,
      onLongPressCell,
      onCreateEvent,
      goToPage,
      hiddenDays,
      now,
      timeZone,
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
      <EdgePagingContext.Provider value={edgePaging}>
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
            ref={pagerRef}
            style={styles.pager}
            onLayout={(event) => {
              setPageHeight(event.nativeEvent.layout.height);
              setContainerWidth(event.nativeEvent.layout.width);
              setMeasured(true);
              // Record the pager's window-space frame for the drag worklets' edge
              // detection and ghost placement (layout gives parent-relative coords,
              // not window).
              pagerRef.current?.measureInWindow((x, y, w) => {
                // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
                pagerLeft.value = x;
                // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
                pagerTop.value = y;
                // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value: assigning .value is the intended mutation API
                pagerWidth.value = w;
              });
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
                    // Frozen mid-edge-page so the programmatic advance lands under
                    // the held finger instead of waiting for the touch to end.
                    scrollEnabled: swipeEnabled && !edgePagingLock,
                    pagingEnabled: !freeSwipe,
                    snapToIndices: freeSwipe ? snapToIndices : undefined,
                  })}
              initialScrollIndex={activeIndex}
              showsHorizontalScrollIndicator={false}
              viewabilityConfig={PAGE_VIEWABILITY}
              onViewableItemsChanged={handleViewableItemsChanged}
              renderItem={renderItem}
            />
            {liftedEvent ? (
              <DragGhost
                x={ghostX}
                y={ghostY}
                w={ghostW}
                h={ghostH}
                visible={ghostVisible}
                event={liftedEvent}
                mode={mode}
                renderEvent={labeledRenderEvent}
                eventGap={eventGap}
              />
            ) : null}
          </View>
        </View>
      </EdgePagingContext.Provider>
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
            {...slot<TextStyle>("weekNumber", {
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
        {...slot<TextStyle>("columnHeaderWeekday", {
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
          {...slot<TextStyle>("columnHeaderDateText", {
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
  resizeHandleTop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
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
  // The `eventGap` inset is applied inline as border-box padding, so the visible
  // box (the flex child) sits inside the slot without touching its geometry.
  eventBox: {
    position: "absolute",
    overflow: "hidden",
  },
  // The cross-week drag ghost: pinned to the pager's top-left, moved into place by
  // its transform, and floated above every page so it stays visible across a page.
  dragGhost: {
    top: 0,
    left: 0,
    zIndex: DRAG_EVENT_Z + 1,
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
