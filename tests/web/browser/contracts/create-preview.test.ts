import { describe, expect, it } from "vitest";
import { open, page, rendererName } from "../session";

type Bounds = { x: number; y: number; width: number; height: number };
type Direction = "up" | "down";

const calls = () => page.getByLabel("Calls").textContent();

async function bounds(selector: string): Promise<Bounds> {
  const found = await page.locator(selector).first().boundingBox();
  if (!found) throw new Error(`No visible bounds for ${selector}`);
  return found;
}

// Open a create scenario with its whole first day column on screen.
async function openColumn(view: string) {
  await page.setViewportSize({ width: 1100, height: 1000 });
  await open(view);
  return bounds('[data-slot="dayColumn"]');
}

// Press the first column at `fromY`, move to `toY` and measure the preview while
// the pointer is still held.
async function holdPreview(column: Bounds, fromY: number, toY: number) {
  const x = column.x + column.width / 2;
  await page.mouse.move(x, fromY);
  await page.mouse.down();
  if (toY !== fromY) await page.mouse.move(x, toY, { steps: 6 });
  await page.locator('[data-slot="createGhost"]').waitFor();
  return bounds('[data-slot="createGhost"]');
}

// Pointer coordinates can round to whole pixels in some engines.
function expectNear(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

function expectInside(preview: Bounds, column: Bounds) {
  expect(preview.y).toBeGreaterThanOrEqual(column.y);
  expect(preview.y + preview.height).toBeLessThanOrEqual(column.y + column.height);
}

// The column's edge the drag heads for, overshot by `overshoot` pixels.
const target = (column: Bounds, direction: Direction, overshoot: number) =>
  direction === "up" ? column.y - overshoot : column.y + column.height + overshoot;

const sweeps = (views: string[]) =>
  views.flatMap((view) =>
    (["up", "down"] as const).flatMap((direction) =>
      [0, 60].map((overshoot) => ({ view, direction, overshoot })),
    ),
  );

describe(rendererName, () => {
  it.each(
    sweeps([
      "create-week",
      "create-day",
      "create-week-window",
      "create-day-window",
      "create-week-classed",
      "create-week-styled",
    ]),
  )(
    "keeps the $view preview inside the grid when dragging $direction $overshoot px past the edge",
    async ({ view, direction, overshoot }) => {
      const column = await openColumn(view);
      const pressY = column.y + column.height / 2;
      const preview = await holdPreview(column, pressY, target(column, direction, overshoot));
      expectInside(preview, column);
      if (direction === "up") {
        expectNear(preview.y, column.y);
        expectNear(preview.y + preview.height, pressY);
      } else {
        expectNear(preview.y, pressY);
        expectNear(preview.y + preview.height, column.y + column.height);
      }
      await page.mouse.up();
      await expect.poll(() => page.locator('[data-slot="createGhost"]').count()).toBe(0);
    },
  );

  it.each(
    ["create-week", "create-week-window", "create-week-classed"].flatMap((view) =>
      (["up", "down"] as const).map((direction) => ({ view, direction })),
    ),
  )(
    "spans the whole $view grid when sweeping $direction from edge to past the other edge",
    async ({ view, direction }) => {
      const column = await openColumn(view);
      const pressY = direction === "up" ? column.y + column.height - 1 : column.y + 1;
      const preview = await holdPreview(column, pressY, target(column, direction, 60));
      expectInside(preview, column);
      expectNear(preview.y, column.y);
      expectNear(preview.height, column.height);
      await page.mouse.up();
    },
  );

  it.each(
    sweeps(["create-week", "create-day"]).map((sweep) => {
      const day = sweep.view === "create-week" ? 13 : 15;
      return {
        ...sweep,
        range: sweep.direction === "up" ? `${day}:0:0-${day}:12:0` : `${day}:12:0-${day + 1}:0:0`,
      };
    }),
  )(
    "creates $range from the $view grid when dragging $direction $overshoot px past the edge",
    async ({ view, direction, overshoot, range }) => {
      const column = await openColumn(view);
      await holdPreview(column, column.y + column.height / 2, target(column, direction, overshoot));
      await page.mouse.up();
      expect(await calls()).toBe(JSON.stringify([range]));
    },
  );

  it.each(
    ["create-week", "create-week-window", "create-week-classed", "create-week-styled"].flatMap(
      (view) => (["top", "bottom"] as const).map((edge) => ({ view, edge })),
    ),
  )(
    "keeps the minimum $view preview inside the grid when pressing its $edge pixel",
    async ({ view, edge }) => {
      const column = await openColumn(view);
      const pressY = edge === "top" ? column.y + 1 : column.y + column.height - 1;
      const preview = await holdPreview(column, pressY, pressY);
      expectInside(preview, column);
      expect(preview.height).toBeGreaterThanOrEqual(2);
      if (edge === "top") expectNear(preview.y, column.y);
      else expectNear(preview.y + preview.height, column.y + column.height);
      await page.mouse.up();
      expect(await calls()).toBe("[]");
    },
  );
});
