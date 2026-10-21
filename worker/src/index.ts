import { normalizeLiteLLM, type NormalizeOverrides } from "../../scripts/normalize-litellm.mjs";
import bundledOverrides from "../../data/overrides.json";

interface Env {
  CATALOG: KVNamespace;
  LITELLM_PRICES_URL?: string;
  OVERRIDES_URL?: string;
}

const LITELLM_URL = "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=300",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type",
        },
      });
    }
    if (request.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405, headers: JSON_HEADERS });

    const { pathname } = new URL(request.url);
    if (pathname === "/health") {
      const refreshedAt = await env.CATALOG.get("refreshedAt");
      return Response.json({ ok: true, refreshedAt }, { headers: JSON_HEADERS });
    }
    const key = pathname === "/prices" || pathname === "/aliases" || pathname === "/deprecations" ? pathname.slice(1) : null;
    if (!key) return Response.json({ error: "not found" }, { status: 404, headers: JSON_HEADERS });
    const body = await env.CATALOG.get(key);
    if (!body) return Response.json({ error: "catalog empty", key }, { status: 503, headers: JSON_HEADERS });
    return new Response(body, { headers: JSON_HEADERS });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(refresh(env));
  },
};

async function refresh(env: Env): Promise<void> {
  const raw = (await fetchPublicJson(env.LITELLM_PRICES_URL || LITELLM_URL)) as Record<string, unknown>;
  const overrides = await loadOverrides(env);
  const catalog = normalizeLiteLLM(raw, { overrides });
  await env.CATALOG.put("prices", JSON.stringify(catalog.prices));
  await env.CATALOG.put("aliases", JSON.stringify(catalog.aliases));
  await env.CATALOG.put("deprecations", JSON.stringify(catalog.deprecations));
  await env.CATALOG.put("refreshedAt", catalog.prices.generatedAt);
}

async function loadOverrides(env: Env): Promise<NormalizeOverrides> {
  if (!env.OVERRIDES_URL) return bundledOverrides as NormalizeOverrides;
  try {
    return (await fetchPublicJson(env.OVERRIDES_URL)) as NormalizeOverrides;
  } catch (error) {
    console.warn(`Overrides URL rejected; using bundled overrides. ${safeError(error)}`);
    return bundledOverrides as NormalizeOverrides;
  }
}

const MAX_CATALOG_BYTES = 20_000_000;

async function fetchPublicJson(raw: string): Promise<unknown> {
  let current = raw;
  for (let hop = 0; hop < 3; hop += 1) {
    const url = assertPublicHttps(current);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        headers: { accept: "application/json", "user-agent": "modeldrift-worker" },
      });
    } catch {
      throw new Error("Catalog request failed.");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Catalog redirect is missing a location.");
      current = new URL(location, url).toString();
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

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Catalog") || message.startsWith("Too many")) return message;
  return "request failed";
}

function assertPublicHttps(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Catalog URL is not valid.");
  }
  if (url.protocol !== "https:") throw new Error("Catalog URL must be https.");
  if (url.username || url.password) throw new Error("Catalog URL must not include credentials.");
  if (url.search) throw new Error("Catalog URL must not include a query string.");
  if (isBlockedHost(url.hostname)) throw new Error("Catalog URL host is not allowed.");
  return url.toString();
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "metadata.google.internal" || host === "metadata.internal") return true;
  if (host.includes(":")) {
    if (host === "::" || host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
    if (host.startsWith("::ffff:")) return isBlockedHost(host.slice("::ffff:".length));
    return false;
  }
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
