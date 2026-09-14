import assert from "node:assert/strict";
import test from "node:test";
import { readScenarioSlots, saveScenarioSlot, scenarioSignature, scenarioStorageKey } from "../src/scenarioStorage.js";

const scenario = {
  schemaVersion: 1, datasetKey: "weekly", dates: ["2020-01-05T00:00:00.000Z"],
  settings: { model: "SEIR", seedRegion: "CR35", initialPct: 1, beta: 0.32, movementBeta: 0.08, sigma: 0.22, gamma: 0.15 },
  nodeInterventions: [[1578182400000, [["CR35", { exports: false }]]]],
  linkInterventions: [[1578182400000, [["CR01-CR02", true]]]],
};

function storage() {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
}

test("three browser slots round trip complete scenarios and overwrite only the chosen slot", () => {
  const local = storage();
  assert.deepEqual(readScenarioSlots(local), [null, null, null]);
  saveScenarioSlot(local, 0, "Seed closure", scenario);
  saveScenarioSlot(local, 2, "   ", scenario);
  const first = readScenarioSlots(local)[0];
  const slots = saveScenarioSlot(local, 2, "Ring closure", { ...scenario, linkInterventions: [] });
  assert.deepEqual(slots[0], first);
  assert.equal(slots[1], null);
  assert.equal(slots[2].name, "Ring closure");
  assert.deepEqual(readScenarioSlots(local), slots);
  assert.deepEqual(slots[0].scenario, scenario);
  assert.equal(saveScenarioSlot(local, 1, "", scenario)[1].name, "Scenario 2");
  assert.equal(saveScenarioSlot(local, 1, "a".repeat(80), scenario)[1].name.length, 48);
  assert.throws(() => saveScenarioSlot(local, 3, "Wrong slot", scenario));
});

test("saving reads other slots afresh and does not claim success on denied writes", () => {
  const local = storage();
  saveScenarioSlot(local, 0, "First tab", scenario);
  saveScenarioSlot(local, 1, "Second tab", scenario);
  assert.equal(saveScenarioSlot(local, 0, "Revised", scenario)[1].name, "Second tab");
  const before = local.getItem(scenarioStorageKey);
  const blocked = { ...local, setItem() { throw new Error("Storage denied"); } };
  assert.throws(() => saveScenarioSlot(blocked, 0, "Lost write", scenario), /Storage denied/);
  assert.equal(local.getItem(scenarioStorageKey), before);
});

test("invalid records are reported without overwriting browser data", () => {
  const local = storage();
  for (const raw of ["broken json", "null", '{"version":2,"slots":[null,null,null]}',
    '{"version":1,"slots":[null]}', '{"version":1,"slots":[{},null,null]}',
    ...[{ datasetKey: "" }, { settings: { model: {}, seedRegion: "CR35" } }, { settings: { model: "SIR", seedRegion: {} } }]
      .map((invalid) => JSON.stringify({ version: 1, slots: [{ name: "Corrupt record", savedAt: new Date().toISOString(), scenario: { ...scenario, ...invalid } }, null, null] }))]) {
    local.setItem(scenarioStorageKey, raw);
    assert.throws(() => readScenarioSlots(local));
    assert.throws(() => saveScenarioSlot(local, 1, "Saved", scenario));
    assert.equal(local.getItem(scenarioStorageKey), raw);
  }
});

test("scenario signatures ignore entry order and slot labels while preserving the complete configuration", () => {
  const value = {
    ...scenario,
    nodeInterventions: [[2, [["CR02", { imports: false, exports: true }], ["CR01", { exports: false }]]],
      [1, [["CR03", { imports: false }]]]],
    linkInterventions: [[2, [["CR01-CR02", true], ["CR02-CR01", true]]], [1, [["CR01-CR02", true]]]],
  };
  const before = JSON.stringify(value);
  const reordered = {
    ...value, settings: Object.fromEntries(Object.entries(value.settings).reverse()),
    nodeInterventions: value.nodeInterventions.toReversed().map(([time, changes]) =>
      [time, changes.toReversed().map(([id, directions]) => [id, Object.fromEntries(Object.entries(directions).reverse())])]),
    linkInterventions: value.linkInterventions.toReversed().map(([time, changes]) => [time, changes.toReversed()]),
  };
  assert.equal(scenarioSignature(reordered), scenarioSignature(value));
  assert.equal(JSON.stringify(value), before);
  for (const changed of [
    { ...value, datasetKey: "daily" },
    { ...value, dates: [...value.dates, "2020-01-12T00:00:00.000Z"] },
    ...Object.keys(value.settings).map((key) => ({ ...value, settings: { ...value.settings,
      [key]: typeof value.settings[key] === "number" ? value.settings[key] + 0.1 : `${value.settings[key]} changed` } })),
    { ...value, nodeInterventions: value.nodeInterventions.slice(1) },
    { ...value, linkInterventions: value.linkInterventions.slice(1) },
  ]) assert.notEqual(scenarioSignature(changed), scenarioSignature(value));
  assert.equal(scenarioSignature(null), null);
  assert.equal(scenarioSignature({ ...value, nodeInterventions: [null] }), null);
});

test("malformed date, region and route tuples cannot match a valid scenario signature", () => {
  const valid = {
    ...scenario,
    nodeInterventions: [[1578182400000, [["CR35", { exports: false }]]]],
    linkInterventions: [[1578182400000, [["CR35-CR02", true]]]],
  };
  for (const kind of ["nodeInterventions", "linkInterventions"]) {
    for (const location of ["date", "change"]) {
      const malformed = structuredClone(valid);
      const entry = location === "date" ? malformed[kind][0] : malformed[kind][0][1][0];
      entry.push("invalid field");
      const local = storage();
      local.setItem(scenarioStorageKey, JSON.stringify({ version: 1, slots: [
        { name: "Broken entry", savedAt: "2026-09-14T00:00:00.000Z", scenario: malformed }, null, null,
      ] }));
      const loaded = readScenarioSlots(local)[0].scenario;
      assert.equal(scenarioSignature(loaded), null);
      assert.notEqual(scenarioSignature(loaded), scenarioSignature(valid));
    }
  }
});
