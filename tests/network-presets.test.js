import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as selectors from "../src/runtime/intervention-presets.js";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/runtime/herdlink-runtime.js", root), "utf8");
const functions = ["getNodeId", "computeModularity", "getNetworkPresetGraph", "getNetworkPresetSelection"].map((name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}).join("\n");
function readDataset(name) {
  return readFileSync(new URL(`src/assets/data/${name}_aggregation.csv`, root), "utf8").trim().split(/\r?\n/).slice(1).map((line) => {
    const [, time, COROP_LEV, COROP_AFN, AANTAL] = line.replaceAll('"', "").split(",");
    return { time: new Date(time), COROP_LEV, COROP_AFN, AANTAL: +AANTAL };
  });
}
const daily = readDataset("daily");
const introduction = "2020-01-01";
const end = Date.parse(introduction), start = end - 365 * 86400000;
const plain = (value) => JSON.parse(JSON.stringify(value));
function runtime(data = daily) {
  const context = vm.createContext({
    window: { herdlinkPresetTools: selectors }, presetDailyData: data, presetTargetBudget: 3,
  });
  vm.runInContext(readFileSync(new URL("src/runtime/jLouvain.js", root), "utf8") + "\n" + functions, context);
  return context;
}

test("canonical daily history keeps real target sets across display resolutions", () => {
  const context = runtime();
  let reference;
  for (const display of ["daily", "weekly", "monthly", "yearly"]) {
    context.loadedCSVData = display === "daily" ? daily : readDataset(display);
    const graph = context.getNetworkPresetGraph(undefined, introduction);
    const targets = Object.fromEntries(["broad", "finer"].map((scale) => [scale,
      Object.fromEntries(["hub-controls", "trade-bottlenecks", "seed-community"].map((id) =>
        [id, plain(context.getNetworkPresetSelection(id, graph, scale, "CR35", 3).targets)]))]));
    if (reference) assert.deepEqual(targets, reference, display);
    else reference = targets;
    assert.deepEqual(targets.broad["hub-controls"], ["CR13", "CR10", "CR35"]);
    assert.deepEqual(targets.broad["trade-bottlenecks"], ["CR13", "CR10", "CR17"]);
    assert.deepEqual(targets.broad["hub-controls"], targets.finer["hub-controls"]);
    assert.deepEqual(targets.broad["trade-bottlenecks"], targets.finer["trade-bottlenecks"]);
  }
});

test("subsequent trade and local volumes leave historical graphs and targets unchanged", () => {
  const context = runtime();
  const reference = context.getNetworkPresetGraph(daily, introduction);
  const changed = daily.map((row) => +row.time >= end
    ? { ...row, COROP_LEV: row.COROP_AFN, COROP_AFN: row.COROP_LEV, AANTAL: row.AANTAL * 10 + 1 }
    : row.COROP_LEV === row.COROP_AFN ? { ...row, AANTAL: row.AANTAL * 1000 } : row);
  const graph = context.getNetworkPresetGraph(changed, introduction);
  assert.deepEqual(graph, reference);
  assert.equal(graph.ids.length, 39);
  assert.equal(graph.links.length, 675);
  for (const scale of ["broad", "finer"]) for (const id of ["hub-controls", "trade-bottlenecks", "seed-community"]) {
    assert.deepEqual(plain(context.getNetworkPresetSelection(id, graph, scale, "CR35", 3).targets),
      plain(context.getNetworkPresetSelection(id, reference, scale, "CR35", 3).targets));
  }
});

test("historical partitions use the production scale objective and reuse each partition across seeds", () => {
  const context = runtime();
  const graph = context.getNetworkPresetGraph(daily, introduction);
  let detections = 0;
  const detect = context.computeModularity;
  context.computeModularity = (...args) => { detections++; return detect(...args); };
  for (const [scale, resolution] of [["broad", 1], ["finer", 1.5]]) {
    const { partition } = detect(graph.nodes, graph.links, resolution);
    for (const seed of graph.ids) {
      const selected = context.getNetworkPresetSelection("seed-community", graph, scale, seed, 1).targets;
      assert.deepEqual(plain(selected), graph.ids.filter((region) => partition[region] === partition[seed]));
      assert.deepEqual(plain(selected), plain(context.getNetworkPresetSelection("seed-community", graph, scale, seed, 40).targets));
    }
  }
  assert.equal(detections, 2);
});

test("real tracing uses the complete calendar window and includes only forward recipients", () => {
  const response = end + 7 * 86400000;
  const records = daily.filter((row) => +row.time >= end && +row.time < response && row.COROP_LEV === "CR35" &&
    /^CR\d+$/.test(row.COROP_AFN) && row.AANTAL > 0);
  const expected = [...new Set(["CR35", ...records.map((row) => row.COROP_AFN)])].sort();
  assert.deepEqual(selectors.selectTraceRingTargets(daily, "CR35", end, response), expected);
  assert.ok(expected.length > 1);
  const afterResponse = daily.map((row) => +row.time >= response ? { ...row, COROP_LEV: "CR35", COROP_AFN: "FUTURE" } : row);
  assert.deepEqual(selectors.selectTraceRingTargets(afterResponse, "CR35", end, response), expected);
});

test("four introduction windows provide independent historical contexts with fixed rank budgets", () => {
  const context = runtime();
  const routeTotals = new Set();
  for (const date of [introduction, "2020-04-01", "2020-07-01", "2020-10-01"]) {
    const graph = context.getNetworkPresetGraph(daily, date);
    const cutoff = Date.parse(date);
    const expectedVolume = daily.filter((row) => +row.time >= cutoff - (end - start) && +row.time < cutoff &&
      /^CR\d+$/.test(row.COROP_LEV) && /^CR\d+$/.test(row.COROP_AFN) && row.COROP_LEV !== row.COROP_AFN && row.AANTAL > 0)
      .reduce((sum, row) => sum + row.AANTAL, 0);
    assert.equal(graph.links.reduce((sum, link) => sum + link.weight, 0), expectedVolume);
    routeTotals.add(expectedVolume);
    for (const id of ["hub-controls", "trade-bottlenecks"]) for (const k of [1, 3, 5, 10, 40]) {
      const selected = context.getNetworkPresetSelection(id, graph, "finer", "CR35", k).targets;
      assert.equal(selected.length, Math.min(k, graph.ids.filter((region) => graph.outDegree[region] > 0).length));
      assert.equal(new Set(selected).size, selected.length);
    }
  }
  assert.equal(routeTotals.size, 4);
});
