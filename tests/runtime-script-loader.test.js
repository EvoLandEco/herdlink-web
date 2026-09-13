import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const loader = source.match(/^function loadRuntimeScript\([^]*?^}/m)[0];

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
