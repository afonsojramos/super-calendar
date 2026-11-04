import { useLayoutEffect, useRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { MonthView } from "../MonthView";

it.each([false, true])(
  "retains focus placed before mount effects settle (events: %s)",
  (eventsMode) => {
    function AutofocusedMonth() {
      const root = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        root.current!.querySelector<HTMLElement>('[data-day="2026-07-05"]')!.focus();
      }, []);
      return (
        <div ref={root}>
          <MonthView
            date={new Date(2026, 6, 1)}
            selectedDates={[new Date(2026, 6, 1)]}
            minDate={new Date(2026, 6, 5)}
            events={eventsMode ? [] : undefined}
            keyboardDayNavigation
          />
        </div>
      );
    }
    const view = render(<AutofocusedMonth />);
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-07-05");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("data-day")).toBe("2026-07-06");
    expect(view.container.querySelectorAll('[data-day][tabindex="0"]')).toHaveLength(1);
  },
);
