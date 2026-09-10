#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const pkgDir = process.cwd();
const distDir = join(pkgDir, "dist");
const coreDist = resolve(pkgDir, "../core/dist");
const vendorDir = join(distDir, "vendor-core");
const clientMarker = "@commerce-ai-tool/core/client";
const FROM_SPEC = /(?:from|import)\s+["'](\.[^"']+)["']/g;

function toDtsRel(spec, fromFile) {
  const withoutQuery = spec.replace(/\.js$/, ".d.ts");
  return relative(coreDist, resolve(dirname(fromFile), withoutQuery));
}

function collectDeclarationGraph(entryRel, seen = new Set()) {
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
    collectDeclarationGraph(toDtsRel(spec, abs), seen);
  }
  return seen;
}

function copyDeclaration(rel) {
  const src = join(coreDist, rel);
  const dest = join(vendorDir, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest);
  const ctsRel = rel.replace(/\.d\.ts$/, ".d.cts");
  const ctsSrc = join(coreDist, ctsRel);
  if (existsSync(ctsSrc)) {
    cpSync(ctsSrc, join(vendorDir, ctsRel));
  }
}

function listDeclarationFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor-core") {
        continue;
      }
      listDeclarationFiles(abs, acc);
      continue;
    }
    if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.cts")) {
      acc.push(abs);
    }
  }
  return acc;
}

const graph = collectDeclarationGraph("client.d.ts");
for (const rel of graph) {
  copyDeclaration(rel);
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
  throw new Error("No declaration files referenced @commerce-ai-tool/core/client");
}
