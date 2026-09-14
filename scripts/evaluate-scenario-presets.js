import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const source = readFileSync(new URL("src/runtime/herdlink-runtime.js", root), "utf8");
const louvain = readFileSync(new URL("src/runtime/jLouvain.js", root), "utf8");
const argv = process.argv.slice(2);
let outputDir = "reports/preset-study", suite = "full", requestedSeeds = null, requestedScales = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--suite") suite = argv[++i];
  else if (argv[i] === "--seeds") requestedSeeds = argv[++i].split(",");
  else if (argv[i] === "--scales") requestedScales = argv[++i].split(",");
  else if (!argv[i].startsWith("--") && i === 0) outputDir = argv[i];
  else throw new Error("Usage: node scripts/evaluate-scenario-presets.js [outputDir] [--suite full|primary|sensitivity|temporal|matched] [--seeds CR01,CR35] [--scales broad,finer]");
}
assert.ok(["full", "primary", "sensitivity", "temporal", "matched"].includes(suite), "Unknown suite");
outputDir = resolve(outputDir);
mkdirSync(outputDir, { recursive: true });

const defaults = { model: "SEIR", initialPct: 1, beta: 0.32, movementBeta: 0.08, sigma: 0.22, gamma: 0.15 };
const scales = [
  { key: "broad", label: "Broad", resolution: 1 },
  { key: "research-1.25", label: "Research 1.25", resolution: 1.25 },
  { key: "finer", label: "Finer", resolution: 1.5 },
  { key: "research-2", label: "Research 2", resolution: 2 },
  { key: "research-3", label: "Research 3", resolution: 3 },
];
const appScales = scales.filter(({ key }) => ["broad", "finer"].includes(key));
if (requestedScales) assert.ok(requestedScales.length && requestedScales.every((key) => scales.some((scale) => scale.key === key)), "Unknown scale");
const configs = [
  { id: "weekly-SEIR", suite: "primary", dataset: "weekly", scales },
  ...[{ model: "SIR" }, { model: "SIS" }, { model: "SEIRS" }, { movementBeta: 0.02 }, { movementBeta: 0.32 }].map((settings) => ({
    id: `weekly-${settings.model || `SEIR-movement-${settings.movementBeta}`}`,
    suite: "sensitivity", dataset: "weekly", scales: appScales, settings,
  })),
  ...["daily", "monthly", "yearly"].map((dataset) => ({ id: `${dataset}-SEIR`, suite: "temporal", dataset, scales: appScales })),
  { id: "weekly-SEIR-matched-k3", suite: "matched", dataset: "weekly", scales: appScales },
].filter((config) => suite === "full" || config.suite === suite).map((config) => ({
  ...config, scales: requestedScales ? config.scales.filter(({ key }) => requestedScales.includes(key)) : config.scales,
})).filter((config) => config.scales.length);

const functionNames = [
  "getNodeId", "getLinkKey", "getStatnaam", "getTradeRecordsByDate", "clampNumber", "readSimulationSettings",
  "collectSimulationRegionIds", "buildSimulationLedger", "estimateSimulationHoldings", "getSimulationFrameSummary", "buildSimulationTrajectory",
  "getSimulationLinkAvailability", "getSimulationNodePermissions", "applySimulationNodePermissions", "getDisabledLinkKeys",
  "computeModularity", "buildAdjList", "getStronglyConnectedComponents", "computePerronPair", "computeEigenvectorCentrality", "computeHotSpotMetrics",
  "getComparisonMetricDefinitions", "buildComparisonSeries", "getOriginalSimulationSeries", "areNetworkControlsLocked", "areScenarioControlsDisabled",
  "getScenarioContext", "getNetworkPresetGraph", "getNetworkPresetSelection", "applyScenario", "loadPreset",
];
const functions = functionNames.map((name) => {
  const match = source.match(new RegExp(`^([ ]*)(?:async )?function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Production function ${name} exists`);
  return match[0];
}).join("\n");
const script = new vm.Script(`${louvain}\n${functions}`);
const controls = { model: "Model", seedRegion: "SeedRegion", initialPct: "InitialPct", beta: "Beta", movementBeta: "MovementBeta", sigma: "Sigma", gamma: "Gamma" };
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const startedAt = new Date().toISOString();
const started = performance.now();
const results = [];
const metadata = {
  startedAt, suite, node: process.version, cpu: cpus()[0].model,
  gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceHashes: { runtime: sha256(source), louvain: sha256(louvain), harness: sha256(readFileSync(new URL(import.meta.url))) },
  defaults, scales, configs, datasets: [], functionNames,
  method: "Production loadPreset applies each complete schedule; production buildSimulationTrajectory computes outcomes. DOM controls and repaint callbacks are represented in the headless environment.",
  matchedExperiment: "Import shielding and Trade bottlenecks use their production scores with a common three-region limit, keeping positive scores and the production region-ID tie order. Import shielding closes target imports; Trade bottlenecks closes target exports. Measures begin at the first recorded date at least seven days after the start and stay through the end. Community partitions are unchanged.",
  timing: "Each recorded date advances one model step. Rate parameters are not rescaled by elapsed calendar days. Temporal-resolution comparisons describe app-setting sensitivity, not numerical convergence.",
  population: "Production holdings are estimated from the full dataset's trade totals. These are model population units, not observed farm counts.",
  infections: "Cumulative infections count new infection events after initialization and exclude initially seeded infectious units. Reinfections contribute again in SIS and SEIRS. External cumulative infections exclude the seed region.",
  peaks: "Peak infectious units and the one-percent regional threshold use the states after each recorded model step. Initial seeded units are reported separately.",
  controlDose: "Region steps count scheduled import/export restrictions on recorded dates; region days sum calendar intervals up to the final recorded date. Route closure steps count scheduled unavailable route keys, including keys with no recorded volume on that date. Trade retained sums production link-state ledger weights, including both node permissions and date-specific route restrictions.",
  reopening: "reopeningDate marks the first recorded step that restores all restricted regional import and export permissions. Dates without recorded border routes do not mark a reopening of a route policy.",
  targets: "targetCount counts regions with explicit import or export permissions disabled. affectedRegionCount also includes endpoints of explicitly closed routes. effectiveRouteHash identifies sorted positive recorded routes remaining open at every date, independent of disease states.",
  invariants: { trajectories: 0, nodeFrames: 0, preclosureNodeFrames: 0, maxMassError: 0, exactScheduleReuses: 0, loadPresetCalls: 0 },
};

function readDataset(dataset) {
  const csv = readFileSync(new URL(`src/assets/data/${dataset}_aggregation.csv`, root), "utf8");
  const lines = csv.trim().split(/\r?\n/);
  assert.equal(lines.shift(), '"","time","COROP_LEV","COROP_AFN","AANTAL"');
  const data = lines.map((line) => {
    const [, time, COROP_LEV, COROP_AFN, AANTAL] = line.replaceAll('"', "").split(",");
    return { time: new Date(time), COROP_LEV, COROP_AFN, AANTAL: Number(AANTAL) };
  });
  const dates = [...new Set(data.map((row) => row.time.getTime()))].sort((a, b) => a - b).map((time) => new Date(time));
  return { data, dates, hash: sha256(csv) };
}

function runtime(dataset, data, dates) {
  const elements = Object.fromEntries(Object.values(controls).map((suffix) => [`simulation${suffix}`, { value: "" }]));
  const select = { selectAll() { return this; }, data() { return this; }, join() { return this; }, attr() { return this; }, text() { return this; } };
  const values = (items, accessor = (item) => item) => Array.from(items, accessor);
  const context = vm.createContext({
    Date, Map, Set, loadedCSVData: data, uniqueDates: dates, currentTimeSpan: dataset, communityScale: "broad", nlLabelPoints: null,
    simulationRegionIdsByDataset: new WeakMap(), tradeRecordsByDataset: new WeakMap(), comparisonDataCache: new Map(),
    networkPresetGraphsByDataset: new WeakMap(), networkPresetMetricsByGraph: new WeakMap(),
    simulationNodeInterventions: new Map(), simulationLinkInterventions: new Map(), simulationState: { status: "idle" },
    appDataMode: "trade", appModeSwitchLocked: false, simulationRecomputeTimer: null, screenshotInProgress: false,
    networkStatsDirtyDates: new Set(), networkStatsDirtyFrom: null, comparisonDataError: null,
    metricNames: ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"],
    window: { currentDate: dates[0], herdlinkComparison: { refresh() {} } },
    document: { getElementById: (id) => id === "mainContainer" ? { closest: () => null } : elements[id] },
    ensureSimulationControls() {}, applyNetworkControlChanges() {},
    d3: {
      select: () => select,
      min: (items, accessor) => Math.min(...values(items, accessor)),
      max: (items, accessor) => Math.max(...values(items, accessor)),
      sum: (items, accessor) => values(items, accessor).reduce((sum, value) => sum + value, 0),
    },
  });
  script.runInContext(context);
  return { context, setSettings(settings) { for (const [key, suffix] of Object.entries(controls)) elements[`simulation${suffix}`].value = String(settings[key]); } };
}

function scheduleKey(settings, nodes, links) {
  const serialize = (events) => [...events].sort(([a], [b]) => a - b).map(([time, changes]) =>
    [time, [...changes].sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) =>
      [id, typeof value === "boolean" ? value : Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))])]);
  return JSON.stringify([settings, serialize(nodes), serialize(links)]);
}

function summarize(context, trajectory, baseline, nodes, links, settings) {
  const { frames, ids } = trajectory;
  const directionTargets = (direction) => [...new Set([...nodes.values()].flatMap((changes) => [...changes].filter(([, value]) => value[direction] === false).map(([id]) => id)))].sort();
  const exportTargetIds = directionTargets("exports"), importTargetIds = directionTargets("imports");
  const targetIds = [...new Set([...exportTargetIds, ...importTargetIds])].sort();
  const routeTargetIds = [...new Set([...links.values()].flatMap((changes) => [...changes.keys()]))].sort();
  const affectedRegionIds = [...new Set([...targetIds, ...routeTargetIds.flatMap((key) => key.split("-"))])].sort();
  const effectiveRouteHash = createHash("sha256");
  const events = [...nodes].sort(([a], [b]) => a - b), permissions = new Map();
  let eventIndex = 0, peakI = -Infinity, peakIDate = null, totalTrade = 0, crossTrade = 0;
  let exportRegionSteps = 0, importRegionSteps = 0, exportRegionDays = 0, importRegionDays = 0;
  let restrictedNodeSteps = 0, previousRestrictedNodes = 0, routeClosureSteps = 0, firstClosureDate = null, reopeningDate = null;
  const peaks = Object.fromEntries(ids.map((id) => [id, 0]));
  const population = frames[0].summary.N;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index], time = frame.date.getTime();
    while (eventIndex < events.length && events[eventIndex][0] <= time) {
      const [date, changes] = events[eventIndex++];
      context.applySimulationNodePermissions(permissions, changes, date);
    }
    const closedExports = ids.filter((id) => permissions.get(id)?.exports === false).length;
    const closedImports = ids.filter((id) => permissions.get(id)?.imports === false).length;
    const restrictedNodes = ids.filter((id) => permissions.get(id)?.imports === false || permissions.get(id)?.exports === false).length;
    const routeClosures = links.get(time)?.size || 0;
    exportRegionSteps += closedExports;
    importRegionSteps += closedImports;
    restrictedNodeSteps += restrictedNodes;
    routeClosureSteps += routeClosures;
    const closed = closedExports || closedImports || routeClosures;
    if (closed && !firstClosureDate) firstClosureDate = frame.key;
    if (previousRestrictedNodes > 0 && restrictedNodes === 0 && !reopeningDate) reopeningDate = frame.key;
    previousRestrictedNodes = restrictedNodes;
    if (index + 1 < frames.length) {
      const days = (frames[index + 1].date - frame.date) / 86400000;
      exportRegionDays += closedExports * days;
      importRegionDays += closedImports * days;
    }
    if (frame.summary.I > peakI) { peakI = frame.summary.I; peakIDate = frame.key; }
    const beforeClosure = firstClosureDate === null;
    for (const id of ids) {
      const state = frame.nodeStates[id];
      for (const key of ["S", "E", "I", "R", "N", "newInfections", "cumulativeInfections"]) {
        if (!Number.isFinite(state[key]) || state[key] < -1e-9) throw new Error(`Invalid ${key} in ${id} at ${frame.key}`);
      }
      const error = Math.abs(state.S + state.E + state.I + state.R - state.N);
      if (error > 1e-7) throw new Error(`Population imbalance ${error} in ${id} at ${frame.key}`);
      metadata.invariants.maxMassError = Math.max(metadata.invariants.maxMassError, error);
      metadata.invariants.nodeFrames++;
      if (baseline && beforeClosure) {
        for (const key of Object.keys(state)) assert.equal(state[key], baseline.frames[index].nodeStates[id][key], `Preclosure ${key}, ${id}, ${frame.key}`);
        metadata.invariants.preclosureNodeFrames++;
      }
      peaks[id] = Math.max(peaks[id], state.prevalence);
    }
    assert.ok(Math.abs(frame.summary.N - population) < 1e-7);
    const enabledRouteKeys = [];
    for (const edge of frame.linkStates.values()) {
      assert.ok(Number.isFinite(edge.ledgerWeight) && edge.ledgerWeight >= 0);
      totalTrade += edge.ledgerWeight;
      if (!edge.local) crossTrade += edge.ledgerWeight;
      if (!edge.local) assert.ok(permissions.get(edge.source)?.exports !== false && permissions.get(edge.target)?.imports !== false);
      if (edge.ledgerWeight > 0) assert.ok(!links.get(time)?.has(context.getLinkKey(edge.source, edge.target)));
      if (edge.ledgerWeight > 0) enabledRouteKeys.push(context.getLinkKey(edge.source, edge.target));
    }
    effectiveRouteHash.update(`${frame.key}\n${enabledRouteKeys.sort().join("\n")}\n`);
  }
  metadata.invariants.trajectories++;
  const last = frames.at(-1);
  return {
    population, initialSeeded: Math.min(last.nodeStates[settings.seedRegion].N, Math.max(1, settings.initialPct / 100 * last.nodeStates[settings.seedRegion].N)),
    cumulativeInfections: last.summary.cumulativeInfections,
    externalCumulativeInfections: ids.filter((id) => id !== settings.seedRegion).reduce((sum, id) => sum + last.nodeStates[id].cumulativeInfections, 0),
    peakI, peakIDate, peakPrevalence: peakI / population,
    regionsAtOnePercent: ids.filter((id) => peaks[id] >= 0.01).length,
    externalRegionsAtOnePercent: ids.filter((id) => id !== settings.seedRegion && peaks[id] >= 0.01).length,
    totalTrade, crossTrade, localTrade: totalTrade - crossTrade,
    targetCount: targetIds.length, targetIds, exportTargetIds, importTargetIds, routeTargetIds, routeTargetCount: routeTargetIds.length,
    affectedRegionCount: affectedRegionIds.length, affectedRegionIds, effectiveRouteHash: effectiveRouteHash.digest("hex"),
    seedIncluded: targetIds.includes(settings.seedRegion),
    firstClosureDate, reopeningDate, exportRegionSteps, importRegionSteps, exportRegionDays, importRegionDays, restrictedNodeSteps, routeClosureSteps,
    closureEvents: [...nodes].sort(([a], [b]) => a - b).map(([time, changes]) => ({ date: new Date(time).toISOString(), directions: Object.fromEntries(changes) })),
  };
}

function csvCell(value) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function saveOutputs() {
  metadata.wallSeconds = (performance.now() - started) / 1000;
  metadata.resultRows = results.length;
  writeFileSync(resolve(outputDir, "results.json"), JSON.stringify(results));
  const columns = [...new Set(results.flatMap(Object.keys))];
  writeFileSync(resolve(outputDir, "results.csv"), [columns.join(","), ...results.map((row) => columns.map((key) => csvCell(row[key])).join(","))].join("\n") + "\n");
  writeFileSync(resolve(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
}

for (const dataset of [...new Set(configs.map((config) => config.dataset))]) {
  const { data, dates, hash } = readDataset(dataset);
  const { context, setSettings } = runtime(dataset, data, dates);
  const graph = context.getNetworkPresetGraph(data);
  const ids = Array.from(graph.ids);
  const seeds = requestedSeeds || ids;
  assert.ok(seeds.length && new Set(seeds).size === seeds.length && seeds.every((id) => ids.includes(id)), "Seeds must be distinct dataset region IDs");
  const datasetScales = [...new Map(configs.filter((config) => config.dataset === dataset).flatMap((config) => config.scales).map((scale) => [scale.key, scale])).values()];
  const researchScales = datasetScales.filter((scale) => !graph.byScale[scale.key]);
  if (researchScales.length) {
    const allEdges = [...context.buildSimulationLedger(data, ids, dates).ledgerByDate.values()].flat();
    const nodes = [...new Set(allEdges.flatMap((edge) => [edge.source, edge.target]))].map((id) => ({ id }));
    for (const scale of researchScales) {
      graph.byScale[scale.key] = { partition: context.computeModularity(nodes, allEdges, scale.resolution).partition, resolution: scale.resolution };
    }
  }
  metadata.datasets.push({ dataset, csvHash: hash, records: data.length, dates: dates.map((date) => date.toISOString()), seeds,
    partitions: Object.fromEntries(datasetScales.map((scale) => [scale.key, { ...scale, partition: graph.byScale[scale.key].partition }])) });

  for (const config of configs.filter((item) => item.dataset === dataset)) {
    for (const seedRegion of seeds) {
      const seedStarted = performance.now();
      const settings = { model: defaults.model, seedRegion, ...defaults, ...config.settings };
      setSettings(settings);
      context.simulationNodeInterventions.clear(); context.simulationLinkInterventions.clear(); context.comparisonDataCache.clear();
      const empty = new Map();
      const baseline = context.buildSimulationTrajectory(settings, { nodeInterventions: empty, linkInterventions: empty });
      const original = context.getOriginalSimulationSeries(settings, baseline);
      assert.equal(context.getOriginalSimulationSeries(settings), original);
      const baselineStats = summarize(context, baseline, null, empty, empty, settings);
      const productionPresets = Array.from(context.getScenarioContext().presets);
      metadata.presets = productionPresets.map(({ id, label, group }) => ({ id, label, group: group || "original" }));
      const presetIds = productionPresets.map(({ id }) => id);
      const networkPresetIds = productionPresets.filter(({ group }) => group === "network").map(({ id }) => id);
      const rankedPresets = ["incoming-pressure", "trade-bottlenecks"].filter((id) => networkPresetIds.includes(id));
      const pressure = Object.fromEntries(ids.map((id) => [id, original.nodes[id].reduce((sum, row) => sum + row.incomingExposure, 0)]));
      const cache = new Map([[scheduleKey(settings, empty, empty), baselineStats]]);
      for (const scale of config.scales) {
        context.communityScale = scale.key;
        const selection = context.getNetworkPresetSelection("seed-community", graph, scale.key, seedRegion);
        const partitions = graph.byScale[scale.key].partition;
        const seedCommunitySize = selection.seedCommunity.length;
        const groupCount = new Set(Object.values(partitions)).size;
        const casePresets = config.suite === "matched" ? ["open-trade", ...rankedPresets] : presetIds;
        for (const preset of casePresets) {
          let nodeInterventions, linkInterventions, targetBudget = null;
          if (config.suite === "matched") {
            nodeInterventions = new Map(); linkInterventions = new Map();
            if (preset !== "open-trade") {
              const ranked = context.getNetworkPresetSelection(preset, graph, scale.key, seedRegion, pressure);
              const targets = ids.filter((id) => Number.isFinite(ranked.scores[id]) && ranked.scores[id] > 0)
                .sort((a, b) => ranked.scores[b] - ranked.scores[a] || a.localeCompare(b)).slice(0, 3);
              const date = dates.find((date) => date.getTime() >= dates[0].getTime() + 7 * 86400000);
              const direction = preset === "incoming-pressure" ? "imports" : "exports";
              if (date && targets.length) nodeInterventions.set(date.getTime(), new Map(targets.map((id) => [id, { [direction]: false }])));
              targetBudget = 3;
            }
          } else {
            const result = context.loadPreset(preset);
            metadata.invariants.loadPresetCalls++;
            nodeInterventions = new Map(result.scenario.nodeInterventions.map(([date, changes]) => [date, new Map(changes)]));
            linkInterventions = new Map(result.scenario.linkInterventions.map(([date, changes]) => [date, new Map(changes)]));
            assert.equal(JSON.stringify(result.scenario.settings), JSON.stringify(settings));
            assert.equal(scheduleKey(settings, context.simulationNodeInterventions, context.simulationLinkInterventions), scheduleKey(settings, nodeInterventions, linkInterventions));
            if (networkPresetIds.includes(preset) && preset !== "community-bridges") targetBudget = seedCommunitySize;
          }
          const key = scheduleKey(settings, nodeInterventions, linkInterventions);
          let statistics = cache.get(key), calculationMs = 0;
          if (statistics) metadata.invariants.exactScheduleReuses++;
          else {
            const calculationStarted = performance.now();
            const trajectory = context.buildSimulationTrajectory(settings, { nodeInterventions, linkInterventions });
            statistics = summarize(context, trajectory, baseline, nodeInterventions, linkInterventions, settings);
            calculationMs = performance.now() - calculationStarted;
            cache.set(key, statistics);
          }
          if (targetBudget !== null) assert.ok(statistics.targetCount <= targetBudget);
          results.push({
            experiment: config.suite === "matched" ? "matched-k3" : "production", suite: config.suite, config: config.id, dataset,
            ...settings, scale: scale.key, scaleLabel: scale.label, resolution: scale.resolution, groupCount, seedCommunitySize,
            preset, presetLabel: productionPresets.find(({ id }) => id === preset).label,
            presetGroup: networkPresetIds.includes(preset) ? "network" : "original",
            targetBudget, ...statistics, baselineCumulativeInfections: baselineStats.cumulativeInfections,
            baselineExternalCumulativeInfections: baselineStats.externalCumulativeInfections, baselinePeakI: baselineStats.peakI,
            baselineTotalTrade: baselineStats.totalTrade, baselineCrossTrade: baselineStats.crossTrade,
            totalTradeRetained: baselineStats.totalTrade ? statistics.totalTrade / baselineStats.totalTrade : null,
            crossTradeRetained: baselineStats.crossTrade ? statistics.crossTrade / baselineStats.crossTrade : null,
            externalInfectionsAverted: baselineStats.externalCumulativeInfections - statistics.externalCumulativeInfections,
            externalInfectionsAvertedFraction: baselineStats.externalCumulativeInfections ? 1 - statistics.externalCumulativeInfections / baselineStats.externalCumulativeInfections : null,
            calculationMs, scheduleHash: sha256(key),
          });
        }
      }
      process.stderr.write(`${config.id} ${seedRegion}: ${results.length} rows, ${((performance.now() - seedStarted) / 1000).toFixed(2)} s\n`);
    }
    saveOutputs();
  }
}
metadata.completedAt = new Date().toISOString();
saveOutputs();
console.log(JSON.stringify({ outputDir, resultRows: results.length, wallSeconds: metadata.wallSeconds, invariants: metadata.invariants }, null, 2));
