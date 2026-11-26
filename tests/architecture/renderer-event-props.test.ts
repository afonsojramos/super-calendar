import path from "node:path";
import { Node, Project } from "ts-morph";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function eventPropLocations(source: string, tags: readonly string[], prop: string): string[] {
  const project = new Project();
  const files = project.addSourceFilesAtPaths(path.join(repoRoot, source, "**/*.{ts,tsx}"));
  expect(files.length).toBeGreaterThan(0);

  const locations: string[] = [];
  for (const file of files) {
    file.forEachDescendant((node) => {
      if (!Node.isJsxOpeningElement(node) && !Node.isJsxSelfClosingElement(node)) return;
      if (!tags.includes(node.getTagNameNode().getText())) return;
      const attribute = node.getAttribute(prop);
      if (attribute) {
        locations.push(
          `${path.relative(repoRoot, file.getFilePath())}:${attribute.getStartLineNumber()}`,
        );
      }
    });
  }
  return locations.sort();
}

it("keeps delegated onClick off Solid div and span elements for iOS Safari", () => {
  expect(eventPropLocations("packages/solid/src", ["div", "span"], "onClick")).toEqual([]);
});

it("keeps scrollEventThrottle off native LegendList components per PAGERS.md", () => {
  expect(
    eventPropLocations(
      "packages/native/src",
      ["LegendList", "AnimatedLegendList"],
      "scrollEventThrottle",
    ),
  ).toEqual([]);
});
