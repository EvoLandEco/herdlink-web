import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const date = new Date("2020-01-01T00:00:00Z");
const ascending = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const plain = (value) => JSON.parse(JSON.stringify(value));

function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function runtime() {
  const context = vm.createContext({
    loadedCSVData: [], simulationRegionIdsByDataset: new WeakMap(),
    allNodes: [
      { id: "CR01", active: true, tradeTotal: 100 },
      { id: "CR02", active: true, tradeTotal: 100 },
      { id: "CR04", active: false, tradeTotal: 0, community: 3 },
    ],
    enabledLinks: [{ source: "CR01", target: "CR02", weight: 100 }],
    tradeCommunityTimeline: { partition: { CR03: 10, CR01: 10, CR02: 2 } },
    window: { currentDate: date, allTemporalStats: {} },
    d3: { ascending },
  });
  vm.runInContext([
    "getNodeId", "collectSimulationRegionIds", "evaluatePartitionModularity", "getTradeCommunityStructureData",
    "getSimulationPartitionKey", "getSimulationPartitionData",
  ].map(extractFunction).join("\n"), context);
  return context;
}

test("trade matrices retain the full community roster and numeric order as date volumes change", () => {
  const context = runtime();
  const first = context.getTradeCommunityStructureData();
  assert.deepEqual(plain(first.communities.map(({ key, members, nodeCount }) => ({ key, members, nodeCount }))), [
    { key: "2", members: ["CR02"], nodeCount: 1 },
    { key: "10", members: ["CR01", "CR03"], nodeCount: 2 },
    { key: "NA", members: Array.from({ length: 37 }, (_, index) => `CR${String(index + 4).padStart(2, "0")}`), nodeCount: 37 },
  ]);
  assert.equal(first.matrix.get("10->2"), 100);
  assert.equal(context.allNodes[2].community, undefined);

  context.allNodes = [{ id: "CR03", active: true, tradeTotal: 500 }];
  context.enabledLinks = [{ source: "CR03", target: "CR03", weight: 500 }];
  const second = context.getTradeCommunityStructureData();
  assert.deepEqual(plain(second.communities.map(({ key, members }) => ({ key, members }))),
    plain(first.communities.map(({ key, members }) => ({ key, members }))));
  assert.deepEqual(Array.from(second.communities, ({ load }) => load), [0, 1000, 0]);
  assert.equal(second.within, 500);
  assert.equal(second.between, 0);
});

test("the trade panel preserves negative modularity from cached and directly scored dates", () => {
  const context = runtime();
  assert.equal(context.getTradeCommunityStructureData().modularity, -0.5);
  context.window.allTemporalStats[date.toISOString()] = { modularity: -0.125 };
  assert.equal(context.getTradeCommunityStructureData().modularity, -0.125);
});

test("interregional mixing excludes local trades while the matrix retains their volume", () => {
  const context = runtime();
  context.enabledLinks.push({ source: "CR01", target: "CR01", weight: 900 },
    { source: "CR01", target: "CR03", weight: 25 });
  const result = context.getTradeCommunityStructureData();
  assert.equal(result.total, 1025);
  assert.equal(result.within, 925);
  assert.equal(result.interregionalTotal, 125);
  assert.equal(result.interregionalWithin, 25);
  assert.equal(result.interregionalBetween, 100);
  assert.equal(result.matrix.get("10->10"), 925);
});

test("an empty aggregate retains the unassigned roster and clears stale node membership", () => {
  const context = runtime();
  context.tradeCommunityTimeline = { partition: {} };
  context.enabledLinks = [];
  const result = context.getTradeCommunityStructureData();
  assert.equal(result.communities.length, 1);
  assert.equal(result.communities[0].key, "NA");
  assert.equal(result.communities[0].nodeCount, 40);
  assert.equal(result.matrix.size, 0);
  assert.equal(result.total, 0);
  assert.equal(result.within, 0);
  assert.equal(result.between, 0);
  assert.equal(result.modularity, 0);
  assert.ok(context.allNodes.every((node) => node.community === undefined));
});

test("local trade in unassigned regions remains in the heatmap without changing inferred communities", () => {
  const context = runtime();
  const partition = Object.freeze({ CR01: 0, CR02: 0 });
  context.tradeCommunityTimeline = { partition, numPartitions: 1, resolution: 1 };
  context.allNodes.push({ id: "CR03", active: true, tradeTotal: 198 });
  context.enabledLinks = [
    { source: "CR01", target: "CR02", weight: 1 },
    { source: { id: "CR03" }, target: { id: "CR03" }, weight: 99 },
  ];
  const result = context.getTradeCommunityStructureData();
  assert.equal(result.total, 100);
  assert.equal(result.within, 100);
  assert.equal(result.matrix.get("0->0"), 1);
  assert.equal(result.matrix.get("NA->NA"), 99);
  assert.equal(result.interregionalTotal, 1);
  assert.equal(result.interregionalWithin, 1);
  assert.equal(result.modularity, 0);
  const unassigned = result.communities.find(({ key }) => key === "NA");
  assert.equal(unassigned.nodeCount, 38);
  assert.equal(unassigned.load, 198);
  assert.equal(unassigned.nodeVolume, 198);
  assert.ok(unassigned.members.includes("CR03"));
  assert.equal(context.tradeCommunityTimeline.partition, partition);
  assert.equal(context.tradeCommunityTimeline.numPartitions, 1);
  assert.equal(context.allNodes.find(({ id }) => id === "CR03").community, undefined);
});

test("an entirely local ledger displays its unassigned volume with zero inferred groups", () => {
  const context = runtime();
  const partition = Object.freeze({});
  context.tradeCommunityTimeline = { partition, numPartitions: 0, resolution: 1.5 };
  context.enabledLinks = [
    { source: "CR01", target: "CR01", weight: 100 },
    { source: "CR03", target: "CR03", weight: 99 },
  ];
  const result = context.getTradeCommunityStructureData();
  assert.equal(result.communities.length, 1);
  assert.equal(result.communities[0].key, "NA");
  assert.equal(result.communities[0].nodeCount, 40);
  assert.equal(result.total, 199);
  assert.equal(result.matrix.get("NA->NA"), 199);
  assert.equal(result.interregionalTotal, 0);
  assert.equal(result.modularity, 0);
  assert.equal(context.tradeCommunityTimeline.partition, partition);
  assert.equal(context.tradeCommunityTimeline.numPartitions, 0);

  Object.assign(context, { theme: { muted: "neutral" },
    nodeColor() { assert.fail("Unassigned regions use the neutral color"); },
  });
  vm.runInContext(["getTradeCommunityLabel", "getTradeCommunityColor", "getSimulationPartitionDisplayKey",
    "getSimulationPartitionColor", "renderSimulationPartitionMapping"].map(extractFunction).join("\n"), context);
  assert.equal(context.getTradeCommunityLabel("NA"), "NA");
  assert.equal(context.getTradeCommunityColor("NA"), "neutral");
  let html;
  const panel = { empty: () => false, on() { return this; }, style() { return this; }, html(value) { html = value; return this; } };
  context.renderSimulationPartitionMapping({ select: () => panel }, result.communities,
    { maxItems: 2, maxRows: 2, columns: 2, maxMembers: 3, compactHeight: 50, expandedHeight: 200 });
  assert.match(html, /0 fixed groups · 0 singletons/);
  assert.match(html, /40 regions/);
  assert.doesNotMatch(html, /PNA/);
});

test("simulation membership includes regions absent from the displayed trade date", () => {
  const context = runtime();
  const frame = {
    nodeStates: {
      CR01: { N: 100, I: 2 }, CR02: { N: 100, I: 1 },
      CR03: { N: 100, I: 70 }, CR04: { N: 100, I: 0 },
    },
    linkStates: new Map([["CR03-CR02", { source: "CR03", target: "CR02", riskLoad: 12 }]]),
  };
  const first = context.getSimulationPartitionData(frame);
  assert.equal(context.getSimulationPartitionKey("CR03"), "10");
  assert.equal(context.getSimulationPartitionKey("CR04"), "NA");
  assert.deepEqual(Array.from(first.partitions, ({ key }) => key), ["2", "10", "NA"]);
  assert.deepEqual(plain(first.partitions[1].members), ["CR01", "CR03"]);
  assert.equal(first.partitions[1].I, 72);
  assert.equal(first.matrix.get("10->2"), 12);

  frame.nodeStates.CR02.I = 99;
  assert.deepEqual(Array.from(context.getSimulationPartitionData(frame).partitions, ({ key }) => key),
    ["2", "10", "NA"]);
});

test("returning simulation heatmap cells regain full opacity after an interrupted exit", () => {
  const renderer = extractFunction("renderSimulationPartitionStructurePanel");
  const update = renderer.match(/\.merge\(cellSelection\)([^]*?)(?=\n\s+cellSelection\s*\n\s+\.exit\(\))/);
  assert.ok(update, "Simulation cell update exists");
  const cell = { source: "4", target: "7", value: 12 };
  const attributes = { opacity: 0.35, width: 10, fill: "old" };
  const exit = { cancelled: false };
  const selection = {
    call(callback) { callback(this); return this; },
    interrupt() { exit.cancelled = true; return this; },
    transition() { return this; },
    duration() { return this; },
    attr(name, value) {
      attributes[name] = typeof value === "function" ? value(cell) : value;
      return this;
    },
  };
  const scale = Object.assign((key) => Number(key) * 20, { bandwidth: () => 18 });
  const context = vm.createContext({
    cellSelection: selection, x: scale, y: scale, matrixOffsetY: 0,
    color: (value) => `exposure-${value}`, theme: { surface: "empty", muted: "muted" },
  });
  vm.runInContext(`${extractFunction("transitionSelection")}\ncellSelection${update[1]}`, context);

  assert.equal(exit.cancelled, true);
  assert.equal(attributes.opacity, 1);
  assert.equal(attributes.width, 18);
  assert.equal(attributes.fill, "exposure-12");
});

test("community colors use the complete numeric domain and a neutral color for unassigned regions", () => {
  const context = runtime();
  let domain;
  let unknown;
  const ordinal = Object.assign(() => {}, {
    domain(value) { domain = Array.from(value); return this; },
    unknown(value) { unknown = value; return this; },
  });
  const sizeScale = { domain() { return this; }, range() { return this; } };
  Object.assign(context, { theme: { muted: "neutral" }, nonZeroLinks: [], setTradeEdgeScales() {} });
  Object.assign(context.d3, {
    scaleOrdinal: () => ordinal,
    scaleSqrt: () => sizeScale,
    extent: (nodes, value) => [Math.min(...nodes.map(value)), Math.max(...nodes.map(value))],
  });
  vm.runInContext(extractFunction("initAesthetics"), context);
  context.initAesthetics();
  assert.deepEqual(domain, [2, 10]);
  assert.equal(unknown, "neutral");

  context.allNodes = [{ id: "CR03", tradeTotal: 500 }];
  context.initAesthetics();
  assert.deepEqual(domain, [2, 10]);
});
