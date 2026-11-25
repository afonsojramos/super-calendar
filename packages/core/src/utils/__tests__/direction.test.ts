import { arrowKeyDayStep, columnAtX, screenContinues } from "../direction";

describe("arrowKeyDayStep", () => {
  it("moves a day toward the pressed arrow left to right", () => {
    expect(arrowKeyDayStep("ArrowRight")).toBe(1);
    expect(arrowKeyDayStep("ArrowLeft")).toBe(-1);
  });

  it("mirrors the arrows right to left", () => {
    expect(arrowKeyDayStep("ArrowRight", true)).toBe(-1);
    expect(arrowKeyDayStep("ArrowLeft", true)).toBe(1);
  });

  it("ignores other keys", () => {
    expect(arrowKeyDayStep("ArrowUp", true)).toBe(0);
    expect(arrowKeyDayStep("PageDown")).toBe(0);
  });
});

describe("columnAtX", () => {
  it("counts columns from the left edge left to right", () => {
    expect(columnAtX(0, 100, 7)).toBe(0);
    expect(columnAtX(250, 100, 7)).toBe(2);
    expect(columnAtX(699, 100, 7)).toBe(6);
  });

  it("counts columns from the right edge right to left", () => {
    expect(columnAtX(0, 100, 7, true)).toBe(6);
    expect(columnAtX(250, 100, 7, true)).toBe(4);
    expect(columnAtX(699, 100, 7, true)).toBe(0);
  });

  it("returns columns outside the row for points outside it", () => {
    expect(columnAtX(-1, 100, 7)).toBe(-1);
    expect(columnAtX(-1, 100, 7, true)).toBe(7);
  });
});

describe("screenContinues", () => {
  const segment = { continuesBefore: true, continuesAfter: false };

  it("keeps the flags left to right", () => {
    expect(screenContinues(segment)).toEqual(segment);
  });

  it("names the screen edges right to left", () => {
    expect(screenContinues(segment, true)).toEqual({
      continuesBefore: false,
      continuesAfter: true,
    });
  });
});
