import fs from "node:fs";
import path from "node:path";
import { Node, Project } from "ts-morph";

// Guards the docs against drifting from the public type surface. The types are
// the source of truth: every prop carries TSDoc and `src/index.tsx` is the
// export list. These checks fail the build when the docs reference a prop or
// export that was renamed or removed, or when a new runtime export is left out
// of the API reference. They do not force every prop to be documented (the
// reference is a curated subset), only that what is written stays true.

const NATIVE_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(NATIVE_ROOT, "..", "..");
const SRC_INDEX = path.join(NATIVE_ROOT, "src", "index.tsx");
const DOCS = path.join(REPO_ROOT, "docs");
const API_DOC = path.join(DOCS, "reference", "api.mdx");
const PACKAGE = "@super-calendar/native";

// Runtime exports the cards intentionally omit. Add a name here (with a reason)
// to opt it out of the "every runtime export is documented" check.
const UNDOCUMENTED_EXPORTS = new Set<string>([]);

const project = new Project({
  tsConfigFilePath: path.join(REPO_ROOT, "tsconfig.json"),
  skipAddingFilesFromTsConfig: false,
});
const indexExports = project.getSourceFileOrThrow(SRC_INDEX).getExportedDeclarations();

const allExports = new Set<string>(indexExports.keys());

// Runtime (value) exports must all appear in the Exports cards. Type-only
// exports (the Types card is a curated subset) only need to be real, not listed.
const valueExports = new Set<string>();
for (const [name, decls] of indexExports) {
  const isValue = decls.some(
    (d) => !Node.isTypeAliasDeclaration(d) && !Node.isInterfaceDeclaration(d),
  );
  if (isValue) valueExports.add(name);
}

// Props of every exported `*Props` type, keyed by the component they belong to
// (`CalendarProps` -> `Calendar`), so a documented or used prop is checked
// against the right component's surface.
const componentProps = new Map<string, Set<string>>();
for (const [name, decls] of indexExports) {
  if (!name.endsWith("Props")) continue;
  const props = new Set<string>();
  for (const d of decls) {
    if (Node.isTypeAliasDeclaration(d) || Node.isInterfaceDeclaration(d)) {
      for (const p of d.getType().getProperties()) props.add(p.getName());
    }
  }
  if (props.size) componentProps.set(name.slice(0, -"Props".length), props);
}
const calendarProps = componentProps.get("Calendar") ?? new Set<string>();

// Attributes React handles itself rather than passing as props.
const REACT_ATTRIBUTES = new Set(["key", "ref"]);

const read = (file: string) => fs.readFileSync(file, "utf8");

// First-column backtick token of every markdown table row. Header and separator
// rows have no backticks, so they are skipped.
function tableFirstColumns(markdown: string): string[] {
  const out: string[] = [];
  for (const line of markdown.split("\n")) {
    const m = /^\|\s*`([^`]+)`/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

// Every fenced code block written in one of the given languages.
function codeBlocks(markdown: string, langs: string[]): string[] {
  const out: string[] = [];
  const re = /```(\w+)\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    if (langs.includes(m[1])) out.push(m[2]);
  }
  return out;
}

function mdxFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true })
    .map((entry) => path.join(dir, entry.toString()))
    .filter((file) => file.endsWith(".mdx"));
}

describe("docs stay in sync with the type surface", () => {
  it("every prop in the API reference tables exists on CalendarProps", () => {
    const unknown = tableFirstColumns(read(API_DOC)).filter((prop) => !calendarProps.has(prop));
    expect(unknown).toEqual([]);
  });

  it("the Exports cards list every runtime export and nothing stale", () => {
    const md = read(API_DOC);
    const start = md.indexOf("## Exports");
    const rest = md.slice(start + 1);
    const next = rest.indexOf("\n## ");
    const section = next === -1 ? rest : rest.slice(0, next);

    const listed = new Set<string>([...section.matchAll(/`([^`]+)`/g)].map((m) => m[1]));

    const stale = [...listed].filter((name) => !allExports.has(name));
    expect(stale).toEqual([]);

    const missing = [...valueExports].filter(
      (name) => !listed.has(name) && !UNDOCUMENTED_EXPORTS.has(name),
    );
    expect(missing).toEqual([]);
  });

  it("doc code samples only import real exports and use real props", () => {
    const parser = new Project({ useInMemoryFileSystem: true });
    const importViolations: string[] = [];
    const propViolations: string[] = [];

    for (const file of mdxFiles(DOCS)) {
      const rel = path.relative(REPO_ROOT, file);
      codeBlocks(read(file), ["tsx", "ts"]).forEach((code, i) => {
        const sf = parser.createSourceFile(`${rel}.${i}.tsx`, code, { overwrite: true });

        // Components a sample imports from another package (e.g. the react-dom
        // renderer's `TimeGrid`/`MonthList`) share names with native ones but
        // have their own props, so they must not be checked against native types.
        const importedElsewhere = new Set<string>();
        for (const imp of sf.getImportDeclarations()) {
          if (imp.getModuleSpecifierValue() === PACKAGE) {
            for (const named of imp.getNamedImports()) {
              const name = named.getName();
              if (!allExports.has(name)) importViolations.push(`${rel}: import { ${name} }`);
            }
          } else {
            for (const named of imp.getNamedImports()) importedElsewhere.add(named.getName());
          }
        }

        for (const node of sf.getDescendants()) {
          if (!Node.isJsxOpeningElement(node) && !Node.isJsxSelfClosingElement(node)) continue;
          const tag = node.getTagNameNode().getText();
          if (importedElsewhere.has(tag)) continue;
          const props = componentProps.get(tag);
          if (!props) continue;
          for (const attr of node.getAttributes()) {
            if (!Node.isJsxAttribute(attr)) continue; // skip {...spread}
            const attrName = attr.getNameNode().getText();
            if (!props.has(attrName) && !REACT_ATTRIBUTES.has(attrName)) {
              propViolations.push(`${rel}: <${node.getTagNameNode().getText()} ${attrName}>`);
            }
          }
        }
      });
    }

    expect({ importViolations, propViolations }).toEqual({
      importViolations: [],
      propViolations: [],
    });
  });
});
