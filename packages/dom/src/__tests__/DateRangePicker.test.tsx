import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import type { DateRange } from "@super-calendar/core";

// Legend List needs measured layout to mount items, which jsdom can't provide;
// render every month synchronously so the popover calendar's day cells exist.
jest.mock("@legendapp/list/react", () => ({
  __esModule: true,
  LegendList: (props: {
    data?: unknown[];
    renderItem: (arg: { item: unknown; index: number }) => unknown;
  }) => (props.data ?? []).map((item, index) => props.renderItem({ item, index })),
}));

import { DatePicker, DateRangePicker } from "../DateRangePicker";

// The trigger is the only button with aria-haspopup; the calendar renders many
// day buttons once open, so target the trigger explicitly.
const trigger = (c: HTMLElement) => c.querySelector('[aria-haspopup="dialog"]') as HTMLElement;

describe("dom DatePicker", () => {
  it("shows the placeholder until a date is picked, then opens and selects", () => {
    function Harness() {
      const [value, setValue] = useState<Date | null>(null);
      return <DatePicker value={value} onChange={setValue} weekStartsOn={1} />;
    }
    const { container, queryByRole } = render(<Harness />);
    expect(trigger(container).getAttribute("aria-expanded")).toBe("false");
    expect(trigger(container).textContent).toContain("Select a date");

    fireEvent.click(trigger(container));
    expect(queryByRole("dialog")).toBeTruthy();

    fireEvent.click(container.querySelector('[data-day="2026-07-15"]') as HTMLElement);
    // Picking a day selects it and closes the popover.
    expect(queryByRole("dialog")).toBeNull();
    expect(trigger(container).textContent).toContain("15 Jul 2026");
  });

  it("closes on Escape", () => {
    function Harness() {
      const [value, setValue] = useState<Date | null>(null);
      return <DatePicker value={value} onChange={setValue} />;
    }
    const { container, queryByRole } = render(<Harness />);
    fireEvent.click(trigger(container));
    expect(queryByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();
  });
});

describe("dom DateRangePicker", () => {
  it("advances start → end across two picks and closes when complete", () => {
    function Harness() {
      const [range, setRange] = useState<DateRange | null>(null);
      return <DateRangePicker value={range} onChange={setRange} weekStartsOn={1} />;
    }
    const { container, queryByRole } = render(<Harness />);
    expect(trigger(container).textContent).toContain("Select dates");
    fireEvent.click(trigger(container));

    fireEvent.click(container.querySelector('[data-day="2026-07-10"]') as HTMLElement);
    // First pick sets the start; popover stays open, label shows the open range.
    expect(queryByRole("dialog")).toBeTruthy();
    expect(trigger(container).textContent).toContain("10 Jul 2026 – …");

    fireEvent.click(container.querySelector('[data-day="2026-07-15"]') as HTMLElement);
    expect(queryByRole("dialog")).toBeNull();
    expect(trigger(container).textContent).toContain("10 Jul 2026 – 15 Jul 2026");
  });

  it("clears the range from the footer", () => {
    function Harness() {
      const [range, setRange] = useState<DateRange | null>({
        start: new Date(2026, 6, 10),
        end: new Date(2026, 6, 15),
      });
      return <DateRangePicker value={range} onChange={setRange} weekStartsOn={1} />;
    }
    const { container, getByText } = render(<Harness />);
    fireEvent.click(trigger(container));
    fireEvent.click(getByText("Clear"));
    expect(trigger(container).textContent).toContain("Select dates");
  });
});
