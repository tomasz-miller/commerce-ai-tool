#!/usr/bin/env node
/**
 * Backfill commercetools Product searchKeywords from name/description.
 *
 * Usage:
 *   pnpm seed:search-keywords
 *   pnpm seed:search-keywords -- --apply
 *   pnpm seed:search-keywords -- --apply --force --limit 10
 *
 * Credentials: CTP_PROJECT_KEY, CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_REGION
 * (optional: loads apps/demo-next/.env.local when CTP_PROJECT_KEY is unset)
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSearchKeywordsFromProductCopy } from "@commerce-ai-tool/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEMO_ENV = join(ROOT, "apps/demo-next/.env.local");
const PAGE_SIZE = 100;

function parseArgs(argv) {
  const options = {
    apply: false,
    force: false,
    limit: Infinity,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--limit") {
      const value = Number(argv[i + 1]);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error("--limit requires a positive number");
      }
      options.limit = Math.floor(value);
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

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function getAccessToken({ authUrl, clientId, clientSecret }) {
  const response = await fetch(authUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(`Auth failed: HTTP ${response.status}`);
  }

  const body = await response.json();
  if (!body.access_token) {
    throw new Error("Auth failed: missing access_token");
  }

  return body.access_token;
}

async function ctFetch(apiUrl, token, path, init = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return { ok: response.ok, status: response.status, body };
}

function productLabel(product) {
  return product.key || product.id;
}

async function fetchProductPage(apiUrl, token, offset) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  const result = await ctFetch(apiUrl, token, `/products?${params}`);
  if (!result.ok) {
    throw new Error(`List products failed: HTTP ${result.status}`);
  }
  return result.body;
}

async function updateSearchKeywords(apiUrl, token, product, searchKeywords) {
  const path = `/products/${product.id}`;
  const attempt = async (version) =>
    ctFetch(apiUrl, token, path, {
      method: "POST",
      body: JSON.stringify({
        version,
        actions: [
          {
            action: "setSearchKeywords",
            searchKeywords,
            staged: false,
          },
        ],
      }),
    });

  let result = await attempt(product.version);
  if (
    !result.ok &&
    result.status === 409 &&
    result.body?.errors?.[0]?.code === "ConcurrentModification"
  ) {
    const fresh = await ctFetch(apiUrl, token, path);
    if (!fresh.ok) {
      return result;
    }
    result = await attempt(fresh.body.version);
  }

  return result;
}

function printHelp() {
  console.log(`Seed commercetools searchKeywords from product name/description.

Options:
  --apply     Write updates (default is dry-run)
  --force     Overwrite products that already have searchKeywords
  --limit N   Process at most N products
  -h, --help  Show this help

Env:
  CTP_PROJECT_KEY, CTP_CLIENT_ID, CTP_CLIENT_SECRET, CTP_REGION
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (!process.env.CTP_PROJECT_KEY) {
    loadEnvFile(DEMO_ENV);
  }

  const projectKey = requireEnv("CTP_PROJECT_KEY");
  const clientId = requireEnv("CTP_CLIENT_ID");
  const clientSecret = requireEnv("CTP_CLIENT_SECRET");
  const region = requireEnv("CTP_REGION");

  const authUrl = `https://auth.${region}.commercetools.com/oauth/token`;
  const apiUrl = `https://api.${region}.commercetools.com/${projectKey}`;

  const token = await getAccessToken({ authUrl, clientId, clientSecret });

  const summary = {
    scanned: 0,
    skippedExisting: 0,
    skippedEmpty: 0,
    planned: 0,
    updated: 0,
    failed: 0,
  };

  console.log(
    `Mode: ${options.apply ? "APPLY" : "DRY-RUN"} | force=${options.force} | limit=${
      Number.isFinite(options.limit) ? options.limit : "none"
    } | project=${projectKey}`,
  );

  let offset = 0;
  let total = Infinity;

  while (summary.scanned < options.limit && offset < total) {
    const page = await fetchProductPage(apiUrl, token, offset);
    total = page.total ?? 0;
    const results = page.results ?? [];
    if (results.length === 0) {
      break;
    }

    for (const product of results) {
      if (summary.scanned >= options.limit) {
        break;
      }

      summary.scanned += 1;
      const current = product.masterData?.current ?? {};
      const built = buildSearchKeywordsFromProductCopy({
        name: current.name,
        description: current.description,
        existingSearchKeywords: current.searchKeywords,
        force: options.force,
      });

      if (built.status === "skip") {
        if (built.reason === "existing") {
          summary.skippedExisting += 1;
        } else {
          summary.skippedEmpty += 1;
        }
        continue;
      }

      summary.planned += 1;
      const locales = Object.keys(built.searchKeywords);
      console.log(
        `${options.apply ? "UPDATE" : "PLAN"} ${productLabel(product)} locales=${locales.join(",")}`,
      );

      if (!options.apply) {
        continue;
      }

      const result = await updateSearchKeywords(
        apiUrl,
        token,
        product,
        built.searchKeywords,
      );

      if (!result.ok) {
        summary.failed += 1;
        const message =
          result.body?.message ||
          result.body?.errors?.[0]?.message ||
          `HTTP ${result.status}`;
        console.error(`FAIL ${productLabel(product)}: ${message}`);
        continue;
      }

      summary.updated += 1;
    }

    offset += results.length;
  }

  console.log(
    `Done. scanned=${summary.scanned} planned=${summary.planned} updated=${summary.updated} skippedExisting=${summary.skippedExisting} skippedEmpty=${summary.skippedEmpty} failed=${summary.failed}`,
  );

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
