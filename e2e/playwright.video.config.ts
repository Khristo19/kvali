import { defineConfig, devices } from "@playwright/test";

// Technical demo video only (video/demo.spec.ts); the test suites use playwright.config.ts.
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
    ...devices["Desktop Chrome"],
    baseURL,
    viewport: { width: 1024, height: 576 },
    deviceScaleFactor: 1,
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
    video: { mode: "on", size: { width: 1024, height: 576 } },
  },
});
