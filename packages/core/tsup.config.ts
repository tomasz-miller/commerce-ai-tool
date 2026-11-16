import { defineConfig } from "tsup";

const isWatch = process.argv.includes("--watch");

export default defineConfig({
  entry: ["src/index.ts", "src/client.ts", "src/internal.ts"],
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: !isWatch,
  splitting: true,
});
