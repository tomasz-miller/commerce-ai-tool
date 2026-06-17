import { defineConfig } from "tsup";

const isWatch = process.argv.includes("--watch");

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: !isWatch,
  external: ["react", "react-dom", "react/jsx-runtime"],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    };
  },
});
