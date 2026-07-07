import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  readImageFixture,
  resolveImageFixturePath,
} from "./eval-utils.ts";

const evalDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const imagesDir = resolve(evalDir, "fixtures", "images");

const createdFixtures: string[] = [];

afterEach(() => {
  for (const filePath of createdFixtures.splice(0)) {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
});

describe("readImageFixture", () => {
  it("reads red-shoes.jpeg with image/jpeg mime type", () => {
    const fixturePath = resolve(imagesDir, "red-shoes.jpeg");
    if (!existsSync(fixturePath)) {
      return;
    }

    const { bytes, mimeType } = readImageFixture("red-shoes.jpeg");

    expect(bytes.length).toBeGreaterThan(0);
    expect(mimeType).toBe("image/jpeg");
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  });

  it("resolves .jpg extension to image/jpeg", () => {
    const filename = "test-fixture.jpg";
    const filePath = resolveImageFixturePath(filename);
    writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0x00]));
    createdFixtures.push(filePath);

    const { mimeType } = readImageFixture(filename);

    expect(mimeType).toBe("image/jpeg");
  });

  it("resolves .png extension to image/png", () => {
    const filename = "test-fixture.png";
    const filePath = resolveImageFixturePath(filename);
    writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    createdFixtures.push(filePath);

    const { mimeType } = readImageFixture(filename);

    expect(mimeType).toBe("image/png");
  });

  it("throws for missing fixture with helpful message", () => {
    expect(() => readImageFixture("does-not-exist.jpeg")).toThrow(
      /Missing image fixture.*pnpm eval:fixtures:images/,
    );
  });

  it("throws for unsupported extension", () => {
    const filename = "test-fixture.gif";
    const filePath = resolveImageFixturePath(filename);
    writeFileSync(filePath, Buffer.from("GIF89a"));
    createdFixtures.push(filePath);

    expect(() => readImageFixture(filename)).toThrow(/Unsupported image fixture extension/);
  });
});
