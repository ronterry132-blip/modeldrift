export function badgeSvg(status, count) {
  const drift = status === "drift";
  const ok = status === "ok";
  const right = drift ? (count ? `${count} drift` : "drift") : ok ? "no drift" : "price check";
  const color = drift ? "#9f1239" : ok ? "#3f6212" : "#e85d04";
  const rightWidth = Math.max(76, right.length * 7 + 16);
  const leftWidth = 92;
  const width = leftWidth + rightWidth;
  const label = `ModelDrift: ${right}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(label)}">
  <title>${escapeXml(label)}</title>
  <clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#1c1915"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${color}"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="${leftWidth / 2}" y="14">ModelDrift</text>
    <text x="${leftWidth + rightWidth / 2}" y="14">${escapeXml(right)}</text>
  </g>
</svg>`;
}

function escapeXml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
