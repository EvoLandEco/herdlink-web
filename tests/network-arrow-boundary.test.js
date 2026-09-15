import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const metricNames = ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"];

function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function runtime() {
  const context = vm.createContext({});
  vm.runInContext(["getAdjustedTarget", "getNetworkLinkPath", "updateNetworkLinkBoundaries"].map(extractFunction).join("\n"), context);
  return context;
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

function displayedCircle(radius, strokeWidth = 0) {
  const attrs = { r: radius, "stroke-width": strokeWidth };
  return { attrs, getAttribute: (name) => attrs[name] ?? null };
}

function boundaryScene({ radius = 12, displayedRadius = radius, rings = [] } = {}) {
  const context = runtime();
  const node = { id: "CR35", x: 200, y: 100, r: radius };
  const circle = displayedCircle(displayedRadius);
  const element = {
    rings: rings.map((r) => displayedCircle(r, 2.5)),
    querySelector(selector) { assert.equal(selector, "circle.primary"); return circle; },
    querySelectorAll(selector) { assert.equal(selector, ".hotspotStroke"); return this.rings; },
  };
  const link = { source: { id: "CR01", x: 0, y: 100 }, target: node };
  const rendered = [];
  const annotations = [];
  const transition = { pending: null, starts: 0, duration: null };
  const topNMetric = Object.fromEntries(metricNames.map((metric) => [metric, []]));
  const nodeGroup = {
    interrupt(name) { assert.equal(name, "link-boundary"); transition.pending = null; return this; },
    transition(name) { assert.equal(name, "link-boundary"); transition.starts += 1; return this; },
    duration(value) { transition.duration = value; return this; },
    on(event, callback) { assert.equal(event, "end"); transition.pending = callback; return this; },
  };
  Object.assign(context, {
    metricNames, topNMetric, hotspotRingSpacing: 4, hotspotRingMaxScale: 1.06,
    nodeAppearanceDuration: 200, nodeGroup, hoveredLink: null, annotationGroup: {},
    nodeEnter: { each(callback) { callback.call(element, node); } },
    linkSelection: { attr(name, value) { assert.equal(name, "d"); rendered.push(value(link)); return this; } },
    updateAnnotationForLink: (datum, group) => annotations.push({ datum, group }),
  });
  return { context, node, circle, element, link, rendered, annotations, topNMetric, transition,
    finishTransition() {
      const callback = transition.pending;
      assert.equal(typeof callback, "function");
      transition.pending = null;
      callback();
    },
  };
}

test("arrow endpoints leave a fixed gap beyond different target boundaries in every direction", () => {
  const context = runtime();
  for (const boundary of [6, 21, 43.725]) {
    for (const angle of [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 3]) {
      const target = { x: 40, y: 70, r: 5, linkBoundaryRadius: boundary };
      const source = { x: target.x - 200 * Math.cos(angle), y: target.y - 200 * Math.sin(angle) };
      const end = context.getAdjustedTarget({ source, target });
      close(Math.hypot(end.x - target.x, end.y - target.y), boundary + 4);
      close((end.x - source.x) * Math.sin(angle) - (end.y - source.y) * Math.cos(angle), 0);
      const path = context.getNetworkLinkPath({ source, target });
      assert.ok(path.startsWith(`M${source.x},${source.y}A`));
      assert.ok(path.endsWith(` ${end.x},${end.y}`));
      assert.ok(!path.includes("NaN"));
    }
  }
});

test("a target without stored geometry uses its radius and stroke clearance", () => {
  const context = runtime();
  const source = { x: 0, y: 0 };
  for (const radius of [5, 20]) {
    const target = { x: 100, y: 0, r: radius };
    const end = context.getAdjustedTarget({ source, target });
    close(100 - end.x, radius + 5);
  }
});

test("self routes and routes enclosed by the target boundary produce no arrow path", () => {
  const context = runtime();
  const source = { x: 10, y: 10, r: 12, linkBoundaryRadius: 20 };
  assert.equal(context.getNetworkLinkPath({ source, target: source }), null);
  for (const distance of [0, 12, 24]) {
    const target = { x: source.x + distance, y: source.y, linkBoundaryRadius: 20 };
    assert.equal(context.getAdjustedTarget({ source, target }), null);
    assert.equal(context.getNetworkLinkPath({ source, target }), null);
  }
  assert.ok(context.getNetworkLinkPath({ source, target: { x: 35, y: 10, linkBoundaryRadius: 20 } }));
});

test("ring boundaries include the outer stroke, outline and full breathing extent", () => {
  const app = boundaryScene({ rings: [16, 20, 24] });
  app.context.hoveredLink = app.link;
  app.context.updateNetworkLinkBoundaries();
  close(app.node.linkBoundaryRadius, (24 + 1.25 + 1) * 1.06);
  close(200 - app.context.getAdjustedTarget(app.link).x, app.node.linkBoundaryRadius + 4);
  assert.equal(app.rendered.length, 1);
  assert.equal(app.annotations.length, 1);
  assert.equal(app.annotations[0].datum, app.link);
  assert.equal(app.transition.starts, 0);
});

test("growing nodes reserve their destination radius and new rings before rendering", () => {
  const app = boundaryScene({ radius: 20, displayedRadius: 5 });
  app.topNMetric.inDegree.push(app.node.id);
  app.topNMetric.outDegree.push(app.node.id);
  app.context.updateNetworkLinkBoundaries(true);
  close(app.node.linkBoundaryRadius, (20 + 8 + 2.25) * 1.06);
  assert.equal(app.transition.starts, 1);
  assert.equal(app.transition.duration, 200);
  app.circle.attrs.r = 20;
  app.element.rings = [displayedCircle(24, 2.5), displayedCircle(28, 2.5)];
  app.finishTransition();
  close(app.node.linkBoundaryRadius, (28 + 2.25) * 1.06);
  assert.equal(app.rendered.length, 2);
  assert.equal(app.transition.starts, 1);
});

test("shrinking nodes reserve displayed rings and release the gap after they disappear", () => {
  const app = boundaryScene({ radius: 5, displayedRadius: 20, rings: [24, 28] });
  app.context.updateNetworkLinkBoundaries(true);
  close(app.node.linkBoundaryRadius, (28 + 2.25) * 1.06);
  app.circle.attrs.r = 5;
  app.element.rings = [];
  app.finishTransition();
  close(app.node.linkBoundaryRadius, 6);
  close(app.context.getAdjustedTarget(app.link).x, 190);
  assert.equal(app.annotations.length, 0);
});

test("a second timeline change replaces the pending boundary release with the current transition", () => {
  const app = boundaryScene({ radius: 5, displayedRadius: 20, rings: [24] });
  app.context.updateNetworkLinkBoundaries(true);
  const firstRelease = app.transition.pending;
  app.node.r = 18;
  app.circle.attrs.r = 10;
  app.element.rings = [displayedCircle(14, 2.5)];
  app.topNMetric.betweenness.push(app.node.id);
  app.context.updateNetworkLinkBoundaries(true);
  close(app.node.linkBoundaryRadius, (18 + 4 + 2.25) * 1.06);
  assert.notEqual(app.transition.pending, firstRelease);
  app.circle.attrs.r = 18;
  app.element.rings = [displayedCircle(22, 2.5)];
  app.finishTransition();
  close(app.node.linkBoundaryRadius, (22 + 2.25) * 1.06);
  assert.equal(app.transition.starts, 2);
  assert.equal(app.rendered.length, 3);
});
