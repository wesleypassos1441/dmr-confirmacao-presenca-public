import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(chromePath) ? chromePath : undefined);

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.visual\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    launchOptions: executablePath ? { executablePath } : undefined,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
