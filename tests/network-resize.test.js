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
    interruptions: [],
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
    interrupt(name) { this.interruptions.push(name); return this; },
  };
}

function runtime(mode = "map") {
  const allNodes = [
    { id: "A", x: 100, y: 200, vx: 2, vy: -4, fx: 100, fy: 200, r: 8, active: true },
    { id: "B", x: 600, y: 400, vx: -2, vy: 4, fx: null, fy: null, r: 12, active: true },
  ];
  const allLinks = [{ source: allNodes[0], target: allNodes[1], weight: 25, disabled: true }];
  const nodeEnter = selection(allNodes);
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
    allNodes, allLinks, nodeEnter, labelSelection, linkSelection, svg,
    nlMapData, nlLabelPoints, forceSim, selectedNodeData: allNodes[0],
    hoveredNode: null, hoveredLink: null, annotationGroup: {},
    currentMode: mode, w: 800, h: 600,
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
    "getAdjustedTarget", "renderGraphPositions", "updateMapPositionsWithTransition",
    "updateMapLayout", "resizeNetworkPanel",
  ].map(extractFunction).join("\n"), context);
  return {
    context, allNodes, allLinks, nodeEnter, labelSelection, linkSelection, svg,
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
  assert.ok(path.endsWith(`${450 - 12 / Math.sqrt(2)},${300 + 12 / Math.sqrt(2)}`));
  assert.equal(app.mapMounts.length, 1);
  assert.equal(app.mapMounts[0].width, 600);
  assert.equal(app.mapMounts[0].height, 900);
  assert.equal(app.mapMounts[0].geometry, app.context.nlMapData);
  assert.deepEqual(app.mapMounts[0].projection([25, 25]), [150, 600]);
  assert.deepEqual(app.annotations, [
    { type: "node", id: "A", x: 150, y: 600, x0: 150, y0: 600 },
    { type: "link", source: "A", target: "B" },
  ]);
  assert.equal(app.context.selectedNodeData, selected);
  assert.equal(app.context.window.currentDate, date);
  assert.equal(app.context.window.isPlaying, true);
  assert.equal(app.context.currentMode, "map");
  assert.equal(app.allLinks[0].disabled, true);
  assert.equal(app.allLinks[0].weight, 25);
  assert.deepEqual(app.linkSelection.elements[0].attrs, { class: "linkSelectOut", display: "none", opacity: 0.5, d: path });
  assert.equal(app.forceState.running, false);
  assert.equal(app.forceState.starts, 0);
  for (const item of [app.nodeEnter, app.linkSelection, app.labelSelection]) {
    assert.deepEqual(item.interruptions, ["map-position"]);
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

test("link annotations remove node radar content on hover and after map or graph resize", () => {
  for (const mode of ["map", "graph"]) {
    const app = runtime(mode);
    const content = { radar: null, axisLabels: [], note: null };
    const styleSelection = selection([]);
    const annotationGroup = {
      selectAll(selector) {
        return selector === "svg.custom-radar"
          ? { remove() { content.radar = null; } }
          : styleSelection;
      },
      call(generator) { generator(); return this; },
      raise() { return this; },
    };
    const nodeAnnotation = () => {
      content.radar = {};
      content.axisLabels = ["ID", "OD", "BT", "PR", "EC"];
    };
    app.context.annotationGroup = annotationGroup;
    app.context.updateAnnotationForNode = nodeAnnotation;
    Object.assign(app.context, {
      theme: {}, linkAnnoType: {},
      isSimulationModeActive: () => false,
      getStatnaam: (id) => `Region ${id}`,
    });
    app.context.d3.select = (selector) => {
      assert.equal(selector, "#radial-labels-container");
      return { selectAll(selector) {
        assert.equal(selector, ".radial-axis-label");
        return { remove() { content.axisLabels = []; } };
      } };
    };
    app.context.d3.annotation = () => {
      let note;
      const generator = () => {
        assert.equal(content.radar, null);
        assert.deepEqual(content.axisLabels, []);
        content.note = note;
      };
      generator.type = () => generator;
      generator.notePadding = () => generator;
      generator.annotations = (annotations) => { note = annotations[0].note; return generator; };
      return generator;
    };
    vm.runInContext([
      "getAnnotationOffsetNoXDefault", "updateAnnotationForLink",
    ].map(extractFunction).join("\n"), app.context);

    nodeAnnotation();
    app.context.updateAnnotationForLink(app.allLinks[0], annotationGroup);
    assert.equal(content.radar, null);
    assert.deepEqual(content.axisLabels, []);
    assert.equal(content.note.title, "Region A → Region B");
    assert.equal(content.note.label, "Trade volume: 25");

    nodeAnnotation();
    app.context.hoveredLink = app.allLinks[0];
    app.resize(600, 900);
    assert.equal(content.radar, null);
    assert.deepEqual(content.axisLabels, []);
    assert.equal(content.note.title, "Region A → Region B");
    assert.equal(app.context.selectedNodeData.id, "A");
  }
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
