import { vi } from "vitest";
import { render } from "@testing-library/react";
import { ResourceTimeline } from "../ResourceTimeline";

describe("ResourceTimeline track click handler gating", () => {
  const day = new Date(2026, 5, 26);
  const resources = [{ id: "a", title: "Room A" }];

  it.each(["horizontal", "vertical"] as const)(
    "omits track onclick when onPressCell is not provided in %s orientation",
    (orientation) => {
      const readOnly = render(
        <ResourceTimeline date={day} orientation={orientation} resources={resources} events={[]} />,
      );
      expect(
        readOnly.container.querySelector<HTMLElement>('[data-slot="track"]')!.onclick,
      ).toBeNull();
      readOnly.unmount();

      const createOnly = render(
        <ResourceTimeline
          date={day}
          orientation={orientation}
          resources={resources}
          events={[]}
          onCreateEvent={vi.fn()}
        />,
      );
      expect(
        createOnly.container.querySelector<HTMLElement>('[data-slot="track"]')!.onclick,
      ).toBeNull();
      createOnly.unmount();

      const pressable = render(
        <ResourceTimeline
          date={day}
          orientation={orientation}
          resources={resources}
          events={[]}
          onPressCell={vi.fn()}
        />,
      );
      expect(
        typeof pressable.container.querySelector<HTMLElement>('[data-slot="track"]')!.onclick,
      ).toBe("function");
    },
  );
});
