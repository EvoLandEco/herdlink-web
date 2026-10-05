import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { isPrivatePopulation } from "../src/runtime/simulation-population.js";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"))[0];

function runtime() {
  const nodes = new Map();
  let settingsIds = [];
  function element(tagName) {
    return {
      tagName, dataset: {}, value: "", textContent: "", hidden: false, disabled: false, open: false,
      children: [], listeners: new Map(), attributes: new Map(),
      setAttribute(name, value) { this.attributes.set(name, value); },
      getAttribute(name) { return this.attributes.get(name) ?? null; },
      addEventListener(type, callback) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(callback);
      },
      async dispatch(type, event = { target: this }) { for (const callback of this.listeners.get(type) || []) await callback(event); },
      contains(target) { return this === target || this.children.some((child) => child.contains(target)); },
      focus() { document.activeElement = this; },
      replaceChildren() { this.children = []; },
      removeAttribute(key) { delete this[key]; },
      appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); },
      querySelector(selector) { return nodes.get(selector === ".simulation-settings-error" ? "simulationSettingsError" : selector.slice(1)); },
      querySelectorAll(selector) {
        if (selector.startsWith(".simulation-control-grid input, .simulation-control-grid select")) return [...settingsIds, ...(selector.includes(".simulation-population") ? ["simulationPopulationImport", "simulationPopulationScenario", "simulationPopulationSynthetic"] : [])].map((id) => nodes.get(id));
        if (selector === "input, select") return [...nodes.values()].filter((node) => ["input", "select"].includes(node.tagName));
        return [];
      },
      setCustomValidity(value) { this.validationMessage = value; },
      set innerHTML(html) {
        this.html = html;
        for (const [, tag, attributes, id] of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
          const node = element(tag);
          node.id = id;
          node.hidden = /\bhidden\b/.test(attributes);
          node.value = attributes.match(/\bvalue="([^"]*)"/)?.[1] || "";
          nodes.set(id, node);
        }
        settingsIds = [...html.matchAll(/<div class="simulation-control-grid">([^]*?)<\/div>/g)]
          .flatMap(([, grid]) => [...grid.matchAll(/<(?:input|select)\b[^>]*id="([^"]+)"/g)].map((match) => match[1]));
      },
    };
  }
  nodes.set("col3", element("div"));
  const document = { ...element("document"), createElement: element, getElementById: (id) => nodes.get(id), querySelectorAll: () => [] };
  const calls = [];
  const context = vm.createContext({
    window: { herdlinkSimulation: { isPrivatePopulation } },
    simulationPopulation: null, simulationInventoryPackage: null, simulationInitializationConvention: "prevalence-shares",
    importSimulationPopulation: (value) => calls.push(["import", value]),
    useSyntheticSimulationPopulation: () => calls.push("synthetic"),
    document,
    simulationState: { status: "error" }, comparisonDataError: "Invalid numerical setting", simulationInitialStates: null,
    readSimulationSettings: () => { calls.push("read"); return {}; },
    scheduleSimulationRecompute: () => calls.push("recompute"),
    setModeSwitcherDisabled() {}, renderSimulationTimeline() {},
    getPresetSettings: () => ({ ready: true }),
  });
  vm.runInContext(["ensureSimulationControls", "syncSimulationPopulationControls", "bindSimulationUi", "setSimulationInputsDisabled", "handlesAppShortcut"].map(extract).join("\n"), context);
  const panel = context.ensureSimulationControls();
  context.bindSimulationUi();
  const error = nodes.get("simulationSettingsError");
  error.textContent = "Invalid numerical setting";
  return { context, nodes, panel, document, calls, settings: () => settingsIds.map((id) => nodes.get(id)) };
}

test("simulation settings views preserve edits without recomputing", async () => {
  const { context, nodes, panel, calls } = runtime();
  const layout = nodes.get("simulationSettingsLayout");
  const basic = nodes.get("simulationSettingsTab-basic");
  const more = nodes.get("simulationSettingsTab-additional");
  const basicPage = nodes.get("simulationSettings-basic");
  const morePage = nodes.get("simulationSettings-additional");
  const input = nodes.get("simulationSigma");
  assert.equal(layout.dataset.view, "basic");
  assert.equal(basic.getAttribute("aria-selected"), "true");
  assert.equal(basicPage.inert, false);
  assert.equal(morePage.inert, true);
  assert.equal(basic.tabIndex, 0);
  assert.equal(more.tabIndex, -1);
  await more.dispatch("click");
  input.value = "0.31";
  assert.equal(layout.dataset.view, "additional");
  assert.equal(basicPage.getAttribute("aria-hidden"), "true");
  assert.equal(morePage.getAttribute("aria-hidden"), "false");
  assert.equal(basicPage.inert, true);
  assert.equal(morePage.inert, false);
  await basic.dispatch("click");
  await more.dispatch("click");
  assert.equal(input.value, "0.31");
  assert.deepEqual(calls, []);
  assert.equal(context.ensureSimulationControls(), panel);
  assert.equal(more.listeners.get("click").length, 1);
  assert.equal(more.listeners.get("keydown").length, 1);
});

test("vertical settings tabs support arrow keys, Home and End", async () => {
  const { nodes, document, calls } = runtime();
  const basic = nodes.get("simulationSettingsTab-basic");
  const more = nodes.get("simulationSettingsTab-additional");
  for (const [tab, key, destination] of [
    [basic, "ArrowDown", more], [more, "ArrowUp", basic],
    [basic, "ArrowUp", more], [more, "ArrowDown", basic],
    [basic, "End", more], [more, "Home", basic],
  ]) {
    const event = { key, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    await tab.dispatch("keydown", event);
    assert.equal(document.activeElement, destination);
    assert.equal(destination.getAttribute("aria-selected"), "true");
    assert.equal(destination.tabIndex, 0);
    assert.equal(tab === destination ? 0 : -1, tab.tabIndex);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
  }
  const event = { key: "Tab", preventDefault() { this.prevented = true; } };
  await basic.dispatch("keydown", event);
  assert.equal(event.prevented, undefined);
  assert.deepEqual(calls, []);
});

test("population control uses a native file input and shows a scenario choice only for multiple vectors", async () => {
  const { context, nodes, panel, calls } = runtime();
  assert.doesNotMatch(panel.html, /simulation-literature|Literature profiles|Study evidence|Daily exploratory model/);
  assert.match(panel.html, /type="file" accept=".json,application\/json"/);
  assert.match(panel.html, /<label class="simulation-population-import" hidden>/);
  assert.equal(nodes.get("simulationPopulationScenario").hidden, true);
  assert.equal(nodes.get("simulationPopulationSynthetic").hidden, true);
  assert.equal(nodes.get("simulationPopulationControls").hidden, true);
  const fileInput = nodes.get("simulationPopulationImport");
  const value = { schemaVersion: 1, kind: "population-product", scenarios: [] };
  fileInput.files = [{ text: async () => JSON.stringify(value) }];
  fileInput.value = "local-file";
  await fileInput.dispatch("change");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["import", value]]);
  assert.equal(fileInput.value, "");
  context.simulationPopulation = { kind: "fixed-animal-inventory", scenarioId: "second", reference: { accessClass: "private" } };
  context.simulationInventoryPackage = { scenarios: [{ id: "first" }, { id: "second" }] };
  context.syncSimulationPopulationControls();
  assert.equal(nodes.get("simulationPopulationControls").hidden, false);
  assert.equal(nodes.get("simulationPopulationLabel").textContent, "Inventory reference · memory only");
  assert.equal(nodes.get("simulationPopulationScenario").hidden, false);
  assert.equal(nodes.get("simulationPopulationScenario").value, "second");
  assert.equal(nodes.get("simulationPopulationSynthetic").hidden, false);
  assert.deepEqual(nodes.get("simulationPopulationScenario").children.map((item) => item.textContent), ["first", "second"]);
  context.simulationInventoryPackage.scenarios.pop();
  context.syncSimulationPopulationControls();
  assert.equal(nodes.get("simulationPopulationScenario").hidden, true);
  await nodes.get("simulationPopulationSynthetic").dispatch("click");
  assert.equal(calls.at(-1), "synthetic");
  context.bindSimulationUi();
  assert.equal(fileInput.listeners.get("change").length, 1);
});

test("population imports and numerical edits obey the same operation lock", async () => {
  const { context, nodes, calls, settings } = runtime();
  context.setSimulationInputsDisabled(true);
  assert.ok(settings().every((input) => input.disabled));
  for (const id of ["simulationPopulationImport", "simulationPopulationScenario", "simulationPopulationSynthetic"]) assert.equal(nodes.get(id).disabled, true);
  context.setSimulationInputsDisabled(false);
  assert.ok(settings().every((input) => !input.disabled));
  await nodes.get("simulationBeta").dispatch("change");
  assert.deepEqual(calls, ["read", "recompute"]);
  await nodes.get("simulationSigma").dispatch("change");
  assert.deepEqual(calls, ["read", "recompute", "read", "recompute"]);
  const fileInput = nodes.get("simulationPopulationImport");
  fileInput.files = [{ text: async () => "not-json" }];
  await fileInput.dispatch("change");
  assert.equal(calls.length, 4);
  assert.ok(nodes.get("simulationSettingsError").textContent);
});
