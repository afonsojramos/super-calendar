import { existsSync } from "node:fs";
import { chromium, firefox, webkit } from "playwright";

export type BrowserEngine = "chromium" | "firefox" | "webkit";

export function launchBrowser(engine: BrowserEngine = "chromium") {
  const executablePath =
    engine === "chromium"
      ? (process.env.CHROME ??
        [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/usr/bin/google-chrome",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
        ].find(existsSync))
      : undefined;
  return { chromium, firefox, webkit }[engine].launch({ headless: true, executablePath });
}
