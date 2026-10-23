import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { transformFileSync } from "@babel/core";

// On React Native, Metro compiles core from source with the worklets Babel
// plugin. The plugin turns each "worklet" function declaration into a `const`
// whose closure captures its dependencies when the module is evaluated, so a
// worklet that calls a function declared further down the file captures
// `undefined` (or hits the TDZ) and throws once it runs. Plain Jest never
// applies that plugin, so this compiles core's worklet modules the way Metro
// does and checks every closure is filled.

const CORE_SRC = path.resolve(__dirname, "../packages/core/src");

function compile(file: string): string {
  const result = transformFileSync(file, {
    babelrc: false,
    configFile: false,
    presets: [
      ["@babel/preset-env", { targets: { node: "current" }, modules: "commonjs" }],
      "@babel/preset-typescript",
    ],
    plugins: ["react-native-worklets/plugin"],
  });
  if (!result?.code) throw new Error(`Babel produced no output for ${file}`);
  return result.code;
}

function resolveSource(base: string): string {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`Cannot resolve ${base}`);
}

// A minimal CommonJS loader: core's own modules go through `compile`, anything
// else (date-fns) loads normally.
function loadCompiled(entry: string): Record<string, unknown> {
  const cache = new Map<string, { exports: Record<string, unknown> }>();
  const load = (file: string): Record<string, unknown> => {
    const cached = cache.get(file);
    if (cached) return cached.exports;
    const module = { exports: {} as Record<string, unknown> };
    cache.set(file, module);
    const localRequire = (spec: string) =>
      spec.startsWith(".")
        ? load(resolveSource(path.resolve(path.dirname(file), spec)))
        : require(spec);
    vm.compileFunction(compile(file), ["require", "module", "exports"], { filename: file })(
      localRequire,
      module,
      module.exports,
    );
    return module.exports;
  };
  return load(entry);
}

const workletModules = fs
  .readdirSync(CORE_SRC, { recursive: true })
  .map((entry) => path.join(CORE_SRC, entry.toString()))
  .filter(
    (file) =>
      /\.tsx?$/.test(file) &&
      !file.includes("__tests__") &&
      /^\s*["']worklet["'];?\s*$/m.test(fs.readFileSync(file, "utf8")),
  );

test("core has worklet modules to check", () => {
  expect(workletModules.length).toBeGreaterThan(0);
});

describe.each(workletModules.map((file) => [path.relative(CORE_SRC, file), file]))(
  "%s compiled with the worklets plugin",
  (_name, file) => {
    test("captures every worklet dependency when the module loads", () => {
      const exports = loadCompiled(file);
      const worklets = Object.entries(exports).filter(
        (entry): entry is [string, { __closure: Record<string, unknown> }] =>
          typeof entry[1] === "function" && "__closure" in entry[1],
      );
      expect(worklets.length).toBeGreaterThan(0);
      for (const [name, worklet] of worklets) {
        for (const [dep, value] of Object.entries(worklet.__closure)) {
          expect({ worklet: name, dep, captured: value !== undefined }).toEqual({
            worklet: name,
            dep,
            captured: true,
          });
        }
      }
    });
  },
);
