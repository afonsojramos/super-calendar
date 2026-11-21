import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const packages = ["core", "native", "dom", "solid"];
// Any JSX component or MDX comment, which covers every Mintlify tag such as
// <Tabs>, <Tab>, <Steps>, <Step>, <CardGroup>, <Card>, <Note>, <Warning>, <Tip>, and <Info>.
const mdxSyntax = /<\/?[A-Z]|\{\/\*/;
let out: string;

beforeAll(() => {
  out = mkdtempSync(path.join(tmpdir(), "calendar-package-docs-"));
  const result = spawnSync(process.execPath, ["scripts/build-package-docs.mjs", "--out", out], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

function markdownFiles(name: string) {
  return readdirSync(path.join(out, name), { recursive: true })
    .map((file) => String(file).split(path.sep).join("/"))
    .filter((file) => file.endsWith(".md"));
}

// Lines outside fenced code, with inline code spans removed.
function prose(markdown: string) {
  let fence: string | null = null;
  return markdown.split("\n").flatMap((line) => {
    const opener = /^[\s>]*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (opener?.[1].startsWith(fence)) fence = null;
      return [];
    }
    if (opener) {
      fence = opener[1];
      return [];
    }
    return [line.replace(/`+[^`]*`+/g, "")];
  });
}

function links(markdown: string) {
  return prose(markdown).flatMap((line) =>
    [...line.matchAll(/\]\(<?([^)\s>]+)/g), ...line.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)/g)].map(
      (match) => match[1],
    ),
  );
}

describe.each(packages)("@super-calendar/%s bundled docs", (name) => {
  it("has an llms.txt whose links all resolve to bundled files", () => {
    const index = path.join(out, name, "llms.txt");
    expect(existsSync(index)).toBe(true);
    const targets = links(readFileSync(index, "utf8")).filter((link) => !/^https?:/.test(link));
    expect(targets.length).toBeGreaterThan(0);
    expect(
      targets.filter(
        (target) => !target.endsWith(".md") || !existsSync(path.join(out, name, target)),
      ),
    ).toEqual([]);
    expect(new Set(targets)).toEqual(new Set(markdownFiles(name)));
  });

  it("leaves no Mintlify component or MDX comment", () => {
    const leftovers = markdownFiles(name).flatMap((file) =>
      prose(readFileSync(path.join(out, name, file), "utf8"))
        .filter((line) => mdxSyntax.test(line))
        .map((line) => `${file}: ${line}`),
    );
    expect(leftovers).toEqual([]);
  });

  it("links to bundled files relatively and to everything else absolutely", () => {
    const broken = markdownFiles(name).flatMap((file) =>
      links(readFileSync(path.join(out, name, file), "utf8"))
        .filter((link) => !/^(https?:|mailto:|#)/.test(link))
        .filter((link) => {
          const target = path.join(out, name, path.dirname(file), link.replace(/#.*$/, ""));
          return !/^[^/].*\.md(#.*)?$/.test(link) || !existsSync(target);
        })
        .map((link) => `${file}: ${link}`),
    );
    expect(broken).toEqual([]);
  });
});

it("scopes each renderer's docs to its platform", () => {
  const pages = (name: string) => new Set(markdownFiles(name));
  expect(pages("native")).toContain("guides/web.md");
  expect(pages("dom")).toContain("guides/dom.md");
  expect(pages("dom")).not.toContain("guides/web.md");
  expect(pages("solid")).toContain("guides/solid.md");
  expect(pages("solid")).not.toContain("guides/dom.md");
  for (const name of ["native", "dom", "solid"]) {
    expect(pages(name)).toContain("reference/api.md");
  }
});
