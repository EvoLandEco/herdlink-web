import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/assets/js/herdlink-runtime.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext([
  "getNodeId", "buildAdjList", "getStronglyConnectedComponents", "computePerronPair", "computeEigenvectorCentrality",
].map((name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}).join("\n"), context);

function centrality(records, ids, ...settings) {
  return context.computeEigenvectorCentrality(ids.map((id) => ({ id })),
    records.map(([source, target, weight]) => ({ source, target, weight })), ...settings);
}

function nearVector(actual, expected, tolerance = 1e-6) {
  for (const id of Object.keys(expected)) {
    assert.ok(Math.abs(actual[id] - expected[id]) <= tolerance, `${id}: ${actual[id]} ≈ ${expected[id]}`);
  }
}

test("unweighted paths and stars give their centers the analytic centrality", () => {
  nearVector(centrality([["A", "B", 1], ["B", "C", 1]], ["A", "B", "C"]),
    { A: 0.5, B: Math.SQRT1_2, C: 0.5 });
  const ids = ["A", "B", "C", "D"];
  nearVector(centrality([["A", "B", 1], ["B", "C", 1], ["C", "D", 1]], ids),
    Object.fromEntries(ids.map((id, index) => [id, Math.sqrt(2 / 5) * Math.sin((index + 1) * Math.PI / 5)])));
  nearVector(centrality([["A", "B", 1], ["A", "C", 1], ["A", "D", 1]], ids),
    { A: Math.SQRT1_2, B: 1 / Math.sqrt(6), C: 1 / Math.sqrt(6), D: 1 / Math.sqrt(6) });
});

test("weighted star centrality is invariant to movement volume scale", () => {
  for (const scale of [1, 1e9]) {
    nearVector(centrality([["A", "B", 3 * scale], ["A", "C", 4 * scale]], ["A", "B", "C", "isolated"]),
      { A: Math.SQRT1_2, B: 3 / (5 * Math.sqrt(2)), C: 4 / (5 * Math.sqrt(2)), isolated: 0 });
  }
});

test("empty graphs return zero and self-loop-only graphs solve tied and near-tied roots exactly", () => {
  assert.deepEqual(Object.keys(centrality([], [])), []);
  nearVector(centrality([["A", "A", 0]], ["A", "B"]), { A: 0, B: 0 }, 0);
  nearVector(centrality([["A", "A", 5], ["B", "B", 5], ["C", "C", 2]], ["A", "B", "C", "isolated"]),
    { A: Math.SQRT1_2, B: Math.SQRT1_2, C: 0, isolated: 0 });
  nearVector(centrality([["A", "A", 5], ["B", "B", 5 - 1e-9]], ["A", "B"]), { A: 1, B: 0 }, 0);
});

test("different tied dominant components use the projection of the same all-ones vector", () => {
  const records = [["A", "B", 1], ["B", "C", 1], ["D", "E", Math.SQRT2], ["F", "G", 1]];
  const projection = 1 + Math.SQRT1_2;
  const norm = Math.sqrt(projection ** 2 + 2);
  const expected = {
    A: projection / (2 * norm), B: projection * Math.SQRT1_2 / norm, C: projection / (2 * norm),
    D: 1 / norm, E: 1 / norm, F: 0, G: 0,
  };
  nearVector(centrality(records, Object.keys(expected)), expected);
  nearVector(centrality(records.toReversed(), Object.keys(expected).toReversed()), expected);
});

test("weakly coupled near-tied nodes meet the requested vector accuracy", () => {
  const angle = Math.atan2(2e-9, 2 - 2.00001) / 2;
  nearVector(centrality([["A", "A", 1], ["B", "B", 1.000005], ["A", "B", 1e-9]], ["A", "B"], 100, 1e-10),
    { A: Math.cos(angle), B: Math.sin(angle) }, 1e-8);
});

test("centrality reports an exhausted iteration budget instead of an unconverged vector", () => {
  assert.throws(() => centrality([["A", "B", 1], ["B", "C", 1]], ["A", "B", "C"], 1), /did not converge/);
});

test("a sparse recorded graph retains a positive dominant vector under mixed restrictions", () => {
  const csv = readFileSync(new URL("../public/assets/data/daily_aggregation.csv", import.meta.url), "utf8");
  const records = csv.trim().split("\n").slice(1).flatMap((line) => {
    const [, date, source, target, weight] = line.replaceAll('"', "").split(",");
    if (date !== "2021-07-18" || source === "NA" || target === "NA") return [];
    if (source !== target && (["CR35", "CR34", "CR03"].includes(source) || ["CR16", "CR08", "CR07"].includes(target))) return [];
    return [[source, target, +weight]];
  });
  const ids = Array.from({ length: 40 }, (_, i) => `CR${String(i + 1).padStart(2, "0")}`);
  const vector = centrality(records, ids);
  const action = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const [source, target, weight] of records) {
    action[source] += weight * vector[target];
    action[target] += weight * vector[source];
  }
  const eigenvalue = ids.reduce((sum, id) => sum + vector[id] * action[id], 0);
  const residual = Math.hypot(...ids.map((id) => action[id] - eigenvalue * vector[id])) / eigenvalue;
  assert.ok(ids.every((id) => Number.isFinite(vector[id]) && vector[id] >= 0));
  assert.ok(residual <= 1e-6);
  assert.ok(Math.abs(eigenvalue - 2432.134643321087) <= 1e-6 * eigenvalue);
});
