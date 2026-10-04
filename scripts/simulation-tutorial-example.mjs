import assert from "node:assert/strict";
import { simulateDaily } from "../src/runtime/simulation-engine.js";
import { createDeclaredSyntheticPopulationSnapshot } from "../src/runtime/simulation-population.js";

// Two fictional regions make the daily accounting visible without a fitted disease model.
const ids = ["A", "B"];
const date = new Date("2020-01-01T00:00:00Z");
const holdings = { A: 1000, B: 800 };
const settings = {
  model: "SEIR", seedRegion: "A", introductionDate: "2020-01-01",
  initializationConvention: "absolute-counts",
  initialPct: 0, initialExposedPct: 0, initialRecoveredPct: 0,
  initialStates: { A: { S: 970, E: 20, I: 10, R: 0 }, B: { S: 795, E: 0, I: 5, R: 0 } },
  beta: 0.10, movementBeta: 0.04, sigma: 0.22, gamma: 0.15, omega: 0.02,
  holdings,
  population: createDeclaredSyntheticPopulationSnapshot({ ids, values: holdings,
    id: "two-region-teaching-example", referenceTime: "2020-01-01", geographyVersion: "fictional-regions" }),
};
const input = { settings, ids, dates: [date], movementGeography: "fictional-regions",
  data: [{ time: date, COROP_LEV: "A", COROP_AFN: "B", AANTAL: 80 }] };
const open = simulateDaily(input).frames[0];
const closed = simulateDaily({ ...input,
  nodeInterventions: new Map([[+date, new Map([["A", { exports: false }]])]]) }).frames[0];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10);
const pressure = 0.04 * 80 * (10 / 1000);
const hazardB = 0.10 * (5 / 800) + pressure / 800;
near(open.nodeStates.B.newInfections, 795 * -Math.expm1(-hazardB));
near(open.nodeStates.A.I, 10 * 0.85 + 20 * 0.22);
near(open.nodeStates.B.I, 5 * 0.85);
near(closed.nodeStates.B.newInfections, 795 * -Math.expm1(-0.10 * (5 / 800)));
assert.equal(closed.linkStates.has("A-B"), false);
assert.ok(closed.nodeStates.B.newInfections > 0);
for (const frame of [open, closed]) {
  for (const [id, state] of Object.entries(frame.nodeStates)) {
    near(state.S + state.E + state.I + state.R, holdings[id]);
    const attributed = [...frame.linkStates.values()].filter((link) => link.target === id)
      .reduce((sum, link) => sum + link.attributedInfections, 0);
    near(attributed, state.newInfections);
  }
}
console.log(JSON.stringify({ pressure, hazardB,
  open: open.nodeStates, closed: closed.nodeStates,
  route: open.linkStates.get("A-B"), checks: "passed" }, null, 2));
