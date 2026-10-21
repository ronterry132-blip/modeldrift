import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AliasFile, DeprecationFile, PriceFile, ResolvedModel } from "./types.js";

export interface Catalog {
  prices: PriceFile;
  aliases: AliasFile;
  deprecations: DeprecationFile;
  resolve(model: string): ResolvedModel | null;
}

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"]);

export function assertPublicHttps(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Price catalog URL is not valid: ${raw}`);
  }
  if (url.protocol !== "https:") throw new Error(`Price catalog URL must be https: ${raw}`);
  if (BLOCKED_HOSTS.has(url.hostname) || url.hostname.endsWith(".localhost")) {
    throw new Error(`Price catalog URL host is not allowed: ${url.hostname}`);
  }
  return url;
}

export function siblingUrl(raw: string, fileName: string): string {
  const url = new URL(raw);
  const parts = url.pathname.split("/");
  parts[parts.length - 1] = fileName;
  url.pathname = parts.join("/");
  return url.toString();
}

export function loadCatalog(prices: PriceFile, aliases: AliasFile, deprecations: DeprecationFile): Catalog {
  const modelIds = new Map<string, string>();
  for (const id of Object.keys(prices.models ?? {})) modelIds.set(id.toLowerCase(), id);
  const aliasIds = new Map<string, string>();
  for (const [alias, target] of Object.entries(aliases.aliases ?? {})) aliasIds.set(alias.toLowerCase(), target);

  function canonical(model: string): string | null {
    if (prices.models?.[model]) return model;
    const aliased = aliases.aliases?.[model];
    if (aliased && prices.models?.[aliased]) return aliased;
    const byCase = modelIds.get(model.toLowerCase());
    if (byCase) return byCase;
    const aliasByCase = aliasIds.get(model.toLowerCase());
    if (aliasByCase && prices.models?.[aliasByCase]) return aliasByCase;
    return null;
  }

  return {
    prices,
    aliases,
    deprecations,
    resolve(model: string): ResolvedModel | null {
      const id = canonical(model);
      if (!id) return null;
      const price = prices.models[id];
      const deprecation = deprecations.models?.[id] ?? deprecations.models?.[model] ?? null;
      return {
        id,
        provider: price?.provider ?? null,
        inputPerMillion: price?.inputPerMillion ?? null,
        outputPerMillion: price?.outputPerMillion ?? null,
        deprecation,
      };
    },
  };
}

export function readCatalogFiles(pricesPath: string, aliasesPath: string, deprecationsPath: string): Catalog {
  return loadCatalog(
    JSON.parse(readFileSync(pricesPath, "utf8")) as PriceFile,
    JSON.parse(readFileSync(aliasesPath, "utf8")) as AliasFile,
    JSON.parse(readFileSync(deprecationsPath, "utf8")) as DeprecationFile,
  );
}

export function bundledDataDir(): string {
  const candidates: string[] = [];
  if (process.env.GITHUB_ACTION_PATH) {
    candidates.push(path.join(process.env.GITHUB_ACTION_PATH, "data"));
    candidates.push(path.join(process.env.GITHUB_ACTION_PATH, "..", "data"));
  }
  candidates.push(path.join(process.cwd(), "data"));
  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, "prices.json"))) return candidate;
  }
  throw new Error("Could not find data/prices.json next to the action or in the workspace.");
}

export async function fetchCatalogJson(url: string): Promise<unknown> {
  assertPublicHttps(url);
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "modeldrift" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
  return response.json();
}
