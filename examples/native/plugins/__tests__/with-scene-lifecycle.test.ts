import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { adoptSceneDelegate } = require("../with-scene-lifecycle.js") as {
  adoptSceneDelegate: (contents: string) => string;
};

// The didFinishLaunching part of the AppDelegate Expo 57's prebuild generates.
const template = `@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    reactNativeFactory = factory

#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

const migrated = `@main
class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {
  var window: UIWindow?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    reactNativeFactory = factory

    // The scene delegate creates the window and starts React Native.

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
`;

describe("with-scene-lifecycle", () => {
  it("hands window creation to the scene delegate", () => {
    expect(adoptSceneDelegate(template)).toBe(migrated);
  });

  it("leaves a migrated AppDelegate unchanged", () => {
    expect(adoptSceneDelegate(migrated)).toBe(migrated);
  });

  it("finishes a half-migrated AppDelegate", () => {
    const providerOnly = template.replace(
      "class AppDelegate: ExpoAppDelegate {",
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    );
    expect(adoptSceneDelegate(providerOnly)).toBe(migrated);
    const windowOnly = migrated.replace(
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
      "class AppDelegate: ExpoAppDelegate {",
    );
    expect(adoptSceneDelegate(windowOnly)).toBe(migrated);
  });

  it("fails when the template no longer matches", () => {
    expect(() =>
      adoptSceneDelegate(template.replace("#if os(iOS) || os(tvOS)", "#if os(iOS)")),
    ).toThrow(/no longer matches/);
    expect(() =>
      adoptSceneDelegate(template.replace(": ExpoAppDelegate {", ": AppDelegateBase {")),
    ).toThrow(/no longer matches/);
  });
});
