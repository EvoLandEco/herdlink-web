import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  estimateSyntheticHoldings, estimateSyntheticPopulation,
  createSyntheticPopulationSnapshot, hashSimulationContent,
  createDeclaredSyntheticPopulationSnapshot, validatePopulationSnapshot,
  selectPopulationScenario, selectInventoryScenario, isPrivatePopulation,
} from "../src/runtime/simulation-population.js";

const ids = ["A", "B", "C"];
const movement = (date, source, target, weight) => ({
  time: new Date(date), COROP_LEV: source, COROP_AFN: target, AANTAL: weight,
});
const history = [movement("2019-01-01", "A", "B", 10), movement("2019-12-31", "B", "C", 100)];
const input = (data = history) => ({ ids, data, introductionDate: "2020-01-01" });

test("population history includes the first of 365 preceding days and excludes introduction and future records", () => {
  const expected = { A: 450, B: 10000, C: 8246 };
  assert.deepEqual(estimateSyntheticPopulation(input()), expected);
  assert.deepEqual(estimateSyntheticPopulation(input([
    movement("2018-12-31", "A", "C", 1e9), ...history,
    movement("2020-01-01", "C", "A", 1e12), movement("2030-01-01", "B", "A", 1e12),
    movement("2030-01-02", "OUTSIDE", "A", 1e12),
  ])), expected);
  assert.notDeepEqual(estimateSyntheticPopulation(input(history.slice(1))), expected);
  assert.notDeepEqual(estimateSyntheticPopulation(input(history.slice(0, 1))), expected);
});

test("log activity scaling has fixed endpoints and finite populations for equal activity or no activity", () => {
  assert.deepEqual(Object.fromEntries(estimateSyntheticHoldings(ids, new Map([["A", 1], ["B", 3], ["C", 7]]))),
    { A: 450, B: 5225, C: 10000 });
  for (const totals of [new Map(), new Map(ids.map((id) => [id, 0])), new Map(ids.map((id) => [id, 8]))]) {
    assert.deepEqual(Object.fromEntries(estimateSyntheticHoldings(ids, totals)), { A: 450, B: 450, C: 450 });
  }
  assert.deepEqual(estimateSyntheticPopulation(input([])), { A: 450, B: 450, C: 450 });
});

test("invalid movement counts, unknown regions and invalid dates fail before a population is returned", () => {
  for (const weight of [NaN, Infinity, -Infinity, -1, "invalid", "", " ", null, undefined, false, true]) {
    assert.throws(() => estimateSyntheticPopulation(input([movement("2019-06-01", "A", "B", weight)])), /invalid movement count/);
  }
  for (const [source, target] of [["OUTSIDE", "B"], ["A", "OUTSIDE"]]) {
    assert.throws(() => estimateSyntheticPopulation(input([movement("2019-06-01", source, target, 1)])), /unknown region/);
  }
  assert.throws(() => estimateSyntheticPopulation(input([movement("invalid", "A", "B", 1)])), /invalid date/);
  assert.throws(() => estimateSyntheticPopulation({ ...input(), introductionDate: "2020-02-30" }), /valid calendar date/);
  assert.throws(() => estimateSyntheticPopulation(input([
    movement("2019-06-01", "A", "B", Number.MAX_VALUE),
    movement("2019-06-02", "A", "B", Number.MAX_VALUE),
  ])), /finite and nonnegative/);
  assert.deepEqual(estimateSyntheticPopulation(input([
    movement("2019-06-01", "NA", "B", 10), movement("2019-06-01", "A", "NA", 10),
  ])), { A: 450, B: 450, C: 450 });
});

test("direct activity input rejects nonfinite values instead of interpreting them as no activity", () => {
  for (const value of [NaN, Infinity, -Infinity, -1]) {
    assert.throws(() => estimateSyntheticHoldings(ids, new Map([["A", value]])), /finite and nonnegative/);
  }
});

test("population snapshot describes its full provenance and its SHA-256 hash covers the content", async () => {
  const snapshot = createSyntheticPopulationSnapshot(input());
  assert.deepEqual({
    unit: snapshot.unit, sourceId: snapshot.sourceId, referenceTime: snapshot.referenceTime,
    historyStart: snapshot.historyStart, geography: snapshot.geography, values: snapshot.values,
  }, {
    unit: "synthetic-model-units", sourceId: "historical-trade-log-scale-v1",
    referenceTime: "2020-01-01", historyStart: "2019-01-01", geography: "COROP",
    values: { A: 450, B: 10000, C: 8246 },
  });
  assert.equal(snapshot.kind, "synthetic");
  assert.equal(snapshot.reference.measure, "synthetic-model-units");
  assert.equal(snapshot.historyCoverage, null);
  assert.deepEqual(validatePopulationSnapshot(snapshot, ids), snapshot);
  const second = createSyntheticPopulationSnapshot(input([...history].reverse()));
  assert.deepEqual(second, snapshot);
  assert.equal(createSyntheticPopulationSnapshot({ ...input(), introductionDate: "2020-03-01" }).historyStart, "2019-03-02");
  const text = JSON.stringify(snapshot);
  const hash = await hashSimulationContent(text);
  assert.equal(hash, createHash("sha256").update(text, "utf8").digest("hex"));
  assert.equal(await hashSimulationContent(JSON.stringify(second)), hash);
  assert.notEqual(await hashSimulationContent(JSON.stringify({ ...snapshot, sourceId: "another-source" })), hash);
  assert.notEqual(await hashSimulationContent(JSON.stringify({ ...snapshot, values: { ...snapshot.values, A: 451 } })), hash);
});

test("declared synthetic vectors retain their own counts and cannot claim animal admission", () => {
  const snapshot = createDeclaredSyntheticPopulationSnapshot({ ids, values: { A: 0, B: 3.5, C: 900 }, referenceTime: "2020-01-01" });
  assert.deepEqual(validatePopulationSnapshot(snapshot, ids, { values: snapshot.values, movementGeography: "COROP" }).values, { A: 0, B: 3.5, C: 900 });
  assert.throws(() => validatePopulationSnapshot(snapshot, ids, { values: { A: 0, B: 4, C: 900 } }), /does not match/);
  assert.throws(() => validatePopulationSnapshot(snapshot, ids, { movementGeography: "another-vintage" }), /geography/);
  assert.throws(() => validatePopulationSnapshot({ ...snapshot, kind: "fixed-animal-inventory", unit: "animals" }, ids), /occupied stock/);
  assert.throws(() => validatePopulationSnapshot({ ...snapshot, admission: { qualified: true } }, ids), /without preparation records/);
});

const populationProduct = () => ({
  schemaVersion: 1, kind: "population-product", regionIds: ["A", "B", "C"],
  reference: {
    id: "fabricated-reference", measure: "period-mean-occupied-stock", countUnit: "animal",
    timeReference: { kind: "period", start: "2020-01-01", endExclusive: "2021-01-01" },
    geographyVersion: "fabricated-geography-v1", movementGeography: "COROP", geographicAttribution: "animal-site",
    accessClass: "private", evidence: "assumption-based-reference",
    assumptions: ["Fabricated annual means represent fixed regional populations for this example."],
  },
  scenarios: [{ id: "reference", values: { A: 120.5, B: 40, C: 0 } }, { id: "alternative", values: { A: 80, B: 80.5, C: 0 } }],
});

test("final population products preserve fractional counts, zeros and their documented assumptions", () => {
  const product = populationProduct();
  const snapshot = selectPopulationScenario(product, "reference");
  assert.deepEqual(snapshot.values, { A: 120.5, B: 40, C: 0 });
  assert.equal(snapshot.kind, "fixed-animal-inventory");
  assert.equal(snapshot.unit, "animals");
  assert.equal(snapshot.admission, undefined);
  assert.equal(isPrivatePopulation(snapshot), true);
  assert.equal(snapshot.reference.evidence, "assumption-based-reference");
  assert.deepEqual(selectInventoryScenario(product, "reference"), snapshot);
  assert.deepEqual(validatePopulationSnapshot(snapshot, ids, { values: snapshot.values, movementGeography: "COROP" }), snapshot);
  product.scenarios[0].values.A = 999;
  product.reference.assumptions[0] = "Another declaration.";
  assert.equal(snapshot.values.A, 120.5);
  assert.notEqual(snapshot.reference.assumptions[0], product.reference.assumptions[0]);
});

test("final product loading rejects invalid numbers, incomplete vectors and incompatible reference metadata", () => {
  for (const mutate of [
    (product) => { product.scenarios[1].values.A = null; },
    (product) => { product.scenarios[1].values.A = -1; },
    (product) => { product.scenarios[1].values.A = Infinity; },
    (product) => { delete product.scenarios[1].values.C; },
    (product) => { product.scenarios[1].id = "reference"; },
    (product) => { product.reference.measure = "permitted-capacity"; },
    (product) => { product.reference.countUnit = "model-unit"; },
    (product) => { product.reference.assumptions = []; },
    (product) => { product.reference.timeReference.endExclusive = "2020-01-01"; },
  ]) {
    const product = populationProduct();
    mutate(product);
    assert.throws(() => selectPopulationScenario(product, "reference"));
  }
  const snapshot = selectPopulationScenario(populationProduct(), "reference");
  assert.throws(() => validatePopulationSnapshot(snapshot, ids, { values: { A: 100, B: 60.5, C: 0 } }), /does not match/);
  assert.throws(() => validatePopulationSnapshot(snapshot, ids, { movementGeography: "another-definition" }), /geography/);
  assert.throws(() => selectPopulationScenario(populationProduct(), "missing-scenario"), /available population/);
});

test("population snapshots retain final product fields and exclude source records", () => {
  const product = populationProduct();
  product.sourceRows = ["fabricated-private-row"];
  product.reference.sourceRows = ["fabricated-private-row"];
  product.reference.timeReference.sourceRows = ["fabricated-private-row"];
  product.reference.assumptionPeriod = {
    start: "2020-01-01", endExclusive: "2021-01-01", reason: "Fabricated fixed reference study.", sourceRows: ["fabricated-private-row"],
  };
  product.scenarios[0].sourceRows = ["fabricated-private-row"];
  const snapshot = selectPopulationScenario(product, "reference");
  assert(!JSON.stringify(snapshot).includes("fabricated-private-row"));
  assert.deepEqual(snapshot.reference.timeReference, { kind: "period", start: "2020-01-01", endExclusive: "2021-01-01" });
  assert.deepEqual(snapshot.reference.assumptionPeriod, { start: "2020-01-01", endExclusive: "2021-01-01", reason: "Fabricated fixed reference study." });
  assert(!JSON.stringify(validatePopulationSnapshot({ ...snapshot, sourceRows: ["fabricated-private-row"] }, ids)).includes("fabricated-private-row"));
  const invalid = populationProduct();
  invalid.reference.sourceDefinitionId = ["fabricated-private-row"];
  assert.throws(() => selectPopulationScenario(invalid, "reference"), /metadata/);
});
