import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const functions = [
  "getNodeId", "getLinkKey", "getTradeRecordsByDate", "collectSimulationRegionIds",
  "getSimulationLinkAvailability", "getSimulationNodePermissions", "applySimulationNodePermissions",
  "getDisabledLinkKeys", "computeModularity", "evaluatePartitionModularity",
  "computeTradeCommunityTimeline", "computeTemporalNetworkStats", "computeSimpleStats",
  "computeNumberOfConnectedComponents",
].map((name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}).join("\n");
const dates = [0, 1, 2].map((day) => new Date(Date.UTC(2020, 0, 1 + day)));
const record = (day, source, target, weight) => ({
  time: dates[day], COROP_LEV: source, COROP_AFN: target, AANTAL: weight,
});
const fixture = () => [
  record(0, "CR01", "CR02", 50), record(0, "CR03", "CR04", 50),
  record(1, "CR01", "CR03", 1), record(1, "CR02", "CR04", 1),
];
const plain = (value) => JSON.parse(JSON.stringify(value));
function runtime(data = fixture()) {
  let detections = 0;
  let centralities = 0;
  const values = (items, accessor = (item) => item) => Array.from(items, accessor);
  const context = vm.createContext({
    Date, Map, Set, loadedCSVData: data,
    uniqueDates: [...new Set(data.map((row) => row.time.getTime()))].sort((a, b) => a - b).map((time) => new Date(time)),
    tradeRecordsByDataset: new WeakMap(), simulationRegionIdsByDataset: new WeakMap(),
    originalLedgerStatsByDataset: new WeakMap(), tradeCommunityTimeline: null, communityScale: "broad",
    simulationNodeInterventions: new Map(), simulationLinkInterventions: new Map(),
    networkStatsDirtyDates: new Set(), networkStatsDirtyFrom: null,
    ledgerBaselineSpectralRadius: 0, window: {},
    computeSpectralRadius: () => 0,
    computeHotSpotMetrics: () => ({ calculation: ++centralities }),
    d3: {
      min: (items, accessor) => Math.min(...values(items, accessor)),
      max: (items, accessor) => Math.max(...values(items, accessor)),
      sum: (items, accessor) => values(items, accessor).reduce((sum, value) => sum + value, 0),
    },
  });
  vm.runInContext(readFileSync(new URL("../src/runtime/jLouvain.js", import.meta.url), "utf8") + "\n" + functions, context);
  const louvain = context.jLouvain;
  context.jLouvain = () => { detections++; return louvain(); };
  context.counts = () => ({ detections, centralities });
  return context;
}
function score(links, partition) {
  let volume = 0;
  let internal = 0;
  const degrees = new Map();
  for (const { source, target, weight } of links) {
    if ((source.id ?? source) === (target.id ?? target)) continue;
    volume += weight;
    const first = partition[source.id ?? source];
    const second = partition[target.id ?? target];
    if (first === second) internal += weight;
    degrees.set(first, (degrees.get(first) || 0) + weight);
    degrees.set(second, (degrees.get(second) || 0) + weight);
  }
  return volume ? internal / volume - [...degrees.values()]
    .reduce((total, degree) => total + (degree / (2 * volume)) ** 2, 0) : 0;
}

test("one aggregate partition retains negative modularity when a date crosses its communities", () => {
  const context = runtime([...fixture(), record(1, "CR05", "CR06", 0)]);
  const result = context.computeTradeCommunityTimeline(context.loadedCSVData, new Map(), new Map());
  assert.equal(result.numPartitions, 2);
  assert.equal(result.partition.CR01, result.partition.CR02);
  assert.equal(result.partition.CR03, result.partition.CR04);
  assert.notEqual(result.partition.CR01, result.partition.CR03);
  assert.deepEqual(Object.keys(result.partition).sort(), ["CR01", "CR02", "CR03", "CR04"]);
  assert.equal(result.modularityByDate.get(dates[0].getTime()), 0.5);
  assert.equal(result.modularityByDate.get(dates[1].getTime()), -0.5);
  assert.equal(context.counts().detections, 2);
});

test("community labels are invariant to row ordering, reciprocal records and temporal binning", () => {
  const context = runtime();
  const calculate = (data) => plain(context.computeTradeCommunityTimeline(data, new Map(), new Map()).partition);
  const data = fixture();
  const expected = calculate(data);
  assert.deepEqual(calculate([...data].reverse()), expected);
  assert.deepEqual(calculate(data.flatMap((row) => [
    { ...row, AANTAL: row.AANTAL / 4 },
    { ...row, COROP_LEV: row.COROP_AFN, COROP_AFN: row.COROP_LEV, AANTAL: row.AANTAL * 3 / 4 },
  ])), expected);
  assert.deepEqual(calculate(data.map((row) => ({ ...row, time: dates[0] }))), expected);
  context.communityScale = "finer";
  const finer = calculate(data);
  assert.deepEqual(calculate([...data].reverse()), finer);
  assert.deepEqual(calculate(data.map((row) => ({ ...row, time: dates[0] }))), finer);
});

test("aggregate communities honor persistent node permissions and date-specific link controls", () => {
  const data = dates.flatMap((_, day) => [
    record(day, "CR01", "CR02", 10), record(day, "CR03", "CR04", 20), record(day, "CR01", "CR01", 2),
  ]);
  const context = runtime(data);
  const nodes = new Map([
    [dates[0].getTime() + 12 * 3600_000, new Map([["CR01", { exports: false }]])],
    [dates[2].getTime(), new Map([["CR01", { exports: true }]])],
  ]);
  const links = new Map([[dates[1].getTime(), new Map([["CR03-CR04", true]])]]);
  const expectedData = data.filter((row) => row.time !== dates[1] || row.COROP_LEV === row.COROP_AFN);
  const expected = context.computeTradeCommunityTimeline(expectedData, new Map(), new Map());
  const actual = context.computeTradeCommunityTimeline(data, nodes, links);
  assert.deepEqual(plain(actual.partition), plain(expected.partition));
  assert.deepEqual([...actual.modularityByDate], [...expected.modularityByDate]);
  assert.equal(actual.modularityByDate.get(dates[1].getTime()), 0);
});

test("empty and fully restricted graphs have no inferred communities", () => {
  const data = fixture();
  const context = runtime(data);
  const restrictions = new Map(dates.slice(0, 2).map((date) => [date.getTime(), new Map(
    data.filter((row) => row.time === date).map((row) => [`${row.COROP_LEV}-${row.COROP_AFN}`, true]),
  )]));
  for (const result of [context.computeTradeCommunityTimeline([], new Map(), new Map()),
    context.computeTradeCommunityTimeline(data, new Map(), restrictions)]) {
    assert.deepEqual(plain(result.partition), {});
    assert.equal(result.numPartitions, 0);
    assert.ok([...result.modularityByDate.values()].every((value) => value === 0));
  }
});

test("fixed-partition modularity uses interregional volume and counts reciprocal weights consistently", () => {
  const context = runtime();
  const partition = { a: 0, b: 0, c: 1 };
  const links = [
    { source: "a", target: "a", weight: 13 },
    { source: "a", target: "b", weight: 7 },
    { source: { id: "b" }, target: { id: "a" }, weight: 11 },
    { source: "b", target: "c", weight: 5 },
    { source: { id: "c" }, target: { id: "c" }, weight: 3 },
  ];
  assert.ok(Math.abs(context.evaluatePartitionModularity(links, partition) - score(links, partition)) < 1e-12);
  const nullTerm = (score(links, partition) - context.evaluatePartitionModularity(links, partition, 1.5)) / 0.5;
  const directNullTerm = [(2 * (7 + 11) + 5) / 46, 5 / 46]
    .reduce((sum, strength) => sum + strength ** 2, 0);
  assert.ok(Math.abs(nullTerm - directNullTerm) < 1e-12);
  assert.equal(context.evaluatePartitionModularity([], {}), 0);
  assert.equal(context.evaluatePartitionModularity([{ source: "local", target: "local", weight: 1000 }], {}), 0);
});

test("local trade preserves ledger totals while leaving both community partitions and date scores unchanged", () => {
  const data = [...fixture(), record(0, "CR01", "CR01", 10_000), record(0, "CR05", "CR05", 5000),
    record(2, "CR05", "CR05", 5000)];
  const context = runtime(data);
  const baseline = context.computeTradeCommunityTimeline(fixture(), new Map(), new Map());
  const result = context.computeTradeCommunityTimeline(data, new Map(), new Map());
  for (const scale of ["broad", "finer"]) {
    assert.deepEqual(plain(result.byScale[scale].partition), plain(baseline.byScale[scale].partition));
    assert.equal(result.byScale[scale].partition.CR05, undefined);
    for (const date of dates.slice(0, 2)) assert.equal(result.byScale[scale].modularityByDate.get(+date),
      baseline.byScale[scale].modularityByDate.get(+date));
    assert.equal(result.byScale[scale].modularityByDate.get(+dates[2]), 0);
  }
  context.computeTemporalNetworkStats();
  assert.equal(context.window.allTemporalStats[dates[0].toISOString()].totalTradeVolume, 15_100);
  assert.equal(context.window.allTemporalStats[dates[2].toISOString()].totalTradeVolume, 5000);
});

test("bundled interregional communities agree across all temporal tables", () => {
  let reference;
  for (const dataset of ["daily", "weekly", "monthly", "yearly"]) {
    const data = readFileSync(new URL(`../src/assets/data/${dataset}_aggregation.csv`, import.meta.url), "utf8")
      .trim().split(/\r?\n/).slice(1).map((line) => {
        const [, time, COROP_LEV, COROP_AFN, AANTAL] = line.replaceAll('"', "").split(",");
        return { time: new Date(time), COROP_LEV, COROP_AFN, AANTAL: +AANTAL };
      });
    const context = runtime(data);
    const result = context.computeTradeCommunityTimeline(data, new Map(), new Map());
    const partitions = Object.fromEntries(Object.entries(result.byScale).map(([scale, value]) => [scale, plain(value.partition)]));
    if (reference) assert.deepEqual(partitions, reference, dataset);
    else reference = partitions;
    for (const [scale, sizes] of [["broad", [30, 10]], ["finer", [16, 11, 7, 3, 3]]]) {
      const counts = new Map();
      for (const group of Object.values(partitions[scale])) counts.set(group, (counts.get(group) || 0) + 1);
      assert.deepEqual([...counts.values()].sort((a, b) => b - a), sizes);
    }
  }
});

test("a partial date refresh propagates its aggregate partition without recalculating other centralities", () => {
  const context = runtime();
  context.computeTemporalNetworkStats();
  const keys = dates.slice(0, 2).map((date) => date.toISOString());
  const original = context.originalLedgerStatsByDataset.get(context.loadedCSVData);
  const originalSnapshot = plain(original);
  const oldStats = context.window.allTemporalStats[keys[1]];
  const oldNodeStats = context.window.allTemporalNodeStats[keys[1]];
  context.simulationLinkInterventions.set(dates[0].getTime(), new Map([
    ["CR01-CR02", true], ["CR03-CR04", true],
  ]));
  context.computeTemporalNetworkStats([dates[0]]);
  const current = context.window.allTemporalStats;
  assert.equal(current[keys[0]].partition, current[keys[1]].partition);
  assert.equal(current[keys[1]].partition.CR01, current[keys[1]].partition.CR03);
  assert.notEqual(current[keys[1]].partition.CR01, current[keys[1]].partition.CR02);
  assert.equal(current[keys[1]].modularity, 0.5);
  assert.equal(current[keys[0]].modularity, 0);
  assert.notEqual(current[keys[1]], oldStats);
  assert.equal(context.window.allTemporalNodeStats[keys[1]], oldNodeStats);
  assert.deepEqual(plain(original), originalSnapshot);
  assert.deepEqual(context.counts(), { detections: 4, centralities: 3 });
});

test("scenario queries use every dataset date without mutating the live timeline or original cache", () => {
  const context = runtime();
  context.computeTemporalNetworkStats();
  const before = plain(context.window);
  const timeline = context.tradeCommunityTimeline;
  const baseline = context.originalLedgerStatsByDataset.get(context.loadedCSVData);
  const result = context.computeTemporalNetworkStats([dates[1]], {
    nodeInterventions: new Map(), linkInterventions: new Map(), store: false,
  });
  const stats = result.global[dates[1].toISOString()];
  assert.equal(stats.partition.CR01, stats.partition.CR02);
  assert.equal(stats.modularity, -0.5);
  assert.deepEqual(plain(context.window), before);
  assert.equal(context.tradeCommunityTimeline, timeline);
  assert.equal(context.originalLedgerStatsByDataset.get(context.loadedCSVData), baseline);
});

test("loading a restricted scenario does not populate the original ledger cache", () => {
  const context = runtime();
  context.simulationLinkInterventions.set(dates[0].getTime(), new Map([["CR01-CR02", true]]));
  context.computeTemporalNetworkStats();
  const cached = context.originalLedgerStatsByDataset.get(context.loadedCSVData);
  assert.ok(!cached || (!Object.keys(cached.global).length && !Object.keys(cached.node).length));
});
