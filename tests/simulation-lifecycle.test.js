import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`^([ ]*)(?:async )?function ${name}\\([^]*?^\\1}`, "m"))[0];

function runtime() {
  const timers = new Map();
  let nextTimer = 0;
  const calls = [];
  const context = vm.createContext({
    window: {}, simulationRecomputeTimer: null, simulationRunId: 0,
    simulationState: {}, loadedCSVData: [{}], uniqueDates: [new Date("2020-01-01")],
    isSimulationModeActive: () => true,
    setTimeout: (callback) => { timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    delaySimulationStage: async () => {},
    readSimulationSettings: () => ({}),
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
