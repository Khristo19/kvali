import { defineConfig } from "@playwright/test";

// Technical demo video only (video/demo.spec.ts); the test suites use playwright.config.ts.
// A real, maximised Chrome window on a 1920x1080 virtual display (Xvfb), drawn at 1.5x (the window is 1280x720 CSS pixels):
// the workflow records that display with ffmpeg, so the video has true 1080p pixels.
const raw = process.env.E2E_BASE_URL || "https://khristo19.github.io/kvali/";
const baseURL = raw.endsWith("/") ? raw : `${raw}/`;

export default defineConfig({
  testDir: "./video",
  outputDir: "video-out/results",
  timeout: 25 * 60_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    baseURL,
    headless: false,
    viewport: null,
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
    video: "off",
    launchOptions: {
      args: ["--kiosk", "--force-device-scale-factor=1.5", "--window-position=0,0", "--window-size=1280,720", "--hide-scrollbars", "--disable-infobars", "--no-first-run"],
    },
  },
});
