import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
  new URL("../public/assets/js/herdlink-runtime.js", import.meta.url),
  "utf8",
);
const functions = [
  "isSimulationModeActive", "getNodeId", "getLinkKey", "getDisabledLinkKeys",
  "setSimulationLinkIntervention", "getSimulationLinkAvailability",
  "setSimulationNodeIntervention", "getSimulationNodePermissions", "applySimulationNodePermissions",
  "getSimulationRestrictionTimeline",
  "setAllSimulationNodePermissions",
  "setTradeEdgeScales", "collectSimulationRegionIds",
  "buildSimulationLedger", "estimateSimulationHoldings",
  "getSimulationFrameSummary", "buildSimulationTrajectory", "applySimulationFrame",
  "initNodesAndLinks", "restoreLinks", "getSimulationTrajectoryPath",
].map((name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}).join("\n");

const settings = {
  model: "SIR", seedRegion: "CR01", initialPct: 5,
  beta: 0, movementBeta: 2, gamma: 0, sigma: 0.3,
};

function runtime(edges = [["CR01", "CR02", 1000], ["CR02", "CR01", 100], ["CR02", "CR03", 100]]) {
  const uniqueDates = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(2020, 0, 1 + i * 7)));
  const loadedCSVData = uniqueDates.flatMap((time) => edges.map(([COROP_LEV, COROP_AFN, AANTAL]) => ({
    COROP_LEV, COROP_AFN, AANTAL, time,
  })));
  const values = (items, accessor = (item) => item) => Array.from(items, accessor);
  const context = vm.createContext({
    Date, Map, Set, uniqueDates, loadedCSVData,
    appDataMode: "simulation", allNodes: [], allLinks: [], nlLabelPoints: null,
    simulationState: {}, simulationLinkInterventions: new Map(),
    simulationNodeInterventions: new Map(),
    window: { currentDate: uniqueDates[0] }, tradeIntensity: null, exposureIntensity: null,
    metricNames: ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"],
    d3: {
      min: (items, accessor) => Math.min(...values(items, accessor)),
      max: (items, accessor) => Math.max(...values(items, accessor)),
      sum: (items, accessor) => values(items, accessor).reduce((sum, value) => sum + value, 0),
      extent: (items, accessor) => [Math.min(...values(items, accessor)), Math.max(...values(items, accessor))],
      scaleSequential: () => ({ domain: () => null }),
      curveMonotoneX: "smooth", curveStepAfter: "step",
    },
  });
  vm.runInContext(functions, context);
  context.initNodesAndLinks(loadedCSVData.filter((row) => row.time === uniqueDates[0]));
  return context;
}

function toggle(context, sourceId, targetId, disabled, date = context.uniqueDates[0]) {
  context.setSimulationLinkIntervention(`${sourceId}-${targetId}`, disabled, date);
}

function snapshot(trajectory) {
  return JSON.stringify(trajectory, (_, value) => value instanceof Map ? Array.from(value) : value);
}

function recordTrajectoryPath(context, points) {
  context.simulationState.trajectory = context.buildSimulationTrajectory(settings);
  const calls = [];
  let curve;
  const generator = (segment) => {
    calls.push([curve, Array.from(segment, (point) => point.id)]);
    return `M${calls.length}`;
  };
  generator.curve = (value) => {
    curve = value;
    return generator;
  };
  const path = context.getSimulationTrajectoryPath(points, generator);
  return { path, calls };
}

test("restriction timelines show chronological states, merged periods, and reopened regions", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  const times = dates.map(Number);
  context.setSimulationNodeIntervention("CR02", "exports", true, dates[4]);
  context.setSimulationNodeIntervention("CR02", "imports", false, dates[2]);
  context.setSimulationNodeIntervention("CR02", "exports", false, dates[1]);
  context.setSimulationNodeIntervention("CR02", "imports", true, dates[4]);
  context.setSimulationNodeIntervention("CR02", "exports", false, dates[3]);
  context.setSimulationNodeIntervention("CR01", "imports", false, dates[5]);
  context.setSimulationNodeIntervention("CR03", "exports", true, dates[0]);
  const timeline = JSON.parse(JSON.stringify(context.getSimulationRestrictionTimeline(
    ["CR01", "CR02", "CR03"], dates,
  )));
  assert.deepEqual(timeline, {
    start: times[0], end: times[5], rows: [
      {
        id: "CR01",
        segments: [{ start: times[0], end: times[5], exports: true, imports: true }],
        points: [{ time: times[5], exports: true, imports: false, changes: { imports: false } }],
      },
      {
        id: "CR02",
        segments: [
          { start: times[0], end: times[1], exports: true, imports: true },
          { start: times[1], end: times[2], exports: false, imports: true },
          { start: times[2], end: times[4], exports: false, imports: false },
          { start: times[4], end: times[5], exports: true, imports: true },
        ],
        points: [
          { time: times[1], exports: false, imports: true, changes: { exports: false } },
          { time: times[2], exports: false, imports: false, changes: { imports: false } },
          { time: times[4], exports: true, imports: true, changes: { exports: true, imports: true } },
        ],
      },
    ],
  });
});

test("restriction timelines retain events before, between, and after sampled dates without mutating them", () => {
  const context = runtime();
  const [first, second] = context.uniqueDates;
  const before = first.getTime() - 1234;
  const between = first.getTime() + 1234;
  const after = second.getTime() + 1234;
  const interventions = new Map([
    [after, new Map([["CR01", { imports: true }]])],
    [before, new Map([["CR01", { imports: false }]])],
    [between, new Map([["CR01", { exports: false }]])],
  ]);
  const input = snapshot(interventions);
  const result = context.getSimulationRestrictionTimeline(["CR01"], [first, second], interventions);
  assert.equal(result.start, before);
  assert.equal(result.end, after);
  assert.deepEqual(Array.from(result.rows[0].points, ({ time }) => time), [before, between, after]);
  assert.deepEqual(Array.from(result.rows[0].segments, ({ start, end }) => [start, end]), [
    [before, between], [between, after],
  ]);
  assert.equal(snapshot(interventions), input);
  assert.equal(context.simulationNodeInterventions.size, 0);
});

test("restriction timelines handle empty schedules and a restriction at a single instant", () => {
  const context = runtime();
  assert.equal(snapshot(context.getSimulationRestrictionTimeline([], [])),
    JSON.stringify({ start: null, end: null, rows: [] }));
  const date = context.uniqueDates[0];
  const time = date.getTime();
  assert.equal(snapshot(context.getSimulationRestrictionTimeline(["CR01"], [date])),
    JSON.stringify({ start: time, end: time, rows: [] }));
  context.setSimulationNodeIntervention("CR01", "exports", false, date);
  assert.equal(snapshot(context.getSimulationRestrictionTimeline(["CR01"], [])), JSON.stringify({
    start: time, end: time,
    rows: [{ id: "CR01", segments: [], points: [
      { time, exports: false, imports: true, changes: { exports: false } },
    ] }],
  }));
});

test("the selected seed region alone starts infected", () => {
  const context = runtime([["CR01", "CR35", 1000], ["CR35", "CR02", 100]]);
  for (const seedRegion of ["CR35", "CR01", "CR02"]) {
    const trajectory = context.buildSimulationTrajectory({ ...settings, seedRegion, movementBeta: 0 });
    assert.deepEqual(Array.from(trajectory.seedIds), [seedRegion]);
    const states = trajectory.frames[0].nodeStates;
    assert.deepEqual(Object.keys(states).filter((id) => states[id].I > 0), [seedRegion]);
    assert.ok(Math.abs(states[seedRegion].I / states[seedRegion].N - settings.initialPct / 100) < 1e-12);
  }
});

test("trajectory paths use smooth curves without intervention boundaries and accept empty or single frames", () => {
  const context = runtime();
  const points = context.uniqueDates.map((date, id) => ({ date, id }));
  assert.deepEqual(recordTrajectoryPath(context, []), { path: null, calls: [] });
  assert.deepEqual(recordTrajectoryPath(context, points.slice(0, 1)), {
    path: "M1", calls: [["smooth", [0]]],
  });
  assert.deepEqual(recordTrajectoryPath(context, points), {
    path: "M1", calls: [["smooth", [0, 1, 2, 3, 4, 5]]],
  });
});

test("trajectory paths isolate intervention intervals from smooth line and stacked area periods", () => {
  const context = runtime();
  const points = context.uniqueDates.map((date, id) => ({ date, id }));
  toggle(context, "CR01", "CR02", true, context.uniqueDates[2]);
  const expected = {
    path: "M1M2M3M4",
    calls: [["smooth", [0, 1]], ["step", [1, 2]], ["step", [2, 3]], ["smooth", [3, 4, 5]]],
  };
  assert.deepEqual(recordTrajectoryPath(context, points), expected);
  const stackedPoints = points.map((point) => ({ id: point.id, data: point }));
  assert.deepEqual(recordTrajectoryPath(context, stackedPoints), expected);
});

test("consecutive and final intervention boundaries connect every frame without singleton periods", () => {
  const context = runtime();
  const points = context.uniqueDates.map((date, id) => ({ date, id }));
  toggle(context, "CR01", "CR02", true, context.uniqueDates[1]);
  toggle(context, "CR01", "CR02", false, context.uniqueDates[2]);
  toggle(context, "CR02", "CR03", true, context.uniqueDates[5]);
  assert.deepEqual(recordTrajectoryPath(context, points), {
    path: "M1M2M3M4",
    calls: [["step", [0, 1]], ["step", [1, 2]], ["smooth", [2, 3, 4]], ["step", [4, 5]]],
  });
});

test("unchanged node restrictions and edits outside sampled dates keep trajectory curves smooth", () => {
  const context = runtime();
  const points = context.uniqueDates.map((date, id) => ({ date, id }));
  const expected = { path: "M1", calls: [["smooth", [0, 1, 2, 3, 4, 5]]] };
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[0]);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[3]);
  context.setSimulationNodeIntervention("CR02", "imports", true, context.uniqueDates[4]);
  assert.deepEqual(recordTrajectoryPath(context, points), expected);

  context.simulationNodeInterventions.clear();
  toggle(context, "CR01", "CR02", true, new Date(context.uniqueDates[1].getTime() + 1));
  assert.deepEqual(recordTrajectoryPath(context, points), expected);
});

test("simulation folds each dated event once and charts reuse only changed restriction boundaries", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setAllSimulationNodePermissions("exports", false, dates[1]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[3]);
  toggle(context, "CR01", "CR02", true, dates[2]);
  context.setAllSimulationNodePermissions("exports", true, dates[4]);

  let appliedEvents = 0;
  const applyPermissions = context.applySimulationNodePermissions;
  context.applySimulationNodePermissions = (...args) => {
    appliedEvents += 1;
    return applyPermissions(...args);
  };
  const trajectory = context.buildSimulationTrajectory(settings);
  assert.equal(appliedEvents, 3);
  assert.deepEqual(Array.from(trajectory.boundaryIndices), [1, 4]);
  context.simulationState.trajectory = trajectory;
  context.getDisabledLinkKeys = context.getSimulationNodePermissions = () => {
    throw new Error("Chart rendering must not recompute restrictions");
  };
  const segments = [];
  const generator = (points) => {
    segments.push(points.map((point) => point.id));
    return "M";
  };
  generator.curve = () => generator;
  const points = dates.map((date, id) => ({ date, id }));
  assert.equal(context.getSimulationTrajectoryPath(points, generator), "MMMM");
  assert.deepEqual(segments, [[0, 1], [1, 2, 3], [3, 4], [4, 5]]);
  assert.equal(appliedEvents, 3);
});

test("link availability changes one date and removing the edit reproduces the baseline", () => {
  const context = runtime();
  const baseline = context.buildSimulationTrajectory(settings);
  assert.deepEqual(Array.from(baseline.seedIds), ["CR01"]);
  assert.ok(baseline.frames[0].nodeStates.CR02.newInfections > 0);
  assert.ok(baseline.frames[1].nodeStates.CR03.newInfections > 0);

  toggle(context, "CR01", "CR02", true);
  const blocked = context.buildSimulationTrajectory(settings);
  assert.deepEqual(blocked.holdings, baseline.holdings);
  assert.deepEqual(blocked.seedIds, baseline.seedIds);
  assert.equal(blocked.frames[0].nodeStates.CR02.I, 0);
  assert.equal(blocked.frames[0].nodeStates.CR01.outgoingPressure, 0);
  assert.equal(blocked.frames[0].linkStates.has("CR01-CR02"), false);
  for (const frame of blocked.frames.slice(1)) {
    assert.ok(frame.linkStates.get("CR01-CR02").riskLoad > 0);
    assert.equal(context.getSimulationLinkAvailability(frame.date).size, 0);
  }
  assert.equal(blocked.frames[1].nodeStates.CR03.I, 0);
  assert.ok(blocked.frames[2].nodeStates.CR03.I > 0);
  assert.notEqual(snapshot(blocked.frames[5]), snapshot(baseline.frames[5]));

  toggle(context, "CR01", "CR02", false);
  assert.equal(context.simulationLinkInterventions.size, 0);
  assert.equal(snapshot(context.buildSimulationTrajectory(settings)), snapshot(baseline));
});

test("a date-specific link edit preserves earlier frames and affects later infections", () => {
  const context = runtime();
  const baseline = context.buildSimulationTrajectory(settings);
  toggle(context, "CR01", "CR02", true, context.uniqueDates[2]);
  const blocked = context.buildSimulationTrajectory(settings);

  assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
  assert.deepEqual(blocked.holdings, baseline.holdings);
  assert.deepEqual(blocked.seedIds, baseline.seedIds);
  assert.equal(blocked.frames[2].nodeStates.CR02.incomingExposure, 0);
  assert.equal(blocked.frames[2].nodeStates.CR02.newInfections, 0);
  assert.equal(blocked.frames[2].linkStates.has("CR01-CR02"), false);
  assert.ok(blocked.frames[2].nodeStates.CR02.I < baseline.frames[2].nodeStates.CR02.I);
  assert.ok(blocked.frames[3].nodeStates.CR03.I < baseline.frames[3].nodeStates.CR03.I);
  assert.ok(blocked.frames[3].linkStates.get("CR01-CR02").riskLoad > 0);
  assert.ok(blocked.frames[2].linkStates.get("CR02-CR01").riskLoad > 0);
});

test("node exports stay restricted for every partner, including a route first seen on a future date", () => {
  const context = runtime();
  context.loadedCSVData.push({
    COROP_LEV: "CR01", COROP_AFN: "CR41", AANTAL: 100,
    time: context.uniqueDates[4],
  });
  const baseline = context.buildSimulationTrajectory(settings);
  assert.ok(baseline.frames[4].linkStates.get("CR01-CR41").riskLoad > 0);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[2]);
  const blocked = context.buildSimulationTrajectory(settings);

  assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
  for (const frame of blocked.frames.slice(2)) {
    const disabled = context.getDisabledLinkKeys(frame.date);
    for (const id of blocked.ids) {
      assert.equal(disabled.has(`CR01-${id}`), id !== "CR01");
      assert.equal(disabled.has(`${id}-CR01`), false);
    }
    assert.equal(frame.nodeStates.CR01.outgoingPressure, 0);
    assert.equal(frame.linkStates.has("CR01-CR02"), false);
    assert.equal(frame.linkStates.has("CR01-CR41"), false);
    assert.ok(frame.linkStates.get("CR02-CR01").riskLoad > 0);
  }
});

test("node imports restrict every source without stopping the node's exports", () => {
  const context = runtime();
  context.setSimulationNodeIntervention("CR02", "imports", false, context.uniqueDates[2]);
  const blocked = context.buildSimulationTrajectory(settings);
  for (const frame of blocked.frames.slice(2)) {
    const disabled = context.getDisabledLinkKeys(frame.date);
    for (const id of blocked.ids) {
      assert.equal(disabled.has(`${id}-CR02`), id !== "CR02");
      assert.equal(disabled.has(`CR02-${id}`), false);
    }
    assert.equal(frame.nodeStates.CR02.incomingExposure, 0);
    assert.equal(frame.linkStates.has("CR01-CR02"), false);
    assert.ok(frame.linkStates.get("CR02-CR01").riskLoad > 0);
    assert.ok(frame.linkStates.get("CR02-CR03").riskLoad > 0);
  }
});

test("bulk permissions cover every region, including future partners, without changing earlier frames or the other direction", () => {
  for (const direction of ["exports", "imports"]) {
    const context = runtime();
    context.loadedCSVData.push({
      COROP_LEV: "CR01", COROP_AFN: "CR41", AANTAL: 100,
      time: context.uniqueDates[4],
    });
    const baseline = context.buildSimulationTrajectory(settings);
    assert.ok(baseline.frames[4].linkStates.get("CR01-CR41").riskLoad > 0);
    context.setAllSimulationNodePermissions(direction, false, context.uniqueDates[2]);
    const blocked = context.buildSimulationTrajectory(settings);
    const otherDirection = direction === "exports" ? "imports" : "exports";

    assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
    for (const frame of blocked.frames.slice(2)) {
      const permissions = context.getSimulationNodePermissions(frame.date);
      const disabled = context.getDisabledLinkKeys(frame.date);
      for (const id of blocked.ids) {
        assert.equal(permissions.get(id)[direction], false, `${direction}: ${id}`);
        assert.equal(permissions.get(id)[otherDirection], true, `${otherDirection}: ${id}`);
        assert.equal(disabled.has(`${id}-${id}`), false);
        for (const partner of blocked.ids) {
          if (id !== partner) assert.equal(disabled.has(`${id}-${partner}`), true);
        }
      }
      assert.equal(frame.linkStates.size, 0);
    }
  }
});

test("bulk reopening preserves history, independent imports, date availability, and future scheduled restrictions", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setSimulationNodeIntervention("CR02", "imports", false, dates[1]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[5]);
  toggle(context, "CR02", "CR03", true, dates[4]);
  context.setAllSimulationNodePermissions("exports", false, dates[2]);
  const blocked = context.buildSimulationTrajectory(settings);
  const dateAvailability = snapshot(context.simulationLinkInterventions);
  const futureRestriction = snapshot(context.simulationNodeInterventions.get(dates[5].getTime()));

  context.setAllSimulationNodePermissions("exports", true, dates[4]);
  const reopened = context.buildSimulationTrajectory(settings);
  assert.equal(snapshot(reopened.frames.slice(0, 4)), snapshot(blocked.frames.slice(0, 4)));
  assert.equal(snapshot(context.simulationLinkInterventions), dateAvailability);
  assert.equal(snapshot(context.simulationNodeInterventions.get(dates[5].getTime())), futureRestriction);
  for (const id of reopened.ids) {
    const permissions = context.getSimulationNodePermissions(dates[4]).get(id);
    assert.equal(permissions.exports, true);
    assert.equal(permissions.imports, id !== "CR02");
    assert.equal(context.getSimulationNodePermissions(dates[5]).get(id).exports, id !== "CR01");
  }
  const disabled = context.getDisabledLinkKeys(dates[4]);
  assert.equal(disabled.has("CR01-CR02"), true);
  assert.equal(disabled.has("CR02-CR03"), true);
  assert.equal(disabled.has("CR02-CR01"), false);
  assert.equal(context.getSimulationLinkAvailability(dates[5]).size, 0);
});

test("re-enabling exports preserves restriction history and leaves imports independently restricted", () => {
  const context = runtime();
  const baseline = context.buildSimulationTrajectory(settings);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR01", "imports", false, context.uniqueDates[3]);
  const blocked = context.buildSimulationTrajectory(settings);
  context.setSimulationNodeIntervention("CR01", "exports", true, context.uniqueDates[4]);
  const reopened = context.buildSimulationTrajectory(settings);

  assert.equal(snapshot(reopened.frames.slice(0, 4)), snapshot(blocked.frames.slice(0, 4)));
  for (const frame of reopened.frames.slice(4)) {
    assert.ok(frame.linkStates.get("CR01-CR02").riskLoad > 0);
    assert.equal(frame.linkStates.has("CR02-CR01"), false);
    assert.equal(context.getSimulationNodePermissions(frame.date).get("CR01").exports, true);
    assert.equal(context.getSimulationNodePermissions(frame.date).get("CR01").imports, false);
  }
  assert.ok(reopened.frames[5].nodeStates.CR03.I > blocked.frames[5].nodeStates.CR03.I);
  assert.ok(reopened.frames[5].nodeStates.CR03.I < baseline.frames[5].nodeStates.CR03.I);
});

test("date availability, source exports, and target imports must all permit a route", () => {
  const context = runtime();
  const date = context.uniqueDates[2];
  toggle(context, "CR01", "CR02", true, date);
  context.setSimulationNodeIntervention("CR01", "exports", false, date);
  context.setSimulationNodeIntervention("CR02", "imports", false, date);

  toggle(context, "CR01", "CR02", false, date);
  assert.equal(context.getSimulationLinkAvailability(date).has("CR01-CR02"), false);
  assert.equal(context.getDisabledLinkKeys(date).has("CR01-CR02"), true);
  context.setSimulationNodeIntervention("CR01", "exports", true, date);
  assert.equal(context.getDisabledLinkKeys(date).has("CR01-CR02"), true);
  toggle(context, "CR01", "CR02", true, date);
  context.setSimulationNodeIntervention("CR02", "imports", true, date);
  assert.equal(context.getDisabledLinkKeys(date).has("CR01-CR02"), true);
  toggle(context, "CR01", "CR02", false, date);
  assert.equal(context.getDisabledLinkKeys(date).has("CR01-CR02"), false);
});

test("Restore clears both schedules across past and future dates when the current date has every route enabled", () => {
  const context = runtime();
  const baseline = context.buildSimulationTrajectory(settings);
  toggle(context, "CR01", "CR02", true, context.uniqueDates[1]);
  context.setSimulationNodeIntervention("CR02", "imports", false, context.uniqueDates[1]);
  context.setSimulationNodeIntervention("CR02", "imports", true, context.uniqueDates[2]);
  toggle(context, "CR02", "CR03", true, context.uniqueDates[4]);
  context.setSimulationNodeIntervention("CR03", "exports", false, context.uniqueDates[4]);
  context.window.currentDate = context.uniqueDates[3];
  assert.equal(context.getDisabledLinkKeys(context.window.currentDate).size, 0);
  context.simulationState.trajectory = context.buildSimulationTrajectory(settings);
  assert.notEqual(snapshot(context.simulationState.trajectory), snapshot(baseline));

  const recomputes = [];
  Object.assign(context, {
    document: { getElementById: () => ({}) },
    selectedNodeData: null, annotationGroup: null,
    scheduleSimulationRecompute: (reason) => {
      recomputes.push(reason);
      context.simulationState.trajectory = context.buildSimulationTrajectory(settings);
    },
  });
  context.d3.selectAll = () => ({ property() {} });
  for (const name of [
    "updateTradeTable", "updateInOutArbos", "updateTradeNodeInsight", "updateNetwork",
    "updateDonutCharts", "updateNetworkStats", "debouncedUpdateHotspotMarks", "computeSCCs",
    "updateSCCs", "updateAnnotationForNode", "disableAllCheckboxes", "enableAllCheckboxes",
    "renderSimulationNodeControls",
  ]) context[name] = () => {};

  context.restoreLinks();

  assert.equal(context.simulationLinkInterventions.size, 0);
  assert.equal(context.simulationNodeInterventions.size, 0);
  assert.equal(recomputes.length, 1);
  for (const date of context.uniqueDates) {
    assert.equal(context.getDisabledLinkKeys(date).size, 0);
  }
  assert.equal(snapshot(context.simulationState.trajectory), snapshot(baseline));
  assert.equal(context.allLinks.some((link) => link.disabled), false);
});

test("backdated and same-date availability edits leave other dates independent", () => {
  const context = runtime();
  const [d0, d1, d2, d3, d4, d5] = context.uniqueDates;
  toggle(context, "CR01", "CR02", true, d2);
  toggle(context, "CR01", "CR02", true, d4);
  toggle(context, "CR02", "CR03", true, d3);
  toggle(context, "CR02", "CR03", true, d5);
  toggle(context, "CR01", "CR02", true, d1);
  const before = context.buildSimulationTrajectory(settings);
  toggle(context, "CR01", "CR02", false, d2);
  toggle(context, "CR02", "CR03", false, d2);
  toggle(context, "CR01", "CR02", false, d0);
  const after = context.buildSimulationTrajectory(settings);
  const expected = [[], ["CR01-CR02"], [], ["CR02-CR03"], ["CR01-CR02"], ["CR02-CR03"]];
  context.uniqueDates.forEach((date, index) => {
    assert.deepEqual(Array.from(context.getDisabledLinkKeys(date)).sort(), expected[index]);
  });
  assert.equal(snapshot(after.frames.slice(0, 2)), snapshot(before.frames.slice(0, 2)));
  assert.ok(after.frames[2].linkStates.get("CR01-CR02").riskLoad > 0);
  assert.equal(after.frames[3].linkStates.has("CR02-CR03"), false);
  assert.equal(after.frames[4].linkStates.has("CR01-CR02"), false);
  assert.equal(after.frames[5].linkStates.has("CR02-CR03"), false);
});

test("node events fold in date order and preserve later permissions after a backdated edit", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setSimulationNodeIntervention("CR01", "exports", true, dates[4]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[2]);
  context.setSimulationNodeIntervention("CR01", "imports", false, dates[3]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[1]);
  context.setSimulationNodeIntervention("CR01", "exports", true, dates[2]);
  const expectedExports = [true, false, true, true, true, true];
  dates.forEach((date, index) => {
    const permissions = context.getSimulationNodePermissions(date).get("CR01");
    assert.equal(permissions?.exports ?? true, expectedExports[index]);
    assert.equal(permissions?.imports ?? true, index < 3);
  });
});

test("restriction start dates span redundant events and reset after reopening", () => {
  const context = runtime();
  const dates = context.uniqueDates;
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[2]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[1]);
  context.setSimulationNodeIntervention("CR01", "imports", false, dates[2]);
  let permission = context.getSimulationNodePermissions(dates[3]).get("CR01");
  assert.equal(permission.exportsSince, dates[1].getTime());
  assert.equal(permission.importsSince, dates[2].getTime());
  assert.equal(context.simulationNodeInterventions.get(dates[2].getTime()).get("CR01").exports, false);

  context.setSimulationNodeIntervention("CR01", "exports", true, dates[3]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[4]);
  context.setSimulationNodeIntervention("CR01", "exports", false, dates[5]);
  assert.equal(context.getSimulationNodePermissions(dates[3]).get("CR01").exports, true);
  permission = context.getSimulationNodePermissions(dates[5]).get("CR01");
  assert.equal(permission.exportsSince, dates[4].getTime());
  assert.equal(permission.importsSince, dates[2].getTime());
});

test("a node intervention between frame dates first affects the next frame", () => {
  const context = runtime();
  const baseline = context.buildSimulationTrajectory(settings);
  const between = new Date((context.uniqueDates[1].getTime() + context.uniqueDates[2].getTime()) / 2);
  context.setSimulationNodeIntervention("CR01", "exports", false, between);
  const blocked = context.buildSimulationTrajectory(settings);
  assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
  for (const frame of blocked.frames.slice(2)) {
    assert.equal(frame.linkStates.has("CR01-CR02"), false);
    assert.equal(frame.nodeStates.CR02.incomingExposure, 0);
  }
  assert.ok(blocked.frames[2].nodeStates.CR02.I < baseline.frames[2].nodeStates.CR02.I);
});

test("node movement restrictions preserve local transmission and self-loop movements", () => {
  const context = runtime([["CR01", "CR01", 1000]]);
  const localSettings = { ...settings, beta: 0.3 };
  const baseline = context.buildSimulationTrajectory(localSettings);
  assert.ok(baseline.frames[0].nodeStates.CR01.newInfections > 0);
  assert.ok(baseline.frames[0].nodeStates.CR01.incomingExposure > 0);
  context.setSimulationNodeIntervention("CR01", "exports", false, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR01", "imports", false, context.uniqueDates[2]);
  assert.equal(snapshot(context.buildSimulationTrajectory(localSettings).frames), snapshot(baseline.frames));

  toggle(context, "CR01", "CR01", true, context.uniqueDates[2]);
  const blocked = context.buildSimulationTrajectory(localSettings);
  assert.equal(snapshot(blocked.frames.slice(0, 2)), snapshot(baseline.frames.slice(0, 2)));
  assert.equal(blocked.frames[2].nodeStates.CR01.newInfections, 0);
  assert.equal(blocked.frames[2].nodeStates.CR01.incomingExposure, 0);
  assert.equal(blocked.frames[2].linkStates.has("CR01-CR01"), false);
  assert.equal(blocked.frames[2].nodeStates.CR01.I, blocked.frames[1].nodeStates.CR01.I);
  assert.ok(blocked.frames[3].nodeStates.CR01.newInfections > 0);
  assert.ok(blocked.frames[3].linkStates.get("CR01-CR01").riskLoad > 0);
  toggle(context, "CR01", "CR01", false, context.uniqueDates[2]);
  assert.equal(snapshot(context.buildSimulationTrajectory(localSettings).frames), snapshot(baseline.frames));
});

test("replay applies both intervention scopes and restores flags when stepping backward", () => {
  const context = runtime();
  toggle(context, "CR01", "CR02", true, context.uniqueDates[2]);
  toggle(context, "CR01", "CR01", true, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR02", "exports", false, context.uniqueDates[3]);
  context.setSimulationNodeIntervention("CR02", "exports", true, context.uniqueDates[5]);
  context.simulationState.trajectory = context.buildSimulationTrajectory(settings);
  for (const index of [0, 2, 4, 5, 3, 1]) {
    const date = context.uniqueDates[index];
    context.window.currentDate = date;
    context.initNodesAndLinks(context.loadedCSVData.filter((row) => row.time === date));
    const expected = index === 2 ? ["CR01-CR01", "CR01-CR02"]
      : index === 3 || index === 4 ? context.simulationState.trajectory.ids
        .filter((id) => id !== "CR02").map((id) => `CR02-${id}`).sort() : [];
    const disabledFlags = () => context.allLinks.filter((link) => link.disabled)
      .map((link) => context.getLinkKey(link.source, link.target)).sort();
    assert.deepEqual(Array.from(disabledFlags()), Array.from(expected));
    context.allLinks.forEach((link) => { link.disabled = true; });
    assert.equal(context.applySimulationFrame(date), true);
    assert.deepEqual(Array.from(disabledFlags()), Array.from(expected));
    assert.equal(context.enabledLinks.some((link) => link.disabled), false);
    assert.equal(snapshot(context.simulationState.currentFrame), snapshot(context.simulationState.trajectory.frames[index]));
  }
});

test("all compartment models conserve holdings with restricted links", () => {
  const context = runtime();
  toggle(context, "CR02", "CR01", true, context.uniqueDates[1]);
  toggle(context, "CR02", "CR02", true, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR02", "exports", false, context.uniqueDates[2]);
  context.setSimulationNodeIntervention("CR03", "imports", false, context.uniqueDates[3]);
  context.setSimulationNodeIntervention("CR02", "exports", true, context.uniqueDates[4]);
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    const trajectory = context.buildSimulationTrajectory({ ...settings, model, beta: 0.4, gamma: 0.2 });
    for (const frame of trajectory.frames) {
      for (const [id, state] of Object.entries(frame.nodeStates)) {
        assert.equal(state.N, trajectory.holdings.get(id));
        assert.ok(Math.abs(state.S + state.E + state.I + state.R - state.N) < 1e-8, `${model}: ${id}`);
        assert.ok([state.S, state.E, state.I, state.R].every((value) => Number.isFinite(value) && value >= 0));
      }
      assert.ok(Math.abs(frame.summary.S + frame.summary.E + frame.summary.I + frame.summary.R - frame.summary.N) < 1e-8);
    }
  }
});
