import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import vm from "node:vm";
import {
  getHistoricalPresetGraph, selectHubTargets, selectBridgeTargets,
  selectTraceRingTargets, getSeedCommunityMembers,
} from "../src/runtime/intervention-presets.js";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/runtime/herdlink-runtime.js", root), "utf8");
const louvain = readFileSync(new URL("src/runtime/jLouvain.js", root), "utf8");
const rounds = Number(process.argv[2] || 7);
assert.ok(Number.isInteger(rounds) && rounds > 0, "Usage: node scripts/profile-network-presets.js [rounds]");
const functions = ["getNodeId", "computeModularity"].map((name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Production function ${name} exists`);
  return match[0];
}).join("\n");
const context = vm.createContext({});
vm.runInContext(`${louvain}\n${functions}`, context);
const csv = readFileSync(new URL("src/assets/data/daily_aggregation.csv", root), "utf8");
const lines = csv.trim().split(/\r?\n/);
assert.equal(lines.shift(), '"","time","COROP_LEV","COROP_AFN","AANTAL"');
const data = lines.map((line) => {
  const [, time, COROP_LEV, COROP_AFN, AANTAL] = line.replaceAll('"', "").split(",");
  return { time: new Date(time), COROP_LEV, COROP_AFN, AANTAL: Number(AANTAL) };
});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const report = {
  node: process.version, cpu: cpus()[0].model, rounds, cachedRounds: 100,
  dataset: "daily", records: data.length, seed: "CR35", targetBudget: 3, historyDays: 365,
  sourceHashes: {
    runtime: sha256(source), louvain: sha256(louvain), daily: sha256(csv),
    selectors: sha256(readFileSync(new URL("src/runtime/intervention-presets.js", root))),
  },
  scope: "Imported production selectors and the production Louvain wrapper. CSV parsing, schedule application, other metrics, rendering and epidemic calculations sit outside the measurements.",
  cachedSelectionsScope: "Historical graph lookup, Hubs, Bridges and seed-community membership at both resolutions after their first calculations.",
  windows: [],
};

function measure(calculate, samples) {
  const start = performance.now();
  const result = calculate();
  samples.push(performance.now() - start);
  return result;
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(4),
    p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(4),
  };
}

for (const introductionDate of ["2020-01-01", "2020-04-01", "2020-07-01", "2020-10-01"]) {
  const end = Date.parse(introductionDate), start = end - 365 * 86400000, response = end + 7 * 86400000;
  const samples = Object.fromEntries(["historicalGraph", "firstHubs", "firstBridges", "firstBroad", "firstFiner", "traceRing", "cachedSelections"].map((key) => [key, []]));
  let graph, rows, hubs, bridges, broad, finer, ring;
  for (let round = 0; round < rounds; round++) {
    rows = data.slice();
    graph = measure(() => getHistoricalPresetGraph(rows, start, end), samples.historicalGraph);
    hubs = measure(() => selectHubTargets(graph, report.targetBudget), samples.firstHubs);
    bridges = measure(() => selectBridgeTargets(graph, report.targetBudget), samples.firstBridges);
    broad = measure(() => getSeedCommunityMembers(graph, report.seed, 1, context.computeModularity), samples.firstBroad);
    finer = measure(() => getSeedCommunityMembers(graph, report.seed, 1.5, context.computeModularity), samples.firstFiner);
    ring = measure(() => selectTraceRingTargets(rows, report.seed, end, response), samples.traceRing);
  }
  for (let round = 0; round < report.cachedRounds; round++) {
    measure(() => {
      const same = getHistoricalPresetGraph(rows, start, end);
      selectHubTargets(same, report.targetBudget);
      selectBridgeTargets(same, report.targetBudget);
      getSeedCommunityMembers(same, report.seed, 1, context.computeModularity);
      getSeedCommunityMembers(same, report.seed, 1.5, context.computeModularity);
    }, samples.cachedSelections);
  }
  assert.equal(getHistoricalPresetGraph(rows, start, end), graph);
  assert.ok(graph.links.every(({ source, target, weight }) => source !== target && weight > 0 && Number.isFinite(weight)));
  assert.equal(hubs.length, Math.min(report.targetBudget, graph.ids.filter((id) => graph.outDegree[id] > 0).length));
  assert.equal(bridges.length, hubs.length);
  report.windows.push({
    introductionDate, historyStart: new Date(start).toISOString().slice(0, 10), historyNodes: graph.ids.length,
    directedRoutes: graph.links.length, hubs, bridges, broadMembers: [...broad], finerMembers: [...finer], ring,
    timings: Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, summarize(values)])),
  });
}
console.log(JSON.stringify(report, null, 2));
