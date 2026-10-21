export type DriftKind = "price_changed" | "deprecated" | "retired" | "unknown";

export interface PriceEntry {
  provider: string;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  mode?: string | null;
}

export interface PriceFile {
  schemaVersion?: number;
  generatedAt?: string;
  source?: string;
  sourceUrl?: string;
  sourceCommit?: string | null;
  license?: string;
  attribution?: string;
  modelCount?: number;
  models: Record<string, PriceEntry>;
}

export interface AliasFile {
  schemaVersion?: number;
  generatedAt?: string;
  aliases: Record<string, string>;
}

export interface DeprecationEntry {
  status: "deprecated" | "retired";
  sunset?: string | null;
  replacement?: string | null;
  note?: string | null;
}

export interface DeprecationFile {
  schemaVersion?: number;
  generatedAt?: string;
  models: Record<string, DeprecationEntry>;
}

export interface ResolvedModel {
  id: string;
  provider: string | null;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  deprecation: DeprecationEntry | null;
}

export interface RawHit {
  model: string;
  file: string;
  line: number;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
}

export interface Finding {
  kind: DriftKind;
  model: string;
  canonical: string | null;
  file: string;
  line: number;
  provider: string | null;
  inputFound: number | null;
  inputExpected: number | null;
  outputFound: number | null;
  outputExpected: number | null;
  sunset: string | null;
  replacement: string | null;
  note: string | null;
}

export interface DriftReport {
  driftCount: number;
  hasDrift: boolean;
  truncated: boolean;
  scannedFiles: number;
  generatedAt: string;
  catalogGeneratedAt: string | null;
  source: string | null;
  sourceUrl: string | null;
  license: string | null;
  findings: Finding[];
  markdown: string;
}
