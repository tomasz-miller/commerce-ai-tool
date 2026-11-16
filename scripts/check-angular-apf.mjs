#!/usr/bin/env node
// Asserts that the built @commerce-ai-tool/angular package is a real Angular
// Package Format (APF) library compiled in partial mode: the bundle carries
// partial declarations (not raw decorators) and the typings carry the Ivy
// declarations the consuming application's compiler reads.
// Usage: node scripts/check-angular-apf.mjs [packageDir]
// The default is packages/angular, resolved from this script's location, so the check works
// from the repository root as well as from the package directory (the build script).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultPkgDir = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "angular");
const pkgDir = resolve(process.argv[2] ?? defaultPkgDir);
const distDir = join(pkgDir, "dist");
const failures = [];

function fail(message) {
  failures.push(message);
}

function walk(dir, predicate, acc = []) {
  if (!existsSync(dir)) {
    return acc;
  }
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      walk(abs, predicate, acc);
    } else if (predicate(abs)) {
      acc.push(abs);
    }
  }
  return acc;
}

const read = (file) => readFileSync(file, "utf8");

// 1. Bundles: partial declarations, no raw decorators.
const bundles = walk(join(distDir, "fesm2022"), (f) => f.endsWith(".mjs"));
if (bundles.length === 0) {
  fail(`no dist/fesm2022/*.mjs bundle in ${distDir} (build with ng-packagr first)`);
}
const bundleText = bundles.map(read).join("\n");
for (const marker of ["ɵɵngDeclareComponent", "ɵɵngDeclareFactory", "ɵɵngDeclareInjectable"]) {
  if (!bundleText.includes(marker)) {
    fail(`fesm2022 bundle has no ${marker}: output is not partial-compiled`);
  }
}
if (/\b__decorate\(|_ts_decorate\d*\(/.test(bundleText) || /^\s*Component\(\{/m.test(bundleText)) {
  fail("fesm2022 bundle contains raw TypeScript decorators (JIT-only output)");
}

// 2. Typings: Ivy declarations that the consumer compiler recognises.
const dts = walk(distDir, (f) => f.endsWith(".d.ts"));
const dtsText = dts.map(read).join("\n");
for (const marker of ["ɵɵComponentDeclaration", "ɵɵFactoryDeclaration", "ɵɵInjectableDeclaration"]) {
  if (!dtsText.includes(marker)) {
    fail(`typings have no ${marker}: consumers cannot AOT-compile the components`);
  }
}

// 3. Input types: `messages` takes the *partial* CommerceAISearchMessages while the class
// field holds the resolved type, so strict templates in hosts must see the accepted type.
for (const name of ["CommerceAiCartPanelComponent", "CommerceAiMissionResultsComponent"]) {
  const file = dts.find((f) => new RegExp(`class ${name}\\b`).test(read(f)));
  if (!file) {
    fail(`no declaration for ${name}`);
    continue;
  }
  const text = read(file);
  if (!/static ngAcceptInputType_messages:\s*(?:i\d+\.)?CommerceAISearchMessages\b/.test(text)) {
    fail(`${name}: typings lack "static ngAcceptInputType_messages: CommerceAISearchMessages"`);
  }
  if (!/"messages":\s*\{\s*"alias":\s*"messages";\s*"required":\s*true;?\s*\}/.test(text)) {
    fail(`${name}: typings do not declare "messages" as a required input`);
  }
}

// 3b. Inherited inputs: the search component's inputs live on its abstract base class, so the
// base's directive declaration must list them or hosts cannot bind them.
{
  const file = dts.find((f) => /class CommerceAiSearchCompat\b/.test(read(f)));
  const declaration = file
    ? read(file).match(/ɵɵDirectiveDeclaration<(?:\w+\.)?CommerceAiSearchCompat\b[^\n]*/)?.[0]
    : undefined;
  if (!declaration) {
    fail("no ɵɵDirectiveDeclaration for CommerceAiSearchCompat (the search component's inherited inputs)");
  } else {
    for (const input of ["enableCart", "enableMissions", "messages"]) {
      if (!new RegExp(`"${input}":\\s*\\{\\s*"alias":\\s*"${input}"`).test(declaration)) {
        fail(`CommerceAiSearchCompat's directive declaration does not list the input "${input}"`);
      }
    }
  }
}

// 4. Package manifest: every export target must exist in dist. (A `workspace:` range in
// dist/package.json is expected here: `pnpm pack`/`pnpm publish` replace it, which
// scripts/check-angular-consumer.mjs verifies on the packed tarball.)
const manifestPath = join(distDir, "package.json");
if (!existsSync(manifestPath)) {
  fail("dist/package.json is missing");
} else {
  const manifest = JSON.parse(read(manifestPath));
  const targets = [];
  const collect = (value) => {
    if (typeof value === "string") {
      targets.push(value);
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(collect);
    }
  };
  collect(manifest.exports);
  if (!manifest.exports?.["./styles.css"]) {
    fail('dist/package.json has no "./styles.css" export');
  }
  for (const target of targets) {
    if (!existsSync(join(distDir, target))) {
      fail(`export target ${target} does not exist in dist`);
    }
  }
}

if (failures.length > 0) {
  console.error("Angular Package Format check FAILED:");
  for (const message of failures) {
    console.error(`  - ${message}`);
  }
  process.exit(1);
}
console.log(`Angular Package Format check passed (${bundles.length} bundle(s), ${dts.length} declaration file(s)).`);
