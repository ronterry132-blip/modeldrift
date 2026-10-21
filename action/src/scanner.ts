import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { minimatch } from "minimatch";
import { classifyKey, detectUnit, heuristicUnit, roundPrice, toPerMillion, type PriceUnit } from "./prices.js";
import type { RawHit } from "./types.js";

const EXTENSIONS = new Set([".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".yml", ".yaml", ".json", ".toml"]);
const SKIP_DIRS = new Set([".git", "node_modules", "coverage", ".wrangler", ".astro"]);
const SKIP_FILES = new Set([".env", ".npmrc", ".netrc", ".git-credentials", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519"]);
const MAX_BYTES = 1_000_000;
const WINDOW_LINES = 12;

export interface ScanResult {
  hits: RawHit[];
  filesScanned: number;
}

interface Located {
  model: string;
  line: number;
  lineIndex: number;
}

export function resolveScanRoot(cwd: string, scanPath: string): string {
  const root = path.resolve(cwd, scanPath);
  const relative = path.relative(path.resolve(cwd), root);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Scan path must stay inside the workspace.");
  }
  return root;
}

export function scanRepo(options: {
  cwd: string;
  scanPath: string;
  ignore: string[];
  interesting: (value: string) => boolean;
}): ScanResult {
  const root = resolveScanRoot(options.cwd, options.scanPath);
  const hits: RawHit[] = [];
  let filesScanned = 0;

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.isSymbolicLink()) continue;
      if (SKIP_FILES.has(entry.name) || entry.name.startsWith(".env")) continue;
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(options.cwd, absolute).split(path.sep).join("/");
      if (isIgnored(relative, options.ignore)) continue;
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      let info;
      try {
        info = statSync(absolute);
      } catch {
        continue;
      }
      if (!info.isFile() || info.size > MAX_BYTES || info.size === 0) continue;
      const content = readFileSync(absolute, "utf8");
      if (content.includes("\u0000")) continue;
      filesScanned += 1;
      hits.push(...scanText(relative, content, options.interesting));
    }
  }

  walk(root);
  return { hits, filesScanned };
}

export function scanText(file: string, content: string, interesting: (value: string) => boolean): RawHit[] {
  const lines = content.split(/\r?\n/);
  const located = findModels(lines, interesting);
  const preamble = detectUnit(lines.slice(0, 30).join("\n"));
  const hits: RawHit[] = [];
  for (let i = 0; i < located.length; i += 1) {
    const current = located[i];
    const nextLine = located[i + 1]?.lineIndex ?? Math.min(lines.length, current.lineIndex + WINDOW_LINES + 1);
    const end = Math.min(nextLine, current.lineIndex + WINDOW_LINES + 1);
    const prices = extractPrices(lines, current.lineIndex, Math.max(end, current.lineIndex + 1), preamble);
    hits.push({
      model: current.model,
      file,
      line: current.line,
      inputPerMillion: prices.input,
      outputPerMillion: prices.output,
    });
  }
  return hits;
}

function findModels(lines: string[], interesting: (value: string) => boolean): Located[] {
  const quoted = /(['"`])([^'"`\n]{2,120})\1/g;
  const yaml = /^\s*(?:-\s*)?(?:model|name|id)\s*:\s*(['"]?)([A-Za-z0-9][A-Za-z0-9._:/-]*)\1\s*(?:#.*)?$/i;
  const found: Located[] = [];
  lines.forEach((line, index) => {
    const seen = new Set<string>();
    for (const match of line.matchAll(quoted)) {
      const model = match[2];
      if (!model || seen.has(model) || !interesting(model)) continue;
      seen.add(model);
      found.push({ model, line: index + 1, lineIndex: index });
    }
    const yamlMatch = line.match(yaml);
    const yamlModel = yamlMatch?.[2];
    if (yamlModel && !seen.has(yamlModel) && interesting(yamlModel)) {
      found.push({ model: yamlModel, line: index + 1, lineIndex: index });
    }
  });
  return found;
}

function extractPrices(
  lines: string[],
  start: number,
  end: number,
  preamble: PriceUnit | null,
): { input: number | null; output: number | null } {
  const text = lines.slice(start, end).join("\n");
  const unitHint = detectUnit(text) ?? preamble;
  let input: number | null = null;
  let output: number | null = null;
  const pairs = /["']?([A-Za-z_][A-Za-z0-9_]*)["']?\s*[:=]\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi;
  for (const match of text.matchAll(pairs)) {
    const classified = classifyKey(match[1] ?? "");
    if (!classified) continue;
    const raw = Number(match[2]);
    if (!Number.isFinite(raw)) continue;
    const unit = classified.unit === "unknown" ? (unitHint ?? heuristicUnit(raw)) : classified.unit;
    const value = roundPrice(toPerMillion(raw, unit));
    if (classified.side === "input" && input == null) input = value;
    if (classified.side === "output" && output == null) output = value;
  }
  return { input, output };
}

export function isIgnored(relativePath: string, patterns: string[]): boolean {
  const norm = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return patterns.some((raw) => {
    const pattern = raw.trim().replace(/^\.\//, "");
    if (!pattern || pattern.startsWith("#")) return false;
    if (matchGlob(norm, pattern)) return true;
    if (pattern.endsWith("/**") && !pattern.slice(0, -3).includes("*")) {
      const prefix = pattern.slice(0, -3);
      return norm === prefix || norm.startsWith(`${prefix}/`);
    }
    return false;
  });
}

function matchGlob(value: string, pattern: string): boolean {
  return minimatch(value, pattern, { dot: true });
}
