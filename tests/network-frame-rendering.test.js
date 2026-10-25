import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createPooledFlows } from "../src/pooledFlows.js";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");

function runtime(names, values) {
  const context = vm.createContext(values);
  vm.runInContext(names.map((name) => {
    const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
    assert.ok(match, `Runtime function ${name} exists`);
    return match[0];
  }).join("\n"), context);
  return context;
}

function pathElement(datum) {
  return {
    datum, path: null, writes: 0,
    setAttribute(name, value) { assert.equal(name, "d"); this.path = value; this.writes++; },
    removeAttribute(name) { assert.equal(name, "d"); this.path = null; this.writes++; },
  };
}

test("domestic boundary updates redraw only routes incident to changed nodes", () => {
  const nodes = [
    { id: "A", x: 100, y: 100, r: 8 }, { id: "B", x: 400, y: 100, r: 10 },
    { id: "C", x: 400, y: 400, r: 12 }, { id: "D", x: 100, y: 400, r: 14 },
  ];
  const elements = nodes.flatMap((source) => nodes.map((target) => pathElement({ source, target })));
  const context = runtime(["getNetworkLinkPath", "renderNetworkLinkPositions"], {
    linkSelection: { each(callback) { elements.forEach((element) => callback.call(element, element.datum)); } },
  });
  const geometry = context.getNetworkLinkPath;
  let calculations = 0;
  context.getNetworkLinkPath = (datum) => { calculations++; return geometry(datum); };
  const render = (expectedCalculations, changedNodes) => {
    calculations = 0;
    const before = elements.reduce((sum, element) => sum + element.writes, 0);
    context.renderNetworkLinkPositions(changedNodes);
    assert.equal(calculations, expectedCalculations);
    assert.equal(elements.reduce((sum, element) => sum + element.writes, 0) - before, expectedCalculations);
    elements.forEach((element) => assert.equal(element.path, geometry(element.datum)));
  };
  render(16);
  render(0, new Set());
  nodes[0].linkBoundaryRadius = 16;
  render(7, new Set(["A"]));
  nodes[0].x = 130;
  nodes[2].y = 430;
  render(16);
  nodes[0].r = 20;
  delete nodes[0].linkBoundaryRadius;
  nodes[1].linkBoundaryRadius = 18;
  render(12, new Set(["A", "B"]));
  elements[1].datum = { source: { ...nodes[0] }, target: { ...nodes[1] } };
  elements[1].datum.source.y = 130;
  render(7, new Set(["A"]));
  elements[1].datum.target = elements[1].datum.source;
  render(7, new Set(["A"]));
});

test("international route layers share geometry and invalidate for ports, bounds and region changes", () => {
  const routes = [
    { datum: { region: "A", channel: "imports" }, children: [pathElement(), pathElement(), pathElement()] },
    { datum: { region: "B", channel: "exports" }, children: [pathElement(), pathElement(), pathElement()] },
  ];
  const context = runtime([
    "getPooledPortPosition", "clampPooledPortPosition", "getPooledFlowGeometry", "getPooledFlowPath", "renderPooledFlowPositions",
  ], {
    w: 800, h: 600, currentMode: "graph", pooledPortPositions: { graph: {}, map: {} },
    allNodes: [{ id: "A", x: 300, y: 250, r: 8 }, { id: "B", x: 500, y: 350, r: 12 }],
    pooledFlowFrame: {}, pooledFlowPositions: new WeakMap(), hoveredPooledFlow: null,
    svg: {
      select(selector) {
        assert.equal(selector, "g.pooled-flows");
        return { selectAll(selector) {
          assert.equal(selector, ".pooled-flow-route");
          return { each(callback) { routes.forEach((route) => callback.call(route, route.datum)); } };
        } };
      },
      selectAll(selector) { assert.equal(selector, "g.pooled-port"); return { attr() {} }; },
    },
    d3: { select(route) {
      return { selectAll(selector) {
        assert.equal(selector, "path");
        return { attr(name, value) { route.children.forEach((child) => {
          if (value === null) child.removeAttribute(name);
          else child.setAttribute(name, value);
        }); } };
      } };
    } },
  });
  const geometry = context.getPooledFlowPath;
  let calculations = 0;
  context.getPooledFlowPath = (...args) => { calculations++; return geometry(...args); };
  const render = (expectedCalculations) => {
    calculations = 0;
    context.renderPooledFlowPositions();
    assert.equal(calculations, expectedCalculations);
    for (const route of routes) {
      const expected = geometry(route.datum, context.allNodes.find((node) => node.id === route.datum.region));
      route.children.forEach((child) => assert.equal(child.path, expected));
    }
  };
  render(2);
  render(0);
  context.allNodes[0].linkBoundaryRadius = 20;
  render(1);
  assert.deepEqual(routes.map((route) => route.children[0].writes), [2, 1]);
  context.pooledPortPositions.graph.imports = [0.25, 0.4];
  render(1);
  context.w = 1000;
  render(2);
  context.h = 800;
  render(2);
  routes[0].datum = { region: "A", channel: "exports" };
  render(1);
  context.allNodes[0] = { ...context.allNodes[0] };
  render(0);
  context.allNodes.shift();
  render(1);
  assert.equal(routes[0].children[0].path, null);
  render(0);
});

test("flow summaries reuse repeated frames and follow nested permission edits, dates and providers", () => {
  const bundle = JSON.parse(readFileSync(new URL("../src/assets/data/international_flows.json", import.meta.url)));
  const data = createPooledFlows(bundle);
  const date = new Date("2020-01-01"), schedule = new Map();
  let calculations = 0;
  const provider = { summarize(...args) { calculations++; return data.summarize(...args); } };
  const context = runtime(["getPooledFlowSummary"], {
    window: { currentDate: date, herdlinkPooledFlows: provider },
    currentTimeSpan: "yearly", simulationNodeInterventions: schedule, pooledFlowSummaryCache: null,
  });
  const initial = context.getPooledFlowSummary();
  assert.equal(context.getPooledFlowSummary(), initial);
  assert.equal(context.getPooledFlowSummary(new Date(+date), new Map()), initial);
  assert.equal(calculations, 1);
  const changes = new Map([["CR35", { exports: false }]]);
  schedule.set(+date, changes);
  const blocked = context.getPooledFlowSummary();
  assert.deepEqual(blocked, data.summarize(date, "yearly", schedule));
  assert.ok(blocked.exports.blocked > 0);
  assert.equal(context.getPooledFlowSummary(), blocked);
  assert.equal(calculations, 2);
  changes.get("CR35").exports = true;
  assert.equal(context.getPooledFlowSummary().exports.blocked, 0);
  assert.equal(calculations, 3);
  changes.set("CR35", { imports: false, exports: false });
  assert.deepEqual(context.getPooledFlowSummary(), data.summarize(date, "yearly", schedule));
  assert.equal(calculations, 4);
  changes.delete("CR35");
  assert.equal(context.getPooledFlowSummary().exports.blocked, 0);
  assert.equal(calculations, 5);
  context.window.currentDate = new Date("2022-01-01");
  assert.deepEqual(context.getPooledFlowSummary(), data.summarize(context.window.currentDate, "yearly", schedule));
  assert.equal(calculations, 6);
  context.currentTimeSpan = "monthly";
  const monthly = context.getPooledFlowSummary();
  assert.deepEqual(monthly, data.summarize(context.window.currentDate, "monthly", schedule));
  assert.equal(calculations, 7);
  context.window.herdlinkPooledFlows = { summarize: provider.summarize };
  assert.notEqual(context.getPooledFlowSummary(), monthly);
  assert.equal(calculations, 8);
});

test("donut volumes sum each directed route once and keep local trade separate", () => {
  const node = { id: "A" };
  const links = [
    { source: node, target: node, weight: 30 },
    { source: "A", target: "A", weight: "10" },
    { source: node, target: "B", weight: 50 },
    { source: "A", target: { id: "B" }, weight: 20, disabled: true },
    { source: { id: "B" }, target: node, weight: 90 },
    { source: "C", target: node, weight: 0 },
    { source: "C", target: "C", weight: NaN },
  ];
  const context = runtime(["getNodeId", "getNodeTradeVolumes"], {});
  const snapshot = links.map((link) => ({ ...link }));
  const all = context.getNodeTradeVolumes(links);
  assert.deepEqual({ ...all.get("A") }, { selfVolume: 40, otherVolume: 70 });
  assert.deepEqual({ ...all.get("B") }, { selfVolume: 0, otherVolume: 90 });
  assert.equal(all.has("C"), false);
  const enabled = context.getNodeTradeVolumes(links.filter((link) => !link.disabled));
  assert.deepEqual({ ...enabled.get("A") }, { selfVolume: 40, otherVolume: 50 });
  assert.equal(context.getNodeTradeVolumes([]).size, 0);
  assert.deepEqual(links, snapshot);
});
