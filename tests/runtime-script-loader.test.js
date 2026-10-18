import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const loader = source.match(/^function loadRuntimeScript\([^]*?^}/m)[0];
const flowLoader = source.match(/^function loadPooledFlows\([^]*?^}/m)[0];

test("built-in flows share a request and publish only validated data", async () => {
  let requests = 0, respond;
  const context = vm.createContext({
    pooledFlowsLoader: null,
    assetUrls: { "assets/data/international_flows.json": "/assets/flows.json" },
    window: {}, flowMetrics: () => {},
    fetch(url) {
      assert.equal(url, "/assets/flows.json");
      requests += 1;
      return new Promise((resolve) => { respond = resolve; });
    },
    createPooledFlows(data) {
      if (!data.valid) throw new Error("Invalid calendar");
      return { calendars: data.calendars };
    },
  });
  vm.runInContext(flowLoader, context);
  const failed = context.loadPooledFlows();
  assert.equal(context.loadPooledFlows(), failed);
  respond({ ok: false, status: 404 });
  await assert.rejects(failed, /404/);
  assert.equal(context.window.herdlinkPooledFlows, undefined);

  const invalid = context.loadPooledFlows();
  respond({ ok: true, json: async () => ({ valid: false }) });
  await assert.rejects(invalid, /Invalid calendar/);
  assert.equal(context.window.herdlinkPooledFlows, undefined);

  const loaded = context.loadPooledFlows();
  respond({ ok: true, json: async () => ({ valid: true, calendars: "ready" }) });
  await loaded;
  assert.equal(context.window.herdlinkPooledFlows.calendars, "ready");
  assert.equal(context.window.herdlinkPooledFlows.flowMetrics, context.flowMetrics);
  await context.loadPooledFlows();
  assert.equal(requests, 3);
});

test("runtime waits for both built-in flows and scripts and respects cancelled mounts", async () => {
  const start = source.indexOf("  useEffect(() => {\n    if (!hasSupportedScreen || runtimeReady.current)");
  const end = source.indexOf("  }, [hasSupportedScreen]);", start) + "  }, [hasSupportedScreen]);".length;
  const effect = source.slice(start, end);
  for (const cancel of [false, true]) {
    const calls = [];
    let readyFlows, readyScript, cleanup;
    const flows = new Promise((resolve) => { readyFlows = resolve; });
    const script = new Promise((resolve) => { readyScript = resolve; });
    const context = vm.createContext({
      hasSupportedScreen: true, runtimeReady: { current: false }, Event,
      useEffect(fn) { cleanup = fn(); },
      loadPooledFlows: () => flows,
      runtimeScripts: [{ src: "/dependency.js" }], herdLinkRuntimeUrl: "/runtime.js",
      loadRuntimeScript({ src }) { calls.push(src); return src === "/dependency.js" ? script : Promise.resolve(); },
      window: {
        requestAnimationFrame(fn) { fn(); return 1; },
        cancelAnimationFrame() {},
        dispatchEvent(event) { calls.push(event.type); },
      },
      console: { error(error) { assert.fail(error); } },
    });
    vm.runInContext(effect, context);
    await new Promise(setImmediate);
    assert.deepEqual(calls, ["/dependency.js"]);
    readyScript();
    await new Promise(setImmediate);
    assert.deepEqual(calls, ["/dependency.js"]);
    if (cancel) cleanup();
    readyFlows();
    await new Promise(setImmediate);
    assert.deepEqual(calls, cancel ? ["/dependency.js"] : ["/dependency.js", "/runtime.js", "herdlink:mount"]);
    assert.equal(context.runtimeReady.current, !cancel);
  }
});

test("a failed runtime request can retry with a fresh script while concurrent callers share one request", async () => {
  const scripts = [];
  const context = vm.createContext({
    scriptLoaders: new Map(),
    document: {
      querySelector() { return scripts[0] || null; },
      createElement() {
        const script = new EventTarget();
        script.dataset = {};
        script.remove = () => scripts.splice(scripts.indexOf(script), 1);
        return script;
      },
      head: { appendChild(script) { scripts.push(script); } },
    },
  });
  vm.runInContext(loader, context);
  const options = { src: "/runtime.js" };
  const failed = context.loadRuntimeScript(options);
  assert.equal(context.loadRuntimeScript(options), failed);
  const failure = assert.rejects(failed, /Failed to load/);
  const failedScript = scripts[0];
  failedScript.dispatchEvent(new Event("error"));
  await failure;
  assert.equal(scripts.length, 0);
  assert.equal(context.scriptLoaders.size, 0);

  const retry = context.loadRuntimeScript(options);
  assert.equal(scripts.length, 1);
  const loadedScript = scripts[0];
  assert.notEqual(loadedScript, failedScript);
  loadedScript.dispatchEvent(new Event("load"));
  assert.equal(await retry, loadedScript);
  assert.equal(loadedScript.dataset.loaded, "true");
  assert.equal(await context.loadRuntimeScript(options), loadedScript);
  assert.equal(scripts.length, 1);
  loadedScript.dispatchEvent(new Event("error"));
  assert.equal(scripts.length, 1);
});
