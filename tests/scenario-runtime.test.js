import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as presetTools from "../src/runtime/intervention-presets.js";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const functions = [
  "getNodeId", "getLinkKey", "getStatnaam", "getTradeRecordsByDate", "clampNumber",
  "readSimulationSettings", "collectSimulationRegionIds", "buildSimulationLedger",
  "estimateSimulationHoldings", "getSimulationFrameSummary", "buildSimulationTrajectory",
  "getSimulationLinkAvailability", "getSimulationNodePermissions", "applySimulationNodePermissions", "getDisabledLinkKeys",
  "getComparisonMetricDefinitions", "buildComparisonSeries", "getOriginalSimulationSeries",
  "areNetworkControlsLocked", "areScenarioControlsDisabled", "getScenarioContext",
  "getPresetSettings", "setPresetSettings", "getNetworkPresetGraph", "getNetworkPresetSelection",
  "syncSimulationIntroductionControl", "getSimulationPopulationForDate", "ensurePresetDailyData",
  "validateScenario", "captureScenario", "applyScenario", "loadScenario", "loadPreset", "recomputeSimulationTrajectory",
].map((name) => {
  const match = source.match(new RegExp(`^([ ]*)(?:async )?function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, name);
  return match[0];
}).join("\n");
const settings = { model: "SEIR", seedRegion: "CR01", initialPct: 1, beta: 0.32, movementBeta: 0.08, sigma: 0.22, gamma: 0.15 };
const presetIds = ["open-trade", "seed-containment", "partner-ring", "seed-community", "hub-controls", "trade-bottlenecks", "temporary-standstill"];
const dayMs = 86400000;
const controls = { model: "Model", seedRegion: "SeedRegion", initialPct: "InitialPct", beta: "Beta", movementBeta: "MovementBeta", sigma: "Sigma", gamma: "Gamma" };
const plain = (value) => JSON.parse(JSON.stringify(value, (_, item) => item instanceof Map ? [...item] : item));

function runtime(parameters = {}, steps = 24) {
  const elements = Object.fromEntries(Object.entries(controls).map(([key, suffix]) => {
    let value = String(({ ...settings, ...parameters })[key]);
    return [`simulation${suffix}`, { get value() { return value; }, set value(next) { value = String(next); } }];
  }));
  elements.simulationIntroductionDate = { value: "", min: "", max: "" };
  const dayOffsets = Array.isArray(steps) ? steps : Array.from({ length: steps }, (_, index) => index * 7);
  const uniqueDates = dayOffsets.map((day) => new Date(Date.UTC(2020, 0, 1 + day)));
  const loadedCSVData = uniqueDates.flatMap((time) => [
    ["CR01", "CR02", 100], ["CR03", "CR01", 50], ["CR02", "CR03", 20],
  ].map(([COROP_LEV, COROP_AFN, AANTAL]) => ({ time, COROP_LEV, COROP_AFN, AANTAL })));
  const presetDailyDates = Array.from({ length: 365 + dayOffsets.at(-1) + 1 }, (_, index) => Date.UTC(2019, 0, 1 + index));
  const presetDailyData = presetDailyDates.flatMap((time) => [
    ["CR01", "CR02", 100], ["CR03", "CR01", 50], ["CR02", "CR03", 20],
  ].map(([COROP_LEV, COROP_AFN, AANTAL]) => ({ time: new Date(time), COROP_LEV, COROP_AFN, AANTAL })));
  const values = (items, accessor = (item) => item) => Array.from(items, accessor);
  const select = { selectAll() { return this; }, data() { return this; }, join() { return this; }, attr() { return this; }, text() { return this; } };
  let inert = false;
  const applied = [];
  const recomputes = [];
  const context = vm.createContext({
    Date, Map, Set, loadedCSVData, uniqueDates, presetDailyData, presetDailyDates, presetDailyDataError: null,
    presetTargetBudget: 3, presetResponseDays: 7, presetStandstillDays: 14,
    simulationIntroductionDate: null, simulationPresetHoldings: null, presetDailyDataPromise: null,
    currentTimeSpan: "weekly", nlLabelPoints: null,
    simulationRegionIdsByDataset: new WeakMap(), tradeRecordsByDataset: new WeakMap(), comparisonDataCache: new Map(),
    networkPresetGraphsByDataset: new WeakMap(), networkPresetMetricsByGraph: new WeakMap(), communityScale: "finer",
    computeModularity: (nodes, links, resolution) => ({ partition: Object.fromEntries(nodes.map(({ id }) =>
      [id, resolution === 1 || id !== "CR03" ? 0 : 1])) }),
    computeHotSpotMetrics: (nodes) => Object.fromEntries(nodes.map(({ id }) => [id, { betweenness: id === "CR02" ? 2 : 0 }])),
    simulationNodeInterventions: new Map(), simulationLinkInterventions: new Map(),
    simulationState: { status: "idle" }, appDataMode: "trade", appModeSwitchLocked: false,
    simulationRecomputeTimer: null, simulationRunId: 0, screenshotInProgress: false,
    networkStatsDirtyDates: new Set(), networkStatsDirtyFrom: null, comparisonDataError: null,
    window: { herdlinkPresetTools: presetTools, currentDate: uniqueDates[0], herdlinkComparison: { refresh() {} } },
    document: { getElementById: (id) => id === "mainContainer" ? { closest: () => inert } : elements[id] },
    ensureSimulationControls() {}, applyNetworkControlChanges: (label) => applied.push(label),
    isSimulationModeActive: () => context.appDataMode === "simulation",
    scheduleSimulationRecompute: (reason) => recomputes.push(reason),
    metricNames: ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"],
    d3: {
      select: () => select,
      min: (items, accessor) => Math.min(...values(items, accessor)),
      max: (items, accessor) => Math.max(...values(items, accessor)),
      sum: (items, accessor) => values(items, accessor).reduce((sum, value) => sum + value, 0),
    },
  });
  vm.runInContext(functions, context);
  return { context, elements, applied, recomputes, setInert: (value) => { inert = value; } };
}


test("context lists seven presets and reads live settings without calculating disease trajectories", () => {
  const { context, elements } = runtime({ sigma: 0, gamma: 0 });
  context.buildSimulationTrajectory = () => assert.fail("Context reads should only inspect inputs");
  const value = context.getScenarioContext();
  assert.equal(value.datasetKey, "weekly");
  assert.deepEqual(Array.from(value.presets, ({ id }) => id), presetIds);
  assert.deepEqual(Array.from(value.presets, ({ delayDays }) => delayDays), [0, 7, 7, 7, 7, 7, 7]);
  assert.equal(value.settings.sigma, 0);
  assert.equal(value.settings.gamma, 0);
  assert.equal(value.presetSettings.targetBudget, 3);
  assert.equal(value.presetSettings.responseDays, 7);
  assert.equal(value.presetSettings.standstillDays, 14);
  assert.equal(value.presetSettings.introductionDate, "2020-01-01");
  elements.simulationModel.value = "SIS";
  context.loadedCSVData = null;
  context.window.isSwitchingCSV = true;
  assert.equal(context.getScenarioContext().settings.model, "SIS");
  assert.equal(context.getScenarioContext().disabled, true);
});

test("presets replace complete schedules and preserve disease controls and displayed mode", () => {
  for (const mode of ["trade", "simulation"]) for (const id of presetIds) {
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
    const after = plain(context.readSimulationSettings());
    assert.deepEqual(Object.fromEntries(Object.keys(settings).map((key) => [key, after[key]])),
      Object.fromEntries(Object.keys(settings).map((key) => [key, before[key]])));
    assert.equal(after.introductionDate, "2020-01-01");
    assert.equal(Object.keys(after.holdings).length, 40);
    assert.equal(context.networkStatsDirtyFrom, context.uniqueDates[0].getTime());
    assert.ok(![...context.simulationNodeInterventions.values()].some((changes) => changes.get("CR40")?.imports === false));
    assert.doesNotThrow(() => context.captureScenario());
    if (id === "open-trade") {
      assert.equal(context.simulationNodeInterventions.size, 0);
      assert.equal(context.simulationLinkInterventions.size, 0);
    } else if (id === "seed-community") assert.equal(context.simulationNodeInterventions.size, 0);
    else assert.equal(context.simulationLinkInterventions.size, 0);
  }
});

test("identical presets and saved scenarios reuse completed calculations in both modes", () => {
  for (const mode of ["trade", "simulation"]) {
    const { context, applied } = runtime();
    context.appDataMode = mode;
    context.simulationState.status = mode === "simulation" ? "ready" : "idle";
    for (const id of presetIds) {
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

test("shared introduction applies immediately while target count and absolute restrictions retain their roles", () => {
  const { context, elements, applied, recomputes } = runtime();
  context.loadPreset("hub-controls");
  const saved = plain(context.captureScenario());
  const calls = applied.length;
  context.setPresetSettings({ introductionDate: "2020-02-01", targetBudget: 1 });
  assert.equal(context.getPresetSettings().introductionDate, "2020-02-01");
  assert.equal(context.getPresetSettings().targetBudget, 1);
  const changed = plain(context.captureScenario());
  assert.equal(changed.settings.introductionDate, "2020-02-01");
  assert.equal(elements.simulationIntroductionDate.value, "2020-02-01");
  assert.deepEqual(changed.nodeInterventions, saved.nodeInterventions);
  assert.deepEqual(changed.linkInterventions, saved.linkInterventions);
  assert.equal(applied.length, calls);
  assert.deepEqual(recomputes, []);
  const draft = plain(context.getPresetSettings());
  for (const patch of [
    { introductionDate: "2020-02-30" }, { introductionDate: "2019-12-31" }, { introductionDate: "2021-01-01" },
    { targetBudget: 0 }, { targetBudget: 41 }, { targetBudget: 1.5 }, { targetBudget: "3" },
    { introductionDate: "2020-03-01", targetBudget: -1 }, { extra: 1 },
  ]) {
    assert.throws(() => context.setPresetSettings(patch));
    assert.deepEqual(plain(context.getPresetSettings()), draft);
    assert.deepEqual(plain(context.captureScenario()), changed);
  }
  context.loadPreset("hub-controls");
  assert.equal(context.readSimulationSettings().introductionDate, "2020-02-01");
  assert.equal([...context.simulationNodeInterventions.values()][0].size, 1);
});

test("date commits update simulation once and preserve ledger caches and manual calendar events", () => {
  for (const mode of ["trade", "simulation"]) {
    const { context, elements, applied, recomputes } = runtime();
    context.appDataMode = mode;
    context.simulationState.status = mode === "simulation" ? "ready" : "idle";
    const nodeTime = +context.uniqueDates[2] + dayMs;
    const linkTime = +context.uniqueDates[3];
    context.simulationNodeInterventions.set(nodeTime, new Map([["CR01", { exports: false }]]));
    context.simulationLinkInterventions.set(linkTime, new Map([["CR02-CR03", true]]));
    const events = plain([context.simulationNodeInterventions, context.simulationLinkInterventions]);
    const ledgerCache = { marker: "ledger" };
    context.comparisonDataCache.set("trade", ledgerCache);
    context.comparisonDataCache.set("simulation", { marker: "simulation" });
    context.setPresetSettings({ introductionDate: "2020-02-01" });
    assert.equal(context.readSimulationSettings().introductionDate, "2020-02-01");
    assert.equal(context.getScenarioContext().presetSettings.introductionDate, "2020-02-01");
    assert.equal(elements.simulationIntroductionDate.value, "2020-02-01");
    assert.deepEqual(plain([context.simulationNodeInterventions, context.simulationLinkInterventions]), events);
    assert.equal(context.networkStatsDirtyFrom, null);
    assert.equal(context.networkStatsDirtyDates.size, 0);
    assert.equal(context.comparisonDataCache.get("trade"), ledgerCache);
    assert.equal(context.comparisonDataCache.has("simulation"), false);
    assert.equal(applied.length, 0);
    assert.equal(recomputes.length, mode === "simulation" ? 1 : 0);
    const saved = plain(context.captureScenario());
    context.setPresetSettings({ introductionDate: "2020-02-01", targetBudget: 5 });
    assert.deepEqual(plain(context.captureScenario()), saved);
    assert.equal(recomputes.length, mode === "simulation" ? 1 : 0);
    context.loadPreset("temporary-standstill");
    assert.deepEqual([...context.simulationNodeInterventions.keys()],
      [Date.parse("2020-02-08"), Date.parse("2020-02-22")]);
  }
});

test("custom timing and target count prepare the next load without changing applied scenarios or caches", () => {
  for (const mode of ["trade", "simulation"]) {
    const { context, applied, recomputes } = runtime();
    context.appDataMode = mode;
    context.loadPreset("temporary-standstill");
    context.networkStatsDirtyFrom = null;
    const before = plain(context.captureScenario());
    const calls = applied.length;
    const graph = context.getNetworkPresetGraph();
    const tradeCache = {}, simulationCache = {};
    context.comparisonDataCache.set("trade", tradeCache);
    context.comparisonDataCache.set("simulation", simulationCache);
    context.setPresetSettings({ targetBudget: 2, responseDays: 3, standstillDays: 5 });
    assert.deepEqual(plain(context.captureScenario()), before);
    assert.equal(applied.length, calls);
    assert.deepEqual(recomputes, []);
    assert.equal(context.networkStatsDirtyFrom, null);
    assert.equal(context.networkStatsDirtyDates.size, 0);
    assert.equal(context.comparisonDataCache.get("trade"), tradeCache);
    assert.equal(context.comparisonDataCache.get("simulation"), simulationCache);
    assert.equal(context.getNetworkPresetGraph(), graph);
    const result = context.loadPreset("temporary-standstill");
    assert.equal(applied.length, calls + 1);
    assert.deepEqual([...context.simulationNodeInterventions.keys()], [Date.parse("2020-01-04"), Date.parse("2020-01-09")]);
    assert.equal(result.presetKey, presetTools.presetSettingsKey("temporary-standstill", context.getPresetSettings()));
    assert.match(context.getScenarioContext().presets.at(-1).duration, /5 calendar days/);
    const run = context.buildSimulationTrajectory(context.readSimulationSettings());
    assert.deepEqual(Array.from(run.frames.slice(0, 3), (frame) => frame.linkStates.has("CR01-CR02")), [true, false, true]);
  }
});

test("invalid timing patches leave all settings and schedules intact", () => {
  const { context, applied, recomputes } = runtime();
  context.loadPreset("seed-containment");
  const before = plain(context.captureScenario());
  const settingsBefore = plain(context.getPresetSettings());
  const calls = applied.length;
  for (const [key, values] of [
    ["responseDays", [-1, 366, 0.5, "7", NaN, Infinity, null]],
    ["standstillDays", [0, 366, 1.5, "14", NaN, Infinity, null]],
  ]) for (const value of values) {
    assert.throws(() => context.setPresetSettings({
      introductionDate: "2020-02-01", targetBudget: 2, responseDays: 2, standstillDays: 4, [key]: value,
    }));
    assert.deepEqual(plain(context.getPresetSettings()), settingsBefore);
    assert.deepEqual(plain(context.captureScenario()), before);
    assert.equal(applied.length, calls);
    assert.deepEqual(recomputes, []);
  }
  context.setPresetSettings({ responseDays: 365, standstillDays: 365 });
  context.loadPreset("temporary-standstill");
  assert.deepEqual([...context.simulationNodeInterventions.keys()],
    [Date.parse("2020-01-01") + 365 * dayMs, Date.parse("2020-01-01") + 730 * dayMs]);
  assert.doesNotThrow(() => context.captureScenario());
  context.setPresetSettings({ responseDays: 0, standstillDays: 1 });
  assert.equal(context.getPresetSettings().responseDays, 0);
  assert.equal(context.getPresetSettings().standstillDays, 1);
});

test("zero response delay applies every intervention at introduction and Trace Ring selects only the seed", () => {
  const { context } = runtime();
  context.setPresetSettings({ responseDays: 0, standstillDays: 1 });
  const introduction = +context.uniqueDates[0];
  for (const id of presetIds) {
    const result = context.loadPreset(id);
    if (id === "open-trade") {
      assert.equal(context.simulationNodeInterventions.size + context.simulationLinkInterventions.size, 0);
      continue;
    }
    const times = [...context.simulationNodeInterventions.keys(), ...context.simulationLinkInterventions.keys()];
    assert.equal(Math.min(...times), introduction, id);
    assert.match(context.getScenarioContext().presets.find((preset) => preset.id === id).timing, /On the introduction date/);
    assert.equal(result.presetKey, presetTools.presetSettingsKey(id, context.getPresetSettings()));
    if (id === "partner-ring") assert.deepEqual([...context.simulationNodeInterventions.get(introduction).keys()], ["CR01"]);
    if (id === "temporary-standstill") {
      assert.equal(context.simulationNodeInterventions.get(introduction + dayMs).get("CR01").exports, true);
    }
  }
});

test("custom response delays define the half-open daily tracing window", () => {
  const { context } = runtime();
  const introduction = +context.uniqueDates[0];
  context.presetDailyData.push(...[-1, 0, 2, 3, 4].map((offset, index) => ({
    time: new Date(introduction + offset * dayMs), COROP_LEV: "CR01", COROP_AFN: `CR0${index + 4}`, AANTAL: 1,
  })));
  const graph = context.getNetworkPresetGraph();
  for (const [responseDays, targets] of [[3, ["CR01", "CR02", "CR05", "CR06"]], [5, ["CR01", "CR02", "CR05", "CR06", "CR07", "CR08"]]]) {
    context.setPresetSettings({ responseDays });
    context.loadPreset("partner-ring");
    assert.deepEqual([...context.simulationNodeInterventions.get(introduction + responseDays * dayMs).keys()], targets);
    assert.equal(context.getNetworkPresetGraph(), graph);
  }
});

test("the first daily-history fetch initializes one shared introduction and reuses its request", async () => {
  const { context, elements } = runtime();
  const records = context.presetDailyData;
  context.presetDailyData = null;
  context.presetDailyDates = [];
  let release, requests = 0;
  context.fetchAsset = () => { requests++; return new Promise((resolve) => { release = resolve; }); };
  context.d3.csvParse = (_csv, convert) => records.map((row) => convert({ ...row, time: row.time.toISOString() }));
  const first = context.ensurePresetDailyData();
  assert.equal(context.ensurePresetDailyData(), first);
  assert.equal(requests, 1);
  release("movement ledger");
  await first;
  assert.equal(context.simulationIntroductionDate, "2020-01-01");
  assert.equal(context.readSimulationSettings().introductionDate, "2020-01-01");
  assert.equal(context.getPresetSettings().introductionDate, "2020-01-01");
  assert.equal(elements.simulationIntroductionDate.value, "2020-01-01");
  assert.equal(Object.keys(context.readSimulationSettings().holdings).length, 40);
  context.setPresetSettings({ introductionDate: "2020-02-01" });
  await context.ensurePresetDailyData();
  assert.equal(requests, 1);
  assert.equal(context.readSimulationSettings().introductionDate, "2020-02-01");
});

test("history loaded before the displayed ledger initializes settings when that ledger arrives", async () => {
  const { context, elements } = runtime();
  const records = context.presetDailyData;
  const displayData = context.loadedCSVData;
  const dates = context.uniqueDates;
  context.presetDailyData = null;
  context.presetDailyDates = [];
  context.loadedCSVData = null;
  context.uniqueDates = [];
  let requests = 0;
  context.fetchAsset = async () => { requests++; return "movement ledger"; };
  context.d3.csvParse = (_csv, convert) => records.map((row) => convert({ ...row, time: row.time.toISOString() }));
  assert.ok(await context.ensurePresetDailyData());
  assert.equal(context.simulationIntroductionDate, null);
  assert.equal(context.simulationPresetHoldings, null);
  assert.equal(context.presetDailyDataError, null);

  context.loadedCSVData = displayData;
  context.uniqueDates = dates;
  await context.ensurePresetDailyData();
  assert.equal(requests, 1);
  assert.equal(context.simulationIntroductionDate, "2020-01-01");
  assert.equal(elements.simulationIntroductionDate.value, "2020-01-01");
  assert.equal(Object.keys(context.simulationPresetHoldings).length, 40);
  assert.deepEqual(plain(context.simulationPresetHoldings), plain(context.getSimulationPopulationForDate("2020-01-01")));
});

test("population initialization reports failures, commits settings together, and retries with cached history", async () => {
  for (const cached of [false, true]) {
    const { context } = runtime();
    const records = context.presetDailyData;
    if (!cached) {
      context.presetDailyData = null;
      context.presetDailyDates = [];
    }
    let requests = 0, refreshes = 0;
    context.fetchAsset = async () => { requests++; return "movement ledger"; };
    context.d3.csvParse = (_csv, convert) => records.map((row) => convert({ ...row, time: row.time.toISOString() }));
    context.window.herdlinkComparison.refresh = () => { refreshes++; };
    const initializePopulation = context.getSimulationPopulationForDate;
    context.getSimulationPopulationForDate = () => { throw new Error("Population calculation failed"); };
    assert.equal(await context.ensurePresetDailyData(), null);
    assert.equal(context.simulationIntroductionDate, null);
    assert.equal(context.simulationPresetHoldings, null);
    assert.equal(context.presetDailyDataPromise, null);
    assert.match(context.presetDailyDataError, /Simulation settings could not be initialized: Population calculation failed/);
    assert.equal(context.getPresetSettings().ready, false);
    assert.equal(context.getScenarioContext().disabled, true);
    for (const preset of context.getScenarioContext().presets) {
      assert.match(preset.disabledReason, /Population calculation failed/);
      assert.throws(() => context.loadPreset(preset.id), /Population calculation failed/);
    }
    assert.equal(refreshes, 1);

    context.getSimulationPopulationForDate = initializePopulation;
    assert.ok(await context.ensurePresetDailyData());
    assert.equal(context.simulationIntroductionDate, "2020-01-01");
    assert.equal(Object.keys(context.simulationPresetHoldings).length, 40);
    assert.equal(context.presetDailyDataError, null);
    assert.equal(context.getPresetSettings().ready, true);
    assert.equal(context.getScenarioContext().disabled, false);
    assert.equal(requests, cached ? 0 : 1);
    assert.equal(refreshes, 2);
    await context.ensurePresetDailyData();
    await context.ensurePresetDailyData();
    assert.equal(refreshes, 2);
  }
});

test("failed history fetches preserve the date and allow a successful retry", async () => {
  const { context } = runtime();
  const records = context.presetDailyData;
  context.presetDailyData = null;
  context.presetDailyDates = [];
  context.fetchAsset = async () => { throw new Error("Connection interrupted"); };
  assert.equal(await context.ensurePresetDailyData(), null);
  assert.equal(context.simulationIntroductionDate, null);
  assert.equal(context.simulationPresetHoldings, null);
  assert.equal(context.presetDailyDataPromise, null);
  assert.match(context.presetDailyDataError, /Connection interrupted/);
  context.fetchAsset = async () => "movement ledger";
  context.d3.csvParse = (_csv, convert) => records.map((row) => convert({ ...row, time: row.time.toISOString() }));
  await context.ensurePresetDailyData();
  assert.equal(context.simulationIntroductionDate, "2020-01-01");
  assert.equal(context.presetDailyDataError, null);
});

test("saved population key order reuses results while changed populations recalculate", () => {
  for (const mode of ["trade", "simulation"]) {
    const { context, applied } = runtime();
    context.appDataMode = mode;
    context.simulationState.status = mode === "simulation" ? "ready" : "idle";
    context.loadPreset("seed-containment");
    context.networkStatsDirtyFrom = null;
    const saved = plain(context.captureScenario());
    const calls = applied.length;
    saved.settings.holdings = Object.fromEntries(Object.entries(saved.settings.holdings).reverse());
    context.loadScenario(saved);
    assert.equal(applied.length, calls);
    assert.equal(context.networkStatsDirtyFrom, null);
    saved.settings.holdings.CR01 += saved.settings.holdings.CR01 < 10000 ? 1 : -1;
    context.loadScenario(saved);
    assert.equal(applied.length, calls + 1);
    assert.equal(context.readSimulationSettings().holdings.CR01, saved.settings.holdings.CR01);
  }
});

test("historical selectors require complete coverage and unavailable daily data leaves schedules intact", () => {
  const { context } = runtime();
  context.loadPreset("seed-containment");
  const saved = plain(context.captureScenario());
  context.presetDailyData = context.presetDailyData.filter((row) => +row.time >= Date.UTC(2019, 6, 1));
  context.presetDailyDates = context.presetDailyDates.filter((time) => time >= Date.UTC(2019, 6, 1));
  const choices = context.getScenarioContext().presets;
  for (const id of ["seed-community", "hub-controls", "trade-bottlenecks"]) {
    assert.match(choices.find((preset) => preset.id === id).disabledReason, /365 preceding days/);
    assert.throws(() => context.loadPreset(id), /365 preceding days/);
    assert.deepEqual(plain(context.captureScenario()), saved);
  }
  for (const id of ["open-trade", "seed-containment", "partner-ring", "temporary-standstill"]) {
    assert.equal(choices.find((preset) => preset.id === id).disabledReason, null);
  }
  context.presetDailyData = null;
  context.presetDailyDataError = "Daily history could not be loaded.";
  for (const id of presetIds) {
    assert.throws(() => context.loadPreset(id), /could not be loaded/);
    assert.deepEqual(plain(context.captureScenario()), saved);
  }
});

test("a resolution with a shorter date range preserves the applied introduction and requires a valid preset date", () => {
  const { context, applied } = runtime({}, [0, 7, 14, 21, 28]);
  context.setPresetSettings({ introductionDate: "2020-01-28" });
  context.loadPreset("seed-containment");
  const settingsBefore = plain(context.readSimulationSettings());
  const nodesBefore = plain(context.simulationNodeInterventions);
  const linksBefore = plain(context.simulationLinkInterventions);
  const calls = applied.length;
  context.uniqueDates = context.uniqueDates.slice(0, 2);
  context.loadedCSVData = context.loadedCSVData.filter((row) => +row.time <= +context.uniqueDates.at(-1));
  const contextAfter = context.getScenarioContext();
  assert.equal(contextAfter.presetSettings.introductionDate, "2020-01-28");
  assert.equal(contextAfter.presetSettings.maxIntroductionDate, "2020-01-08");
  for (const preset of contextAfter.presets) {
    assert.match(preset.disabledReason, /introduction date|recorded|timeline/i);
    assert.throws(() => context.loadPreset(preset.id), /introduction date|recorded|timeline/i);
    assert.deepEqual(plain(context.readSimulationSettings()), settingsBefore);
    assert.deepEqual(plain(context.simulationNodeInterventions), nodesBefore);
    assert.deepEqual(plain(context.simulationLinkInterventions), linksBefore);
    assert.equal(applied.length, calls);
  }
});

test("saved introductions restore the shared control and legacy scenarios use their first recorded date", () => {
  const { context, elements } = runtime();
  const legacy = plain(context.captureScenario());
  delete legacy.settings.introductionDate;
  context.loadPreset("seed-containment");
  const saved = plain(context.captureScenario());
  context.setPresetSettings({ introductionDate: "2020-02-01" });
  context.loadScenario(saved);
  assert.equal(context.getPresetSettings().introductionDate, saved.settings.introductionDate);
  context.setPresetSettings({ introductionDate: "2020-03-01" });
  context.loadScenario(legacy);
  assert.equal(context.simulationIntroductionDate, "2020-01-01");
  assert.equal(elements.simulationIntroductionDate.value, "2020-01-01");
  assert.deepEqual(plain(context.readSimulationSettings()), { ...legacy.settings, introductionDate: "2020-01-01" });
});

test("Trace Ring uses observed daily outgoing contacts throughout its calendar window", () => {
  const { context } = runtime({}, [0, 7, 14]);
  const intro = Date.UTC(2020, 0, 1);
  const history = context.presetDailyData.filter((row) => +row.time < intro);
  context.presetDailyData = [...history, ...[
    [0, "CR01", "CR02", 100], [0, "CR03", "CR01", 100],
    [4, "CR01", "CR04", 50], [6, "CR01", "CR05", 20],
    [7, "CR01", "CR06", 80], [2, "CR01", "CR07", 0],
    [3, "CR01", "NA", 40], [3, "CR01", "CR08", Infinity],
  ].map(([day, COROP_LEV, COROP_AFN, AANTAL]) => ({ time: new Date(intro + day * dayMs), COROP_LEV, COROP_AFN, AANTAL }))];
  context.loadPreset("partner-ring");
  assert.deepEqual([...context.simulationNodeInterventions.get(intro + 7 * dayMs).keys()], ["CR01", "CR02", "CR04", "CR05"]);
});

test("historical rankings ignore future trade, disease parameters, prior restrictions and community scale", () => {
  for (const id of ["hub-controls", "trade-bottlenecks"]) {
    const { context, elements } = runtime();
    context.presetTargetBudget = 1;
    context.buildSimulationTrajectory = () => assert.fail("Structural selectors use movement history");
    const first = context.loadPreset(id);
    const initial = plain(first.scenario);
    const graph = context.getNetworkPresetGraph();
    context.loadPreset("temporary-standstill");
    assert.deepEqual(plain(context.loadPreset(id).scenario), initial);
    context.communityScale = "broad";
    assert.deepEqual(plain(context.loadPreset(id).scenario), initial);
    context.presetDailyData = [...context.presetDailyData, { time: context.uniqueDates.at(-1), COROP_LEV: "CR04", COROP_AFN: "CR01", AANTAL: 1e12 }];
    elements.simulationBeta.value = "0.8";
    const after = context.loadPreset(id).scenario;
    assert.deepEqual(plain(after.nodeInterventions), initial.nodeInterventions);
    assert.deepEqual(plain(after.settings.holdings), initial.settings.holdings);
    assert.equal(after.settings.beta, 0.8);
    assert.equal(graph.links.length, 3);
    assert.equal(context.getNetworkPresetGraph(), context.getNetworkPresetGraph());
  }
});

test("Cordon closes outgoing boundaries while preserving internal, inbound and local routes", () => {
  const { context } = runtime({}, [0, 2, 7, 10, 14]);
  context.loadedCSVData = context.uniqueDates.flatMap((time, index) => [
    ["CR01", "CR02", 100], ["CR02", "CR01", 25], ["CR01", "CR01", 9], ["CR03", "CR03", 6],
    ["CR03", "CR02", 15], ...(index === 3 ? [] : [["CR02", "CR03", 20]]),
  ].map(([COROP_LEV, COROP_AFN, AANTAL]) => ({ time, COROP_LEV, COROP_AFN, AANTAL })));
  context.loadPreset("open-trade");
  const parameters = context.readSimulationSettings();
  const original = context.buildSimulationTrajectory(parameters);
  const result = context.loadPreset("seed-community");
  assert.equal(context.simulationNodeInterventions.size, 0);
  assert.deepEqual(plain(result.scenario.linkInterventions), [
    [context.uniqueDates[2].getTime(), [["CR02-CR03", true]]],
    [context.uniqueDates[4].getTime(), [["CR02-CR03", true]]],
  ]);
  const intervention = context.buildSimulationTrajectory(parameters);
  assert.deepEqual(plain(intervention.frames.slice(0, 2)), plain(original.frames.slice(0, 2)));
  for (const frame of intervention.frames.slice(2)) {
    assert.equal(frame.linkStates.has("CR02-CR03"), false);
    for (const [key, weight] of [["CR01-CR02", 100], ["CR02-CR01", 25], ["CR03-CR02", 15], ["CR01-CR01", 9], ["CR03-CR03", 6]]) {
      assert.equal(frame.linkStates.get(key).ledgerWeight, weight);
    }
  }
  const saved = plain(context.captureScenario());
  const snapshot = context.getScenarioContext();
  context.loadPreset("open-trade");
  context.loadScenario(saved);
  assert.deepEqual(plain(context.captureScenario().linkInterventions), saved.linkInterventions);
  [...context.simulationLinkInterventions.values()][0].clear();
  assert.equal([...context.simulationLinkInterventions.values()][1].size, 1);
  assert.deepEqual(plain(snapshot.linkInterventions), saved.linkInterventions);
  assert.deepEqual(plain(result.scenario.linkInterventions), saved.linkInterventions);
  context.communityScale = "broad";
  context.loadPreset("seed-community");
  assert.equal(context.simulationNodeInterventions.size, 0);
  assert.equal(context.simulationLinkInterventions.size, 0);
});

test("responses and standstill duration use exact calendar dates across models and sample gaps", () => {
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    for (const [sigma, gamma] of [[0.25, 0.5], [0, 0.5], [0.25, 0]]) {
      for (const offsets of [[0, 2, 4, 8, 13, 22, 30], [0, 7, 14, 21, 28]]) {
        const { context } = runtime({ model, sigma, gamma }, offsets);
        context.loadPreset("temporary-standstill");
        const intro = +context.uniqueDates[0];
        const schedule = context.simulationNodeInterventions;
        assert.deepEqual([...schedule.keys()], [intro + 7 * dayMs, intro + 21 * dayMs]);
        assert.equal(schedule.get(intro + 7 * dayMs).size, 40);
        assert.equal(schedule.get(intro + 21 * dayMs).get("CR01").exports, true);
        const run = context.buildSimulationTrajectory(context.readSimulationSettings());
        for (const frame of run.frames) {
          const closed = +frame.date >= intro + 7 * dayMs && +frame.date < intro + 21 * dayMs;
          assert.equal(frame.linkStates.has("CR01-CR02"), !closed);
        }
      }
    }
  }
});

test("introduction waits for its first recorded date and historical population stays fixed across presets", () => {
  const { context } = runtime({}, [0, 2, 4, 8, 13, 21, 28]);
  context.setPresetSettings({ introductionDate: "2020-01-04" });
  context.loadPreset("open-trade");
  const parameters = context.readSimulationSettings();
  const baseline = context.buildSimulationTrajectory(parameters);
  for (const frame of baseline.frames.slice(0, 2)) {
    assert.equal(frame.summary.I, 0);
    assert.equal(frame.summary.E, 0);
    assert.equal(frame.summary.cumulativeInfections, 0);
  }
  assert.ok(baseline.frames[2].nodeStates.CR01.I > 0);
  for (const id of presetIds) {
    context.loadPreset(id);
    assert.deepEqual(plain(context.readSimulationSettings().holdings), plain(parameters.holdings));
    const run = context.buildSimulationTrajectory(context.readSimulationSettings());
    assert.deepEqual(plain(run.frames.slice(0, 4)), plain(baseline.frames.slice(0, 4)), id);
  }
});

test("future response schedules preserve recorded trade and disease when the horizon ends early", () => {
  for (const id of presetIds) {
    const { context } = runtime({}, [0, 1, 2]);
    context.loadPreset("open-trade");
    const original = context.buildSimulationTrajectory(context.readSimulationSettings());
    context.loadPreset(id);
    const run = context.buildSimulationTrajectory(context.readSimulationSettings());
    assert.deepEqual(plain(run.frames), plain(original.frames), id);
    assert.doesNotThrow(() => context.captureScenario());
  }
});


test("scenario context and preset results retain independent intervention snapshots", () => {
  const { context } = runtime();
  const result = context.loadPreset("seed-containment");
  const snapshot = context.getScenarioContext();
  const before = plain(result.scenario);
  assert.deepEqual(plain(snapshot.nodeInterventions), before.nodeInterventions);
  assert.deepEqual(plain(result.scenario.dates), context.uniqueDates.map((date) => date.toISOString()));
  context.simulationNodeInterventions.get(context.uniqueDates[1].getTime()).get("CR01").exports = true;
  context.simulationNodeInterventions.clear();
  context.simulationLinkInterventions.set(context.uniqueDates[0].getTime(), new Map([["CR01-CR02", true]]));
  assert.deepEqual(plain(result.scenario), before);
  assert.deepEqual(plain(snapshot.nodeInterventions), before.nodeInterventions);
  assert.deepEqual(plain(snapshot.linkInterventions), []);
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

test("scenario loads reuse matching schedules regardless of date, region, route and permission order", () => {
  for (const mode of ["trade", "simulation"]) {
    const { context, applied } = runtime();
    context.appDataMode = mode;
    context.simulationState.status = mode === "simulation" ? "ready" : "idle";
    const [first, second] = context.uniqueDates.map((date) => date.getTime());
    context.simulationNodeInterventions = new Map([
      [first, new Map([["CR01", { exports: false, imports: true }], ["CR02", { imports: false }]])],
      [second, new Map([["CR01", { exports: true }]])],
    ]);
    context.simulationLinkInterventions = new Map([
      [first, new Map([["CR01-CR02", true], ["CR02-CR03", true]])],
      [second, new Map([["CR03-CR01", true]])],
    ]);
    const saved = plain(context.captureScenario());
    saved.nodeInterventions.reverse();
    saved.linkInterventions.reverse();
    for (const [, changes] of saved.nodeInterventions) {
      changes.reverse();
      for (const change of changes) change[1] = Object.fromEntries(Object.entries(change[1]).reverse());
    }
    for (const [, changes] of saved.linkInterventions) changes.reverse();
    context.loadScenario(saved);
    assert.equal(applied.length, 0);
    const edited = structuredClone(saved);
    edited.nodeInterventions[0][1][0][1].exports = false;
    context.loadScenario(edited);
    assert.equal(applied.length, 1);
    context.networkStatsDirtyFrom = null;
    const routeEdit = structuredClone(edited);
    routeEdit.linkInterventions[0][1][0][0] = "CR01-CR03";
    context.loadScenario(routeEdit);
    assert.equal(applied.length, 2);
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
    assert.deepEqual(plain(context.captureScenario()), {
      ...saved, settings: { ...saved.settings, introductionDate: saved.dates[0].slice(0, 10) },
    });
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
    (item) => { item.settings.introductionDate = "2020-02-30"; },
    (item) => { item.settings.introductionDate = "2021-01-01"; },
    (item) => { delete item.settings.introductionDate; },
    (item) => { item.settings.holdings.CR01 = 0; },
    (item) => { item.settings.holdings.CR01 = Infinity; },
    (item) => { delete item.settings.holdings.CR01; },
    (item) => { item.settings.holdings.CR99 = 450; },
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
