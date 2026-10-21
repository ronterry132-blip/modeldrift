import { lookup } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AliasFile, DeprecationFile, PriceFile, ResolvedModel } from "./types.js";

export interface Catalog {
  prices: PriceFile;
  aliases: AliasFile;
  deprecations: DeprecationFile;
  resolve(model: string): ResolvedModel | null;
}

const MAX_CATALOG_BYTES = 20_000_000;
const BLOCKED_NAMES = new Set(["localhost", "metadata.google.internal", "metadata.internal"]);

export function assertPublicHttps(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Price catalog URL is not valid.");
  }
  if (url.protocol !== "https:") throw new Error("Price catalog URL must be https.");
  if (url.username || url.password) throw new Error("Price catalog URL must not include credentials.");
  if (url.search) throw new Error("Price catalog URL must not include a query string.");
  if (isBlockedAddress(url.hostname)) throw new Error("Price catalog URL host is not allowed.");
  return url;
}

export function isBlockedAddress(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || BLOCKED_NAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.includes(":")) return ipv6Blocked(host);
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a === 255) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function ipv6Blocked(host: string): boolean {
  if (host === "::" || host === "::1") return true;
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (host.startsWith("::ffff:")) return isBlockedAddress(host.slice("::ffff:".length));
  return false;
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
  let current = url;
  for (let hop = 0; hop < 3; hop += 1) {
    const parsed = assertPublicHttps(current);
    await assertResolvedAddress(parsed.hostname);
    const response = await fetch(parsed, {
      redirect: "manual",
      headers: { accept: "application/json", "user-agent": "modeldrift" },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Catalog redirect is missing a location.");
      current = new URL(location, parsed).toString();
      continue;
    }
    if (!response.ok) throw new Error(`Catalog request failed with status ${response.status}.`);
    const declared = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(declared) && declared > MAX_CATALOG_BYTES) throw new Error("Catalog response is too large.");
    const text = await response.text();
    if (text.length > MAX_CATALOG_BYTES) throw new Error("Catalog response is too large.");
    return JSON.parse(text) as unknown;
  }
  throw new Error("Too many catalog redirects.");
}

async function assertResolvedAddress(hostname: string): Promise<void> {
  if (isBlockedAddress(hostname)) throw new Error("Price catalog URL host is not allowed.");
  let records: Array<{ address: string }>;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Price catalog host could not be resolved.");
  }
  if (records.length === 0 || records.some((record) => isBlockedAddress(record.address))) {
    throw new Error("Price catalog URL host is not allowed.");
  }
}
