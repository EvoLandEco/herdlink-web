import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { simulateDaily, aggregateDailyTrajectory } from "../src/runtime/simulation-engine.js";
import { createDeclaredSyntheticPopulationSnapshot } from "../src/runtime/simulation-population.js";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`^([ ]*)(?:async )?function ${name}\\([^]*?^\\1}`, "m"))[0];

function runtime() {
  const timers = new Map();
  let nextTimer = 0;
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: () => null },
    window: {}, simulationRecomputeTimer: null, simulationRunId: 0,
    simulationState: {}, loadedCSVData: [{}], uniqueDates: [new Date("2020-01-01")],
    isSimulationModeActive: () => true,
    setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    delaySimulationStage: async () => {},
    readSimulationSettings: () => ({}),
    ensurePresetDailyData: async () => [{}], presetDailyDataError: null,
    buildSimulationTrajectory: () => { calls.push("trajectory"); return {}; },
    refreshNetworkControlStats: () => calls.push("statistics"),
    refreshCurrentNetworkFrame: () => calls.push("frame"),
    setTimeReplayState: (playing) => { calls.push(["replay", playing]); context.window.isPlaying = playing; },
  });
  for (const name of ["finishModePanelsRendering", "setSimulationInputsDisabled", "disableAllButtons", "disableAllCheckboxes", "setSimulationOverlay", "hideSimulationOverlay", "enableAllButtons", "enableAllCheckboxes"]) context[name] = () => {};
  vm.runInContext(["cancelSimulationRecompute", "recomputeSimulationTrajectory", "scheduleSimulationRecompute"].map(extract).join("\n"), context);
  return { context, timers, calls };
}

test("queued simulation work coalesces and is canceled by a dataset or mode change", () => {
  const { context, timers, calls } = runtime();
  context.scheduleSimulationRecompute();
  context.scheduleSimulationRecompute();
  assert.equal(timers.size, 1);
  context.cancelSimulationRecompute();
  assert.equal(timers.size, 0);
  assert.equal(context.simulationRecomputeTimer, null);
  for (const busy of ["dataset", "mode"]) {
    context.isSimulationModeActive = () => true;
    context.window.isSwitchingCSV = false;
    context.scheduleSimulationRecompute();
    if (busy === "dataset") context.window.isSwitchingCSV = true;
    else context.isSimulationModeActive = () => false;
    const callback = timers.get(context.simulationRecomputeTimer);
    timers.delete(context.simulationRecomputeTimer);
    callback();
    assert.equal(context.simulationRecomputeTimer, null);
    assert.deepEqual(calls, []);
  }
});

test("canceled integration stages cannot replace a dataset or render a stale trajectory", async () => {
  const { context, calls } = runtime();
  let releaseStage;
  context.delaySimulationStage = () => new Promise((resolve) => { releaseStage = resolve; });
  const run = context.recomputeSimulationTrajectory();
  context.cancelSimulationRecompute();
  releaseStage();
  await run;
  assert.deepEqual(calls, []);
  context.window.isSwitchingCSV = true;
  await context.recomputeSimulationTrajectory();
  assert.deepEqual(calls, []);
});

test("recomputation pauses replay before calculating and displaying a trajectory", async () => {
  const { context, calls } = runtime();
  context.window.isPlaying = true;
  await context.recomputeSimulationTrajectory();
  assert.deepEqual(calls, [["replay", false], "statistics", "trajectory", "frame"]);
  assert.equal(context.window.isPlaying, false);
  assert.equal(context.simulationState.status, "ready");
});

test("a failed replay render releases simulation controls and allows a retry", async () => {
  const { context } = runtime();
  const released = [];
  context.setSimulationInputsDisabled = (disabled) => released.push(["inputs", disabled]);
  context.enableAllButtons = () => released.push(["buttons", false]);
  context.enableAllCheckboxes = () => released.push(["checkboxes", false]);
  context.hideSimulationOverlay = () => released.push(["overlay", false]);
  context.refreshCurrentNetworkFrame = () => { throw new Error("Replay render failed"); };
  await context.recomputeSimulationTrajectory();
  assert.equal(context.simulationState.status, "error");
  assert.match(context.comparisonDataError, /Replay render failed/);
  assert.deepEqual(released, [["inputs", true], ["overlay", false], ["inputs", false], ["buttons", false], ["checkboxes", false]]);
  context.refreshCurrentNetworkFrame = () => {};
  await context.recomputeSimulationTrajectory();
  assert.equal(context.simulationState.status, "ready");
  assert.equal(context.comparisonDataError, null);
});

test("cancellation during history loading prevents integration with stale inputs", async () => {
  const { context, calls } = runtime();
  let releaseHistory, requestedHistory;
  const requested = new Promise((resolve) => { requestedHistory = resolve; });
  context.ensurePresetDailyData = () => {
    requestedHistory();
    return new Promise((resolve) => { releaseHistory = resolve; });
  };
  const run = context.recomputeSimulationTrajectory();
  await requested;
  context.cancelSimulationRecompute();
  context.loadedCSVData = [{ dataset: "replacement" }];
  releaseHistory([{}]);
  await run;
  assert.deepEqual(calls, []);
  context.ensurePresetDailyData = async () => [{}];
  await context.recomputeSimulationTrajectory();
  assert.deepEqual(calls, ["statistics", "trajectory", "frame"]);
});

test("history loading failures release simulation controls and support retry", async () => {
  const { context, calls } = runtime();
  const message = { textContent: "" };
  context.document.getElementById = (id) => id === "simulationSettingsError" ? message : null;
  const disabled = [];
  context.setSimulationInputsDisabled = (value) => disabled.push(value);
  context.ensurePresetDailyData = async () => null;
  context.presetDailyDataError = "Daily history request failed";
  await context.recomputeSimulationTrajectory();
  assert.equal(context.simulationState.status, "error");
  assert.match(context.comparisonDataError, /Daily history request failed/);
  assert.equal(message.textContent, context.comparisonDataError);
  assert.deepEqual(disabled, [true, false]);
  assert.deepEqual(calls, []);
  context.ensurePresetDailyData = async () => [{}];
  context.presetDailyDataError = null;
  await context.recomputeSimulationTrajectory();
  assert.equal(context.simulationState.status, "ready");
  assert.equal(context.comparisonDataError, null);
  assert.equal(message.textContent, "");
  assert.deepEqual(calls, ["statistics", "trajectory", "frame"]);
});

test("the prevalence peak includes initialization and every day at each display resolution", () => {
  const ids = ["A"];
  const dates = [new Date("2020-01-01"), new Date("2020-01-02")];
  const display = { style: {}, innerHTML: "", querySelector: () => null };
  const selection = {};
  for (const name of ["classed", "style", "html", "append", "attr", "text"]) selection[name] = () => selection;
  const context = vm.createContext({
    simulationState: {}, selectedNodeData: null, theme: {},
    document: { getElementById: () => display },
    formatCount: String,
    d3: { select: () => selection, max: (items, accessor) => {
      const values = items.map(accessor).filter(Number.isFinite);
      return values.length ? Math.max(...values) : undefined;
    } },
  });
  vm.runInContext(["formatPct", "renderSimulationStatsContainer"].map(extract).join("\n"), context);
  for (const [N, beta, gamma, expected] of [[100, 0, 1, "10.0%"], [100, 10, 0, "100.0%"], [0, 0, 0, "—"]]) {
    const holdings = { A: N };
    const settings = { model: "SIR", seedRegion: "A", introductionDate: "2020-01-01", initialPct: 10,
      initializationConvention: "prevalence-shares", beta, movementBeta: 0, sigma: 0, gamma, holdings,
      population: createDeclaredSyntheticPopulationSnapshot({ ids, values: holdings }) };
    const daily = simulateDaily({ ids, dates, data: [], settings });
    for (const bins of [dates, [dates[0]]]) {
      const trajectory = aggregateDailyTrajectory(daily, bins);
      context.simulationState = { trajectory, currentFrame: trajectory.frames.at(-1) };
      context.renderSimulationStatsContainer();
      assert.ok(display.innerHTML.includes(`(peak ${expected})`), display.innerHTML);
    }
  }
});

test("infection chart sources preserve interval totals and exclude starting states", () => {
  const ids = ["A", "B"], holdings = { A: 100, B: 200 };
  const dates = [1, 2, 3].map((day) => new Date(Date.UTC(2020, 0, day)));
  const settings = { model: "SEIR", seedRegion: "A", introductionDate: "2020-01-02", initialPct: 10,
    initializationConvention: "prevalence-shares", beta: 0.1, movementBeta: 1, sigma: 0.25, gamma: 0.2, holdings,
    population: createDeclaredSyntheticPopulationSnapshot({ ids, values: holdings }) };
  const daily = simulateDaily({ ids, dates, settings,
    data: dates.map((time) => ({ time, COROP_LEV: "A", COROP_AFN: "B", AANTAL: 20 })) });
  const context = vm.createContext({ simulationState: {} });
  vm.runInContext(extract("getSimulationSeries"), context);
  assert.equal(context.getSimulationSeries().length, 0);
  for (const bins of [dates, [dates[0], dates[2]], [dates[0]]]) {
    context.simulationState.trajectory = aggregateDailyTrajectory(daily, bins);
    const series = context.getSimulationSeries();
    assert.equal(series.length, bins.length);
    for (const point of series) {
      const summary = context.simulationState.trajectory.frameByKey[point.date.toISOString()].summary;
      for (const key of ["contactInfections", "movementInfections", "newInfections"]) assert.equal(point[key], summary[key]);
      assert.ok(Math.abs(point.contactInfections + point.movementInfections - point.newInfections) < 1e-10);
    }
    assert.ok(Math.abs(series.reduce((sum, point) => sum + point.newInfections, 0) -
      daily.frames.reduce((sum, frame) => sum + frame.summary.newInfections, 0)) < 1e-10);
  }
  assert.equal(daily.frames[0].summary.newInfections, 0);
  assert.equal(daily.initialFrame.summary.newInfections, 0);
});

test("prevalence colors retain the regional daily peak across replay and display bins", () => {
  const ids = ["A", "B"], holdings = { A: 100, B: 900 };
  const dates = [1, 2, 3].map((day) => new Date(Date.UTC(2020, 0, day)));
  let fillDomain, textDomain;
  const context = vm.createContext({
    simulationState: {}, selectedNodeData: null,
    isSimulationModeActive: () => true,
    simulationPrevalenceScale: { domain: (value) => { fillDomain = Array.from(value); } },
    simulationPrevalenceTextScale: { domain: (value) => { textDomain = Array.from(value); } },
    d3: { max: (items, accessor) => {
      const values = items.map(accessor).filter(Number.isFinite);
      return values.length ? Math.max(...values) : undefined;
    } },
  });
  for (const name of ["renderSimulationNodeControls", "renderSimulationStatsContainer", "renderSimulationGlobalStatsChart",
    "renderSimulationIncidenceChart", "renderSimulationNodeStatsChart", "renderSimulationSpatialPatternPanel",
    "updateSCCs", "applySimulationNodeStyles"]) context[name] = () => {};
  vm.runInContext(extract("renderSimulationPanels"), context);
  for (const initialPct of [0, 1, 10]) {
    const settings = { model: "SIR", seedRegion: "A", introductionDate: "2020-01-01", initialPct,
      initializationConvention: "prevalence-shares", beta: 0, movementBeta: 0, sigma: 0, gamma: 1, holdings,
      population: createDeclaredSyntheticPopulationSnapshot({ ids, values: holdings }) };
    const daily = simulateDaily({ ids, dates, settings, data: [] });
    assert.ok(daily.frames[0].summary.prevalence < initialPct / 100 || initialPct === 0);
    for (const bins of [dates, [dates[0], dates[2]], [dates[0]]]) {
      const trajectory = aggregateDailyTrajectory(daily, bins);
      for (const currentFrame of trajectory.frames) {
        context.simulationState = { trajectory, currentFrame };
        context.renderSimulationPanels();
        assert.deepEqual(fillDomain, [0, initialPct > 0 ? initialPct / 100 : 1]);
        assert.deepEqual(textDomain, fillDomain);
      }
    }
  }
});
