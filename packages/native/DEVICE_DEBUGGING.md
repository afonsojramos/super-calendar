# Debug the native calendar on a device

For changes to `MonthPager` or `TimeGrid` paging, first read [the native pager event facts](PAGERS.md). Reproduce touch and layout issues on the affected platform. For an Android-only bug, ask for a connected Android device if one is unavailable.

## Start the native example

From `examples/native`, run `pnpm exec expo run:android` or `pnpm exec expo run:ios`. Expo builds and installs the Debug app, starts Metro, and opens the app.

If your environment provides a device automation CLI such as `agent-device`, use the separate build and install steps below so you can launch the app with that CLI. Use the same CLI for relaunches, taps, swipes, screenshots, and recordings. With `agent-device`, use `open com.example.supercalendar` to launch the example and `snapshot --force-full` when a polling script needs the full UI tree on each call.

On Android, run `adb devices -l` on the device host to find the target device's serial. Substitute it for `<serial>` in the commands below.

To build and install the Debug app separately, follow these steps.

1. Generate the native project from `examples/native` with Expo prebuild, then build and install the app.
   - On Android, run `pnpm exec expo prebuild --platform android`. From the generated `android/` directory, build with `./gradlew :app:assembleDebug` and install with `adb -s <serial> install -r app/build/outputs/apk/debug/app-debug.apk`.
   - On iOS, run `pnpm exec expo prebuild --platform ios`. Build the Debug app with Xcode and install the resulting `.app` on the selected simulator.
2. Start one Metro server from `examples/native` with `pnpm exec expo start --dev-client`. Leave it running during the session.
3. If the Android device connects to Metro over USB, run `adb -s <serial> reverse tcp:8081 tcp:<metro-port>`. Keep device port `8081` for the default Debug build. Replace `<metro-port>` with the host port Expo prints, such as `8081`.
4. Open the example on the selected device.

Fast Refresh picks up edits in `examples/native` and `packages/*/src`. For a JS reload or the dev menu, use `r` or `m` in Metro. After switching commits with `git checkout`, restart Metro with `--clear` so the app uses the new bundle. If the app still serves stale code, reinstall the Debug build and reopen it.

## Reproduce the interaction

- Use **Narrow** to resize the calendar and **Keep date** to make the example ignore `onChangeDate` and exercise page-back. Both toggles are available in the development build.
- When the device workflow permits Android display overrides, match the reporter's dimensions and density, for example with `adb -s <serial> shell wm size 720x1600` and `adb -s <serial> shell wm density 300`. Restore the defaults with `adb -s <serial> shell wm size reset` and `adb -s <serial> shell wm density reset`.
- If your device workflow permits direct input, use `adb -s <serial> shell` to send an `input motionevent` sequence ending in `CANCEL` to reproduce an interrupted drag.
- To measure a pager offset, temporarily log its resting `contentOffset.x` and page width in device pixels using `PixelRatio.get()`. Read the values in Metro and remove the log before committing.
- For brief visual glitches, record the screen and run `node scripts/device-frames.mjs <clip.mp4>` from the repo root. The script uses `ffmpeg` to extract frames where the screen changes.
- For a React Native Web comparison, run `pnpm exec expo start --web` from `examples/native`.
