import { defineConfig } from "tsup";

const isWatch = process.argv.includes("--watch");

export default defineConfig({
  entry: ["src/index.ts", "src/next.ts", "src/express.ts"],
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: !isWatch,
  external: ["express", "next/server"],
});
