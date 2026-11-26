# Debug the native calendar on a device

For changes to `MonthPager` or `TimeGrid` paging, first read [the native pager event facts](PAGERS.md). Reproduce touch and layout issues on the affected platform. For an Android-only bug, ask for a connected Android device if one is unavailable.

## Start the native example

1. Open the target device in T3 Code and keep the returned `agent-device` command. On Android, use `adb devices -l` on the device host to identify the selected device's serial. Substitute that serial for `<serial>` in each command below.
2. If you need a fresh Debug app, generate the native project from `examples/native` with Expo prebuild.
   - On Android, run `pnpm exec expo prebuild --platform android`. From the generated `android/` directory, build with `./gradlew :app:assembleDebug` and install with `adb -s <serial> install -r app/build/outputs/apk/debug/app-debug.apk`.
   - On iOS, run `pnpm exec expo prebuild --platform ios`. Build the Debug app with Xcode and install the resulting `.app` on the selected simulator.
3. Start one Metro server from `examples/native` with `pnpm exec expo start --dev-client`. Leave Metro running during the session. If the Android device uses Metro over USB, run `adb -s <serial> reverse tcp:8081 tcp:8081`.
4. Use the returned `agent-device` command to run `open com.example.supercalendar`. Use the same bound command for relaunches, taps, swipes, screenshots, and recordings.

Fast Refresh picks up edits in `examples/native` and `packages/*/src`. For a JS reload or the dev menu, use `r` or `m` in Metro. After switching commits with `git checkout`, restart Metro with `--clear` so the app uses the new bundle. If the app still serves stale code, reinstall the Debug build and reopen it with `agent-device`.

Use `snapshot --force-full` when a polling script needs a complete UI tree on each call. If you get an RPC protocol mismatch, reopen the device in T3 Code to get a fresh command. If the mismatch persists, report the exact error.

## Reproduce the interaction

- Use **Narrow** to resize the calendar and **Keep date** to make the example ignore `onChangeDate` and exercise page-back. Both toggles are available in the development build.
- Reserve `adb` for builds, installs, port forwarding, logs, and the Android diagnostics below. Use `adb -s <serial>` for device-specific commands.
- When the device workflow permits Android display overrides, match the reporter's dimensions and density, for example with `adb -s <serial> shell wm size 720x1600` and `adb -s <serial> shell wm density 300`. Restore the defaults with `adb -s <serial> shell wm size reset` and `adb -s <serial> shell wm density reset`.
- If explicitly requested and the device workflow permits direct input, use `adb -s <serial> shell` to send an `input motionevent` sequence ending in `CANCEL` and reproduce an interrupted drag. Use `agent-device` for ordinary gestures.
- To measure a pager offset, temporarily log its resting `contentOffset.x` and page width in device pixels using `PixelRatio.get()`. Read the values in Metro and remove the log before committing.
- For brief visual glitches, record the screen and run `node scripts/device-frames.mjs <clip.mp4>` from the repo root. The script uses `ffmpeg` to extract frames where the screen changes.
- For a React Native Web comparison, run `pnpm exec expo start --web` from `examples/native`.
