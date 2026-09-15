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

function selection(data = []) {
  return {
    elements: data.map((datum) => ({ datum, attrs: {} })),
    interruptions: [], transitions: new Map(), transitionCalls: [],
    attr(name, value) {
      this.elements.forEach((element) => {
        element.attrs[name] = typeof value === "function" ? value.call(element, element.datum) : value;
      });
      return this;
    },
    each(callback) {
      this.elements.forEach((element) => callback.call(element, element.datum));
      return this;
    },
    node() { return this.elements[0]; },
    interrupt(name) {
      this.interruptions.push(name);
      const transition = this.transitions.get(name);
      this.transitions.delete(name);
      transition?.end?.();
      return this;
    },
    transition(name) {
      const pending = {};
      this.transitions.set(name, pending);
      this.transitionCalls.push(name);
      const transition = {
        duration(value) { pending.duration = value; return this; },
        tween(key, factory) { pending.factory = factory; return this; },
        on(events, callback) { pending.end = callback; return this; },
      };
      return transition;
    },
    advance(name, time) {
      const pending = this.transitions.get(name);
      if (!pending) return;
      pending.tick ??= pending.factory();
      pending.tick(time);
      if (time === 1) {
        this.transitions.delete(name);
        pending.end?.();
      }
    },
  };
}

function runtime(mode = "map") {
  const allNodes = [
    { id: "A", x: 100, y: 200, vx: 2, vy: -4, fx: 100, fy: 200, r: 8, active: true },
    { id: "B", x: 600, y: 400, vx: -2, vy: 4, fx: null, fy: null, r: 12, active: true },
  ];
  const allLinks = [{ source: allNodes[0], target: allNodes[1], weight: 25, disabled: true }];
  const nodeEnter = selection(allNodes);
  const nodeGroup = selection([{}]);
  const labelSelection = selection(allNodes);
  const linkSelection = selection(allLinks);
  linkSelection.elements[0].attrs = { class: "linkSelectOut", display: "none", opacity: 0.5 };
  const nlMapData = { features: [{ id: "country", geometry: { coordinates: [[0, 0], [100, 100]] } }] };
  const nlLabelPoints = { features: [
    { properties: { statcode: "A" }, geometry: { coordinates: [25, 25] } },
    { properties: { statcode: "B" }, geometry: { coordinates: [75, 75] } },
  ] };
  const mapRegions = selection(nlMapData.features);
  const overlay = selection([{}]);
  const svg = selection([{}]);
  const calloutSvg = selection([{}]);
  svg.select = (selector) => { assert.equal(selector, "#mapOverlay"); return overlay; };
  svg.selectAll = (selector) => { assert.equal(selector, ".map-region"); return mapRegions; };
  const mapMounts = [];
  const annotations = [];
  const fits = [];
  const forceState = { x: 400, y: 300, running: mode === "graph", starts: 0, alpha: 0.1, target: 0 };
  const center = {
    x(value) { forceState.x = value; return this; },
    y(value) { forceState.y = value; return this; },
  };
  const forceSim = {
    force(name) { assert.equal(name, "center"); return center; },
    alpha(value) { forceState.alpha = value; return this; },
    alphaTarget(value) { forceState.target = value; return this; },
    restart() { forceState.running = true; forceState.starts += 1; return this; },
  };
  const context = vm.createContext({
    allNodes, allLinks, nodeEnter, nodeGroup, labelSelection, linkSelection, svg, calloutSvg,
    nlMapData, nlLabelPoints, forceSim, selectedNodeData: allNodes[0],
    hoveredNode: null, hoveredLink: null, annotationGroup: {},
    currentMode: mode, isMovingToMap: false, w: 800, h: 600,
    containerCol2: { clientWidth: 800, clientHeight: 600 },
    window: { isPlaying: true, currentDate: new Date("2020-04-01") },
    mapLayers: { mount: (value) => mapMounts.push(value) },
    updateAnnotationForNode: (node) => annotations.push({ type: "node", id: node.id, x: node.x, y: node.y, x0: node.x0, y0: node.y0 }),
    updateAnnotationForLink: (link) => annotations.push({ type: "link", source: link.source.id, target: link.target.id }),
    applySimulationMapPrevalence() {},
    d3: {
      geoIdentity() {
        let scale = 1, tx = 0, ty = 0;
        const projection = ([x, y]) => [tx + scale * x, ty - scale * y];
        projection.reflectY = (reflect) => { assert.equal(reflect, true); return projection; };
        projection.fitSize = ([width, height], geometry) => {
          assert.equal(geometry, nlMapData);
          fits.push([width, height]);
          scale = Math.min(width, height) / 100;
          tx = (width - scale * 100) / 2;
          ty = (height + scale * 100) / 2;
          return projection;
        };
        return projection;
      },
      geoPath: () => ({
        projection: (project) => (feature) => feature.geometry.coordinates.map(project).map((point) => point.join(",")).join(" "),
      }),
    },
  });
  vm.runInContext([
    "getAdjustedTarget", "getNetworkLinkPath", "getNetworkLinkArc", "renderGraphPositions", "updateMapPositionsWithTransition",
    "updateMapLayout", "resizeNetworkPanel",
  ].map(extractFunction).join("\n"), context);
  return {
    context, allNodes, allLinks, nodeEnter, nodeGroup, labelSelection, linkSelection, svg,
    overlay, mapRegions, mapMounts, annotations, fits, forceState,
    resize(width, height) {
      context.containerCol2.clientWidth = width;
      context.containerCol2.clientHeight = height;
      context.resizeNetworkPanel();
    },
  };
}

test("map resize keeps regions, routes, labels, focus and context layers aligned", () => {
  const app = runtime();
  const selected = app.context.selectedNodeData;
  const date = app.context.window.currentDate;
  app.context.hoveredLink = app.allLinks[0];
  app.resize(600, 900);

  assert.equal(app.svg.elements[0].attrs.viewBox, "0 0 600 900");
  assert.equal(app.context.calloutSvg.elements[0].attrs.viewBox, "0 0 600 900");
  assert.deepEqual(app.overlay.elements[0].attrs, { width: 600, height: 900 });
  assert.deepEqual(app.fits, [[600, 900]]);
  assert.equal(app.mapRegions.elements[0].attrs.d, "0,750 600,150");
  assert.deepEqual(app.allNodes.map(({ x, y, x0, y0 }) => [x, y, x0, y0]), [
    [150, 600, 150, 600], [450, 300, 450, 300],
  ]);
  assert.equal(app.nodeEnter.elements[0].attrs.transform, "translate(150,600)");
  assert.deepEqual(app.labelSelection.elements.map(({ attrs }) => [attrs.x, attrs.y]), [[150, 579], [450, 275]]);
  const path = app.linkSelection.elements[0].attrs.d;
  assert.ok(path.startsWith("M150,600A"));
  assert.ok(path.endsWith(`${450 - 17 / Math.sqrt(2)},${300 + 17 / Math.sqrt(2)}`));
  assert.equal(app.mapMounts.length, 1);
  assert.equal(app.mapMounts[0].width, 600);
  assert.equal(app.mapMounts[0].height, 900);
  assert.equal(app.mapMounts[0].geometry, app.context.nlMapData);
  assert.deepEqual(app.mapMounts[0].projection([25, 25]), [150, 600]);
  assert.deepEqual(app.annotations, [{ type: "link", source: "A", target: "B" }]);
  assert.equal(app.context.selectedNodeData, selected);
  assert.equal(app.context.window.currentDate, date);
  assert.equal(app.context.window.isPlaying, true);
  assert.equal(app.context.currentMode, "map");
  assert.equal(app.allLinks[0].disabled, true);
  assert.equal(app.allLinks[0].weight, 25);
  assert.deepEqual(app.linkSelection.elements[0].attrs, { class: "linkSelectOut", display: "none", opacity: 0.5, d: path });
  assert.equal(app.forceState.running, false);
  assert.equal(app.forceState.starts, 0);
  assert.deepEqual(app.nodeGroup.interruptions, ["map-position"]);
  for (const item of [app.nodeEnter, app.linkSelection, app.labelSelection]) {
    assert.deepEqual(item.interruptions, []);
  }
});

test("graph resize scales coordinates, velocities and held nodes before resuming layout", () => {
  const app = runtime("graph");
  const selected = app.context.selectedNodeData;
  app.resize(400, 900);
  assert.deepEqual(app.allNodes.map(({ x, y, vx, vy, fx, fy }) => [x, y, vx, vy, fx, fy]), [
    [50, 300, 1, -6, 50, 300], [300, 600, -1, 6, null, null],
  ]);
  assert.equal(app.nodeEnter.elements[0].attrs.transform, "translate(50,300)");
  assert.deepEqual(app.labelSelection.elements.map(({ attrs }) => [attrs.x, attrs.y]), [[50, 279], [300, 575]]);
  assert.ok(app.linkSelection.elements[0].attrs.d.startsWith("M50,300A"));
  assert.equal(app.forceState.x, 200);
  assert.equal(app.forceState.y, 450);
  assert.equal(app.forceState.running, true);
  assert.equal(app.forceState.starts, 1);
  assert.equal(app.forceState.target, 0);
  assert.equal(app.mapMounts.length, 0);
  assert.equal(app.context.selectedNodeData, selected);
  assert.equal(app.context.window.isPlaying, true);
  assert.equal(app.allLinks[0].disabled, true);
});

test("map date changes retain displayed positions when force nodes receive new data", () => {
  const app = runtime();
  app.nodeEnter.elements[0].attrs.transform = "translate(150,600)";
  app.nodeEnter.elements[1].attrs.transform = "translate(450,300)";
  app.context.d3.select = (element) => ({ attr: (name) => element.attrs[name] });
  app.context.updateMapPositionsWithTransition(true, true);
  assert.deepEqual(app.allNodes.map(({ x, y, x0, y0 }) => [x, y, x0, y0]), [
    [150, 600, 150, 600], [450, 300, 450, 300],
  ]);
  app.linkSelection.attr("d", app.context.getNetworkLinkPath);
  const path = app.linkSelection.elements[0].attrs.d;
  assert.ok(path.startsWith("M150,600A"));
  assert.ok(path.endsWith(`${450 - 17 / Math.sqrt(2)},${300 + 17 / Math.sqrt(2)}`));
});

test("one map tween keeps arrow clearance and callouts aligned as route directions change", () => {
  const app = runtime();
  const [source, target] = app.allNodes;
  Object.assign(source, { x: 200, y: 100 });
  Object.assign(target, { x: 400, y: 300, linkBoundaryRadius: 40 });
  app.context.hoveredLink = app.allLinks[0];
  app.context.hoveredNode = source;
  const destinations = new Map([[source.id, [600, 100]], [target.id, [400, 300]]]);
  app.context.updateMapPositionsWithTransition(false, false, destinations);
  assert.equal(app.context.isMovingToMap, true);
  assert.deepEqual(app.nodeGroup.transitionCalls, ["map-position"]);
  for (const item of [app.nodeEnter, app.linkSelection, app.labelSelection]) {
    assert.deepEqual(item.transitionCalls, []);
  }
  for (const time of [0.1, 0.25, 0.5, 0.75, 1]) {
    app.nodeGroup.advance("map-position", time);
    assert.equal(source.x, 200 + 400 * time);
    assert.equal(source.x0, source.x);
    assert.equal(source.y0, source.y);
    assert.equal(app.nodeEnter.elements[0].attrs.transform, `translate(${source.x},${source.y})`);
    assert.equal(app.labelSelection.elements[0].attrs.x, source.x);
    assert.equal(app.labelSelection.elements[0].attrs.y, source.y - source.r - 13);
    const arc = app.context.getNetworkLinkArc(app.linkSelection.elements[0].attrs.d);
    assert.ok(Math.abs(Math.hypot(arc.x2 - target.x, arc.y2 - target.y) - 44) < 1e-9);
  }
  assert.equal(app.context.isMovingToMap, false);
  assert.ok(app.annotations.every(({ type }) => type === "link"));
  app.context.hoveredLink = null;
  app.context.updateMapPositionsWithTransition(true, false, destinations);
  assert.equal(app.annotations.at(-1).id, source.id);
});

test("boundary refreshes during map movement use displayed coordinates and keep the refreshed radius", () => {
  const app = runtime();
  const [source, target] = app.allNodes;
  app.context.updateMapLayout();
  app.nodeGroup.advance("map-position", 0.3);
  const displayed = app.allNodes.map(({ x, y }) => [x, y]);
  app.nodeEnter.elements.forEach((element) => {
    element.querySelector = () => ({ getAttribute: () => element.datum.r });
    element.querySelectorAll = () => [];
  });
  target.r = 30;
  vm.runInContext(extractFunction("updateNetworkLinkBoundaries"), app.context);
  app.context.updateNetworkLinkBoundaries();
  assert.deepEqual(app.allNodes.map(({ x, y }) => [x, y]), displayed);
  const check = () => {
    const arc = app.context.getNetworkLinkArc(app.linkSelection.elements[0].attrs.d);
    assert.equal(arc.x1, source.x);
    assert.equal(arc.y1, source.y);
    assert.ok(Math.abs(Math.hypot(arc.x2 - target.x, arc.y2 - target.y) - 35) < 1e-9);
  };
  check();
  app.nodeGroup.advance("map-position", 0.7);
  check();
  app.nodeGroup.advance("map-position", 1);
  check();
});

test("an interrupted map move leaves nodes and arrows at their displayed positions", () => {
  const app = runtime();
  app.context.updateMapLayout();
  app.nodeGroup.advance("map-position", 0.4);
  const displayed = app.allNodes.map(({ x, y }) => [x, y]);
  const path = app.linkSelection.elements[0].attrs.d;
  app.nodeGroup.interrupt("map-position");
  assert.equal(app.context.isMovingToMap, false);
  app.nodeGroup.advance("map-position", 1);
  assert.deepEqual(app.allNodes.map(({ x, y }) => [x, y]), displayed);
  assert.equal(app.linkSelection.elements[0].attrs.d, path);

  app.context.updateMapLayout();
  assert.equal(app.context.isMovingToMap, true);
  app.resize(600, 900);
  assert.equal(app.context.isMovingToMap, false);
  assert.equal(app.nodeGroup.transitions.size, 0);
  assert.deepEqual(app.allNodes.map(({ x, y }) => [x, y]), [[150, 600], [450, 300]]);
});

test("graph positions and their annotation follow subsequent layout ticks", () => {
  const app = runtime("graph");
  app.resize(1000, 800);
  app.annotations.length = 0;
  app.allNodes[0].x = 240;
  app.allNodes[0].y = 320;
  app.context.renderGraphPositions();
  assert.equal(app.nodeEnter.elements[0].attrs.transform, "translate(240,320)");
  assert.deepEqual(app.annotations.at(-1), { type: "node", id: "A", x: 240, y: 320, x0: undefined, y0: undefined });
});

test("graph ticks show the hovered link before hovered or selected node annotations", () => {
  const app = runtime("graph");
  app.context.hoveredLink = app.allLinks[0];
  app.resize(400, 900);
  app.context.renderGraphPositions();
  assert.deepEqual(app.annotations, [
    { type: "link", source: "A", target: "B" },
    { type: "link", source: "A", target: "B" },
  ]);

  app.context.hoveredLink = null;
  app.context.hoveredNode = app.allNodes[1];
  app.context.renderGraphPositions();
  assert.equal(app.annotations.at(-1).id, "B");
  app.context.hoveredNode = null;
  app.context.renderGraphPositions();
  assert.equal(app.annotations.at(-1).id, "A");
});

function calloutContent(app) {
  const content = { radar: false, text: [], signature: undefined, present: false, redraws: 0, attrs: {} };
  const item = {
    append() { return this; }, attr() { return this; }, style() { return this; },
    text(value) { content.text.push(value); return this; },
  };
  const clear = () => { content.text = []; content.redraws += 1; };
  const contentLayer = {
    ...item, data() { return this; }, join() { return this; },
    selectAll(selector) { assert.equal(selector, "*"); return { remove: clear }; },
  };
  const card = {
    empty: () => !content.present,
    datum(value) {
      if (!arguments.length) return content.signature;
      content.signature = value;
      return this;
    },
    attr(name, value) { content.attrs[name] = value; return this; },
    classed() { return this; }, append() { return item; },
    selectAll(selector) { assert.equal(selector, "g.network-callout-content"); return contentLayer; },
  };
  const connector = { data() { return this; }, join() { return this; }, attr() { return this; } };
  const group = {
    select(selector) { assert.equal(selector, "g.network-hover-callout"); return card; },
    append(tag) { assert.equal(tag, "g"); content.present = true; return card; },
    selectAll(selector) {
      if (selector === "*") return {
        interrupt(name) { assert.equal(name, "radar"); return this; },
        remove() { clear(); content.radar = false; content.present = false; content.signature = undefined; },
      };
      assert.equal(selector, "path.network-callout-connector");
      return connector;
    },
    raise() { return this; },
  };
  Object.assign(app.context, {
    annotationGroup: group, hoveredLinkElement: null, isSimulationModeActive: () => false,
    getStatnaam: (id) => `Region ${id}`, formatCount: String, formatSmall: String,
    drawRadarChart(_card, info) { content.radar = info.kind === "node"; }, simulationCompartmentColors: { I: "red" },
  });
  vm.runInContext([
    "getNodeId", "formatPct", "clearNetworkCallout", "getNetworkCalloutPosition", "renderNetworkCallout", "updateAnnotationForLink",
  ].map(extractFunction).join("\n"), app.context);
  return { content, group };
}

test("link callouts replace node radar content on hover and after map or graph resize", () => {
  for (const mode of ["map", "graph"]) {
    const app = runtime(mode);
    const { content, group } = calloutContent(app);
    const nodeAnnotation = (node = app.allNodes[0]) => app.context.renderNetworkCallout(group, node.x, node.y, {
      kind: "node", code: node.id, name: "Region A", tag: "P1", rows: [],
    });
    app.context.updateAnnotationForNode = nodeAnnotation;
    nodeAnnotation();
    assert.equal(content.radar, true);
    app.context.updateAnnotationForLink(app.allLinks[0], group);
    assert.equal(content.radar, false);
    assert.ok(content.text.includes("A → B"));
    assert.ok(content.text.includes("Region A"));
    assert.ok(content.text.includes("Region B"));
    assert.ok(content.text.includes("Trade volume"));
    assert.ok(content.text.includes("25"));

    nodeAnnotation();
    app.context.hoveredLink = app.allLinks[0];
    app.resize(600, 900);
    assert.equal(content.radar, false);
    assert.equal(JSON.parse(content.signature).kind, "link");
    assert.equal(app.context.selectedNodeData.id, "A");
  }
});

test("callouts move with graph ticks while reusing unchanged content and refresh changed values", () => {
  const app = runtime("graph");
  const { content, group } = calloutContent(app);
  const link = app.allLinks[0];
  app.context.updateAnnotationForLink(link, group);
  const redraws = content.redraws, transform = content.attrs.transform;
  link.source.x += 40;
  link.source.y += 60;
  app.context.updateAnnotationForLink(link, group);
  assert.equal(content.redraws, redraws);
  assert.notEqual(content.attrs.transform, transform);
  link.weight = 50;
  app.context.updateAnnotationForLink(link, group);
  assert.equal(content.redraws, redraws + 1);
  assert.ok(content.text.includes("50"));
  assert.ok(!content.text.includes("25"));

  app.context.isSimulationModeActive = () => true;
  link.simulation = { ledgerWeight: 0, sourcePrevalence: 0.2, targetPrevalence: 0.05 };
  link.ledgerWeight = 80;
  app.context.updateAnnotationForLink(link, group);
  const info = JSON.parse(content.signature);
  assert.equal(info.heroLabel, "Exposure load");
  assert.deepEqual(info.rows.map(({ value }) => value), ["0", "20.0%", "5.00%"]);
});

test("callouts clear invalid coordinates and degenerate links", () => {
  const app = runtime("graph");
  const { content, group } = calloutContent(app);
  const link = app.allLinks[0];
  for (const x of [NaN, Infinity, -Infinity]) {
    app.context.updateAnnotationForLink(link, group);
    assert.equal(content.present, true);
    app.context.renderNetworkCallout(group, x, 200, { kind: "node" });
    assert.equal(content.present, false);
    assert.equal(content.text.length, 0);
  }
  app.context.updateAnnotationForLink(link, group);
  link.target.x = link.source.x;
  link.target.y = link.source.y;
  app.context.updateAnnotationForLink(link, group);
  assert.equal(content.present, false);
  assert.equal(content.text.length, 0);
});

test("callout placement keeps full cards inside the panel at every edge", () => {
  const context = vm.createContext({});
  vm.runInContext(extractFunction("getNetworkCalloutPosition"), context);
  for (const [panelWidth, panelHeight] of [[400, 540], [800, 600], [1200, 1000]]) {
    for (const [width, height] of [[270, 309], [270, 368], [296, 239]]) {
      for (const x of [0, panelWidth / 2, panelWidth]) {
        for (const y of [0, panelHeight / 2, panelHeight]) {
          const position = context.getNetworkCalloutPosition(x, y, width, height, panelWidth, panelHeight);
          assert.ok(position.x >= 12 && position.x + width <= panelWidth - 12);
          assert.ok(position.y >= 12 && position.y + height <= panelHeight - 12);
        }
      }
    }
  }
  const above = context.getNetworkCalloutPosition(218, 450, 270, 368, 436, 728);
  const below = context.getNetworkCalloutPosition(218, 200, 270, 368, 436, 728);
  assert.ok(above.y + 368 < 450);
  assert.ok(below.y > 200);
});

test("small graph bounds keep inactive nodes and route endpoints inside the panel", () => {
  const app = runtime("graph");
  app.allNodes[0].active = false;
  app.resize(200, 200);
  assert.equal(app.allNodes[0].x, 100);
  assert.equal(app.allNodes[0].y, 100);
  assert.equal(app.nodeEnter.elements[0].attrs.transform, "translate(100,100)");
  assert.ok(app.linkSelection.elements[0].attrs.d.startsWith("M100,100A"));
  for (const node of app.allNodes) {
    assert.ok(node.x >= 0 && node.x <= 200 && node.y >= 0 && node.y <= 200);
  }
});

test("zero sizes are ignored and restored dimensions resize only once", () => {
  const app = runtime();
  app.resize(800, 600);
  app.resize(0, 600);
  app.resize(800, 0);
  assert.equal(app.mapMounts.length, 0);
  assert.equal(app.context.w, 800);
  assert.equal(app.context.h, 600);
  assert.equal(app.svg.elements[0].attrs.viewBox, undefined);

  app.resize(900, 700);
  app.resize(900, 700);
  assert.equal(app.mapMounts.length, 1);
  assert.equal(app.svg.elements[0].attrs.viewBox, "0 0 900 700");
});

test("resizing while a dataset loads records dimensions without drawing the cleared network", () => {
  for (const mode of ["map", "graph"]) {
    const app = runtime(mode);
    const positions = app.allNodes.map(({ x, y }) => [x, y]);
    app.context.linkSelection = null;
    app.forceState.running = false;
    app.resize(600, 900);

    assert.equal(app.context.w, 600);
    assert.equal(app.context.h, 900);
    assert.equal(app.svg.elements[0].attrs.viewBox, "0 0 600 900");
    assert.equal(app.context.calloutSvg.elements[0].attrs.viewBox, "0 0 600 900");
    assert.deepEqual(app.allNodes.map(({ x, y }) => [x, y]), positions);
    assert.equal(app.mapMounts.length, 0);
    assert.equal(app.annotations.length, 0);
    assert.equal(app.forceState.running, false);
    assert.equal(app.forceState.starts, 0);
    assert.equal(app.nodeEnter.elements[0].attrs.transform, undefined);
    assert.equal(app.labelSelection.elements[0].attrs.x, undefined);
    assert.equal(app.linkSelection.elements[0].attrs.d, undefined);

    app.context.linkSelection = app.linkSelection;
    app.context.updateMapLayout(true);
    assert.deepEqual(app.fits, [[600, 900]]);
    assert.deepEqual(app.allNodes.map(({ x, y }) => [x, y]), [[150, 600], [450, 300]]);
  }
});

test("resizing before data loads records usable dimensions without drawing", () => {
  const app = runtime();
  app.context.forceSim = null;
  app.context.nlMapData = null;
  app.context.nlLabelPoints = null;
  app.resize(500, 700);
  assert.equal(app.context.w, 500);
  assert.equal(app.context.h, 700);
  assert.equal(app.svg.elements[0].attrs.viewBox, "0 0 500 700");
  assert.equal(app.mapMounts.length, 0);
  assert.equal(app.annotations.length, 0);
  assert.equal(app.forceState.starts, 0);
});
