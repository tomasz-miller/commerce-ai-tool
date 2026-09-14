import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { demoEnvFilePaths, loadDemoEnv, resolveDemoAppRoot } from "./env.js";

const originalProjectKey = process.env.CTP_PROJECT_KEY;

afterEach(() => {
  if (originalProjectKey === undefined) {
    delete process.env.CTP_PROJECT_KEY;
  } else {
    process.env.CTP_PROJECT_KEY = originalProjectKey;
  }
});

describe("demo env loading", () => {
  it("resolves the Angular app root from the server file URL", () => {
    expect(resolveDemoAppRoot()).toMatch(/demo-angular$/);
  });

  it("looks for .env, .env.local, then demo-next .env.local", () => {
    const files = demoEnvFilePaths("/tmp/demo-angular");
    expect(files.env).toBe("/tmp/demo-angular/.env");
    expect(files.envLocal).toBe("/tmp/demo-angular/.env.local");
    expect(files.nextEnvLocal).toBe("/tmp/demo-next/.env.local");
  });

  it("loads CTP_PROJECT_KEY from demo-next .env.local when local files are missing", () => {
    const root = mkdtempSync(join(tmpdir(), "demo-angular-env-"));
    const nextDir = join(root, "demo-next");
    const angularDir = join(root, "demo-angular");
    mkdirSync(nextDir);
    mkdirSync(angularDir);
    writeFileSync(join(nextDir, ".env.local"), "CTP_PROJECT_KEY=from-next\n");

    delete process.env.CTP_PROJECT_KEY;
    const result = loadDemoEnv(process.env, angularDir);

    expect(result.loadedFrom).toEqual([join(nextDir, ".env.local")]);
    expect(process.env.CTP_PROJECT_KEY).toBe("from-next");
  });
});
