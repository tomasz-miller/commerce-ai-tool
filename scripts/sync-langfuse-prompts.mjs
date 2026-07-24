#!/usr/bin/env node
/**
 * Push local system prompt catalog to Langfuse (git remains source of truth).
 *
 * Usage:
 *   pnpm sync:langfuse-prompts
 *   pnpm sync:langfuse-prompts -- --label production
 *   pnpm sync:langfuse-prompts -- --dry-run
 *
 * Credentials: LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY
 * Optional: LANGFUSE_BASE_URL (loads apps/demo-next/.env.local when keys unset)
 *
 * Default label is `staging`. Pass `--label production` only after Promptfoo passes.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LangfuseClient } from "@langfuse/client";
import { listSystemPromptEntries } from "@commerce-ai-tool/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEMO_ENV = join(ROOT, "apps/demo-next/.env.local");

function parseArgs(argv) {
  const options = {
    label: "staging",
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--label") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--label requires a value");
      }
      options.label = value;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function printHelp() {
  console.log(`Usage: pnpm sync:langfuse-prompts -- [options]

Options:
  --label <name>  Langfuse label to apply (default: staging)
  --dry-run       Print prompts without calling Langfuse
  --help          Show this help

Default label is staging. Promote with --label production only after Promptfoo
evals pass. Runtime fetch uses LANGFUSE_PROMPTS=true and LANGFUSE_PROMPT_LABEL
(default production).
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    loadEnvFile(DEMO_ENV);
  }

  const entries = listSystemPromptEntries();
  console.log(`Syncing ${entries.length} system prompts (label=${options.label})`);

  if (options.dryRun) {
    for (const entry of entries) {
      console.log(`- ${entry.name} (${entry.prompt.length} chars)`);
    }
    console.log("Dry run complete — no API calls.");
    return;
  }

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    throw new Error(
      "Missing LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY (set env or apps/demo-next/.env.local)",
    );
  }

  const langfuse = new LangfuseClient({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  });

  for (const entry of entries) {
    await langfuse.createPrompt({
      name: entry.name,
      type: "text",
      prompt: entry.prompt,
      labels: [options.label],
    });
    console.log(`✓ ${entry.name}`);
  }

  console.log(`Synced ${entries.length} prompts to Langfuse with label "${options.label}".`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
