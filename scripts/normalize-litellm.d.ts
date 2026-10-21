export interface NormalizedModel {
  provider: string;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  mode: string | null;
}

export interface NormalizedDeprecation {
  status: "deprecated" | "retired";
  sunset: string | null;
  replacement: string | null;
  note: string | null;
}

export interface PriceCatalogFile {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  sourceUrl: string;
  sourceCommit: string | null;
  license: string;
  attribution: string;
  modelCount: number;
  models: Record<string, NormalizedModel>;
}

export interface AliasCatalogFile {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  license: string;
  attribution: string;
  aliasCount: number;
  aliases: Record<string, string>;
}

export interface DeprecationCatalogFile {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  license: string;
  attribution: string;
  modelCount: number;
  models: Record<string, NormalizedDeprecation>;
}

export interface NormalizeResult {
  prices: PriceCatalogFile;
  aliases: AliasCatalogFile;
  deprecations: DeprecationCatalogFile;
}

export interface NormalizeOverrides {
  models?: Record<string, {
    provider?: string;
    inputPerMillion?: number | null;
    outputPerMillion?: number | null;
    mode?: string | null;
    deprecationDate?: string | null;
    status?: "deprecated" | "retired";
    replacement?: string | null;
    note?: string | null;
  }>;
  aliases?: Record<string, string>;
}

export function perMillion(perToken: number): number;
export function parseSunset(value: unknown): string | null;
export function statusFromDate(sunset: string | null, now: Date): "deprecated" | "retired";
export function normalizeLiteLLM(
  raw: Record<string, unknown>,
  options?: { now?: string | Date; overrides?: NormalizeOverrides; sourceCommit?: string | null },
): NormalizeResult;

export const LITELLM_SOURCE_URL: string;
