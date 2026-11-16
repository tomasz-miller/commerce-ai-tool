import { defineConfig } from "vitest/config";
import { angularJit } from "./vitest.angular-jit";

export default defineConfig({
  plugins: [angularJit()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "jsdom",
    // The JIT plugin inlines `templateUrl` files, which are not part of the module's Vitest
    // cache key, so a cached module could keep a stale template after an edit.
    fsModuleCache: false,
  },
});
