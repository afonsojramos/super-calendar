import { vi } from "vitest";
import {
  rendererName,
  cleanup,
  fireEvent,
  render,
  DatePicker,
  DateRangePicker,
  type DatePickerProps,
  ControlledDatePicker,
  ControlledDateRangePicker,
} from "@calendar-test/renderer";

describe(rendererName, () => {
  // The trigger is the only button with aria-haspopup; the calendar renders many
  // day buttons once open, so target the trigger explicitly.
  const trigger = (c: HTMLElement) => c.querySelector('[aria-haspopup="dialog"]') as HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 6, 1) });
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  type SharedPickerProps = Pick<DatePickerProps, "disabled" | "theme" | "styles"> & {
    value: null;
    onChange: () => void;
  };

  describe.each([
    { name: "DatePicker", Component: DatePicker },
    { name: "DateRangePicker", Component: DateRangePicker },
  ])("$name live props", ({ Component }) => {
    const renderPicker = (props: SharedPickerProps) =>
      render((incoming: SharedPickerProps) => <Component {...incoming} />, props);

    it("applies initial and updated themes to calendar cells while preserving slot overrides", () => {
      const props: SharedPickerProps = { value: null, onChange: vi.fn() };
      const view = renderPicker({
        ...props,
        theme: { surface: "blue", text: "red", cellHeight: 80 },
      });
      fireEvent.click(trigger(view.container));
      const day = () => view.container.querySelector<HTMLElement>('[data-day="2026-07-15"]')!;
      expect(view.getByRole("dialog").style.background).toBe("blue");
      expect(day().style.color).toBe("red");
      expect(day().style.height).toBe("80px");

      view.rerender({ ...props, theme: { text: "green", cellHeight: 72 } });
      expect(day().style.color).toBe("green");
      expect(day().style.height).toBe("72px");

      view.rerender({
        ...props,
        theme: { text: "green" },
        styles: { day: { color: "purple" } },
      });
      expect(day().style.color).toBe("purple");
      expect(day().style.height).toBe("48px");
    });

    it("starts closed when disabled", () => {
      const view = renderPicker({
        value: null,
        onChange: vi.fn(),
        disabled: true,
      });
      expect(view.container.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
      expect(view.queryByRole("dialog")).toBeNull();
    });

    it("closes when disabled and stays closed after re-enabling", () => {
      const onChange = vi.fn();
      const props: SharedPickerProps = { value: null, onChange };
      const view = renderPicker(props);
      fireEvent.click(trigger(view.container));
      const day = view.container.querySelector('[data-day="2026-07-15"]')!;
      const clear = view.queryByText("Clear");
      expect(view.queryByRole("dialog")).toBeTruthy();

      view.rerender({ ...props, disabled: true });
      expect(trigger(view.container).getAttribute("aria-expanded")).toBe("false");
      expect(view.queryByRole("dialog")).toBeNull();
      fireEvent.click(day);
      if (clear) fireEvent.click(clear);
      expect(onChange).not.toHaveBeenCalled();

      view.rerender(props);
      expect(view.queryByRole("dialog")).toBeNull();
      fireEvent.click(trigger(view.container));
      fireEvent.click(view.container.querySelector('[data-day="2026-07-15"]')!);
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("DatePicker", () => {
    it("shows the placeholder until a date is picked, then opens and selects", () => {
      const { container, queryByRole } = render(ControlledDatePicker, {
        value: null,
        weekStartsOn: 1,
      });
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
      const { container, queryByRole } = render(ControlledDatePicker, { value: null });
      fireEvent.click(trigger(container));
      expect(queryByRole("dialog")).toBeTruthy();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(queryByRole("dialog")).toBeNull();
    });
  });

  describe("DateRangePicker", () => {
    it("advances start → end across two picks and closes when complete", () => {
      const { container, queryByRole } = render(ControlledDateRangePicker, {
        value: null,
        weekStartsOn: 1,
      });
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
      const { container, getByText } = render(ControlledDateRangePicker, {
        value: {
          start: new Date(2026, 6, 10),
          end: new Date(2026, 6, 15),
        },
        weekStartsOn: 1,
      });
      fireEvent.click(trigger(container));
      fireEvent.click(getByText("Clear"));
      expect(trigger(container).textContent).toContain("Select dates");
    });
  });
});
