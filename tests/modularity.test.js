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
function modularityForPartition(links, partition) {
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
  return volume ? internal / volume - [...degreeByCommunity.values()]
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
