import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAIProvider } from "@commerce-ai-tool/core";
import type { AIProvider } from "@commerce-ai-tool/core";
import type { CallApiContextParams, ProviderOptions, ProviderResponse } from "promptfoo";

const DEFAULT_CATALOG_LOCALE = "no";

function loadEvalEnvFile(): void {
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

loadEvalEnvFile();

export default class TextSearchEvalProvider {
  private readonly providerId: string;
  private readonly ai: AIProvider;

  constructor(options: ProviderOptions) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is required. Copy evals/.env.example to evals/.env and set your key.",
      );
    }

    this.providerId = options.id ?? "commerce-text-search";
    this.ai = createAIProvider({
      provider: "openrouter",
      openrouter: {
        apiKey,
        model:
          (typeof options.config?.model === "string" ? options.config.model : undefined) ??
          process.env.OPENROUTER_MODEL,
      },
    });
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const vars = context?.vars ?? {};
    const query = String(vars.query ?? "");
    const catalogLocale = String(vars.catalogLocale ?? DEFAULT_CATALOG_LOCALE);
    const queryLocale = String(vars.queryLocale ?? catalogLocale);

    if (!query) {
      return { error: "Missing test variable: query" };
    }

    try {
      const result = await this.ai.interpretTextQuery(query, {
        queryLocale,
        catalogLocale,
      });

      return {
        output: JSON.stringify(result, null, 2),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { error: message };
    }
  }
}
