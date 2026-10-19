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

function chartRuntime() {
  const nodes = [{ id: "CR35" }, { id: "CR10" }];
  const focused = [];
  const context = vm.createContext({
    allNodes: nodes, selectedNodeData: null, window: {}, simulationState: { status: "ready" },
    getStatnaam: (id) => ({ CR35: "Noordoost-Noord-Brabant", CR10: "Noord-Overijssel" })[id],
    formatCount: (value) => value.toLocaleString("en-US"),
    onClickNode(event, node) {
      assert.equal(event.defaultPrevented, false);
      focused.push(node);
      context.selectedNodeData = node;
    },
    document: { getElementById: () => ({ focus() {} }) },
  });
  vm.runInContext(["focusChartRegion", "bindChartRegionFocus", "getDistanceTradeFocusId", "getChartTooltipText", "bindChartTooltip", "getDistanceTradeTipData", "bindDistanceTradePoints"].map(extract).join("\n"), context);
  return { context, nodes, focused };
}

test("chart focus resolves the current network node and respects pending updates", () => {
  const { context, nodes, focused } = chartRuntime();
  const event = { defaultPrevented: false, type: "click" };
  for (const flag of ["isSwitchingCSV", "isSwitchingAppMode", "isDoingTemporalUpdate"]) {
    context.window[flag] = true;
    context.focusChartRegion(event, "CR35");
    context.window[flag] = false;
  }
  context.simulationState.status = "running";
  context.focusChartRegion(event, "CR35");
  context.simulationState.status = "ready";
  context.focusChartRegion({ ...event, defaultPrevented: true }, "CR35");
  context.focusChartRegion(event, "missing");
  assert.equal(focused.length, 0);
  context.focusChartRegion(event, "CR35");
  context.focusChartRegion(event, "CR35");
  context.focusChartRegion(event, "CR10");
  assert.deepEqual(focused, nodes);
});

test("distance bubbles focus the source globally and the partner from either direction in focus mode", () => {
  const { context, nodes, focused } = chartRuntime();
  const point = { sourceId: "CR35", targetId: "CR10", weight: 12345, distance: 86.52 };
  const handlers = {}, attributes = {};
  const selection = {
    call(fn, ...args) { fn(this, ...args); return this; },
    classed() { return this; },
    attr(name, value) { attributes[name] = typeof value === "function" ? value(point) : value; return this; },
    on(name, value) { handlers[name] = value; return this; },
  };
  const event = (type, key) => ({
    type, key, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; },
  });
  context.bindDistanceTradePoints(selection);
  assert.equal(attributes.role, "button");
  assert.equal(attributes.tabindex, 0);
  assert.equal(attributes["data-focus-region"], "CR35");
  assert.equal(attributes["data-tip-kind"], "chart");
  assert.deepEqual(JSON.parse(attributes["data-tip-card"]), {
    regions: [
      { id: "CR35", name: "Noordoost-Noord-Brabant", direction: "outgoing" },
      { id: "CR10", name: "Noord-Overijssel", direction: "incoming" },
    ],
    value: "12,345", unit: "animals", detail: "86.5 km", focus: "CR35",
  });
  assert.equal(attributes["data-tip"], "CR35 · Noordoost-Noord-Brabant\n→ CR10 · Noord-Overijssel\n12,345 animals · 86.5 km\nClick to focus CR35");
  handlers["click.region-focus"](event("click"), point);
  assert.equal(focused.at(-1), nodes[0]);

  point.type = "outgoing";
  context.bindDistanceTradePoints(selection);
  assert.equal(attributes["data-focus-region"], "CR10");
  assert.equal(JSON.parse(attributes["data-tip-card"]).focus, "CR10");
  assert.match(attributes["data-tip"], /Click to focus CR10$/);
  const enter = event("keydown", "Enter");
  handlers["keydown.region-focus"](enter, point);
  assert.equal(focused.at(-1), nodes[1]);
  assert.ok(enter.defaultPrevented && enter.stopped);

  point.type = "incoming";
  context.bindDistanceTradePoints(selection);
  assert.equal(attributes["data-focus-region"], "CR35");
  const space = event("keydown", " ");
  handlers["keydown.region-focus"](space, point);
  assert.equal(focused.at(-1), nodes[0]);
  assert.ok(space.defaultPrevented && space.stopped);
  assert.equal(focused.length, 3);
  const arrow = event("keydown", "ArrowRight");
  handlers["keydown.region-focus"](arrow, point);
  assert.equal(arrow.defaultPrevented, false);
  point.type = "outgoing";
  handlers["keydown.region-focus"]({ ...event("keydown", "Enter"), repeat: true }, point);
  assert.equal(focused.length, 3);

  point.weight = 17;
  context.bindDistanceTradePoints(selection);
  assert.match(attributes["data-tip"], /17 animals/);
  assert.doesNotMatch(attributes["data-tip"], /12,345/);
});

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
      assert.equal(selector, ".nodeGroup, .nodeLabel");
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
    selectedNodeData: { id: "CR35" }, window: {},
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


test("compact route cards preserve names as text and mark the destination of a focus click", () => {
  const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const match = appSource.match(/^function createChartTooltipContent\([^]*?^}/m);
  const document = {
    createElement(tag) {
      return { tag, children: [], append(child) { this.children.push(child); } };
    },
  };
  const context = vm.createContext({ document });
  vm.runInContext(match[0], context);
  const card = context.createChartTooltipContent({
    regions: [
      { id: "CR35", name: "<img onerror=alert(1)>", direction: "outgoing" },
      { id: "CR10", name: "Noord-Overijssel", direction: "incoming" },
    ],
    value: "12,345", unit: "animals", detail: "86.5 km", focus: "CR10",
  });
  assert.equal(card.children.length, 3);
  assert.equal(card.children[0].children[0].textContent, "CR35");
  assert.equal(card.children[1].children[0].textContent, "CR10 ↗");
  assert.equal(card.children[0].children[1].textContent, "<img onerror=alert(1)>");
  assert.equal(card.children[0].children[1].children.length, 0);
  assert.deepEqual(Array.from(card.children[2].children, (child) => child.textContent), ["12,345", "animals", "86.5 km"]);
  for (const [value, unit] of [["17.5", "new infection entries"], ["1.25%", "infectious"], ["—", "No population denominator"]]) {
    const region = context.createChartTooltipContent({
      regions: [{ id: "CR35", name: "Noordoost-Noord-Brabant", direction: "region" }], value, unit, focus: "CR35",
    });
    assert.equal(region.children.length, 2);
    assert.equal(region.children[0].children[0].textContent, "CR35 ↗");
    assert.deepEqual(Array.from(region.children[1].children, (child) => child.textContent), [value, unit]);
  }
});


test("spatial tooltip text retains model units and keeps flow cards free of focus actions", () => {
  const { context } = chartRuntime();
  const region = { id: "CR35", name: "Noordoost-Noord-Brabant", direction: "region" };
  assert.equal(context.getChartTooltipText({ regions: [region], value: "17.5", unit: "new infection entries", focus: "CR35" }),
    "CR35 · Noordoost-Noord-Brabant\n17.5 new infection entries\nClick to focus CR35");
  assert.equal(context.getChartTooltipText({ regions: [region], value: "—", unit: "No population denominator", focus: "CR35" }),
    "CR35 · Noordoost-Noord-Brabant\n— No population denominator\nClick to focus CR35");
  assert.equal(context.getChartTooltipText({ regions: [region, { id: "CR10", name: "Noord-Overijssel" }], value: "2.75", unit: "attributed infection entries" }),
    "CR35 · Noordoost-Noord-Brabant\n→ CR10 · Noord-Overijssel\n2.75 attributed infection entries");
});
