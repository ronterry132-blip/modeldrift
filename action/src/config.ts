import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

export interface DriftConfig {
  ignore: string[];
  tolerance?: number;
}

export function loadConfig(cwd: string): DriftConfig {
  const candidates = [".modeldrift.yml", ".modeldrift.yaml", ".modeldrift.json"];
  for (const name of candidates) {
    const file = path.join(cwd, name);
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    const parsed = name.endsWith(".json") ? JSON.parse(text) : parse(text);
    return normalizeConfig(parsed);
  }
  return { ignore: [] };
}

function normalizeConfig(value: unknown): DriftConfig {
  if (!value || typeof value !== "object") return { ignore: [] };
  const record = value as Record<string, unknown>;
  const ignore = Array.isArray(record.ignore) ? record.ignore.filter((item): item is string => typeof item === "string") : [];
  const tolerance = typeof record.tolerance === "number" ? record.tolerance : undefined;
  return { ignore, tolerance };
}

export function splitPatterns(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.startsWith("#"));
}
