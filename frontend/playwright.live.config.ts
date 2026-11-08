import { defineConfig } from "@playwright/test";
/** Opt-in real-service acceptance: no request interception, no fixture imports. */
export default defineConfig({
  testDir: "./e2e-live",
  outputDir: "./test-results-live",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: process.env.LIVE_BASE_URL || "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    reducedMotion: "reduce",
  },
});
