import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const runtimePath = "src/runtime/herdlink-runtime.js";
const reference = process.argv[2] || "HEAD";
const rounds = 3;
const warmups = 5;
const names = [
  "getNodeId", "buildAdjList", "getStronglyConnectedComponents", "computePerronPair",
  "computePerronRoot", "computeSpectralRadius", "computeEigenvectorCentrality", "computeHotSpotMetrics",
];

function runtime(source) {
  const context = vm.createContext({});
  vm.runInContext(names.map((name) => {
    const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
    assert.ok(match, name);
    return match[0];
  }).join("\n"), context);
  return context;
}

const contexts = {
  reference: runtime(execFileSync("git", ["show", `${reference}:${runtimePath}`], {
    cwd: root, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  })),
  workingTree: runtime(readFileSync(new URL(runtimePath, root), "utf8")),
};
const nodes = Array.from({ length: 40 }, (_, index) => ({ id: `CR${String(index + 1).padStart(2, "0")}` }));
const nodeIds = new Set(nodes.map(({ id }) => id));

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
    p95Ms: +sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3),
  };
}

const report = {
  node: process.version,
  cpu: cpus()[0].model,
  referenceCommit: execFileSync("git", ["rev-parse", reference], { cwd: root, encoding: "utf8" }).trim(),
  rounds, warmups,
  timingScope: "All supplied domestic dates. Hotspot metrics include exact weighted betweenness, PageRank and symmetric eigenvector centrality. CSV parsing, assertions and rendering are outside the timed calls.",
  datasets: [],
};

for (const aggregation of ["daily", "weekly", "monthly", "yearly"]) {
  const lines = readFileSync(new URL(`src/assets/data/${aggregation}_aggregation.csv`, root), "utf8")
    .trim().split(/\r?\n/);
  assert.equal(lines.shift(), '"","time","COROP_LEV","COROP_AFN","AANTAL"');
  const dates = new Map();
  for (const line of lines) {
    const [, date, source, target, quantity] = line.replaceAll('"', "").split(",");
    const weight = Number(quantity);
    if (!nodeIds.has(source) || !nodeIds.has(target) || !Number.isFinite(weight) || weight <= 0) continue;
    if (!dates.has(date)) dates.set(date, []);
    dates.get(date).push({ source, target, weight });
  }
  const busiest = [...dates.values()].reduce((a, b) => a.length >= b.length ? a : b);
  for (let warmup = 0; warmup < warmups; warmup++) {
    for (const context of Object.values(contexts)) {
      context.computeHotSpotMetrics(nodes, busiest);
      context.computeSpectralRadius(nodes, busiest);
    }
  }

  const samples = Object.fromEntries(Object.keys(contexts).map((key) => [key, {
    hotspots: [], spectralRadius: [], hotspotPasses: [], spectralPasses: [],
  }]));
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 ? Object.keys(contexts).reverse() : Object.keys(contexts);
    const totals = Object.fromEntries(order.map((key) => [key, { hotspots: 0, spectralRadius: 0 }]));
    for (const links of dates.values()) {
      const results = {};
      for (const key of order) {
        const context = contexts[key];
        let start = performance.now();
        const hotspots = context.computeHotSpotMetrics(nodes, links);
        const hotspotTime = performance.now() - start;
        start = performance.now();
        const spectralRadius = context.computeSpectralRadius(nodes, links);
        const spectralTime = performance.now() - start;
        samples[key].hotspots.push(hotspotTime);
        samples[key].spectralRadius.push(spectralTime);
        totals[key].hotspots += hotspotTime;
        totals[key].spectralRadius += spectralTime;
        results[key] = { hotspots, spectralRadius };
      }
      assert.equal(JSON.stringify(results.workingTree), JSON.stringify(results.reference),
        `${aggregation} analytical results agree for each recorded date`);
    }
    for (const key of order) {
      samples[key].hotspotPasses.push(totals[key].hotspots);
      samples[key].spectralPasses.push(totals[key].spectralRadius);
    }
  }
  report.datasets.push({ aggregation, dates: dates.size, exactResults: true,
    timings: Object.fromEntries(Object.entries(samples).map(([key, samples]) => [key, {
      hotspotsPerDate: summarize(samples.hotspots),
      hotspotsAllDates: summarize(samples.hotspotPasses),
      spectralRadiusPerDate: summarize(samples.spectralRadius),
      spectralRadiusAllDates: summarize(samples.spectralPasses),
    }])),
  });
}

console.log(JSON.stringify(report, null, 2));
