import { defineConfig, devices } from "@playwright/test";

const e2ePort = 3001;
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const e2eBaseUrl = externalBaseUrl ?? `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `pnpm --filter demo-next exec next dev --port ${e2ePort}`,
        url: e2eBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
