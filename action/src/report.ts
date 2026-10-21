import type { DriftReport, Finding } from "./types.js";
import type { Catalog } from "./catalog.js";

export const REPORT_MARKER = "<!-- modeldrift-report -->";

export function buildReport(options: {
  findings: Finding[];
  scannedFiles: number;
  catalog: Catalog;
  maxFindings: number;
}): DriftReport {
  const truncated = options.findings.length > options.maxFindings;
  const findings = options.findings.slice(0, options.maxFindings);
  const report: DriftReport = {
    driftCount: options.findings.length,
    hasDrift: options.findings.length > 0,
    truncated,
    scannedFiles: options.scannedFiles,
    generatedAt: new Date().toISOString(),
    catalogGeneratedAt: options.catalog.prices.generatedAt ?? null,
    source: options.catalog.prices.source ?? null,
    sourceUrl: options.catalog.prices.sourceUrl ?? null,
    license: options.catalog.prices.license ?? null,
    findings,
    markdown: "",
  };
  report.markdown = renderMarkdown(report);
  return report;
}

export function renderMarkdown(report: DriftReport): string {
  const lines: string[] = [REPORT_MARKER, "", "## ModelDrift", ""];
  if (!report.hasDrift) {
    lines.push(`No hard-coded model drift in ${report.scannedFiles} scanned files.`, "");
  } else {
    lines.push(
      `Found **${report.driftCount}** drift finding${report.driftCount === 1 ? "" : "s"} in ${report.scannedFiles} scanned files.`,
      "",
      "| Status | Model | Location | Detail |",
      "| --- | --- | --- | --- |",
    );
    for (const finding of report.findings) {
      lines.push(
        `| ${statusLabel(finding.kind)} | \`${escapeCell(finding.model)}\` | \`${escapeCell(finding.file)}:${finding.line}\` | ${escapeCell(detail(finding))} |`,
      );
    }
    if (report.truncated) {
      lines.push("", `Showing ${report.findings.length} of ${report.driftCount} findings.`);
    }
    lines.push("");
  }
  const generated = report.catalogGeneratedAt ? ` Catalog generated ${report.catalogGeneratedAt}.` : "";
  const source = report.sourceUrl ? ` Source: ${report.sourceUrl}.` : "";
  const license = report.license ? ` License: ${report.license}.` : "";
  lines.push(`Prices are USD per 1M tokens.${generated}${source}${license}`, "");
  return lines.join("\n");
}

function statusLabel(kind: Finding["kind"]): string {
  switch (kind) {
    case "price_changed":
      return "price changed";
    case "deprecated":
      return "deprecated";
    case "retired":
      return "retired";
    case "unknown":
      return "unknown model";
  }
}

function detail(finding: Finding): string {
  if (finding.kind === "unknown") return "No matching entry in the price catalog.";
  if (finding.kind === "price_changed") {
    const parts: string[] = [];
    if (finding.inputFound != null && finding.inputExpected != null && finding.inputFound !== finding.inputExpected) {
      parts.push(`input ${money(finding.inputFound)}/1M → ${money(finding.inputExpected)}/1M (${percent(finding.inputFound, finding.inputExpected)})`);
    }
    if (finding.outputFound != null && finding.outputExpected != null && finding.outputFound !== finding.outputExpected) {
      parts.push(`output ${money(finding.outputFound)}/1M → ${money(finding.outputExpected)}/1M (${percent(finding.outputFound, finding.outputExpected)})`);
    }
    return parts.join("; ") || "Price does not match the catalog.";
  }
  const when = finding.sunset ? ` on ${finding.sunset}` : "";
  const replacement = finding.replacement ? ` Replacement: \`${finding.replacement}\`.` : "";
  const note = finding.note ? ` ${finding.note}` : "";
  const verb = finding.kind === "retired" ? "Retired" : "Deprecated";
  return `${verb}${when}.${replacement}${note}`.trim();
}

function money(value: number): string {
  const text = value.toFixed(6).replace(/\.?0+$/, "");
  return `$${text}`;
}

function percent(found: number, expected: number): string {
  if (expected === 0) return "n/a";
  const value = ((found - expected) / expected) * 100;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
