export interface ImpureRead {
  kind: "clock" | "random" | "global";
  name: string;
  /** The first frames outside this helper, pointing at the code that read it. */
  stack: string;
}

export interface ImpureReadTrace<T> {
  /** The render's return value, or `undefined` when a browser global aborted it. */
  result: T | undefined;
  reads: ImpureRead[];
}

export interface TraceOptions {
  /** Drop a clock or random read when any frame of its full stack matches one of these. */
  ignoreFrames?: RegExp[];
}

/** Globals a server render must not depend on. */
export const browserGlobals = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "matchMedia",
  "requestAnimationFrame",
] as const;

const stackDepth = 6;
const helperFile = /[/\\]server-purity\.ts/;
const root = `${process.cwd()}/`;

function frames(stack: string | undefined): string[] {
  return (stack ?? "").split("\n").slice(1);
}

function excerpt(stack: string | undefined): string {
  return frames(stack)
    .filter((line) => !helperFile.test(line))
    .slice(0, stackDepth)
    .map((line) => line.trim().replace("file://", "").replaceAll(root, ""))
    .join("\n");
}

/**
 * Runs `render` with the wall clock, `Math.random` and browser globals trapped,
 * then restores them. Clock and random reads are recorded and still return real
 * values, so the render runs to completion and reports every read.
 *
 * Browser globals are removed for the render, as on a real server: a
 * `typeof window === "undefined"` guard sees nothing and records nothing, while
 * an unguarded read throws a `ReferenceError` that ends the render. That read is
 * recorded from the error, so only the first one is reported. A read inside a
 * `try`/`catch` that swallows the error is not recorded.
 */
export function traceImpureReads<T>(
  render: () => T,
  { ignoreFrames = [] }: TraceOptions = {},
): ImpureReadTrace<T> {
  const reads: ImpureRead[] = [];
  const record = (kind: ImpureRead["kind"], name: string) => {
    const stack = new Error().stack;
    const ignored = frames(stack).some((frame) =>
      ignoreFrames.some((pattern) => pattern.test(frame)),
    );
    if (!ignored) reads.push({ kind, name, stack: excerpt(stack) });
  };

  const RealDate = Date;
  const realNow = RealDate.now;
  const realRandom = Math.random;
  const now = () => {
    record("clock", "Date.now()");
    return realNow();
  };
  const TrappedDate: DateConstructor = new Proxy(RealDate, {
    apply(target, self, args) {
      record("clock", "Date()");
      return Reflect.apply(target, self, args);
    },
    construct(target, args, newTarget): object {
      if (args.length === 0) record("clock", "new Date()");
      return Reflect.construct(target, args, newTarget === TrappedDate ? target : newTarget);
    },
    get(target, key) {
      return key === "now" ? now : Reflect.get(target, key, target);
    },
  });

  const saved = browserGlobals.flatMap((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    return descriptor ? [{ name, descriptor }] : [];
  });

  globalThis.Date = TrappedDate;
  Math.random = () => {
    record("random", "Math.random()");
    return realRandom();
  };
  for (const { name } of saved) Reflect.deleteProperty(globalThis, name);
  try {
    return { result: render(), reads };
  } catch (error) {
    const missing =
      error instanceof ReferenceError ? /^(\w+) is not defined$/.exec(error.message) : null;
    if (!missing || !(browserGlobals as readonly string[]).includes(missing[1]!)) throw error;
    reads.push({ kind: "global", name: missing[1]!, stack: excerpt((error as Error).stack) });
    return { result: undefined, reads };
  } finally {
    globalThis.Date = RealDate;
    Math.random = realRandom;
    for (const { name, descriptor } of saved) Object.defineProperty(globalThis, name, descriptor);
  }
}
