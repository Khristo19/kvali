import { defineConfig, devices } from "@playwright/test";

// Always end with "/" so relative paths like "farmer" resolve under /kvali/ (see tests/helpers.ts `go`).
const raw = process.env.E2E_BASE_URL || "https://khristo19.github.io/kvali/";
const baseURL = raw.endsWith("/") ? raw : `${raw}/`;

export default defineConfig({
  testDir: "./tests",
  timeout: 10 * 60_000,
  expect: { timeout: 30_000 },
  retries: 1,
  // Journey and refusal use the shared public devnet: keep chain load low (one worker, files run in order).
  // nav.spec.ts only reads, but it shares the same single worker here; the workflow runs it as a separate parallel job.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "report-json/results.json" }],
    ...(process.env.GITHUB_ACTIONS ? ([["github"]] as const) : []),
  ],
  use: {
    baseURL,
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "mobile",
      // Phone width only for the nav/layout spec.
      testMatch: /nav\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
});
