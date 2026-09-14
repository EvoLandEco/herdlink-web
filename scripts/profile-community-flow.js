import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const d3Path = process.argv[2];
assert.ok(d3Path, 'Usage: node scripts/profile-community-flow.js /path/to/d3.min.js');
const source = readFileSync(new URL('src/runtime/herdlink-runtime.js', root), 'utf8');
const context = vm.createContext({ Map, Set, communityFlowGeometry: null });
vm.runInContext(readFileSync(new URL('src/runtime/jLouvain.js', root), 'utf8'), context);
vm.runInContext(readFileSync(d3Path, 'utf8'), context);
for (const name of ['getNodeId', 'computeModularity', 'buildCommunityFlowData', 'getCommunityFlowGeometry']) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, 'm'));
  assert.ok(match, name);
  vm.runInContext(match[0], context);
}
const renderer = source.match(/^([ ]*)function renderCommunityFlowPanel\([^]*?^\1}/m)[0];
const pathCallback = renderer.match(/\.attr\("d", \(flow\) => \{([^]*?)\n\s+\}\)\n\s+\.attr\("stroke"/)[1];
const pathSetup = ['const point =', 'const line =', 'const halfStep =', 'const portAngle ='].map((prefix) =>
  renderer.split('\n').find((line) => line.trim().startsWith(prefix))).join('\n');
vm.runInContext(`function makeFlowPaths(data, geometry, radius) { ${pathSetup}
  return data.flows.map((flow) => { ${pathCallback} });
}`, context);
const ids = Array.from({ length: 40 }, (_, i) => `CR${String(i + 1).padStart(2, '0')}`);
const summarize = (values) => {
  values.sort((a, b) => a - b);
  return { medianMs: +values[500].toFixed(3), p95Ms: +values[950].toFixed(3) };
};
const report = { scope: 'Data assembly, cached D3 geometry lookup and the renderer path callback. Excludes SVG DOM, style, layout and painting. Radius 120 px; 100 warmups and 1000 measured samples.', node: process.version, d3: context.d3.version, datasets: [] };
for (const name of ['daily', 'weekly', 'monthly', 'yearly']) {
  const rows = readFileSync(new URL(`src/assets/data/${name}_aggregation.csv`, root), 'utf8').trim().split(/\r?\n/).slice(1);
  const dates = new Map();
  const aggregate = new Map();
  for (const row of rows) {
    const [, date, source, target, value] = row.replaceAll('"', '').split(',');
    const weight = +value;
    if (!ids.includes(source) || !ids.includes(target) || !Number.isFinite(weight) || weight <= 0) continue;
    if (!dates.has(date)) dates.set(date, []);
    dates.get(date).push({ source, target, weight });
    const key = JSON.stringify([source, target]);
    const edge = aggregate.get(key);
    if (edge) edge.weight += weight;
    else aggregate.set(key, { source, target, weight });
  }
  const partition = context.computeModularity(ids.map((id) => ({ id })), [...aggregate.values()], 1.5).partition;
  const [date, links] = [...dates].sort((a, b) => b[1].length - a[1].length)[0];
  const original = context.buildCommunityFlowData(ids, partition, links);
  const originalGeometry = context.getCommunityFlowGeometry(original.groups, partition);
  const originalAngles = JSON.stringify([...originalGeometry.nodesById].map(([id, node]) => [id, node.x, node.y]));
  const originalPaths = context.makeFlowPaths(original, originalGeometry, 120);
  const numeric = (path) => path.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi).map(Number);
  for (const path of originalPaths) {
    assert.match(path, /^M/);
    assert.ok(!/NaN|Infinity|undefined/.test(path));
    assert.ok(numeric(path).every(Number.isFinite));
  }
  const byRoute = new Map(original.flows.map((flow, index) => [flow.key, numeric(originalPaths[index])]));
  let reciprocalChecks = 0;
  for (const flow of original.flows) {
    if (flow.source === flow.target) continue;
    const reverse = byRoute.get(JSON.stringify([flow.target, flow.source]));
    if (!reverse) continue;
    const forward = byRoute.get(flow.key);
    assert.ok(Math.hypot(forward[0] - reverse.at(-2), forward[1] - reverse.at(-1)) > 1e-6);
    reciprocalChecks++;
  }
  const snapshot = JSON.stringify(original.nodes.map(({id, key}) => ({id, key})));
  const times = [], pathTimes = [], combinedTimes = [];
  for (let i = -100; i < 1000; i++) {
    const start = performance.now();
    const data = context.buildCommunityFlowData(ids, partition, links);
    const elapsed = performance.now() - start;
    const geometryStart = performance.now();
    const geometry = context.getCommunityFlowGeometry(data.groups, partition);
    const paths = context.makeFlowPaths(data, geometry, 120);
    const geometryEnd = performance.now();
    if (i >= 0) {
      times.push(elapsed);
      pathTimes.push(geometryEnd - geometryStart);
      combinedTimes.push(geometryEnd - start);
    }
    assert.equal(geometry, originalGeometry);
    assert.equal(paths.length, original.flows.length);
    assert.equal(data.nodes.length, 40);
    assert.equal(data.flows.length, original.flows.length);
  }
  for (const links of dates.values()) {
    assert.equal(JSON.stringify(context.buildCommunityFlowData(ids, partition, links).nodes.map(({id, key}) => ({id, key}))), snapshot);
  }
  assert.equal(JSON.stringify([...originalGeometry.nodesById].map(([id, node]) => [id, node.x, node.y])), originalAngles);
  report.datasets.push({ dataset: name, date, routes: original.flows.length, groups: original.groups.length,
    allDatesStable: dates.size, reciprocalPortsChecked: reciprocalChecks,
    data: summarize(times), cachedGeometryAndPaths: summarize(pathTimes), combined: summarize(combinedTimes) });
}
console.log(JSON.stringify(report, null, 2));
