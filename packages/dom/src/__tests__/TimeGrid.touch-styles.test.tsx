import { vi } from "vitest";
import { render } from "@testing-library/react";
import { TimeGrid } from "../TimeGrid";

// jsdom exposes React's property assignment but cannot parse Solid's touch-action
// CSS declaration. The browser suite checks the computed style and actual swipes.
it("allows vertical touch panning on the event body and both resize grips", () => {
  const { getByText } = render(
    <TimeGrid
      date={new Date(2026, 5, 26)}
      mode="day"
      events={[
        { title: "Focus", start: new Date(2026, 5, 26, 14), end: new Date(2026, 5, 26, 16) },
      ]}
      onDragEvent={vi.fn()}
    />,
  );
  const box = getByText("Focus").closest<HTMLElement>('[role="button"]')!;
  expect(box.style.touchAction).toBe("pan-y");
  const grips = box.querySelectorAll<HTMLElement>('[style*="ns-resize"]');
  expect(grips).toHaveLength(2);
  for (const grip of grips) expect(grip.style.touchAction).toBe("pan-y");
});
