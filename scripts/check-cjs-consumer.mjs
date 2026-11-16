#!/usr/bin/env node
// Type-checks the *packed* core, server and react tarballs the way a TypeScript consumer on
// `moduleResolution: node16` sees them: a `.cts` file (CommonJS, `require` condition) and an `.mts`
// file (ESM, `import` condition) import every subpath of each package's `exports` map, with
// `skipLibCheck: false` so errors inside the published declaration files are reported.
//
// arethetypeswrong cannot see this class of defect (a CommonJS declaration file importing ESM
// declaration files, or a declaration referencing something that is not published). A `require()`
// smoke of each entry covers the runtime side.
//
// Usage: node scripts/check-cjs-consumer.mjs [--keep]
//   Run `pnpm build` first. Errors from third-party declaration files are not ours to fix and are
//   only counted; every error in the consumer files or in a @commerce-ai-tool package fails the check.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const keep = process.argv.includes("--keep");
const PACKAGES = ["core", "server", "react"];

const run = (cmd, cmdArgs, options = {}) => {
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  return execFileSync(cmd, cmdArgs, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...options });
};

const hasTypes = (condition) =>
  typeof condition === "object" && condition !== null && ("types" in condition || Object.values(condition).some(hasTypes));

/** Import specifiers for every subpath of `exports` that ships declarations. */
function entrySpecifiers(manifest) {
  return Object.entries(manifest.exports ?? {})
    .filter(([key, condition]) => key.startsWith(".") && hasTypes(condition))
    .map(([key]) => manifest.name + key.slice(1));
}

const work = mkdtempSync(join(tmpdir(), "cjs-consumer-"));
const tarballs = join(work, "tarballs");
const app = join(work, "app");
mkdirSync(tarballs);
mkdirSync(app);

try {
  // 1. Pack. pnpm replaces `workspace:*` with concrete ranges.
  const packed = {};
  const specifiers = [];
  for (const key of PACKAGES) {
    const name = `@commerce-ai-tool/${key}`;
    run("pnpm", ["--filter", name, "pack", "--pack-destination", tarballs], { cwd: repoRoot });
    packed[key] = readdirSync(tarballs).find((f) => f.startsWith(`commerce-ai-tool-${key}-`) && f.endsWith(".tgz"));
    if (!packed[key]) {
      throw new Error(`pnpm pack produced no tarball for ${name}`);
    }
    const manifest = JSON.parse(
      execFileSync("tar", ["-xzOf", join(tarballs, packed[key]), "package/package.json"], { encoding: "utf8" }),
    );
    if (JSON.stringify(manifest).includes("workspace:")) {
      throw new Error(`packed ${name} manifest still contains a workspace: protocol range`);
    }
    specifiers.push(...entrySpecifiers(manifest));
  }
  console.log(`checking ${specifiers.length} entries: ${specifiers.join(", ")}`);

  // 2. Scratch project with the tarballs and the @types a host would have installed.
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "cjs-consumer", private: true, version: "1.0.0" }));
  run(
    "npm",
    [
      "install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock",
      ...PACKAGES.map((key) => join(tarballs, packed[key])),
      "react@19", "react-dom@19", "express@5",
      "@types/node@24", "@types/react@19", "@types/react-dom@19", "@types/express@5",
    ],
    { cwd: app, stdio: ["ignore", "inherit", "inherit"] },
  );

  // 3. One CommonJS and one ESM consumer file that import every entry.
  const cts = specifiers.map((spec, i) => `import m${i} = require(${JSON.stringify(spec)});\nexport type T${i} = typeof m${i};`);
  const mts = specifiers.map((spec, i) => `import * as m${i} from ${JSON.stringify(spec)};\nexport type T${i} = typeof m${i};`);
  writeFileSync(join(app, "consumer.cts"), `${cts.join("\n")}\n`);
  writeFileSync(join(app, "consumer.mts"), `${mts.join("\n")}\n`);

  // 4. Type-check as a node16 consumer with skipLibCheck off.
  const tsc = join(repoRoot, "node_modules/.bin/tsc");
  if (!existsSync(tsc)) {
    throw new Error(`${tsc} not found: run pnpm install`);
  }
  const tscArgs = [
    "--noEmit", "--module", "node16", "--moduleResolution", "node16", "--strict",
    "--skipLibCheck", "false", "--types", "node", "--jsx", "react-jsx", "--pretty", "false",
    "consumer.cts", "consumer.mts",
  ];
  console.log(`$ tsc ${tscArgs.join(" ")}`);
  const result = spawnSync(tsc, tscArgs, { cwd: app, encoding: "utf8" });
  const diagnostics = `${result.stdout}${result.stderr}`.split("\n").filter((line) => /error TS\d+/.test(line));
  const ours = diagnostics.filter((line) => line.startsWith("consumer.") || line.includes("node_modules/@commerce-ai-tool/"));
  const thirdParty = diagnostics.length - ours.length;
  if (thirdParty > 0) {
    console.log(`note: ${thirdParty} error(s) in third-party declaration files ignored`);
  }
  if (ours.length > 0) {
    console.error(ours.join("\n"));
    throw new Error(`${ours.length} type error(s) in the consumer files or the packed @commerce-ai-tool declarations`);
  }
  if (result.status !== 0 && diagnostics.length === 0) {
    throw new Error(`tsc failed without diagnostics:\n${result.stdout}${result.stderr}`);
  }
  console.log(`OK: ${specifiers.length} entries type-check from CommonJS (.cts) and ESM (.mts) with skipLibCheck off`);

  // 5. Runtime: every entry loads through require().
  const smoke = `for (const s of ${JSON.stringify(specifiers)}) { const m = require(s); if (Object.keys(m).length === 0) throw new Error(s + " exports nothing"); }`;
  run("node", ["-e", smoke], { cwd: app });
  console.log("OK: every entry loads through require()");
} finally {
  if (keep) {
    console.log(`kept ${work}`);
  } else {
    rmSync(work, { recursive: true, force: true });
  }
}
