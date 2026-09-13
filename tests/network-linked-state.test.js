import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/assets/js/herdlink-runtime.js", import.meta.url), "utf8");

function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)(?:async )?function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function selection() {
  const result = new Proxy({}, { get: (_, name) => () => name === "node" ? null : result });
  return result;
}

test("ledger node colors follow the current partition after a same-date network edit", () => {
  const date = new Date("2020-01-01T00:00:00Z");
  const allNodes = [{ id: "CR35", community: 0 }, { id: "CR10", community: 0 }];
  const stats = { partition: { CR35: 1, CR10: 2 }, spectralRadius: 0.5 };
  const fills = new Map();
  const chain = selection();
  const scale = () => "risk-color";
  for (const name of ["domain", "range", "clamp"]) scale[name] = () => scale;
  const context = vm.createContext({
    allNodes, enabledLinks: [], selectedNodeData: null,
    window: {
      currentDate: date,
      allTemporalStats: { [date.toISOString()]: stats },
      allTemporalNodeStats: { [date.toISOString()]: {} },
    },
    isSimulationModeActive: () => false,
    restoreLedgerHotspotsMax() {}, computeSpectralRadius() { assert.fail("Cached frame statistics already include the spectral radius"); },
    ledgerBaselineSpectralRadius: 1, nodeColor: (community) => `partition-${community}`,
    theme: {}, document: { getElementById: () => ({
      style: {}, querySelector: () => ({ style: {} }),
    }) },
    getComputedStyle: () => ({ display: "block" }),
    d3: {
      select: () => chain, drag: () => chain, scaleLinear: () => scale,
      selectAll: (selector) => {
        assert.equal(selector, ".nodeGroup circle.primary");
        return { attr(name, value) {
          assert.equal(name, "fill");
          allNodes.forEach((node) => fills.set(node.id, value(node)));
          return this;
        } };
      },
    },
  });
  vm.runInContext(extractFunction("updateNetworkStats"), context);
  context.updateNetworkStats();
  assert.deepEqual(Array.from(fills.values()), ["partition-1", "partition-2"]);

  stats.partition = { CR35: 3, CR10: 3 };
  context.updateNetworkStats();
  assert.deepEqual(Array.from(fills.values()), ["partition-3", "partition-3"]);
});

test("radar axes remain finite when restrictions remove a metric across all dates", () => {
  const zeroMetrics = { inDegree: 0, outDegree: 0, betweenness: 0, pageRank: 0, eigenvector: 0 };
  const context = vm.createContext({
    isSimulationModeActive: () => false,
    hotspots: { CR35: { ...zeroMetrics } }, hotspotsMax: { ...zeroMetrics },
  });
  vm.runInContext(extractFunction("getRadarValuesForNode"), context);
  assert.deepEqual(Array.from(context.getRadarValuesForNode({ id: "CR35" })), [0, 0, 0, 0, 0]);

  context.hotspots.CR35.inDegree = 10;
  context.hotspotsMax.inDegree = 100;
  context.hotspots.CR35.pageRank = 0.25;
  context.hotspotsMax.pageRank = 0.5;
  const values = Array.from(context.getRadarValuesForNode({ id: "CR35" }));
  assert.ok(values.every(Number.isFinite));
  assert.equal(values[0], Math.log(11) / Math.log(101));
  assert.deepEqual(values.slice(1), [0, 0, 0.5, 0]);
});

test("annotations separate permitted local trades from imports and exports", () => {
  const node = { id: "CR35", statnaam: "Region", community: 1, x: 0, y: 0 };
  const allLinks = [
    { source: node, target: node, weight: 100, disabled: false },
    { source: node, target: "CR10", weight: 300, disabled: true },
    { source: "CR10", target: node, weight: 200, disabled: false },
  ];
  let label;
  const annotation = {
    type() { return this; }, notePadding() { return this; },
    annotations(items) { label = items[0].note.label; return this; },
  };
  const context = vm.createContext({
    currentMode: "graph", w: 800, h: 600, allNodes: [node], allLinks,
    selectedNodeData: node, theme: {}, nodeAnnoType: null,
    getAnnotationOffset: () => ({ dx: 0, dy: 0 }),
    isSimulationModeActive: () => false, drawRadarChart() {},
    d3: {
      sum: (items, value) => items.reduce((total, item) => total + value(item), 0),
      annotation: () => annotation,
    },
  });
  vm.runInContext(extractFunction("updateAnnotationForNode"), context);
  context.updateAnnotationForNode(node, selection());
  assert.match(label, /Incoming Trade: 200\nOutgoing Trade: 0\nLocal Trade: 100\nSelf-Trade Ratio: 100\.0%/);

  allLinks[0].disabled = true;
  allLinks[2].disabled = true;
  context.updateAnnotationForNode(node, selection());
  assert.match(label, /Incoming Trade: 0\nOutgoing Trade: 0\nLocal Trade: 0\nSelf-Trade Ratio: NA$/);

  allLinks[0].disabled = false;
  allLinks[1].disabled = false;
  context.updateAnnotationForNode(node, selection());
  assert.match(label, /Outgoing Trade: 300\nLocal Trade: 100\nSelf-Trade Ratio: 25\.0%/);
});

test("simulation recomputes dirty network partitions before building and displaying its trajectory", async () => {
  const order = [];
  const context = vm.createContext({
    clearTimeout, simulationRecomputeTimer: null, simulationRunId: 0,
    window: {},
    loadedCSVData: [{}], uniqueDates: [new Date("2020-01-01T00:00:00Z")], simulationState: {},
    readSimulationSettings: () => ({}),
    refreshNetworkControlStats: () => order.push("partitions"),
    buildSimulationTrajectory: () => { order.push("trajectory"); return {}; },
    refreshCurrentNetworkFrame: () => order.push("frame"),
    delaySimulationStage: async () => {},
  });
  for (const name of [
    "finishModePanelsRendering", "setSimulationInputsDisabled", "disableAllButtons",
    "disableAllCheckboxes", "setSimulationOverlay", "hideSimulationOverlay",
    "enableAllButtons", "enableAllCheckboxes",
  ]) context[name] = () => {};
  vm.runInContext(extractFunction("recomputeSimulationTrajectory"), context);
  await context.recomputeSimulationTrajectory();
  assert.deepEqual(order, ["partitions", "trajectory", "frame"]);
});
