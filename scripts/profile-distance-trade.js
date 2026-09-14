import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const runtimePath = "src/runtime/herdlink-runtime.js";
const baselineRef = process.argv[2] || "e9ca16af4f76194273c4b68bf095108c52718bda";
const source = readFileSync(new URL(runtimePath, root), "utf8");
const baselineSource = execFileSync("git", ["show", `${baselineRef}:${runtimePath}`], {
  cwd: root, encoding: "utf8",
});
function extract(text, name, globals = {}) {
  const match = text.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  if (!match) return null;
  const context = vm.createContext(globals);
  vm.runInContext(match[0], context);
  return context[name];
}
const baseline = extract(baselineSource, "computeGravityRegression");
assert.ok(baseline, "The baseline revision must contain computeGravityRegression");
const kernel = extract(source, "computeDistanceTradeFit");
const predict = extract(source, "evaluateDistanceTradeLog");
const confidence = extract(source, "computeDistanceTradeConfidence", { evaluateDistanceTradeLog: predict });
const geography = JSON.parse(readFileSync(new URL(
  "src/assets/files/herdlink/nl_corop_labelpoint.geojson", root,
), "utf8"));
const coordinates = new Map(geography.features.map((feature) => [
  feature.properties.statcode, feature.geometry.coordinates,
]));
const regions = [...coordinates.keys()].sort();
const workloads = [];

for (const aggregation of ["daily", "weekly", "monthly", "yearly"]) {
  const lines = readFileSync(new URL(`src/assets/data/${aggregation}_aggregation.csv`, root), "utf8")
    .trim().split(/\r?\n/);
  assert.equal(lines.shift(), '"","time","COROP_LEV","COROP_AFN","AANTAL"');
  const dates = new Map();
  for (const line of lines) {
    const [, time, sourceId, targetId, quantity] = line.replaceAll('"', "").split(",");
    const weight = Number(quantity);
    if (!coordinates.has(sourceId) || !coordinates.has(targetId) || !Number.isFinite(weight)) continue;
    if (!dates.has(time)) dates.set(time, []);
    dates.get(time).push({ sourceId, targetId, weight });
  }
  const ordered = [...dates.keys()].sort();
  const busiest = ordered.reduce((a, b) => dates.get(a).length >= dates.get(b).length ? a : b);
  const selected = [...new Set([ordered[0], ordered[Math.floor(ordered.length / 2)], ordered.at(-1), busiest])];
  for (const date of selected) {
    const totals = new Map(regions.map((id) => [id, 0]));
    const routes = new Map();
    const records = dates.get(date);
    for (const { sourceId, targetId, weight } of records) {
      totals.set(sourceId, totals.get(sourceId) + weight);
      totals.set(targetId, totals.get(targetId) + weight);
      if (sourceId === targetId || weight <= 0) continue;
      const key = `${sourceId}:${targetId}`;
      if (!routes.has(key)) routes.set(key, { sourceId, targetId, weight: 0 });
      routes.get(key).weight += weight;
    }
    const points = [...routes.values()].map((route) => {
      const [sx, sy] = coordinates.get(route.sourceId);
      const [tx, ty] = coordinates.get(route.targetId);
      return {
        ...route, distance: Math.hypot(sx - tx, sy - ty) / 1000,
        massProduct: totals.get(route.sourceId) * totals.get(route.targetId),
      };
    });
    assert.ok(points.every((point) => point.distance > 0 && point.massProduct > 0));
    workloads.push({ aggregation, date, panel: "network", csvRows: records.length, datasets: [points] });
    for (const region of regions) {
      const outgoing = points.filter((point) => point.sourceId === region);
      const incoming = points.filter((point) => point.targetId === region);
      workloads.push({ aggregation, date, panel: region, csvRows: records.length,
        datasets: [[...outgoing, ...incoming], outgoing, incoming] });
    }
  }
}

const rounds = 15;
function summarize(values) {
  values.sort((a, b) => a - b);
  return {
    medianMs: +values[Math.floor(values.length / 2)].toFixed(4),
    p95Ms: +values[Math.ceil(values.length * 0.95) - 1].toFixed(4),
    maxMs: +values.at(-1).toFixed(4),
  };
}
function benchmark(fit) {
  const samples = { network: [], focus: [] };
  for (let round = -3; round < rounds; round++) {
    for (const workload of workloads) {
      const start = performance.now();
      for (const data of workload.datasets) fit(data);
      const duration = performance.now() - start;
      if (round >= 0) samples[workload.panel === "network" ? "network" : "focus"].push(duration);
    }
  }
  return Object.fromEntries(Object.entries(samples).map(([panel, times]) => [panel, summarize(times)]));
}
function powerLawSse(data) {
  if (data.length < 2) return NaN;
  const logs = data.map(({ distance, weight }) => [Math.log(distance), Math.log(weight)]);
  const xMean = logs.reduce((sum, [x]) => sum + x, 0) / logs.length;
  const yMean = logs.reduce((sum, [, y]) => sum + y, 0) / logs.length;
  const variance = logs.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0);
  if (!variance) return NaN;
  const slope = logs.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0) / variance;
  return logs.reduce((sum, [x, y]) => sum + (y - yMean - slope * (x - xMean)) ** 2, 0);
}

const report = {
  node: process.version,
  cpu: cpus()[0].model,
  baselineCommit: execFileSync("git", ["rev-parse", baselineRef], { cwd: root, encoding: "utf8" }).trim(),
  rounds,
  warmupRounds: 3,
  timingUnit: "milliseconds per panel; focus panel includes all, outgoing and incoming fits",
  timingScope: "Fitter calls only; excludes CSV parsing, route assembly, curve sampling and DOM rendering",
  dates: workloads.filter(({ panel }) => panel === "network").map(({ aggregation, date, csvRows, datasets }) => ({
    aggregation, date, csvRows, routes: datasets[0].length,
  })),
  baseline: benchmark(baseline),
};
if (kernel) {
  assert.ok(predict, "The kernel must provide evaluateDistanceTradeLog");
  report.kernel = benchmark(kernel);
  if (confidence) {
    const samples = [];
    const combinedSamples = [];
    const availability = [];
    for (const workload of workloads.filter(({ panel }) => panel === "network")) {
      const data = workload.datasets[0];
      const model = kernel(data);
      const distances = Array.from({ length: 65 }, (_, i) =>
        i === 0 ? model.distanceMin : i === 64 ? model.distanceMax
          : Math.exp(Math.log(model.distanceMin) + Math.log(model.distanceMax / model.distanceMin) * i / 64),
      );
      const band = confidence(data, model, distances);
      availability.push({ aggregation: workload.aggregation, date: workload.date,
        fit: model.status, band: band.status, reason: band.reason, regions: band.regions });
      for (let round = -3; round < rounds; round++) {
        let start = performance.now();
        confidence(data, model, distances);
        if (round >= 0) samples.push(performance.now() - start);
        start = performance.now();
        confidence(data, kernel(data), distances);
        if (round >= 0) combinedSamples.push(performance.now() - start);
      }
    }
    report.networkConfidence = {
      timingScope: "Analytical covariance and 65 confidence intervals; excludes SVG rendering",
      bandOnly: summarize(samples), fitAndBand: summarize(combinedSamples), availability,
    };
  }
  const statuses = {};
  const comparisons = {};
  for (const workload of workloads) {
    const key = `${workload.aggregation}:${workload.panel === "network" ? "network" : "focus"}`;
    statuses[key] ??= {};
    for (const data of workload.datasets) {
      const fit = kernel(data);
      statuses[key][fit.status] = (statuses[key][fit.status] || 0) + 1;
      if (!["fit", "power-law-limit", "exponential-limit"].includes(fit.status)) continue;
      const kernelSse = data.reduce((sum, { distance, weight }) =>
        sum + (Math.log(weight) - predict(fit, distance)) ** 2, 0);
      assert.ok(Math.abs(kernelSse - fit.logRmse ** 2 * fit.n) <= 1e-10 * Math.max(1, kernelSse));
      const linearSse = powerLawSse(data);
      if (linearSse > 0 && Number.isFinite(linearSse)) {
        comparisons[fit.status] ??= [];
        comparisons[fit.status].push(100 * (linearSse - kernelSse) / linearSse);
      }
    }
  }
  report.statuses = statuses;
  report.logSseImprovementPercent = Object.fromEntries(Object.entries(comparisons).map(([status, values]) => {
    values.sort((a, b) => a - b);
    return [status, { fits: values.length, median: values[Math.floor(values.length / 2)],
      min: values[0], max: values.at(-1) }];
  }));
} else {
  report.kernel = "computeDistanceTradeFit is absent";
}
console.log(JSON.stringify(report, null, 2));
