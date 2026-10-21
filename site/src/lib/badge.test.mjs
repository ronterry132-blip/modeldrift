import assert from "node:assert/strict";
import test from "node:test";
import { badgeSvg } from "./badge.js";

test("badge labels", () => {
  assert.match(badgeSvg(null, null), /price check/);
  assert.match(badgeSvg("drift", "3"), /3 drift/);
  assert.match(badgeSvg("ok", null), /no drift/);
  assert.match(badgeSvg("drift", "3"), /#9f1239/);
  assert.match(badgeSvg("ok", null), /#3f6212/);
});

test("badge text is escaped", () => {
  const svg = badgeSvg("drift", '<script>');
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;script&gt; drift/);
});
