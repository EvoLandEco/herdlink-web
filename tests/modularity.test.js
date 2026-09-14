import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../src/runtime/jLouvain.js", import.meta.url), "utf8") + "\n" +
  ["getNodeId", "computeModularity"].map((name) => {
    const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
    assert.ok(match, `Runtime function ${name} exists`);
    return match[0];
  }).join("\n"), context);

function graph(records, ids = ["0", "1", "2", "3", "4", "5"]) {
  return [ids.map((id) => ({ id })), records.map(([source, target, weight]) => ({ source, target, weight }))];
}
function modularityForPartition(links, partition, resolution = 1) {
  let volume = 0;
  let internal = 0;
  const degreeByCommunity = new Map();
  for (const { source, target, weight } of links) {
    volume += weight;
    if (partition[source] === partition[target]) internal += weight;
    for (const id of [source, target]) {
      const community = partition[id];
      degreeByCommunity.set(community, (degreeByCommunity.get(community) || 0) + weight);
    }
  }
  return volume ? internal / volume - resolution * [...degreeByCommunity.values()]
    .reduce((sum, degree) => sum + (degree / (2 * volume)) ** 2, 0) : 0;
}
function check(records, ids) {
  const [nodes, links] = graph(records, ids);
  const result = context.computeModularity(nodes, links);
  assert.ok(Math.abs(result.modularity - modularityForPartition(links, result.partition)) <= 1e-12,
    "Reported modularity matches the returned partition and all recorded edge weights");
  return result;
}

const reciprocal = [
  ["0", "0", 19], ["0", "3", 18], ["0", "4", 2], ["0", "5", 20],
  ["2", "4", 10], ["2", "5", 15], ["3", "1", 4], ["3", "3", 10],
  ["3", "5", 3], ["4", "2", 13], ["4", "4", 12], ["4", "5", 7],
  ["5", "2", 4], ["5", "5", 20],
];

test("community detection combines reciprocal and parallel routes before finding communities", () => {
  const result = check(reciprocal);
  assert.deepEqual(check([...reciprocal].reverse()), result);
  assert.deepEqual(check(reciprocal.flatMap(([source, target, weight]) => [
    [source, target, weight / 4], [source, target, weight * 3 / 4],
  ])), result);
  assert.deepEqual(check(reciprocal.map(([source, target, weight]) => [target, source, weight])), result);
});

test("Louvain quotient graphs preserve undirected edge weight between communities", () => {
  check([
    ["0", "1", 13], ["0", "3", 12], ["0", "4", 7], ["0", "5", 15],
    ["1", "1", 4], ["1", "4", 20], ["1", "5", 4], ["2", "2", 19],
    ["2", "4", 4], ["2", "5", 4], ["3", "3", 14], ["3", "5", 11], ["5", "5", 9],
  ]);
});

test("community statistics remain finite after export, import, or all-link restrictions", () => {
  for (const links of [reciprocal.filter(([source]) => source !== "0"),
    reciprocal.filter(([, target]) => target !== "0"),
    reciprocal.filter(([source, target]) => source === target), []]) {
    const result = check(links);
    assert.equal(Object.keys(result.partition).length, 6);
    assert.ok(Number.isFinite(result.modularity));
  }
  assert.equal(check([], []).modularity, 0);
  assert.equal(check([["0", "0", 100]], ["0"]).modularity, 0);
  assert.equal(check([["0", "1", 10], ["1", "0", 10], ["2", "3", 20]],
    ["0", "1", "2", "3", "isolated"]).modularity, 0.5);
});

test("generalized modularity uses the same resolution for moves, aggregation, and reported quality", () => {
  const [nodes, links] = graph([
    ["0", "0", 10], ["0", "1", 5], ["0", "2", 1], ["1", "2", 2],
    ["2", "3", 1], ["3", "4", 9], ["3", "5", 8], ["4", "5", 8], ["5", "5", 3],
  ]);
  const ids = nodes.map(({ id }) => id);
  for (const resolution of [0.5, 1, 1.5, 2, 4]) {
    const result = context.jLouvain().nodes(ids).edges(links).resolution(resolution)();
    const score = modularityForPartition(links, result.communities, resolution);
    assert.ok(Math.abs(result.modularity - score) <= 1e-12);
    const singleton = Object.fromEntries(ids.map((id, index) => [id, index]));
    assert.ok(score >= modularityForPartition(links, singleton, resolution) - 1e-12);
  }
});

test("a node can leave a community for a singleton when all reinsertion scores are negative", () => {
  const ids = ["a", "b", "isolated"];
  const links = [{ source: "a", target: "a", weight: 100 },
    { source: "a", target: "b", weight: 1 }, { source: "b", target: "b", weight: 100 }];
  const initial = { a: 0, b: 0, isolated: 2 };
  const result = context.jLouvain().nodes(ids).edges(links).partition_init(initial).resolution(1.5)();
  assert.notEqual(result.communities.a, result.communities.b);
  assert.notEqual(result.communities.a, result.communities.isolated);
  assert.ok(Math.abs(result.modularity - modularityForPartition(links, result.communities, 1.5)) <= 1e-12);
  assert.ok(result.modularity > modularityForPartition(links, initial, 1.5));
});

test("Louvain handles empty graphs and validates resolution", () => {
  for (const resolution of [0.5, 1, 1.5, 4]) {
    const empty = context.jLouvain().nodes([]).edges([]).resolution(resolution)();
    assert.deepEqual(Object.keys(empty.communities), []);
    assert.equal(empty.modularity, 0);
    const isolated = context.jLouvain().nodes(["a", "b"]).edges([]).resolution(resolution)();
    assert.equal(new Set(Object.values(isolated.communities)).size, 2);
    assert.equal(isolated.modularity, 0);
  }
  for (const resolution of [0, -1, Infinity, NaN, "1.5"])
    assert.throws(() => context.jLouvain().resolution(resolution), /finite positive number/);
});

test("the bundled graph including local trade preserves its native Leiden reference", () => {
  const rows = readFileSync(new URL("../src/assets/data/yearly_aggregation.csv", import.meta.url), "utf8")
    .trim().split(/\r?\n/).slice(1);
  const routes = new Map();
  for (const row of rows) {
    const [, , sourceId, targetId, count] = row.replaceAll('"', "").split(",");
    if (!sourceId || !targetId || sourceId === "NA" || targetId === "NA" || !(+count > 0)) continue;
    const [source, target] = [sourceId, targetId].sort();
    const key = `${source}:${target}`;
    if (!routes.has(key)) routes.set(key, { source, target, weight: 0 });
    routes.get(key).weight += +count;
  }
  const edges = [...routes.values()].sort((a, b) =>
    a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  const ids = [...new Set(edges.flatMap(({ source, target }) => [source, target]))].sort();
  // igraph 1.0.0 and leidenalg 0.12.0, reproduced by scripts/compare-community-methods.py.
  const references = [
    { resolution: 1, quality: 0.2986596362245344, groups: [
      "01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 30 40",
      "29 31 36 37 38 39", "32 33 34 35",
    ] },
    { resolution: 1.5, quality: 0.1924174446299272, groups: [
      "01 03 04 06 07 08 09 10", "02 11 12 14 30",
      "05 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 40",
      "29 31 36", "32 33 34", "35", "37", "38 39",
    ] },
  ];
  for (const reference of references) {
    const result = context.jLouvain().nodes(ids).edges(edges).resolution(reference.resolution)();
    const members = new Map();
    for (const id of ids) {
      const community = result.communities[id];
      if (!members.has(community)) members.set(community, []);
      members.get(community).push(id);
    }
    assert.deepEqual([...members.values()], reference.groups.map(group => group.split(" ").map(id => `CR${id}`)));
    assert.ok(Math.abs(result.modularity - reference.quality) < 1e-12);
  }
});
