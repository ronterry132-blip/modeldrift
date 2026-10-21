import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { assertPublicHttps, loadCatalog, siblingUrl } from "../src/catalog.js";
import { commentAction } from "../src/github.js";
import { REPORT_MARKER } from "../src/report.js";

const root = path.resolve(import.meta.dirname, "../..");

describe("catalog urls", () => {
  it("requires public https URLs", () => {
    expect(assertPublicHttps("https://prices.example.com/prices").hostname).toBe("prices.example.com");
    expect(() => assertPublicHttps("http://example.com/prices")).toThrow(/https/);
    expect(() => assertPublicHttps("https://localhost/prices")).toThrow(/not allowed/);
    expect(() => assertPublicHttps("https://169.254.169.254/prices")).toThrow(/not allowed/);
    expect(() => assertPublicHttps("https://10.1.2.3/prices")).toThrow(/not allowed/);
    expect(() => assertPublicHttps("https://192.168.0.5/prices")).toThrow(/not allowed/);
    expect(() => assertPublicHttps("https://[::1]/prices")).toThrow(/not allowed/);
    expect(() => assertPublicHttps("https://user:pass@example.com/prices")).toThrow(/credentials/);
    expect(() => assertPublicHttps("https://example.com/prices?token=1")).toThrow(/query/);
  });

  it("derives sibling catalog URLs", () => {
    expect(siblingUrl("https://prices.example.com/prices", "deprecations")).toBe("https://prices.example.com/deprecations");
    expect(siblingUrl("https://example.com/data/prices.json", "aliases.json")).toBe("https://example.com/data/aliases.json");
  });
});

describe("shipped catalog", () => {
  it("is MIT LiteLLM data with aliases and the pinned retirement", () => {
    const prices = JSON.parse(readFileSync(path.join(root, "data/prices.json"), "utf8"));
    const aliases = JSON.parse(readFileSync(path.join(root, "data/aliases.json"), "utf8"));
    const deprecations = JSON.parse(readFileSync(path.join(root, "data/deprecations.json"), "utf8"));
    expect(prices.license).toBe("MIT");
    expect(prices.source).toBe("litellm");
    expect(prices.sourceUrl).toContain("BerriAI/litellm");
    expect(prices.models["gpt-4o"].inputPerMillion).toBeGreaterThan(0);
    expect(aliases.aliases["openai/gpt-4o"]).toBe("gpt-4o");
    expect(deprecations.models["gpt-4-0314"]).toMatchObject({ status: "retired", replacement: "gpt-4o" });
    const catalog = loadCatalog(prices, aliases, deprecations);
    expect(catalog.resolve("openai/gpt-4o")?.id).toBe("gpt-4o");
    expect(catalog.resolve("GPT-4o")?.id).toBe("gpt-4o");
  });
});

describe("action metadata", () => {
  it("keeps the Marketplace root action and the action/ copy in sync", () => {
    const rootMeta = parse(readFileSync(path.join(root, "action.yml"), "utf8")) as Record<string, any>;
    const nested = parse(readFileSync(path.join(root, "action/action.yml"), "utf8")) as Record<string, any>;
    expect(rootMeta.name).toBe("ModelDrift");
    expect(rootMeta.description.length).toBeLessThanOrEqual(125);
    expect(rootMeta.branding).toEqual({ icon: "trending-down", color: "orange" });
    expect(rootMeta.runs).toEqual({ using: "node20", main: "action/dist/index.js" });
    expect(nested.runs).toEqual({ using: "node20", main: "dist/index.js" });
    expect(nested.name).toBe(rootMeta.name);
    expect(nested.description).toBe(rootMeta.description);
    expect(nested.branding).toEqual(rootMeta.branding);
    expect(Object.keys(nested.inputs)).toEqual(Object.keys(rootMeta.inputs));
    expect(Object.keys(nested.outputs)).toEqual(Object.keys(rootMeta.outputs));
  });
});

describe("pull request comments", () => {
  it("updates an existing ModelDrift comment", () => {
    expect(commentAction([{ id: 1, body: "hello" }, { id: 7, body: `${REPORT_MARKER}\nold` }])).toEqual({ type: "update", id: 7 });
    expect(commentAction([{ id: 1, body: "hello" }])).toEqual({ type: "create" });
  });
});
