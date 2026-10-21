# Privacy

ModelDrift does not phone home to the maintainers. Telemetry is off unless you turn a specific integration on. This page lists every place data can leave a machine.

## GitHub Action (default)

With the published defaults:

- The action reads the catalog from `data/` on disk. It does not call the network for prices.
- It reads text files in the repository you checked out. It does not send file contents anywhere.
- It writes a JSON report under the workspace or `RUNNER_TEMP`. That file stays on the runner.
- It writes the same report to the Actions job summary, which GitHub stores as part of the workflow run.
- It does not read Actions secrets, and it does not log the `github-token` value.

No model names, prices, paths, or repository contents are sent to ModelDrift maintainers.

## GitHub Action (optional network)

These are off until a workflow sets them.

| Input or mode | Where data goes | What is sent |
| --- | --- | --- |
| `prices-url`, `aliases-url`, `deprecations-url` | The `https` URL you set. Default is empty, so this does not run. | A `GET` with `user-agent: modeldrift` and `accept: application/json`. No credentials, no query string, no repository contents. |
| `mode: comment` or `mode: auto` on `pull_request` | `api.github.com`, or `GITHUB_API_URL` if your host sets it, using `github-token`. | The markdown report: model ids, file paths, line numbers, hard-coded and catalog rates, and the disclaimer. Not full file contents. Not secrets. |
| `mode: issue` or `mode: auto` on `schedule` | Same GitHub API. | The same markdown, as an issue body. |

`mode: report` (the self-test uses this) does not call the GitHub API.

## Maintainer catalog refresh

`.github/workflows/refresh-prices.yml` runs in this repository only. It fetches:

- `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`
- `https://api.github.com/repos/BerriAI/litellm/commits?path=model_prices_and_context_window.json&per_page=1` to record the upstream commit

It does not send your repository's source anywhere. It is not part of the action users run.

## Cloudflare Worker

The worker is not deployed by this repository. If you deploy `worker/` yourself, its cron fetches the LiteLLM URL above (or `LITELLM_PRICES_URL` if you set one) and an optional `OVERRIDES_URL`. Both must be public `https` with no credentials and no query string. Responses are stored in your KV namespace. `GET /prices`, `/aliases`, `/deprecations`, and `/health` return that catalog. Wrangler metrics are disabled in `wrangler.toml` (`send_metrics = false`) and by `WRANGLER_SEND_METRICS=false` on the npm scripts.

## Landing page

The Astro site is static.

- It sets no cookies.
- It loads no third-party script unless you set `PUBLIC_UMAMI_WEBSITE_ID`.
- Astro's own telemetry is disabled in the npm scripts (`ASTRO_TELEMETRY_DISABLED=1`).
- If you set the Umami id, the page loads the script URL in `PUBLIC_UMAMI_SRC` (default `https://cloud.umami.is/script.js`). Only `https` URLs are accepted. Umami is a third party. Its script may set its own cookies and receive the page URL. Leave the id empty to keep the page free of that request.
- The badge at `/badge.svg` is an SVG generated from query parameters you choose (`status`, `count`). It does not record visitors.

## Price data

Catalog rows are facts about public model prices, transformed from LiteLLM. They are not information about the person running the action. See `data/NOTICE.md` for the license, and the disclaimer in `README.md` for accuracy limits.
