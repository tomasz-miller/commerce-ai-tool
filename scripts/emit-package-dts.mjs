#!/usr/bin/env node
import { copyFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const tscBin = join(process.cwd(), "node_modules", ".bin", "tsc");

const dtsEntries = process.argv.slice(2);

if (dtsEntries.length === 0) {
  console.error("Usage: emit-package-dts.mjs <dist/entry.d.ts> [...]");
  process.exit(1);
}

const tsc = spawnSync(tscBin, ["-p", "tsconfig.build.json", "--emitDeclarationOnly"], {
  stdio: "inherit",
});

if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

for (const dtsPath of dtsEntries) {
  copyFileSync(dtsPath, dtsPath.replace(/\.d\.ts$/, ".d.cts"));
}
