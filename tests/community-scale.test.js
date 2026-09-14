import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const dates = [0, 1].map((day) => new Date(Date.UTC(2020, 0, 1 + day)));
const keys = dates.map((date) => date.toISOString());
const plain = (value) => JSON.parse(JSON.stringify(value));

function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function runtime() {
  const calls = [];
  const partition = {
    broad: Object.freeze({ CR01: 0, CR02: 0, CR03: 1, CR04: 1 }),
    finer: Object.freeze({ CR01: 0, CR02: 1, CR03: 2, CR04: 2 }),
  };
  const byScale = Object.fromEntries(["broad", "finer"].map((scale, index) => [scale, Object.freeze({
    partition: partition[scale], numPartitions: index + 2,
    modularityByDate: new Map([[dates[0].getTime(), 0.2 - index * 0.1], [dates[1].getTime(), -0.2 - index * 0.1]]),
    resolution: index ? 1.5 : 1, groupSizes: index ? [2, 1, 1] : [2, 2],
    singletons: index ? 2 : 0, interregionalTotal: 100, interregionalWithin: index ? 25 : 60,
  })]));
  const global = Object.fromEntries(keys.map((key, index) => {
    const communityScales = Object.freeze(Object.fromEntries(["broad", "finer"].map((scale) => [scale, Object.freeze({
      partition: partition[scale], numPartitions: byScale[scale].numPartitions,
      modularity: byScale[scale].modularityByDate.get(dates[index].getTime()),
    })])));
    return [key, Object.freeze({ ...communityScales.broad, communityScales, totalTradeVolume: 100 + index, spectralRadius: 7 })];
  }));
  const original = {
    global: Object.fromEntries(keys.map((key) => {
      const broad = Object.freeze({ partition: partition.broad, numPartitions: 2, modularity: 0.3 });
      const finer = Object.freeze({ partition: { CR01: 0, CR02: 1, CR03: 2, CR04: 3 }, numPartitions: 4, modularity: 0.15 });
      return [key, Object.freeze({ ...broad, totalTradeVolume: 150, communityScales: Object.freeze({ broad, finer }) })];
    })),
    node: Object.fromEntries(keys.map((key) => [key, Object.freeze({ CR01: { inDegree: 100 } })])),
  };
  const data = [{}];
  const cache = new WeakMap([[data, original]]);
  const context = vm.createContext({
    Date, Map, Set, communityScale: "broad", loadedCSVData: data, uniqueDates: dates,
    tradeCommunityTimeline: Object.freeze({ ...byScale.broad, byScale }),
    originalLedgerStatsByDataset: cache,
    comparisonDataCache: new Map([["trade", { label: "trade" }], ["simulation", { label: "simulation" }]]),
    simulationState: { status: "ready", trajectory: { frames: [{ count: 1 }] } },
    simulationNodeInterventions: new Map([[dates[0].getTime(), new Map([["CR01", { exports: false }]])]]),
    simulationLinkInterventions: new Map(), networkStatsDirtyDates: new Set(), networkStatsDirtyFrom: null,
    simulationRecomputeTimer: null, comparisonDataError: null, appDataMode: "trade", selectedNodeData: null,
    window: {
      currentDate: dates[1], allTemporalStats: global,
      maxTemporalStats: { modularity: 0.2, spectralRadius: 7 },
      allTemporalNodeStats: Object.fromEntries(keys.map((key) => [key, Object.freeze({ CR01: { inDegree: 2 } })])),
      herdlinkComparison: { refresh: () => calls.push("comparison") },
    },
    document: { querySelectorAll: () => [], getElementById: () => null },
    syncTradeCommunityScaleControls: () => calls.push("controls"),
    refreshTradeCommunityScale: () => calls.push("community-paint"),
    collectSimulationRegionIds: () => ["CR01", "CR02", "CR03", "CR04"],
    getStatnaam: (id) => id,
    getComparisonInterventionEvents: () => [],
    getComparisonMetricDefinitions: () => ({ globalMetrics: [{ key: "numPartitions" }, { key: "modularity" }], nodeMetrics: [] }),
  });
  for (const name of [
    "computeTemporalNetworkStats", "computeTradeCommunityTimeline", "computeModularity",
    "computeHotSpotMetrics", "computeSpectralRadius", "buildSimulationTrajectory", "scheduleSimulationRecompute",
    "computeMaxTemporalNetworkStats", "refreshCurrentNetworkFrame",
  ]) context[name] = () => assert.fail(`${name} must not run for a community scale selection`);
  vm.runInContext(["setTradeCommunityScale", "buildComparisonSeries", "getComparisonData"].map(extractFunction).join("\n"), context);
  context.calls = calls;
  return context;
}

test("scale selection replaces all date community fields and preserves network and simulation calculations", () => {
  const context = runtime();
  const before = { ...context.window.allTemporalStats };
  const nodeStats = context.window.allTemporalNodeStats;
  const timeline = context.tradeCommunityTimeline;
  const trajectory = context.simulationState.trajectory;
  const baseline = context.originalLedgerStatsByDataset.get(context.loadedCSVData);
  const originalSnapshot = plain(baseline);
  const simulationCache = context.comparisonDataCache.get("simulation");

  assert.equal(context.setTradeCommunityScale("finer"), true);
  assert.equal(context.communityScale, "finer");
  assert.equal(context.tradeCommunityTimeline.byScale, timeline.byScale);
  assert.equal(context.tradeCommunityTimeline.partition, timeline.byScale.finer.partition);
  assert.equal(context.tradeCommunityTimeline.resolution, 1.5);
  assert.equal(context.tradeCommunityTimeline.singletons, 2);
  for (const key of keys) {
    const stats = context.window.allTemporalStats[key];
    assert.notEqual(stats, before[key]);
    assert.equal(stats.partition, timeline.byScale.finer.partition);
    assert.equal(stats.numPartitions, 3);
    assert.equal(stats.modularity, before[key].communityScales.finer.modularity);
    assert.equal(stats.totalTradeVolume, before[key].totalTradeVolume);
    assert.equal(stats.spectralRadius, before[key].spectralRadius);
    assert.equal(before[key].partition, timeline.byScale.broad.partition);
  }
  assert.equal(context.window.allTemporalNodeStats, nodeStats);
  assert.equal(context.window.currentDate, dates[1]);
  assert.equal(context.simulationState.trajectory, trajectory);
  assert.equal(context.originalLedgerStatsByDataset.get(context.loadedCSVData), baseline);
  assert.deepEqual(plain(baseline), originalSnapshot);
  assert.equal(context.comparisonDataCache.has("trade"), false);
  assert.equal(context.comparisonDataCache.get("simulation"), simulationCache);
  assert.equal(context.networkStatsDirtyDates.size, 0);
  assert.equal(context.networkStatsDirtyFrom, null);
  assert.ok(context.calls.includes("community-paint"));
  assert.equal(context.window.maxTemporalStats.modularity, 0.1);
  assert.equal(context.window.maxTemporalStats.spectralRadius, 7);

  assert.equal(context.setTradeCommunityScale("broad"), true);
  assert.equal(context.tradeCommunityTimeline.partition, timeline.partition);
  for (const key of keys) assert.equal(context.window.allTemporalStats[key].partition, timeline.partition);
});

test("unchanged and unknown community scales leave the selected partition and caches intact", () => {
  const context = runtime();
  const timeline = context.tradeCommunityTimeline;
  const globals = context.window.allTemporalStats;
  const cache = context.comparisonDataCache.get("trade");
  for (const scale of ["broad", "fine", "", null, undefined]) {
    assert.equal(context.setTradeCommunityScale(scale), false);
    assert.equal(context.tradeCommunityTimeline, timeline);
    assert.equal(context.window.allTemporalStats, globals);
    assert.equal(context.comparisonDataCache.get("trade"), cache);
  }
  assert.equal(context.communityScale, "broad");
  assert.equal(context.calls.length, 0);
});

test("scale selection during a dataset load preserves the choice without repainting the preceding dataset", () => {
  const context = runtime();
  context.window.isSwitchingCSV = true;
  assert.equal(context.setTradeCommunityScale("finer"), true);
  assert.equal(context.communityScale, "finer");
  assert.ok(!context.calls.includes("community-paint"));
});

test("baseline comparisons select their own cached scale without changing baseline statistics", () => {
  const context = runtime();
  const baseline = context.originalLedgerStatsByDataset.get(context.loadedCSVData);
  const snapshot = plain(baseline);
  const broad = context.getComparisonData();
  assert.deepEqual(Array.from(broad.original.global, (stats) => stats.numPartitions), [2, 2]);

  context.setTradeCommunityScale("finer");
  const finer = context.getComparisonData();
  assert.deepEqual(Array.from(finer.original.global, (stats) => stats.numPartitions), [4, 4]);
  assert.deepEqual(Array.from(finer.original.global, (stats) => stats.modularity), [0.15, 0.15]);
  assert.deepEqual(Array.from(finer.intervention.global, (stats) => stats.numPartitions), [3, 3]);
  for (const [index, expected] of [0.1, -0.3].entries()) {
    assert.ok(Math.abs(finer.intervention.global[index].modularity - expected) < 1e-12);
  }
  assert.deepEqual(plain(baseline), snapshot);
  assert.deepEqual(Array.from(broad.original.global, (stats) => stats.numPartitions), [2, 2]);
  assert.equal(context.getComparisonData().original, finer.original);
});

test("simulation replay keeps its trajectory and comparison cache when selecting finer communities", () => {
  const context = runtime();
  context.appDataMode = "simulation";
  const trajectory = context.simulationState.trajectory;
  const cached = context.comparisonDataCache.get("simulation");
  assert.equal(context.setTradeCommunityScale("finer"), true);
  assert.equal(context.simulationState.trajectory, trajectory);
  assert.equal(context.comparisonDataCache.get("simulation"), cached);
  assert.equal(context.tradeCommunityTimeline.numPartitions, 3);
  assert.equal(context.calls.filter((name) => name === "community-paint").length, 1);
});

test("community repaint preserves node positions, graph identity, and simulation prevalence colors", () => {
  for (const mode of ["trade", "simulation"]) {
    const context = runtime();
    const nodes = [{ id: "CR01", x: 12, y: 34, vx: 0.2, vy: -0.1, community: 0 },
      { id: "CR02", x: 56, y: 78, fx: 56, fy: 78, community: 0 }];
    const links = [{ source: nodes[0], target: nodes[1], weight: 10 }];
    const positions = nodes.map(({ community, ...position }) => position);
    const points = [{ sourceId: "CR01" }, { sourceId: "CR02" }];
    const fills = [];
    let colorDomain;
    const color = (community) => `color-${community}`;
    color.domain = (value) => { colorDomain = value; return color; };
    Object.assign(context, {
      allNodes: nodes, allLinks: links, nodeColor: color, selectedNodeData: nodes[0],
      isSimulationModeActive: () => mode === "simulation",
      forceSim: new Proxy({}, { get: () => assert.fail("Community repaint must not alter force layout") }),
      d3: { selectAll: (selector) => ({ attr: (name, value) => {
        assert.equal(mode, "trade", "Simulation node and map prevalence fills remain intact");
        assert.equal(selector, "#tradeDistribution .trade-circle");
        assert.equal(name, "fill");
        fills.push(...points.map(value));
      } }) },
    });
    context.window.currentSelectedStat = "modularity";
    context.window.currentSelectedNodeStat = "eigenvector";
    context.window.currentSelectedTradeNodeInsight = "communityMix";
    for (const name of ["updateSCCs", "updateNetworkStats", "updateGlobalStatsChart", "updateNodeStatsChart",
      "updateTradeTable", "updateTradeNodeInsight"])
      context[name] = () => context.calls.push(name);
    vm.runInContext(extractFunction("refreshTradeCommunityScale"), context);
    const trajectory = context.simulationState.trajectory;
    context.setTradeCommunityScale("finer");

    assert.equal(context.allNodes, nodes);
    assert.equal(context.allLinks, links);
    assert.equal(context.selectedNodeData, nodes[0]);
    assert.equal(context.simulationState.trajectory, trajectory);
    assert.deepEqual(nodes.map(({ community, ...position }) => position), positions);
    assert.deepEqual(nodes.map(node => node.community), [0, 1]);
    assert.deepEqual(Array.from(colorDomain), [0, 1, 2]);
    assert.ok(context.calls.includes("updateSCCs"));
    assert.ok(context.calls.includes("updateTradeNodeInsight"));
    if (mode === "trade") {
      assert.deepEqual(fills, ["color-0", "color-1"]);
      for (const name of ["updateNetworkStats", "updateGlobalStatsChart", "updateNodeStatsChart", "updateTradeTable"])
        assert.ok(context.calls.includes(name));
    } else {
      assert.deepEqual(fills, []);
      assert.ok(!context.calls.includes("updateNetworkStats"));
      assert.ok(!context.calls.includes("updateGlobalStatsChart"));
      assert.ok(!context.calls.includes("updateNodeStatsChart"));
    }
  }
});
