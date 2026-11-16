import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement media playback and logs "Not implemented" on every play() and pause().
if (typeof HTMLMediaElement !== "undefined") {
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => undefined;
}

afterEach(() => {
  cleanup();
});
