import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const functions = [
  "getNodeId", "getLinkKey", "getTradeRecordsByDate", "getStatnaam",
  "getSimulationLinkAvailability", "getSimulationNodePermissions", "applySimulationNodePermissions",
  "getSimulationRestrictionTimeline", "getComparisonInterventionEvents",
  "getDisabledLinkKeys", "setSimulationLinkIntervention", "setSimulationNodeIntervention",
  "collectSimulationRegionIds", "buildSimulationLedger", "estimateSimulationHoldings",
  "getSimulationFrameSummary", "buildSimulationTrajectory", "computeTemporalNetworkStats",
  "computeSimpleStats", "computeNumberOfConnectedComponents", "computeModularity",
  "computeTradeCommunityTimeline", "evaluatePartitionModularity",
  "computeHotSpotMetrics", "computeEigenvectorCentrality", "buildAdjList",
  "getStronglyConnectedComponents", "computePerronPair", "computePerronRoot", "computeSpectralRadius",
  "getComparisonMetricDefinitions", "buildComparisonSeries", "getOriginalSimulationSeries", "getComparisonData", "initHerdLink",
].map((name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}).join("\n");
const settings = {
  model: "SIR", seedRegion: "CR01", initialPct: 5,
  beta: 0.3, movementBeta: 2, gamma: 0.1, sigma: 0.3,
};
const plain = (value) => JSON.parse(JSON.stringify(value, (_, item) => item instanceof Map ? Array.from(item) : item));

function runtime() {
  const uniqueDates = Array.from({ length: 4 }, (_, index) => new Date(Date.UTC(2020, 0, 1 + index * 7)));
  const loadedCSVData = uniqueDates.flatMap((time, index) => [
    ["CR01", "CR02", 10 * (index + 1)], ["CR02", "CR01", 2], ["CR02", "CR03", 1],
  ].map(([COROP_LEV, COROP_AFN, AANTAL]) => ({ COROP_LEV, COROP_AFN, AANTAL, time })));
  const values = (items, accessor = (item) => item) => Array.from(items, accessor);
  const context = vm.createContext({
    Date, Map, Set, uniqueDates, loadedCSVData,
    simulationRegionIdsByDataset: new WeakMap(), tradeRecordsByDataset: new WeakMap(),
    originalLedgerStatsByDataset: new WeakMap(), tradeCommunityTimeline: null, communityScale: "broad",
    simulationLinkInterventions: new Map(), simulationNodeInterventions: new Map(),
    networkStatsDirtyDates: new Set(), networkStatsDirtyFrom: null, ledgerBaselineSpectralRadius: 0,
    comparisonDataCache: new Map(), comparisonDataError: null, appDataMode: "trade", simulationRecomputeTimer: null,
    simulationState: { status: "idle" }, selectedNodeData: null, nlLabelPoints: null,
    window: { currentDate: uniqueDates[0] },
    metricNames: ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"],
    d3: {
      min: (items, accessor) => Math.min(...values(items, accessor)),
      max: (items, accessor) => Math.max(...values(items, accessor)),
      sum: (items, accessor) => values(items, accessor).reduce((sum, value) => sum + value, 0),
    },
  });
  vm.runInContext(readFileSync(new URL("../src/runtime/jLouvain.js", import.meta.url), "utf8") + "\n" + functions, context);
  context.computeTemporalNetworkStats();
  return context;
}

function runSimulation(context, parameters = settings) {
  context.appDataMode = "simulation";
  context.simulationState = {
    status: "ready", settings: parameters, trajectory: context.buildSimulationTrajectory(parameters),
  };
}

test("explicit ledger scenarios preserve live data, restrictions, dirty flags and cached statistics", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setSimulationLinkIntervention("CR01-CR02", true, dates[1]);
  context.setSimulationNodeIntervention("CR02", "exports", false, dates[2]);
  const before = plain({
    data: context.loadedCSVData, window: context.window, links: context.simulationLinkInterventions,
    nodes: context.simulationNodeInterventions, dirty: Array.from(context.networkStatsDirtyDates),
    dirtyFrom: context.networkStatsDirtyFrom, radius: context.ledgerBaselineSpectralRadius,
    baseline: context.originalLedgerStatsByDataset.get(context.loadedCSVData),
  });
  const original = context.computeTemporalNetworkStats(dates, {
    data: context.loadedCSVData, nodeInterventions: new Map(), linkInterventions: new Map(), store: false,
  });
  const current = context.computeTemporalNetworkStats(dates, { store: false });
  assert.deepEqual(dates.map((date) => original.global[date.toISOString()].totalTradeVolume), [13, 23, 33, 43]);
  assert.deepEqual(dates.map((date) => current.global[date.toISOString()].totalTradeVolume), [13, 3, 30, 40]);
  assert.equal(original.global[dates[0].toISOString()].avgTradeEdge, 13 / 3);
  assert.equal(current.node[dates[2].toISOString()].CR02.outDegree, 0);
  assert.equal(original.node[dates[2].toISOString()].CR02.outDegree, 3);
  assert.ok(Math.abs(original.global[dates[0].toISOString()].spectralRadius - Math.sqrt(20)) < 1e-5);
  assert.ok(Math.abs(original.global[dates[3].toISOString()].spectralRadius - Math.sqrt(80)) < 1e-5);
  assert.equal(current.global[dates[3].toISOString()].spectralRadius, 0);
  assert.deepEqual(plain({
    data: context.loadedCSVData, window: context.window, links: context.simulationLinkInterventions,
    nodes: context.simulationNodeInterventions, dirty: Array.from(context.networkStatsDirtyDates),
    dirtyFrom: context.networkStatsDirtyFrom, radius: context.ledgerBaselineSpectralRadius,
    baseline: context.originalLedgerStatsByDataset.get(context.loadedCSVData),
  }), before);
});

test("unmodified comparisons reuse live calculations and retain an immutable original through edits and date changes", () => {
  const context = runtime();
  const calculate = context.computeTemporalNetworkStats;
  let calculations = 0;
  context.computeTemporalNetworkStats = (...args) => { calculations++; return calculate(...args); };
  const first = context.getComparisonData();
  assert.equal(calculations, 0);
  assert.equal(first.status, "ready");
  assert.equal(first.original, first.intervention);
  const original = plain(first.original);
  context.window.currentDate = context.uniqueDates[3];
  context.selectedNodeData = { id: "CR02" };
  const moved = context.getComparisonData();
  assert.equal(moved.date, context.uniqueDates[3].toISOString());
  assert.equal(moved.selectedRegionId, "CR02");
  assert.equal(moved.original, first.original);
  assert.equal(moved.intervention, first.intervention);
  assert.equal(calculations, 0);

  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[2]);
  calculate();
  const edited = context.getComparisonData();
  assert.equal(calculations, 0);
  assert.equal(edited.original, first.original);
  assert.deepEqual(plain(edited.original), original);
  assert.equal(edited.intervention.global[2].totalTradeVolume, 3);
  assert.equal(edited.intervention.nodes.CR01[2].outDegree, 0);
  context.simulationNodeInterventions.clear();
  calculate();
  assert.deepEqual(plain(context.getComparisonData().intervention), original);
});

test("first opening after ledger edits reuses original statistics and preserves precision and absent regions", () => {
  const context = runtime();
  const originalStats = plain(context.window);
  context.setSimulationLinkIntervention("CR02-CR03", true, context.uniqueDates[0]);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[2]);
  context.computeTemporalNetworkStats();
  const live = plain(context.window);
  const calculate = context.computeTemporalNetworkStats;
  let calculations = 0;
  context.computeTemporalNetworkStats = (...args) => { calculations++; return calculate(...args); };
  const data = context.getComparisonData();
  assert.equal(calculations, 0);
  assert.equal(data.original.global[0].avgTradeEdge, 13 / 3);
  assert.equal(data.intervention.global[0].avgTradeEdge, 6);
  assert.equal(data.intervention.global[0].avgTradeEdge - data.original.global[0].avgTradeEdge, 6 - 13 / 3);
  assert.equal(data.original.nodes.CR40[0].inDegree, 0);
  assert.equal(data.original.nodes.CR40[0].outDegree, 0);
  for (const [index, date] of context.uniqueDates.entries()) {
    const key = date.toISOString();
    for (const metric of data.globalMetrics) {
      assert.equal(data.original.global[index][metric.key], originalStats.allTemporalStats[key][metric.key]);
    }
    for (const { id } of data.regions) {
      for (const metric of data.nodeMetrics) {
        assert.equal(data.original.nodes[id][index][metric.key], originalStats.allTemporalNodeStats[key][id][metric.key]);
      }
    }
  }
  for (const date of context.uniqueDates) {
    context.window.currentDate = date;
    assert.equal(context.getComparisonData().original, data.original);
  }
  assert.equal(calculations, 0);
  context.window.currentDate = context.uniqueDates[0];
  assert.deepEqual(plain(context.window), live);
  assert.ok(!data.globalMetrics.some(({ key }) => key === "partition"));
});

test("a restricted dataset computes only missing original dates and reuses them across sample changes", () => {
  const context = runtime();
  const allDates = context.uniqueDates;
  const prior = context.getComparisonData();
  context.loadedCSVData = context.loadedCSVData.map((row) => ({ ...row, AANTAL: row.AANTAL * 10 }));
  context.uniqueDates = allDates.slice(0, 2);
  context.setSimulationLinkIntervention("CR01-CR02", true, allDates[1]);
  context.computeTemporalNetworkStats();
  const before = plain({
    window: context.window, dirty: [...context.networkStatsDirtyDates],
    dirtyFrom: context.networkStatsDirtyFrom, radius: context.ledgerBaselineSpectralRadius,
  });
  const calculate = context.computeTemporalNetworkStats;
  const calculations = [];
  context.computeTemporalNetworkStats = (dates, inputs) => {
    calculations.push({ dates: dates.map((date) => date.toISOString()), store: inputs?.store });
    return calculate(dates, inputs);
  };
  const first = context.getComparisonData();
  const firstOriginal = plain(first.original);
  assert.deepEqual(calculations, [{ dates: allDates.slice(0, 2).map((date) => date.toISOString()), store: false }]);
  assert.deepEqual(plain(first.original.global.map((row) => row.totalTradeVolume)), [130, 230]);
  assert.equal(first.intervention.global[1].totalTradeVolume, 30);
  assert.equal(prior.original.global[0].totalTradeVolume, 13);
  assert.deepEqual(plain({
    window: context.window, dirty: [...context.networkStatsDirtyDates],
    dirtyFrom: context.networkStatsDirtyFrom, radius: context.ledgerBaselineSpectralRadius,
  }), before);

  context.uniqueDates = allDates;
  calculate();
  const expanded = context.getComparisonData();
  assert.deepEqual(plain(expanded.original.global.map((row) => row.totalTradeVolume)), [130, 230, 330, 430]);
  context.uniqueDates = allDates.slice(1, 3);
  const narrowed = context.getComparisonData();
  assert.deepEqual(plain(narrowed.original.global.map((row) => row.totalTradeVolume)), [230, 330]);
  assert.deepEqual(calculations, [
    { dates: allDates.slice(0, 2).map((date) => date.toISOString()), store: false },
    { dates: allDates.slice(2).map((date) => date.toISOString()), store: false },
  ]);
  assert.deepEqual(plain(first.original), firstOriginal);
});

test("simulation baselines use the same model, seed, population and steps with explicit empty restrictions", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setSimulationLinkIntervention("CR01-CR01", true, dates[2]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[2]);
  context.setSimulationNodeIntervention("CR01", "imports", false, dates[2]);
  const schedules = plain([context.simulationNodeInterventions, context.simulationLinkInterventions]);
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    const parameters = { ...settings, model };
    runSimulation(context, parameters);
    const currentTrajectory = context.simulationState.trajectory;
    const expected = context.buildSimulationTrajectory(parameters, {
      nodeInterventions: new Map(), linkInterventions: new Map(),
    });
    const data = context.getComparisonData();
    assert.equal(data.settings, parameters);
    assert.deepEqual(plain(data.original.global.slice(0, 2)), plain(data.intervention.global.slice(0, 2)));
    for (const [index, frame] of expected.frames.entries()) {
      for (const { key } of data.globalMetrics) assert.equal(data.original.global[index][key], frame.summary[key]);
      for (const id of expected.ids) {
        assert.equal(data.original.nodes[id][index].N, data.intervention.nodes[id][index].N);
        for (const { key } of data.nodeMetrics) assert.equal(data.original.nodes[id][index][key], frame.nodeStates[id][key]);
      }
    }
    assert.ok(data.original.nodes.CR01[2].newInfections > 0);
    assert.equal(data.intervention.nodes.CR01[2].newInfections, 0);
    assert.equal(data.intervention.nodes.CR02[2].incomingExposure, 0);
    assert.equal(context.simulationState.trajectory, currentTrajectory);
    assert.ok(Math.abs(data.original.global[3].cumulativeInfections -
      data.original.global.reduce((sum, frame) => sum + frame.newInfections, 0)) < 1e-9);
    assert.equal(data.original.nodes.CR01[3].cumulativeInfections,
      data.original.nodes.CR01.reduce((sum, frame) => sum + frame.newInfections, 0));
    assert.ok(!data.nodeMetrics.some(({ key }) => key === "rtProxy"));
    assert.deepEqual(plain([context.simulationNodeInterventions, context.simulationLinkInterventions]), schedules);
  }
});

test("simulation comparison caches ignore inspection changes and refresh for settings and intervention runs", () => {
  const context = runtime();
  runSimulation(context);
  const calculate = context.buildSimulationTrajectory;
  let calculations = 0;
  context.buildSimulationTrajectory = (...args) => { calculations++; return calculate(...args); };
  const first = context.getComparisonData();
  assert.equal(calculations, 0);
  context.window.currentDate = context.uniqueDates[2];
  context.selectedNodeData = { id: "CR02" };
  assert.equal(context.getComparisonData().original, first.original);
  assert.equal(calculations, 0);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[1]);
  context.simulationRecomputeTimer = 5;
  assert.equal(context.getComparisonData().status, "loading");
  assert.equal(calculations, 0);
  context.simulationRecomputeTimer = null;
  context.simulationState.status = "running";
  assert.equal(context.getComparisonData().intervention, null);
  runSimulation(context);
  const restricted = context.getComparisonData();
  assert.equal(calculations, 1);
  assert.equal(restricted.original, first.original);
  assert.notEqual(restricted.intervention, first.intervention);
  assert.ok(restricted.intervention.nodes.CR02[3].I < restricted.original.nodes.CR02[3].I);

  runSimulation(context, { ...settings, seedRegion: "CR02", initialPct: 9, beta: 0.6 });
  const changed = context.getComparisonData();
  assert.equal(calculations, 3);
  assert.notEqual(changed.original, first.original);
  assert.equal(changed.settings.seedRegion, "CR02");
  assert.ok(changed.original.nodes.CR02[0].I > first.original.nodes.CR02[0].I);
  context.appDataMode = "trade";
  context.computeTemporalNetworkStats();
  const trade = context.getComparisonData();
  assert.equal(trade.mode, "trade");
  assert.equal(trade.settings, null);
  assert.ok(trade.globalMetrics.some(({ key }) => key === "totalTradeVolume"));
  assert.ok(!trade.globalMetrics.some(({ key }) => key === "I"));
});

test("explicit simulation and ledger inputs remain independent of the displayed dataset and dates", () => {
  const context = runtime();
  const data = context.loadedCSVData;
  const dates = context.uniqueDates;
  const nodeInterventions = new Map([[dates[2].getTime(), new Map([["CR02", { imports: false }]])]]);
  const linkInterventions = new Map([[dates[1].getTime(), new Map([["CR01-CR02", true]])]]);
  const inputs = { data, dates, nodeInterventions, linkInterventions, store: false };
  const simulation = plain(context.buildSimulationTrajectory(settings, inputs));
  const ledger = plain(context.computeTemporalNetworkStats(dates, inputs));
  context.loadedCSVData = [];
  context.uniqueDates = [new Date("2030-01-01")];
  context.simulationLinkInterventions.set(dates[0].getTime(), new Map([["CR01-CR01", true]]));
  context.simulationNodeInterventions.set(dates[0].getTime(), new Map([["CR01", { exports: false }]]));
  assert.deepEqual(plain(context.buildSimulationTrajectory(settings, inputs)), simulation);
  assert.deepEqual(plain(context.computeTemporalNetworkStats(dates, inputs)), ledger);
  assert.equal(nodeInterventions.get(dates[2].getTime()).get("CR02").imports, false);
  assert.equal(linkInterventions.get(dates[1].getTime()).has("CR01-CR02"), true);
});

test("dataset and sampled date changes rebuild comparison caches without borrowing old holdings", () => {
  const context = runtime();
  const firstTrade = context.getComparisonData();
  runSimulation(context);
  const firstSimulation = context.getComparisonData();
  context.window.isSwitchingCSV = true;
  assert.equal(context.getComparisonData().status, "loading");
  context.loadedCSVData = context.loadedCSVData.map((row) => ({ ...row,
    AANTAL: row.COROP_LEV === "CR02" ? row.AANTAL * 1000 : row.AANTAL,
  }));
  context.uniqueDates = context.uniqueDates.slice(0, 2);
  context.computeTemporalNetworkStats();
  context.window.isSwitchingCSV = false;
  context.appDataMode = "trade";
  const trade = context.getComparisonData();
  assert.equal(trade.dates.length, 2);
  assert.notEqual(trade.original, firstTrade.original);
  assert.equal(trade.original.global[0].totalTradeVolume, 3010);
  runSimulation(context);
  const simulation = context.getComparisonData();
  assert.equal(simulation.original.global.length, 2);
  assert.notEqual(simulation.original, firstSimulation.original);
  assert.ok(simulation.regions.some(({ id }) =>
    simulation.original.nodes[id][0].N !== firstSimulation.original.nodes[id][0].N));
});

test("failed CSV fetches and parsing publish an error instead of stale results, and another load clears it", async () => {
  for (const failure of ["fetch", "parse"]) {
    const context = runtime();
    assert.equal(context.getComparisonData().status, "ready");
    const updates = [];
    Object.assign(context, {
      forceSim: null, svg: null, mapLayers: { unmount() {} }, persistentUiHandlersBound: true,
      cancelSimulationRecompute() {}, setTimeReplayState() {}, disableAllButtons() {},
      disableAllCheckboxes() {}, removeTimeControlListeners() {}, console: { error() {} },
      document: { getElementById: () => ({ style: {} }) },
      fetch: failure === "fetch" ? () => Promise.reject(new Error("Connection failed"))
        : () => Promise.resolve({ ok: true, text: () => Promise.resolve("unreadable data") }),
    });
    context.d3.csvParse = () => { throw new Error("Parse failed"); };
    context.window.herdlinkComparison = { refresh: () => updates.push(context.getComparisonData()) };
    context.initHerdLink("test.csv");
    await new Promise(setImmediate);
    assert.deepEqual(updates.map(({ status }) => status), ["loading", "error"]);
    const result = context.getComparisonData();
    assert.equal(result.status, "error");
    assert.match(result.message, /dataset could not be loaded/i);
    assert.equal(result.original, null);
    assert.equal(result.intervention, null);
    context.fetch = () => new Promise(() => {});
    context.initHerdLink("retry.csv");
    assert.equal(context.comparisonDataError, null);
    assert.equal(updates.at(-1).status, "loading");
  }
});

test("intervention markers group real node changes and exact-date route edits without moving unmatched link dates", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  const before = new Date(dates[0].getTime() - 86400000);
  const between = new Date((dates[0].getTime() + dates[1].getTime()) / 2);
  const after = new Date(dates[3].getTime() + 86400000);
  const nodeChange = (id, direction, allowed, date) => context.setSimulationNodeIntervention(id, direction, allowed, date);
  nodeChange("CR01", "exports", true, dates[2]);
  nodeChange("CR01", "exports", false, before);
  nodeChange("CR01", "exports", false, dates[0]);
  nodeChange("CR01", "imports", false, between);
  nodeChange("CR01", "imports", false, dates[1]);
  nodeChange("CR01", "imports", true, dates[2]);
  nodeChange("CR01", "exports", false, after);
  nodeChange("CR02", "exports", false, dates[2]);
  nodeChange("CR03", "imports", true, dates[0]);
  for (const date of [before, between, after]) context.setSimulationLinkIntervention("CR03-CR01", true, date);
  for (const key of ["CR01-CR02", "CR02-CR02", "CR02-CR03"]) {
    context.setSimulationLinkIntervention(key, true, dates[1]);
  }
  const schedules = plain([context.simulationNodeInterventions, context.simulationLinkInterventions]);
  const ids = context.collectSimulationRegionIds(context.loadedCSVData);
  const markers = plain(context.getComparisonInterventionEvents(dates, ids, "trade"));
  assert.deepEqual(markers.map(({ date }) => date), dates.slice(0, 3).map((date) => date.toISOString()));
  assert.deepEqual(markers.map(({ events }) => events.length), [1, 4, 3]);
  assert.deepEqual(markers[0].events, [{ date: before.toISOString(), description: "Exports blocked for CR01 from this date onward." }]);
  assert.deepEqual(markers[1].events[0], { date: between.toISOString(), description: "Imports blocked for CR01 from this date onward." });
  assert.deepEqual(markers[2].events, [
    { date: dates[2].toISOString(), description: "Exports allowed for CR01 from this date onward." },
    { date: dates[2].toISOString(), description: "Exports blocked for CR02 from this date onward." },
    { date: dates[2].toISOString(), description: "Imports allowed for CR01 from this date onward." },
  ]);
  assert.ok(markers[1].events.some(({ description }) => description === "Movements blocked within CR02 for this step."));
  assert.ok(!markers.flatMap(({ events }) => events).some(({ description }) => description.includes("from CR03")));
  assert.deepEqual(plain([context.simulationNodeInterventions, context.simulationLinkInterventions]), schedules);
  assert.deepEqual(plain(context.getComparisonInterventionEvents([], ids, "trade")), []);
});

test("comparison event metadata keeps region names, local semantics, deletion and restore correct in both modes", () => {
  const context = runtime();
  context.nlLabelPoints = { features: [
    { properties: { statcode: "CR01", statnaam: "First region" } },
    { properties: { statcode: "CR02", statnaam: "Second region" } },
  ] };
  const date = context.uniqueDates[1];
  const next = context.uniqueDates[2];
  context.setSimulationLinkIntervention("CR01-CR01", true, date);
  context.setSimulationLinkIntervention("CR01-CR02", true, date);
  context.setSimulationNodeIntervention("CR02", "imports", false, next);
  let tradeEvents;
  for (const mode of ["trade", "simulation"]) {
    context.appDataMode = mode;
    if (mode === "simulation") runSimulation(context);
    const data = context.getComparisonData();
    assert.equal(data.interventionEvents.length, 2);
    assert.equal(data.interventionEvents[0].events.length, 2);
    assert.ok(data.interventionEvents[0].events.some(({ description }) =>
      description === "Movements blocked from First region (CR01) to Second region (CR02) for this step."));
    assert.ok(data.interventionEvents[0].events.some(({ description }) => description ===
      `${mode === "simulation" ? "Local transmission and movements" : "Movements"} blocked within First region (CR01) for this step.`));
    assert.equal(data.interventionEvents[1].events[0].description, "Imports blocked for Second region (CR02) from this date onward.");
    context.window.currentDate = context.uniqueDates[3];
    context.selectedNodeData = { id: "CR02" };
    assert.equal(context.getComparisonData().interventionEvents, data.interventionEvents);
    if (mode === "trade") tradeEvents = data.interventionEvents;
  }
  context.setSimulationLinkIntervention("CR01-CR01", false, date);
  context.setSimulationLinkIntervention("CR01-CR02", false, date);
  for (const mode of ["trade", "simulation"]) {
    context.appDataMode = mode;
    if (mode === "simulation") runSimulation(context);
    const events = context.getComparisonData().interventionEvents;
    assert.equal(events.length, 1);
    assert.equal(events[0].date, next.toISOString());
  }
  assert.equal(tradeEvents[0].events.length, 2);
  context.simulationLinkInterventions.clear();
  context.simulationNodeInterventions.clear();
  for (const mode of ["trade", "simulation"]) {
    context.appDataMode = mode;
    if (mode === "simulation") runSimulation(context);
    assert.deepEqual(plain(context.getComparisonData().interventionEvents), []);
  }
});
