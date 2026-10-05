import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");

function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function runtime() {
  const context = vm.createContext({});
  vm.runInContext(["getNetworkLinkPath", "getNetworkLinkArc", "updateNetworkLinkBoundaries"].map(extractFunction).join("\n"), context);
  return context;
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

function displayedCircle(radius, strokeWidth = 0) {
  const attrs = { r: radius, "stroke-width": strokeWidth };
  return { attrs, style: { stroke: "none", strokeWidth: "1px", opacity: "1" },
    getAttribute: (name) => attrs[name] ?? null,
    getScreenCTM: () => ({ a: 2, b: 0 }),
  };
}

function boundaryScene({ radius = 12, displayedRadius = radius, rings = [] } = {}) {
  const context = runtime();
  const node = { id: "CR35", x: 200, y: 100, r: radius };
  const circle = displayedCircle(displayedRadius);
  const ringGroup = {
    children: rings.map((r) => displayedCircle(r, 2.5)), scale: 1,
    get childElementCount() { return this.children.length; },
    getCTM() { return { a: 2 * this.scale, b: 0 }; },
  };
  const element = {
    querySelector(selector) { return selector === "circle.primary" ? circle : ringGroup; },
    getCTM: () => ({ a: 2, b: 0 }),
  };
  const link = { source: { id: "CR01", x: 0, y: 100 }, target: node };
  const rendered = [], annotations = [], frames = new Map();
  let nextFrame = 0;
  const svgElement = { isConnected: true };
  Object.assign(context, {
    linkBoundaryFrame: null, hoveredLink: null, annotationGroup: {},
    svg: { node: () => svgElement },
    getComputedStyle: (element) => element.style,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    nodeEnter: { each(callback) { callback.call(element, node); } },
    linkSelection: { attr(name, value) { assert.equal(name, "d"); rendered.push(value(link)); return this; } },
    updateAnnotationForLink: (datum, group) => annotations.push({ datum, group }),
  });
  return { context, node, circle, element, ringGroup, link, rendered, annotations, frames, svgElement,
    advanceFrame() {
      assert.equal(frames.size, 1);
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback();
    },
  };
}

test("route endpoints meet both node boundaries on the same circular arc in every direction", () => {
  const context = runtime();
  for (const [sourceRadius, targetRadius] of [[0, 0], [6, 21], [43.725, 6], [1, 70]]) {
    for (const angle of [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 3]) {
      const a = { x: 40, y: 70, r: 5, linkBoundaryRadius: sourceRadius };
      const b = { x: a.x + 200 * Math.cos(angle), y: a.y + 200 * Math.sin(angle), r: 5, linkBoundaryRadius: targetRadius };
      for (const [source, target] of [[a, b], [b, a]]) {
        const arc = context.getNetworkLinkArc(context.getNetworkLinkPath({ source, target }));
        close(Math.hypot(arc.x1 - source.x, arc.y1 - source.y), source.linkBoundaryRadius);
        close(Math.hypot(arc.x2 - target.x, arc.y2 - target.y), target.linkBoundaryRadius);
        const cx = (source.x + target.x) / 2 - (target.y - source.y) * Math.sqrt(3) / 2;
        const cy = (source.y + target.y) / 2 + (target.x - source.x) * Math.sqrt(3) / 2;
        close(arc.cx, cx);
        close(arc.cy, cy);
        close(arc.radius, 200);
        close(Math.hypot(arc.x1 - cx, arc.y1 - cy), 200);
        close(Math.hypot(arc.x2 - cx, arc.y2 - cy), 200);
      }
    }
  }
});

test("nodes without cached boundaries use their own radii without padding", () => {
  const context = runtime();
  const source = { x: 0, y: 0, r: 12 };
  for (const radius of [5, 20]) {
    const target = { x: 100, y: 0, r: radius };
    const arc = context.getNetworkLinkArc(context.getNetworkLinkPath({ source, target }));
    close(Math.hypot(arc.x1 - source.x, arc.y1 - source.y), source.r);
    close(Math.hypot(arc.x2 - target.x, arc.y2 - target.y), radius);
  }
});

test("routes only render the portion of the arc outside both node circles", () => {
  const context = runtime();
  const source = { x: 10, y: 10, r: 12, linkBoundaryRadius: 20 };
  assert.equal(context.getNetworkLinkPath({ source, target: source }), null);
  for (const distance of [0, 12, 20, 24, 35]) {
    const target = { x: source.x + distance, y: source.y, linkBoundaryRadius: 20 };
    assert.equal(context.getNetworkLinkPath({ source, target }), null);
  }
  for (const [sourceRadius, targetRadius] of [[21, 0], [0, 21]]) {
    assert.equal(context.getNetworkLinkPath({
      source: { x: 0, y: 0, r: sourceRadius }, target: { x: 20, y: 0, r: targetRadius },
    }), null);
  }
  const target = { x: 50, y: 10, linkBoundaryRadius: 20 };
  const arc = context.getNetworkLinkArc(context.getNetworkLinkPath({ source, target }));
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const angle = arc.start + arc.span * fraction;
    const x = arc.cx + arc.radius * Math.cos(angle), y = arc.cy + arc.radius * Math.sin(angle);
    assert.ok(Math.hypot(x - source.x, y - source.y) >= 20 - 1e-9);
    assert.ok(Math.hypot(x - target.x, y - target.y) >= 20 - 1e-9);
  }
});

test("ring boundaries follow the rendered breathing scale, outer stroke and outline", () => {
  const app = boundaryScene({ rings: [16, 20, 24] });
  app.context.hoveredLink = app.link;
  app.context.updateNetworkLinkBoundaries();
  for (const scale of [1, 1.03, 1.06, 1.02, 1]) {
    app.ringGroup.scale = scale;
    app.advanceFrame();
    close(app.node.linkBoundaryRadius, (24 + 1.25 + 1) * scale);
    const arc = app.context.getNetworkLinkArc(app.rendered.at(-1));
    close(Math.hypot(arc.x2 - app.node.x, arc.y2 - app.node.y), app.node.linkBoundaryRadius);
  }
  assert.equal(app.rendered.length, 5);
  assert.equal(app.annotations.length, 5);
  assert.equal(app.annotations[0].datum, app.link);
});

test("boundaries follow growing and shrinking circles without reserving a future radius", () => {
  const app = boundaryScene({ radius: 20, displayedRadius: 5 });
  app.context.updateNetworkLinkBoundaries();
  for (const radius of [5, 12, 20, 15, 5]) {
    app.circle.attrs.r = radius;
    app.advanceFrame();
    close(app.node.linkBoundaryRadius, radius);
  }
  app.ringGroup.children = [displayedCircle(9, 2.5)];
  app.advanceFrame();
  close(app.node.linkBoundaryRadius, 11.25);
  app.ringGroup.children[0].style.opacity = "0";
  app.advanceFrame();
  close(app.node.linkBoundaryRadius, 5);
  app.ringGroup.children = [];
  app.advanceFrame();
  close(app.node.linkBoundaryRadius, 5);
  app.element.querySelector = (selector) => selector === "circle.primary" ? null : app.ringGroup;
  app.advanceFrame();
  close(app.node.linkBoundaryRadius, app.node.r);
});

test("boundaries include rendered simulation and focus strokes at the current zoom", () => {
  const app = boundaryScene();
  app.context.updateNetworkLinkBoundaries();
  close(app.node.linkBoundaryRadius, 12);
  Object.assign(app.circle.style, { stroke: "#7f1d1d", strokeWidth: "1.8px" });
  app.advanceFrame();
  close(app.node.linkBoundaryRadius, 12.9);
  Object.assign(app.circle.style, { strokeWidth: "2px", vectorEffect: "non-scaling-stroke" });
  app.advanceFrame();
  close(app.node.linkBoundaryRadius, 12.5);
});

test("boundary tracking keeps one frame pending, skips unchanged paths and stops on removal", () => {
  const app = boundaryScene();
  app.context.updateNetworkLinkBoundaries();
  app.context.updateNetworkLinkBoundaries();
  app.advanceFrame();
  assert.equal(app.rendered.length, 1);
  assert.equal(app.frames.size, 1);
  app.svgElement.isConnected = false;
  app.advanceFrame();
  assert.equal(app.frames.size, 0);
  assert.equal(app.context.linkBoundaryFrame, null);
});
