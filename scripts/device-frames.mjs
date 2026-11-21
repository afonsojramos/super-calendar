// Split a device screen recording into the frames where the screen changed, each
// named with its time on the clip, to measure short glitches (a blank page, a
// jump) frame by frame. Requires ffmpeg on PATH.
//
//   node scripts/device-frames.mjs <clip.mp4> [--out <dir>] [--crop <top>,<height>] [--width <px>]
//
// --crop keeps a horizontal band, given as fractions of the screen height (for
// example 0.45,0.5 for the middle half). --width scales the frames down (default
// 270). Frames go to <clip>-frames unless --out is set, replacing earlier frames.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    crop: { type: "string" },
    width: { type: "string", default: "270" },
  },
});
const usage =
  "Usage: node scripts/device-frames.mjs <clip.mp4> [--out <dir>] [--crop <top>,<height>] [--width <px>]";
assert(positionals.length === 1, usage);
const [clip] = positionals;
assert(existsSync(clip), `No such recording: ${clip}`);

const width = Number(values.width);
assert(Number.isInteger(width) && width > 0, "--width must be a positive integer");
const filters = [];
if (values.crop) {
  const band = values.crop.split(",").map(Number);
  assert(
    band.length === 2 &&
      band.every((n) => n >= 0 && n <= 1) &&
      band[0] + band[1] <= 1 &&
      band[1] > 0,
    "--crop takes <top>,<height> as fractions of the screen height, for example 0.45,0.5",
  );
  filters.push(`crop=iw:ih*${band[1]}:0:ih*${band[0]}`);
}
// The thresholds drop frames that differ only by video compression noise.
filters.push("mpdecimate=hi=64*12:lo=64*5:frac=0.1", "showinfo", `scale=${width}:-1`);

const out = values.out ?? clip.replace(/\.[^./]+$/, "") + "-frames";
await mkdir(out, { recursive: true });
// Remove only frames an earlier run wrote, so a mistyped --out deletes nothing else.
const earlierFrame = /^\d{6}(-\d+\.\d{3}s)?\.png$/;
for (const name of await readdir(out)) {
  if (earlierFrame.test(name)) await rm(join(out, name));
}
const ffmpeg = spawnSync(
  "ffmpeg",
  [
    "-loglevel",
    "info",
    "-i",
    clip,
    "-vf",
    filters.join(","),
    "-fps_mode",
    "vfr",
    join(out, "%06d.png"),
  ],
  // showinfo writes a few hundred bytes per frame, more than the default buffer holds.
  { encoding: "utf8", maxBuffer: Infinity },
);
assert(!ffmpeg.error, `Could not run ffmpeg: ${ffmpeg.error?.message}`);
assert.equal(ffmpeg.status, 0, ffmpeg.stderr);

// showinfo logs one line per kept frame, in output order.
const times = [...ffmpeg.stderr.matchAll(/\bpts_time:\s*([\d.]+)/g)].map((m) => Number(m[1]));
const frames = (await readdir(out)).filter((name) => /^\d{6}\.png$/.test(name)).sort();
assert.equal(frames.length, times.length, "ffmpeg frame count and timestamps disagree");
for (const [index, name] of frames.entries()) {
  await rename(join(out, name), join(out, `${name.slice(0, 6)}-${times[index].toFixed(3)}s.png`));
}
console.log(`${frames.length} distinct frames in ${out}`);
