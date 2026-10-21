/**
 * Turn LiteLLM's model_prices_and_context_window.json into ModelDrift catalogs.
 *
 * Upstream prices are USD per token. We store USD per 1M tokens.
 * The source file lives outside LiteLLM's enterprise/ directory and is MIT.
 */

const LITELLM_SOURCE_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const PROVIDER_PREFIX = {
  openai: "openai",
  anthropic: "anthropic",
  gemini: "gemini",
  vertex_ai: "vertex_ai",
  groq: "groq",
  mistral: "mistral",
  xai: "xai",
  azure: "azure",
  azure_ai: "azure_ai",
  bedrock: "bedrock",
  bedrock_converse: "bedrock",
  together_ai: "together_ai",
  fireworks_ai: "fireworks_ai",
  deepseek: "deepseek",
  cohere: "cohere",
  openrouter: "openrouter",
  perplexity: "perplexity",
  replicate: "replicate",
};

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/**
 * @param {number} perToken
 * @returns {number}
 */
export function perMillion(perToken) {
  return Math.round(perToken * 1_000_000 * 1e8) / 1e8;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function parseSunset(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return match ? match[1] : null;
}

/**
 * @param {string | null} sunset
 * @param {Date} now
 * @returns {"deprecated" | "retired"}
 */
export function statusFromDate(sunset, now) {
  if (!sunset) return "deprecated";
  const today = now.toISOString().slice(0, 10);
  return sunset <= today ? "retired" : "deprecated";
}

/**
 * @param {Record<string, unknown>} obj
 */
function sortObject(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * @param {Record<string, any>} raw
 * @param {{ now?: string | Date, overrides?: any, sourceCommit?: string | null }} [options]
 */
export function normalizeLiteLLM(raw, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("Invalid now date");
  const overrides = options.overrides ?? { models: {}, aliases: {} };

  /** @type {Record<string, any>} */
  const models = {};
  /** @type {Record<string, string>} */
  const aliases = {};
  /** @type {Record<string, any>} */
  const deprecations = {};

  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    if (key === "sample_spec" || /\s/.test(key)) continue;
    if (typeof value.mode === "string" && value.mode.includes("one of")) continue;

    const inputToken = num(value.input_cost_per_token);
    const outputToken = num(value.output_cost_per_token);
    if (inputToken == null && outputToken == null) continue;

    const provider = typeof value.litellm_provider === "string" ? value.litellm_provider : "unknown";
    models[key] = {
      provider,
      inputPerMillion: inputToken == null ? null : perMillion(inputToken),
      outputPerMillion: outputToken == null ? null : perMillion(outputToken),
      mode: typeof value.mode === "string" ? value.mode : null,
    };

    if (Array.isArray(value.aliases)) {
      for (const alias of value.aliases) {
        if (typeof alias === "string" && alias && alias !== key && !models[alias]) aliases[alias] = key;
      }
    }

    const sunset = parseSunset(value.deprecation_date);
    if (sunset) {
      deprecations[key] = {
        status: statusFromDate(sunset, now),
        sunset,
        replacement: null,
        note: null,
      };
    }
  }

  for (const [id, model] of Object.entries(models)) {
    const prefix = PROVIDER_PREFIX[model.provider];
    if (!prefix || id.startsWith(`${prefix}/`)) continue;
    const alias = `${prefix}/${id}`;
    if (!models[alias] && !aliases[alias]) aliases[alias] = id;
  }

  for (const [id, spec] of Object.entries(overrides.models ?? {})) {
    const current = models[id] ?? {
      provider: spec.provider ?? "unknown",
      inputPerMillion: null,
      outputPerMillion: null,
      mode: spec.mode ?? null,
    };
    models[id] = {
      provider: spec.provider || current.provider,
      inputPerMillion: spec.inputPerMillion ?? current.inputPerMillion,
      outputPerMillion: spec.outputPerMillion ?? current.outputPerMillion,
      mode: spec.mode ?? current.mode ?? null,
    };
    if (spec.deprecationDate || spec.status) {
      const sunset = spec.deprecationDate ?? null;
      deprecations[id] = {
        status: spec.status || statusFromDate(sunset, now),
        sunset,
        replacement: spec.replacement ?? null,
        note: spec.note ?? null,
      };
    }
  }

  for (const [alias, target] of Object.entries(overrides.aliases ?? {})) {
    if (typeof target === "string" && alias && alias !== target) aliases[alias] = target;
  }

  const generatedAt = now.toISOString();
  const attribution =
    "Prices transformed from BerriAI/litellm model_prices_and_context_window.json (MIT, Copyright (c) 2023 Berri AI). USD per 1M tokens. enterprise/ is excluded.";

  return {
    prices: {
      schemaVersion: 1,
      generatedAt,
      source: "litellm",
      sourceUrl: LITELLM_SOURCE_URL,
      sourceCommit: options.sourceCommit ?? null,
      license: "MIT",
      attribution,
      modelCount: Object.keys(models).length,
      models: sortObject(models),
    },
    aliases: {
      schemaVersion: 1,
      generatedAt,
      source: "litellm",
      license: "MIT",
      attribution,
      aliasCount: Object.keys(aliases).length,
      aliases: sortObject(aliases),
    },
    deprecations: {
      schemaVersion: 1,
      generatedAt,
      source: "litellm",
      license: "MIT",
      attribution,
      modelCount: Object.keys(deprecations).length,
      models: sortObject(deprecations),
    },
  };
}

export { LITELLM_SOURCE_URL };
