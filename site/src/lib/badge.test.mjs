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
  const svg = badgeSvg("drift", "<script>");
  assert.equal(svg.includes("<script>"), false);
  assert.equal(svg.includes("<SCRIPT>"), false);
  assert.equal(svg.includes("&lt;script&gt; drift"), true);
});
