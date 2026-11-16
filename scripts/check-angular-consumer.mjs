#!/usr/bin/env node
// Builds a fresh standalone Angular app (scripts/fixtures/angular-consumer) against the
// *packed* @commerce-ai-tool/angular and @commerce-ai-tool/core tarballs, the way a host
// installs them from npm: AOT, strict templates, no workspace links, no tsconfig paths.
//
// Usage: node scripts/check-angular-consumer.mjs [--angular 20.3|21.2] [--keep]
//   Run `pnpm exec turbo run build --filter=@commerce-ai-tool/angular` first.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(repoRoot, "scripts/fixtures/angular-consumer");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const angularMinor = flag("--angular") ?? "21.2";
if (!/^\d+\.\d+$/.test(angularMinor)) {
  throw new Error(`--angular expects a major.minor line such as 21.2, got "${angularMinor}"`);
}
const keep = args.includes("--keep");

const run = (cmd, cmdArgs, options = {}) => {
  console.log(`$ ${cmd} ${cmdArgs.join(" ")}`);
  return execFileSync(cmd, cmdArgs, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", ...options });
};

const work = mkdtempSync(join(tmpdir(), "angular-consumer-"));
const tarballs = join(work, "tarballs");
const app = join(work, "app");
mkdirSync(tarballs);

try {
  // 1. Pack both libraries. pnpm replaces `workspace:*` and uses publishConfig.directory (dist).
  const packed = {};
  for (const [key, filter] of [
    ["core", "@commerce-ai-tool/core"],
    ["angular", "@commerce-ai-tool/angular"],
  ]) {
    run("pnpm", ["--filter", filter, "pack", "--pack-destination", tarballs], { cwd: repoRoot });
    packed[key] = readdirSync(tarballs).find((f) => f.startsWith(`commerce-ai-tool-${key}-`) && f.endsWith(".tgz"));
    if (!packed[key]) {
      throw new Error(`pnpm pack produced no tarball for ${filter}`);
    }
  }

  // 2. The packed manifest must be installable from npm: concrete core range, no workspace: protocol.
  const manifest = JSON.parse(
    execFileSync("tar", ["-xzOf", join(tarballs, packed.angular), "package/package.json"], { encoding: "utf8" }),
  );
  const coreRange = manifest.dependencies?.["@commerce-ai-tool/core"];
  if (!coreRange || coreRange.startsWith("workspace:")) {
    throw new Error(`packed angular manifest has dependencies["@commerce-ai-tool/core"] = ${JSON.stringify(coreRange)}`);
  }
  if (JSON.stringify(manifest).includes("workspace:")) {
    throw new Error("packed angular manifest still contains a workspace: protocol range");
  }
  console.log(`packed ${packed.angular} depends on @commerce-ai-tool/core@${coreRange}`);

  // 3. Fresh app from the fixture: fill in the Angular line and the tarball paths.
  cpSync(fixtureDir, app, { recursive: true });
  const pkgPath = join(app, "package.json");
  const text = readFileSync(pkgPath, "utf8")
    .replaceAll("ANGULAR_RANGE", `~${angularMinor}.0`)
    .replace("TARBALL_ANGULAR", `file:${join(tarballs, packed.angular)}`)
    .replace("TARBALL_CORE", `file:${join(tarballs, packed.core)}`);
  writeFileSync(pkgPath, text);

  const env = { ...process.env, NG_CLI_ANALYTICS: "false", CI: "true" };
  run("npm", ["install", "--no-audit", "--no-fund", "--no-package-lock"], { cwd: app, env, stdio: "inherit" });

  // `file:` specs and the `overrides` entry leave npm no way to fetch either package from the registry.
  for (const entry of ["angular/fesm2022", "core/dist/client.js"]) {
    if (!existsSync(join(app, "node_modules/@commerce-ai-tool", entry))) {
      throw new Error(`@commerce-ai-tool/${entry} missing after npm install`);
    }
  }

  // 4. AOT production build with strict templates.
  const ng = join(app, "node_modules/.bin/ng");
  const buildOutput = run(ng, ["build"], { cwd: app, env });
  console.log(buildOutput);

  const outDir = join(app, "dist/consumer/browser");
  const outFiles = readdirSync(outDir);
  const js = outFiles.filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(outDir, f), "utf8")).join("\n");
  const css = outFiles.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(outDir, f), "utf8")).join("\n");
  if (js.includes("ɵɵngDeclare")) {
    throw new Error("build output still contains partial declarations: the Angular linker did not process the library");
  }
  if (!js.includes("commerce-ai-search")) {
    throw new Error("build output does not contain the commerce-ai-search component");
  }
  if (!css.includes(".cat-root")) {
    throw new Error("build output does not contain the widget stylesheet (@commerce-ai-tool/angular/styles.css)");
  }
  console.log("OK: AOT build with strict templates linked the partial declarations and bundled the stylesheet");

  // 5. Negative controls: a wrong binding must fail strict-template checking, so the passing build
  // above proves the packed typings carry the inputs' accepted types: `messages` on the cart panel
  // (an `ngAcceptInputType_` transform), and `enableCart` on the search component, an input it
  // inherits from the abstract base class (so inherited inputs are type-checked, not just accepted).
  const componentPath = join(app, "src/app/app.component.ts");
  const original = readFileSync(componentPath, "utf8");
  const negativeControl = (label, from, to, expected) => {
    if (!original.includes(from)) {
      throw new Error(`negative control ${label}: the fixture no longer contains ${from}`);
    }
    writeFileSync(componentPath, original.replace(from, to));
    let failed = false;
    let output = "";
    try {
      execFileSync(ng, ["build"], { cwd: app, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      failed = true;
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }
    if (!failed) {
      throw new Error(`negative control: binding ${label} compiled; strict template checking is not engaged`);
    }
    if (!expected.test(output)) {
      console.error(output);
      throw new Error(`negative control ${label} failed for an unexpected reason (expected ${expected})`);
    }
    console.log(`OK: negative control rejected ${label}`);
  };
  negativeControl(
    '[messages]="42"',
    '<commerce-ai-cart-panel [cart]="null" [messages]="messages" />',
    '<commerce-ai-cart-panel [cart]="null" [messages]="42" />',
    /not assignable to type 'CommerceAISearchMessages'/,
  );
  negativeControl(
    `[enableCart]="'x'"`,
    '[enableCart]="true"',
    `[enableCart]="'x'"`,
    /Type 'string' is not assignable to type 'boolean'/,
  );
} finally {
  if (keep) {
    console.log(`kept ${work}`);
  } else {
    rmSync(work, { recursive: true, force: true });
  }
}
