import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/assets/js/herdlink-runtime.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext([
  "getNodeId", "buildAdjList", "getStronglyConnectedComponents", "computePerronPair", "computePerronRoot", "computeSpectralRadius",
].map((name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}).join("\n"), context);

function graph(records, extraIds = []) {
  const nodes = [...new Set([...extraIds, ...records.flatMap(([source, target]) => [source, target])])]
    .map((id) => ({ id }));
  const links = records.map(([source, target, weight]) => ({ source, target, weight }));
  return [nodes, links];
}

function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${actual} ≈ ${expected}`);
}

test("unequal two-way and three-way cycles have their analytic spectral radius", () => {
  near(context.computeSpectralRadius(...graph([["A", "B", 4], ["B", "A", 1]])), 2);
  near(context.computeSpectralRadius(...graph([["A", "B", 2], ["B", "C", 3], ["C", "A", 9]])), Math.cbrt(54));
  near(context.computeSpectralRadius(...graph([["A", "B", 1e12], ["B", "A", 1e-12]])), 1);
});

test("disconnected and reducible graphs use the largest SCC root, ignoring one-way bridges", () => {
  const records = [
    ["A", "B", 4], ["B", "A", 1],
    ["C", "D", 8], ["D", "C", 2],
    ["B", "C", 1e12], ["D", "E", 1e12],
  ];
  near(context.computeSpectralRadius(...graph(records, ["isolated"])), 4);
  const [nodes, links] = graph(records);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  near(context.computeSpectralRadius(nodes, links.map((link) => ({
    ...link, source: nodeById.get(link.source), target: nodeById.get(link.target),
  }))), 4);
});

test("empty, zero-weight, and acyclic graphs have radius zero", () => {
  assert.equal(context.computeSpectralRadius([], []), 0);
  assert.equal(context.computeSpectralRadius(...graph([["A", "A", 0], ["A", "B", 0]], ["isolated"])), 0);
  const chain = Array.from({ length: 39 }, (_, i) => [`N${i}`, `N${i + 1}`, 1e6]);
  assert.equal(context.computeSpectralRadius(...graph(chain)), 0);
});

test("self-loops and parallel records contribute their recorded weights", () => {
  assert.equal(context.computeSpectralRadius(...graph([["A", "A", 4], ["A", "A", 6], ["B", "B", 3]])), 10);
  near(context.computeSpectralRadius(...graph([
    ["A", "A", 1], ["B", "B", 1], ["A", "B", 4], ["B", "A", 1],
  ])), 3);
});

test("weakly connected blocks converge to an analytic root at the requested tolerance", () => {
  const a = 2;
  const d = 2.00001;
  const b = 1e-9;
  const c = 1e-10;
  const expected = (a + d + Math.hypot(a - d, 2 * Math.sqrt(b * c))) / 2;
  near(context.computeSpectralRadius(...graph([
    ["A", "A", a], ["B", "B", d], ["A", "B", b], ["B", "A", c],
  ]), 100, 1e-10), expected, 1e-10);
});

test("an exhausted iteration budget reports nonconvergence instead of an estimate", () => {
  assert.throws(() => context.computeSpectralRadius(...graph([["A", "B", 4], ["B", "A", 1]]), 1),
    /did not converge within 1 iterations/);
});
