import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { looksLikeCompoundShoppingList } from "./client.js";

const clientSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "client.ts"), "utf8");

describe("client entry", () => {
  it("does not import AI, commercetools SDK, or observability modules", () => {
    expect(clientSource).not.toMatch(/from ["']\.\/ai\//);
    expect(clientSource).not.toMatch(/from ["']\.\/commercetools\/client/);
    expect(clientSource).not.toMatch(/from ["']\.\/observability\//);
    expect(clientSource).not.toMatch(/from ["']\.\/prompts\//);
    expect(clientSource).not.toMatch(/from ["']\.\/search\/mission/);
    expect(clientSource).not.toMatch(/from ["']\.\/search\/orchestrator/);
  });

  it("re-exports the compound-list heuristic", () => {
    expect(looksLikeCompoundShoppingList("glasses and a coffee table")).toBe(true);
  });
});
