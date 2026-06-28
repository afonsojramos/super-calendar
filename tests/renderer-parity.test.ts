import path from "node:path";
import { Node, Project } from "ts-morph";

// Cross-renderer API parity guard. The dom and native renderers share the same
// model, so a prop the dom renderer exposes for a shared component must either be
// a deliberately platform-specific prop (allowlisted below) or carry the SAME
// NAME as the native renderer's prop for that component. This fails the build if
// the two surfaces drift apart again (a rename on one side, or a new dom prop
// added without a native counterpart and without being marked platform-only).
//
// Direction: dom ⊆ native ∪ platform. Native is the established reference and may
// carry extra props (Agenda/MonthPager/schedule, RN-only styling) that dom does
// not; that asymmetry is expected and not enforced here.

const REPO_ROOT = path.resolve(__dirname, "..");
const DOM_INDEX = path.join(REPO_ROOT, "packages", "dom", "src", "index.ts");
const NATIVE_INDEX = path.join(REPO_ROOT, "packages", "native", "src", "index.tsx");

// The shared components, by their exported `*Props` type.
const SHARED_COMPONENTS = ["MonthView", "MonthList", "TimeGrid"] as const;

// Props that exist only on the dom renderer because they are web-platform
// concerns with no native equivalent. Anything here is exempt from the
// "must also exist on native" rule. Keep this list small and justified; a new
// entry is a conscious statement that a prop is web-only.
const DOM_PLATFORM_PROPS: Record<string, Set<string>> = {
  // DOM elements take className/style; the box scrolls inside an explicit height;
  // the dom theme is a flat object (vs native's context-provided CalendarTheme).
  TimeGrid: new Set(["className", "style", "height", "theme", "zoomable"]),
  // showTitle/showWeekdays toggle dom-only chrome; theme/className/style as above.
  MonthView: new Set(["className", "style", "theme", "showTitle", "showWeekdays"]),
  // pastMonths/futureMonths size the dom scroll window (native virtualizes by date).
  MonthList: new Set(["className", "style", "height", "theme", "pastMonths", "futureMonths"]),
};

function componentProps(indexPath: string): Map<string, Set<string>> {
  const project = new Project({
    tsConfigFilePath: path.join(REPO_ROOT, "tsconfig.json"),
    skipAddingFilesFromTsConfig: false,
  });
  const exports = project.getSourceFileOrThrow(indexPath).getExportedDeclarations();
  const byComponent = new Map<string, Set<string>>();
  for (const [name, decls] of exports) {
    if (!name.endsWith("Props")) continue;
    const props = new Set<string>();
    for (const decl of decls) {
      if (Node.isTypeAliasDeclaration(decl) || Node.isInterfaceDeclaration(decl)) {
        for (const p of decl.getType().getProperties()) props.add(p.getName());
      }
    }
    if (props.size) byComponent.set(name.slice(0, -"Props".length), props);
  }
  return byComponent;
}

describe("dom and native renderer API parity", () => {
  const dom = componentProps(DOM_INDEX);
  const native = componentProps(NATIVE_INDEX);

  it.each(SHARED_COMPONENTS)(
    "every %s prop on dom is platform-only or matches a native prop name",
    (component) => {
      const domProps = dom.get(component);
      const nativeProps = native.get(component);
      expect(domProps).toBeDefined();
      expect(nativeProps).toBeDefined();

      const platform = DOM_PLATFORM_PROPS[component] ?? new Set<string>();
      const drifted = [...(domProps ?? [])]
        .filter((prop) => !platform.has(prop))
        .filter((prop) => !nativeProps?.has(prop));

      // Each name here is a dom prop with no same-named native counterpart that
      // also isn't marked platform-only: either align the names across renderers,
      // or add it to DOM_PLATFORM_PROPS with a reason.
      expect(drifted).toEqual([]);
    },
  );

  it("keeps the platform allowlist honest (no stale entries)", () => {
    // A platform allowlist entry that isn't actually a dom prop anymore is dead
    // config; remove it so the list keeps meaning what it says.
    const stale: string[] = [];
    for (const component of SHARED_COMPONENTS) {
      const domProps = dom.get(component) ?? new Set<string>();
      for (const prop of DOM_PLATFORM_PROPS[component] ?? []) {
        if (!domProps.has(prop)) stale.push(`${component}.${prop}`);
      }
    }
    expect(stale).toEqual([]);
  });
});
