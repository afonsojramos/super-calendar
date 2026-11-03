import { useState, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ResourceTimeline, type CalendarEvent, type Resource } from "@super-calendar/dom";

const date = new Date(2026, 10, 2);
const at = (hour: number) => new Date(2026, 10, 2, hour);
type Event = CalendarEvent<{ resourceId: string }>;
const planning: Event = { title: "Planning", start: at(9), end: at(10), resourceId: "a" };
const locked: Event = {
  title: "Locked",
  start: at(11),
  end: at(12),
  resourceId: "a",
  draggable: false,
};
const earlier: Event = { title: "Earlier", start: at(8), end: at(9), resourceId: "a" };
const rooms: Resource[] = [
  { id: "a", title: "Studio" },
  { id: "b", title: "Room B" },
];

function Fixture() {
  const [events, setEvents] = useState([planning, locked]);
  const [editable, setEditable] = useState(true);
  const [disableOnAction, setDisableOnAction] = useState(false);
  const [calls, setCalls] = useState<unknown[]>([]);
  const orientation =
    new URLSearchParams(location.search).get("orientation") === "vertical"
      ? "vertical"
      : "horizontal";
  const record = (call: unknown) => setCalls((previous) => [...previous, call]);
  return (
    <main>
      <nav>
        <button
          id="insert"
          onClick={() =>
            setEvents((previous) => [earlier, ...previous.filter((event) => event !== earlier)])
          }
        >
          Insert earlier event
        </button>
        <button
          id="remove"
          onClick={() =>
            setEvents((previous) => previous.filter((event) => event.title !== "Planning"))
          }
        >
          Remove planning
        </button>
        <button id="editable" onClick={() => setEditable((previous) => !previous)}>
          Toggle editing
        </button>
        <button id="disable-on-action" onClick={() => setDisableOnAction((previous) => !previous)}>
          Toggle editing updates from callbacks
        </button>
      </nav>
      <ResourceTimeline<{ resourceId: string }>
        date={date}
        now={date}
        events={events}
        resources={rooms}
        resourceId={(event) => event.resourceId}
        orientation={orientation}
        startHour={8}
        endHour={15}
        hourWidth={80}
        hourHeight={80}
        rowHeight={90}
        style={{ width: orientation === "vertical" ? 520 : 800 }}
        onPressEvent={(event) => {
          record({ type: "press", title: event.title });
          if (disableOnAction) setEditable(false);
        }}
        onDragEvent={
          editable
            ? (event, start, end, resource) => {
                record({
                  type: "drag",
                  title: event.title,
                  start: start.getHours(),
                  end: end.getHours(),
                  resource: resource.id,
                });
                if (disableOnAction) {
                  setEditable(false);
                  return;
                }
                setEvents((previous) =>
                  previous.map((item) =>
                    item === event ? { ...item, start, end, resourceId: resource.id } : item,
                  ),
                );
              }
            : undefined
        }
        onCreateEvent={
          editable
            ? (start, end, resource) =>
                record({
                  type: "create",
                  start: start.getHours(),
                  end: end.getHours(),
                  resource: resource.id,
                })
            : undefined
        }
      />
      <output>{JSON.stringify(calls)}</output>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
