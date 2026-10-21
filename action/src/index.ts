import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  assertPublicHttps,
  bundledDataDir,
  fetchCatalogJson,
  loadCatalog,
  readCatalogFiles,
  siblingUrl,
  type Catalog,
} from "./catalog.js";
import type { AliasFile, DeprecationFile, PriceFile } from "./types.js";
import { loadConfig, splitPatterns } from "./config.js";
import { diffHits } from "./diff.js";
import { syncDriftIssue, upsertPullRequestComment } from "./github.js";
import { looksLikeModelId } from "./models.js";
import { buildReport } from "./report.js";
import { scanRepo } from "./scanner.js";

async function run(): Promise<void> {
  const cwd = process.cwd();
  const scanPath = input("path", ".");
  const useConfig = boolInput("use-config", true);
  const config = useConfig ? loadConfig(cwd) : { ignore: [] };
  const tolerance = numberInput("tolerance", config.tolerance ?? 0.01);
  if (tolerance < 0) throw new Error("Input tolerance must be >= 0.");
  const maxFindings = Math.max(1, Math.floor(numberInput("max-findings", 200)));
  const failOnDrift = boolInput("fail-on-drift", false);
  const allowFallback = boolInput("allow-fallback", true);
  const mode = input("mode", "auto");
  const comment = boolInput("comment", true);
  const ignoreInput = core.getInput("ignore");
  const ignore = ignoreInput.trim() ? splitPatterns(ignoreInput) : config.ignore;

  const catalog = await loadRequestedCatalog(allowFallback);
  const scanned = scanRepo({
    cwd,
    scanPath,
    ignore,
    interesting: (value) => catalog.resolve(value) != null || looksLikeModelId(value),
  });
  const findings = diffHits(scanned.hits, catalog, tolerance);
  const report = buildReport({
    findings,
    scannedFiles: scanned.filesScanned,
    catalog,
    maxFindings,
  });

  const reportPath = core.getInput("report-path").trim() || path.join(process.env.RUNNER_TEMP || os.tmpdir(), "modeldrift-report.json");
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  core.setOutput("drift-count", String(report.driftCount));
  core.setOutput("has-drift", report.hasDrift ? "true" : "false");
  core.setOutput("report-path", reportPath);
  try {
    await core.summary.addRaw(report.markdown).write();
  } catch (error) {
    core.info(`Job summary skipped: ${errorMessage(error)}`);
  }

  core.info(`Scanned ${report.scannedFiles} files, ${report.driftCount} drift findings. Report: ${reportPath}`);
  await publish(mode, comment, report);

  if (failOnDrift && report.hasDrift) {
    core.setFailed(`ModelDrift found ${report.driftCount} hard-coded model drift finding(s).`);
  }
}

async function loadRequestedCatalog(allowFallback: boolean): Promise<Catalog> {
  const pricesPath = core.getInput("prices-path").trim();
  const aliasesPath = core.getInput("aliases-path").trim();
  const deprecationsPath = core.getInput("deprecations-path").trim();
  if (pricesPath) {
    const aliases = aliasesPath || path.join(path.dirname(pricesPath), "aliases.json");
    const deprecations = deprecationsPath || path.join(path.dirname(pricesPath), "deprecations.json");
    return readCatalogFiles(pricesPath, aliases, deprecations);
  }

  const pricesUrl = core.getInput("prices-url").trim();
  if (!pricesUrl) return readBundled();

  try {
    assertPublicHttps(pricesUrl);
    const prices = (await fetchCatalogJson(pricesUrl)) as PriceFile;
    const aliases = (await fetchOptional(
      core.getInput("aliases-url").trim() || siblingUrl(pricesUrl, pricesUrl.endsWith(".json") ? "aliases.json" : "aliases"),
      allowFallback,
    )) as AliasFile | null;
    const deprecations = (await fetchOptional(
      core.getInput("deprecations-url").trim() || siblingUrl(pricesUrl, pricesUrl.endsWith(".json") ? "deprecations.json" : "deprecations"),
      allowFallback,
    )) as DeprecationFile | null;
    const bundled = readBundled();
    return loadCatalog(prices, aliases ?? bundled.aliases, deprecations ?? bundled.deprecations);
  } catch (error) {
    if (!allowFallback) throw error;
    core.warning(`Live price catalog failed (${errorMessage(error)}). Using the catalog shipped with the action.`);
    return readBundled();
  }
}

async function fetchOptional(url: string, allowFallback: boolean): Promise<unknown | null> {
  try {
    return await fetchCatalogJson(url);
  } catch (error) {
    if (!allowFallback) throw error;
    core.warning(`Could not fetch ${url} (${errorMessage(error)}). Using the shipped file.`);
    return null;
  }
}

function readBundled(): Catalog {
  const dir = bundledDataDir();
  return readCatalogFiles(path.join(dir, "prices.json"), path.join(dir, "aliases.json"), path.join(dir, "deprecations.json"));
}

async function publish(mode: string, comment: boolean, report: Awaited<ReturnType<typeof buildReport>>): Promise<void> {
  const event = process.env.GITHUB_EVENT_NAME ?? "";
  let effective = mode;
  if (mode === "auto") {
    if ((event === "pull_request" || event === "pull_request_target") && comment) effective = "comment";
    else if (event === "schedule" || event === "workflow_dispatch") effective = event === "schedule" ? "issue" : "report";
    else effective = "report";
  }
  if (effective === "report") return;

  const token = core.getInput("github-token");
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  const [owner, repo] = repository.split("/");
  if (!token || !owner || !repo) {
    core.warning("Skipping GitHub comment or issue because github-token or GITHUB_REPOSITORY is missing.");
    return;
  }
  const octokit = github.getOctokit(token);
  if (effective === "comment") {
    const pullNumber = pullRequestNumber();
    if (!pullNumber) {
      core.warning("mode=comment needs a pull_request event. Wrote the report without commenting.");
      return;
    }
    const result = await upsertPullRequestComment(octokit, { owner, repo }, pullNumber, report.markdown);
    core.info(`Pull request comment ${result}.`);
    return;
  }
  if (effective === "issue") {
    const result = await syncDriftIssue(octokit, { owner, repo }, report);
    core.info(`Drift issue ${result}.`);
  }
}

function pullRequestNumber(): number | null {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;
  try {
    const payload = JSON.parse(readFileSync(eventPath, "utf8")) as { pull_request?: { number?: unknown } };
    const number = payload.pull_request?.number;
    return typeof number === "number" ? number : null;
  } catch {
    return null;
  }
}

function input(name: string, fallback: string): string {
  const value = core.getInput(name);
  return value.trim() ? value.trim() : fallback;
}

function boolInput(name: string, fallback: boolean): boolean {
  const value = core.getInput(name).trim();
  if (!value) return fallback;
  return value === "true";
}

function numberInput(name: string, fallback: number): number {
  const value = core.getInput(name).trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Input ${name} must be a number.`);
  return parsed;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

run().catch((error: unknown) => {
  core.setFailed(errorMessage(error));
});
