import test from "node:test";
import assert from "node:assert/strict";
import { simulateDaily, aggregateDailyTrajectory, validateSimulationSettings, validateSimulationSchedules, simulationInputKey } from "../src/runtime/simulation-engine.js";
import { createDeclaredSyntheticPopulationSnapshot, selectPopulationScenario } from "../src/runtime/simulation-population.js";

const date = (day) => new Date(`2020-01-${String(day).padStart(2, "0")}T00:00:00Z`);
const dates = (count = 3) => Array.from({ length: count }, (_, index) => date(index + 1));
const row = (day, source = "A", target = "B", weight = 20) => ({ time: date(day), COROP_LEV: source, COROP_AFN: target, AANTAL: weight });
const settings = (changes = {}) => {
  const values = { model: "SIR", seedRegion: "A", introductionDate: "2020-01-01",
    initialPct: 10, beta: 0, movementBeta: 1, sigma: 0.25, gamma: 0.2,
    initializationConvention: changes.initialStates ? "absolute-counts" : "prevalence-shares",
    holdings: { A: 100, B: 200 }, ...changes };
  return { ...values, population: Object.hasOwn(changes, "population") ? changes.population :
    createDeclaredSyntheticPopulationSnapshot({ ids: Object.keys(values.holdings), values: values.holdings,
      referenceTime: values.introductionDate, id: "fabricated-engine-fixture" }) };
};
const inputs = (changes = {}) => ({ settings: settings(), ids: ["A", "B"], dates: dates(), data: [row(1), row(2), row(3)], ...changes });
const close = (actual, expected, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(Math.abs(expected), 1), `${actual} != ${expected}`);

// These checks describe a generic daily recurrence with artificial population units.
test("exact fractional initial state is visible before daily progression", () => {
  const result = simulateDaily(inputs({ settings: settings({ holdings: { A: 450, B: 200 }, initialPct: 0.05, gamma: 1, movementBeta: 0 }) }));
  assert.equal(result.initialFrame.nodeStates.A.I, 0.225);
  assert.equal(result.initialFrame.nodeStates.A.newInfections, 0);
  assert.equal(result.initialFrame.summary.cumulativeInfections, 0);
  assert.equal(result.frames[0].nodeStates.A.I, 0);
  assert.equal(result.frames[0].nodeStates.A.R, 0.225);
  assert.equal(result.initialFrame.intervalEnd.getTime(), date(1).getTime());
  assert.equal(result.frames[0].intervalEnd.getTime(), date(2).getTime());
});

test("introduction occurs on its exact day with a separate initial frame", () => {
  const result = simulateDaily(inputs({ settings: settings({ introductionDate: "2020-01-02" }) }));
  assert.equal(result.frames[0].summary.I, 0);
  assert.equal(result.initialFrame.date.getTime(), date(2).getTime());
  assert.equal(result.initialFrame.summary.I, 10);
  assert.ok(result.frames[1].summary.newInfections > 0);
});

test("daily exits follow the declared geometric residence law for every model", () => {
  for (const model of ["SIR", "SIS", "SEIR", "SEIRS"]) {
    const result = simulateDaily(inputs({ settings: settings({ model, beta: 0, movementBeta: 0, gamma: 0.2 }) }));
    for (const [index, frame] of result.frames.entries()) {
      close(frame.nodeStates.A.I, 10 * 0.8 ** (index + 1));
      assert.equal(frame.summary.newInfections, 0);
      for (const state of Object.values(frame.nodeStates)) {
        assert.ok([state.S, state.E, state.I, state.R].every((value) => value >= 0));
        close(state.S + state.E + state.I + state.R, state.N);
      }
    }
  }
});

test("explicit E and R states retain their mass and cannot progress twice within one day", () => {
  const result = simulateDaily(inputs({ settings: settings({ model: "SEIRS", initialPct: 0, sigma: 1, gamma: 1, omega: 0.5, movementBeta: 0,
    initialStates: { A: { S: 40, E: 20, I: 10, R: 30 }, B: { S: 200, E: 0, I: 0, R: 0 } } }) }));
  assert.equal(result.initialFrame.nodeStates.A.E, 20);
  const first = result.frames[0].nodeStates.A;
  assert.equal(first.S, 55);
  assert.equal(first.E, 0);
  assert.equal(first.I, 20);
  assert.equal(first.R, 25);
});

test("movement direction and day-start prevalence determine pressure", () => {
  const forward = simulateDaily(inputs({ dates: dates(1), data: [row(1)] }));
  const edge = forward.frames[0].linkStates.get("A-B");
  assert.equal(edge.movementPressure, 2);
  close(edge.attributedInfections, 200 * -Math.expm1(-0.01));
  assert.equal(forward.frames[0].nodeStates.A.rtProxy, 0.2);
  assert.equal(forward.frames[0].nodeStates.B.rtProxy, null);
  const reverse = simulateDaily(inputs({ settings: settings({ seedRegion: "B" }) }));
  assert.ok(reverse.frames.every((frame) => frame.nodeStates.A.I === 0));
});

test("temporal shipment order affects the path while display aggregation does not", () => {
  const make = (data) => simulateDaily(inputs({ ids: ["A", "B", "C"], data, settings: settings({ holdings: { A: 100, B: 100, C: 100 }, gamma: 0 }) }));
  const ordered = make([row(1, "A", "B", 100), row(2, "B", "C", 100)]);
  const reversed = make([row(1, "B", "C", 100), row(2, "A", "B", 100)]);
  assert.ok(ordered.frames.at(-1).nodeStates.C.I > 0);
  assert.equal(reversed.frames.at(-1).nodeStates.C.I, 0);
  const display = aggregateDailyTrajectory(ordered, [new Date("2019-12-30")]);
  assert.equal(display.dailyTrajectory, ordered);
  assert.equal(display.dailyFrames, ordered.frames);
  assert.deepEqual(display.frames[0].summary, { ...ordered.frames.at(-1).summary,
    newInfections: ordered.frames.reduce((sum, frame) => sum + frame.summary.newInfections, 0),
    contactInfections: ordered.frames.reduce((sum, frame) => sum + frame.summary.contactInfections, 0),
    movementInfections: ordered.frames.reduce((sum, frame) => sum + frame.summary.movementInfections, 0) });
});

test("local route restrictions leave the separate contact pathway active", () => {
  const result = simulateDaily(inputs({ dates: dates(1), data: [row(1, "A", "A", 100)],
    settings: settings({ beta: 0.4 }), linkInterventions: new Map([[date(1).getTime(), new Map([["A-A", true]])]]) }));
  const edge = result.frames[0].linkStates.get("A-A");
  assert.equal(edge.movementPressure, 0);
  assert.ok(edge.contactAttributedInfections > 0);
  close(edge.attributedInfections, 90 * -Math.expm1(-0.04));
});

test("movement and contact attribution sum to incidence with pressure kept separate", () => {
  const result = simulateDaily(inputs({ settings: settings({ beta: 0.4 }), data: [...inputs().data, row(1, "A", "A", 100)] }));
  for (const frame of result.frames) for (const id of result.ids) {
    const links = [...frame.linkStates.values()].filter((link) => link.target === id);
    close(links.reduce((sum, link) => sum + link.attributedInfections, 0), frame.nodeStates[id].newInfections);
    close(frame.nodeStates[id].contactInfections + frame.nodeStates[id].movementInfections, frame.nodeStates[id].newInfections);
    for (const link of links) assert.equal(link.riskLoad, link.attributedInfections);
  }
  const local = result.frames[0].linkStates.get("A-A");
  assert.equal(local.movementPressure, 10);
  assert.notEqual(local.attributedInfections, local.movementPressure + local.contactAttributedInfections);
});

test("small positive hazards are preserved without cancellation", () => {
  const result = simulateDaily(inputs({ dates: dates(1), data: [], settings: settings({ beta: 1e-17 }) }));
  close(result.frames[0].summary.newInfections / 9e-17, 1);
  assert.ok(result.frames[0].summary.newInfections > 0);
});

test("daily route restrictions expire and persistent node events execute between display labels", () => {
  const nodeInterventions = new Map([[date(2).getTime(), new Map([["A", { exports: false }]])]]);
  const nodes = simulateDaily(inputs({ nodeInterventions }));
  assert.ok(nodes.frames[0].linkStates.has("A-B"));
  assert.ok(nodes.frames.slice(1).every((frame) => !frame.linkStates.has("A-B")));
  const routes = simulateDaily(inputs({ linkInterventions: new Map([[date(2).getTime(), new Map([["A-B", true]])]]) }));
  assert.ok(routes.frames[0].linkStates.has("A-B"));
  assert.equal(routes.frames[1].linkStates.has("A-B"), false);
  assert.ok(routes.frames[2].linkStates.has("A-B"));
  assert.deepEqual(routes.boundaryIndices, [1, 2]);
  assert.ok(aggregateDailyTrajectory(routes, [date(1)]).frames[0].summary.newInfections <
    aggregateDailyTrajectory(simulateDaily(inputs()), [date(1)]).frames[0].summary.newInfections);
});

test("restriction boundaries reflect effective permissions, including overlapping controls", () => {
  const nodeInterventions = new Map([
    [date(1).getTime(), new Map([["A", { exports: false }]])],
    [date(2).getTime(), new Map([["A", { exports: false }], ["B", { imports: true }]])],
  ]);
  const linkInterventions = new Map([[date(2).getTime(), new Map([["A-B", true]])]]);
  assert.deepEqual(simulateDaily(inputs({ nodeInterventions, linkInterventions })).boundaryIndices, []);
});

test("aggregation sums interval metrics and samples final states at the actual coverage boundary", () => {
  const daily = simulateDaily(inputs());
  const coarse = aggregateDailyTrajectory(daily, [new Date("2019-12-30")]);
  assert.equal(coarse.frames[0].intervalStart.getTime(), date(1).getTime());
  assert.equal(coarse.frames[0].intervalEnd.getTime(), date(4).getTime());
  assert.equal(coarse.frames[0].nodeStates.A.I, daily.frames.at(-1).nodeStates.A.I);
  close(coarse.frames[0].nodeStates.A.rtProxy, daily.frames.reduce((sum, frame) => sum + frame.nodeStates.A.outgoingPressure, 0) /
    daily.frames.reduce((sum, frame) => sum + frame.nodeStates.A.startI, 0));
  assert.equal(coarse.frames[0].linkStates.get("A-B").sourcePrevalence, null);
  const subset = aggregateDailyTrajectory(daily, [date(2), date(3)]);
  assert.equal(subset.dailyTrajectory, daily);
  assert.equal(subset.frames[0].summary.newInfections, daily.frames[1].summary.newInfections);
  const repeated = aggregateDailyTrajectory(coarse, dates());
  assert.deepEqual(repeated.frames.map((frame) => frame.summary), daily.frames.map((frame) => frame.summary));
});

test("future ledger records cannot change a fixed-population prefix experiment", () => {
  const baseline = simulateDaily(inputs());
  const appended = simulateDaily(inputs({ data: [...inputs().data, { ...row(1), time: new Date("2030-01-01"), AANTAL: 1e8 }] }));
  assert.deepEqual(appended.frames, baseline.frames);
  assert.equal(appended.identity, baseline.identity);
});

test("canonical identity ignores input ordering and includes all numerical controls and schedules", () => {
  const base = inputs();
  const reversed = { ...base, ids: ["B", "A"], data: [...base.data].reverse(), settings: Object.fromEntries(Object.entries(base.settings).reverse()) };
  assert.equal(simulationInputKey(base), simulationInputKey(reversed));
  assert.equal(simulationInputKey(base), simulateDaily(base).identity);
  assert.notEqual(simulationInputKey(base), simulationInputKey({ ...base, settings: settings({ omega: 0.03 }) }));
  assert.notEqual(simulationInputKey(base), simulationInputKey({ ...base, nodeInterventions: new Map([[date(2).getTime(), new Map([["A", { exports: false }]])]]) }));
});

test("uniform artificial population rescaling with matching movement coefficient rescales counts", () => {
  const a = simulateDaily(inputs());
  const b = simulateDaily(inputs({ settings: settings({ holdings: { A: 300, B: 600 }, movementBeta: 3 }) }));
  for (let index = 0; index < a.frames.length; index++) for (const id of a.ids) {
    close(b.frames[index].nodeStates[id].prevalence, a.frames[index].nodeStates[id].prevalence);
    close(b.frames[index].nodeStates[id].newInfections, 3 * a.frames[index].nodeStates[id].newInfections);
  }
});

test("population reference, geography and initialization are checked and determine identity", () => {
  const base = inputs();
  assert.throws(() => simulateDaily({ ...base, settings: { ...base.settings, population: undefined } }), /snapshot/);
  assert.throws(() => simulateDaily({ ...base, settings: { ...base.settings, holdings: { A: 101, B: 200 } } }), /does not match/);
  assert.throws(() => simulateDaily({ ...base, movementGeography: "different-geography" }), /geography/);
  assert.throws(() => simulateDaily({ ...base, settings: { ...base.settings, initializationConvention: undefined } }), /initialization/);
  assert.throws(() => simulateDaily({ ...base, settings: { ...base.settings, initializationConvention: "absolute-counts" } }), /explicit initial states/);
  const named = structuredClone(base.settings.population);
  named.sourceId = named.reference.id = named.reference.sourceDefinitionId = "another-fabricated-reference";
  assert.notEqual(simulationInputKey(base), simulationInputKey({ ...base, settings: { ...base.settings, population: named } }));
  const counts = settings({ initialPct: 0, initialStates: { A: { S: 90, E: 0, I: 10, R: 0 }, B: { S: 200, E: 0, I: 0, R: 0 } } });
  assert.deepEqual(simulateDaily({ ...base, settings: counts }).initialFrame.nodeStates, simulateDaily(base).initialFrame.nodeStates);
  assert.notEqual(simulationInputKey({ ...base, settings: counts }), simulationInputKey(base));
  assert.throws(() => simulateDaily({ ...base, settings: { ...counts, initializationConvention: "prevalence-shares" } }), /initial states/);
});

test("empty regions retain zero compartments and undefined shares in daily and display output", () => {
  const result = simulateDaily(inputs({ data: [], settings: settings({ holdings: { A: 0, B: 200 } }) }));
  for (const frame of [result.initialFrame, ...result.frames, ...aggregateDailyTrajectory(result, [date(1)]).frames]) {
    const empty = frame.nodeStates.A;
    for (const key of ["S", "E", "I", "R", "N", "newInfections", "cumulativeInfections"]) assert.equal(empty[key], 0);
    for (const key of ["prevalence", "exposedShare", "recoveredShare", "rtProxy"]) assert.equal(empty[key], null);
    assert.equal(frame.summary.N, 200);
  }
  assert.deepEqual(result.seedIds, []);
  const empty = simulateDaily(inputs({ data: [], settings: settings({ holdings: { A: 0, B: 0 } }) }));
  for (const key of ["prevalence", "exposedShare", "recoveredShare"]) assert.equal(empty.frames[0].summary[key], null);
});

test("positive movement involving empty stock is a domain conflict even when a route is restricted", () => {
  for (const holdings of [{ A: 0, B: 200 }, { A: 100, B: 0 }]) {
    assert.throws(() => simulateDaily(inputs({ settings: settings({ holdings }),
      linkInterventions: new Map([[date(1).getTime(), new Map([["A-B", true]])]]) })), /zero-stock/);
  }
});

test("a final population product supplies fractional counts and declared geography", () => {
  const values = { A: 120.5, B: 200 };
  const reference = { id: "fabricated-animal-reference", measure: "point-occupied-stock", countUnit: "animal",
    timeReference: { kind: "instant", date: "2019-12-31" }, geographicAttribution: "animal-site",
    geographyVersion: "fabricated-boundaries-2019", movementGeography: "COROP", accessClass: "public",
    evidence: "assumption-based-reference", assumptions: ["A fixed population is assumed throughout this fabricated experiment."],
  };
  const population = selectPopulationScenario({ schemaVersion: 1, kind: "population-product", reference,
    scenarios: [{ id: "reference", values }] }, "reference");
  const base = inputs({ settings: settings({ population, holdings: values }), movementGeography: "COROP" });
  const trajectory = simulateDaily(base);
  assert.equal(trajectory.initialFrame.summary.N, 320.5);
  assert.equal(trajectory.settings.population.reference.id, reference.id);
  assert.equal(simulateDaily({ ...base, movementGeography: undefined }).identity, trajectory.identity);
  assert.throws(() => simulateDaily({ ...base, movementGeography: "incompatible" }), /geography/);
  assert.equal(simulateDaily({ ...base, dates: dates(4) }).settings.population.reference.evidence, "assumption-based-reference");
  assert.equal(simulateDaily({ ...base, data: [...base.data, { ...row(1), time: new Date("2030-01-01"), AANTAL: 5000 }] }).identity, trajectory.identity);
});

test("invalid settings fail at the shared numerical boundary", () => {
  for (const patch of [
    { beta: NaN }, { beta: Infinity }, { beta: -1 }, { gamma: -1 }, { sigma: 1.01 }, { omega: null },
    { model: "SIRD" }, { seedRegion: "X" }, { introductionDate: "2020-02-30" }, { introductionDate: "2020-01-01T00:00Z" },
    { initialPct: NaN }, { initialPct: 101 }, { initialExposedPct: 1 }, { engine: "per-record-v1" },
    { holdings: { A: 100 } }, { holdings: { A: 0, B: 200 } }, { holdings: { A: Infinity, B: 200 } }, { mystery: 1 },
  ]) assert.throws(() => simulateDaily(inputs({ settings: settings(patch) })), JSON.stringify(patch));
  assert.throws(() => validateSimulationSettings(settings({ model: "SEIR", initialPct: 90, initialExposedPct: 11 }), ["A", "B"]));
  assert.throws(() => validateSimulationSettings(settings({ model: "SIS", initialRecoveredPct: 1 }), ["A", "B"]));
  const { holdings, population, ...withoutPopulation } = settings();
  assert.throws(() => validateSimulationSettings(withoutPopulation, ["A", "B"]));
  assert.equal(validateSimulationSettings(withoutPopulation, ["A", "B"], { requirePopulation: false }).holdings, undefined);
  assert.equal(validateSimulationSettings(settings({ beta: 9 }), ["A", "B"]).beta, 9);
});

test("invalid calendars, observations, schedules and arithmetic overflow fail explicitly", () => {
  for (const changes of [
    { dates: [date(1), date(3)] }, { dates: [date(1), date(1)] }, { dates: [new Date("2020-01-01T01:00Z")] },
    { settings: settings({ introductionDate: "2019-12-31" }) },
    { data: [row(1, "A", "X")] }, { data: [row(1, "A", "B", NaN)] }, { data: [row(1, "A", "B", 0)] },
    { data: [row(1, "A", "B", "")] },
    { linkInterventions: new Map([[date(4).getTime(), new Map([["A-B", true]])]]) },
    { nodeInterventions: new Map([[date(2).getTime() + 1, new Map([["A", { exports: false }]])]]) },
    { nodeInterventions: new Map([[date(2).getTime(), new Map([["A", { exports: 0 }]])]]) },
    { settings: settings({ movementBeta: 1e308 }), data: [row(1, "A", "B", 1e308)] },
  ]) assert.throws(() => simulateDaily(inputs(changes)));
  assert.doesNotThrow(() => simulateDaily(inputs({ data: [row(1, "NA", "B", NaN)] })));
  assert.doesNotThrow(() => validateSimulationSchedules({ ids: ["A", "B"], dates: dates(),
    nodeInterventions: new Map([[date(4).getTime(), new Map([["A", { exports: false }]])]]) }));
});
