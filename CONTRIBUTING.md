# Contributing

Thanks for helping ModelDrift stay small, accurate, and safe to run in other people's CI.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues in private, as described in [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.

## Development

Node 22 or newer. The published action still runs on GitHub's Node 20 runner; the bundle target stays `node20`. CI uses Node 22 because Astro 7 and Wrangler 4 require it.

```bash
cd action
npm ci
npm test
npm run typecheck
npm run build
```

Commit `action/dist` with the source change. CI fails if the build output differs from the commit.

```bash
node --test scripts/normalize-litellm.test.mjs
node --test site/src/lib/badge.test.mjs
cd worker && npm ci && npm run typecheck
cd site && npm ci && npm run build
```

The landing-page and worker scripts disable Astro telemetry and Wrangler metrics. Leave those flags in place.

## Catalog data

`data/prices.json`, `data/aliases.json`, and `deprecations.json` are generated. Change `data/overrides.json` or `scripts/normalize-litellm.mjs`, then run `node scripts/refresh-prices.mjs`.

Only ship data with a license that allows redistribution. LiteLLM's model price file outside `enterprise/` is MIT (Copyright (c) 2023 Berri AI). Do not fetch or vendor [sdeep27/llm-pricing-api](https://github.com/sdeep27/llm-pricing-api); it has no license. Details are in [data/NOTICE.md](data/NOTICE.md).

## Pull requests

- Keep the action read-only. It must not commit, push, or run scanned code.
- Workflow permissions stay at `contents: read` unless a job posts a comment (`pull-requests: write`) or an issue (`issues: write`). Pin third-party actions by commit SHA.
- New network calls need an entry in [PRIVACY.md](PRIVACY.md). The default action path stays offline.
- Price findings stay advisory. Comment text should say possible drift and ask the user to verify.
- Keep the disclaimer in the report footer, the README, and the landing page in sync with `DISCLAIMER` in `action/src/report.ts`.

## Maintainer refresh token

`PRICES_TOKEN`, if you add one, should be a fine-grained token for this repository with contents write and pull requests write. It should not be a classic personal access token with access to other repositories.
