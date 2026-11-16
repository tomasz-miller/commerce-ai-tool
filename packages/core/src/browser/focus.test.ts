// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { focusFirstAvailable, getFocusable } from "./focus.js";

function mount(html: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  return container;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("getFocusable", () => {
  it("returns the controls Tab can reach, in DOM order", () => {
    const root = mount(`
      <button id="a">a</button>
      <a id="b" href="#x">b</a>
      <input id="c" />
      <select id="d"></select>
      <textarea id="e"></textarea>
      <span id="f" tabindex="0">f</span>
    `);

    expect(getFocusable(root).map((element) => element.id)).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("skips disabled, hidden-type, tabindex=-1 and link-less anchors", () => {
    const root = mount(`
      <button id="ok">ok</button>
      <button disabled>x</button>
      <input disabled />
      <input type="hidden" />
      <select disabled></select>
      <textarea disabled></textarea>
      <span tabindex="-1">x</span>
      <a>no href</a>
    `);

    expect(getFocusable(root).map((element) => element.id)).toEqual(["ok"]);
  });

  it("skips hidden elements: through checkVisibility() when the browser has it", () => {
    const root = mount(`<button id="shown">a</button><button id="gone">b</button>`);
    for (const element of Array.from(root.querySelectorAll("button"))) {
      Object.defineProperty(element, "checkVisibility", {
        configurable: true,
        value: () => element.id === "shown",
      });
    }

    expect(getFocusable(root).map((element) => element.id)).toEqual(["shown"]);
  });

  it("falls back to the hidden attribute without checkVisibility()", () => {
    const root = mount(`
      <button id="shown">a</button>
      <div hidden><button id="inside">b</button></div>
    `);

    expect(getFocusable(root).map((element) => element.id)).toEqual(["shown"]);
  });
});

describe("focusFirstAvailable", () => {
  it("focuses the first candidate that is connected, enabled and visible", () => {
    const root = mount(`
      <button id="disabled" disabled>a</button>
      <div hidden><button id="hidden">b</button></div>
      <button id="ok">c</button>
      <button id="later">d</button>
    `);
    const detached = document.createElement("button");
    const byId = (id: string) => root.querySelector(`#${id}`);

    const focused = focusFirstAvailable(
      null,
      undefined,
      detached,
      document.body,
      byId("disabled"),
      byId("hidden"),
      byId("ok"),
      byId("later"),
    );

    expect(focused).toBe(true);
    expect(document.activeElement?.id).toBe("ok");
  });

  it("returns false and leaves focus alone when nothing qualifies", () => {
    const root = mount(`<button id="keep">a</button><button id="off" disabled>b</button>`);
    (root.querySelector("#keep") as HTMLElement).focus();

    expect(focusFirstAvailable(null, root.querySelector("#off"))).toBe(false);
    expect(document.activeElement?.id).toBe("keep");
  });

  it("does nothing without a document (server rendering)", () => {
    vi.stubGlobal("document", undefined);

    expect(focusFirstAvailable(null)).toBe(false);
  });
});
