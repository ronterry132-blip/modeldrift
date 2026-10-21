export interface ExpectedDrift {
  require?: Array<{ kind: string; model: string; file: string }>;
  requireOneOf?: Array<{ model: string; file: string; kinds: string[] }>;
  forbid?: Array<{ kind?: string; model?: string; file?: string }>;
}

export function assertReport(
  report: { findings?: Array<{ kind: string; model: string; file: string }> },
  expected: ExpectedDrift,
): string[];
