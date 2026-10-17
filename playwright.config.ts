import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests for the simulator UI. Playwright starts the dev server itself and drives a real
 * browser against it, so the tests exercise the same path a judge would: UI -> /api/chat -> MCP.
 */
export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
