import { defineConfig } from "tsup";

const isWatch = process.argv.includes("--watch");

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: !isWatch,
  external: ["react", "react-dom", "react/jsx-runtime"],
  noExternal: [/^@commerce-ai-tool\/core/],
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    };
  },
});
