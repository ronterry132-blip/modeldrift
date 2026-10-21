# Examples

These price tables are intentionally stale. The self-test workflow scans this folder with the committed catalog and checks `self-test/expected-drift.json`.

| File | What it demonstrates |
| --- | --- |
| `python/prices.py` | Stale per-1M rates, a provider alias, a per-token rate, and retired `gpt-4-0314` |
| `typescript/prices.ts` | Current Claude Sonnet 4.5 rates on a deprecated model |
| `typescript/clean.ts` | A model id with no hard-coded price |
| `yaml/models.yaml` | An unknown model id |
| `json/prices.json` | A deprecated model with the wrong per-1M rate |
