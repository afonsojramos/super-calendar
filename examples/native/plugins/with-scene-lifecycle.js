// iOS 27 stops an app at launch unless it adopts the scene-based life cycle. Expo
// 57 ships the scene delegate (`ExpoAppSceneDelegate`), but its prebuild template
// still starts React Native from the app delegate. This plugin applies the change
// Expo's SDK 58 template makes: declare a window scene that uses Expo's delegate,
// and let that delegate create the window and start React Native.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

const PROVIDER = "ExpoReactNativeFactoryProvider";
const CLASS_LINE = "class AppDelegate: ExpoAppDelegate {";
const WINDOW_START =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n {4}window = UIWindow\(frame: UIScreen\.main\.bounds\)\n {4}factory\.startReactNative\([\s\S]*?\n#endif\n/;

function adoptSceneDelegate(contents) {
  if (contents.includes(`ExpoAppDelegate, ${PROVIDER}`)) return contents;
  if (!contents.includes(CLASS_LINE) || !WINDOW_START.test(contents)) {
    throw new Error(
      "with-scene-lifecycle: AppDelegate.swift no longer matches the Expo 57 template; update the plugin.",
    );
  }
  return contents
    .replace(CLASS_LINE, `class AppDelegate: ExpoAppDelegate, ${PROVIDER} {`)
    .replace(
      WINDOW_START,
      "\n    // The scene delegate creates the window and starts React Native.\n",
    );
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
