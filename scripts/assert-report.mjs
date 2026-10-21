/**
 * Check a ModelDrift JSON report against examples/expected invariants.
 *
 * Usage: node scripts/assert-report.mjs <report.json> [expected.json]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {{ findings: Array<{ kind: string, model: string, file: string }> }} report
 * @param {{ require: any[], requireOneOf: any[], forbid: any[] }} expected
 */
export function assertReport(report, expected) {
  const findings = report.findings ?? [];
  const errors = [];
  const has = (pred) => findings.some(pred);

  for (const item of expected.require ?? []) {
    if (!has((f) => f.kind === item.kind && f.model === item.model && f.file === item.file)) {
      errors.push(`missing ${item.kind} for ${item.model} in ${item.file}`);
    }
  }
  for (const item of expected.requireOneOf ?? []) {
    if (!has((f) => item.kinds.includes(f.kind) && f.model === item.model && f.file === item.file)) {
      errors.push(`missing one of [${item.kinds.join(", ")}] for ${item.model} in ${item.file}`);
    }
  }
  for (const item of expected.forbid ?? []) {
    const hit = findings.find((f) => {
      if (item.file && f.file !== item.file) return false;
      if (item.kind && f.kind !== item.kind) return false;
      if (item.model && f.model !== item.model) return false;
      return true;
    });
    if (hit) errors.push(`forbidden ${hit.kind} for ${hit.model} in ${hit.file}`);
  }
  return errors;
}

async function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error("usage: node scripts/assert-report.mjs <report.json> [expected.json]");
    process.exit(2);
  }
  const expectedPath = process.argv[3] ?? path.join(root, "examples", "expected-drift.json");
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const expected = JSON.parse(await readFile(expectedPath, "utf8"));
  const errors = assertReport(report, expected);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`drift report ok (${report.findings?.length ?? 0} findings, ${report.driftCount} counted)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
