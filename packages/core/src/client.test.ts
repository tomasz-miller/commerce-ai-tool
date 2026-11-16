import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as client from "./client.js";
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

  it("exports the framework-agnostic browser modules", () => {
    for (const name of [
      "createCommerceAIApiClient",
      "CommerceAIApiError",
      "createCartSessionStore",
      "getSharedCartSessionStore",
      "isStaleCartSnapshot",
      "safeStorage",
      "recordedAudioFile",
      "createAudioPlayer",
      "messageForError",
      "getCameraErrorMessage",
      "buildCameraConstraints",
      "createJpegFileFromVideo",
      "prefersNativeCamera",
      "stopMediaStream",
      "starterBundleItems",
      "formatMissionAddAll",
      "formatNamedMessage",
      "addToCartLabel",
      "removeItemLabel",
      "quantityGroupLabel",
      "toCartItem",
      "lineItemKey",
    ]) {
      expect(client, name).toHaveProperty(name);
    }
  });

  it("keeps browser modules free of framework and server imports", () => {
    const browserDir = join(dirname(fileURLToPath(import.meta.url)), "browser");
    for (const file of readdirSync(browserDir).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
      const source = readFileSync(join(browserDir, file), "utf8");
      expect(source, file).not.toMatch(/from ["'](react|react-dom|@angular\/|node:)/);
      expect(source, file).not.toMatch(/from ["']\.\.\/(ai|observability|prompts|cache)\//);
      expect(source, file).not.toMatch(/from ["']\.\.\/commercetools\/client/);
    }
  });
});
