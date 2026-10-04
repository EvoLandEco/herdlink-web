import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import vm from "node:vm";
import { simulateDaily, aggregateDailyTrajectory } from "../src/runtime/simulation-engine.js";
import { createSyntheticPopulationSnapshot } from "../src/runtime/simulation-population.js";
import {
  getHistoricalPresetGraph, selectHubTargets, selectBridgeTargets, selectTraceRingTargets,
  getSeedCommunityMembers, isCommunityCordonRoute,
} from "../src/runtime/intervention-presets.js";

const root = new URL("../", import.meta.url);
const DAY = 86400000;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const argv = process.argv.slice(2);
let outputDir = "reports/preset-study", suite = "full", requestedSeeds = null, requestedScales = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--suite") suite = argv[++i];
  else if (argv[i] === "--seeds") {
    assert.ok(argv[i + 1] && !argv[i + 1].startsWith("--"), "--seeds needs comma-separated region IDs");
    requestedSeeds = argv[++i].split(",");
  } else if (argv[i] === "--scales") {
    assert.ok(argv[i + 1] && !argv[i + 1].startsWith("--"), "--scales needs comma-separated scale names");
    requestedScales = argv[++i].split(",");
  }
  else if (!argv[i].startsWith("--") && i === 0) outputDir = argv[i];
  else throw new Error("Usage: node scripts/evaluate-scenario-presets.js [outputDir] [--suite full|primary|sensitivity|temporal|matched] [--seeds CR01,CR35] [--scales broad,finer]");
}
assert.ok(["full", "primary", "sensitivity", "temporal", "matched"].includes(suite), "Unknown suite");
outputDir = resolve(outputDir);
mkdirSync(outputDir, { recursive: true });

const defaults = {
  engine: "daily-contact-v1", model: "SEIR", initialPct: 1, initialExposedPct: 0, initialRecoveredPct: 0,
  initializationConvention: "prevalence-shares",
  beta: 0.10, movementBeta: 0.04, sigma: 0.22, gamma: 0.15, omega: 0.02,
  introductionDate: "2020-01-01",
};
const policy = { historyDays: 365, responseDays: 7, standstillDays: 14, targetBudget: 3 };
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
  { id: "weekly-SEIR", suite: "primary", displayResolution: "weekly", scales },
  ...[{ model: "SIR" }, { model: "SIS" }, { model: "SEIRS" }, { movementBeta: 0.02 }, { movementBeta: 0.32 }].map((settings) => ({
    id: `weekly-${settings.model || `SEIR-movement-${settings.movementBeta}`}`,
    suite: "sensitivity", displayResolution: "weekly", scales: appScales, settings,
  })),
  ...["daily", "monthly", "yearly"].map((displayResolution) => ({ id: `${displayResolution}-SEIR`, suite: "temporal", displayResolution, scales: appScales })),
  { id: "weekly-SEIR-matched-k3", suite: "matched", displayResolution: "weekly", scales: appScales },
].filter((config) => suite === "full" || config.suite === suite).map((config) => ({
  ...config, scales: requestedScales ? config.scales.filter(({ key }) => requestedScales.includes(key)) : config.scales,
})).filter((config) => config.scales.length);
assert.ok(configs.length, "The selected suite has no cases at the requested scales");
const presets = [
  { id: "open-trade", label: "Open trade" },
  { id: "seed-containment", label: "Seed containment" },
  { id: "partner-ring", label: "Trace Ring" },
  { id: "seed-community", label: "Community Cordon" },
  { id: "hub-controls", label: "Hubs" },
  { id: "trade-bottlenecks", label: "Bridges" },
  { id: "temporary-standstill", label: "Standstill" },
];
const started = performance.now();
const results = [];
const metadata = {
  schemaVersion: 3, engineVersion: "daily-contact-v1", evidenceLevel: "mathematical-scenario",
  startedAt: new Date().toISOString(), suite, node: process.version, cpu: cpus()[0].model,
  gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  sourceHashes: Object.fromEntries(["src/runtime/simulation-engine.js", "src/runtime/simulation-population.js",
    "src/runtime/intervention-presets.js", "src/runtime/jLouvain.js", "scripts/evaluate-scenario-presets.js"]
    .map((path) => [path, sha256(readFileSync(new URL(path, root)))])),
  defaults, policy, scales, configs, presets,
  method: "The application and this script import the same daily simulation engine and historical target selectors. This script constructs calendar schedules without browser controls. Each comparison holds every simulation control and the population snapshot fixed.",
  matchedExperiment: "Hubs and Bridges each close exports from up to three regions selected from the same pre-introduction movement history. Both begin seven days after introduction.",
  timing: "Every transition spans one UTC day. All cases use the same daily movement ledger and complete calendar. Display bins aggregate the daily trajectory; temporal cases test display invariance.",
  population: "Artificial model units derived from the 365 days before introduction. These are neither observed animals nor observed farms. The complete snapshot and its content hash are recorded.",
  infections: "Cumulative infections count entries after initialization and exclude the initial exposed and infectious units. Reinfections count again in SIS and SEIRS. External infections exclude the seed region.",
  peaks: "Peaks include the state at the exact introduction boundary and all daily interval end states. Regional thresholds describe deterministic model fractions.",
  controlDose: "Region days count calendar intervals with disabled regional permissions. Route closure days count explicitly closed route keys on each daily interval. Retained movement totals sum open ledger weights from introduction through the final daily interval.",
  reopening: "The first daily interval restoring every restricted regional import and export permission marks reopening.",
  invariants: { trajectories: 0, nodeFrames: 0, preclosureNodeFrames: 0, maxMassError: 0, exactScheduleReuses: 0, independentBaselines: 0, displayAggregations: 0 },
};

const csv = readFileSync(new URL("src/assets/data/daily_aggregation.csv", root), "utf8");
const lines = csv.trim().split(/\r?\n/);
assert.equal(lines.shift(), '\"\",\"time\",\"COROP_LEV\",\"COROP_AFN\",\"AANTAL\"');
const data = lines.map((line) => {
  const [, time, COROP_LEV, COROP_AFN, AANTAL] = line.replaceAll('\"', "").split(",");
  return { time: new Date(time), COROP_LEV, COROP_AFN, AANTAL: Number(AANTAL) };
});
const dates = [...new Set(data.map((row) => +row.time))].sort((a, b) => a - b).map((time) => new Date(time));
assert.ok(dates.every((date, index) => index === 0 || date - dates[index - 1] === DAY), "The daily ledger needs a complete calendar");
const ids = Array.from({ length: 40 }, (_, index) => `CR${String(index + 1).padStart(2, "0")}`);
const seeds = requestedSeeds || ids;
assert.ok(seeds.length && new Set(seeds).size === seeds.length && seeds.every((id) => ids.includes(id)), "Seeds must be distinct dataset region IDs");
const populationSnapshot = createSyntheticPopulationSnapshot({ ids, data, introductionDate: defaults.introductionDate });
const introduction = Date.parse(defaults.introductionDate);
assert.ok(introduction - policy.historyDays * DAY >= +dates[0], "Population and target selection need a full year of preceding history");
const graph = getHistoricalPresetGraph(data, introduction - policy.historyDays * DAY, introduction);

// The community detector combines both directed volumes into one undirected edge.
const detector = vm.createContext({});
new vm.Script(readFileSync(new URL("src/runtime/jLouvain.js", root), "utf8")).runInContext(detector);
function computeModularity(nodes, links, resolution) {
  const nodeIds = nodes.map(({ id }) => id).sort();
  const edges = new Map();
  for (const { source, target, weight } of links) {
    const pair = [source, target].sort(), key = JSON.stringify(pair);
    if (edges.has(key)) edges.get(key).weight += weight;
    else edges.set(key, { source: pair[0], target: pair[1], weight });
  }
  if (!edges.size) return { partition: Object.fromEntries(nodeIds.map((id, index) => [id, index])) };
  const orderedEdges = [...edges.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
  const output = detector.jLouvain().nodes(nodeIds).edges(orderedEdges).resolution(resolution)();
  const labels = new Map();
  return { partition: Object.fromEntries(nodeIds.map((id) => {
    const group = output.communities[id];
    if (!labels.has(group)) labels.set(group, labels.size);
    return [id, labels.get(group)];
  })) };
}
const partitions = Object.fromEntries(scales.map((scale) => [scale.key, computeModularity(graph.nodes, graph.links, scale.resolution).partition]));
metadata.dataset = { dataset: "daily", csvHash: sha256(csv), records: data.length, dates: dates.map((date) => date.toISOString()), ids, seeds, partitions };
metadata.populationSnapshot = populationSnapshot;
metadata.populationHash = sha256(JSON.stringify(populationSnapshot));

function displayDates(resolution) {
  return dates.filter((date, index) => index === 0 || resolution === "daily" ||
    (resolution === "weekly" && date.getUTCDay() === 0) ||
    (resolution === "monthly" && date.getUTCDate() === 1) ||
    (resolution === "yearly" && date.getUTCMonth() === 0 && date.getUTCDate() === 1));
}

function buildSchedule(preset, settings, members) {
  const nodes = new Map(), links = new Map();
  const response = Date.parse(settings.introductionDate) + policy.responseDays * DAY;
  if (response > +dates.at(-1)) return { nodes, links };
  let targets = [];
  if (preset === "seed-containment") targets = [settings.seedRegion];
  if (preset === "partner-ring") targets = selectTraceRingTargets(data, settings.seedRegion, introduction, response).filter((id) => ids.includes(id));
  if (preset === "hub-controls") targets = selectHubTargets(graph, policy.targetBudget);
  if (preset === "trade-bottlenecks") targets = selectBridgeTargets(graph, policy.targetBudget);
  if (preset === "temporary-standstill") targets = ids;
  if (preset === "seed-community") {
    for (const row of data) {
      if (+row.time < response || !(row.AANTAL > 0) || !ids.includes(row.COROP_LEV) || !ids.includes(row.COROP_AFN) ||
        !isCommunityCordonRoute(members, row.COROP_LEV, row.COROP_AFN)) continue;
      if (!links.has(+row.time)) links.set(+row.time, new Map());
      links.get(+row.time).set(`${row.COROP_LEV}-${row.COROP_AFN}`, true);
    }
  } else if (targets.length) {
    nodes.set(response, new Map(targets.map((id) => [id, { exports: false }])));
    const reopen = response + policy.standstillDays * DAY;
    if (preset === "temporary-standstill" && reopen <= +dates.at(-1)) nodes.set(reopen, new Map(targets.map((id) => [id, { exports: true }])));
  }
  return { nodes, links };
}

function scheduleKey(settings, nodes, links) {
  const serialize = (events) => [...events].sort(([a], [b]) => a - b).map(([time, changes]) =>
    [time, [...changes].sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) =>
      [id, typeof value === "boolean" ? value : Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))])]);
  return JSON.stringify([settings, serialize(nodes), serialize(links)]);
}

function trajectoryHash(trajectory) {
  const hash = createHash("sha256");
  for (const frame of [trajectory.initialFrame, ...trajectory.frames]) {
    hash.update(JSON.stringify([frame.key, frame.summary, frame.nodeStates, [...frame.linkStates]]));
  }
  return hash.digest("hex");
}

function summarize(trajectory, baseline, nodes, links, settings, resolution) {
  const { frames, initialFrame } = trajectory;
  const dailyTrajectoryHash = trajectoryHash(trajectory);
  const displayed = aggregateDailyTrajectory(trajectory, displayDates(resolution));
  for (const key of ["S", "E", "I", "R", "N", "cumulativeInfections"]) {
    assert.equal(displayed.frames.at(-1).summary[key], frames.at(-1).summary[key], `Display aggregation preserves final ${key}`);
  }
  const displayedIncidence = displayed.frames.reduce((sum, frame) => sum + frame.summary.newInfections, 0);
  const dailyIncidence = frames.reduce((sum, frame) => sum + frame.summary.newInfections, 0);
  assert.ok(Math.abs(displayedIncidence - dailyIncidence) <= 1e-7 * Math.max(1, dailyIncidence), "Display aggregation preserves total incidence");
  assert.equal(trajectoryHash(trajectory), dailyTrajectoryHash, "Display aggregation must not mutate the daily trajectory");
  metadata.invariants.displayAggregations++;
  const directionTargets = (direction) => [...new Set([...nodes.values()].flatMap((changes) => [...changes].filter(([, value]) => value[direction] === false).map(([id]) => id)))].sort();
  const exportTargetIds = directionTargets("exports"), importTargetIds = directionTargets("imports");
  const targetIds = [...new Set([...exportTargetIds, ...importTargetIds])].sort();
  const routeTargetIds = [...new Set([...links.values()].flatMap((changes) => [...changes.keys()]))].sort();
  const affectedRegionIds = [...new Set([...targetIds, ...routeTargetIds.flatMap((key) => key.split("-"))])].sort();
  const effectiveRouteHash = createHash("sha256");
  const events = [...nodes].sort(([a], [b]) => a - b), permissions = new Map();
  let eventIndex = 0, peakI = initialFrame.summary.I, peakIDate = initialFrame.key, totalTrade = 0, crossTrade = 0;
  let exportRegionDays = 0, importRegionDays = 0, restrictedNodeDays = 0, previousRestrictedNodes = 0;
  let routeClosureDays = 0, firstClosureDate = null, reopeningDate = null;
  const peaks = Object.fromEntries(ids.map((id) => [id, initialFrame.nodeStates[id].prevalence]));
  const population = initialFrame.summary.N;
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index], time = +frame.date;
    while (eventIndex < events.length && events[eventIndex][0] <= time) {
      for (const [id, patch] of events[eventIndex++][1]) permissions.set(id, { ...permissions.get(id), ...patch });
    }
    const closedExports = ids.filter((id) => permissions.get(id)?.exports === false).length;
    const closedImports = ids.filter((id) => permissions.get(id)?.imports === false).length;
    const restrictedNodes = ids.filter((id) => permissions.get(id)?.exports === false || permissions.get(id)?.imports === false).length;
    const routeClosures = [...(links.get(time)?.values() || [])].filter(Boolean).length;
    exportRegionDays += closedExports;
    importRegionDays += closedImports;
    restrictedNodeDays += restrictedNodes;
    routeClosureDays += routeClosures;
    if ((restrictedNodes || routeClosures) && !firstClosureDate) firstClosureDate = frame.key;
    if (previousRestrictedNodes > 0 && restrictedNodes === 0 && !reopeningDate) reopeningDate = frame.key;
    previousRestrictedNodes = restrictedNodes;
    if (frame.summary.I > peakI) { peakI = frame.summary.I; peakIDate = frame.intervalEnd.toISOString(); }
    for (const id of ids) {
      const state = frame.nodeStates[id];
      for (const key of ["S", "E", "I", "R", "N", "newInfections", "cumulativeInfections"]) {
        assert.ok(Number.isFinite(state[key]) && state[key] >= -1e-9, `Invalid ${key}, ${id}, ${frame.key}`);
      }
      const error = Math.abs(state.S + state.E + state.I + state.R - state.N);
      assert.ok(error <= 1e-7, `Population imbalance ${error}, ${id}, ${frame.key}`);
      metadata.invariants.maxMassError = Math.max(metadata.invariants.maxMassError, error);
      metadata.invariants.nodeFrames++;
      if (baseline && firstClosureDate === null) {
        assert.deepEqual(state, baseline.frames[index].nodeStates[id], `Preclosure ${id}, ${frame.key}`);
        metadata.invariants.preclosureNodeFrames++;
      }
      peaks[id] = Math.max(peaks[id], state.prevalence);
    }
    assert.ok(Math.abs(frame.summary.N - population) < 1e-7);
    const enabledRouteKeys = [];
    for (const edge of frame.linkStates.values()) {
      assert.ok(Number.isFinite(edge.ledgerWeight) && edge.ledgerWeight >= 0);
      if (time >= introduction) {
        totalTrade += edge.ledgerWeight;
        if (!edge.local) crossTrade += edge.ledgerWeight;
      }
      if (!edge.local && edge.ledgerWeight > 0) assert.ok(permissions.get(edge.source)?.exports !== false && permissions.get(edge.target)?.imports !== false);
      const key = `${edge.source}-${edge.target}`;
      if (edge.ledgerWeight > 0) {
        assert.notEqual(links.get(time)?.get(key), true);
        enabledRouteKeys.push(key);
      }
    }
    effectiveRouteHash.update(`${frame.key}\n${enabledRouteKeys.sort().join("\n")}\n`);
  }
  metadata.invariants.trajectories++;
  const last = frames.at(-1), seed = initialFrame.nodeStates[settings.seedRegion];
  return {
    dailyTrajectoryHash, displayFrameCount: displayed.frames.length, population,
    initialSeeded: seed.I, initialExposed: seed.E, initialRecovered: seed.R,
    cumulativeInfections: last.summary.cumulativeInfections,
    externalCumulativeInfections: ids.filter((id) => id !== settings.seedRegion).reduce((sum, id) => sum + last.nodeStates[id].cumulativeInfections, 0),
    peakI, peakIDate, peakPrevalence: peakI / population,
    regionsAtOnePercent: ids.filter((id) => peaks[id] >= 0.01).length,
    externalRegionsAtOnePercent: ids.filter((id) => id !== settings.seedRegion && peaks[id] >= 0.01).length,
    totalTrade, crossTrade, localTrade: totalTrade - crossTrade,
    targetCount: targetIds.length, targetIds, exportTargetIds, importTargetIds, routeTargetIds, routeTargetCount: routeTargetIds.length,
    affectedRegionCount: affectedRegionIds.length, affectedRegionIds, effectiveRouteHash: effectiveRouteHash.digest("hex"),
    seedIncluded: targetIds.includes(settings.seedRegion), firstClosureDate, reopeningDate,
    exportRegionDays, importRegionDays, restrictedNodeDays, routeClosureDays,
    closureEvents: events.map(([time, changes]) => ({ date: new Date(time).toISOString(), directions: Object.fromEntries(changes) })),
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

for (const config of configs) {
  for (const seedRegion of seeds) {
    const settings = { ...defaults, ...config.settings, seedRegion, holdings: populationSnapshot.values, population: populationSnapshot };
    const empty = new Map();
    const input = { settings, data, dates, ids, movementGeography: "COROP" };
    const baseline = simulateDaily({ ...input, nodeInterventions: empty, linkInterventions: empty });
    const baselineStats = summarize(baseline, null, empty, empty, settings, config.displayResolution);
    assert.equal(trajectoryHash(simulateDaily({ ...input, nodeInterventions: empty, linkInterventions: empty })), baselineStats.dailyTrajectoryHash, "Independent baseline recomputation");
    metadata.invariants.independentBaselines++;
    const cache = new Map([[scheduleKey(settings, empty, empty), baselineStats]]);
    for (const scale of config.scales) {
      const members = getSeedCommunityMembers(graph, seedRegion, scale.resolution, computeModularity);
      const casePresets = config.suite === "matched" ? presets.filter(({ id }) => ["open-trade", "hub-controls", "trade-bottlenecks"].includes(id)) : presets;
      for (const { id: preset, label: presetLabel } of casePresets) {
        const { nodes, links } = buildSchedule(preset, settings, members);
        const key = scheduleKey(settings, nodes, links);
        let statistics = cache.get(key), calculationMs = 0;
        if (statistics) metadata.invariants.exactScheduleReuses++;
        else {
          const before = performance.now();
          statistics = summarize(simulateDaily({ ...input, nodeInterventions: nodes, linkInterventions: links }), baseline, nodes, links, settings, config.displayResolution);
          calculationMs = performance.now() - before;
          cache.set(key, statistics);
        }
        const targetBudget = ["hub-controls", "trade-bottlenecks"].includes(preset) ? policy.targetBudget : null;
        if (targetBudget !== null) assert.ok(statistics.targetCount <= targetBudget);
        results.push({
          experiment: config.suite === "matched" ? "matched-k3" : "calendar-policy-comparison", suite: config.suite,
          config: config.id, dataset: "daily", displayResolution: config.displayResolution, engineVersion: metadata.engineVersion,
          ...settings, populationSnapshot: settings.population, populationHash: metadata.populationHash, scale: scale.key, scaleLabel: scale.label, resolution: scale.resolution,
          groupCount: new Set(Object.values(partitions[scale.key])).size, seedCommunitySize: members.size,
          preset, presetLabel, targetBudget, ...statistics,
          baselineCumulativeInfections: baselineStats.cumulativeInfections,
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
    process.stderr.write(`${config.id} ${seedRegion}: ${results.length} rows\n`);
  }
  saveOutputs();
}
metadata.completedAt = new Date().toISOString();
saveOutputs();
console.log(JSON.stringify({ outputDir, resultRows: results.length, wallSeconds: metadata.wallSeconds, invariants: metadata.invariants }, null, 2));
