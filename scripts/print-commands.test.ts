import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DESCRIPTIONS,
  extractCommandBlock,
  readRootScripts,
  renderCommands,
  replaceCommandBlock,
} from "./print-commands.mjs";

const agents = readFileSync(join(import.meta.dirname, "..", "AGENTS.md"), "utf8");

describe("AGENTS.md command block", () => {
  it("matches the root package.json scripts (fix with: node scripts/print-commands.mjs --write)", () => {
    expect(extractCommandBlock(agents)).toBe(renderCommands(readRootScripts()));
  });

  it("detects a drifted block", () => {
    const drifted = agents.replace("pnpm lint ", "pnpm lint:old ");
    expect(drifted).not.toBe(agents);
    expect(extractCommandBlock(drifted)).not.toBe(renderCommands(readRootScripts()));
  });

  it("restores a drifted block when it is replaced", () => {
    const block = renderCommands(readRootScripts());
    const drifted = replaceCommandBlock(agents, "```bash\npnpm nothing\n```");
    expect(replaceCommandBlock(drifted, block)).toBe(agents);
  });

  it("describes every root script and nothing else", () => {
    expect(Object.keys(DESCRIPTIONS).sort()).toEqual(Object.keys(readRootScripts()).sort());
  });

  it("refuses to render a script that has no description", () => {
    expect(() => renderCommands({ ...readRootScripts(), brandNew: "echo hi" })).toThrow(/brandNew/);
  });

  it("refuses to render a description whose script was removed", () => {
    const { build: _build, ...withoutBuild } = readRootScripts();
    expect(() => renderCommands(withoutBuild)).toThrow(/build/);
  });
});
