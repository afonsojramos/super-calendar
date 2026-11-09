export const defaultPerformanceOutput = "dist/performance/candidate";

export const interactions = [
  {
    id: "dense.mount",
    name: "Open a dense week",
    workload: "1,000 timed events",
    boundary: "Navigation start to rendered events and two animation frames",
  },
  {
    id: "dense.update",
    name: "Replace every event title",
    workload: "1,000 timed events",
    boundary: "Button activation to all new titles and two animation frames",
  },
  {
    id: "dense.chooser",
    name: "Open the event chooser",
    workload: "1,000 editable events",
    boundary: "Button activation to 1,000 choices and two animation frames",
  },
  {
    id: "months.scroll",
    name: "Scroll the month list",
    workload: "121 months, 4,000 px scroll",
    boundary: "Scroll assignment to changed virtual rows and two animation frames",
  },
  {
    id: "week.next",
    name: "Navigate to the next week",
    workload: "One event, seven days",
    boundary: "Button activation to the next date and columns, then two animation frames",
  },
  {
    id: "week.month",
    name: "Switch from week to month",
    workload: "One event",
    boundary: "Button activation to month days and two animation frames",
  },
  {
    id: "event.dialog",
    name: "Open event actions",
    workload: "One editable event",
    boundary: "Chooser activation to the action dialog and two animation frames",
  },
  {
    id: "event.action",
    name: "Move an event with an action",
    workload: "One event, 15 minutes later",
    boundary: "Action activation to the committed range and two animation frames",
  },
  {
    id: "event.move",
    name: "Drop an event on another day",
    workload: "One event, one day and one hour later",
    boundary: "Pointer release to the committed event and two animation frames",
  },
  {
    id: "event.resize",
    name: "Extend an event",
    workload: "One event, one hour longer",
    boundary: "Pointer release to the committed event and two animation frames",
  },
  {
    id: "event.create",
    name: "Create a timed event",
    workload: "One existing event, two-hour sweep",
    boundary: "Pointer release to the created event and two animation frames",
  },
] as const;

export type InteractionId = (typeof interactions)[number]["id"];

export const unmeasuredInteractions = [
  {
    name: "Native release: page, scroll, hold, move, resize",
    reason: "Requires a release build on a physical device with frame and input traces",
  },
  {
    name: "Continuous drag and scroll frame pacing",
    reason: "Release and settled-update timings do not measure dropped frames or input latency",
  },
  {
    name: "Resource timeline and date-picker interactions",
    reason: "Functional browser coverage exists; performance samples are not collected yet",
  },
] as const;

export function interactionMapMarkdown() {
  return [
    "| ID | Interaction | Workload | Timing boundary |",
    "| --- | --- | --- | --- |",
    ...interactions.map(
      (row) => `| \`${row.id}\` | ${row.name} | ${row.workload} | ${row.boundary} |`,
    ),
  ].join("\n");
}
