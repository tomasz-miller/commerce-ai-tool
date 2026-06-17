import { defineConfig } from "tsup";

const isWatch = process.argv.includes("--watch");

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: !isWatch,
  external: ["@angular/core", "@angular/common", "@angular/forms", "rxjs"],
});
