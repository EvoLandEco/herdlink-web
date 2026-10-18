import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simulateDaily } from "../src/runtime/simulation-engine.js";

const root = new URL("../", import.meta.url);

test("headless prevention comparison uses daily engine, fixed controls and a reproducible population snapshot", { timeout: 120000 }, () => {
  const outputDir = mkdtempSync(join(tmpdir(), "herdlink-evaluation-"));
  try {
    execFileSync(process.execPath, ["scripts/evaluate-scenario-presets.js", outputDir,
      "--suite", "primary", "--seeds", "CR35", "--scales", "broad"], { cwd: root, timeout: 110000, stdio: "pipe" });
    const metadata = JSON.parse(readFileSync(join(outputDir, "metadata.json"), "utf8"));
    const results = JSON.parse(readFileSync(join(outputDir, "results.json"), "utf8"));
    assert.equal(metadata.schemaVersion, 3);
    assert.equal(metadata.engineVersion, "daily-contact-v1");
    assert.equal(metadata.evidenceLevel, "mathematical-scenario");
    assert.equal(metadata.dataset.dataset, "daily");
    assert.equal(metadata.dataset.dates.length, 2191);
    assert.ok(metadata.dataset.dates.includes("2023-01-01T00:00:00.000Z"));
    assert.match(metadata.dataset.calendarHash, /^[a-f0-9]{64}$/);
    assert.equal(metadata.populationSnapshot.unit, "synthetic-model-units");
    assert.equal(metadata.populationSnapshot.referenceTime.slice(0, 10), "2020-01-01");
    assert.equal(metadata.policy.historyDays, 365);
    assert.equal(results.length, 7);
    assert.equal(metadata.resultRows, results.length);
    assert.ok(metadata.invariants.nodeFrames > 0);
    assert.ok(metadata.invariants.preclosureNodeFrames > 0);
    assert.ok(metadata.invariants.maxMassError <= 1e-7);
    assert.equal(metadata.invariants.independentBaselines, 1);
    assert.ok(metadata.invariants.displayAggregations >= 1);
    const baseline = results.find((row) => row.preset === "open-trade");
    for (const row of results) {
      assert.equal(row.dataset, "daily");
      assert.equal(row.displayResolution, "weekly");
      assert.equal(row.populationHash, metadata.populationHash);
      assert.equal(row.initializationConvention, "prevalence-shares");
      assert.deepEqual(row.populationSnapshot, metadata.populationSnapshot);
      assert.deepEqual(row.holdings, metadata.populationSnapshot.values);
      assert.equal(row.initialSeeded, row.holdings.CR35 * row.initialPct / 100);
      for (const key of ["engine", "model", "seedRegion", "introductionDate", "initialPct", "initialExposedPct", "initialRecoveredPct", "beta", "movementBeta", "sigma", "gamma", "omega"]) {
        assert.equal(row[key], baseline[key], `Fixed control ${key}`);
      }
      for (const key of ["population", "initialSeeded", "cumulativeInfections", "externalCumulativeInfections", "peakI", "totalTrade", "crossTrade", "exportRegionDays", "routeClosureDays"]) {
        assert.ok(Number.isFinite(row[key]) && row[key] >= 0, `${row.preset}: ${key}`);
      }
      assert.match(row.dailyTrajectoryHash, /^[a-f0-9]{64}$/);
      assert.match(row.scheduleHash, /^[a-f0-9]{64}$/);
      assert.ok(row.totalTradeRetained >= 0 && row.totalTradeRetained <= 1);
      assert.equal(row.baselineCumulativeInfections, baseline.cumulativeInfections);
    }
    assert.equal(baseline.totalTradeRetained, 1);
    assert.equal(baseline.targetCount, 0);
    assert.equal(baseline.firstClosureDate, null);
    const standstill = results.find((row) => row.preset === "temporary-standstill");
    assert.equal(standstill.firstClosureDate.slice(0, 10), "2020-01-08");
    assert.equal(standstill.reopeningDate.slice(0, 10), "2020-01-22");
    assert.equal(standstill.exportRegionDays, 40 * 14);
    assert.equal(readFileSync(join(outputDir, "results.csv"), "utf8").trim().split("\n").length, results.length + 1);

    const runtimeSource = readFileSync(new URL("src/runtime/herdlink-runtime.js", root), "utf8");
    for (const [field, control] of [["beta", "Beta"], ["movementBeta", "MovementBeta"], ["sigma", "Sigma"], ["gamma", "Gamma"]]) {
      const value = runtimeSource.match(new RegExp(`id="simulation${control}"[^>]*value="([^"]+)"`))[1];
      assert.equal(Number(value), metadata.defaults[field], `Browser and headless default ${field}`);
    }
    const data = readFileSync(new URL("src/assets/data/daily_aggregation.csv", root), "utf8").trim().split(/\r?\n/).slice(1).map((line) => {
      const [, time, COROP_LEV, COROP_AFN, AANTAL] = line.replaceAll('"', "").split(",");
      return { time: new Date(time), COROP_LEV, COROP_AFN, AANTAL: Number(AANTAL) };
    });
    const settings = { ...metadata.defaults, seedRegion: "CR35", holdings: baseline.holdings, population: metadata.populationSnapshot };
    const start = Date.parse(settings.introductionDate), day = 86400000;
    assert.equal(settings.beta, 0.16);
    const responses = [1, 2, 3, 7].map((delay) => {
      const trajectory = simulateDaily({ settings, data, ids: metadata.dataset.ids, dates: metadata.dataset.dates.map((date) => new Date(date)),
        movementGeography: "COROP", nodeInterventions: new Map([[start + delay * day, new Map([[settings.seedRegion, { exports: false }]])]]) });
      const firstShipment = trajectory.frameByKey[new Date(start + day).toISOString()];
      assert.equal(firstShipment.nodeStates.CR35.outgoingPressure > 0, delay > 1, "Restrictions begin on the exact response day");
      return { peak: Math.max(trajectory.initialFrame.summary.prevalence, ...trajectory.frames.map((frame) => frame.summary.prevalence)),
        infections: trajectory.frames.at(-1).summary.cumulativeInfections };
    });
    assert.ok(responses.every(({ peak, infections }) => Number.isFinite(peak) && peak >= 0 && peak <= 1 && Number.isFinite(infections) && infections >= 0));
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
});
