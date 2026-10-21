# Landing page

Astro site for Cloudflare Pages, plus a Pages Function for the badge.

- Root directory: `site`
- Build command: `npm run build`
- Output directory: `dist`
- `site/functions/badge.svg.js` serves `GET /badge.svg`. `?status=drift&count=3` and `?status=ok` change the label. Do not add `public/badge.svg`; a static file would hide the function.
- `static-badge.svg` is the image embedded in the repository README before Pages is deployed.
- Umami loads only when `PUBLIC_UMAMI_WEBSITE_ID` is set and `PUBLIC_UMAMI_SRC` is an `https` URL with no credentials. The default script is `https://cloud.umami.is/script.js`. Leave the id empty. The page then sets no cookies and loads no third-party script. See `.env.example`.
- `npm run dev`, `build`, and `preview` set `ASTRO_TELEMETRY_DISABLED=1`.

Local check of the function:

```bash
npx wrangler pages dev dist
```
