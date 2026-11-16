import { LangfuseClient, type TextPromptClient } from "@langfuse/client";
import { updateActiveObservation } from "@langfuse/tracing";
import type { LangfuseConfig } from "../types/index.js";
import { isLangfuseEnabled, isLangfusePromptsEnabled } from "../observability/enabled.js";
import { logSearchTrace } from "../utils/dev-trace.js";
import {
  REQUIRED_PROMPT_MARKERS,
  getLocalSystemPrompt,
  type SystemPromptName,
} from "./catalog.js";

export type ResolvedSystemPromptSource = "local" | "langfuse";

export interface ResolvedSystemPrompt {
  text: string;
  source: ResolvedSystemPromptSource;
  /** Langfuse prompt client when fetched from Langfuse (for generation linking). */
  prompt?: TextPromptClient;
}

const DEFAULT_PROMPT_LABEL = "production";
const DEFAULT_CACHE_TTL_SECONDS = 60;
const DEFAULT_FETCH_TIMEOUT_MS = 2000;
const DEFAULT_MAX_RETRIES = 0;
/** After a failed fetch, the same `name|label` is not fetched again for this long. */
const NEGATIVE_CACHE_TTL_MS = 30_000;

/** `name|label` → expiry (epoch ms) of a failed fetch. The SDK does not cache its fallback. */
const negativeCache = new Map<string, number>();
/** `name@version` pairs already warned about, so a bad managed prompt logs once, not per request. */
const warnedRejections = new Set<string>();

/** Runtime overrides from CommerceAIConfig.langfuse (set via configureLangfusePrompts). */
let runtimeConfig: LangfuseConfig | undefined;
let clientSingleton: LangfuseClient | null | undefined;
/** Test seam: override Langfuse client construction. */
let clientFactoryForTests: (() => LangfuseClient | null) | undefined;

/**
 * Apply Langfuse prompt settings from CommerceAIConfig.
 * Called by `createSearchOrchestrator` so programmatic `config.langfuse` is honored
 * (not only process.env). Resets the cached Langfuse client.
 */
export function configureLangfusePrompts(config: LangfuseConfig | undefined): void {
  runtimeConfig = config;
  clientSingleton = undefined;
  negativeCache.clear();
}

export function _setLangfusePromptClientFactoryForTests(
  factory: (() => LangfuseClient | null) | undefined,
): void {
  clientFactoryForTests = factory;
  clientSingleton = undefined;
}

/** @internal Test helper — clear runtime config between cases. */
export function _resetLangfusePromptRuntimeForTests(): void {
  runtimeConfig = undefined;
  clientSingleton = undefined;
  clientFactoryForTests = undefined;
  negativeCache.clear();
  warnedRejections.clear();
}

function arePromptsEnabled(): boolean {
  if (runtimeConfig?.promptsEnabled !== undefined) {
    return isLangfuseEnabled() && runtimeConfig.promptsEnabled;
  }
  return isLangfusePromptsEnabled();
}

function getPromptLabel(): string {
  const fromRuntime = runtimeConfig?.promptLabel?.trim();
  if (fromRuntime) {
    return fromRuntime;
  }
  return process.env.LANGFUSE_PROMPT_LABEL?.trim() || DEFAULT_PROMPT_LABEL;
}

function getPromptCacheTtlSeconds(): number {
  if (
    runtimeConfig?.promptCacheTtlSeconds !== undefined &&
    Number.isFinite(runtimeConfig.promptCacheTtlSeconds) &&
    runtimeConfig.promptCacheTtlSeconds >= 0
  ) {
    return runtimeConfig.promptCacheTtlSeconds;
  }

  const raw = process.env.LANGFUSE_PROMPT_CACHE_TTL_SECONDS;
  if (!raw) {
    return DEFAULT_CACHE_TTL_SECONDS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CACHE_TTL_SECONDS;
}

function getPromptFetchTimeoutMs(): number {
  const value = runtimeConfig?.promptFetchTimeoutMs;
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : DEFAULT_FETCH_TIMEOUT_MS;
}

function getPromptMaxRetries(): number {
  const value = runtimeConfig?.promptMaxRetries;
  return value !== undefined && Number.isInteger(value) && value >= 0 ? value : DEFAULT_MAX_RETRIES;
}

/** Rejects after `timeoutMs`; the SDK timeout is the primary bound, this guarantees it even if it hangs. */
async function withFetchTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Langfuse prompt fetch timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function missingMarkers(name: SystemPromptName, text: string): string[] {
  return REQUIRED_PROMPT_MARKERS[name].filter((marker) => !text.includes(marker));
}

/** Logs the missing marker phrases (fixed library strings), never the prompt text. */
function warnRejectedPrompt(name: SystemPromptName, version: unknown, missing: string[]): void {
  const key = `${name}@${String(version)}`;
  if (warnedRejections.has(key)) {
    return;
  }
  warnedRejections.add(key);
  console.warn(
    `[commerce-ai-tool/core] Langfuse prompt "${name}" (version ${String(version)}) is missing required marker phrase(s) ${missing.map((marker) => `"${marker}"`).join(", ")}; using the local prompt. See docs/OBSERVABILITY.md (Prompt management).`,
  );
}

function getLangfuseClient(): LangfuseClient | null {
  if (clientFactoryForTests) {
    return clientFactoryForTests();
  }
  if (clientSingleton !== undefined) {
    return clientSingleton;
  }

  if (!arePromptsEnabled()) {
    clientSingleton = null;
    return null;
  }

  clientSingleton = new LangfuseClient({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  });
  return clientSingleton;
}

/**
 * Resolve a system prompt: local catalog by default; optional Langfuse fetch when
 * prompts are enabled (env LANGFUSE_PROMPTS or CommerceAIConfig.langfuse).
 * Always fails open to the local string.
 */
export async function resolveSystemPrompt(name: SystemPromptName): Promise<ResolvedSystemPrompt> {
  const local = getLocalSystemPrompt(name);

  if (!arePromptsEnabled()) {
    return { text: local, source: "local" };
  }

  const client = getLangfuseClient();
  if (!client) {
    return { text: local, source: "local" };
  }

  const label = getPromptLabel();
  const cacheTtlSeconds = getPromptCacheTtlSeconds();
  const fetchTimeoutMs = getPromptFetchTimeoutMs();
  const cacheKey = `${name}|${label}`;

  const blockedUntil = negativeCache.get(cacheKey);
  if (blockedUntil !== undefined) {
    if (Date.now() < blockedUntil) {
      return { text: local, source: "local" };
    }
    negativeCache.delete(cacheKey);
  }

  const markFailed = () => {
    negativeCache.set(cacheKey, Date.now() + NEGATIVE_CACHE_TTL_MS);
  };

  try {
    const prompt = await withFetchTimeout(
      client.prompt.get(name, {
        type: "text",
        label,
        fallback: local,
        cacheTtlSeconds,
        fetchTimeoutMs,
        maxRetries: getPromptMaxRetries(),
      }),
      fetchTimeoutMs,
    );

    if (prompt.isFallback) {
      // The SDK swallowed a failed fetch and returned our fallback; it does not cache that result.
      markFailed();
      return { text: local, source: "local" };
    }

    const rawText = typeof prompt.prompt === "string" ? prompt.prompt : "";
    if (!rawText.trim()) {
      return { text: local, source: "local" };
    }

    const missing = missingMarkers(name, rawText);
    if (missing.length > 0) {
      warnRejectedPrompt(name, prompt.version, missing);
      return { text: local, source: "local" };
    }

    return { text: rawText, source: "langfuse", prompt };
  } catch (error) {
    markFailed();
    logSearchTrace("langfuse_prompt_fetch_failed", {
      name,
      label,
      message: error instanceof Error ? error.message : String(error),
    });
    return { text: local, source: "local" };
  }
}

/**
 * Attach a Langfuse prompt to the active generation observation (no-op when absent).
 */
export function linkActiveGenerationPrompt(prompt: TextPromptClient | undefined): void {
  if (!prompt) {
    return;
  }

  try {
    updateActiveObservation({ prompt }, { asType: "generation" });
  } catch {
    // No active observation (e.g. Langfuse tracing disabled) — ignore.
  }
}

/**
 * Resolve system prompt text and link the Langfuse prompt to the active generation
 * when the text came from Langfuse (not local fallback).
 */
export async function resolveAndLinkSystemPrompt(name: SystemPromptName): Promise<string> {
  const resolved = await resolveSystemPrompt(name);
  if (resolved.source === "langfuse") {
    linkActiveGenerationPrompt(resolved.prompt);
  }
  return resolved.text;
}
