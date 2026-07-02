import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CATALOG_LOCALE = "no";

export function loadEvalEnvFile(): void {
  const evalDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const envPath = resolve(evalDir, ".env");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function resolveAudioFixturePath(filename: string): string {
  const evalDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return resolve(evalDir, "fixtures", "audio", filename);
}

export function readAudioFixture(filename: string): { bytes: Uint8Array; mimeType: string } {
  const filePath = resolveAudioFixturePath(filename);
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing audio fixture: ${filePath}. Run: pnpm eval:fixtures:audio`,
    );
  }

  const bytes = new Uint8Array(readFileSync(filePath));
  const mimeType = filename.endsWith(".webm")
    ? "audio/webm"
    : filename.endsWith(".mp3")
      ? "audio/mpeg"
      : "audio/wav";

  return { bytes, mimeType };
}

export function createOpenRouterProviderOptions(options: {
  id?: string;
  model?: string;
  voiceModel?: string;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required. Copy evals/.env.example to evals/.env and set your key.",
    );
  }

  return {
    apiKey,
    model: options.model ?? process.env.OPENROUTER_MODEL,
    voiceModel: options.voiceModel ?? process.env.OPENROUTER_VOICE_MODEL,
  };
}
