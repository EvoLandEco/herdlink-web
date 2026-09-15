import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const extract = (name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
};

function textElement() {
  let text = "";
  return {
    writes: 0,
    get textContent() { return text; },
    set textContent(value) { text = value; this.writes++; },
  };
}

function indicatorRuntime() {
  const nodes = [
    { id: "CR35", active: true, simulation: { prevalence: 0, incomingExposure: 0 } },
    { id: "CR10", active: false },
  ];
  const elements = {
    networkFocusIndicator: { hidden: true },
    networkFocusRegion: textElement(),
  };
  const focused = new Set();
  const context = vm.createContext({
    selectedNodeData: null,
    document: { getElementById: (id) => elements[id] },
    nodeGroup: { selectAll(selector) {
      assert.equal(selector, ".nodeGroup");
      return { classed(name, value) {
        assert.equal(name, "is-focused");
        nodes.forEach((node) => value(node) ? focused.add(node.id) : focused.delete(node.id));
      } };
    } },
  });
  vm.runInContext(extract("updateFocusIndicator"), context);
  return { context, nodes, elements, focused };
}

test("focus identifies the selected region and halo with zero exposure or an inactive node", () => {
  const { context, nodes, elements, focused } = indicatorRuntime();
  context.updateFocusIndicator();
  assert.equal(elements.networkFocusIndicator.hidden, true);
  assert.equal(focused.size, 0);

  context.selectedNodeData = nodes[0];
  context.updateFocusIndicator();
  assert.equal(elements.networkFocusIndicator.hidden, false);
  assert.equal(elements.networkFocusRegion.textContent, "Focus on CR35");
  assert.deepEqual([...focused], ["CR35"]);
  for (let index = 0; index < 10; index++) context.updateFocusIndicator();
  assert.equal(elements.networkFocusRegion.writes, 1);

  context.selectedNodeData = nodes[1];
  context.updateFocusIndicator();
  assert.equal(elements.networkFocusIndicator.hidden, false);
  assert.equal(elements.networkFocusRegion.textContent, "Focus on CR10");
  assert.deepEqual([...focused], ["CR10"]);

  context.selectedNodeData = null;
  context.updateFocusIndicator();
  assert.equal(elements.networkFocusIndicator.hidden, true);
  assert.equal(focused.size, 0);
  context.nodeGroup = null;
  assert.doesNotThrow(() => context.updateFocusIndicator());
});

function exitRuntime() {
  const calls = [];
  const listeners = {};
  const button = { addEventListener: (name, callback) => { listeners[name] = callback; } };
  const elements = {
    mainContainer: { closest: () => null },
    exitFocusButton: button,
    simulationModel: { focus: (options) => calls.push(["simulation focus", options.preventScroll]) },
    mainFigureSVG: { focus: (options) => calls.push(["network focus", options.preventScroll]) },
  };
  const context = vm.createContext({
    selectedNodeData: { id: "CR35" }, window: {}, screenshotInProgress: false,
    document: {
      getElementById: (id) => elements[id],
      addEventListener: (name, callback) => { listeners[name] = callback; },
    },
    isSimulationModeActive: () => true,
    clearSelection(flag) { calls.push(["clear", flag]); context.selectedNodeData = null; },
  });
  const wiring = source.slice(source.indexOf('document.getElementById("exitFocusButton").addEventListener'),
    source.indexOf('// Shortcut: press "r" to restore links.'));
  assert.match(wiring, /exitNodeFocus/);
  vm.runInContext([extract("handlesAppShortcut"), extract("exitNodeFocus"), wiring].join("\n"), context);
  return { context, calls, listeners, elements };
}

test("focus exit shares navigation guards and returns keyboard focus to the active mode's controls", () => {
  const { context, calls, listeners, elements } = exitRuntime();
  assert.equal(listeners.click, context.exitNodeFocus);
  for (const flag of ["isSwitchingCSV", "isSwitchingAppMode", "isDoingTemporalUpdate"]) {
    context.window[flag] = true;
    listeners.click();
    assert.equal(context.selectedNodeData.id, "CR35");
    assert.deepEqual(calls, []);
    context.window[flag] = false;
  }
  for (const simulation of [true, false]) {
    calls.length = 0;
    context.selectedNodeData = { id: "CR35" };
    context.isSimulationModeActive = () => simulation;
    listeners.click();
    assert.deepEqual(calls, [["clear", false], [simulation ? "simulation focus" : "network focus", true]]);
    context.exitNodeFocus();
    assert.equal(calls.length, 2);
  }
  calls.length = 0;
  context.selectedNodeData = { id: "CR35" };
  context.isSimulationModeActive = () => true;
  elements.simulationModel.disabled = true;
  listeners.click();
  assert.deepEqual(calls, [["clear", false], ["network focus", true]]);
});

test("Q exits from the canvas or focused buttons and respects typing, overlays and pending updates", () => {
  const { context, calls, listeners, elements } = exitRuntime();
  const send = (value, properties = {}) => {
    context.selectedNodeData = { id: "CR35" };
    calls.length = 0;
    const event = { key: value, target: { closest: () => null }, prevented: false,
      preventDefault() { this.prevented = true; }, ...properties };
    listeners.keydown(event);
    return event;
  };
  for (const value of ["q", "Q"]) {
    assert.equal(send(value).prevented, true);
    assert.deepEqual(calls, [["clear", false], ["simulation focus", true]]);
  }
  const button = { closest: (selector) => selector.startsWith("button,") ? {} : null };
  assert.equal(send("Q", { target: button }).prevented, true);
  assert.deepEqual(calls, [["clear", false], ["simulation focus", true]]);
  for (const flag of ["repeat", "isComposing", "defaultPrevented", "ctrlKey", "altKey", "metaKey"]) {
    assert.equal(send("q", { [flag]: true }).prevented, false, flag);
    assert.deepEqual(calls, []);
  }
  const typing = { closest: (selector) => selector.includes("textarea") ? {} : null };
  assert.equal(send("q", { target: typing }).prevented, false);
  assert.deepEqual(calls, []);
  for (const flag of ["isSwitchingCSV", "isSwitchingAppMode", "isDoingTemporalUpdate"]) {
    context.window[flag] = true;
    assert.equal(send("q").prevented, false, flag);
    assert.deepEqual(calls, []);
    context.window[flag] = false;
  }
  for (const flag of ["isComparisonOverlayOpen", "isIntroOverlayOpen"]) {
    context.window[flag] = () => true;
    assert.equal(send("q").prevented, false, flag);
    assert.deepEqual(calls, []);
    context.window[flag] = () => false;
  }
  elements.mainContainer.closest = () => ({});
  assert.equal(send("q").prevented, false);
  assert.deepEqual(calls, []);
});
