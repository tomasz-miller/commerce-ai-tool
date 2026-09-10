import "zone.js";
import "zone.js/testing";
import { TestBed } from "@angular/core/testing";
import { BrowserTestingModule, platformBrowserTesting } from "@angular/platform-browser/testing";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveCommerceAISearchMessages } from "@commerce-ai-tool/core/client";
import { CommerceAiCartPanelComponent } from "./commerce-ai-cart-panel.component.js";

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

describe("CommerceAiCartPanelComponent", () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  async function render() {
    await TestBed.configureTestingModule({
      imports: [CommerceAiCartPanelComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(CommerceAiCartPanelComponent);
    fixture.componentInstance.messages = resolveCommerceAISearchMessages();
    fixture.detectChanges();
    return fixture;
  }

  it("emits login credentials and clears the password", async () => {
    const fixture = await render();
    const onLogin = vi.fn();
    fixture.componentInstance.login.subscribe(onLogin);

    fixture.componentInstance.email = "ada@example.com";
    fixture.componentInstance.password = "secret";
    fixture.componentInstance.onLoginSubmit();

    expect(onLogin).toHaveBeenCalledWith({ email: "ada@example.com", password: "secret" });
    expect(fixture.componentInstance.password).toBe("");
    expect(fixture.componentInstance.email).toBe("ada@example.com");
  });
});
