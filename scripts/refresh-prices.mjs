/**
 * Refresh data/prices.json, aliases.json, and deprecations.json.
 *
 * Source: LiteLLM model_prices_and_context_window.json (MIT for files outside enterprise/).
 * sdeep27/llm-pricing-api has no license and is intentionally not fetched.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LITELLM_SOURCE_URL, normalizeLiteLLM } from "./normalize-litellm.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const sourceUrl = process.env.LITELLM_PRICES_URL || LITELLM_SOURCE_URL;

async function sourceCommit() {
  const res = await fetch(
    "https://api.github.com/repos/BerriAI/litellm/commits?path=model_prices_and_context_window.json&per_page=1",
    {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "modeldrift",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!res.ok) return null;
  const body = await res.json();
  return typeof body?.[0]?.sha === "string" ? body[0].sha : null;
}

const response = await fetch(sourceUrl, {
  headers: { "user-agent": "modeldrift", accept: "application/json" },
  signal: AbortSignal.timeout(120_000),
});
if (!response.ok) {
  throw new Error(`GET ${sourceUrl} failed with ${response.status}`);
}
const raw = await response.json();
const overrides = JSON.parse(await readFile(path.join(dataDir, "overrides.json"), "utf8"));
const commit = await sourceCommit().catch(() => null);
const catalog = normalizeLiteLLM(raw, { overrides, sourceCommit: commit });

function stable(value) {
  const copy = { ...value };
  delete copy.generatedAt;
  delete copy.sourceCommit;
  return JSON.stringify(copy);
}

async function isUnchanged(name, value) {
  try {
    const current = JSON.parse(await readFile(path.join(dataDir, name), "utf8"));
    return stable(current) === stable(value);
  } catch {
    return false;
  }
}

const files = [
  ["prices.json", catalog.prices],
  ["aliases.json", catalog.aliases],
  ["deprecations.json", catalog.deprecations],
];
const changed = [];
for (const [name, value] of files) {
  if (!(await isUnchanged(name, value))) changed.push(name);
}
if (changed.length === 0) {
  console.log("Catalog content is unchanged.");
  process.exit(0);
}

for (const [name, value] of files) {
  await writeFile(path.join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${name}: ${value.modelCount ?? value.aliasCount} rows`);
}
