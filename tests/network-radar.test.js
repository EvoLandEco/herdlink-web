import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const functions = ["clearNetworkCallout", "getNetworkCalloutPosition", "renderNetworkCallout", "drawRadarChart"]
  .map((name) => source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"))[0]).join("\n");
const descendants = (node) => node.children.flatMap((child) => [child, ...descendants(child)]);
const matches = (node, selector) => selector === "*" || selector.split(",").some((part) => {
  const [tag, cls] = part.trim().split(".");
  return (!tag || node.tag === tag) && (!cls || node.attrs.class?.split(" ").includes(cls));
});
const element = (tag, parent = null, datum) => ({ tag, parent, datum, attrs: {}, children: [], transitions: new Map() });

class Selection {
  constructor(nodes, parent = null) { this.nodes = nodes; this.parent = parent; }
  each(fn) { this.nodes.forEach((node, index) => { if (node) fn.call(node, node.datum, index); }); return this; }
  selectAll(selector) {
    return new Selection(this.nodes.flatMap((node) => descendants(node).filter((child) => matches(child, selector))), this.nodes[0]);
  }
  select(selector) { return new Selection(this.selectAll(selector).nodes.slice(0, 1), this.nodes[0]); }
  empty() { return !this.nodes.some(Boolean); }
  datum(value) {
    if (!arguments.length) return this.nodes[0]?.datum;
    return this.each(function () { this.datum = value; });
  }
  attr(name, value) {
    return this.each(function (datum, index) { this.attrs[name] = typeof value === "function" ? value(datum, index) : value; });
  }
  classed(name, active) {
    return this.each(function () {
      const names = new Set((this.attrs.class || "").split(" "));
      if (active) names.add(name); else names.delete(name);
      this.attrs.class = [...names].join(" ");
    });
  }
  style(name, value) { return this.attr(name, value); }
  text(value) { return this.attr("text", value); }
  raise() { return this; }
  append(tag) {
    return new Selection(this.nodes.map((node) => {
      if (!node) return null;
      const parent = node.enter ? this.parent : node;
      const child = element(tag, parent, node.datum);
      parent.children.push(child);
      return child;
    }), this.parent);
  }
  data(values, key) {
    const remaining = new Map(this.nodes.map((node, index) => [key ? key(node.datum) : index, node]));
    const enter = [], update = values.map((datum, index) => {
      const id = key ? key(datum) : index, node = remaining.get(id);
      remaining.delete(id);
      if (node) node.datum = datum;
      else enter[index] = { enter: true, datum };
      return node || null;
    });
    const selection = new Selection(update, this.parent);
    selection.enter = new Selection(enter, this.parent);
    selection.exit = new Selection([...remaining.values()], this.parent);
    return selection;
  }
  join(enter, update = (selection) => selection, exit = (selection) => selection.remove()) {
    const added = typeof enter === "string" ? this.enter.append(enter) : enter(this.enter);
    assert.ok(update(this) instanceof Selection, "D3 v6 joins require update selections");
    exit(this.exit);
    return new Selection(this.nodes.map((node, index) => node || added.nodes[index]), this.parent);
  }
  remove() {
    return this.each(function () { this.parent.children = this.parent.children.filter((node) => node !== this); });
  }
  interrupt(name) { return this.each(function () { this.transitions.delete(name); }); }
  transition(name) {
    this.each(function () { this.transitions.set(name, { attrs: {} }); });
    const selection = this;
    return {
      duration(value) { selection.each(function () { this.transitions.get(name).duration = value; }); return this; },
      attr(key, value) {
        selection.each(function (datum, index) {
          this.transitions.get(name).attrs[key] = {
            from: this.attrs[key], to: typeof value === "function" ? value(datum, index) : value,
          };
        });
        return this;
      },
    };
  }
}

function runtime(reducedMotion = false) {
  const root = element("g"), group = new Selection([root]);
  const context = vm.createContext({
    annotationGroup: group, w: 800, h: 600,
    window: { matchMedia: () => ({ matches: reducedMotion }) },
    d3: { line() { const line = (points) => JSON.stringify(points); line.curve = () => line; return line; } },
  });
  vm.runInContext(functions, context);
  const find = (selector) => descendants(root).filter((node) => matches(node, selector));
  return { context, root, group, find,
    render(info, x = 200) { context.renderNetworkCallout(group, x, 200, info); } };
}

const info = (values, changes = {}) => ({
  kind: "node", code: "A", name: "Region A", tag: "P1", profile: "Trade profile",
  labels: ["IN", "OUT", "BT", "PR", "EC"], rows: [], values, ...changes,
});
const values = (value) => [value, value, value, value, value];

test("date changes reuse the radar elements and position updates leave their transition running", () => {
  const app = runtime();
  app.render(info(values(0.2)));
  const svg = app.find("svg.custom-radar")[0], path = app.find("path.node-radar")[0];
  const vertices = app.find("circle.vertex"), start = path.attrs.d;
  assert.equal(path.transitions.size, 0);
  app.render(info(values(0.8)));
  assert.equal(app.find("svg.custom-radar")[0], svg);
  assert.equal(app.find("path.node-radar")[0], path);
  assert.deepEqual(app.find("circle.vertex"), vertices);
  assert.equal(path.attrs.d, start);
  const transition = path.transitions.get("radar");
  assert.equal(transition.duration, 400);
  const targetPoints = JSON.parse(transition.attrs.d.to);
  vertices.forEach((vertex, index) => {
    assert.equal(vertex.transitions.get("radar").attrs.cx.to, targetPoints[index][0]);
    assert.equal(vertex.transitions.get("radar").attrs.cy.to, targetPoints[index][1]);
  });
  app.render(info(values(0.8)), 300);
  assert.equal(path.transitions.get("radar"), transition);
});

test("a rapid date update starts from the geometry already displayed", () => {
  const app = runtime();
  app.render(info(values(0.2)));
  app.render(info(values(0.8)));
  const path = app.find("path.node-radar")[0], vertices = app.find("circle.vertex");
  const previous = path.transitions.get("radar");
  const visible = JSON.parse(path.attrs.d).map((point, index) => point.map((value, axis) =>
    (value + JSON.parse(previous.attrs.d.to)[index][axis]) / 2));
  path.attrs.d = JSON.stringify(visible);
  vertices.forEach((vertex, index) => { [vertex.attrs.cx, vertex.attrs.cy] = visible[index]; });
  app.render(info(values(0.4)));
  assert.equal(path.attrs.d, JSON.stringify(visible));
  assert.notEqual(path.transitions.get("radar"), previous);
  assert.equal(path.transitions.get("radar").attrs.d.from, JSON.stringify(visible));
  vertices.forEach((vertex, index) => {
    const attrs = vertex.transitions.get("radar").attrs;
    assert.equal(attrs.cx.from, visible[index][0]);
    assert.equal(attrs.cy.from, visible[index][1]);
  });
});

test("node, metric mode, missing values and link cards release the old radar transitions", () => {
  for (const replacement of [
    info(values(0.6), { code: "B" }),
    info(values(0.6), { profile: "State & pressure", labels: ["S", "E", "I", "R", "XP"] }),
    info(null), { kind: "link", code: "A → B", rows: [] },
  ]) {
    const app = runtime();
    app.render(info(values(0.2)));
    app.render(info(values(0.8)));
    const svg = app.find("svg.custom-radar")[0], path = app.find("path.node-radar")[0];
    const vertices = app.find("circle.vertex");
    app.render(replacement);
    assert.ok(!app.find("svg.custom-radar").includes(svg));
    for (const node of [path, ...vertices]) assert.equal(node.transitions.size, 0);
    if (replacement.values) assert.equal(app.find("path.node-radar")[0].transitions.size, 0);
    else assert.equal(app.find("svg.custom-radar").length, 0);
  }
});

test("callout cleanup stops descendant animations and reduced motion removes their duration", () => {
  const app = runtime(true);
  app.render(info(values(0.2)));
  app.render(info(values(0.8)));
  const animated = app.find("path.node-radar, circle.vertex");
  for (const node of animated) assert.equal(node.transitions.get("radar").duration, 0);
  app.context.clearNetworkCallout();
  assert.equal(app.root.children.length, 0);
  for (const node of animated) assert.equal(node.transitions.size, 0);
});
