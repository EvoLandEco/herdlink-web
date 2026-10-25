import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const functions = ["resolveAssetUrl", "fetchAsset"].map((name) =>
  source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"))[0]).join("\n");

function runtime(fetch) {
  const context = vm.createContext({
    URL, fetch, assetCache: new Map(),
    window: {
      location: { href: "https://example.org/herdlink/" },
      HERDLINK_ASSET_URLS: { "assets/map.geojson": "/herdlink/assets/map-1234.geojson" },
    },
  });
  vm.runInContext(functions, context);
  return context;
}

test("simultaneous asset requests share downloading and parsing through completion", async () => {
  let requests = 0, parses = 0, finishDownload, finishParse;
  const app = runtime(() => {
    requests++;
    return new Promise((resolve) => { finishDownload = resolve; });
  });
  const first = app.fetchAsset("assets/map.geojson");
  assert.equal(app.fetchAsset("./assets/map.geojson"), first);
  assert.equal(requests, 1);
  finishDownload({ ok: true, json: () => {
    parses++;
    return new Promise((resolve) => { finishParse = resolve; });
  } });
  await Promise.resolve();
  assert.equal(app.fetchAsset("/assets/map.geojson"), first);
  assert.equal(parses, 1);
  const data = { features: [] };
  finishParse(data);
  assert.equal(await first, data);
  assert.equal(app.fetchAsset("assets/map.geojson"), first);
  assert.equal(requests, 1);
  assert.equal(parses, 1);
});

test("asset payload types and empty payloads retain their separate cached values", async () => {
  const calls = [];
  const app = runtime(async (url) => ({ ok: true,
    json: async () => { calls.push([url, "json"]); return null; },
    text: async () => { calls.push([url, "text"]); return ""; },
    blob: async () => { calls.push([url, "blob"]); return new Blob(); },
  }));
  const url = "https://tiles.example.org/map";
  for (const type of ["json", "text", "blob"]) {
    const first = app.fetchAsset(url, type);
    await first;
    assert.equal(app.fetchAsset(url, type), first);
  }
  assert.deepEqual(calls, ["json", "text", "blob"].map((type) => [url, type]));
  assert.throws(() => app.fetchAsset(url, "xml"), /Unsupported asset type/);
});

for (const failure of ["network", "status", "parse"]) {
  test(`failed ${failure} requests release the cache and allow a shared retry`, async () => {
    let attempts = 0;
    const error = new Error("Request failed");
    const data = { features: [] };
    const app = runtime(async () => {
      attempts++;
      if (attempts === 1 && failure === "network") throw error;
      return { ok: attempts !== 1 || failure !== "status", json: async () => {
        if (attempts === 1 && failure === "parse") throw error;
        return data;
      } };
    });
    const first = app.fetchAsset("assets/map.geojson");
    const concurrent = app.fetchAsset("assets/map.geojson");
    assert.equal(first, concurrent);
    await assert.rejects(first, failure === "status" ? /Failed to load/ : error);
    const retry = app.fetchAsset("assets/map.geojson");
    assert.equal(app.fetchAsset("assets/map.geojson"), retry);
    assert.equal(await retry, data);
    assert.equal(attempts, 2);
  });
}
