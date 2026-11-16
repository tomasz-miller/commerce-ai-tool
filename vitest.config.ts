import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["evals/**/*.test.ts", "scripts/*.test.ts"],
    environment: "node",
  },
});
