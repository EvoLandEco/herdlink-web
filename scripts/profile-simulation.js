import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import vm from "node:vm";
import * as currentEngine from "../src/runtime/simulation-engine.js";
import { createSyntheticPopulationSnapshot } from "../src/runtime/simulation-population.js";
import { createPooledFlows } from "../src/pooledFlows.js";

const root = new URL("../", import.meta.url);
const reference = process.argv[2] || "HEAD";
const rounds = 3;
const historicalSource = (path) => execFileSync("git", ["show", `${reference}:${path}`], {
  cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
});
const engineSource = historicalSource("src/runtime/simulation-engine.js").replace(
  '"./simulation-population.js"', JSON.stringify(new URL("src/runtime/simulation-population.js", root).href));
const referenceEngine = await import(`data:text/javascript;base64,${Buffer.from(engineSource).toString("base64")}`);
const sources = {
  reference: { engine: referenceEngine, source: historicalSource("src/runtime/herdlink-runtime.js") },
  workingTree: { engine: currentEngine, source: readFileSync(new URL("src/runtime/herdlink-runtime.js", root), "utf8") },
};
const csv = readFileSync(new URL("src/assets/data/daily_aggregation.csv", root), "utf8");
const lines = csv.trim().split(/\r?\n/);
assert.equal(lines.shift(), '"","time","COROP_LEV","COROP_AFN","AANTAL"');
const data = lines.map((line) => {
  const [, date, COROP_LEV, COROP_AFN, AANTAL] = line.replaceAll('"', "").split(",");
  return { time: new Date(date), COROP_LEV, COROP_AFN, AANTAL: Number(AANTAL) };
});
const flowBundle = JSON.parse(readFileSync(new URL("src/assets/data/international_flows.json", root), "utf8"));
assert.equal(createHash("sha256").update(csv).digest("hex"), flowBundle.source.assets["daily_aggregation.csv"]);
const calendars = createPooledFlows(flowBundle).calendars;
const dates = calendars.get("daily");
const ids = Array.from({ length: 40 }, (_, index) => `CR${String(index + 1).padStart(2, "0")}`);
const population = createSyntheticPopulationSnapshot({ ids, data, introductionDate: "2020-01-01" });
const settings = {
  model: "SEIR", seedRegion: "CR35", introductionDate: "2020-01-01",
  initializationConvention: "prevalence-shares", initialPct: 1,
  beta: 0.16, movementBeta: 0.04, sigma: 0.22, gamma: 0.15, omega: 0.02,
  holdings: population.values, population,
};
const schedules = {
  open: new Map(),
  standstill: new Map([
    [Date.parse("2020-01-08"), new Map(ids.map((id) => [id, { exports: false }]))],
    [Date.parse("2020-01-22"), new Map(ids.map((id) => [id, { exports: true }]))],
  ]),
};

function runtime({ engine, source }, nodeInterventions) {
  const context = vm.createContext({
    Date, Map, window: { herdlinkSimulation: engine }, dailySimulationCache: new Map(),
    collectSimulationRegionIds: () => ids, simulationNodeInterventions: nodeInterventions,
    simulationLinkInterventions: new Map(),
  });
  vm.runInContext(source.match(/^([ ]*)function buildSimulationTrajectory\([^]*?^\1}/m)[0], context);
  return context;
}

function digest(trajectory) {
  const hash = createHash("sha256");
  const append = (value) => hash.update(JSON.stringify(value, (_, item) => item instanceof Map ? [...item] : item));
  append({ identity: trajectory.identity, initialFrame: trajectory.initialFrame, boundaryIndices: trajectory.boundaryIndices,
    ids: trajectory.ids, holdings: trajectory.holdings, metricMax: trajectory.metricMax, coverage: trajectory.coverage });
  for (const frame of trajectory.frames) {
    assert.equal(trajectory.frameByKey[frame.key], frame);
    append(frame);
  }
  return hash.digest("hex");
}

function measure(fn) {
  globalThis.gc?.();
  const start = performance.now();
  const result = fn();
  return { result, ms: performance.now() - start };
}

const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
    minMs: +sorted[0].toFixed(3), maxMs: +sorted.at(-1).toFixed(3) };
};
const report = {
  node: process.version, cpu: cpus()[0].model,
  referenceCommit: execFileSync("git", ["rev-parse", reference], { cwd: root, encoding: "utf8" }).trim(),
  rounds, rows: data.length, days: dates.length, regions: ids.length,
  timingScope: "Daily input preparation and integration through buildSimulationTrajectory; cached lookups retain input validation. CSV parsing, hashing, assertions and rendering are outside timed calls.",
  cases: [],
};

for (const [name, nodeInterventions] of Object.entries(schedules)) {
  const samples = Object.fromEntries(Object.keys(sources).map((key) => [key, { cold: [], cached: [], weekly: [] }]));
  let expectedHash, expectedWeeklyHash;
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 ? Object.keys(sources).reverse() : Object.keys(sources);
    for (const key of order) {
      const app = runtime(sources[key], nodeInterventions);
      const first = measure(() => app.buildSimulationTrajectory(settings, { data, dates }));
      samples[key].cold.push(first.ms);
      const repeated = measure(() => app.buildSimulationTrajectory(settings, { data, dates }));
      samples[key].cached.push(repeated.ms);
      assert.equal(first.result, repeated.result);
      const weekly = measure(() => sources[key].engine.aggregateDailyTrajectory(first.result, calendars.get("weekly")));
      samples[key].weekly.push(weekly.ms);
      const hash = digest(first.result), weeklyHash = digest(weekly.result);
      expectedHash ??= hash;
      expectedWeeklyHash ??= weeklyHash;
      assert.equal(hash, expectedHash, `${key} ${name} daily trajectory`);
      assert.equal(weeklyHash, expectedWeeklyHash, `${key} ${name} weekly trajectory`);
      app.dailySimulationCache.clear();
    }
  }
  report.cases.push({ name, exactResults: true, dailyHash: expectedHash, weeklyHash: expectedWeeklyHash,
    timings: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key,
      Object.fromEntries(Object.entries(values).map(([phase, samples]) => [phase, summarize(samples)]))])) });
}
console.log(JSON.stringify(report, null, 2));
