import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/assets/js/herdlink-runtime.js", import.meta.url), "utf8");
function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}
const context = vm.createContext({});
vm.runInContext(["getNodeId", "chuLiuEdmonds", "visualizeArborescence"].map(extractFunction).join("\n"), context);
const id = (node) => typeof node === "object" ? node.id : node;

function graphForRoot(nodes, edges, root, direction) {
  const nodeIds = new Set(nodes.map(id));
  const routes = edges.map((edge) => ({
    source: id(direction === "out" ? edge.target : edge.source),
    target: id(direction === "out" ? edge.source : edge.target),
    weight: +edge.weight, original: edge,
  })).filter((edge) => !edge.original.disabled && edge.weight > 0 && Number.isFinite(edge.weight) &&
    edge.source !== edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const reachable = new Set([id(root)]);
  for (const sourceId of reachable) {
    routes.filter((edge) => edge.source === sourceId).forEach((edge) => reachable.add(edge.target));
  }
  return { reachable, routes: routes.filter((edge) => reachable.has(edge.source) && reachable.has(edge.target)) };
}

function exhaustiveWeight(nodes, edges, root, direction) {
  const { reachable, routes } = graphForRoot(nodes, edges, root, direction);
  const children = Array.from(reachable).filter((nodeId) => nodeId !== id(root));
  let maximum = -Infinity;
  function choose(index, selected) {
    if (index < children.length) {
      routes.filter((edge) => edge.target === children[index])
        .forEach((edge) => choose(index + 1, [...selected, edge]));
      return;
    }
    const connected = new Set([id(root)]);
    for (const sourceId of connected) {
      selected.filter((edge) => edge.source === sourceId).forEach((edge) => connected.add(edge.target));
    }
    if (connected.size === reachable.size) {
      maximum = Math.max(maximum, selected.reduce((sum, edge) => sum + edge.weight, 0));
    }
  }
  choose(0, []);
  return maximum;
}

function checkTree(nodes, edges, root, direction = "in") {
  const tree = Array.from(context.chuLiuEdmonds(nodes, edges, root, direction));
  const network = graphForRoot(nodes, edges, root, direction);
  const treeGraph = graphForRoot(nodes, tree, root, direction);
  assert.equal(tree.length, network.reachable.size - 1);
  assert.equal(treeGraph.reachable.size, network.reachable.size);
  assert.ok(tree.every((edge) => edges.includes(edge)));
  const parentCount = new Map();
  for (const edge of treeGraph.routes) parentCount.set(edge.target, (parentCount.get(edge.target) || 0) + 1);
  assert.ok(Array.from(network.reachable).every((nodeId) =>
    nodeId === id(root) ? !parentCount.has(nodeId) : parentCount.get(nodeId) === 1));
  assert.equal(tree.reduce((sum, edge) => sum + +edge.weight, 0), exhaustiveWeight(nodes, edges, root, direction));
  return tree;
}

test("rooted maximum trees match exhaustive parent choices for every three-node graph with weights 0, 1 and 3", () => {
  const nodes = ["R", "A", "B"].map((id) => ({ id }));
  const pairs = nodes.flatMap((source) => nodes.filter((target) => source !== target).map((target) => [source, target]));
  for (let graph = 0; graph < 3 ** pairs.length; graph++) {
    let digits = graph;
    const edges = pairs.map(([source, target]) => {
      const weight = [0, 1, 3][digits % 3];
      digits = Math.floor(digits / 3);
      return { source, target, weight };
    });
    checkTree(nodes, edges, nodes[0]);
    checkTree(nodes, edges, nodes[0], "out");
  }
});

test("cycle expansion retains the entering route and supports nested contractions", () => {
  const nodes = ["R", "A", "B", "C"].map((id) => ({ id }));
  const edges = [
    { source: "R", target: "A", weight: 1 },
    { source: "A", target: "B", weight: 10 },
    { source: "B", target: "A", weight: 10 },
    { source: "R", target: "C", weight: 1 },
    { source: "C", target: "B", weight: 20 },
    { source: "B", target: "C", weight: 20 },
    { source: "A", target: "A", weight: 1000 },
  ];
  const tree = checkTree(nodes, edges, nodes[0]);
  assert.equal(tree.reduce((sum, edge) => sum + edge.weight, 0), 31);

  for (let graph = 0; graph < 64; graph++) {
    const routes = nodes.flatMap((source, i) => nodes.filter((target) => target !== source).map((target) => ({
      source, target, weight: ((graph + 1) * (i + 3) * (nodes.indexOf(target) + 7)) % 17,
    })));
    checkTree(nodes, routes, nodes[0]);
    checkTree(nodes, routes, nodes[0], "out");
  }
});

test("blocked exports and local trades produce an empty outward tree while imports stay independent", () => {
  const nodes = ["CR35", "CR10", "CR20"].map((id) => ({ id }));
  const edges = [
    { source: nodes[0], target: nodes[0], weight: 1000 },
    { source: nodes[0], target: nodes[1], weight: 100, disabled: true },
    { source: nodes[1], target: nodes[0], weight: 50 },
    { source: nodes[1], target: nodes[2], weight: 20 },
    { source: nodes[2], target: nodes[1], weight: 30 },
  ];
  assert.deepEqual(checkTree(nodes, edges, nodes[0]), []);
  assert.equal(checkTree(nodes, edges, nodes[0], "out").length, 2);
  edges[1].disabled = false;
  assert.equal(checkTree(nodes, edges, nodes[0]).length, 2);
});

test("empty export structure explains the absence of outgoing routes in each mode", () => {
  let text;
  const selection = new Proxy({}, { get: (_, name) => (value) => {
    if (name === "text") text = value;
    return selection;
  } });
  context.d3 = { select: () => selection };
  context.isSimulationModeActive = () => false;
  context.visualizeArborescence([], "#inArboContainer", "CR35");
  assert.equal(text, "No outgoing trade routes.");
  context.isSimulationModeActive = () => true;
  context.visualizeArborescence([], "#inArboContainer", "CR35");
  assert.equal(text, "No outgoing movement pressure.");
});
