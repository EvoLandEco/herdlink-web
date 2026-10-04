import assert from "node:assert/strict";
import test from "node:test";
import { comparisonConfigurations, comparisonSets } from "../src/scenarioComparison.js";
import { buildComparisonChart } from "../src/comparisonCharts.js";

test("recommended sets vary the named factor and preserve the other controls", () => {
  const settings = { targetBudget: 8, responseDays: 11, standstillDays: 20 };
  for (const set of comparisonSets) {
    const configurations = comparisonConfigurations(set.id, settings);
    assert.equal(configurations.length, 3);
    configurations.forEach((config, index) => {
      assert.equal(config.presetId, set.presets[index]);
      for (const key of Object.keys(settings)) assert.equal(config[key], key === set.field ? set.values[index] : settings[key]);
    });
  }
  assert.deepEqual(settings, { targetBudget: 8, responseDays: 11, standstillDays: 20 });
  assert.deepEqual(comparisonConfigurations("delays", settings).map((config) => config.responseDays), [1, 7, 14]);
  assert.throws(() => comparisonConfigurations("unknown", settings));
});

test("three columns share numeric axes across different trajectories and preserve missing data", () => {
  const series = [-5, 20, 80].map((value) => [
    { date: "2020-01-01", original: null, intervention: 0 },
    { date: "2020-01-02", original: null, intervention: value },
    { date: "2020-01-03", original: null, intervention: null },
  ]);
  const scalePoints = series.flat();
  const charts = series.map((points) => buildComparisonChart(points, 400, 150, false, scalePoints));
  for (const chart of charts) {
    assert.equal(chart.y(-5), chart.plot.bottom);
    assert.equal(chart.y(80), chart.plot.top);
    assert.equal(chart.y(20), charts[0].y(20));
    assert.equal(chart.x(Date.parse("2020-01-02")), charts[0].x(Date.parse("2020-01-02")));
    assert.equal(chart.intervention.split("L").length, 2);
    assert.equal(chart.original.trim(), "");
  }
});
