import { badgeSvg } from "../src/lib/badge.js";

export function onRequest(context) {
  const url = new URL(context.request.url);
  const svg = badgeSvg(url.searchParams.get("status"), url.searchParams.get("count"));
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
    },
  });
}
