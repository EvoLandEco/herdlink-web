import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const functions = [
  "getPooledPortPosition", "getPooledPortRegionCount", "getPooledFlowLinks", "getPooledFlowGeometry", "getPooledFlowPath", "getPooledFlowCalloutData",
  "showPooledFlowCallout", "renderPooledFlowCallout", "clearPooledFlowHover", "updateAnnotationForNode",
].map((name) => source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"))[0]).join("\n");

function runtime() {
  const cards = [], highlights = new Map();
  let clears = 0, domesticClears = 0;
  const context = vm.createContext({
    w: 800, h: 600, currentMode: "map", hoveredPooledFlow: null, hoveredNode: {}, selectedNodeData: null,
    isSimulationModeActive: () => false,
    allNodes: [{ id: "CR13", x: 400, y: 240, r: 10, linkBoundaryRadius: 20 }],
    pooledFlowFrame: {
      imports: { observed: 100, permitted: 0, blocked: 100, unassigned: 0 },
      exports: { observed: 250, permitted: 250, blocked: 0, unassigned: 0 },
      regions: {
        CR13: { imports: { observed: 100 }, exports: { observed: 200 } },
        CR17: { imports: { observed: 0 }, exports: { observed: 50 } },
      },
    },
    getStatnaam: (id) => `Region ${id}`, formatCount: (value) => value.toLocaleString("en-US"),
    formatPct: (value) => `${(100 * value).toFixed(1)}%`,
    svg: {
      classed: (name, value) => highlights.set(`svg:${name}`, value),
      selectAll: (selector) => ({ classed: (_name, value) => highlights.set(selector, value) }),
    },
    annotationGroup: {}, renderNetworkCallout: (_group, x, y, info) => cards.push({ x, y, info }),
    clearNetworkCallout: () => clears++, clearHoveredLinkState: () => domesticClears++,
  });
  vm.runInContext(functions, context);
  return { context, cards, highlights, get clears() { return clears; }, get domesticClears() { return domesticClears; } };
}

test("map port centers follow the requested height fractions and graph ports stay level", () => {
  const { context: app } = runtime();
  assert.deepEqual(Array.from(app.getPooledPortPosition("imports")), [110, 240]);
  assert.deepEqual(Array.from(app.getPooledPortPosition("exports")), [690, 396]);
  app.h = 1000; app.w = 1200;
  assert.deepEqual(Array.from(app.getPooledPortPosition("exports")), [1090, 660]);
  app.currentMode = "graph";
  assert.equal(app.getPooledPortPosition("imports")[1], 520);
  assert.equal(app.getPooledPortPosition("exports")[1], 520);
});

test("international paths meet the rounded port and the region's visible ring boundary", () => {
  const { context: app } = runtime();
  app.currentMode = "graph";
  for (const channel of ["imports", "exports"]) {
    for (const node of [{ x: 400, y: 312, r: 10 }, { x: 410, y: 462, r: 10 }, app.allNodes[0]]) {
      const curve = app.getPooledFlowGeometry({ channel }, node);
      const port = app.getPooledPortPosition(channel);
      const a = channel === "imports" ? curve.start : curve.end;
      const b = channel === "imports" ? curve.end : curve.start;
      const dx = Math.abs(a[0] - port[0]), dy = Math.abs(a[1] - port[1]);
      assert.ok(Math.abs(Math.hypot(Math.max(dx - 48, 0), Math.max(dy - 14, 0)) - 20) < 1e-9);
      assert.ok(Math.abs(Math.hypot(b[0] - node.x, b[1] - node.y) - (node.linkBoundaryRadius ?? node.r)) < 1e-9);
      assert.ok(Math.abs((a[0] - port[0]) * (curve.control[1] - port[1]) - (a[1] - port[1]) * (curve.control[0] - port[0])) < 1e-9);
      assert.match(app.getPooledFlowPath({ channel }, node), /^M[-\d.,]+Q[-\d.,]+ [-\d.,]+$/);
    }
  }
  for (const node of [undefined, { x: NaN, y: 312 }, { x: 110, y: 312 }, { x: 120, y: 312, r: 20 }]) {
    assert.equal(app.getPooledFlowPath({ channel: "imports" }, node), null);
  }
});

test("international curves bow in separate directions and stay within wide panels", () => {
  const { context: app } = runtime();
  app.currentMode = "graph";
  const node = { x: 400, y: 312, r: 10 };
  assert.ok(app.getPooledFlowGeometry({ channel: "imports" }, node).control[1] < node.y);
  assert.ok(app.getPooledFlowGeometry({ channel: "exports" }, node).control[1] > node.y);
  app.w = 1600; app.h = 300;
  for (const channel of ["imports", "exports"]) {
    for (const node of [{ x: 30, y: 30, r: 10 }, { x: 1570, y: 270, r: 10 }]) {
      const curve = app.getPooledFlowGeometry({ channel }, node);
      for (const [x, y] of [curve.start, curve.control, curve.end]) {
        assert.ok(x >= 0 && x <= app.w && y >= 0 && y <= app.h);
      }
    }
  }
});

test("port region counts include only regions with observed movements in that direction", () => {
  const { context: app } = runtime();
  assert.equal(app.getPooledPortRegionCount("imports"), 1);
  assert.equal(app.getPooledPortRegionCount("exports"), 2);
  app.pooledFlowFrame.regions.CR17.exports.observed = 0;
  assert.equal(app.getPooledPortRegionCount("exports"), 1);
  app.pooledFlowFrame.regions = {};
  assert.equal(app.getPooledPortRegionCount("imports"), 0);
  assert.equal(app.getPooledPortRegionCount("exports"), 0);
});

test("international routes exclude zero ledger counts and have no attributed infection edges in simulation", () => {
  const { context: app } = runtime();
  assert.deepEqual(Array.from(app.getPooledFlowLinks(), ({ region, channel, observed }) => [region, channel, observed]), [
    ["CR13", "imports", 100], ["CR13", "exports", 200], ["CR17", "exports", 50],
  ]);
  app.isSimulationModeActive = () => true;
  assert.equal(app.getPooledFlowLinks().length, 0);
  app.isSimulationModeActive = () => false;
  assert.equal(app.getPooledFlowLinks().length, 3);
});

test("simulation port hover leaves no route highlighting or stale ledger card", () => {
  const state = runtime(), app = state.context;
  app.showPooledFlowCallout({ channel: "exports", region: "CR13" });
  assert.equal(state.cards.length, 1);
  app.isSimulationModeActive = () => true;
  app.renderPooledFlowCallout();
  assert.equal(app.hoveredPooledFlow, null);
  assert.equal(state.highlights.get("svg:pooled-flow-focus"), false);
  app.showPooledFlowCallout("exports");
  assert.equal(app.hoveredPooledFlow, null);
  assert.equal(state.highlights.get("svg:pooled-flow-focus"), false);
  assert.equal(state.cards.length, 1);
});

test("route cards retain direction and use the supported observed volume as the share denominator", () => {
  const { context: app } = runtime();
  const exports = app.getPooledFlowCalloutData({ channel: "exports", region: "CR13" });
  assert.equal(exports.code, "CR13 → EXPORT");
  assert.equal(exports.source, "Region CR13");
  assert.equal(exports.rows[0].value, "80.0%");
  assert.match(exports.note, /exports with a known Dutch sender region/);
  assert.equal(exports.hero, "200");
  const imports = app.getPooledFlowCalloutData({ channel: "imports", region: "CR13" });
  assert.equal(imports.target, "Region CR13");
  assert.equal(imports.rows[0].value, "100.0%");
  assert.equal(app.getPooledFlowCalloutData({ channel: "exports", region: "CR14" }), null);
  app.selectedNodeData = { id: "CR14" };
  assert.equal(app.getPooledFlowCalloutData({ channel: "exports", region: "CR13" }), null);
});

test("port hover clears domestic cards and keeps a selected region's redraw free of cards", () => {
  const state = runtime(), app = state.context;
  app.selectedNodeData = { id: "CR13" };
  app.showPooledFlowCallout("imports");
  assert.equal(state.domesticClears, 1);
  assert.equal(app.hoveredNode, null);
  assert.equal(app.selectedNodeData.id, "CR13");
  assert.equal(state.cards.length, 0);
  app.updateAnnotationForNode(app.selectedNodeData, {});
  assert.equal(state.cards.length, 0);
  assert.equal(state.highlights.get("svg:pooled-flow-focus"), true);
  app.clearPooledFlowHover();
  assert.equal(app.hoveredPooledFlow, null);
  assert.equal(state.clears, 1);
  assert.equal(state.highlights.get(".pooled-flow-route, .pooled-port"), false);
  assert.equal(state.highlights.get("svg:pooled-flow-focus"), false);
  app.clearPooledFlowHover();
  assert.equal(state.clears, 1);
});

test("port hover raises its direction while route hover isolates one connection and follows region focus", () => {
  const state = runtime(), app = state.context;
  app.showPooledFlowCallout("exports");
  assert.equal(state.cards.length, 0);
  assert.equal(state.highlights.get("svg:pooled-flow-focus"), true);
  const active = () => state.highlights.get(".pooled-flow-route");
  assert.equal(active()({ channel: "exports", region: "CR13" }), true);
  assert.equal(active()({ channel: "exports", region: "CR17" }), true);
  assert.equal(active()({ channel: "imports", region: "CR13" }), false);
  app.selectedNodeData = { id: "CR13" };
  app.renderPooledFlowCallout();
  assert.equal(active()({ channel: "exports", region: "CR17" }), false);
  app.selectedNodeData = null;
  app.showPooledFlowCallout({ channel: "exports", region: "CR13" });
  assert.equal(active()({ channel: "exports", region: "CR17" }), false);
  const curve = app.getPooledFlowGeometry(app.hoveredPooledFlow, app.allNodes[0]);
  assert.equal(state.cards.at(-1).x, (curve.start[0] + 2 * curve.control[0] + curve.end[0]) / 4);
  assert.equal(state.cards.at(-1).y, (curve.start[1] + 2 * curve.control[1] + curve.end[1]) / 4);
});

test("active route cards follow current counts and disappear when the route is absent", () => {
  const state = runtime(), app = state.context;
  app.showPooledFlowCallout({ channel: "exports", region: "CR13" });
  app.pooledFlowFrame.regions.CR13.exports.observed = 150;
  app.pooledFlowFrame.exports.observed = 200;
  app.renderPooledFlowCallout();
  assert.equal(state.cards.at(-1).info.hero, "150");
  assert.equal(state.cards.at(-1).info.rows[0].value, "75.0%");
  app.pooledFlowFrame.regions.CR13.exports.observed = 0;
  app.renderPooledFlowCallout();
  assert.equal(app.hoveredPooledFlow, null);
  assert.equal(state.clears, 1);
});
