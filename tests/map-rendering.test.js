import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { censusValue, wmtsTiles } from "../src/mapLayers.js";

const source = readFileSync(new URL("../src/mapLayers.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`^  (?:async )?function ${name}\\([^]*?^  }`, "m"))[0];

test("map backgrounds share parsed capabilities across concurrent views and release failed requests", async () => {
  let requests = 0;
  let parses = 0;
  let rejectRequest = false;
  const context = vm.createContext({
    capabilityCache: new Map(), backgrounds: { light: { url: "light", layer: "grey" } }, wmtsTiles,
    fetchAsset: async () => { requests++; if (rejectRequest) throw new Error("Unavailable"); return "capabilities"; },
    readWMTS: () => {
      parses++;
      return { template: "tiles/{TileMatrix}/{TileRow}/{TileCol}", matrices: [
        { id: "0", resolution: 1, origin: [0, 512], tileWidth: 256, tileHeight: 256, width: 2, height: 2 },
      ] };
    },
    imageData: async (url) => url,
  });
  vm.runInContext(extract("loadBackground"), context);
  const projection = { scale: () => 1, invert: ([x, y]) => [x, 512 - y] };
  const [first, second] = await Promise.all([
    context.loadBackground("light", projection, 256, 256),
    context.loadBackground("light", projection, 512, 512),
  ]);
  assert.equal(first.length, 1);
  assert.equal(second.length, 4);
  assert.equal(requests, 1);
  assert.equal(parses, 1);
  await context.loadBackground("light", projection, 256, 512);
  assert.equal(requests, 1);
  context.capabilityCache.clear();
  rejectRequest = true;
  await assert.rejects(context.loadBackground("light", projection, 256, 256), /Unavailable/);
  assert.equal(context.capabilityCache.size, 0);
  rejectRequest = false;
  assert.equal((await context.loadBackground("light", projection, 256, 256)).length, 1);
  assert.equal(requests, 3);
});

function select(nodes, parent) {
  return {
    node: () => nodes[0],
    selectAll(selector) {
      const children = nodes.flatMap((node) => node.children || []);
      return select(children.filter((child) => selector.startsWith(".")
        ? child.attrs.class?.split(" ").includes(selector.slice(1)) : child.tag === selector), nodes[0]);
    },
    attr(name, value) {
      nodes.forEach((node, index) => { node.attrs[name] = typeof value === "function" ? value(node.data, index) : value; });
      return this;
    },
    each(callback) { nodes.forEach((node, index) => callback.call(node, node.data, index)); return this; },
    append(tag) {
      return select(nodes.map((node) => {
        const child = { tag, attrs: {}, children: [], data: node.data };
        (node.enterParent || node).children.push(child);
        return child;
      }));
    },
    data(values, key = (_, index) => index) {
      const matched = values.map((value, index) => nodes.find((node, nodeIndex) => key(node.data, nodeIndex) === key(value, index)));
      return { join(type) {
        parent.children = parent.children.filter((node) => !nodes.includes(node) || matched.includes(node));
        const retained = [...parent.children];
        const entering = select(values.flatMap((value, index) => matched[index] ? [] : [{ data: value, enterParent: parent }]));
        if (typeof type === "function") type(entering);
        else entering.append(type);
        const added = parent.children.filter((node) => !retained.includes(node));
        return select(values.map((value, index) => {
          const node = matched[index] || added.shift();
          node.data = value;
          return node;
        }));
      } };
    },
  };
}

test("map layer edits retain projected geometry and keep density domains tied to their census", async () => {
  const root = { attrs: {}, children: [], isConnected: true };
  const overlays = [{ id: "water", file: "water" }, { id: "roads", file: "roads" }];
  const controls = { water: { checked: true }, roads: { checked: false } };
  const drawn = [];
  let scaleCount = 0;
  let census = { years: { 2020: { CR01: { pigsPerKm2: 12, holdingsPerKm2: 3 } } } };
  const context = vm.createContext({
    context: { group: select([root]), width: 512, height: 512, path: "projection" },
    overlays, document: { getElementById: (id) => controls[id] },
    background: { value: "plain" }, fill: { value: "pigs" }, opacity: { value: "55" },
    census: null, censusValue, densityScales: new Map(), generation: 0, pending: null,
    geographyPath: "layers/", status: {}, svg: { selectAll: () => ({ remove() {} }) },
    loadBackground: async () => [],
    fetchAsset: async (url) => url.endsWith("pig-census.json") ? census : { file: url },
    drawOverlay(group, layer, data, path) { drawn.push({ node: group.node(), id: layer.id, data, path }); },
    refreshRegions() {}, drawLegend() {}, showError: (error) => assert.fail(error.message),
    d3: {
      select: (node) => select([node]), max: (values) => Math.max(...values), interpolateRgb() {},
      scaleSequential: () => { scaleCount++; return { domain: (range) => range }; },
    },
  });
  vm.runInContext(`${extract("render")}\n${extract("densityScale")}`, context);
  const render = async () => { context.render(); await context.pending; };
  await render();
  assert.equal(drawn.length, 1);
  const water = drawn[0].node;
  assert.equal(drawn[0].data.file, "layers/water.geojson");
  assert.equal(context.densityScale()[1], 12);
  assert.equal(context.densityScale()[1], 12);
  assert.equal(scaleCount, 1);
  context.fill.value = "holdings";
  await render();
  assert.equal(drawn.length, 1);
  assert.equal(context.densityScale()[1], 3);
  controls.roads.checked = true;
  await render();
  assert.deepEqual(drawn.map(({ id }) => id), ["water", "roads"]);
  assert.equal(drawn[0].node, water);
  census = { years: { 2021: { CR01: { pigsPerKm2: 20, holdingsPerKm2: 7 } } } };
  await render();
  assert.equal(drawn.length, 2);
  assert.equal(context.densityScale()[1], 7);
  controls.water.checked = false;
  await render();
  controls.water.checked = true;
  await render();
  assert.deepEqual(drawn.map(({ id }) => id), ["water", "roads", "water"]);
  assert.notEqual(drawn[2].node, water);
});
