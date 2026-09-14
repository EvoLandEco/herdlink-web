import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const runtimePath = "src/runtime/herdlink-runtime.js";
const baselineRef = process.argv[2] || "2994c3110417a5150808c233401e5808d52c791b";
const source = readFileSync(new URL(runtimePath, root), "utf8");
const baselineSource = execFileSync("git", ["show", `${baselineRef}:${runtimePath}`], { cwd: root, encoding: "utf8" });
const shared = [
  "getNodeId", "getLinkKey", "getTradeRecordsByDate", "collectSimulationRegionIds",
  "getSimulationLinkAvailability", "applySimulationNodePermissions", "getDisabledLinkKeys", "computeModularity",
];
function runtime(text, names, louvainSource) {
  const context = vm.createContext({
    Date, Map, Set, tradeRecordsByDataset: new WeakMap(), simulationRegionIdsByDataset: new WeakMap(),
    communityScale: "broad", comparisonDataCache: new Map(), window: { maxTemporalStats: {} },
    refreshTradeCommunityScale() {},
  });
  const functions = names.map((name) => {
    const match = text.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
    assert.ok(match, `Runtime function ${name} exists`);
    return match[0];
  }).join("\n");
  vm.runInContext(louvainSource + "\n" + functions, context);
  let detections = 0;
  const louvain = context.jLouvain;
  context.jLouvain = () => { detections++; return louvain(); };
  context.detections = () => detections;
  return context;
}
const baseline = runtime(baselineSource, shared, execFileSync("git", ["show", `${baselineRef}:src/runtime/jLouvain.js`],
  { cwd: root, encoding: "utf8" }));
const current = runtime(source, [...shared, "computeTradeCommunityTimeline", "evaluatePartitionModularity", "setTradeCommunityScale"],
  readFileSync(new URL("src/runtime/jLouvain.js", root), "utf8"));
function perDate(data, times, nodeInterventions, linkInterventions) {
  const rowsByDate = baseline.getTradeRecordsByDate(data);
  const ids = baseline.collectSimulationRegionIds(data);
  const events = [...nodeInterventions].sort(([a], [b]) => a - b);
  const permissions = new Map();
  let eventIndex = 0;
  for (const time of times) {
    while (eventIndex < events.length && events[eventIndex][0] <= time) {
      const [eventTime, changes] = events[eventIndex++];
      baseline.applySimulationNodePermissions(permissions, changes, eventTime);
    }
    const disabled = baseline.getDisabledLinkKeys(new Date(time), ids, permissions, linkInterventions);
    const nodes = new Set();
    const links = [];
    for (const row of rowsByDate.get(time)) {
      const source = row.COROP_LEV;
      const target = row.COROP_AFN;
      if (!source || !target || source.toUpperCase() === "NA" || target.toUpperCase() === "NA") continue;
      nodes.add(source);
      nodes.add(target);
      const weight = +row.AANTAL;
      if (weight > 0 && !disabled.has(baseline.getLinkKey(source, target))) links.push({ source, target, weight });
    }
    baseline.computeModularity([...nodes].sort().map((id) => ({ id })), links);
  }
}
const rounds = 25;
const warmupRounds = 5;
function summarize(values) {
  values.sort((a, b) => a - b);
  return {
    medianMs: +values[Math.floor(values.length / 2)].toFixed(3),
    p95Ms: +values[Math.ceil(values.length * 0.95) - 1].toFixed(3),
    maxMs: +values.at(-1).toFixed(3),
  };
}
function benchmark(before, after) {
  const baselineTimes = [];
  const currentTimes = [];
  const counts = { baseline: 0, aggregate: 0 };
  for (let round = -warmupRounds; round < rounds; round++) {
    for (const [key, calculate, context, samples] of round % 2 === 0
      ? [["baseline", before, baseline, baselineTimes], ["aggregate", after, current, currentTimes]]
      : [["aggregate", after, current, currentTimes], ["baseline", before, baseline, baselineTimes]]) {
      const count = context.detections();
      const start = performance.now();
      calculate();
      const duration = performance.now() - start;
      if (round >= 0) samples.push(duration);
      counts[key] = context.detections() - count;
    }
  }
  return { baseline: summarize(baselineTimes), aggregate: summarize(currentTimes), louvainCalls: counts };
}

function benchmarkScaleSelection(timeline, times) {
  current.communityScale = "broad";
  current.tradeCommunityTimeline = timeline;
  current.window.allTemporalStats = Object.fromEntries(times.map((time) => {
    const communityScales = Object.fromEntries(Object.entries(timeline.byScale).map(([scale, value]) =>
      [scale, { partition: value.partition, numPartitions: value.numPartitions, modularity: value.modularityByDate.get(time) }]));
    return [new Date(time).toISOString(), {
      totalNodes: 40, totalEdges: 300, totalTradeVolume: 100_000, avgTradeEdge: 333,
      avgTradeNode: 2500, numComponents: 1, spectralRadius: 100,
      ...communityScales.broad, communityScales,
    }];
  }));
  const samples = [];
  const count = current.detections();
  for (let round = -warmupRounds; round < rounds; round++) {
    const scale = current.communityScale === "broad" ? "finer" : "broad";
    const start = performance.now();
    const changed = current.setTradeCommunityScale(scale);
    const duration = performance.now() - start;
    assert.equal(changed, true);
    if (round >= 0) samples.push(duration);
    assert.ok(Object.values(current.window.allTemporalStats).every((stats) =>
      stats.partition === timeline.byScale[scale].partition && stats.numPartitions === timeline.byScale[scale].numPartitions));
  }
  const louvainCalls = current.detections() - count;
  assert.equal(louvainCalls, 0);
  return { ...summarize(samples), louvainCalls };
}

const report = {
  node: process.version, cpu: cpus()[0].model,
  baselineCommit: execFileSync("git", ["rev-parse", baselineRef], { cwd: root, encoding: "utf8" }).trim(),
  rounds, warmupRounds,
  timingScope: "Community graph assembly, restrictions, Louvain and modularity; excludes CSV parsing, date indexing, centralities and rendering. The baseline fits every date separately with local trade; aggregate fits Broad and Finer to one full-period interregional graph and scores both across dates.",
  cachedScaleSelectionScope: "Real scale selector copying cached community fields for every date and calculating the selected modularity maximum; comparison rendering and UI redraw are stubbed. Includes no community detection, centrality or simulation work.",
  datasets: [],
};
for (const aggregation of ["daily", "weekly", "monthly", "yearly"]) {
  const lines = readFileSync(new URL(`src/assets/data/${aggregation}_aggregation.csv`, root), "utf8").trim().split(/\r?\n/);
  assert.equal(lines.shift(), '"","time","COROP_LEV","COROP_AFN","AANTAL"');
  const data = lines.map((line) => {
    const [, time, COROP_LEV, COROP_AFN, AANTAL] = line.replaceAll('"', "").split(",");
    return { time: new Date(time), COROP_LEV, COROP_AFN, AANTAL: Number(AANTAL) };
  });
  const dates = current.getTradeRecordsByDate(data);
  baseline.getTradeRecordsByDate(data);
  const times = [...dates.keys()].sort((a, b) => a - b);
  const busiest = times.reduce((a, b) => dates.get(a).length >= dates.get(b).length ? a : b);
  const middle = times[Math.floor(times.length / 2)];
  const routes = dates.get(busiest).filter((row) => row.COROP_LEV !== row.COROP_AFN && row.AANTAL > 0);
  const route = routes.reduce((a, b) => a.AANTAL >= b.AANTAL ? a : b);
  const links = new Map([[busiest, new Map([[`${route.COROP_LEV}-${route.COROP_AFN}`, true]])]]);
  const nodes = new Map([[middle, new Map([[route.COROP_LEV, { exports: false }]])]]);
  const empty = new Map();
  const partition = current.computeTradeCommunityTimeline(data, empty, empty);
  const selected = times.filter((time) => time >= middle);
  report.datasets.push({
    aggregation, records: data.length, dates: times.length,
    regions: Object.keys(partition.partition).length,
    communityScales: Object.fromEntries(Object.entries(partition.byScale).map(([scale, value]) => {
      const counts = new Map();
      for (const label of Object.values(value.partition)) counts.set(label, (counts.get(label) || 0) + 1);
      const sizes = [...counts.values()].sort((a, b) => b - a);
      return [scale, { resolution: value.resolution, communities: value.numPartitions, sizes,
        singletons: sizes.filter((size) => size === 1).length }];
    })),
    distinctUndirectedRoutes: new Set(data.filter((row) => row.COROP_LEV && row.COROP_AFN &&
      row.COROP_LEV !== row.COROP_AFN &&
      row.COROP_LEV.toUpperCase() !== "NA" && row.COROP_AFN.toUpperCase() !== "NA" &&
      row.AANTAL > 0 && Number.isFinite(row.AANTAL))
      .map((row) => [row.COROP_LEV, row.COROP_AFN].sort().join(":"))).size,
    fullTimeline: benchmark(() => perDate(data, times, empty, empty),
      () => current.computeTradeCommunityTimeline(data, empty, empty)),
    singleDateLinkEdit: {
      date: new Date(busiest).toISOString().slice(0, 10), route: `${route.COROP_LEV}-${route.COROP_AFN}`,
      ...benchmark(() => perDate(data, [busiest], empty, links),
        () => current.computeTradeCommunityTimeline(data, empty, links)),
    },
    persistentExportEdit: {
      from: new Date(middle).toISOString().slice(0, 10), region: route.COROP_LEV, affectedDates: selected.length,
      ...benchmark(() => perDate(data, selected, nodes, empty),
        () => current.computeTradeCommunityTimeline(data, nodes, empty)),
    },
    cachedScaleSelection: benchmarkScaleSelection(partition, times),
  });
}
console.log(JSON.stringify(report, null, 2));
