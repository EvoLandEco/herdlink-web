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
const metricsContext = vm.createContext({});
vm.runInContext([
  "getNodeId", "buildAdjList", "getStronglyConnectedComponents", "computePerronPair",
  "computeEigenvectorCentrality", "computeHotSpotMetrics",
].map(extractFunction).join("\n"), metricsContext);
function metrics(ids, links) {
  return metricsContext.computeHotSpotMetrics(ids.map((id) => ({ id })),
    links.map(([source, target, weight, disabled]) => ({ source, target, weight, disabled })));
}
function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
}

test("hotspot metrics use available positive movements between known regions", () => {
  const links = [["A", "B", 2], ["B", "C", 3]];
  const reference = metrics(["A", "B", "C"], links);
  const withIgnored = metrics(["A", "B", "C"], [...links,
    ["A", "A", 1e9], ["C", "A", 10, true], ["C", "B", 0],
    ["A", "C", -1], ["B", "A", NaN], ["B", "A", Infinity], ["unknown", "A", 10],
  ]);
  assert.deepEqual(withIgnored, reference);
  assert.equal(reference.A.outDegree, 2);
  assert.equal(reference.B.inDegree, 2);
  assert.equal(reference.B.outDegree, 3);
  assert.equal(reference.B.betweenness, 1);
  assert.equal(reference.C.outDegree, 0);
});

test("betweenness distinguishes longer paths when movement volumes are rescaled", () => {
  const routes = [["A", "B"], ["A", "C"], ["B", "D"], ["C", "D"], ["B", "C"]];
  for (const scale of [1e-12, 1, 1e12]) {
    const result = metrics(["A", "B", "C", "D"], routes.map(([source, target]) => [source, target, scale]));
    assert.equal(result.A.betweenness, 0);
    assert.equal(result.B.betweenness, 0.5);
    assert.equal(result.C.betweenness, 0.5);
    assert.equal(result.D.betweenness, 0);
  }
});

test("betweenness shares credit between exact inverse-weight ties at binary scales", () => {
  const routes = [["A", "B", 10], ["B", "C", 15], ["A", "C", 6]];
  for (const scale of [Number.MIN_VALUE, 2 ** -100, 0.25, 1, 2 ** 100]) {
    const result = metrics(["A", "B", "C"], routes.map(([source, target, weight]) => [source, target, weight * scale]));
    assert.equal(result.A.betweenness, 0);
    assert.equal(result.B.betweenness, 0.5);
    assert.equal(result.C.betweenness, 0);
  }
});

test("betweenness preserves the ordering of closely unequal inverse-weight paths", () => {
  for (const [directWeight, expected] of [[6 + 6 * Number.EPSILON, 0], [6 - 6 * Number.EPSILON, 1]]) {
    for (const scale of [0.25, 1, 2 ** 100]) {
      const result = metrics(["A", "B", "C"], [
        ["A", "B", 10 * scale], ["B", "C", 15 * scale], ["A", "C", directWeight * scale],
      ]);
      assert.equal(result.B.betweenness, expected);
    }
  }
});

test("blocked CR35 exports do not count within-region trades as seeding", () => {
  const csv = readFileSync(new URL("../src/assets/data/weekly_aggregation.csv", import.meta.url), "utf8");
  const links = csv.trim().split("\n").slice(1).flatMap((line) => {
    const [, date, source, target, weight] = line.replaceAll('"', "").split(",");
    if (date !== "2019-01-20" || source === "NA" || target === "NA") return [];
    return [[source, target, +weight, source === "CR35" && target !== "CR35"]];
  });
  assert.ok(links.some(([source, target, weight]) => source === "CR35" && target === "CR35" && weight > 0));
  const result = metrics(Array.from({ length: 40 }, (_, index) => `CR${String(index + 1).padStart(2, "0")}`), links);
  assert.equal(result.CR35.outDegree, 0);
  assert.equal(result.CR35.betweenness, 0);
  assert.ok(result.CR35.inDegree > 0);
  const isolated = metrics(["CR35", "CR02"], [["CR35", "CR35", 1000], ["CR35", "CR02", 100, true], ["CR02", "CR35", 100, true]]);
  for (const metric of ["inDegree", "outDegree", "betweenness", "eigenvector"]) assert.equal(isolated.CR35[metric], 0);
});

test("PageRank conserves mass on closed cycles, dangling nodes, and empty graphs", () => {
  const closed = metrics(["A", "B", "C", "D", "E"], [["A", "B", 2], ["B", "A", 8], ["C", "D", 1], ["D", "E", 1], ["E", "C", 1]]);
  Object.values(closed).forEach((node) => near(node.pageRank, 0.2));
  const dangling = metrics(["A", "B", "C"], [["A", "B", 10]]);
  near(dangling.A.pageRank, 20 / 77);
  near(dangling.B.pageRank, 37 / 77);
  near(dangling.C.pageRank, 20 / 77);
  const empty = metrics(["A", "B", "C"], []);
  Object.values(empty).forEach((node) => near(node.pageRank, 1 / 3));
  assert.deepEqual(Object.keys(metrics([], [])), []);
  for (const graph of [closed, dangling, empty]) near(Object.values(graph).reduce((sum, node) => sum + node.pageRank, 0), 1);
});

test("weighted PageRank satisfies the transition equations regardless of volume scale", () => {
  for (const scale of [1, 1e8]) {
    const result = metrics(["A", "B", "C"], [["A", "B", 3 * scale], ["A", "C", scale], ["B", "A", scale], ["C", "A", scale]]);
    near(result.A.pageRank, 0.05 + 0.85 * (result.B.pageRank + result.C.pageRank));
    near(result.B.pageRank, 0.05 + 0.85 * 0.75 * result.A.pageRank);
    near(result.C.pageRank, 0.05 + 0.85 * 0.25 * result.A.pageRank);
  }
});

const settings = { model: "SIR", seedRegion: "CR35", initialPct: 5, beta: 0.3, movementBeta: 2, gamma: 0.1, sigma: 0.3 };
function simulation(permission = "exports") {
  const dates = Array.from({ length: 6 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)));
  const records = dates.flatMap((time) => [["CR35", "CR35", 500], ["CR35", "CR02", 100], ["CR02", "CR35", 50], ["CR02", "CR02", 80]]
    .map(([COROP_LEV, COROP_AFN, AANTAL]) => ({ time, COROP_LEV, COROP_AFN, AANTAL })));
  const context = vm.createContext({
    Date, Map, Set, uniqueDates: dates, loadedCSVData: records,
    simulationRegionIdsByDataset: new WeakMap(), simulationLinkInterventions: new Map(),
    simulationNodeInterventions: new Map([[dates[2].getTime(), new Map([["CR35", { [permission]: false }]])]]),
    metricNames: ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"],
    d3: {
      min: (items, accessor = (item) => item) => Math.min(...Array.from(items, accessor)),
      max: (items, accessor = (item) => item) => Math.max(...Array.from(items, accessor)),
    },
  });
  vm.runInContext([
    "getNodeId", "getLinkKey", "getSimulationLinkAvailability", "getDisabledLinkKeys", "applySimulationNodePermissions",
    "collectSimulationRegionIds", "buildSimulationLedger", "estimateSimulationHoldings", "getSimulationFrameSummary", "buildSimulationTrajectory",
  ].map(extractFunction).join("\n"), context);
  return { context, trajectory: context.buildSimulationTrajectory(settings) };
}

test("simulation flow metrics respect persistent export and import controls without counting local movement", () => {
  for (const permission of ["exports", "imports"]) {
    const { trajectory } = simulation(permission);
    const metric = permission === "exports" ? "outDegree" : "inDegree";
    const stateMetric = permission === "exports" ? "outgoingPressure" : "incomingExposure";
    assert.ok(trajectory.frames[1].nodeMetrics.CR35[metric] > 0);
    for (const frame of trajectory.frames.slice(2)) {
      assert.equal(frame.nodeMetrics.CR35[metric], 0);
      assert.equal(frame.nodeStates.CR35[stateMetric], 0);
      assert.ok(frame.linkStates.get("CR35-CR35").riskLoad > 0);
      assert.equal(frame.linkStates.get("CR35-CR35").ledgerWeight, 500);
      if (permission === "exports") {
        assert.equal(frame.nodeMetrics.CR35.eigenvector, 0);
        assert.equal(frame.nodeStates.CR35.rtProxy, 0);
      }
    }
  }
  const { trajectory } = simulation();
  const first = trajectory.frames[0];
  near(first.nodeStates.CR35.outgoingPressure, 100 * 0.05 * settings.movementBeta);
  assert.equal(first.nodeStates.CR35.incomingExposure, 0);
  assert.ok(first.linkStates.get("CR35-CR35").riskLoad > 500 * 0.05 * settings.movementBeta);
});

test("within-region movement stays local when contact transmission or susceptible population is zero", () => {
  const { context } = simulation();
  for (const parameters of [{ ...settings, beta: 0 }, { ...settings, initialPct: 100 }]) {
    const trajectory = context.buildSimulationTrajectory(parameters);
    for (const frame of trajectory.frames) {
      frame.linkStates.forEach((link) => {
        assert.equal(link.local, link.source === link.target);
      });
      const local = frame.linkStates.get("CR35-CR35");
      assert.ok(local.riskLoad > 0);
      assert.equal(local.ledgerWeight, 500);
    }
  }
});

test("local and external movement retain the compartment trajectory under export controls", () => {
  const { trajectory } = simulation();
  const reference = [
    [[9311.887396414175, 0, 638.1126035858251, 50, 10000, 188.1126035858251], [440.1102926180702, 0, 9.88970738192977, 0, 450, 9.88970738192977]],
    [[9075.219100705584, 0, 810.969638935833, 113.81126035858252, 10000, 236.6682957085905], [421.68457095077304, 0, 27.32645831103396, 0.988970738192977, 450, 18.425721667297164]],
    [[8780.220164371227, 0, 1024.8716113766066, 194.90822425216584, 10000, 294.9989363343568], [405.2275080952577, 0, 41.05087533544594, 3.721616569296373, 450, 16.457062855515375]],
    [[8419.869900367998, 0, 1282.7347142421745, 297.3953853898265, 10000, 360.3502640032287], [381.7042705862494, 0, 60.46902531090967, 7.826704102840967, 450, 23.52323750900833]],
    [[7988.006523250127, 0, 1586.3246199358273, 425.668856814044, 10000, 431.86337711787013], [349.5181421415929, 0, 86.60825122447521, 13.873606633931935, 450, 32.186128444656504]],
    [[7482.474999791934, 0, 1933.2236814004373, 584.3013188076268, 10000, 505.53152345819274], [308.08799005738166, 0, 119.37757818623889, 22.534431756379455, 450, 41.43015208421121]],
  ];
  trajectory.frames.forEach((frame, index) => {
    ["CR35", "CR02"].forEach((id, regionIndex) => {
      ["S", "E", "I", "R", "N", "newInfections"].forEach((field, fieldIndex) => {
        near(frame.nodeStates[id][field], reference[index][regionIndex][fieldIndex], 1e-10);
      });
    });
  });
});
