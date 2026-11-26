import path from "node:path";
import { Node, Project, type SourceFile } from "ts-morph";

const repoRoot = path.resolve(import.meta.dirname, "../..");

function rendererSources(source: string): SourceFile[] {
  const project = new Project();
  const files = project.addSourceFilesAtPaths(path.join(repoRoot, source, "**/*.{ts,tsx}"));
  expect(files.length).toBeGreaterThan(0);
  return files;
}

function eventPropLocations(
  files: readonly SourceFile[],
  prop: string,
  matchesTag: (tag: Node) => boolean,
): string[] {
  const locations: string[] = [];
  for (const file of files) {
    file.forEachDescendant((node) => {
      if (!Node.isJsxOpeningElement(node) && !Node.isJsxSelfClosingElement(node)) return;
      const attribute = node.getAttribute(prop);
      if (attribute && matchesTag(node.getTagNameNode())) {
        locations.push(
          `${path.relative(repoRoot, file.getFilePath())}:${attribute.getStartLineNumber()}`,
        );
      }
    });
  }
  return locations.sort();
}

function isLegendListExport(module: string, name: string): boolean {
  return (
    (module === "@legendapp/list" || module.startsWith("@legendapp/list/")) &&
    (name === "LegendList" || name === "AnimatedLegendList")
  );
}

function isLegendList(node: Node | undefined, seen = new Set<Node>()): boolean {
  if (!node || seen.has(node)) return false;
  seen.add(node);

  if (Node.isPropertyAccessExpression(node)) {
    const declarations = node.getExpression().getSymbol()?.getDeclarations() ?? [];
    return declarations.some((declaration) => {
      if (!Node.isNamespaceImport(declaration)) return false;
      const imported = declaration.getParent().getParent();
      return (
        Node.isImportDeclaration(imported) &&
        isLegendListExport(imported.getModuleSpecifierValue(), node.getName())
      );
    });
  }

  if (Node.isCallExpression(node)) {
    const factory = node.getExpression();
    return (
      Node.isPropertyAccessExpression(factory) &&
      factory.getName() === "createAnimatedComponent" &&
      isLegendList(node.getArguments()[0], seen)
    );
  }

  if (
    Node.isParenthesizedExpression(node) ||
    Node.isAsExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isExpressionWithTypeArguments(node)
  ) {
    return isLegendList(node.getExpression(), seen);
  }

  if (!Node.isIdentifier(node)) return false;
  const declarations = node.getSymbol()?.getDeclarations() ?? [];
  return declarations.some((declaration) => {
    if (Node.isImportSpecifier(declaration)) {
      return isLegendListExport(
        declaration.getImportDeclaration().getModuleSpecifierValue(),
        declaration.getName(),
      );
    }
    return (
      Node.isVariableDeclaration(declaration) && isLegendList(declaration.getInitializer(), seen)
    );
  });
}

it("keeps delegated onClick off Solid div and span elements for iOS Safari", () => {
  expect(
    eventPropLocations(rendererSources("packages/solid/src"), "onClick", (tag) =>
      ["div", "span"].includes(tag.getText()),
    ),
  ).toEqual([]);
});

it("keeps scrollEventThrottle off native LegendList components per PAGERS.md", () => {
  expect(
    eventPropLocations(rendererSources("packages/native/src"), "scrollEventThrottle", isLegendList),
  ).toEqual([]);
});

it("flags scrollEventThrottle on an aliased LegendList import", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    path.join(repoRoot, "legend-list.tsx"),
    `import { LegendList as CalendarList } from "@legendapp/list";
<CalendarList scrollEventThrottle={16} />;
<CalendarList />;`,
  );

  expect(eventPropLocations([file], "scrollEventThrottle", isLegendList)).toEqual([
    "legend-list.tsx:2",
  ]);
});

it("follows namespace imports and local Animated wrappers", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile(
    path.join(repoRoot, "legend-list.tsx"),
    `import * as Lists from "@legendapp/list/react-native";
import { AnimatedLegendList as AnimatedList } from "@legendapp/list/reanimated";
import Animated from "react-native-reanimated";
import { LegendList } from "another-package";
const LocalList = Lists.LegendList;
const WrappedList = Animated.createAnimatedComponent(LocalList) as typeof LocalList;
const CalendarList = WrappedList;
<Lists.LegendList scrollEventThrottle={16} />;
<AnimatedList scrollEventThrottle={16} />;
<CalendarList scrollEventThrottle={16}></CalendarList>;
<CalendarList />;
<LegendList scrollEventThrottle={16} />;`,
  );

  expect(eventPropLocations([file], "scrollEventThrottle", isLegendList)).toEqual([
    "legend-list.tsx:10",
    "legend-list.tsx:8",
    "legend-list.tsx:9",
  ]);
});
