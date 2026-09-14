import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../src/runtime/herdlink-runtime.js", import.meta.url),
  "utf8",
);
function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

const functions = [
  "isSimulationModeActive", "getNodeId", "getLinkKey", "getDisabledLinkKeys", "getTradeRecordsByDate",
  "setSimulationLinkIntervention", "getSimulationLinkAvailability",
  "setSimulationNodeIntervention", "getSimulationNodePermissions", "applySimulationNodePermissions",
  "getSimulationRestrictionTimeline",
  "setAllSimulationNodePermissions",
  "setTradeEdgeScales", "collectSimulationRegionIds",
  "buildSimulationLedger", "estimateSimulationHoldings",
  "getSimulationFrameSummary", "buildSimulationTrajectory", "applySimulationFrame",
  "initNodesAndLinks", "restoreLinks", "getSimulationTrajectoryPath", "setAppDataMode", "cancelSimulationRecompute",
  "applyNetworkControlChanges", "refreshNetworkControlStats", "computeTemporalNetworkStats",
  "computeMaxTemporalNetworkStats", "computeSimpleStats", "computeNumberOfConnectedComponents",
  "computeTradeCommunityTimeline", "computeModularity", "evaluatePartitionModularity",
].map(extractFunction).join("\n");

const settings = {
  model: "SIR", seedRegion: "CR01", initialPct: 5,
  beta: 0, movementBeta: 2, gamma: 0, sigma: 0.3,
};

function runtime(edges = [["CR01", "CR02", 1000], ["CR02", "CR01", 100], ["CR02", "CR03", 100]]) {
  const uniqueDates = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(2020, 0, 1 + i * 7)));
  const loadedCSVData = uniqueDates.flatMap((time) => edges.map(([COROP_LEV, COROP_AFN, AANTAL]) => ({
    COROP_LEV, COROP_AFN, AANTAL, time,
  })));
  const values = (items, accessor = (item) => item) => Array.from(items, accessor);
  const context = vm.createContext({
    Date, Map, Set, uniqueDates, loadedCSVData,
    simulationRegionIdsByDataset: new WeakMap(),
    tradeRecordsByDataset: new WeakMap(),
    originalLedgerStatsByDataset: new WeakMap(), tradeCommunityTimeline: null, communityScale: "broad",
    appDataMode: "simulation", allNodes: [], allLinks: [], nlLabelPoints: null,
    simulationState: {}, simulationLinkInterventions: new Map(),
    simulationNodeInterventions: new Map(),
    networkStatsDirtyDates: new Set(), networkStatsDirtyFrom: null, ledgerBaselineSpectralRadius: 0,
    window: { currentDate: uniqueDates[0] }, tradeIntensity: null, exposureIntensity: null,
    computeSpectralRadius: () => 0, computeHotSpotMetrics: () => ({}),
    setLedgerHotspotsMax: () => {},
    metricNames: ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"],
    d3: {
      min: (items, accessor) => Math.min(...values(items, accessor)),
      max: (items, accessor) => Math.max(...values(items, accessor)),
      sum: (items, accessor) => values(items, accessor).reduce((sum, value) => sum + value, 0),
      extent: (items, accessor) => [Math.min(...values(items, accessor)), Math.max(...values(items, accessor))],
      scaleSequential: () => ({ domain: () => null }),
      curveMonotoneX: "smooth", curveStepAfter: "step",
    },
  });
  vm.runInContext(readFileSync(new URL("../src/runtime/jLouvain.js", import.meta.url), "utf8") + "\n" + functions, context);
  context.initNodesAndLinks(loadedCSVData.filter((row) => row.time === uniqueDates[0]));
  context.computeTemporalNetworkStats();
  return context;
}

function toggle(context, sourceId, targetId, disabled, date = context.uniqueDates[0]) {
  context.setSimulationLinkIntervention(`${sourceId}-${targetId}`, disabled, date);
}

function snapshot(trajectory) {
  return JSON.stringify(trajectory, (_, value) => value instanceof Map ? Array.from(value) : value);
}

test("Restore skips recomputation when no controls have been changed", () => {
  const context = runtime();
  context.document = { getElementById() { assert.fail("An unchanged network does not need a UI refresh"); } };
  for (const mode of ["trade", "simulation"]) {
    context.appDataMode = mode;
    context.restoreLinks();
  }
});

function prepareModeSwitching(context) {
  Object.assign(context, {
    clearTimeout, simulationRunId: 0, simulationRecomputeTimer: null,
    canSwitchAppDataMode: () => true,
    beginAppModeSwitchBounce: () => true,
    refreshCurrentNetworkFrame: () => {
      const date = context.window.currentDate;
      context.initNodesAndLinks(context.loadedCSVData.filter((row) => row.time === date));
      context.applySimulationFrame(date);
    },
    recomputeSimulationTrajectory: () => {
      context.simulationState = {
        status: "ready", trajectory: context.buildSimulationTrajectory(settings),
      };
      context.refreshCurrentNetworkFrame();
    },
  });
  context.d3.selectAll = () => ({ property() {} });
  for (const name of [
    "syncModeSwitcherRadios", "setModePanelsRendering", "resetRadarRenderState",
    "configureSimulationModeUi", "restoreLedgerHotspotsMax", "hideSimulationOverlay",
    "clearSimulationRenderState", "updateNetwork", "applySimulationMapPrevalence",
    "finishModePanelsRendering", "setSimulationInputsDisabled", "enableAllButtons",
    "enableAllCheckboxes",
  ]) context[name] = () => {};
}

test("network and simulation modes share dated controls while preserving ledger weights and earlier states", () => {
  const context = runtime();
  prepareModeSwitching(context);
  const dates = context.uniqueDates;
  const rawLedger = snapshot(context.loadedCSVData);
  const baseline = context.buildSimulationTrajectory(settings);
  assert.equal(context.setAppDataMode("trade"), true);

  toggle(context, "CR01", "CR02", true, dates[2]);
  context.setSimulationNodeIntervention("CR02", "exports", false, dates[3]);
  context.setSimulationNodeIntervention("CR02", "exports", true, dates[5]);
  const assertCurrentNetwork = (index) => {
    context.window.currentDate = dates[index];
    context.refreshCurrentNetworkFrame();
    const disabled = context.allLinks.filter((link) => link.disabled)
      .map((link) => context.getLinkKey(link.source, link.target)).sort();
    const expected = Array.from(context.getDisabledLinkKeys(dates[index])).sort();
    assert.deepEqual(Array.from(disabled), expected);
    assert.equal(context.enabledLinks.some((link) => link.disabled), false);
    if (context.appDataMode === "trade") {
      for (const row of context.loadedCSVData.filter((row) => row.time === dates[index])) {
        const link = context.allLinks.find((item) => item.id === `${row.COROP_LEV}-${row.COROP_AFN}`);
        assert.equal(link.weight, row.AANTAL);
        assert.equal(link.simulation, undefined);
      }
    }
  };
  for (const index of [0, 2, 4, 5, 1]) assertCurrentNetwork(index);

  assert.equal(context.setAppDataMode("simulation"), true);
  const edited = context.simulationState.trajectory;
  assert.equal(snapshot(edited.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
  assert.equal(edited.frames[2].linkStates.has("CR01-CR02"), false);
  assert.equal(edited.frames[4].linkStates.has("CR02-CR03"), false);
  assert.ok(edited.frames[5].linkStates.get("CR02-CR03").riskLoad > 0);
  for (const index of [2, 3, 5]) assertCurrentNetwork(index);

  toggle(context, "CR02", "CR01", true, dates[4]);
  context.setSimulationNodeIntervention("CR01", "imports", false, dates[4]);
  const linkSchedule = snapshot(context.simulationLinkInterventions);
  const nodeSchedule = snapshot(context.simulationNodeInterventions);
  const combined = context.buildSimulationTrajectory(settings);
  assert.equal(context.setAppDataMode("trade"), true);
  assert.equal(snapshot(context.simulationLinkInterventions), linkSchedule);
  assert.equal(snapshot(context.simulationNodeInterventions), nodeSchedule);
  assert.deepEqual(dates.map((date) => context.window.allTemporalStats[date.toISOString()].totalTradeVolume),
    [1200, 1200, 200, 1000, 1000, 1100]);
  for (const index of [4, 2, 0, 5]) assertCurrentNetwork(index);
  assert.equal(context.setAppDataMode("simulation"), true);
  assert.equal(snapshot(context.simulationState.trajectory), snapshot(combined));
  assert.equal(snapshot(context.loadedCSVData), rawLedger);
});

test("network analytics refresh edited routes while retaining unaffected node calculations", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  const rawLedger = snapshot(context.loadedCSVData);
  const baseline = { ...context.window.allTemporalStats };
  const nodeBaseline = { ...context.window.allTemporalNodeStats };
  const stats = (index) => context.window.allTemporalStats[dates[index].toISOString()];
  assert.equal(stats(0).totalTradeVolume, 1200);

  toggle(context, "CR01", "CR02", true, dates[2]);
  context.refreshNetworkControlStats();
  assert.equal(stats(2).totalTradeVolume, 200);
  for (const index of [0, 1, 3, 4, 5]) {
    assert.deepEqual(stats(index), baseline[dates[index].toISOString()]);
    assert.equal(context.window.allTemporalNodeStats[dates[index].toISOString()], nodeBaseline[dates[index].toISOString()]);
  }
  assert.equal(context.networkStatsDirtyDates.size, 0);

  context.setSimulationNodeIntervention("CR02", "exports", false, dates[3]);
  context.setSimulationNodeIntervention("CR02", "exports", true, dates[5]);
  context.refreshNetworkControlStats();
  assert.deepEqual(dates.map((_, index) => stats(index).totalTradeVolume), [1200, 1200, 200, 1000, 1000, 1200]);
  assert.equal(stats(3).totalEdges, 1);
  assert.equal(stats(3).totalNodes, 2);
  assert.equal(stats(3).numComponents, 2);
  assert.deepEqual(stats(0), baseline[dates[0].toISOString()]);
  assert.equal(context.window.allTemporalNodeStats[dates[0].toISOString()], nodeBaseline[dates[0].toISOString()]);
  assert.equal(context.networkStatsDirtyFrom, null);
  assert.equal(context.window.maxTemporalStats.totalTradeVolume, 1200);
  assert.equal(snapshot(context.loadedCSVData), rawLedger);
});

test("network statistics group interleaved records by timestamp and refresh only requested dates", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  const record = (index, source, target, weight) => ({
    time: new Date(dates[index]), COROP_LEV: source, COROP_AFN: target, AANTAL: weight,
  });
  context.loadedCSVData = [
    record(2, "CR02", "CR03", 20),
    record(0, "CR01", "CR02", 11),
    record(2, "CR03", "CR02", 10),
  ];
  context.computeTemporalNetworkStats();
  const stats = (index) => context.window.allTemporalStats[dates[index].toISOString()];
  assert.deepEqual(dates.map((_, index) => stats(index).totalTradeVolume), [11, 0, 30, 0, 0, 0]);
  assert.equal(stats(2).totalEdges, 2);
  const untouched = stats(0);
  context.setSimulationNodeIntervention("CR02", "exports", false, dates[2]);
  context.computeTemporalNetworkStats([new Date(dates[2])]);
  const { communityScales: beforeScales, ...beforeMetrics } = untouched;
  const { communityScales: afterScales, ...afterMetrics } = stats(0);
  assert.deepEqual(afterMetrics, beforeMetrics);
  assert.notDeepEqual(afterScales.finer.partition, beforeScales.finer.partition);
  assert.equal(afterScales.finer.partition, stats(2).communityScales.finer.partition);
  assert.equal(stats(2).totalTradeVolume, 10);
  assert.equal(stats(2).totalEdges, 1);
});

test("region IDs are reused within a dataset and include new partners when its data is replaced", () => {
  const context = runtime();
  const originalData = context.loadedCSVData;
  const originalIds = context.collectSimulationRegionIds(originalData);
  assert.equal(context.collectSimulationRegionIds(originalData), originalIds);
  context.loadedCSVData = originalData.concat({
    time: context.uniqueDates[4], COROP_LEV: "CR01", COROP_AFN: "CR41", AANTAL: 100,
  });
  const replacementIds = context.collectSimulationRegionIds(context.loadedCSVData);
  assert.ok(replacementIds.includes("CR41"));
  assert.ok(!originalIds.includes("CR41"));
  context.setAllSimulationNodePermissions("imports", false, context.uniqueDates[0]);
  assert.equal(context.getDisabledLinkKeys(context.uniqueDates[4]).has("CR01-CR41"), true);
});

test("empty and acyclic networks have finite spectral and centrality values", () => {
  const graph = vm.createContext({});
  vm.runInContext([
    "getNodeId", "buildAdjList", "getStronglyConnectedComponents", "computePerronPair", "computePerronRoot",
    "computeModularity", "computeSpectralRadius", "computeEigenvectorCentrality",
  ].map(extractFunction).join("\n"), graph);
  const nodes = ["CR01", "CR02", "CR03"].map((id) => ({ id }));
  const empty = graph.computeModularity(nodes, []);
  assert.equal(empty.modularity, 0);
  assert.deepEqual(Object.keys(empty.partition), nodes.map(({ id }) => id));
  assert.equal(new Set(Object.values(empty.partition)).size, nodes.length);
  for (const regions of [[], nodes]) {
    assert.equal(graph.computeSpectralRadius(regions, []), 0);
    assert.deepEqual(Object.values(graph.computeEigenvectorCentrality(regions, [])),
      regions.map(() => 0));
  }
  const chain = [
    { source: nodes[0], target: nodes[1], weight: 7 },
    { source: nodes[1], target: nodes[2], weight: 3 },
  ];
  assert.equal(graph.computeSpectralRadius(nodes, chain), 0);
});

test("restrictions preserve the raw spectral baseline across partial and full statistics refreshes", () => {
  const context = runtime([["CR01", "CR02", 10], ["CR02", "CR01", 10]]);
  vm.runInContext(["buildAdjList", "getStronglyConnectedComponents", "computePerronPair", "computePerronRoot", "computeSpectralRadius"]
    .map(extractFunction).join("\n"), context);
  context.computeTemporalNetworkStats();
  assert.ok(Math.abs(context.ledgerBaselineSpectralRadius - 10) < 1e-9);
  const baseline = context.ledgerBaselineSpectralRadius;

  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[0]);
  context.refreshNetworkControlStats();
  assert.ok(Object.values(context.window.allTemporalStats).every(({ spectralRadius }) => spectralRadius === 0));
  assert.equal(context.ledgerBaselineSpectralRadius, baseline);

  context.computeTemporalNetworkStats();
  assert.equal(context.ledgerBaselineSpectralRadius, baseline);
  assert.ok(Object.values(context.window.allTemporalStats).every(({ spectralRadius }) => spectralRadius === 0));
});

function recordTrajectoryPath(context, points) {
  context.simulationState.trajectory = context.buildSimulationTrajectory(settings);
  const calls = [];
  let curve;
  const generator = (segment) => {
    calls.push([curve, Array.from(segment, (point) => point.id)]);
    return `M${calls.length}`;
  };
  generator.curve = (value) => {
    curve = value;
    return generator;
  };
  const path = context.getSimulationTrajectoryPath(points, generator);
  return { path, calls };
}

test("restriction timelines show chronological states, merged periods, and reopened regions", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  const times = dates.map(Number);
  context.setSimulationNodeIntervention("CR02", "exports", true, dates[4]);
  context.setSimulationNodeIntervention("CR02", "imports", false, dates[2]);
  context.setSimulationNodeIntervention("CR02", "exports", false, dates[1]);
  context.setSimulationNodeIntervention("CR02", "imports", true, dates[4]);
  context.setSimulationNodeIntervention("CR02", "exports", false, dates[3]);
  context.setSimulationNodeIntervention("CR01", "imports", false, dates[5]);
  context.setSimulationNodeIntervention("CR03", "exports", true, dates[0]);
  const timeline = JSON.parse(JSON.stringify(context.getSimulationRestrictionTimeline(
    ["CR01", "CR02", "CR03"], dates,
  )));
  assert.deepEqual(timeline, {
    start: times[0], end: times[5], rows: [
      {
        id: "CR01",
        segments: [{ start: times[0], end: times[5], exports: true, imports: true }],
        points: [{ time: times[5], exports: true, imports: false, changes: { imports: false } }],
      },
      {
        id: "CR02",
        segments: [
          { start: times[0], end: times[1], exports: true, imports: true },
          { start: times[1], end: times[2], exports: false, imports: true },
          { start: times[2], end: times[4], exports: false, imports: false },
          { start: times[4], end: times[5], exports: true, imports: true },
        ],
        points: [
          { time: times[1], exports: false, imports: true, changes: { exports: false } },
          { time: times[2], exports: false, imports: false, changes: { imports: false } },
          { time: times[4], exports: true, imports: true, changes: { exports: true, imports: true } },
        ],
      },
    ],
  });
});

test("restriction timelines retain events before, between, and after sampled dates without mutating them", () => {
  const context = runtime();
  const [first, second] = context.uniqueDates;
  const before = first.getTime() - 1234;
  const between = first.getTime() + 1234;
  const after = second.getTime() + 1234;
  const interventions = new Map([
    [after, new Map([["CR01", { imports: true }]])],
    [before, new Map([["CR01", { imports: false }]])],
    [between, new Map([["CR01", { exports: false }]])],
  ]);
  const input = snapshot(interventions);
  const result = context.getSimulationRestrictionTimeline(["CR01"], [first, second], interventions);
  assert.equal(result.start, before);
  assert.equal(result.end, after);
  assert.deepEqual(Array.from(result.rows[0].points, ({ time }) => time), [before, between, after]);
  assert.deepEqual(Array.from(result.rows[0].segments, ({ start, end }) => [start, end]), [
    [before, between], [between, after],
  ]);
  assert.equal(snapshot(interventions), input);
  assert.equal(context.simulationNodeInterventions.size, 0);
});

test("restriction timelines handle empty schedules and a restriction at a single instant", () => {
  const context = runtime();
  assert.equal(snapshot(context.getSimulationRestrictionTimeline([], [])),
    JSON.stringify({ start: null, end: null, rows: [] }));
  const date = context.uniqueDates[0];
  const time = date.getTime();
  assert.equal(snapshot(context.getSimulationRestrictionTimeline(["CR01"], [date])),
    JSON.stringify({ start: time, end: time, rows: [] }));
  context.setSimulationNodeIntervention("CR01", "exports", false, date);
  assert.equal(snapshot(context.getSimulationRestrictionTimeline(["CR01"], [])), JSON.stringify({
    start: time, end: time,
    rows: [{ id: "CR01", segments: [], points: [
      { time, exports: false, imports: true, changes: { exports: false } },
    ] }],
  }));
});

test("the selected seed region alone starts infected", () => {
  const context = runtime([["CR01", "CR35", 1000], ["CR35", "CR02", 100]]);
  for (const seedRegion of ["CR35", "CR01", "CR02"]) {
    const trajectory = context.buildSimulationTrajectory({ ...settings, seedRegion, movementBeta: 0 });
    assert.deepEqual(Array.from(trajectory.seedIds), [seedRegion]);
    const states = trajectory.frames[0].nodeStates;
    assert.deepEqual(Object.keys(states).filter((id) => states[id].I > 0), [seedRegion]);
    assert.ok(Math.abs(states[seedRegion].I / states[seedRegion].N - settings.initialPct / 100) < 1e-12);
  }
});

test("trajectory paths use smooth curves without intervention boundaries and accept empty or single frames", () => {
  const context = runtime();
  const points = context.uniqueDates.map((date, id) => ({ date, id }));
  assert.deepEqual(recordTrajectoryPath(context, []), { path: null, calls: [] });
  assert.deepEqual(recordTrajectoryPath(context, points.slice(0, 1)), {
    path: "M1", calls: [["smooth", [0]]],
  });
  assert.deepEqual(recordTrajectoryPath(context, points), {
    path: "M1", calls: [["smooth", [0, 1, 2, 3, 4, 5]]],
  });
});

test("trajectory paths isolate intervention intervals from smooth line and stacked area periods", () => {
  const context = runtime();
  const points = context.uniqueDates.map((date, id) => ({ date, id }));
  toggle(context, "CR01", "CR02", true, context.uniqueDates[2]);
  const expected = {
    path: "M1M2M3M4",
    calls: [["smooth", [0, 1]], ["step", [1, 2]], ["step", [2, 3]], ["smooth", [3, 4, 5]]],
  };
  assert.deepEqual(recordTrajectoryPath(context, points), expected);
  const stackedPoints = points.map((point) => ({ id: point.id, data: point }));
  assert.deepEqual(recordTrajectoryPath(context, stackedPoints), expected);
});

test("consecutive and final intervention boundaries connect every frame without singleton periods", () => {
  const context = runtime();
  const points = context.uniqueDates.map((date, id) => ({ date, id }));
  toggle(context, "CR01", "CR02", true, context.uniqueDates[1]);
  toggle(context, "CR01", "CR02", false, context.uniqueDates[2]);
  toggle(context, "CR02", "CR03", true, context.uniqueDates[5]);
  assert.deepEqual(recordTrajectoryPath(context, points), {
    path: "M1M2M3M4",
    calls: [["step", [0, 1]], ["step", [1, 2]], ["smooth", [2, 3, 4]], ["step", [4, 5]]],
  });
});

test("unchanged node restrictions and edits outside sampled dates keep trajectory curves smooth", () => {
  const context = runtime();
  const points = context.uniqueDates.map((date, id) => ({ date, id }));
  const expected = { path: "M1", calls: [["smooth", [0, 1, 2, 3, 4, 5]]] };
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[0]);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[3]);
  context.setSimulationNodeIntervention("CR02", "imports", true, context.uniqueDates[4]);
  assert.deepEqual(recordTrajectoryPath(context, points), expected);

  context.simulationNodeInterventions.clear();
  toggle(context, "CR01", "CR02", true, new Date(context.uniqueDates[1].getTime() + 1));
  assert.deepEqual(recordTrajectoryPath(context, points), expected);
});

test("simulation folds each dated event once and charts reuse only changed restriction boundaries", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setAllSimulationNodePermissions("exports", false, dates[1]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[3]);
  toggle(context, "CR01", "CR02", true, dates[2]);
  context.setAllSimulationNodePermissions("exports", true, dates[4]);

  let appliedEvents = 0;
  const applyPermissions = context.applySimulationNodePermissions;
  context.applySimulationNodePermissions = (...args) => {
    appliedEvents += 1;
    return applyPermissions(...args);
  };
  const trajectory = context.buildSimulationTrajectory(settings);
  assert.equal(appliedEvents, 3);
  assert.deepEqual(Array.from(trajectory.boundaryIndices), [1, 4]);
  context.simulationState.trajectory = trajectory;
  context.getDisabledLinkKeys = context.getSimulationNodePermissions = () => {
    throw new Error("Chart rendering must not recompute restrictions");
  };
  const segments = [];
  const generator = (points) => {
    segments.push(points.map((point) => point.id));
    return "M";
  };
  generator.curve = () => generator;
  const points = dates.map((date, id) => ({ date, id }));
  assert.equal(context.getSimulationTrajectoryPath(points, generator), "MMMM");
  assert.deepEqual(segments, [[0, 1], [1, 2, 3], [3, 4], [4, 5]]);
  assert.equal(appliedEvents, 3);
});

test("link availability changes one date and removing the edit reproduces the baseline", () => {
  const context = runtime();
  const baseline = context.buildSimulationTrajectory(settings);
  assert.deepEqual(Array.from(baseline.seedIds), ["CR01"]);
  assert.ok(baseline.frames[0].nodeStates.CR02.newInfections > 0);
  assert.ok(baseline.frames[1].nodeStates.CR03.newInfections > 0);

  toggle(context, "CR01", "CR02", true);
  const blocked = context.buildSimulationTrajectory(settings);
  assert.deepEqual(blocked.holdings, baseline.holdings);
  assert.deepEqual(blocked.seedIds, baseline.seedIds);
  assert.equal(blocked.frames[0].nodeStates.CR02.I, 0);
  assert.equal(blocked.frames[0].nodeStates.CR01.outgoingPressure, 0);
  assert.equal(blocked.frames[0].linkStates.has("CR01-CR02"), false);
  for (const frame of blocked.frames.slice(1)) {
    assert.ok(frame.linkStates.get("CR01-CR02").riskLoad > 0);
    assert.equal(context.getSimulationLinkAvailability(frame.date).size, 0);
  }
  assert.equal(blocked.frames[1].nodeStates.CR03.I, 0);
  assert.ok(blocked.frames[2].nodeStates.CR03.I > 0);
  assert.notEqual(snapshot(blocked.frames[5]), snapshot(baseline.frames[5]));

  toggle(context, "CR01", "CR02", false);
  assert.equal(context.simulationLinkInterventions.size, 0);
  assert.equal(snapshot(context.buildSimulationTrajectory(settings)), snapshot(baseline));
});

test("a date-specific link edit preserves earlier frames and affects later infections", () => {
  const context = runtime();
  const baseline = context.buildSimulationTrajectory(settings);
  toggle(context, "CR01", "CR02", true, context.uniqueDates[2]);
  const blocked = context.buildSimulationTrajectory(settings);

  assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
  assert.deepEqual(blocked.holdings, baseline.holdings);
  assert.deepEqual(blocked.seedIds, baseline.seedIds);
  assert.equal(blocked.frames[2].nodeStates.CR02.incomingExposure, 0);
  assert.equal(blocked.frames[2].nodeStates.CR02.newInfections, 0);
  assert.equal(blocked.frames[2].linkStates.has("CR01-CR02"), false);
  assert.ok(blocked.frames[2].nodeStates.CR02.I < baseline.frames[2].nodeStates.CR02.I);
  assert.ok(blocked.frames[3].nodeStates.CR03.I < baseline.frames[3].nodeStates.CR03.I);
  assert.ok(blocked.frames[3].linkStates.get("CR01-CR02").riskLoad > 0);
  assert.ok(blocked.frames[2].linkStates.get("CR02-CR01").riskLoad > 0);
});

test("node exports stay restricted for every partner, including a route first seen on a future date", () => {
  const context = runtime();
  context.loadedCSVData = context.loadedCSVData.concat({
    COROP_LEV: "CR01", COROP_AFN: "CR41", AANTAL: 100,
    time: context.uniqueDates[4],
  });
  const baseline = context.buildSimulationTrajectory(settings);
  assert.ok(baseline.frames[4].linkStates.get("CR01-CR41").riskLoad > 0);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[2]);
  const blocked = context.buildSimulationTrajectory(settings);

  assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
  for (const frame of blocked.frames.slice(2)) {
    const disabled = context.getDisabledLinkKeys(frame.date);
    for (const id of blocked.ids) {
      assert.equal(disabled.has(`CR01-${id}`), id !== "CR01");
      assert.equal(disabled.has(`${id}-CR01`), false);
    }
    assert.equal(frame.nodeStates.CR01.outgoingPressure, 0);
    assert.equal(frame.linkStates.has("CR01-CR02"), false);
    assert.equal(frame.linkStates.has("CR01-CR41"), false);
    assert.ok(frame.linkStates.get("CR02-CR01").riskLoad > 0);
  }
});

test("node imports restrict every source without stopping the node's exports", () => {
  const context = runtime();
  context.setSimulationNodeIntervention("CR02", "imports", false, context.uniqueDates[2]);
  const blocked = context.buildSimulationTrajectory(settings);
  for (const frame of blocked.frames.slice(2)) {
    const disabled = context.getDisabledLinkKeys(frame.date);
    for (const id of blocked.ids) {
      assert.equal(disabled.has(`${id}-CR02`), id !== "CR02");
      assert.equal(disabled.has(`CR02-${id}`), false);
    }
    assert.equal(frame.nodeStates.CR02.incomingExposure, 0);
    assert.equal(frame.linkStates.has("CR01-CR02"), false);
    assert.ok(frame.linkStates.get("CR02-CR01").riskLoad > 0);
    assert.ok(frame.linkStates.get("CR02-CR03").riskLoad > 0);
  }
});

for (const mode of ["trade", "simulation"]) {
  test(`${mode} bulk permissions cover future partners without changing earlier frames or the other direction`, () => {
    for (const direction of ["exports", "imports"]) {
      const context = runtime();
      context.appDataMode = mode;
      context.loadedCSVData = context.loadedCSVData.concat({
        COROP_LEV: "CR01", COROP_AFN: "CR41", AANTAL: 100,
        time: context.uniqueDates[4],
      });
      const baseline = context.buildSimulationTrajectory(settings);
      assert.ok(baseline.frames[4].linkStates.get("CR01-CR41").riskLoad > 0);
      context.setAllSimulationNodePermissions(direction, false, context.uniqueDates[2]);
      const blocked = context.buildSimulationTrajectory(settings);
      const otherDirection = direction === "exports" ? "imports" : "exports";

      assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
      for (const frame of blocked.frames.slice(2)) {
        const permissions = context.getSimulationNodePermissions(frame.date);
        const disabled = context.getDisabledLinkKeys(frame.date);
        for (const id of blocked.ids) {
          assert.equal(permissions.get(id)[direction], false, `${direction}: ${id}`);
          assert.equal(permissions.get(id)[otherDirection], true, `${otherDirection}: ${id}`);
          assert.equal(disabled.has(`${id}-${id}`), false);
          for (const partner of blocked.ids) {
            if (id !== partner) assert.equal(disabled.has(`${id}-${partner}`), true);
          }
        }
        assert.equal(frame.linkStates.size, 0);
      }
    }
  });
}

test("bulk reopening preserves history, independent imports, date availability, and future scheduled restrictions", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setSimulationNodeIntervention("CR02", "imports", false, dates[1]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[5]);
  toggle(context, "CR02", "CR03", true, dates[4]);
  context.setAllSimulationNodePermissions("exports", false, dates[2]);
  const blocked = context.buildSimulationTrajectory(settings);
  const dateAvailability = snapshot(context.simulationLinkInterventions);
  const futureRestriction = snapshot(context.simulationNodeInterventions.get(dates[5].getTime()));

  context.setAllSimulationNodePermissions("exports", true, dates[4]);
  const reopened = context.buildSimulationTrajectory(settings);
  assert.equal(snapshot(reopened.frames.slice(0, 4)), snapshot(blocked.frames.slice(0, 4)));
  assert.equal(snapshot(context.simulationLinkInterventions), dateAvailability);
  assert.equal(snapshot(context.simulationNodeInterventions.get(dates[5].getTime())), futureRestriction);
  for (const id of reopened.ids) {
    const permissions = context.getSimulationNodePermissions(dates[4]).get(id);
    assert.equal(permissions.exports, true);
    assert.equal(permissions.imports, id !== "CR02");
    assert.equal(context.getSimulationNodePermissions(dates[5]).get(id).exports, id !== "CR01");
  }
  const disabled = context.getDisabledLinkKeys(dates[4]);
  assert.equal(disabled.has("CR01-CR02"), true);
  assert.equal(disabled.has("CR02-CR03"), true);
  assert.equal(disabled.has("CR02-CR01"), false);
  assert.equal(context.getSimulationLinkAvailability(dates[5]).size, 0);
});

test("re-enabling exports preserves restriction history and leaves imports independently restricted", () => {
  const context = runtime();
  const baseline = context.buildSimulationTrajectory(settings);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR01", "imports", false, context.uniqueDates[3]);
  const blocked = context.buildSimulationTrajectory(settings);
  context.setSimulationNodeIntervention("CR01", "exports", true, context.uniqueDates[4]);
  const reopened = context.buildSimulationTrajectory(settings);

  assert.equal(snapshot(reopened.frames.slice(0, 4)), snapshot(blocked.frames.slice(0, 4)));
  for (const frame of reopened.frames.slice(4)) {
    assert.ok(frame.linkStates.get("CR01-CR02").riskLoad > 0);
    assert.equal(frame.linkStates.has("CR02-CR01"), false);
    assert.equal(context.getSimulationNodePermissions(frame.date).get("CR01").exports, true);
    assert.equal(context.getSimulationNodePermissions(frame.date).get("CR01").imports, false);
  }
  assert.ok(reopened.frames[5].nodeStates.CR03.I > blocked.frames[5].nodeStates.CR03.I);
  assert.ok(reopened.frames[5].nodeStates.CR03.I < baseline.frames[5].nodeStates.CR03.I);
});

test("date availability, source exports, and target imports must all permit a route", () => {
  const context = runtime();
  const date = context.uniqueDates[2];
  toggle(context, "CR01", "CR02", true, date);
  context.setSimulationNodeIntervention("CR01", "exports", false, date);
  context.setSimulationNodeIntervention("CR02", "imports", false, date);

  toggle(context, "CR01", "CR02", false, date);
  assert.equal(context.getSimulationLinkAvailability(date).has("CR01-CR02"), false);
  assert.equal(context.getDisabledLinkKeys(date).has("CR01-CR02"), true);
  context.setSimulationNodeIntervention("CR01", "exports", true, date);
  assert.equal(context.getDisabledLinkKeys(date).has("CR01-CR02"), true);
  toggle(context, "CR01", "CR02", true, date);
  context.setSimulationNodeIntervention("CR02", "imports", true, date);
  assert.equal(context.getDisabledLinkKeys(date).has("CR01-CR02"), true);
  toggle(context, "CR01", "CR02", false, date);
  assert.equal(context.getDisabledLinkKeys(date).has("CR01-CR02"), false);
});

for (const mode of ["trade", "simulation"]) {
  test(`Restore in ${mode} mode clears past and future schedules when the current date has every route enabled`, () => {
    const context = runtime();
    context.appDataMode = mode;
    const rawLedger = snapshot(context.loadedCSVData);
    const baseline = context.buildSimulationTrajectory(settings);
    toggle(context, "CR01", "CR02", true, context.uniqueDates[1]);
    context.setSimulationNodeIntervention("CR02", "imports", false, context.uniqueDates[1]);
    context.setSimulationNodeIntervention("CR02", "imports", true, context.uniqueDates[2]);
    toggle(context, "CR02", "CR03", true, context.uniqueDates[4]);
    context.setSimulationNodeIntervention("CR03", "exports", false, context.uniqueDates[4]);
    context.window.currentDate = context.uniqueDates[3];
    assert.equal(context.getDisabledLinkKeys(context.window.currentDate).size, 0);
    context.simulationState.trajectory = context.buildSimulationTrajectory(settings);
    assert.notEqual(snapshot(context.simulationState.trajectory), snapshot(baseline));
    context.refreshNetworkControlStats();
    assert.ok(context.uniqueDates.some((date) =>
      context.window.allTemporalStats[date.toISOString()].totalTradeVolume !== 1200));

    const recomputes = [];
    const gravityRenders = [];
    Object.assign(context, {
      document: { getElementById: () => ({}) },
      selectedNodeData: { id: "CR01" }, annotationGroup: null,
      updateNodeTradeDistribution: () => gravityRenders.push("node"),
      updateTradeDistribution: () => gravityRenders.push("network"),
      scheduleSimulationRecompute: (reason) => {
        recomputes.push(reason);
        context.simulationState.trajectory = context.buildSimulationTrajectory(settings);
      },
    });
    context.d3.selectAll = () => ({ property() {} });
    for (const name of [
      "updateTradeTable", "updateInOutArbos", "updateTradeNodeInsight", "updateNetwork",
      "updateDonutCharts", "updateNetworkStats", "updateHotspotMarks", "computeSCCs",
      "updateSCCs", "updateAnnotationForNode", "disableAllCheckboxes", "enableAllCheckboxes",
      "renderSimulationNodeControls", "updateGlobalStatsChart", "updateNodeStatsChart",
    ]) context[name] = () => {};

    context.restoreLinks();

    assert.equal(context.simulationLinkInterventions.size, 0);
    assert.equal(context.simulationNodeInterventions.size, 0);
    assert.equal(recomputes.length, mode === "simulation" ? 1 : 0);
    assert.deepEqual(gravityRenders, mode === "trade" ? ["node"] : []);
    for (const date of context.uniqueDates) {
      assert.equal(context.getDisabledLinkKeys(date).size, 0);
    }
    if (mode === "simulation") {
      assert.equal(context.networkStatsDirtyFrom, context.uniqueDates[0].getTime());
      context.refreshNetworkControlStats();
    }
    assert.ok(context.uniqueDates.every((date) =>
      context.window.allTemporalStats[date.toISOString()].totalTradeVolume === 1200));
    assert.equal(snapshot(context.buildSimulationTrajectory(settings)), snapshot(baseline));
    if (mode === "simulation") {
      assert.equal(snapshot(context.simulationState.trajectory), snapshot(baseline));
    }
    assert.equal(context.allLinks.some((link) => link.disabled), false);
    assert.equal(snapshot(context.loadedCSVData), rawLedger);
  });
}

test("backdated and same-date availability edits leave other dates independent", () => {
  const context = runtime();
  const [d0, d1, d2, d3, d4, d5] = context.uniqueDates;
  toggle(context, "CR01", "CR02", true, d2);
  toggle(context, "CR01", "CR02", true, d4);
  toggle(context, "CR02", "CR03", true, d3);
  toggle(context, "CR02", "CR03", true, d5);
  toggle(context, "CR01", "CR02", true, d1);
  const before = context.buildSimulationTrajectory(settings);
  toggle(context, "CR01", "CR02", false, d2);
  toggle(context, "CR02", "CR03", false, d2);
  toggle(context, "CR01", "CR02", false, d0);
  const after = context.buildSimulationTrajectory(settings);
  const expected = [[], ["CR01-CR02"], [], ["CR02-CR03"], ["CR01-CR02"], ["CR02-CR03"]];
  context.uniqueDates.forEach((date, index) => {
    assert.deepEqual(Array.from(context.getDisabledLinkKeys(date)).sort(), expected[index]);
  });
  assert.equal(snapshot(after.frames.slice(0, 2)), snapshot(before.frames.slice(0, 2)));
  assert.ok(after.frames[2].linkStates.get("CR01-CR02").riskLoad > 0);
  assert.equal(after.frames[3].linkStates.has("CR02-CR03"), false);
  assert.equal(after.frames[4].linkStates.has("CR01-CR02"), false);
  assert.equal(after.frames[5].linkStates.has("CR02-CR03"), false);
});

test("node events fold in date order and preserve later permissions after a backdated edit", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setSimulationNodeIntervention("CR01", "exports", true, dates[4]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[2]);
  context.setSimulationNodeIntervention("CR01", "imports", false, dates[3]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[1]);
  context.setSimulationNodeIntervention("CR01", "exports", true, dates[2]);
  const expectedExports = [true, false, true, true, true, true];
  dates.forEach((date, index) => {
    const permissions = context.getSimulationNodePermissions(date).get("CR01");
    assert.equal(permissions?.exports ?? true, expectedExports[index]);
    assert.equal(permissions?.imports ?? true, index < 3);
  });
});

test("restriction start dates span redundant events and reset after reopening", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[2]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[1]);
  context.setSimulationNodeIntervention("CR01", "imports", false, dates[2]);
  let permission = context.getSimulationNodePermissions(dates[3]).get("CR01");
  assert.equal(permission.exportsSince, dates[1].getTime());
  assert.equal(permission.importsSince, dates[2].getTime());
  assert.equal(context.simulationNodeInterventions.get(dates[2].getTime()).get("CR01").exports, false);

  context.setSimulationNodeIntervention("CR01", "exports", true, dates[3]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[4]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[5]);
  assert.equal(context.getSimulationNodePermissions(dates[3]).get("CR01").exports, true);
  permission = context.getSimulationNodePermissions(dates[5]).get("CR01");
  assert.equal(permission.exportsSince, dates[4].getTime());
  assert.equal(permission.importsSince, dates[2].getTime());
});

test("a node intervention between frame dates first affects the next frame", () => {
  const context = runtime();
  const baseline = context.buildSimulationTrajectory(settings);
  const between = new Date((context.uniqueDates[1].getTime() + context.uniqueDates[2].getTime()) / 2);
  context.setSimulationNodeIntervention("CR01", "exports", false, between);
  const blocked = context.buildSimulationTrajectory(settings);
  assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
  for (const frame of blocked.frames.slice(2)) {
    assert.equal(frame.linkStates.has("CR01-CR02"), false);
    assert.equal(frame.nodeStates.CR02.incomingExposure, 0);
  }
  assert.ok(blocked.frames[2].nodeStates.CR02.I < baseline.frames[2].nodeStates.CR02.I);
});

test("node movement restrictions preserve local transmission and self-loop movements", () => {
  const context = runtime([["CR01", "CR01", 1000]]);
  const localSettings = { ...settings, beta: 0.3 };
  const baseline = context.buildSimulationTrajectory(localSettings);
  assert.ok(baseline.frames[0].nodeStates.CR01.newInfections > 0);
  assert.equal(baseline.frames[0].nodeStates.CR01.incomingExposure, 0);
  assert.equal(baseline.frames[0].nodeStates.CR01.outgoingPressure, 0);
  assert.ok(baseline.frames[0].linkStates.get("CR01-CR01").riskLoad > 0);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR01", "imports", false, context.uniqueDates[2]);
  assert.equal(snapshot(context.buildSimulationTrajectory(localSettings).frames), snapshot(baseline.frames));

  toggle(context, "CR01", "CR01", true, context.uniqueDates[2]);
  const blocked = context.buildSimulationTrajectory(localSettings);
  assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
  assert.equal(blocked.frames[2].nodeStates.CR01.newInfections, 0);
  assert.equal(blocked.frames[2].nodeStates.CR01.incomingExposure, 0);
  assert.equal(blocked.frames[2].linkStates.has("CR01-CR01"), false);
  assert.equal(blocked.frames[2].nodeStates.CR01.I, blocked.frames[1].nodeStates.CR01.I);
  assert.ok(blocked.frames[3].nodeStates.CR01.newInfections > 0);
  assert.ok(blocked.frames[3].linkStates.get("CR01-CR01").riskLoad > 0);
  toggle(context, "CR01", "CR01", false, context.uniqueDates[2]);
  assert.equal(snapshot(context.buildSimulationTrajectory(localSettings).frames), snapshot(baseline.frames));
});

test("replay applies both intervention scopes and restores flags when stepping backward", () => {
  const context = runtime();
  toggle(context, "CR01", "CR02", true, context.uniqueDates[2]);
  toggle(context, "CR01", "CR01", true, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR02", "exports", false, context.uniqueDates[3]);
  context.setSimulationNodeIntervention("CR02", "exports", true, context.uniqueDates[5]);
  context.simulationState.trajectory = context.buildSimulationTrajectory(settings);
  for (const index of [0, 2, 4, 5, 3, 1]) {
    const date = context.uniqueDates[index];
    context.window.currentDate = date;
    context.initNodesAndLinks(context.loadedCSVData.filter((row) => row.time === date));
    const expected = index === 2 ? ["CR01-CR01", "CR01-CR02"]
      : index === 3 || index === 4 ? context.simulationState.trajectory.ids
        .filter((id) => id !== "CR02").map((id) => `CR02-${id}`).sort() : [];
    const disabledFlags = () => context.allLinks.filter((link) => link.disabled)
      .map((link) => context.getLinkKey(link.source, link.target)).sort();
    const ledgerWeights = new Map(context.allLinks.map((link) => [link.id, link.weight]));
    assert.deepEqual(Array.from(disabledFlags()), Array.from(expected));
    context.allLinks.forEach((link) => { link.disabled = true; });
    assert.equal(context.applySimulationFrame(date), true);
    assert.equal(context.applySimulationFrame(date), true);
    for (const link of context.allLinks) assert.equal(link.ledgerWeight, ledgerWeights.get(link.id));
    assert.deepEqual(Array.from(disabledFlags()), Array.from(expected));
    assert.equal(context.enabledLinks.some((link) => link.disabled), false);
    assert.equal(snapshot(context.simulationState.currentFrame), snapshot(context.simulationState.trajectory.frames[index]));
  }
});

test("all compartment models conserve holdings with restricted links", () => {
  const context = runtime();
  toggle(context, "CR02", "CR01", true, context.uniqueDates[1]);
  toggle(context, "CR02", "CR02", true, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR02", "exports", false, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR03", "imports", false, context.uniqueDates[3]);
  context.setSimulationNodeIntervention("CR02", "exports", true, context.uniqueDates[4]);
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    const trajectory = context.buildSimulationTrajectory({ ...settings, model, beta: 0.4, gamma: 0.2 });
    for (const frame of trajectory.frames) {
      for (const [id, state] of Object.entries(frame.nodeStates)) {
        assert.equal(state.N, trajectory.holdings.get(id));
        assert.ok(Math.abs(state.S + state.E + state.I + state.R - state.N) < 1e-8, `${model}: ${id}`);
        assert.ok([state.S, state.E, state.I, state.R].every((value) => Number.isFinite(value) && value >= 0));
      }
      assert.ok(Math.abs(frame.summary.S + frame.summary.E + frame.summary.I + frame.summary.R - frame.summary.N) < 1e-8);
    }
  }
});

test("simulation edge colors retain a valid zero logarithmic endpoint", () => {
  const context = runtime([["CR01", "CR02", 1000], ["CR01", "CR03", 8000]]);
  context.simulationState.trajectory = context.buildSimulationTrajectory({ ...settings, movementBeta: 0.02 });
  context.applySimulationFrame(context.uniqueDates[0]);
  assert.deepEqual(Array.from(context.enabledLinks, (link) => link.weight).sort((a, b) => a - b), [1, 8]);
  assert.deepEqual(Array.from(context.edgeExtent), [0, Math.log(8)]);
});

test("zero transition and transmission rates freeze all compartment models", () => {
  const context = runtime([["CR01", "CR01", 500], ["CR01", "CR02", 1000]]);
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    const trajectory = context.buildSimulationTrajectory({ ...settings, model, beta: 0, movementBeta: 0, gamma: 0, sigma: 0 });
    const first = trajectory.frames[0];
    for (const frame of trajectory.frames) {
      assert.equal(snapshot(frame.nodeStates), snapshot(first.nodeStates));
      assert.equal(frame.summary.newInfections, 0);
      assert.ok(Array.from(frame.linkStates.values()).every((link) => link.riskLoad === 0));
    }
  }
});

test("blocking every movement and local route preserves earlier states and stops new infections", () => {
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    const context = runtime([["CR01", "CR01", 500], ["CR01", "CR02", 1000]]);
    const parameters = { ...settings, model, beta: 2, movementBeta: 2, gamma: 0, sigma: 0 };
    const baseline = context.buildSimulationTrajectory(parameters);
    const block = () => {
      context.setAllSimulationNodePermissions("exports", false, context.uniqueDates[2]);
      for (const date of context.uniqueDates.slice(2)) {
        for (const id of baseline.ids) toggle(context, id, id, true, date);
      }
    };
    block();
    const trajectory = context.buildSimulationTrajectory(parameters);
    assert.equal(snapshot(trajectory.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
    for (const frame of trajectory.frames.slice(2)) {
      assert.equal(frame.linkStates.size, 0);
      assert.equal(frame.summary.newInfections, 0);
      for (const [id, state] of Object.entries(frame.nodeStates)) {
        for (const field of ["S", "E", "I", "R", "N"]) assert.equal(state[field], baseline.frames[1].nodeStates[id][field]);
        assert.equal(state.incomingExposure, 0);
        assert.equal(state.outgoingPressure, 0);
      }
    }
    block();
    assert.equal(snapshot(context.buildSimulationTrajectory(parameters)), snapshot(trajectory));
  }
});
