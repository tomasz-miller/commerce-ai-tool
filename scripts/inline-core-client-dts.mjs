#!/usr/bin/env node
// Vendors the browser-safe `@commerce-ai-tool/core/client` declarations into this package, so
// consumers of the published package do not need core's declarations to resolve its types.
// Runs once per declaration format: `dist` (ESM) and `dist/cjs` (CommonJS, see emit-package-dts.mjs).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const pkgDir = process.cwd();
const clientMarker = "@commerce-ai-tool/core/client";
const FROM_SPEC = /(?:from|import)\s+["'](\.[^"']+)["']/g;

function toDtsRel(spec, fromFile, coreDist) {
  const withoutQuery = spec.replace(/\.js$/, ".d.ts");
  return relative(coreDist, resolve(dirname(fromFile), withoutQuery));
}

function collectDeclarationGraph(coreDist, entryRel, seen = new Set()) {
  const normalized = entryRel.replace(/\\/g, "/");
  if (seen.has(normalized)) {
    return seen;
  }
  const abs = join(coreDist, normalized);
  if (!existsSync(abs)) {
    throw new Error(`Missing core declaration: ${abs}`);
  }
  seen.add(normalized);
  const text = readFileSync(abs, "utf8");
  for (const match of text.matchAll(FROM_SPEC)) {
    const spec = match[1];
    if (!spec.startsWith(".")) {
      continue;
    }
    collectDeclarationGraph(coreDist, toDtsRel(spec, abs, coreDist), seen);
  }
  return seen;
}

function listDeclarationFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      // `cjs` is its own declaration tree, vendored separately below.
      if (entry.name === "vendor-core" || (entry.name === "cjs" && dir === join(pkgDir, "dist"))) {
        continue;
      }
      listDeclarationFiles(abs, acc);
      continue;
    }
    if (entry.name.endsWith(".d.ts")) {
      acc.push(abs);
    }
  }
  return acc;
}

function vendorCoreClient(distDir, coreDist) {
  const vendorDir = join(distDir, "vendor-core");
  const graph = collectDeclarationGraph(coreDist, "client.d.ts");
  for (const rel of graph) {
    const dest = join(vendorDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(coreDist, rel), dest);
  }

  const vendorClient = join(vendorDir, "client.js");
  let rewritten = 0;
  for (const abs of listDeclarationFiles(distDir)) {
    const original = readFileSync(abs, "utf8");
    if (!original.includes(clientMarker)) {
      continue;
    }
    const importPath = relative(dirname(abs), vendorClient).replaceAll("\\", "/");
    const spec = importPath.startsWith(".") ? importPath : `./${importPath}`;
    writeFileSync(abs, original.replaceAll(clientMarker, spec));
    rewritten += 1;
  }

  if (rewritten === 0) {
    throw new Error(`No declaration files in ${distDir} referenced ${clientMarker}`);
  }
}

vendorCoreClient(join(pkgDir, "dist"), resolve(pkgDir, "../core/dist"));
vendorCoreClient(join(pkgDir, "dist", "cjs"), resolve(pkgDir, "../core/dist/cjs"));
