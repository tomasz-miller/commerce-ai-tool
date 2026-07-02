import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    environmentMatchGlobs: [["packages/react/**", "jsdom"]],
    setupFiles: ["packages/react/vitest.setup.ts"],
  },
});
