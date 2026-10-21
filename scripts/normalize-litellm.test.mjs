import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLiteLLM, parseSunset, perMillion, statusFromDate } from "./normalize-litellm.mjs";

test("perMillion converts USD per token and rounds float dust", () => {
  assert.equal(perMillion(2.5e-6), 2.5);
  assert.equal(perMillion(1.5e-7), 0.15);
  assert.equal(perMillion(1e-5), 10);
});

test("parseSunset keeps ISO dates and drops the sample spec", () => {
  assert.equal(parseSunset("2026-10-23"), "2026-10-23");
  assert.equal(parseSunset("date when the model becomes deprecated"), null);
  assert.equal(parseSunset(null), null);
});

test("statusFromDate treats today as retired and a future day as deprecated", () => {
  const now = new Date("2026-10-21T03:00:00.000Z");
  assert.equal(statusFromDate("2024-06-13", now), "retired");
  assert.equal(statusFromDate("2026-10-21", now), "retired");
  assert.equal(statusFromDate("2026-10-23", now), "deprecated");
});

test("normalizeLiteLLM skips sample_spec, aliases provider prefixes, and applies overrides", () => {
  const raw = {
    sample_spec: {
      litellm_provider: "one of https://docs.litellm.ai/docs/providers",
      mode: "one of: chat, embedding",
      input_cost_per_token: 0,
      output_cost_per_token: 0,
      deprecation_date: "date when the model becomes deprecated in the format YYYY-MM-DD",
    },
    "gpt-4o": {
      litellm_provider: "openai",
      mode: "chat",
      input_cost_per_token: 2.5e-6,
      output_cost_per_token: 1e-5,
    },
    "gpt-4-turbo": {
      litellm_provider: "openai",
      mode: "chat",
      input_cost_per_token: 1e-5,
      output_cost_per_token: 3e-5,
      deprecation_date: "2026-10-23",
    },
    "custom-vision": {
      litellm_provider: "openai",
      mode: "image_generation",
    },
  };
  const overrides = {
    models: {
      "gpt-4-0314": {
        provider: "openai",
        inputPerMillion: 30,
        outputPerMillion: 60,
        mode: "chat",
        deprecationDate: "2024-06-13",
        status: "retired",
        replacement: "gpt-4o",
        note: "pinned",
      },
    },
    aliases: { "gpt-4o-latest": "gpt-4o" },
  };
  const { prices, aliases, deprecations } = normalizeLiteLLM(raw, {
    now: "2026-10-21T00:00:00.000Z",
    overrides,
    sourceCommit: "abc",
  });

  assert.equal(prices.license, "MIT");
  assert.equal(prices.sourceCommit, "abc");
  assert.equal(prices.models["sample_spec"], undefined);
  assert.equal(prices.models["custom-vision"], undefined);
  assert.deepEqual(prices.models["gpt-4o"], {
    provider: "openai",
    inputPerMillion: 2.5,
    outputPerMillion: 10,
    mode: "chat",
  });
  assert.equal(aliases.aliases["openai/gpt-4o"], "gpt-4o");
  assert.equal(aliases.aliases["gpt-4o-latest"], "gpt-4o");
  assert.equal(deprecations.models["gpt-4-turbo"].status, "deprecated");
  assert.equal(deprecations.models["gpt-4-turbo"].sunset, "2026-10-23");
  assert.equal(deprecations.models["gpt-4-0314"].status, "retired");
  assert.equal(deprecations.models["gpt-4-0314"].replacement, "gpt-4o");
  assert.equal(prices.models["gpt-4-0314"].inputPerMillion, 30);
});
