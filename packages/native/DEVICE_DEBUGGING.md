# Debug the native calendar on a device

For changes to `MonthPager` or `TimeGrid` paging, first read [the native pager event facts](PAGERS.md). Reproduce touch and layout issues on the affected platform. For an Android-only bug, ask for a connected Android device if one is unavailable.

## Start the native example

1. If you need a fresh Debug app, generate the native project from `examples/native` with Expo prebuild.
   - On Android, run `pnpm exec expo prebuild --platform android`. Run `./gradlew :app:installDebug` from the generated `android/` directory.
   - On iOS, run `pnpm exec expo prebuild --platform ios`. Build the Debug app with Xcode and install the resulting `.app` on the simulator.
2. Start one Metro server from `examples/native` with `pnpm exec expo start --dev-client`. Leave Metro running during the session. For an Android device that uses Metro over USB, forward the Metro port with `adb reverse tcp:8081 tcp:8081`.
3. In T3 Code, open the target device and use the returned `agent-device` command to run `open com.example.supercalendar`. Use the same bound command for relaunches, taps, swipes, screenshots, and recordings.

Fast Refresh picks up edits in `examples/native` and `packages/*/src`. For a JS reload or the dev menu, use `r` or `m` in Metro. After switching commits with `git checkout`, restart Metro with `--clear` so the app uses the new bundle. If the app still serves stale code, reinstall the Debug build and reopen it with `agent-device`.

Use `snapshot --force-full` when a polling script needs a complete UI tree on each call. If an RPC protocol mismatch reports a stale `agent-device` daemon, follow the error's restart instructions for your own session, then reopen the device to get a fresh command.

## Reproduce the interaction

- Use **Narrow** to resize the calendar and **Keep date** to make the example ignore `onChangeDate` and exercise page-back. Both toggles are available in the development build.
- Reserve `adb` for builds, installs, port forwarding, logs, and the Android diagnostics below.
- When the device workflow permits Android display overrides, match the reporter's dimensions and density, for example with `adb shell wm size 720x1600` and `adb shell wm density 300`. Restore the defaults with `adb shell wm size reset` and `adb shell wm density reset`.
- If explicitly requested and the device workflow permits direct input, use a raw `adb shell` `input motionevent` sequence ending in `CANCEL` to reproduce an interrupted drag. Use `agent-device` for ordinary gestures.
- To measure a pager offset, temporarily log its resting `contentOffset.x` and page width in device pixels using `PixelRatio.get()`. Read the values in Metro and remove the log before committing.
- For brief visual glitches, record the screen and run `node scripts/device-frames.mjs <clip.mp4>` from the repo root. The script uses `ffmpeg` to extract frames where the screen changes.
- For a React Native Web comparison, run `pnpm exec expo start --web` from `examples/native`.
