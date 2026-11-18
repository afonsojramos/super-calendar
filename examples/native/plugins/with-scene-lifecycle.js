// iOS 27 stops an app at launch unless it adopts the scene-based life cycle. Expo
// 57 ships the scene delegate (`ExpoAppSceneDelegate`), but its prebuild template
// still starts React Native from the app delegate. This plugin applies the change
// Expo's SDK 58 template makes: declare a window scene that uses Expo's delegate,
// and let that delegate create the window and start React Native.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const CLASS_LINE = "class AppDelegate: ExpoAppDelegate {";
const PROVIDER_LINE = "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {";
// The exact block the template uses to start React Native. Anything else in its
// place counts as drift, so changed startup code is rejected rather than deleted.
const WINDOW_START = `
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;
const SCENE_NOTE = "    // The scene delegate creates the window and starts React Native.";

function drift() {
  return new Error(
    "with-scene-lifecycle: AppDelegate.swift no longer matches the Expo 57 template; update the plugin.",
  );
}

// Applies each half of the migration on its own, so a file left half-migrated
// is finished rather than skipped. An already migrated file comes back unchanged.
function adoptSceneDelegate(contents) {
  let next = contents;
  if (!next.includes(PROVIDER_LINE)) {
    if (!next.includes(CLASS_LINE)) throw drift();
    next = next.replace(CLASS_LINE, PROVIDER_LINE);
  }
  if (next.includes(WINDOW_START)) return next.replace(WINDOW_START, `\n${SCENE_NOTE}\n`);
  if (!next.includes(SCENE_NOTE)) throw drift();
  return next;
}

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "EXExpoAppSceneDelegate",
          },
        ],
      },
    };
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== "swift") {
      throw new Error("with-scene-lifecycle: expected a Swift AppDelegate.");
    }
    mod.modResults.contents = adoptSceneDelegate(mod.modResults.contents);
    return mod;
  });
};
module.exports.adoptSceneDelegate = adoptSceneDelegate;
