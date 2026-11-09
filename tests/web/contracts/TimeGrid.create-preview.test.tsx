import { vi } from "vitest";
import { fireEvent, render, rendererName, TimeGrid } from "@calendar-test/renderer";

describe(rendererName, () => {
  it.each([
    { name: "downward", from: 100, to: 150, step: 15, min: 0, top: 96, height: 60 },
    { name: "upward", from: 150, to: 100, step: 15, min: 0, top: 96, height: 60 },
    { name: "stationary press", from: 100, to: 100, step: 15, min: 0, top: 96, height: 12 },
    { name: "half-hour steps", from: 110, to: 170, step: 30, min: 0, top: 120, height: 48 },
    { name: "fractional hour window", from: 48, to: 96, step: 15, min: 8.1, top: 43.2, height: 48 },
  ])("snaps the $name preview without custom content", ({ from, to, step, min, top, height }) => {
    const view = render(TimeGrid, {
      date: new Date(2026, 6, 15),
      mode: "day",
      hourHeight: 48,
      minHour: min,
      dragStepMinutes: step,
      onCreateEvent: vi.fn(),
    });
    const column = view.container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
    fireEvent.pointerDown(column, { clientY: from, pointerId: 1, button: 0 });
    fireEvent.pointerMove(column, { clientY: to, pointerId: 1 });
    const ghost = view.container.querySelector<HTMLElement>('[data-slot="createGhost"]')!;
    expect(Number.parseFloat(ghost.style.top)).toBeCloseTo(top);
    expect(Number.parseFloat(ghost.style.height)).toBeCloseTo(height);
    expect(ghost.childElementCount).toBe(0);
    expect(ghost.hasAttribute("inert")).toBe(false);
  });
});
