import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");

function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function runtime() {
  const selection = new Proxy({}, { get: () => () => selection });
  const forceState = { running: true, target: 0.3, alpha: 0.2, starts: 0 };
  const forceSim = {
    alphaTarget(value) { forceState.target = value; return this; },
    alpha(value) { forceState.alpha = value; return this; },
    stop() { forceState.running = false; return this; },
    restart() { forceState.running = true; forceState.starts += 1; return this; },
    nodes() { return this; },
    force() { return { links() {} }; },
  };
  const context = vm.createContext({
    forceSim, forceState, currentMode: "map", window: { isPlaying: false },
    selectedNodeData: null, hoveredNode: null, hoveredLink: null,
    allNodes: [], allLinks: [], nonZeroLinks: [], nlMapData: {}, nlLabelPoints: null,
    linkGroup: selection, linkSelection: selection, nodeGroup: selection, svg: selection,
    nodeEnter: selection, labelSelection: selection,
    nodeSize: { domain() {} }, nodeColor: { domain() {} },
    hotspotLabelDy: 0, w: 800, h: 600, theme: {}, isSwitchingCSV: false,
    hotspots: {}, getHotspotRankings: () => ({}),
    document: { getElementById: () => ({ click() {} }) },
    console: { error() {} }, mapLayers: { mount() {}, unmount() {} },
    d3: { select: () => selection, extent: () => [0, 1] },
  });
  const projection = { reflectY() { return this; }, fitSize() { return this; } };
  context.d3.geoIdentity = () => projection;
  context.d3.geoPath = () => ({ projection: () => null });
  context.d3.drag = () => {
    const behavior = {
      filter(fn) { this.accepts = fn; return this; },
      on(name, fn) { this[name] = fn; return this; },
    };
    return behavior;
  };
  for (const name of [
    "clearHoveredLinkState", "handleLinkMouseEnter", "handleLinkMouseMove",
    "handleLinkMouseLeave", "debouncedOnClickNode", "updateMapPositionsWithTransition",
    "disableAllButtons", "disableAllCheckboxes", "enableAllButtons", "enableAllCheckboxes",
    "applySimulationMapPrevalence", "updateMapLayout",
  ]) context[name] = () => {};
  context.isSimulationModeActive = () => false;
  vm.runInContext([
    "updateTemporalNetwork", "drag", "switchToMapMode", "switchToGraphMode",
  ].map(extractFunction).join("\n"), context);
  return context;
}

test("date changes keep map physics stopped and let graph physics cool", () => {
  const context = runtime();
  context.updateTemporalNetwork();
  assert.equal(context.forceState.running, false);
  assert.equal(context.forceState.starts, 0);
  assert.equal(context.forceState.target, 0);

  context.currentMode = "graph";
  context.updateTemporalNetwork();
  assert.equal(context.forceState.running, true);
  assert.equal(context.forceState.starts, 1);
  assert.equal(context.forceState.alpha, 1);
  assert.equal(context.forceState.target, 0);

  context.currentMode = "map";
  context.updateTemporalNetwork();
  assert.equal(context.forceState.running, false);
  assert.equal(context.forceState.starts, 1);
});

test("view changes stop map physics and clear a held drag target", () => {
  const context = runtime();
  context.switchToMapMode(true);
  assert.equal(context.forceState.running, false);
  assert.equal(context.forceState.target, 0);

  context.forceState.target = 0.3;
  context.switchToGraphMode();
  assert.equal(context.forceState.running, true);
  assert.equal(context.forceState.target, 0);
});

test("only graph nodes accept normal drag gestures", () => {
  const context = runtime();
  const behavior = context.drag(context.forceSim);
  assert.equal(behavior.accepts({ button: 0 }), false);
  context.currentMode = "graph";
  assert.equal(behavior.accepts({ button: 0 }), true);
  assert.equal(behavior.accepts({ button: 0, ctrlKey: true }), false);
  assert.equal(behavior.accepts({ button: 2 }), false);
  const node = { x: 4, y: 5 };
  behavior.start({ active: 0 }, node);
  assert.equal(context.forceState.target, 0.3);
  behavior.end({ active: 0 }, node);
  assert.equal(context.forceState.target, 0);
  assert.equal(node.fx, null);
  assert.equal(node.fy, null);
});
