import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const names = [
  "updateNodeHoverLinks", "handleNetworkNodeEnter", "handleNetworkNodeLeave",
  "getNodeId", "getLinkBaseClass", "getLinkHoverClass", "restoreLinkClass", "clearNetworkCallout", "clearHoveredLinkState",
  "getNetworkLinkArc", "distanceToNetworkLinkArc", "isNetworkLinkHoverable", "findNearestNetworkLink",
  "showNetworkLinkCallout", "handleNetworkLinkPointerMove", "handleNetworkLinkPointerLeave", "restoreNetworkLinkCallout",
];
const functions = names.map((name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}).join("\n");

function route(id, path, data = {}) {
  return {
    datum: { id, source: "CR01", target: "CR02", weight: 1, ...data },
    attrs: { d: path, class: "link" },
    style: {},
    getAttribute(name) { return this.attrs[name] ?? null; },
  };
}

function runtime(elements = [], international = []) {
  const cards = [];
  const interruptions = [];
  let clears = 0;
  let nodeCard = false;
  const classes = {};
  const root = { getScreenCTM: () => ({ a: 1, b: 0 }) };
  const context = vm.createContext({
    hoveredNode: null, theme: { text: "#fff" },
    selectedNodeData: null, hoveredLink: null, hoveredLinkElement: null, hoveredPooledFlow: null,
    linkHoverGeometry: new WeakMap(),
    linkSelection: {
      each(callback) { elements.forEach((element) => callback.call(element, element.datum)); },
      attr(name, callback) { elements.forEach((element) => { element.attrs[name] = callback(element.datum); }); },
    },
    svg: {
      node: () => root,
      classed(name, value) { classes[name] = value; },
      selectAll(selector) {
        assert.equal(selector, ".pooled-flow-route");
        return { classed(name, callback) { international.forEach((element) => { element[name] = callback(element); }); } };
      },
    },
    annotationGroup: {
      select(selector) { assert.equal(selector, ".node-annotation"); return { empty: () => !nodeCard }; },
      selectAll: () => ({
        interrupt(name) { interruptions.push(name); return this; },
        remove() { clears += 1; nodeCard = false; },
      }),
    },
    clearPooledFlowHover() { context.hoveredPooledFlow = null; },
    updateAnnotationForNode: (datum) => cards.push(datum),
    updateAnnotationForLink: (datum) => cards.push(datum),
    d3: {
      pointer: (event) => event.point,
      select: (element) => ({
        datum: () => element.datum,
        select() { return this; },
        attr(name, value) { element.attrs[name] = value; return this; },
      }),
    },
  });
  vm.runInContext(functions, context);
  return { context, cards, root, classes, interruptions, get clears() { return clears; },
    showNodeCard() { nodeCard = true; } };
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`);

test("date refreshes retain node cards while ordinary cleanup interrupts and removes them", () => {
  const state = runtime();
  state.showNodeCard();
  state.context.clearHoveredLinkState(true);
  assert.equal(state.clears, 0);
  assert.deepEqual(state.interruptions, []);
  state.context.clearHoveredLinkState();
  assert.equal(state.clears, 1);
  assert.deepEqual(state.interruptions, ["radar"]);
});

test("date refreshes clear link cards and restore their route appearance", () => {
  const element = route("route", "M0,0A10,10 0 0,1 20,0");
  const state = runtime([element]);
  state.context.showNetworkLinkCallout(element, element.datum);
  state.context.clearHoveredLinkState(true);
  assert.equal(state.context.hoveredLink, null);
  assert.equal(state.context.hoveredLinkElement, null);
  assert.equal(element.attrs.class, "link");
  assert.equal(state.clears, 1);
  assert.deepEqual(state.interruptions, ["radar"]);
});

test("circular route distance follows the visible short arc and its endpoints", () => {
  const { context: app } = runtime();
  const arc = app.getNetworkLinkArc("M0,0A100,100 0 0,1 100,100");
  close(arc.cx, 0);
  close(arc.cy, 100);
  close(app.distanceToNetworkLinkArc(arc, Math.SQRT1_2 * 100, 100 - Math.SQRT1_2 * 100), 0);
  close(app.distanceToNetworkLinkArc(arc, Math.SQRT1_2 * 104, 100 - Math.SQRT1_2 * 104), 4);
  close(app.distanceToNetworkLinkArc(arc, -10, 0), 10);
  close(app.distanceToNetworkLinkArc(arc, 100, 110), 10);
  close(app.distanceToNetworkLinkArc(arc, -100, 100), Math.SQRT2 * 100);
  close(arc.minX, 0);
  close(arc.maxX, 100);
  close(arc.minY, 0);
  close(arc.maxY, 100);
});

test("opposing routes have separate arcs and adjusted endpoints", () => {
  const forward = route("forward", "M0,0A100,100 0 0,1 100,0");
  const reverse = route("reverse", "M100,0A100,100 0 0,1 0,0");
  const { context: app } = runtime([forward, reverse]);
  const height = 100 - Math.sqrt(7500);
  assert.equal(app.findNearestNetworkLink(50, -height, 6), forward);
  assert.equal(app.findNearestNetworkLink(50, height, 6), reverse);
  const adjusted = app.getNetworkLinkArc("M0,0A100,100 0 0,1 90,0");
  close(app.distanceToNetworkLinkArc(adjusted, 90, 0), 0);
  close(app.distanceToNetworkLinkArc(adjusted, 100, 0), 10);
});

test("arc distance supports sweep direction, large arcs and radius correction", () => {
  const { context: app } = runtime();
  const clockwise = app.getNetworkLinkArc("M-10,0A10,10 0 0,1 10,0");
  const counterclockwise = app.getNetworkLinkArc("M-10,0A10,10 0 0,0 10,0");
  close(app.distanceToNetworkLinkArc(clockwise, 0, -10), 0);
  close(app.distanceToNetworkLinkArc(counterclockwise, 0, 10), 0);
  close(clockwise.minY, -10);
  close(counterclockwise.maxY, 10);
  const large = app.getNetworkLinkArc("M0,0A100,100 0 1,1 100,100");
  close(large.span, Math.PI * 1.5);
  close(app.distanceToNetworkLinkArc(large, 200, 0), 0);
  const corrected = app.getNetworkLinkArc("M0,0A10,10 0 0,1 100,0");
  close(corrected.radius, 50);
  close(app.distanceToNetworkLinkArc(corrected, 50, -50), 0);
});

test("zero radius routes use distance to the straight segment", () => {
  const { context: app } = runtime();
  const segment = app.getNetworkLinkArc("M0,0A0,0 0 0,1 20,0");
  close(app.distanceToNetworkLinkArc(segment, 10, 0), 0);
  close(app.distanceToNetworkLinkArc(segment, 10, 3), 3);
  close(app.distanceToNetworkLinkArc(segment, -4, 3), 5);
  close(app.distanceToNetworkLinkArc(segment, 24, 3), 5);
});

test("nearest route wins at crossings and exact ties preserve the active route", () => {
  const horizontal = route("horizontal", "M-10,10A10,10 0 0,1 10,10");
  const vertical = route("vertical", "M10,10A10,10 0 0,1 10,-10");
  const { context: app } = runtime([horizontal, vertical]);
  assert.equal(app.findNearestNetworkLink(0.5, 0, 6), horizontal);
  assert.equal(app.findNearestNetworkLink(0, -0.5, 6), vertical);
  assert.equal(app.findNearestNetworkLink(0, 0, 6), horizontal);
  app.hoveredLinkElement = vertical;
  assert.equal(app.findNearestNetworkLink(0, 0, 6), vertical);
  assert.equal(app.findNearestNetworkLink(40, 40, 6), null);
});

test("route eligibility follows weight, permissions, visibility and focus", () => {
  const element = route("route", "M0,0A10,10 0 0,1 20,0");
  const { context: app } = runtime([element]);
  assert.equal(app.isNetworkLinkHoverable(element, element.datum), true);
  for (const weight of [0, -1, NaN]) {
    element.datum.weight = weight;
    assert.equal(app.findNearestNetworkLink(10, -10, 6), null);
  }
  element.datum.weight = 1;
  element.datum.disabled = true;
  assert.equal(app.findNearestNetworkLink(10, -10, 6), null);
  element.datum.disabled = false;
  for (const [key, value] of [["display", "none"], ["opacity", "0"]]) {
    element.attrs[key] = value;
    assert.equal(app.findNearestNetworkLink(10, -10, 6), null);
    delete element.attrs[key];
  }
  element.style.opacity = "0";
  assert.equal(app.findNearestNetworkLink(10, -10, 6), null);
  delete element.style.opacity;
  app.selectedNodeData = { id: "CR03" };
  assert.equal(app.findNearestNetworkLink(10, -10, 6), null);
  app.selectedNodeData = { id: "CR02" };
  assert.equal(app.findNearestNetworkLink(10, -10, 6), element);
  element.datum.source = { id: "CR01" };
  element.datum.target = { id: "CR02" };
  assert.equal(app.findNearestNetworkLink(10, -10, 6), element);
});

test("geometry cache follows path changes while retaining unchanged routes", () => {
  const element = route("route", "M0,0A10,10 0 0,1 20,0");
  const { context: app } = runtime([element]);
  assert.equal(app.findNearestNetworkLink(10, -10, 6), element);
  const cached = app.linkHoverGeometry.get(element);
  element.attrs.class = "linkOver";
  element.attrs["stroke-dashoffset"] = "-5";
  assert.equal(app.findNearestNetworkLink(10, -8, 6), element);
  assert.equal(app.linkHoverGeometry.get(element), cached);
  element.attrs.d = "M100,0A10,10 0 0,1 120,0";
  assert.equal(app.findNearestNetworkLink(10, -10, 6), null);
  assert.notEqual(app.linkHoverGeometry.get(element), cached);
  assert.equal(app.findNearestNetworkLink(110, -10, 6), element);
  for (const path of ["", null, "MNaN,0A10,10 0 0,1 20,0", "M0,0A10,20 0 0,1 20,0", "M0,0A0,0 0 0,1 0,0"]) {
    element.attrs.d = path;
    assert.equal(app.findNearestNetworkLink(110, -10, 6), null);
  }
});

test("repeated movement reuses the card and a replacement datum refreshes it", () => {
  const first = route("first", "M0,0A10,10 0 0,1 20,0");
  const second = route("second", "M100,0A10,10 0 0,1 120,0");
  const { context: app, cards } = runtime([first, second]);
  app.showNetworkLinkCallout(first, first.datum);
  app.showNetworkLinkCallout(first, first.datum);
  assert.equal(cards.length, 1);
  assert.equal(first.attrs.class, "linkOver");
  app.showNetworkLinkCallout(second, second.datum);
  assert.equal(first.attrs.class, "link");
  assert.equal(second.attrs.class, "linkOver");
  assert.equal(cards.length, 2);
  second.datum = { ...second.datum, weight: 2 };
  app.showNetworkLinkCallout(second, second.datum);
  assert.equal(cards.length, 3);
  assert.equal(cards.at(-1).weight, 2);
});

test("international hover owns its hit area and releases it when the pointer returns to domestic routes", () => {
  const element = route("route", "M0,0A10,10 0 0,1 20,0");
  const { context: app, cards } = runtime([element]);
  app.hoveredPooledFlow = { channel: "imports" };
  app.clearPooledFlowHover = () => { app.hoveredPooledFlow = null; };
  for (const surface of [".pooled-flows", ".pooled-ports"]) {
    app.handleNetworkLinkPointerMove({ target: { closest: (selector) => selector === surface }, point: [10, -10] });
  }
  assert.equal(cards.length, 0);
  assert.equal(app.hoveredPooledFlow.channel, "imports");
  app.handleNetworkLinkPointerMove({ target: { closest: () => null }, point: [10, -10] });
  assert.equal(app.hoveredPooledFlow, null);
  assert.equal(app.hoveredLinkElement, element);
});

test("restoring a route binds its current element and respects exclusions", () => {
  const element = route("route", "M0,0A10,10 0 0,1 20,0");
  const { context: app, cards } = runtime([element]);
  app.selectedNodeData = { id: "CR01" };
  app.restoreNetworkLinkCallout("route");
  assert.equal(app.hoveredLinkElement, element);
  assert.equal(app.hoveredLink, element.datum);
  assert.equal(element.attrs.class, "linkSelectOutOver");
  app.clearHoveredLinkState();
  assert.equal(element.attrs.class, "linkSelectOut");
  element.datum.disabled = true;
  app.restoreNetworkLinkCallout("route");
  assert.equal(app.hoveredLink, null);
  assert.equal(cards.length, 1);
  element.datum.disabled = false;
  app.selectedNodeData = { id: "CR03" };
  app.restoreNetworkLinkCallout("route");
  assert.equal(app.hoveredLink, null);
});

test("pointer targeting preserves node priority and uses a screen sized hit radius", () => {
  const element = route("route", "M0,0A10,10 0 0,1 20,0");
  const state = runtime([element]);
  const app = state.context;
  app.handleNetworkLinkPointerMove({ target: { closest: () => ({}) }, point: [10, -10] });
  assert.equal(app.hoveredLink, null);
  assert.equal(state.cards.length, 0);
  const target = { closest: () => null };
  state.root.getScreenCTM = () => ({ a: 2, b: 0 });
  app.handleNetworkLinkPointerMove({ target, point: [10, -12] });
  assert.equal(app.hoveredLinkElement, element);
  app.handleNetworkLinkPointerMove({ target, point: [10, -14] });
  assert.equal(app.hoveredLink, null);
  app.handleNetworkLinkPointerMove({ target, point: [10, -10] });
  app.handleNetworkLinkPointerLeave();
  assert.equal(app.hoveredLinkElement, null);
  assert.equal(app.hoveredLink, null);
  assert.equal(element.attrs.class, "link");
  const clears = state.clears;
  app.handleNetworkLinkPointerLeave();
  assert.equal(state.clears, clears);
});


test("regional hover emphasizes live domestic directions and international routes, then clears", () => {
  const outgoing = route("out", "", { source: { id: "CR01" }, target: { id: "CR02" } });
  const incoming = route("in", "", { source: "CR03", target: "CR01" });
  const unrelated = route("other", "", { source: "CR02", target: "CR03" });
  const disabled = route("disabled", "", { disabled: true });
  const zero = route("zero", "", { weight: 0 });
  const invalid = route("invalid", "", { weight: NaN });
  const links = [outgoing, incoming, unrelated, disabled, zero, invalid];
  const imports = { region: "CR01", observed: 10, channel: "imports" };
  const exports = { region: "CR01", observed: 20, channel: "exports" };
  const empty = { region: "CR01", observed: 0, channel: "exports" };
  const other = { region: "CR02", observed: 10, channel: "imports" };
  const { context: app, classes, cards } = runtime(links, [imports, exports, empty, other]);
  const element = { attrs: {} }, node = { id: "CR01" };
  app.hoveredPooledFlow = { channel: "imports" };
  app.handleNetworkNodeEnter.call(element, {}, node);
  assert.equal(app.hoveredPooledFlow, null);
  assert.equal(app.hoveredNode, node);
  assert.equal(classes["region-flow-focus"], true);
  assert.deepEqual(links.map((link) => link.attrs["data-node-flow"]), ["outgoing", "incoming", null, null, null, null]);
  assert.deepEqual([imports, exports, empty, other].map((link) => link["is-region-hovered"]), [true, true, false, false]);
  assert.equal(cards.at(-1), node);
  app.handleNetworkNodeLeave.call(element);
  assert.equal(app.hoveredNode, null);
  assert.equal(classes["region-flow-focus"], false);
  assert.ok(links.every((link) => link.attrs["data-node-flow"] === null));
  assert.ok([imports, exports, empty, other].every((link) => !link["is-region-hovered"]));
});

test("regional emphasis follows refreshed data and yields to node focus", () => {
  const link = route("out", "", { weight: 0 });
  const { context: app, classes } = runtime([link]);
  app.hoveredNode = { id: "CR01" };
  app.updateNodeHoverLinks();
  assert.equal(link.attrs["data-node-flow"], null);
  link.datum = { ...link.datum, weight: 100 };
  app.updateNodeHoverLinks();
  assert.equal(link.attrs["data-node-flow"], "outgoing");
  link.datum.disabled = true;
  app.updateNodeHoverLinks();
  assert.equal(link.attrs["data-node-flow"], null);
  link.datum.disabled = false;
  app.selectedNodeData = { id: "CR02" };
  app.updateNodeHoverLinks();
  assert.equal(classes["region-flow-focus"], false);
  assert.equal(link.attrs["data-node-flow"], null);
  assert.equal(app.getLinkBaseClass(link.datum), "linkSelectIn");
});
