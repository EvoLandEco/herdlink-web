import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComparisonChart,
  formatComparisonDelta,
  formatComparisonValue,
  groupComparisonEvents,
  nearestComparisonDate,
  pairComparisonSeries,
} from "../src/comparisonCharts.js";

const dates = ["2020-01-01", "2020-01-02", "2020-01-05"];

test("paired trajectories align by date and preserve missing results", () => {
  const points = pairComparisonSeries(dates,
    [{ date: dates[2], value: 20 }, { date: dates[0], value: 10 }],
    [{ date: dates[0], value: 10 }, { date: dates[1], value: 5 }, { date: dates[2], value: 0 }],
    "value",
  );
  assert.equal(points[1].original, null);
  assert.equal(points[2].intervention, 0);
  const chart = buildComparisonChart(points);
  assert.equal(chart.original.split("M").length - 1, 2);
  assert.ok(chart.original.startsWith(chart.intervention.split(" ")[0]));
  assert.equal(chart.x(Date.parse(dates[1])) - chart.plot.left,
    (chart.plot.right - chart.plot.left) / 4);
  assert.equal(chart.y(20), chart.plot.top);
  assert.equal(chart.y(0), chart.plot.bottom);
  assert.equal(buildComparisonChart([{ date: dates[0], original: null, intervention: null }]), null);
});

test("the chart handles a single zero sample and signed metrics", () => {
  const zero = buildComparisonChart([{ date: dates[0], original: 0, intervention: 0 }]);
  assert.equal(zero.x(Date.parse(dates[0])), (zero.plot.left + zero.plot.right) / 2);
  assert.equal(zero.original, zero.intervention);
  const signed = buildComparisonChart([{ date: dates[0], original: -2, intervention: 2 }]);
  assert.deepEqual(signed.ticks, [-2, 0, 2]);
  assert.equal(nearestComparisonDate(dates, Date.parse("2020-01-03")), 1);
});

test("resized charts fill their measured bounds while preserving values and calendar spacing", () => {
  const points = [
    { date: dates[0], original: 0, intervention: 10 },
    { date: dates[1], original: 5, intervention: 20 },
    { date: dates[2], original: 20, intervention: 0 },
  ];
  const small = buildComparisonChart(points, 320, 180);
  const large = buildComparisonChart(points, 640, 360);
  assert.equal(large.plot.bottom - large.plot.top, small.plot.bottom - small.plot.top + 180);

  for (const [chart, width, height] of [[small, 320, 180], [large, 640, 360]]) {
    assert.equal(chart.x(Date.parse(dates[0])), 64);
    assert.equal(chart.x(Date.parse(dates[2])), width - 16);
    assert.equal(chart.x(Date.parse(dates[1])), 64 + (width - 80) / 4);
    assert.equal(chart.y(20), 12);
    assert.equal(chart.y(0), height - 28);
    assert.equal(chart.y(10), (12 + height - 28) / 2);
    assert.ok(chart.original.startsWith(`M64,${height - 28} `));
    assert.ok(chart.original.endsWith(`L${width - 16},12`));
    assert.ok(chart.intervention.endsWith(`L${width - 16},${height - 28}`));
  }
});

test("intersecting event targets form geometric clusters and separate when the track expands", () => {
  const steps = Array.from({ length: 5 }, (_, index) => `2020-01-0${index + 1}`);
  const events = [0, 1, 2, 4].map((index) => ({
    date: steps[index],
    events: [{ date: index === 1 ? "2020-01-01T12:00:00Z" : steps[index], description: `Edit ${index}` }],
  }));
  const saved = structuredClone(events);
  const compact = groupComparisonEvents(events, steps, 40);
  assert.deepEqual(compact.map(({ position }) => position), [0.25, 1]);
  assert.deepEqual(compact.map(({ steps }) => steps.length), [3, 1]);
  assert.deepEqual(compact.flatMap(({ steps }) => steps), events);
  assert.equal(compact[0].steps[1].events[0].date, "2020-01-01T12:00:00Z");

  const expanded = groupComparisonEvents(events, steps, 80);
  assert.deepEqual(expanded.map(({ position }) => position), [0, 0.25, 0.5, 1]);
  assert.ok(expanded.every(({ steps }) => steps.length === 1));
  assert.deepEqual(events, saved);
});

test("event grouping uses range steps, includes touching targets, and handles single-date and hidden tracks", () => {
  const events = dates.map((date) => ({ date, events: [{ date, description: "Blocked" }] }));
  assert.equal(groupComparisonEvents(events, dates, 28).length, 1);
  assert.equal(groupComparisonEvents(events, dates, 28.01).length, 3);
  assert.deepEqual(groupComparisonEvents(events, dates, 100).map(({ position }) => position), [0, 0.5, 1]);
  assert.deepEqual(groupComparisonEvents([events[0]], [dates[0]], 100), [{ position: 0, steps: [events[0]] }]);
  assert.deepEqual(groupComparisonEvents([], dates, 100), []);
  assert.deepEqual(groupComparisonEvents(events, dates, 0), []);
  assert.deepEqual(groupComparisonEvents(events, [], 100), []);
});

test("percent changes use percentage points and unavailable values stay missing", () => {
  assert.equal(formatComparisonDelta(0.5, 0.25, "percent"), "−25 pp");
  assert.equal(formatComparisonDelta(10, 13, "count"), "+3");
  assert.equal(formatComparisonDelta(null, 10, "count"), "—");
  assert.equal(formatComparisonValue(null), "—");
  assert.equal(formatComparisonValue(0, "percent"), "0%");
  assert.notEqual(formatComparisonValue(0.0000000123), "0");
  assert.notEqual(formatComparisonDelta(0.0004, 0.000401, "decimal"), "+0");
  assert.notEqual(formatComparisonValue(0.0000001, "percent"), "0%");
});
