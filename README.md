# ModelDrift

[![ModelDrift](./site/static-badge.svg)](./site/static-badge.svg)

GitHub Action that finds hard-coded LLM model names and per-token prices, then reports drift against a public catalog.

## Install

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
- uses: ronterry132-blip/modeldrift@v1
```

Pull requests get an advisory comment. The workflow needs `contents: read` and `pull-requests: write`. It does not need `contents: write`. Set `fail-on-drift: true` to fail the job. Checkout should not leave git credentials behind.

```yaml
permissions:
  contents: read
  pull-requests: write
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ronterry132-blip/modeldrift@v1
        with:
          fail-on-drift: true
```

On a weekly schedule, open or update one issue. That workflow needs `issues: write` instead of `pull-requests: write`.

```yaml
on:
  schedule:
    - cron: "0 9 * * 1"
permissions:
  contents: read
  issues: write
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: ronterry132-blip/modeldrift@v1
        with:
          mode: issue
```

`mode: auto` comments on `pull_request` and opens an issue for `schedule` events. `mode: report` only writes the job summary and a JSON report. Do not run ModelDrift on `pull_request_target`. That event checks out untrusted code with the base repository token, and the action refuses it. See [SECURITY.md](SECURITY.md).

By default the action reads the catalog shipped in this repository and makes no network call. [PRIVACY.md](PRIVACY.md) lists every case where data leaves the runner.

## What counts as drift

| Finding | Meaning |
| --- | --- |
| Possible price change | Input or output USD per 1M tokens differs by more than the tolerance (default 1%). Please verify. |
| Possibly deprecated / retired | The catalog has a sunset date, or `data/overrides.json` pins a model upstream dropped. Please verify. |
| Unrecognized model | The literal looks like a model id and is not in the catalog or `aliases.json`. Please verify. |

Rates are recognized as per token, per 1K, or per 1M from the key (`input_cost_per_token`, `inputPerMillion`, `input_per_1k`) or from a nearby comment such as `USD per 1M tokens`. Unlabeled numbers below `0.001` are treated as per token.

Optional `.modeldrift.yml`:

```yaml
ignore:
  - vendor/**
tolerance: 0.01
```

To use a deployed catalog instead of the file shipped with the action:

```yaml
- uses: ronterry132-blip/modeldrift@v1
  with:
    prices-url: https://YOUR-WORKER.workers.dev/prices
```

## Layout

- `action/` TypeScript action. Root `action.yml` is what Marketplace reads. `action/dist` is the committed build.
- `data/` generated `prices.json`, `aliases.json`, `deprecations.json`, plus `overrides.json`. See `data/NOTICE.md` for licenses.
- `worker/` Cloudflare Worker: `GET /prices`, `/aliases`, `/deprecations`, daily KV refresh. Not deployed.
- `site/` Astro page for Cloudflare Pages, including `/badge.svg`. Umami is off until env vars are set.
- `examples/` stale Python, TypeScript, YAML, and JSON tables. The self-test workflow scans them.
- `.github/workflows/` tests, dist check, self-test, CodeQL, daily price refresh, weekly issue, and tag release. Dependabot config is in `.github/dependabot.yml`.

The daily refresh pulls [LiteLLM's model price JSON](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json). That file is outside `enterprise/` and is MIT (Copyright (c) 2023 Berri AI). [sdeep27/llm-pricing-api](https://github.com/sdeep27/llm-pricing-api) has no license, so it is not fetched or redistributed.

The action never commits or pushes. The maintainer refresh workflow is the only workflow here that pushes, and only to a `data/price-refresh-*` branch.

Trust docs: [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [CONTRIBUTING.md](CONTRIBUTING.md). The [MIT license](LICENSE) includes a warranty disclaimer.

## Disclaimer

Price data comes from third-party sources, including LiteLLM's model_prices_and_context_window.json (MIT, Copyright (c) 2023 Berri AI; files under enterprise/ are not used). It may be inaccurate or out of date. It is informational only, not financial, legal, or purchasing advice, and is provided as-is without warranty. Verify rates against the provider's pricing page before you rely on them.

The same text is included in pull request and issue comments, and in the landing-page footer.

## Before launch

These need the repository owner. CI does not deploy anything or publish the Marketplace listing.

1. **Merge and tag.** Marketplace reads `action.yml` on the default branch. After merge, push `v1.0.0`. The release workflow checks `action/dist` and opens a GitHub Release. It does not click "Publish this action to the Marketplace".
2. **Marketplace.** Accept the GitHub Marketplace Developer Agreement, then publish the release as a free action. Branding is already `trending-down` / `orange`.
3. **Price worker.** From `worker/`: `npx wrangler kv namespace create CATALOG`, replace the placeholder id in `wrangler.toml`, `npx wrangler deploy`. The cron in that file refreshes KV from LiteLLM.
4. **Pages.** Create a Cloudflare Pages project with root `site`, build `npm run build`, output `dist`. Set `PUBLIC_UMAMI_WEBSITE_ID` only if you want Umami; leave it empty to keep the script off the page.
5. **Refresh pull requests.** The daily workflow can open a PR with `GITHUB_TOKEN`, but that token does not start new workflow runs. Add a `PRICES_TOKEN` secret if those PRs should run CI. Use a fine-grained token for this repository only, with contents write and pull-requests write, not a broad personal access token.
6. **Private vulnerability reporting.** Turn on GitHub private vulnerability reporting so [SECURITY.md](SECURITY.md) can receive reports. There is no bug bounty.
7. **Legal review.** Have counsel read the disclaimer, the MIT warranty clause, and the LiteLLM credit before you rely on them as a liability position. This repository is not a substitute for that review.
