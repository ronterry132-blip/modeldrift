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
  const sourceUrl = env.LITELLM_PRICES_URL || LITELLM_URL;
  const response = await fetch(sourceUrl, { headers: { accept: "application/json", "user-agent": "modeldrift-worker" } });
  if (!response.ok) throw new Error(`GET ${sourceUrl} failed with ${response.status}`);
  const raw = (await response.json()) as Record<string, unknown>;
  const overrides = await loadOverrides(env);
  const catalog = normalizeLiteLLM(raw, { overrides });
  await env.CATALOG.put("prices", JSON.stringify(catalog.prices));
  await env.CATALOG.put("aliases", JSON.stringify(catalog.aliases));
  await env.CATALOG.put("deprecations", JSON.stringify(catalog.deprecations));
  await env.CATALOG.put("refreshedAt", catalog.prices.generatedAt);
}

async function loadOverrides(env: Env): Promise<NormalizeOverrides> {
  if (!env.OVERRIDES_URL) return bundledOverrides as NormalizeOverrides;
  const response = await fetch(env.OVERRIDES_URL, { headers: { accept: "application/json", "user-agent": "modeldrift-worker" } });
  if (!response.ok) return bundledOverrides as NormalizeOverrides;
  return (await response.json()) as NormalizeOverrides;
}
