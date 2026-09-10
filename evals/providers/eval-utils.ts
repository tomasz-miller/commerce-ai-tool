import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  configureLangfusePrompts,
  createAIProvider,
  createCommercetoolsClient,
} from "@commerce-ai-tool/core";
import type { AIProvider, CommercetoolsClient, FacetAttributeDefinition } from "@commerce-ai-tool/core";
import type { ProviderOptions, ProviderResponse } from "promptfoo";

export const DEFAULT_CATALOG_LOCALE = "no";
export const SKIPPED_OUTPUT_PREFIX = "[SKIPPED:";

export type EvalProviderBackend = "openrouter" | "bedrock";

export interface CreateEvalAIProviderOptions {
  provider?: EvalProviderBackend;
  model?: string;
  visionModel?: string;
  voiceModel?: string;
  skipIfUnavailable?: boolean;
}

export interface EvalAIProviderResult {
  ai: AIProvider | null;
  skipped: boolean;
  skipReason?: string;
}

export function loadEvalEnvFile(): void {
  const evalDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  loadOptionalEnvFile(resolve(evalDir, ".env"));
}

export function loadOptionalEnvFile(envPath: string): void {
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
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadCommercetoolsEvalEnv(): void {
  loadEvalEnvFile();
  const evalDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const repoRoot = resolve(evalDir, "..");
  loadOptionalEnvFile(resolve(repoRoot, "apps/demo-next/.env.local"));
}

export function resolveAudioFixturePath(filename: string): string {
  const evalDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return resolve(evalDir, "fixtures", "audio", filename);
}

export function resolveImageFixturePath(filename: string): string {
  const evalDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  return resolve(evalDir, "fixtures", "images", filename);
}

function imageMimeTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  throw new Error(`Unsupported image fixture extension: ${filename}`);
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

export function readImageFixture(filename: string): {
  bytes: Uint8Array;
  base64: string;
  mimeType: string;
} {
  const filePath = resolveImageFixturePath(filename);
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing image fixture: ${filePath}. Run: pnpm eval:fixtures:images`,
    );
  }

  const bytes = new Uint8Array(readFileSync(filePath));
  const mimeType = imageMimeTypeFromFilename(filename);
  const base64 = Buffer.from(bytes).toString("base64");

  return { bytes, base64, mimeType };
}

export function isBedrockAvailable(): boolean {
  return Boolean(process.env.AWS_REGION?.trim());
}

export function isSkippedEvalOutput(output: string): boolean {
  return output.trim().startsWith(SKIPPED_OUTPUT_PREFIX);
}

export function createSkippedProviderResponse(reason: string): ProviderResponse {
  return { output: `${SKIPPED_OUTPUT_PREFIX} ${reason}]` };
}

export function createEvalAIProvider(
  options: CreateEvalAIProviderOptions = {},
): EvalAIProviderResult {
  // Promptfoo must always exercise the git catalog, even if the shell/CI enables
  // LANGFUSE_PROMPTS for other workflows.
  configureLangfusePrompts({ promptsEnabled: false });

  const provider = options.provider ?? "openrouter";
  const skipIfUnavailable = options.skipIfUnavailable ?? false;

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      if (skipIfUnavailable) {
        return {
          ai: null,
          skipped: true,
          skipReason: "OPENROUTER_API_KEY not configured",
        };
      }
      throw new Error(
        "OPENROUTER_API_KEY is required. Copy evals/.env.example to evals/.env and set your key.",
      );
    }

    return {
      ai: createAIProvider({
        provider: "openrouter",
        openrouter: {
          apiKey,
          model: options.model ?? process.env.OPENROUTER_MODEL,
          visionModel: options.visionModel ?? process.env.OPENROUTER_VISION_MODEL,
          voiceModel: options.voiceModel ?? process.env.OPENROUTER_VOICE_MODEL,
        },
      }),
      skipped: false,
    };
  }

  const region = process.env.AWS_REGION;
  if (!region) {
    if (skipIfUnavailable) {
      return {
        ai: null,
        skipped: true,
        skipReason: "AWS_REGION not configured",
      };
    }
    throw new Error(
      "AWS_REGION is required for Bedrock evals. Set it in evals/.env or use skipIfUnavailable.",
    );
  }

  return {
    ai: createAIProvider({
      provider: "bedrock",
      bedrock: {
        region,
        modelId: options.model ?? process.env.BEDROCK_MODEL_ID,
        visionModelId: options.visionModel ?? process.env.BEDROCK_VISION_MODEL_ID,
      },
    }),
    skipped: false,
  };
}

/** @deprecated Use createEvalAIProvider({ provider: "openrouter", ... }) */
export function createOpenRouterProviderOptions(options: {
  id?: string;
  model?: string;
  visionModel?: string;
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
    visionModel: options.visionModel ?? process.env.OPENROUTER_VISION_MODEL,
    voiceModel: options.voiceModel ?? process.env.OPENROUTER_VOICE_MODEL,
  };
}

export function readProviderConfig(options: ProviderOptions): CreateEvalAIProviderOptions {
  const config = options.config ?? {};
  const provider =
    config.provider === "bedrock" || config.provider === "openrouter"
      ? config.provider
      : undefined;

  return {
    provider,
    model: typeof config.model === "string" ? config.model : undefined,
    visionModel: typeof config.visionModel === "string" ? config.visionModel : undefined,
    voiceModel: typeof config.voiceModel === "string" ? config.voiceModel : undefined,
    skipIfUnavailable: config.skipIfUnavailable === true,
  };
}

export function parseAttributeCatalog(vars: Record<string, unknown>): FacetAttributeDefinition[] {
  const raw = vars.attributeCatalog;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as FacetAttributeDefinition[]) : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(raw)) {
    return raw as FacetAttributeDefinition[];
  }
  return [];
}

export function isCommercetoolsAvailable(): boolean {
  loadCommercetoolsEvalEnv();
  return Boolean(
    process.env.CTP_PROJECT_KEY?.trim() &&
      process.env.CTP_CLIENT_ID?.trim() &&
      process.env.CTP_CLIENT_SECRET?.trim() &&
      process.env.CTP_REGION?.trim(),
  );
}

export function createEvalCommercetoolsClient(): CommercetoolsClient {
  loadCommercetoolsEvalEnv();
  const projectKey = process.env.CTP_PROJECT_KEY?.trim();
  const clientId = process.env.CTP_CLIENT_ID?.trim();
  const clientSecret = process.env.CTP_CLIENT_SECRET?.trim();
  const region = process.env.CTP_REGION?.trim();
  if (!projectKey || !clientId || !clientSecret || !region) {
    throw new Error(
      "CTP_PROJECT_KEY, CTP_CLIENT_ID, CTP_CLIENT_SECRET, and CTP_REGION are required for retrieval evals.",
    );
  }
  return createCommercetoolsClient({
    projectKey,
    clientId,
    clientSecret,
    region,
  });
}

export function toEvalProviderResponse(
  output: unknown,
  ai: AIProvider,
  startedAt: number,
): ProviderResponse {
  const metrics = ai.getLastGenerationMetrics?.();
  return {
    output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
    tokenUsage: {
      prompt: metrics?.promptTokens,
      completion: metrics?.completionTokens,
      total: metrics?.totalTokens,
    },
    cost: metrics?.cost,
    metadata: {
      latencyMs: Date.now() - startedAt,
    },
  };
}
