import { vi } from "vitest";
import type { ReactNode } from "react";
import { StyleSheet, type TextStyle } from "react-native";
import { render } from "../../../../../tests/support/native-time-grid";
import type { CalendarEvent } from "../../types";

// The test renderer cannot lay out LegendList, so render every agenda row.
vi.mock("@legendapp/list/react-native", () => ({
  __esModule: true,
  LegendList: (props: {
    data: unknown[];
    renderItem: (item: { item: unknown; index: number }) => ReactNode;
  }) => props.data.map((item, index) => props.renderItem({ item, index })),
}));

import { Calendar } from "../Calendar";

const noop = () => {};
const HIGHLIGHT = "rgb(1, 2, 3)";
const MUTED = "rgb(4, 5, 6)";
const theme = { colors: { todayBackground: HIGHLIGHT, textMuted: MUTED } };
// 22:00 UTC on 12 November is already 07:00 on the 13th in Tokyo.
const now = new Date("2026-11-12T22:00:00Z");

const events: CalendarEvent[] = [12, 13, 20].map((day) => ({
  title: `Event ${day}`,
  start: new Date(2026, 10, day, 9),
  end: new Date(2026, 10, day, 10),
}));

const headerColors = (view: Awaited<ReturnType<typeof render>>) =>
  ["Thursday, 12 November", "Friday, 13 November", "Friday, 20 November"].map(
    (label) => (StyleSheet.flatten(view.getByText(label).props.style) as TextStyle).color,
  );

describe("Calendar schedule mode highlight", () => {
  const props = {
    mode: "schedule" as const,
    events,
    theme,
    onChangeDate: noop,
    onPressEvent: noop,
  };

  it("highlights today in the time zone, not the date prop, by default", async () => {
    const view = await render(
      <Calendar {...props} date={new Date(2026, 10, 20)} now={now} timeZone="Asia/Tokyo" />,
    );
    expect(headerColors(view)).toEqual([MUTED, HIGHLIGHT, MUTED]);
  });

  it("follows a pinned now without a timeZone", async () => {
    const view = await render(
      <Calendar {...props} date={new Date(2026, 10, 20)} now={new Date(2026, 10, 12, 12)} />,
    );
    expect(headerColors(view)).toEqual([HIGHLIGHT, MUTED, MUTED]);
  });

  it("highlights activeDate instead of today when set", async () => {
    const view = await render(
      <Calendar
        {...props}
        date={new Date(2026, 10, 1)}
        activeDate={new Date(2026, 10, 20)}
        now={now}
        timeZone="Asia/Tokyo"
      />,
    );
    expect(headerColors(view)).toEqual([MUTED, MUTED, HIGHLIGHT]);
  });
});
