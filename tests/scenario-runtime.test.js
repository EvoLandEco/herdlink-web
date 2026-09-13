import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const functions = [
  "getNodeId", "getLinkKey", "getStatnaam", "getTradeRecordsByDate", "clampNumber",
  "readSimulationSettings", "collectSimulationRegionIds", "buildSimulationLedger",
  "estimateSimulationHoldings", "getSimulationFrameSummary", "buildSimulationTrajectory",
  "getSimulationLinkAvailability", "getSimulationNodePermissions", "applySimulationNodePermissions", "getDisabledLinkKeys",
  "getComparisonMetricDefinitions", "buildComparisonSeries", "getOriginalSimulationSeries",
  "areNetworkControlsLocked", "areScenarioControlsDisabled", "getScenarioContext",
  "validateScenario", "captureScenario", "applyScenario", "loadScenario", "loadPreset", "recomputeSimulationTrajectory",
].map((name) => {
  const match = source.match(new RegExp(`^([ ]*)(?:async )?function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, name);
  return match[0];
}).join("\n");
const settings = { model: "SEIR", seedRegion: "CR01", initialPct: 1, beta: 0.32, movementBeta: 0.08, sigma: 0.22, gamma: 0.15 };
const controls = { model: "Model", seedRegion: "SeedRegion", initialPct: "InitialPct", beta: "Beta", movementBeta: "MovementBeta", sigma: "Sigma", gamma: "Gamma" };
const plain = (value) => JSON.parse(JSON.stringify(value, (_, item) => item instanceof Map ? [...item] : item));

function runtime(parameters = {}, steps = 24) {
  const elements = Object.fromEntries(Object.entries(controls).map(([key, suffix]) => {
    let value = String(({ ...settings, ...parameters })[key]);
    return [`simulation${suffix}`, { get value() { return value; }, set value(next) { value = String(next); } }];
  }));
  const dayOffsets = Array.isArray(steps) ? steps : Array.from({ length: steps }, (_, index) => index * 7);
  const uniqueDates = dayOffsets.map((day) => new Date(Date.UTC(2020, 0, 1 + day)));
  const loadedCSVData = uniqueDates.flatMap((time) => [
    ["CR01", "CR02", 100], ["CR03", "CR01", 50], ["CR02", "CR03", 20],
  ].map(([COROP_LEV, COROP_AFN, AANTAL]) => ({ time, COROP_LEV, COROP_AFN, AANTAL })));
  const values = (items, accessor = (item) => item) => Array.from(items, accessor);
  const select = { selectAll() { return this; }, data() { return this; }, join() { return this; }, attr() { return this; }, text() { return this; } };
  let inert = false;
  const applied = [];
  const context = vm.createContext({
    Date, Map, Set, loadedCSVData, uniqueDates, currentTimeSpan: "weekly", nlLabelPoints: null,
    simulationRegionIdsByDataset: new WeakMap(), tradeRecordsByDataset: new WeakMap(), comparisonDataCache: new Map(),
    simulationNodeInterventions: new Map(), simulationLinkInterventions: new Map(),
    simulationState: { status: "idle" }, appDataMode: "trade", appModeSwitchLocked: false,
    simulationRecomputeTimer: null, simulationRunId: 0, screenshotInProgress: false,
    networkStatsDirtyDates: new Set(), networkStatsDirtyFrom: null, comparisonDataError: null,
    window: { currentDate: uniqueDates[0], herdlinkComparison: { refresh() {} } },
    document: { getElementById: (id) => id === "mainContainer" ? { closest: () => inert } : elements[id] },
    ensureSimulationControls() {}, applyNetworkControlChanges: (label) => applied.push(label),
    metricNames: ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"],
    d3: {
      select: () => select,
      min: (items, accessor) => Math.min(...values(items, accessor)),
      max: (items, accessor) => Math.max(...values(items, accessor)),
      sum: (items, accessor) => values(items, accessor).reduce((sum, value) => sum + value, 0),
    },
  });
  vm.runInContext(functions, context);
  return { context, elements, applied, setInert: (value) => { inert = value; } };
}

test("scenario context reads live ledger settings without running simulations and remains available during loading", () => {
  const { context, elements } = runtime({ sigma: 0, gamma: 0 });
  context.buildSimulationTrajectory = () => assert.fail("Reading context must not run a simulation");
  let value = context.getScenarioContext();
  assert.equal(value.datasetKey, "weekly");
  assert.equal(value.presets.length, 6);
  assert.deepEqual(Array.from(value.presets, ({ delayDays }) => delayDays), [0, 3, 14, 7, 7, 7]);
  assert.equal(value.settings.sigma, 0);
  assert.equal(value.settings.gamma, 0);
  assert.match(value.note, /more trade/);
  elements.simulationModel.value = "SIS";
  context.loadedCSVData = null;
  context.window.isSwitchingCSV = true;
  value = context.getScenarioContext();
  assert.equal(value.settings.model, "SIS");
  assert.equal(value.disabled, true);
});

test("presets replace complete schedules once and preserve model controls and displayed mode", () => {
  for (const mode of ["trade", "simulation"]) {
    for (const id of ["open-trade", "seed-containment", "partner-ring", "hub-controls", "temporary-standstill", "delayed-response"]) {
      const { context, applied } = runtime();
      context.appDataMode = mode;
      context.simulationState.status = mode === "simulation" ? "ready" : "idle";
      context.simulationNodeInterventions.set(context.uniqueDates[2].getTime(), new Map([["CR40", { imports: false }]]));
      context.simulationLinkInterventions.set(context.uniqueDates[3].getTime(), new Map([["CR02-CR03", true]]));
      const before = plain(context.readSimulationSettings());
      const result = context.loadPreset(id);
      assert.equal(typeof result.detail, "string");
      assert.equal(applied.length, 1);
      assert.equal(context.appDataMode, mode);
      assert.deepEqual(plain(context.readSimulationSettings()), before);
      assert.equal(context.simulationLinkInterventions.size, 0);
      assert.equal(context.networkStatsDirtyFrom, context.uniqueDates[0].getTime());
      assert.ok(![...context.simulationNodeInterventions.values()].some((changes) => changes.get("CR40")?.imports === false));
      assert.doesNotThrow(() => context.captureScenario());
      if (id === "open-trade") assert.equal(context.simulationNodeInterventions.size, 0);
    }
  }
});

test("identical presets and saved scenarios reuse completed calculations in both modes", () => {
  for (const mode of ["trade", "simulation"]) {
    const { context, applied } = runtime();
    context.appDataMode = mode;
    context.simulationState.status = mode === "simulation" ? "ready" : "idle";
    context.loadPreset("open-trade");
    assert.equal(applied.length, 0);
    for (const id of ["seed-containment", "partner-ring", "hub-controls", "temporary-standstill", "delayed-response", "open-trade"]) {
      context.loadPreset(id);
      context.networkStatsDirtyDates.clear();
      context.networkStatsDirtyFrom = null;
      const calls = applied.length;
      context.loadPreset(id);
      context.loadScenario(context.captureScenario());
      assert.equal(applied.length, calls, `${mode}: ${id}`);
      assert.equal(context.networkStatsDirtyFrom, null);
    }
  }
});

test("scenario loading recalculates changed settings, pending statistics and failed calculations", () => {
  const { context, elements, applied } = runtime();
  const saved = context.captureScenario();
  elements.simulationBeta.value = "0.6";
  context.loadScenario(saved);
  assert.equal(applied.length, 1);
  assert.equal(context.readSimulationSettings().beta, saved.settings.beta);
  context.networkStatsDirtyFrom = null;
  context.networkStatsDirtyDates.add(context.uniqueDates[2].getTime());
  context.loadScenario(saved);
  assert.equal(applied.length, 2);
  context.networkStatsDirtyFrom = null;
  context.comparisonDataError = "A calculation failed.";
  context.loadPreset("open-trade");
  assert.equal(applied.length, 3);
  assert.equal(context.comparisonDataError, null);
});

test("partner and hub targets use positive cross-region records with first-step partners and stable volume ties", () => {
  const { context } = runtime({}, 2);
  const [first, second] = context.uniqueDates;
  context.loadedCSVData = [
    [first, "CR01", "CR02", 100], [first, "CR03", "CR01", 100],
    [first, "CR01", "CR01", 90000], [first, "CR05", "CR01", 0],
    [first, "NA", "CR01", 99999], [first, "CR06", "NA", 99999],
    [second, "CR04", "CR01", 50], [second, "CR02", "CR01", 100],
  ].map(([time, COROP_LEV, COROP_AFN, AANTAL]) => ({ time, COROP_LEV, COROP_AFN, AANTAL }));
  context.loadPreset("partner-ring");
  assert.deepEqual([...context.simulationNodeInterventions.get(second.getTime()).keys()], ["CR01", "CR02", "CR03"]);
  context.loadPreset("hub-controls");
  assert.deepEqual([...context.simulationNodeInterventions.get(second.getTime()).keys()], ["CR01", "CR02", "CR03"]);
  context.loadedCSVData = [{ time: first, COROP_LEV: "CR02", COROP_AFN: "CR01", AANTAL: 10 }];
  context.loadPreset("hub-controls");
  assert.deepEqual([...context.simulationNodeInterventions.get(second.getTime()).keys()], ["CR02"]);
  context.loadedCSVData = [{ time: first, COROP_LEV: "CR02", COROP_AFN: "CR02", AANTAL: 10 }];
  assert.match(context.loadPreset("hub-controls").detail, /no positive cross-region exports/);
  assert.equal(context.simulationNodeInterventions.size, 0);
  assert.doesNotThrow(() => context.captureScenario());
});

test("delayed response waits fourteen days after entry prevalence triggers and reuses the original simulation", () => {
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    const { context } = runtime({ model, initialPct: 4, beta: 1, movementBeta: 0, gamma: 0, sigma: 1 }, 6);
    context.simulationNodeInterventions.set(context.uniqueDates[0].getTime(), new Map([["CR01", { exports: false }]]));
    const calculate = context.buildSimulationTrajectory;
    let calculations = 0;
    context.buildSimulationTrajectory = (...args) => { calculations++; return calculate(...args); };
    const expected = model === "SIR" || model === "SIS" ? 3 : 4;
    context.loadPreset("delayed-response");
    assert.deepEqual([...context.simulationNodeInterventions.keys()], [context.uniqueDates[expected].getTime()]);
    context.loadPreset("delayed-response");
    assert.equal(calculations, 1);
  }
  const initial = runtime({ initialPct: 5 }).context;
  initial.loadPreset("delayed-response");
  assert.deepEqual([...initial.simulationNodeInterventions.keys()], [initial.uniqueDates[2].getTime()]);
  for (const [parameters, count] of [[{ beta: 0, movementBeta: 0 }, 3], [{ model: "SIR", initialPct: 4, beta: 1, gamma: 0 }, 1]]) {
    const context = runtime(parameters, count).context;
    context.loadPreset("seed-containment");
    assert.match(context.loadPreset("delayed-response").detail, /never reaches 5% entering/);
    assert.equal(context.simulationNodeInterventions.size, 0);
  }
  const tiny = runtime({ initialPct: 1 }, 3).context;
  tiny.getOriginalSimulationSeries = () => ({ nodes: { CR01: tiny.uniqueDates.map(() => ({ N: 10, prevalence: 0 })) } });
  tiny.loadPreset("delayed-response");
  assert.deepEqual([...tiny.simulationNodeInterventions.keys()], [tiny.uniqueDates[2].getTime()]);
});

test("standstill duration follows model rates and recorded steps, including zero rates and short horizons", () => {
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    for (const [sigma, gamma] of [[0.25, 0.5], [0, 0.5], [0.25, 0]]) {
      const { context } = runtime({ model, sigma, gamma }, 10);
      const expected = Math.ceil(1 / gamma + (["SEIR", "SEIRS"].includes(model) ? 1 / sigma : 0));
      const result = context.loadPreset("temporary-standstill");
      const schedule = context.simulationNodeInterventions;
      assert.equal(schedule.get(context.uniqueDates[1].getTime()).size, 40);
      if (Number.isFinite(expected)) {
        assert.equal(schedule.size, 2);
        assert.equal(schedule.get(context.uniqueDates[1 + expected].getTime()).get("CR01").exports, true);
      } else {
        assert.equal(schedule.size, 1);
        assert.match(result.detail, /rate is zero/);
      }
    }
  }
  const short = runtime({ model: "SIR", gamma: 0.5 }, 2).context;
  assert.match(short.loadPreset("temporary-standstill").detail, /outside/);
  assert.equal(short.simulationNodeInterventions.size, 1);
});

test("preset deadlines use calendar days and the next available sample, while standstill duration uses steps", () => {
  const delays = {
    "seed-containment": 3, "partner-ring": 7, "hub-controls": 7,
    "temporary-standstill": 7, "delayed-response": 14,
  };
  for (const dayOffsets of [Array.from({ length: 22 }, (_, index) => index), [0, 2, 4, 8, 13, 16, 30]]) {
    for (const [id, delayDays] of Object.entries(delays)) {
      const { context } = runtime({ model: "SIR", initialPct: 5, gamma: 1 }, dayOffsets);
      context.loadPreset(id);
      const expectedIndex = dayOffsets.findIndex((day) => day >= delayDays);
      const deadline = context.uniqueDates[0].getTime() + delayDays * 86400000;
      const times = [...context.simulationNodeInterventions.keys()];
      assert.equal(times[0], context.uniqueDates[expectedIndex].getTime(), id);
      assert.ok(times.every((time) => time >= deadline), id);
      assert.ok(context.uniqueDates[expectedIndex - 1].getTime() < deadline, id);
      if (id === "temporary-standstill") {
        assert.equal(times[1], context.uniqueDates[expectedIndex + 1].getTime());
        assert.equal(context.simulationNodeInterventions.get(times[1]).get("CR01").exports, true);
      } else assert.equal(times.length, 1);
    }
  }

  const { context } = runtime({ model: "SIR", initialPct: 4, beta: 1, movementBeta: 0, gamma: 0 }, [0, 2, 4, 8, 13, 16, 30]);
  const original = context.buildSimulationTrajectory(context.readSimulationSettings());
  assert.ok(original.frames[0].nodeStates.CR01.prevalence >= 0.05);
  context.loadPreset("delayed-response");
  assert.deepEqual([...context.simulationNodeInterventions.keys()], [context.uniqueDates[5].getTime()]);
  assert.equal(context.uniqueDates[5].getTime() - context.uniqueDates[1].getTime(), 14 * 86400000);
});

test("deadlines beyond the recorded window replace existing schedules with no restrictions", () => {
  for (const id of ["seed-containment", "partner-ring", "hub-controls", "temporary-standstill", "delayed-response"]) {
    const { context, applied } = runtime({ initialPct: 5, gamma: 0, sigma: 0 }, [0, 1, 2]);
    const first = context.uniqueDates[0].getTime();
    context.simulationNodeInterventions.set(first, new Map([["CR02", { imports: false }]]));
    context.simulationLinkInterventions.set(first, new Map([["CR01-CR02", true]]));
    const result = context.loadPreset(id);
    assert.equal(context.simulationNodeInterventions.size, 0, id);
    assert.equal(context.simulationLinkInterventions.size, 0, id);
    assert.equal(applied.length, 1, id);
    assert.match(result.detail, /no restrictions|trade stays open/i, id);
    assert.doesNotThrow(() => context.captureScenario());
  }

  const late = runtime({ model: "SIR", initialPct: 4, beta: 1, movementBeta: 0, gamma: 0 }, 3).context;
  const result = late.loadPreset("delayed-response");
  assert.equal(late.simulationNodeInterventions.size, 0);
  assert.match(result.detail, /no restrictions|trade stays open/i);
});

test("every model preserves original disease frames until a preset response actually starts", () => {
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    for (const id of ["seed-containment", "partner-ring", "hub-controls", "temporary-standstill", "delayed-response"]) {
      const { context } = runtime({ model, initialPct: 5 }, 8);
      const parameters = context.readSimulationSettings();
      const original = context.buildSimulationTrajectory(parameters);
      context.loadPreset(id);
      const firstEvent = Math.min(...context.simulationNodeInterventions.keys());
      const start = context.uniqueDates.findIndex((date) => date.getTime() === firstEvent);
      assert.equal(start, id === "delayed-response" ? 2 : 1, `${model}: ${id}`);
      const intervention = context.buildSimulationTrajectory(parameters);
      assert.deepEqual(plain(intervention.frames.slice(0, start)), plain(original.frames.slice(0, start)), `${model}: ${id}`);
      assert.ok(original.frames[start].nodeStates.CR02.incomingExposure > 0, `${model}: ${id}`);
      assert.equal(intervention.frames[start].nodeStates.CR02.incomingExposure, 0, `${model}: ${id}`);
    }
  }
});

test("saved scenarios restore live settings and off-sample schedules atomically without changing mode", () => {
  const { context, elements, applied } = runtime();
  const dates = context.uniqueDates;
  const before = dates[0].getTime() - 86400000;
  const between = dates[0].getTime() + 86400000;
  const after = dates.at(-1).getTime() + 86400000;
  context.simulationNodeInterventions.set(before, new Map([["CR02", { imports: false }]]));
  context.simulationNodeInterventions.set(between, new Map([["CR02", { imports: true, exports: false }]]));
  context.simulationLinkInterventions.set(after, new Map([["CR01-CR01", true]]));
  const saved = plain(context.captureScenario());
  context.loadPreset("open-trade");
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    saved.settings = { model, seedRegion: "CR03", initialPct: 2, beta: 0, movementBeta: 0, sigma: 0, gamma: 0 };
    const calls = applied.length;
    context.loadScenario(saved);
    assert.equal(applied.length, calls + 1);
    assert.equal(context.appDataMode, "trade");
    assert.deepEqual(plain(context.captureScenario()), saved);
    assert.equal(elements.simulationModel.value, model);
    assert.equal(elements.simulationSeedRegion.value, "CR03");
  }
  saved.nodeInterventions[0][1][0][1].imports = true;
  assert.equal(context.simulationNodeInterventions.get(before).get("CR02").imports, false);
});

test("invalid snapshots and locked actions cannot change settings or schedules", () => {
  const { context, applied, setInert } = runtime();
  context.loadPreset("seed-containment");
  const saved = plain(context.captureScenario());
  const invalid = [
    (item) => { item.schemaVersion = 2; }, (item) => { item.datasetKey = "daily"; },
    (item) => { item.dates.reverse(); }, (item) => { item.dates.pop(); },
    (item) => { delete item.dates[0]; },
    (item) => { item.settings.model = "SI"; }, (item) => { item.settings.seedRegion = "CR99"; },
    ...["initialPct", "beta", "movementBeta", "sigma", "gamma"].flatMap((key) => [
      (item) => { item.settings[key] = -1; }, (item) => { item.settings[key] = Infinity; },
      (item) => { item.settings[key] = "0.1"; },
    ]),
    (item) => { item.settings.gamma = 2; }, (item) => { item.settings.extra = 1; },
    (item) => { item.nodeInterventions[0][0] = 0.1; },
    (item) => { item.nodeInterventions.push(item.nodeInterventions[0]); },
    (item) => { item.nodeInterventions[0][1].push(item.nodeInterventions[0][1][0]); },
    (item) => { item.nodeInterventions[0][1][0][1] = { imports: 0 }; },
    (item) => { item.nodeInterventions[0][1][0][1] = { exportsSince: 1 }; },
    (item) => { item.nodeInterventions[0][1][0][0] = "CR99"; },
    (item) => { item.linkInterventions = [[0, [["CR01-CR02", false]]]]; },
    (item) => { item.linkInterventions = [[0, [["CR01-CR99", true]]]]; },
    (item) => { item.linkInterventions = [[0, []]]; },
  ];
  const calls = applied.length;
  for (const mutate of invalid) {
    const snapshot = plain(saved);
    mutate(snapshot);
    assert.throws(() => context.loadScenario(snapshot));
    assert.deepEqual(plain(context.captureScenario()), saved);
    assert.equal(applied.length, calls);
  }
  for (const key of ["isPlaying", "isSwitchingCSV", "isDoingTemporalUpdate", "isSwitchingAppMode"]) {
    context.window[key] = true;
    assert.equal(context.getScenarioContext().disabled, true);
    assert.throws(() => context.loadPreset("open-trade"));
    assert.throws(() => context.loadScenario(saved));
    assert.throws(() => context.captureScenario());
    context.window[key] = false;
  }
  for (const [key, value] of [["simulationRecomputeTimer", 0], ["appModeSwitchLocked", true], ["screenshotInProgress", true]]) {
    const prior = context[key]; context[key] = value;
    assert.throws(() => context.loadPreset("open-trade"));
    context[key] = prior;
  }
  setInert(true);
  assert.throws(() => context.loadPreset("open-trade"));
  setInert(false);
  assert.throws(() => context.loadPreset("unknown"));
  assert.equal(applied.length, calls);
});

test("calculation failures publish error state and simulation retries can recover", async () => {
  const { context } = runtime();
  context.applyNetworkControlChanges = () => { throw new Error("ledger failed"); };
  assert.throws(() => context.loadPreset("seed-containment"), /ledger failed/);
  assert.match(context.comparisonDataError, /ledger failed/);
  Object.assign(context, { clearTimeout() {}, delaySimulationStage: async () => {}, refreshNetworkControlStats() {} });
  for (const name of ["finishModePanelsRendering", "setSimulationInputsDisabled", "disableAllButtons", "disableAllCheckboxes", "setSimulationOverlay", "hideSimulationOverlay", "enableAllButtons", "enableAllCheckboxes", "refreshCurrentNetworkFrame"]) context[name] = () => {};
  const calculate = context.buildSimulationTrajectory;
  for (const stage of ["refreshNetworkControlStats", "buildSimulationTrajectory"]) {
    const prior = context[stage];
    context[stage] = () => { throw new Error(`${stage} failed`); };
    await context.recomputeSimulationTrajectory();
    assert.equal(context.simulationState.status, "error");
    assert.match(context.comparisonDataError, /failed/);
    context[stage] = prior;
  }
  context.buildSimulationTrajectory = calculate;
  await context.recomputeSimulationTrajectory();
  assert.equal(context.simulationState.status, "ready");
  assert.equal(context.comparisonDataError, null);
});
