import os from "node:os";
import { describe, expect, it } from "vitest";
import { looksLikeModelId } from "../src/models.js";
import { classifyKey, detectUnit, priceDrifted, toPerMillion } from "../src/prices.js";
import { isIgnored, resolveScanRoot, scanText } from "../src/scanner.js";

const interesting = (value: string) => looksLikeModelId(value) || value === "gpt-4o" || value === "openai/gpt-4o";

describe("scanner", () => {
  it("reads per-million dict rates and stops at the next model", () => {
    const source = `
PRICES = {
    "gpt-4o": {"input": 5.0, "output": 15.0},
    "gpt-4o-mini": {"input": 0.15, "output": 0.6},
}
`;
    const hits = scanText("prices.py", source, interesting);
    const gpt4o = hits.find((hit) => hit.model === "gpt-4o");
    const mini = hits.find((hit) => hit.model === "gpt-4o-mini");
    expect(gpt4o).toMatchObject({ inputPerMillion: 5, outputPerMillion: 15 });
    expect(mini).toMatchObject({ inputPerMillion: 0.15, outputPerMillion: 0.6 });
  });

  it("converts explicit per-token keys and camelCase per-million keys", () => {
    const source = `
"gpt-4o-mini": {"input_cost_per_token": 1.5e-7, "output_cost_per_token": 6e-7}
const prices = { "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 } }
`;
    const hits = scanText("prices.ts", source, interesting);
    expect(hits.find((hit) => hit.model === "gpt-4o-mini")).toMatchObject({
      inputPerMillion: 0.15,
      outputPerMillion: 0.6,
    });
    expect(hits.find((hit) => hit.model === "claude-sonnet-4-5")).toMatchObject({
      inputPerMillion: 3,
      outputPerMillion: 15,
    });
  });

  it("reads unquoted yaml names and per-1k rates", () => {
    const source = `
models:
  - name: gpt-drift-unknown
    input_per_1k: 0.01
    output_per_thousand: 0.03
`;
    const hits = scanText("models.yaml", source, interesting);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ model: "gpt-drift-unknown", inputPerMillion: 10, outputPerMillion: 30 });
  });

  it("uses a file banner when the key does not name a unit", () => {
    const source = "# USD per 1M tokens\nMODEL = {\"gpt-4o\": {\"input\": 2.5, \"output\": 10}}\n";
    const hits = scanText("banner.py", source, interesting);
    expect(hits[0]).toMatchObject({ inputPerMillion: 2.5, outputPerMillion: 10 });
  });

  it("does not treat ordinary strings as models", () => {
    const source = 'message = "hello"\nname = "claude"\n';
    expect(scanText("notes.py", source, (value) => looksLikeModelId(value))).toEqual([]);
  });
});

describe("price helpers", () => {
  it("classifies keys and units", () => {
    expect(classifyKey("input_cost_per_token")).toEqual({ side: "input", unit: "token" });
    expect(classifyKey("outputPerMillion")).toEqual({ side: "output", unit: "million" });
    expect(classifyKey("max_output_tokens")).toBeNull();
    expect(detectUnit("USD per 1M tokens")).toBe("million");
    expect(detectUnit("per token")).toBe("token");
    expect(toPerMillion(0.01, "1k")).toBe(10);
  });

  it("ignores float dust inside the tolerance", () => {
    expect(priceDrifted(2.5, 2.5, 0.01)).toBe(false);
    expect(priceDrifted(2.52, 2.5, 0.01)).toBe(false);
    expect(priceDrifted(5, 2.5, 0.01)).toBe(true);
  });
});

describe("scan root", () => {
  it("rejects paths outside the workspace", () => {
    expect(() => resolveScanRoot(os.tmpdir(), "/etc")).toThrow(/workspace/);
  });
});

describe("ignore globs", () => {
  it("matches directory prefixes", () => {
    expect(isIgnored("examples/python/prices.py", ["examples/**"])).toBe(true);
    expect(isIgnored("src/app.py", ["examples/**"])).toBe(false);
  });
});

describe("model ids", () => {
  it("accepts provider-prefixed ids and rejects bare words", () => {
    expect(looksLikeModelId("openai/gpt-4o")).toBe(true);
    expect(looksLikeModelId("gpt-drift-unknown")).toBe(true);
    expect(looksLikeModelId("claude")).toBe(false);
    expect(looksLikeModelId("hello")).toBe(false);
  });
});
