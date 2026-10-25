import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPooledFlows } from "../src/pooledFlows.js";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/runtime/herdlink-runtime.js", root), "utf8");
const extract = (name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, name);
  return match[0];
};
const nodes = Array.from({ length: 40 }, (_, index) => ({
  id: `CR${String(index + 1).padStart(2, "0")}`,
  x: 400 + Math.cos(index * 2 * Math.PI / 40) * 280,
  y: 400 + Math.sin(index * 2 * Math.PI / 40) * 280,
  r: 5 + index % 16,
}));
const elements = nodes.flatMap((source) => nodes.map((target) => ({
  datum: { source, target }, path: null, writes: 0,
  setAttribute(_name, value) { this.path = value; this.writes++; },
  removeAttribute() { this.path = null; this.writes++; },
})));
const selection = { each(callback) { elements.forEach((element) => callback.call(element, element.datum)); } };
const { getNetworkLinkPath, renderNetworkLinkPositions } = new Function("linkSelection", `
  ${extract("getNetworkLinkPath")}
  ${extract("renderNetworkLinkPositions")}
  return { getNetworkLinkPath, renderNetworkLinkPositions };
`)(selection);
const drawEveryRoute = () => selection.each(function (datum) {
  const path = getNetworkLinkPath(datum);
  if (path === null) this.removeAttribute("d");
  else this.setAttribute("d", path);
});
const measure = (run) => {
  const times = [];
  for (let index = -100; index < 1000; index++) {
    const start = performance.now();
    run(index);
    if (index >= 0) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { medianMs: +times[500].toFixed(4), p95Ms: +times[950].toFixed(4) };
};
const report = {
  scope: "JavaScript geometry and summary work with 100 warmups and 1000 samples. SVG writes use plain objects; browser layout and painting are excluded.",
  node: process.version, nodes: nodes.length, routes: elements.length, routesByMovingNodeCount: [],
};
for (const moving of [1, 10, 40]) {
  const changedNodes = new Set(nodes.slice(0, moving).map((node) => node.id));
  const update = (index) => {
    for (let node = 0; node < moving; node++) nodes[node].linkBoundaryRadius = nodes[node].r * (1 + 0.06 * Math.sin(index / 8 + node));
  };
  const unconditional = measure((index) => { update(index); drawEveryRoute(); });
  const affected = measure((index) => { update(index); renderNetworkLinkPositions(moving < 40 ? changedNodes : undefined); });
  const writes = elements.reduce((sum, element) => sum + element.writes, 0);
  update(1001);
  renderNetworkLinkPositions(moving < 40 ? changedNodes : undefined);
  const changedWrites = elements.reduce((sum, element) => sum + element.writes, 0) - writes;
  elements.forEach((element) => assert.equal(element.path, getNetworkLinkPath(element.datum)));
  report.routesByMovingNodeCount.push({ moving, unconditional, affected, unconditionalWrites: elements.length, changedWrites });
}

const bundle = JSON.parse(readFileSync(new URL("src/assets/data/international_flows.json", root)));
const provider = createPooledFlows(bundle);
const date = new Date("2020-01-01"), schedule = new Map();
const summary = new Function("window", "currentTimeSpan", "simulationNodeInterventions", `
  let pooledFlowSummaryCache = null;
  ${extract("getPooledFlowSummary")}
  return getPooledFlowSummary;
`)({ currentDate: date, herdlinkPooledFlows: provider }, "yearly", schedule);
const expected = provider.summarize(date, "yearly", schedule);
assert.deepEqual(summary(), expected);
report.yearlySummary = {
  allDays: measure(() => provider.summarize(date, "yearly", schedule)),
  repeatedFrame: measure(() => summary()),
};

const { getNodeId, getNodeTradeVolumes } = new Function(`
  ${extract("getNodeId")}
  ${extract("getNodeTradeVolumes")}
  return { getNodeId, getNodeTradeVolumes };
`)();
const links = elements.map((element, index) => ({ ...element.datum, weight: index % 25 }));
const scanPerNode = () => new Map(nodes.map(({ id }) => [id, {
  selfVolume: links.filter((link) => getNodeId(link.source) === id && getNodeId(link.target) === id)
    .reduce((sum, link) => sum + link.weight, 0),
  otherVolume: links.filter((link) => getNodeId(link.source) === id && getNodeId(link.target) !== id)
    .reduce((sum, link) => sum + link.weight, 0),
}]));
assert.deepEqual(getNodeTradeVolumes(links), scanPerNode());
report.donutVolumes = {
  scanPerNode: measure(scanPerNode),
  groupedRoutes: measure(() => getNodeTradeVolumes(links)),
};
console.log(JSON.stringify(report, null, 2));
