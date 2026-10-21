import path from "node:path";
import { describe, expect, it } from "vitest";
import { readCatalogFiles } from "../src/catalog.js";
import { diffHits } from "../src/diff.js";
import { looksLikeModelId } from "../src/models.js";
import { buildReport } from "../src/report.js";
import { scanRepo } from "../src/scanner.js";
import { assertReport } from "../../scripts/assert-report.mjs";
import { readFileSync } from "node:fs";

describe("examples", () => {
  it("matches the self-test drift invariants against the shipped catalog", () => {
    const root = path.resolve(import.meta.dirname, "../..");
    const catalog = readCatalogFiles(
      path.join(root, "data/prices.json"),
      path.join(root, "data/aliases.json"),
      path.join(root, "data/deprecations.json"),
    );
    const scanned = scanRepo({
      cwd: root,
      scanPath: "examples",
      ignore: [],
      interesting: (value) => catalog.resolve(value) != null || looksLikeModelId(value),
    });
    const findings = diffHits(scanned.hits, catalog, 0.01);
    const report = buildReport({ findings, scannedFiles: scanned.filesScanned, catalog, maxFindings: 50 });
    const expected = JSON.parse(readFileSync(path.join(root, "self-test/expected-drift.json"), "utf8"));
    expect(assertReport(report, expected)).toEqual([]);
    expect(report.driftCount).toBeGreaterThanOrEqual(expected.require.length);
  });
});
