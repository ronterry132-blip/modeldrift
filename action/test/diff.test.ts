import { describe, expect, it } from "vitest";
import { loadCatalog } from "../src/catalog.js";
import { diffHits } from "../src/diff.js";
import { looksLikeModelId } from "../src/models.js";
import { buildReport, REPORT_MARKER } from "../src/report.js";
import { scanText } from "../src/scanner.js";
import type { AliasFile, DeprecationFile, PriceFile } from "../src/types.js";

const prices: PriceFile = {
  generatedAt: "2026-10-21T00:00:00.000Z",
  source: "litellm",
  sourceUrl: "https://example.com/prices.json",
  license: "MIT",
  models: {
    "gpt-4o": { provider: "openai", inputPerMillion: 2.5, outputPerMillion: 10 },
    "gpt-4o-mini": { provider: "openai", inputPerMillion: 0.15, outputPerMillion: 0.6 },
    "claude-sonnet-4-5": { provider: "anthropic", inputPerMillion: 3, outputPerMillion: 15 },
    "gpt-4-0314": { provider: "openai", inputPerMillion: 30, outputPerMillion: 60 },
  },
};
const aliases: AliasFile = { aliases: { "openai/gpt-4o": "gpt-4o" } };
const deprecations: DeprecationFile = {
  models: {
    "claude-sonnet-4-5": { status: "deprecated", sunset: "2026-11-30", replacement: null, note: null },
    "gpt-4-0314": { status: "retired", sunset: "2024-06-13", replacement: "gpt-4o", note: "pinned" },
  },
};
const catalog = loadCatalog(prices, aliases, deprecations);

function findingsFor(file: string, source: string) {
  const hits = scanText(file, source, (value) => catalog.resolve(value) != null || looksLikeModelId(value));
  return diffHits(hits, catalog, 0.01);
}

describe("diff", () => {
  it("reports a price change, an alias, a retirement, and a matching per-token rate", () => {
    const findings = findingsFor(
      "prices.py",
      `
"gpt-4o": {"input": 5, "output": 15}
"openai/gpt-4o": {"input": 2.5, "output": 10}
"gpt-4o-mini": {"input_cost_per_token": 1.5e-7, "output_cost_per_token": 6e-7}
"gpt-4-0314": {"input": 30, "output": 60}
`,
    );
    expect(findings.map((finding) => `${finding.kind}:${finding.model}`)).toEqual([
      "price_changed:gpt-4o",
      "retired:gpt-4-0314",
    ]);
  });

  it("reports deprecation and a price change together, and unknown models", () => {
    const findings = findingsFor(
      "prices.ts",
      `
"claude-sonnet-4-5": {"inputPerMillion": 9, "outputPerMillion": 15}
"gpt-drift-unknown": {"input": 1, "output": 2}
`,
    );
    expect(findings.map((finding) => finding.kind).sort()).toEqual(["deprecated", "price_changed", "unknown"]);
    const price = findings.find((finding) => finding.kind === "price_changed");
    expect(price).toMatchObject({ model: "claude-sonnet-4-5", inputFound: 9, inputExpected: 3, outputFound: 15, outputExpected: 15 });
  });

  it("renders a markdown table", () => {
    const findings = findingsFor("prices.py", '"gpt-4o": {"input": 999, "output": 999}\n');
    const report = buildReport({ findings, scannedFiles: 1, catalog, maxFindings: 20 });
    expect(report.markdown.startsWith(REPORT_MARKER)).toBe(true);
    expect(report.markdown).toContain("price changed");
    expect(report.markdown).toContain("`gpt-4o`");
    expect(report.hasDrift).toBe(true);
  });
});
