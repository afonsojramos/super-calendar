import type { CalendarEvent } from "../../types";
import { eventIdKeys, findCurrentEvent } from "../eventIdentity";

type Item = CalendarEvent<{ id?: unknown }>;
const event = (id: unknown, title = "Event"): Item => ({
  id,
  title,
  start: new Date(2026, 6, 15, 9),
  end: new Date(2026, 6, 15, 10),
});
const getId = (item: Item) => item.id as string | number;

describe("eventIdKeys", () => {
  it("keys every event with a unique string or number ID and keeps 1 and '1' apart", () => {
    const a = event(1);
    const b = event("1");
    const keys = eventIdKeys([a, b], getId);
    expect(keys.get(a)).toBe("number:1");
    expect(keys.get(b)).toBe("string:1");
  });

  it("leaves out missing, invalid, and duplicate IDs", () => {
    const missing = event(undefined);
    const invalid = event({});
    const first = event("same");
    const second = event("same");
    const unique = event("unique");
    const keys = eventIdKeys([missing, invalid, first, second, unique], getId);
    expect([...keys.keys()]).toEqual([unique]);
  });

  it("returns no keys without a getter", () => {
    expect(eventIdKeys([event(1)], undefined).size).toBe(0);
  });
});

describe("findCurrentEvent", () => {
  it("returns the held event while it is still in the list", () => {
    const held = event("a");
    expect(findCurrentEvent([held], held, undefined)).toBe(held);
  });

  it("returns the only replacement with the same ID", () => {
    const held = event("a", "Before");
    const replacement = event("a", "After");
    expect(findCurrentEvent([event("b"), replacement], held, getId)).toBe(replacement);
  });

  it.each([
    { title: "without a getter", events: [event("a")], getter: undefined },
    { title: "when no event has the ID", events: [event("b")], getter: getId },
    { title: "when the ID is ambiguous", events: [event("a"), event("a")], getter: getId },
  ])("returns nothing $title", ({ events, getter }) => {
    expect(findCurrentEvent(events, event("a"), getter)).toBeUndefined();
  });

  it("returns nothing when the held event has no valid ID", () => {
    expect(findCurrentEvent([event(undefined)], event(undefined), getId)).toBeUndefined();
  });
});
