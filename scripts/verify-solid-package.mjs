// Install the publishable artifacts outside the workspace, without React, and
// verify both supported date-fns majors and the public documentation examples.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = await mkdtemp(join(tmpdir(), "calendar-solid-package-"));
const run = (command, args, cwd) => {
  try {
    return execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe", timeout: 120_000 });
  } catch (error) {
    throw new Error(
      `${command} ${args.join(" ")} failed\n${error.stdout ?? ""}\n${error.stderr ?? ""}`,
      { cause: error },
    );
  }
};
try {
  const tarballs = {};
  for (const name of ["core", "solid"]) {
    const directory = join(root, "packages", name);
    const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    run("pnpm", ["pack", "--pack-destination", temp], directory);
    tarballs[pkg.name] =
      `file:${join(temp, `${pkg.name.replace(/^@/, "").replace("/", "-")}-${pkg.version}.tgz`)}`;
  }
  const peers = JSON.parse(
    await readFile(join(root, "packages/solid/package.json"), "utf8"),
  ).peerDependencies;
  for (const dateFns of ["3.6.0", "4.4.0"]) {
    const fixture = join(temp, `date-fns-${dateFns}`);
    await mkdir(fixture);
    await writeFile(
      join(fixture, "package.json"),
      JSON.stringify({
        private: true,
        type: "module",
        dependencies: {
          ...tarballs,
          "date-fns": dateFns,
          "solid-js": peers["solid-js"],
          "@solidjs/web": peers["@solidjs/web"],
        },
      }),
    );
    await writeFile(
      join(fixture, "pnpm-workspace.yaml"),
      JSON.stringify({
        overrides: { "@super-calendar/core": tarballs["@super-calendar/core"] },
      }),
    );
    run("pnpm", ["install", "--ignore-scripts"], fixture);
    await writeFile(
      join(fixture, "server.mjs"),
      `
      import assert from 'node:assert/strict';
      import { createRequire } from 'node:module';
      import { renderToString } from '@solidjs/web';
      import * as calendar from '@super-calendar/solid';
      import * as core from '@super-calendar/core/vanilla';
      const require = createRequire(import.meta.url);
      assert.throws(() => require.resolve('react'), { code: 'MODULE_NOT_FOUND' });
      assert.throws(() => require.resolve('react-dom'), { code: 'MODULE_NOT_FOUND' });
      assert.equal('useDateRange' in core, false);
      assert.equal('useMonthGrid' in core, false);
      assert.equal(require('@super-calendar/core/vanilla').buildMonthGrid(new Date(2026, 10, 2)).weekdays.length, 7);
      const date = new Date(2026, 10, 2);
      const events = [{ title: 'Packed calendar', start: new Date(2026, 10, 2, 9), end: new Date(2026, 10, 2, 10) }];
      assert.equal(typeof require('@super-calendar/core/vanilla').loadEventSource, 'function');
      assert.equal(calendar.loadEventSource, core.loadEventSource);
      const feedURL = 'data:application/json,' + encodeURIComponent(JSON.stringify(events));
      const loaded = await core.loadEventSource({ source: feedURL });
      assert.deepEqual(loaded, events);
      let fetches = 0;
      renderToString(() => {
        const feed = calendar.createEventSource(() => async () => { fetches++; return events; });
        assert.deepEqual(feed.events(), []);
        assert.equal(feed.loading(), true);
        return '';
      });
      assert.equal(fetches, 0, 'SSR does not fetch an event source');
      for (const mode of ['month', 'multiweek', 'week', 'day', '3days', 'custom', 'schedule', 'year']) {
        const html = renderToString(() => calendar.Calendar({ date, now: date, events, mode }));
        assert(html.length > 1000, mode);
        assert(!html.includes('NaN'), mode);
        if (mode !== 'year') assert(html.includes('Packed calendar'), mode);
      }
      assert.equal(core.nextDateRange(null, date).start.getTime(), date.getTime());
    `,
    );
    run(process.execPath, ["server.mjs"], fixture);
    run(
      process.execPath,
      [
        "--conditions=browser",
        "--input-type=module",
        "-e",
        "import { Calendar } from '@super-calendar/solid'; if (typeof Calendar !== 'function') throw Error('Missing browser export');",
      ],
      fixture,
    );
    await writeFile(
      join(fixture, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          target: "ESNext",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          jsx: "preserve",
          jsxImportSource: "@solidjs/web",
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          types: [],
        },
        include: ["*.tsx"],
      }),
    );
    let sample = 0;
    for (const file of ["packages/solid/README.md", "docs/guides/solid.mdx"]) {
      const doc = await readFile(join(root, file), "utf8");
      for (const [, code] of doc.matchAll(/```tsx\n([\s\S]*?)\n```/g)) {
        await writeFile(join(fixture, `sample-${sample++}.tsx`), code);
      }
    }
    assert(sample >= 4, "Typecheck the public Solid examples");
    run(
      process.execPath,
      [
        join(root, "node_modules/typescript/lib/tsc.js"),
        "--project",
        join(fixture, "tsconfig.json"),
      ],
      fixture,
    );
    console.log(
      `Packed ESM, CJS vanilla, browser import, SSR, and documentation types pass without React on date-fns ${dateFns}`,
    );
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
