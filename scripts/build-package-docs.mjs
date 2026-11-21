#!/usr/bin/env node
// Bundles the docs site (docs/*.mdx) into each published package as plain
// Markdown, so a coding agent reads docs that match the installed version
// instead of the hosted site, which always describes the latest release.
//
// Each package gets docs/llms.txt (an index in the llms.txt convention) plus the
// pages its users need, converted from Mintlify MDX. Links to bundled pages
// become relative; every other site link becomes an absolute URL on the
// package's `homepage`. An MDX component this script cannot convert fails the
// run, so a new component never leaks into the published Markdown.
//
// Usage: node scripts/build-package-docs.mjs [--out <dir>] [core|native|dom|solid ...]
//   With no package names it builds all four. Output goes to packages/<pkg>/docs,
//   or to <dir>/<pkg> with --out. Each package's `build` script runs it.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const docsRoot = join(root, "docs");

// Pages every renderer's users need: the overview, views, events, styling,
// interaction, the headless core, and the reference. Most guides show
// @super-calendar/native imports, which the renderer packages share by name.
const rendererPages = [
  "index",
  "quickstart",
  "guides/views",
  "guides/month-view",
  "guides/year-view",
  "guides/time-grid",
  "guides/schedule",
  "guides/month-list",
  "guides/resource-timeline",
  "guides/date-picker",
  "guides/events",
  "guides/dragging",
  "guides/recurring-events",
  "guides/time-zones",
  "guides/ical",
  "guides/theming",
  "guides/styling",
  "guides/selection",
  "guides/accessibility",
  "guides/headless",
  "reference/renderers",
  "reference/api",
];

const packages = {
  core: {
    pages: [
      "index",
      "guides/headless",
      "guides/events",
      "guides/recurring-events",
      "guides/time-zones",
      "guides/ical",
      "guides/selection",
      "reference/renderers",
      "reference/api",
    ],
    scope:
      "Start with [Headless core](guides/headless.md). The other guides show the renderer components. Their date, event, recurrence and time zone helpers come from this package; component and theme types such as `RenderEventArgs` and `CalendarTheme` come from the renderer packages.",
  },
  native: {
    pages: [
      ...rendererPages,
      "guides/web",
      "migrating-from-big-calendar",
      "migrating-from-calendar-kit",
      "coming-from-fullcalendar",
      "coming-from-react-big-calendar",
    ],
    scope:
      "The guides use this package in their examples. For react-native-web, read [React Native on the web](guides/web.md).",
  },
  dom: {
    pages: [
      ...rendererPages,
      "guides/dom",
      "coming-from-fullcalendar",
      "coming-from-react-big-calendar",
    ],
    scope:
      "Start with [react-dom renderer](guides/dom.md). Most other guides import from `@super-calendar/native`. This package has the same calendar components, but some names differ: themes are `defaultDomTheme`, `darkDomTheme` and `mergeDomTheme`, passed with the `theme` prop rather than a provider; render arguments are `DomRenderEventArgs`; and time zone helpers such as `eventsInTimeZone` come from `@super-calendar/core`. Native-only exports such as `MonthPager` and `DefaultEvent` have no dom equivalent. [Renderer comparison](reference/renderers.md) lists the other differences.",
  },
  solid: {
    pages: [...rendererPages, "guides/solid"],
    scope:
      "Start with [Solid 2](guides/solid.md), which shows the Solid equivalents of the React APIs. Most other guides show React examples from `@super-calendar/native`; [Renderer comparison](reference/renderers.md) lists what differs.",
  },
};

const calloutLabels = {
  Note: "Note",
  Tip: "Tip",
  Warning: "Warning",
  Info: "Info",
  Check: "Check",
};
const passThrough = new Set(["Tabs", "Steps", "CodeGroup", "CardGroup"]);
// Returns the fence that a line opens or closes, also inside a blockquote.
const fenceMarker = (line) => /^(`{3,}|~{3,})/.exec(line.replace(/^[\s>]*/, ""))?.[1];

function parseArgs(argv) {
  let out;
  const names = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") {
      out = argv[++i];
      if (!out) throw new Error("--out needs a directory");
    } else if (Object.hasOwn(packages, argv[i])) {
      names.push(argv[i]);
    } else {
      throw new Error(
        `Unknown argument ${JSON.stringify(argv[i])}. Usage: node scripts/build-package-docs.mjs [--out <dir>] [${Object.keys(packages).join("|")} ...]`,
      );
    }
  }
  return { out: out && resolve(out), names: names.length ? names : Object.keys(packages) };
}

function readNavigation() {
  const config = JSON.parse(readFileSync(join(docsRoot, "docs.json"), "utf8"));
  const redirects = new Map(
    (config.redirects ?? []).map(({ source, destination }) => [
      trimSlashes(source),
      trimSlashes(destination),
    ]),
  );
  return { groups: config.navigation.groups, redirects };
}

const trimSlashes = (path) => path.replace(/^\/+|\/+$/g, "");

function parseFrontmatter(source, file) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) throw new Error(`${file} has no frontmatter`);
  const fields = {};
  for (const line of match[1].split("\n")) {
    const field = /^(\w+):\s*(.*)$/.exec(line);
    if (field) fields[field[1]] = field[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  if (!fields.title) throw new Error(`${file} has no title`);
  return { fields, body: source.slice(match[0].length) };
}

const indentOf = (line) => /^\s*/.exec(line)[0].length;

// Reads the attributes of a JSX opening tag: quoted values and `{...}` values.
function parseAttributes(text) {
  const attributes = {};
  for (const match of text.matchAll(/(\w+)=(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g)) {
    attributes[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return attributes;
}

function requireAttribute(attributes, key, name, file) {
  if (!attributes[key]) throw new Error(`${file}: <${name}> needs a ${key}`);
  return attributes[key];
}

// Finds the line and column just past the `>` that ends an opening tag that
// starts at lines[start]. Returns whether the tag closes itself.
function readOpeningTag(lines, start, file) {
  let text = "";
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    for (let column = 0; column < line.length; column++) {
      const char = line[column];
      if (char === '"' || char === "'") {
        const end = line.indexOf(char, column + 1);
        if (end === -1) throw new Error(`${file}: unterminated attribute`);
        text += line.slice(column, end + 1);
        column = end;
      } else if (char === ">") {
        return { text, line: i, column: column + 1, selfClosing: text.trimEnd().endsWith("/") };
      } else {
        text += char;
      }
    }
    text += " ";
  }
  throw new Error(`${file}: unterminated tag`);
}

// Finds the closing tag that matches an opening tag, skipping fenced code and
// nested tags with the same name.
function findClosingTag(lines, line, column, name, file) {
  let depth = 1;
  let fence = null;
  const pattern = new RegExp(`<(/?)${name}(?=[\\s>/])`, "g");
  for (let i = line; i < lines.length; i++) {
    const text = i === line ? lines[i].slice(column) : lines[i];
    if (fence) {
      if (fenceMarker(text)?.startsWith(fence)) fence = null;
      continue;
    }
    const marker = fenceMarker(text);
    if (marker && i !== line) {
      fence = marker;
      continue;
    }
    for (const match of text.matchAll(pattern)) {
      const after = text.slice(match.index);
      if (match[1]) depth--;
      else if (!/^<[^>]*\/>/.test(after)) depth++;
      if (depth === 0) return { line: i, column: (i === line ? column : 0) + match.index };
    }
  }
  throw new Error(`${file}: <${name}> is never closed`);
}

function dedent(lines) {
  const indents = lines.filter((line) => line.trim()).map(indentOf);
  const amount = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(Math.min(amount, indentOf(line))));
}

const trimBlankEdges = (lines) => {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
};

const heading = (level, text) => `${"#".repeat(Math.min(Math.max(level, 2), 6))} ${text}`;

// Converts MDX body lines to Markdown. `level` is the heading level of the
// enclosing section, so a tab or step becomes a heading one level below it.
function convert(lines, level, file) {
  const out = [];
  let fence = null;
  let current = level;
  let step = 0;
  // A card with an href is a list item; anything after the run of cards
  // needs a blank line so it doesn't continue the list.
  let afterCard = false;
  const push = (line) => {
    if (afterCard && line.trim()) out.push("");
    afterCard = false;
    out.push(line);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      out.push(line);
      if (fenceMarker(line)?.startsWith(fence)) fence = null;
      continue;
    }
    const marker = fenceMarker(line);
    if (marker) {
      fence = marker;
      push(line);
      continue;
    }
    const headingMatch = /^(#{1,6})\s/.exec(line);
    if (headingMatch) current = headingMatch[1].length;

    const trimmed = line.trimStart();
    if (trimmed.startsWith("{/*")) {
      while (!lines[i].includes("*/}")) {
        if (++i === lines.length) throw new Error(`${file}: unterminated MDX comment`);
      }
      // Keep any text after the comment on its closing line.
      const rest = lines[i].slice(lines[i].indexOf("*/}") + 3);
      if (rest.trim()) push(rest.trimStart());
      continue;
    }
    const tag = /^<([A-Za-z][\w.]*)/.exec(trimmed);
    if (!tag) {
      push(line);
      continue;
    }
    const name = tag[1];
    const open = readOpeningTag(lines, i, file);
    const attributes = parseAttributes(open.text);

    if (name === "img" || name === "iframe") {
      if (!open.selfClosing) throw new Error(`${file}: <${name}> must close itself`);
      push(
        name === "img"
          ? `![${attributes.alt ?? ""}](${attributes.src})`
          : `[${attributes.title ?? attributes.src}](${attributes.src})`,
      );
      i = open.line;
      continue;
    }
    if (/^[a-z]/.test(name)) {
      push(line);
      continue;
    }
    if (open.selfClosing) throw new Error(`${file}: unsupported component <${name} />`);
    // Content is dedented to its scope, so an indented tag sits inside a list
    // item, which the flattened output could not keep.
    if (trimmed !== line) throw new Error(`${file}: indented <${name}> is unsupported`);

    const close = findClosingTag(lines, open.line, open.column, name, file);
    let inner;
    if (close.line === open.line) {
      inner = [lines[open.line].slice(open.column, close.column)];
    } else {
      const first = lines[open.line].slice(open.column);
      const rest = lines.slice(open.line + 1, close.line);
      const last = lines[close.line].slice(0, close.column);
      inner = [...dedent([...rest, ...(last.trim() ? [last] : [])])];
      if (first.trim()) inner.unshift(first.trim());
    }
    const trailing = lines[close.line].slice(close.column).replace(new RegExp(`^</${name}>`), "");
    if (trailing.trim()) throw new Error(`${file}: text after </${name}>`);
    i = close.line;

    const body = (childLevel) => trimBlankEdges(convert(inner, childLevel, file));
    const block = [];
    if (passThrough.has(name)) {
      block.push(...body(current));
    } else if (name === "Tab") {
      block.push(
        heading(current + 1, requireAttribute(attributes, "title", name, file)),
        "",
        ...body(current + 1),
      );
    } else if (name === "Step") {
      step++;
      block.push(
        heading(current + 1, `${step}. ${requireAttribute(attributes, "title", name, file)}`),
        "",
        ...body(current + 1),
      );
    } else if (Object.hasOwn(calloutLabels, name)) {
      const content = body(current);
      block.push(`> **${calloutLabels[name]}**`, ">", ...content.map((l) => (l ? `> ${l}` : ">")));
    } else if (name === "Card") {
      requireAttribute(attributes, "title", name, file);
      const text = body(current);
      if (attributes.href) {
        const summary = text.map((l) => l.trim()).join(" ");
        block.push(`- [${attributes.title}](${attributes.href})${summary ? `: ${summary}` : ""}`);
      } else {
        block.push(`**${attributes.title}**`, "", ...text);
      }
    } else if (name === "Frame") {
      block.push(...body(current));
      if (attributes.caption) block.push("", `*${attributes.caption}*`);
    } else {
      throw new Error(`${file}: unsupported component <${name}>`);
    }
    if (name === "Card" && attributes.href) {
      // Cards in a group form one list, so they stay on adjacent lines.
      out.push(...block);
      afterCard = true;
      continue;
    }
    afterCard = false;
    if (out.length && out.at(-1).trim()) out.push("");
    out.push(...block, "");
  }
  return out;
}

// Rewrites site-absolute links outside code: to a bundled page as a relative
// path, otherwise to an absolute URL on the docs site.
function rewriteLinks(markdown, page, bundled, redirects, site) {
  const resolveTarget = (target) => {
    const [path, hash = ""] = target.split(/(?=#)/);
    let slug = trimSlashes(path) || "index";
    slug = redirects.get(slug) ?? slug;
    if (bundled.has(slug)) {
      const relative = posix.relative(posix.dirname(page), slug);
      return `${relative || posix.basename(slug)}.md${hash}`;
    }
    return `${site}/${slug === "index" ? "" : slug}${hash}`;
  };
  return mapProse(markdown, (text) =>
    text
      .replace(/\]\(<?(\/[^)\s>]*)>?/g, (_, target) => `](${resolveTarget(target)}`)
      .replace(
        /^(\s*\[[^\]]+\]:\s*)<?(\/[^\s>]*)>?/,
        (_, label, target) => label + resolveTarget(target),
      ),
  );
}

// Applies `transform` to the text outside fenced code and inline code spans.
function mapProse(markdown, transform) {
  let fence = null;
  return markdown
    .split("\n")
    .map((line) => {
      if (fence) {
        if (fenceMarker(line)?.startsWith(fence)) fence = null;
        return line;
      }
      fence = fenceMarker(line) ?? null;
      if (fence) return line;
      // Odd segments are inline code spans.
      return line
        .split(/(`+[^`]*`+)/)
        .map((segment, index) => (index % 2 ? segment : transform(segment)))
        .join("");
    })
    .join("\n");
}

// Fails on MDX syntax or site-absolute links that survived conversion, such as
// a component in the middle of a line, an ESM import or export, an HTML tag with
// a JSX expression attribute, or a JSX expression in prose.
function assertConverted(markdown, file) {
  mapProse(markdown, (text) => {
    const leftover =
      /<[A-Z][\w.]*|\{\/\*|\]\(<?\/|^\s*\[[^\]]+\]:\s*<?\/|^\s*(?:import\s.*\sfrom\s|import\s+["']|export\s+(?:(?:const|let|var|function|class|default)\b|\{|\*))|<[a-z][\w-]*\s[^>]*=\{|\{[A-Za-z_$][\w.$]*\}/.exec(
        text,
      );
    if (leftover) throw new Error(`${file}: cannot convert ${JSON.stringify(text.trim())}`);
    return text;
  });
}

function convertPage(page, bundled, redirects, site) {
  const file = posix.join("docs", `${page}.mdx`);
  const { fields, body } = parseFrontmatter(readFileSync(join(root, file), "utf8"), file);
  const lines = convert(body.split("\n"), 1, file);
  const markdown = [
    `# ${fields.title}`,
    "",
    ...(fields.description ? [fields.description, ""] : []),
  ]
    .concat(trimBlankEdges(lines))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  const rewritten = rewriteLinks(markdown, page, bundled, redirects, site);
  assertConverted(rewritten, file);
  return {
    title: fields.sidebarTitle ?? fields.title,
    description: fields.description,
    markdown: `${rewritten}\n`,
  };
}

function buildPackage(name, outDir, navigation) {
  const manifest = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
  const site = manifest.homepage.replace(/\/+$/, "");
  const { pages, scope } = packages[name];
  const bundled = new Set(pages);
  const navigated = new Set(navigation.groups.flatMap((group) => group.pages));
  for (const page of bundled) {
    if (!navigated.has(page)) throw new Error(`${page} is not in docs/docs.json navigation`);
  }

  rmSync(outDir, { recursive: true, force: true });
  const converted = new Map();
  for (const page of bundled) {
    const result = convertPage(page, bundled, navigation.redirects, site);
    converted.set(page, result);
    const target = join(outDir, `${page}.md`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, result.markdown);
  }

  const index = [
    `# ${manifest.name}`,
    "",
    `> ${manifest.description}`,
    "",
    `These files document version ${manifest.version} of \`${manifest.name}\`, the version installed beside them. ${scope} The hosted docs at ${site} describe the latest release, so prefer these files when the versions differ.`,
  ];
  for (const group of navigation.groups) {
    const entries = group.pages.filter((page) => bundled.has(page));
    if (!entries.length) continue;
    index.push("", `## ${group.group}`, "");
    for (const page of entries) {
      const { title, description } = converted.get(page);
      index.push(`- [${title}](${page}.md)${description ? `: ${description}` : ""}`);
    }
  }
  writeFileSync(join(outDir, "llms.txt"), `${index.join("\n")}\n`);
}

const { out, names } = parseArgs(process.argv.slice(2));
const navigation = readNavigation();
for (const name of names) {
  buildPackage(name, out ? join(out, name) : join(root, "packages", name, "docs"), navigation);
}
