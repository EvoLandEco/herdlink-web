import assert from "node:assert/strict";
import test from "node:test";
import {
  buildComparisonChart,
  comparisonEventMarkerWidth,
  formatComparisonDelta,
  formatComparisonValue,
  getComparisonIntroduction,
  groupComparisonEvents,
  nearestComparisonDate,
  pairComparisonSeries,
  topComparisonRegions,
} from "../src/comparisonCharts.js";

const dates = ["2020-01-01", "2020-01-02", "2020-01-05"];

test("top regions use original timeline peaks, stable ties and finite results", () => {
  const regions = ["CR07", "CR06", "CR05", "CR04", "CR03", "CR02", "CR01"].map((id) => ({ id, name: id }));
  const original = Object.fromEntries(regions.map((region, index) => [region.id, [
    { date: dates[0], value: 0 }, { date: dates[1], value: index },
  ]]));
  original.CR07 = [{ date: dates[0], value: null }, { date: dates[1], value: NaN }];
  original.CR06 = [{ date: dates[0], value: -3 }, { date: dates[1], value: -2 }];
  original.CR05[1].value = Infinity;
  original.CR04[1].value = 5;
  const before = structuredClone(original);
  const ranked = topComparisonRegions(regions, original, "value");
  const expected = [["CR01", 6], ["CR02", 5], ["CR04", 5], ["CR03", 4], ["CR05", 0]];
  assert.deepEqual(ranked.map(({ id, peak }) => [id, peak]), expected.slice(0, 3));
  for (let count = 1; count <= 5; count++) {
    assert.deepEqual(topComparisonRegions(regions, original, "value", count).map(({ id, peak }) => [id, peak]), expected.slice(0, count));
  }
  assert.deepEqual(topComparisonRegions(regions, original, "missing"), []);
  assert.deepEqual(topComparisonRegions([regions[1]], original, "value").map(({ peak }) => peak), [-2]);
  assert.deepEqual(original, before);
});

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

test("date inspection finds the nearest recorded date without scanning a daily trajectory", () => {
  for (const [timestamp, expected] of [
    ["2019-12-01", 0], ["2020-01-01", 0], ["2020-01-01T12:00:00Z", 0],
    ["2020-01-03T12:00:00Z", 1], ["2020-01-04", 2], ["2020-02-01", 2],
  ]) assert.equal(nearestComparisonDate(dates, Date.parse(timestamp)), expected, timestamp);
  assert.equal(nearestComparisonDate([dates[0]], Date.parse(dates[2])), 0);

  const daily = Array.from({ length: 4096 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString());
  let reads = 0;
  const tracked = new Proxy(daily, { get(target, key) {
    if (/^\d+$/.test(String(key))) reads++;
    return Reflect.get(target, key);
  } });
  assert.equal(nearestComparisonDate(tracked, Date.parse(daily[3071]) + 3600000), 3071);
  assert.ok(reads < 30, `A pointer move read ${reads} dates`);
});

test("introduction markers select the containing display period within observed coverage", () => {
  const coverage = { start: "2020-01-01", end: "2020-01-08" };
  for (const [date, index] of [
    ["2020-01-01", 0], ["2020-01-01T12:00:00Z", 0],
    ["2020-01-02", 1], ["2020-01-02T12:00:00Z", 1], ["2020-01-05", 2], ["2020-01-07", 2],
  ]) {
    assert.deepEqual(getComparisonIntroduction(date, dates, coverage), {
      date: new Date(date).toISOString(), displayDate: dates[index], index,
    });
  }
  for (const date of [undefined, null, "", "invalid", "2019-12-31", "2020-01-08", "2021-01-01"]) {
    assert.equal(getComparisonIntroduction(date, dates, coverage), null);
  }
  assert.equal(getComparisonIntroduction(dates[0], [], coverage), null);
  assert.equal(getComparisonIntroduction(dates[0], dates), null);
  assert.deepEqual(getComparisonIntroduction("2019-12-31T23:00:00-01:00", [dates[0]], coverage), {
    date: "2020-01-01T00:00:00.000Z", displayDate: dates[0], index: 0,
  });
  assert.equal(getComparisonIntroduction("2020-01-02", [dates[0]], coverage).index, 0);
  assert.equal(getComparisonIntroduction("2020-01-01", dates.slice(1), coverage), null);

  const daily = Array.from({ length: 1200 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString());
  let reads = 0;
  const tracked = new Proxy(daily, { get(target, key) {
    if (/^\d+$/.test(String(key))) reads++;
    return Reflect.get(target, key);
  } });
  assert.equal(getComparisonIntroduction(new Date(Date.parse(daily[900]) + 1).toISOString(), tracked,
    { start: daily[0], end: new Date(Date.parse(daily.at(-1)) + 86400000).toISOString() }).index, 900);
  assert.ok(reads < 15, `Introduction lookup read ${reads} dates`);
});

test("partial first and final display periods preserve the exact introduction date", () => {
  const weekly = ["2019-12-29", "2020-01-05"];
  const coverage = { start: "2020-01-01", end: "2020-01-09" };
  assert.deepEqual(getComparisonIntroduction("2020-01-01", weekly, coverage), {
    date: "2020-01-01T00:00:00.000Z", displayDate: weekly[0], index: 0,
  });
  assert.equal(getComparisonIntroduction("2020-01-08", weekly, coverage).index, 1);
  assert.equal(getComparisonIntroduction("2020-01-09", weekly, coverage), null);
  assert.equal(getComparisonIntroduction("2020-06-30", ["2020-01-01"],
    { start: "2020-01-01", end: "2020-07-01" }).index, 0);
});

test("resized charts fill their measured bounds while preserving values and calendar spacing", () => {
  const points = [
    { date: dates[0], original: 0, intervention: 10 },
    { date: dates[1], original: 5, intervention: 20 },
    { date: dates[2], original: 20, intervention: 0 },
  ];
  const small = buildComparisonChart(points, 320, 180);
  const large = buildComparisonChart(points, 640, 360);
  const compact = buildComparisonChart(points, 320, 80, true);
  assert.equal(compact.y(20), 6);
  assert.equal(compact.y(0), 72);
  assert.equal(compact.x(Date.parse(dates[1])), small.x(Date.parse(dates[1])));
  assert.ok(compact.original.startsWith("M64,72 "));
  assert.ok(compact.original.endsWith("L304,6"));
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
  assert.equal(comparisonEventMarkerWidth, 72);
  const compact = groupComparisonEvents(events, steps, 200);
  assert.deepEqual(compact.map(({ position }) => position), [0.25, 1]);
  assert.deepEqual(compact.map(({ startPosition, endPosition }) => [startPosition, endPosition]), [[0, 0.5], [1, 1]]);
  assert.deepEqual(compact.map(({ steps }) => steps.length), [3, 1]);
  assert.deepEqual(compact.flatMap(({ steps }) => steps), events);
  assert.equal(compact[0].steps[1].events[0].date, "2020-01-01T12:00:00Z");

  const expanded = groupComparisonEvents(events, steps, 400);
  assert.deepEqual(expanded.map(({ position }) => position), [0, 0.25, 0.5, 1]);
  assert.ok(expanded.every(({ steps }) => steps.length === 1));
  assert.deepEqual(events, saved);
});

test("event grouping uses range steps, includes touching targets, and handles single-date and hidden tracks", () => {
  const events = dates.map((date) => ({ date, events: [{ date, description: "Blocked" }] }));
  assert.equal(groupComparisonEvents(events, dates, 144).length, 1);
  assert.equal(groupComparisonEvents(events, dates, 144.01).length, 3);
  assert.deepEqual(groupComparisonEvents(events, dates, 200).map(({ position }) => position), [0, 0.5, 1]);
  assert.deepEqual(groupComparisonEvents([events[0]], [dates[0]], 100),
    [{ position: 0, startPosition: 0, endPosition: 0, steps: [events[0]] }]);
  assert.deepEqual(groupComparisonEvents([], dates, 100), []);
  assert.deepEqual(groupComparisonEvents(events, dates, 0), []);
  assert.deepEqual(groupComparisonEvents(events, [], 100), []);
});

test("chart event targets follow calendar spacing and exclude dates outside the recorded series", () => {
  const events = ["2019-12-31", ...dates, "2020-01-03", "2020-01-06"]
    .map((date) => ({ date, events: [{ date, description: "Blocked" }] }));
  const saved = structuredClone(events);
  const points = dates.map((date) => ({ date, original: 1, intervention: 0 }));

  for (const width of [280, 480]) {
    const chart = buildComparisonChart(points, width);
    const plotWidth = chart.plot.right - chart.plot.left;
    const positionForDate = (date) => (chart.x(Date.parse(date)) - chart.plot.left) / plotWidth;
    const clusters = groupComparisonEvents(events, dates, plotWidth, positionForDate);
    assert.deepEqual(clusters.flatMap(({ steps }) => steps), events.slice(1, 4));
    if (width === 280) {
      assert.deepEqual(clusters.map(({ position, steps }) => [position, steps.length]), [[0.125, 2], [1, 1]]);
      assert.deepEqual(clusters.map(({ startPosition, endPosition }) => [startPosition, endPosition]), [[0, 0.25], [1, 1]]);
      assert.equal(groupComparisonEvents(events, dates, plotWidth).length, 3);
    } else {
      for (const cluster of clusters) {
        assert.equal(chart.plot.left + cluster.position * plotWidth, chart.x(Date.parse(cluster.steps[0].date)));
        assert.equal(cluster.startPosition, cluster.position);
        assert.equal(cluster.endPosition, cluster.position);
      }
    }
  }

  const single = buildComparisonChart([points[0]], 240);
  const plotWidth = single.plot.right - single.plot.left;
  assert.deepEqual(groupComparisonEvents(events, [dates[0]], plotWidth,
    (date) => (single.x(Date.parse(date)) - single.plot.left) / plotWidth),
  [{ position: 0.5, startPosition: 0.5, endPosition: 0.5, steps: [events[1]] }]);
  assert.deepEqual(events, saved);
});

test("dense daily event ribbons preserve every step and expose their recorded range without reading descriptions", () => {
  const daily = Array.from({ length: 1200 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString());
  const groups = daily.map((date) => ({ date, events: Array.from({ length: 20 }, () => ({
    date, get description() { assert.fail("Grouping reads dates and preserves event details for inspection"); },
  })) }));
  const reversed = [...groups].reverse();
  for (const width of [400, 640, 1200]) {
    const clusters = groupComparisonEvents(reversed, daily, width);
    assert.equal(clusters.length, 1);
    assert.equal(clusters[0].startPosition, 0);
    assert.equal(clusters[0].endPosition, 1);
    assert.equal(clusters[0].position, 0.5);
    assert.equal(clusters[0].steps.length, 1200);
    clusters[0].steps.forEach((group, index) => assert.equal(group, groups[index]));
    assert.equal(reversed[0], groups.at(-1));
  }

  const bursts = groups.filter((_, index) => index < 300 || (index >= 450 && index < 750) || index >= 900);
  const clusters = groupComparisonEvents(bursts, daily, 1200);
  assert.equal(clusters.length, 3);
  assert.deepEqual(clusters.map(({ startPosition, endPosition }) => [startPosition, endPosition]),
    [[0, 299 / 1199], [450 / 1199, 749 / 1199], [900 / 1199, 1]]);
  const preserved = clusters.flatMap(({ steps }) => steps);
  assert.equal(preserved.length, bursts.length);
  preserved.forEach((group, index) => assert.equal(group, bursts[index]));
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
