import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  webServer: {
    command: "node tests/serve-harness.mjs",
    url: "http://localhost:3333",
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:3333",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
    {
      name: "msedge",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
      },
    },
  ],
});
