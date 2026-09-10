#!/usr/bin/env node
/**
 * Dump a small product snapshot from the live commercetools catalog
 * for retrieval golden sets.
 *
 * Usage: pnpm eval:fixtures:catalog
 *
 * Reads CTP_* from evals/.env, then apps/demo-next/.env.local.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCommercetoolsClient } from "@commerce-ai-tool/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(__dirname, "..", "fixtures", "catalog");
const SEED_QUERIES = ["coffee table", "glasses", "chair", "wine glass", "mug"];
const CATALOG_LOCALE = "en-GB";

function loadOptionalEnvFile(envPath) {
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
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
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadOptionalEnvFile(join(ROOT, "evals", ".env"));
loadOptionalEnvFile(join(ROOT, "apps", "demo-next", ".env.local"));

const projectKey = process.env.CTP_PROJECT_KEY?.trim();
const clientId = process.env.CTP_CLIENT_ID?.trim();
const clientSecret = process.env.CTP_CLIENT_SECRET?.trim();
const region = process.env.CTP_REGION?.trim();

if (!projectKey || !clientId || !clientSecret || !region) {
  console.error("CTP_* credentials are required. Set them in evals/.env or apps/demo-next/.env.local.");
  process.exit(1);
}

const client = createCommercetoolsClient({
  projectKey,
  clientId,
  clientSecret,
  region,
});

const currency = process.env.CAT_DEFAULT_CURRENCY ?? "EUR";
const country = process.env.CAT_DEFAULT_COUNTRY;
const products = new Map();

for (const query of SEED_QUERIES) {
  const result = await client.searchProducts(
    {
      interpreted: {
        searchTerms: [query],
        primaryTerm: query,
        interpretation: query,
      },
      catalogLocale: CATALOG_LOCALE,
      limit: 8,
      options: { currency },
    },
    { locale: CATALOG_LOCALE, currency },
  );

  let cards = result.projections ?? [];
  if (cards.length === 0 && result.productIds.length > 0) {
    cards = await client.getProductProjections(result.productIds, CATALOG_LOCALE, currency, country);
  }

  for (const card of cards) {
    products.set(card.id, {
      id: card.id,
      sku: card.sku,
      name: card.name,
      slug: card.slug,
      seedQuery: query,
    });
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const payload = {
  catalogLocale: CATALOG_LOCALE,
  dumpedAt: new Date().toISOString(),
  projectKey,
  products: [...products.values()],
};
const outPath = join(OUT_DIR, "en-GB.json");
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.products.length} products to ${outPath}`);
