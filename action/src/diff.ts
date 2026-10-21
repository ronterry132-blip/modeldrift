import { priceDrifted } from "./prices.js";
import type { Catalog } from "./catalog.js";
import type { Finding, RawHit } from "./types.js";
import { looksLikeModelId } from "./models.js";

export function diffHits(hits: RawHit[], catalog: Catalog, tolerance: number): Finding[] {
  const findings: Finding[] = [];
  for (const hit of hits) {
    const resolved = catalog.resolve(hit.model);
    if (!resolved) {
      if (looksLikeModelId(hit.model)) {
        findings.push(finding(hit, "unknown", null));
      }
      continue;
    }
    if (resolved.deprecation) {
      findings.push(
        finding(hit, resolved.deprecation.status, resolved, {
          sunset: resolved.deprecation.sunset ?? null,
          replacement: resolved.deprecation.replacement ?? null,
          note: resolved.deprecation.note ?? null,
        }),
      );
    }
    const inputDrift =
      hit.inputPerMillion != null &&
      resolved.inputPerMillion != null &&
      priceDrifted(hit.inputPerMillion, resolved.inputPerMillion, tolerance);
    const outputDrift =
      hit.outputPerMillion != null &&
      resolved.outputPerMillion != null &&
      priceDrifted(hit.outputPerMillion, resolved.outputPerMillion, tolerance);
    if (inputDrift || outputDrift) {
      findings.push(
        finding(hit, "price_changed", resolved, {
          inputFound: hit.inputPerMillion,
          inputExpected: resolved.inputPerMillion,
          outputFound: hit.outputPerMillion,
          outputExpected: resolved.outputPerMillion,
        }),
      );
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
}

function finding(
  hit: RawHit,
  kind: Finding["kind"],
  resolved: ReturnType<Catalog["resolve"]>,
  extra: Partial<Finding> = {},
): Finding {
  return {
    kind,
    model: hit.model,
    canonical: resolved?.id ?? null,
    file: hit.file,
    line: hit.line,
    provider: resolved?.provider ?? null,
    inputFound: extra.inputFound ?? null,
    inputExpected: extra.inputExpected ?? null,
    outputFound: extra.outputFound ?? null,
    outputExpected: extra.outputExpected ?? null,
    sunset: extra.sunset ?? null,
    replacement: extra.replacement ?? null,
    note: extra.note ?? null,
  };
}
