import { defineConfig, devices } from "@playwright/test";

const e2ePort = 4201;
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
        // The widget comes from the linked packages/angular/dist. Angular's persistent build cache
        // (.angular/cache) can keep serving a previous build of it, so every run starts from an
        // empty cache (`ng cache clean`) and its own server: a stale cache or an old server on this
        // port would make the suite test an old widget. Set PLAYWRIGHT_BASE_URL to use your own.
        command: `node_modules/.bin/ng cache clean && node_modules/.bin/ng serve --port ${e2ePort} --proxy-config proxy.e2e.json`,
        url: e2eBaseUrl,
        reuseExistingServer: false,
        timeout: 180_000,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // A synthetic camera for the camera overlay test; other tests never ask for one.
        launchOptions: {
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
  ],
});
