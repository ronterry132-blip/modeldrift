# Price worker

Cloudflare Worker that serves the ModelDrift catalog from KV and refreshes it on a daily cron. Nothing here is deployed until you run Wrangler against your own account.

```bash
cd worker
npm ci
npx wrangler kv namespace create CATALOG
# Put the printed id in wrangler.toml, replacing the placeholder.
npx wrangler deploy
```

Routes:

- `GET /prices`
- `GET /aliases`
- `GET /deprecations`
- `GET /health`

The cron trigger in `wrangler.toml` fetches LiteLLM's MIT price file, applies `data/overrides.json` (or `OVERRIDES_URL`), and writes KV. `LITELLM_PRICES_URL` and `OVERRIDES_URL` must be public `https` URLs with no credentials and no query string. Private and metadata hosts are rejected, and the URL is not logged. Point the GitHub Action at the worker with `prices-url: https://<your-worker>/prices`.

Wrangler metrics are off: `send_metrics = false` in `wrangler.toml`, and `WRANGLER_SEND_METRICS=false` on the npm scripts.
