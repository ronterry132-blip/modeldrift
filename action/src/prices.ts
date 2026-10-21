export type PriceUnit = "token" | "1k" | "million";

export function roundPrice(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 1e8) / 1e8;
}

export function toPerMillion(value: number, unit: PriceUnit): number {
  if (unit === "token") return value * 1_000_000;
  if (unit === "1k") return value * 1_000;
  return value;
}

export function heuristicUnit(value: number): PriceUnit {
  return Math.abs(value) < 0.001 ? "token" : "million";
}

/** A banner or comment that says which unit unlabeled numbers use. */
export function detectUnit(text: string): PriceUnit | null {
  const normalized = text.toLowerCase();
  if (/per\s*1?\s*m(?:illion)?\b|\/\s*1m\b|per\s*mtok\b|usd per 1m/.test(normalized)) return "million";
  if (/per\s*(?:1\s*k|thousand)\b|\/\s*1k\b/.test(normalized)) return "1k";
  if (/per\s*token\b|\/\s*token\b/.test(normalized)) return "token";
  return null;
}

export function classifyKey(raw: string): { side: "input" | "output"; unit: PriceUnit | "unknown" } | null {
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key) return null;
  if (key.includes("token") && !/(cost|price|per)/.test(key)) return null;
  let side: "input" | "output" | null = null;
  if (key.startsWith("output") || key.startsWith("completion")) side = "output";
  else if (key.startsWith("input") || key.startsWith("prompt")) side = "input";
  else return null;
  if (key.includes("pertoken")) return { side, unit: "token" };
  if (key.includes("per1k") || key.includes("perthousand")) return { side, unit: "1k" };
  if (key.includes("permillion") || key.includes("per1m") || key.includes("permtok")) return { side, unit: "million" };
  return { side, unit: "unknown" };
}

export function priceDrifted(found: number, expected: number, tolerance: number): boolean {
  const diff = Math.abs(found - expected);
  if (diff <= 1e-6) return false;
  const base = Math.max(Math.abs(expected), 1e-9);
  return diff / base > tolerance;
}
