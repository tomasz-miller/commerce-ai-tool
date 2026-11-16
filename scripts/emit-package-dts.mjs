#!/usr/bin/env node
// Emits type declarations for a tsup-built package in two module formats:
//   dist/*.d.ts        ESM declarations (package.json "type": "module"), used by `import` / `types`
//   dist/cjs/*.d.ts    CommonJS declarations, used by the `require` condition
// dist/cjs/package.json is `{"type":"commonjs"}`, so TypeScript (node16/nodenext) treats every
// declaration file below it as CommonJS and relative `./x.js` specifiers resolve inside that
// directory instead of crossing into the ESM tree. A copied `.d.cts` that re-exports ESM sibling
// `.d.ts` files misrepresents the bundled `.cjs` (arethetypeswrong: FalseESM / TS1479).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const tscBin = join(process.cwd(), "node_modules", ".bin", "tsc");

const dtsEntries = process.argv.slice(2);

if (dtsEntries.length === 0) {
  console.error("Usage: emit-package-dts.mjs <dist/entry.d.ts> [...]");
  process.exit(1);
}

// tsc keeps the side-effect stylesheet imports of component sources (`import "pkg/x.css";`) in the
// emitted declarations. A stylesheet has no types, and the specifier often names a private
// workspace package (`@commerce-ai-tool/styles`) that is inlined into dist/index.css and never
// published, so consumers with `skipLibCheck: false` get TS2882. The runtime bundles are built by
// tsup and keep the real imports; only the declarations drop them.
const CSS_SIDE_EFFECT_IMPORT = /^import\s+["'][^"'.][^"']*\.css["'];?[ \t]*\r?\n/gm;

function stripCssSideEffectImports(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      stripCssSideEffectImports(abs);
    } else if (entry.name.endsWith(".d.ts")) {
      const original = readFileSync(abs, "utf8");
      const stripped = original.replace(CSS_SIDE_EFFECT_IMPORT, "");
      if (stripped !== original) {
        writeFileSync(abs, stripped);
      }
    }
  }
}

function emit(extraArgs) {
  const tsc = spawnSync(
    tscBin,
    ["-p", "tsconfig.build.json", "--emitDeclarationOnly", ...extraArgs],
    { stdio: "inherit" },
  );
  if (tsc.status !== 0) {
    process.exit(tsc.status ?? 1);
  }
}

emit([]);
emit(["--outDir", "dist/cjs", "--declarationMap", "false"]);

mkdirSync("dist/cjs", { recursive: true });
writeFileSync("dist/cjs/package.json", `${JSON.stringify({ type: "commonjs" })}\n`);
stripCssSideEffectImports("dist");

const nested = JSON.parse(readFileSync("dist/cjs/package.json", "utf8"));
if (Object.keys(nested).length !== 1 || nested.type !== "commonjs") {
  console.error('dist/cjs/package.json must be exactly {"type":"commonjs"}');
  process.exit(1);
}

for (const dtsPath of dtsEntries) {
  const cjsPath = dtsPath.replace(/^dist\//, "dist/cjs/");
  if (!existsSync(dtsPath) || !existsSync(cjsPath)) {
    console.error(`Missing declaration entry: ${dtsPath} or ${cjsPath}`);
    process.exit(1);
  }
}
