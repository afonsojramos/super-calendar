import { startTransition, Suspense, useState } from "react";
import { act, fireEvent, render } from "@testing-library/react";
import { vi } from "vitest";
import { TimeGrid } from "../TimeGrid";

it("completes creation with committed props while a parent update is suspended", async () => {
  const current = vi.fn();
  const pending = vi.fn();
  const suspends = vi.fn();
  const never = new Promise<void>(() => {});
  const day = new Date(2026, 5, 26);
  function Pending({ active }: { active: boolean }) {
    if (active) {
      suspends();
      throw never;
    }
    return null;
  }
  function App() {
    const [updating, setUpdating] = useState(false);
    return (
      <>
        <button onClick={() => startTransition(() => setUpdating(true))}>Update</button>
        <Suspense fallback={<span>Loading</span>}>
          <TimeGrid
            date={day}
            mode="day"
            hourHeight={48}
            onCreateEvent={updating ? pending : current}
          />
          <Pending active={updating} />
        </Suspense>
      </>
    );
  }
  const view = render(<App />);
  const column = view.container.querySelector<HTMLElement>('[data-slot="dayColumn"]')!;
  fireEvent.pointerDown(column, { clientY: 96, pointerId: 1, button: 0 });
  fireEvent.pointerMove(column, { clientY: 150, pointerId: 1 });
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Update" })));
  expect(suspends).toHaveBeenCalled();
  expect(view.queryByText("Loading")).toBeNull();
  fireEvent.pointerUp(column, { clientY: 150, pointerId: 1 });
  expect(current).toHaveBeenCalledExactlyOnceWith(
    new Date(2026, 5, 26, 2),
    new Date(2026, 5, 26, 3, 15),
  );
  expect(pending).not.toHaveBeenCalled();
});
