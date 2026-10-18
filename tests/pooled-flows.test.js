import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createPooledFlows, flowMetrics, periodStart, validatePooledFlows } from "../src/pooledFlows.js";

const bundle = JSON.parse(readFileSync(new URL("../src/assets/data/international_flows.json", import.meta.url)));
const data = createPooledFlows(bundle);

test("six complete calendars count recorded imports and exports with known Dutch regions", () => {
  assert.equal(data.calendars.get("daily").length, 2191);
  assert.equal(data.calendars.get("daily")[0].toISOString().slice(0, 10), "2018-01-01");
  assert.equal(data.calendars.get("daily").at(-1).toISOString().slice(0, 10), "2023-12-31");
  const totals = [[316778,9549629],[77941,8980302],[102050,8865527],[94484,7554092],[61417,7032334],[81121,7100797]];
  assert.equal(data.calendars.get("yearly").length, totals.length);
  for (const [index, date] of data.calendars.get("yearly").entries()) {
    const summary = data.summarize(date, "yearly");
    assert.deepEqual([summary.imports.observed, summary.exports.observed], totals[index]);
    for (const channel of ["imports", "exports"]) {
      assert.equal(summary[channel].observed, summary[channel].permitted + summary[channel].unassigned);
      assert.equal(summary[channel].blocked, 0);
    }
  }
});

test("export totals match regional edges at every resolution and preserve the source accounting", () => {
  const before = JSON.stringify(bundle);
  const flows = createPooledFlows(bundle);
  const firstWeek = flows.summarize("2018-01-01", "weekly");
  assert.equal(firstWeek.exports.observed, 179578);
  assert.equal(flowMetrics(firstWeek).internationalExports, 179578);
  for (const [resolution, dates] of flows.calendars) {
    for (const date of dates) {
      const summary = flows.summarize(date, resolution);
      assert.equal(summary.exports.unassigned, 0);
      assert.equal(summary.exports.observed, Object.values(summary.regions).reduce((sum, region) => sum + region.exports.observed, 0));
      assert.equal(summary.exports.permitted, summary.exports.observed);
    }
  }
  assert.equal(JSON.stringify(bundle), before);
});

test("ISO weeks cover every supplied day once, including the final Sunday", () => {
  const weeks = data.calendars.get("weekly");
  assert.equal(weeks.length, 313);
  assert.equal(weeks[0].toISOString().slice(0, 10), "2018-01-01");
  assert.equal(weeks.at(-1).toISOString().slice(0, 10), "2023-12-25");
  for (const [index, date] of weeks.entries()) {
    assert.equal(date.getUTCDay(), 1);
    if (index > 0) assert.equal(+date - weeks[index - 1], 7 * 86400000);
    const weekly = data.summarize(date, "weekly");
    const days = Array.from({ length: 7 }, (_, offset) => data.summarize(+date + offset * 86400000, "daily"));
    for (const channel of ["imports", "exports"]) {
      assert.equal(weekly[channel].observed, days.reduce((sum, day) => sum + day[channel].observed, 0));
    }
  }
  assert.equal(periodStart("2023-12-31", "weekly"), +weeks.at(-1));
  assert.equal(periodStart("2020-01-01", "weekly"), Date.parse("2019-12-30"));
});

test("dated direction permissions reconcile daily, weekly and annual counts including leap day", () => {
  const from = Date.parse("2020-02-29"), until = Date.parse("2020-03-04");
  const ids = Array.from({ length: 40 }, (_, index) => `CR${String(index + 1).padStart(2, "0")}`);
  const schedule = new Map([
    [from, new Map(ids.map((id) => [id, { exports: false }]))],
    [until, new Map(ids.map((id) => [id, { exports: true }]))],
  ]);
  const before = JSON.stringify(bundle);
  const annual = data.summarize("2020-01-01", "yearly", schedule);
  let blocked = 0;
  for (const date of data.calendars.get("daily").filter((date) => date.getUTCFullYear() === 2020)) {
    const day = data.summarize(date, "daily", schedule);
    assert.equal(day.exports.blocked, +date >= from && +date < until ? day.exports.observed : 0);
    assert.equal(day.imports.blocked, 0);
    blocked += day.exports.blocked;
  }
  assert.ok(blocked > 0);
  assert.equal(annual.exports.blocked, blocked);
  let weeks = 0;
  for (const date of data.calendars.get("weekly")) weeks += data.summarize(date, "weekly", schedule).exports.blocked;
  assert.equal(weeks, blocked);
  assert.equal(annual.exports.permitted + annual.exports.blocked, annual.exports.observed);
  assert.equal(JSON.stringify(bundle), before);
  assert.equal(periodStart("2020-02-29", "weekly"), Date.parse("2020-02-24"));
  assert.equal(flowMetrics(annual).internationalExports, annual.exports.observed);
  assert.equal(flowMetrics(annual).retainedExports, annual.exports.observed - blocked);
});

test("unassigned records cannot acquire a regional restriction or population", () => {
  const schedule = new Map([[Date.parse("2018-01-01"), new Map(
    Array.from({ length: 40 }, (_, index) => [`CR${String(index + 1).padStart(2, "0")}`, { imports: false, exports: false }]),
  )]]);
  const summary = data.summarize("2018-01-01", "yearly", schedule);
  assert.equal(summary.imports.permitted + summary.exports.permitted, 0);
  assert.equal(summary.imports.unassigned, 2);
  assert.equal(summary.exports.unassigned, 0);
  assert.equal(summary.exports.blocked, 9549629);
  assert.equal(summary.unmappedDomestic, 7822);
  assert.ok(!Object.hasOwn(summary.regions, "NL_UNMAPPED"));
  assert.ok(!Object.hasOwn(summary.regions, "Import"));
  assert.equal(data.summarize("2023-01-01", "yearly").unmappedDomestic, 4364);
  assert.equal(data.summarize("2023-01-01", "yearly").imports.unassigned, 4);
  assert.throws(() => data.summarize("2024-01-01", "daily"));
  assert.throws(() => data.summarize("2025-01-01", "yearly"));
});

test("bundle rejects incomplete calendars, duplicate routes, unsafe counts and identifying fields", () => {
  for (const change of [
    (p) => { p.years.at(-1).year = 2024; },
    (p) => p.years[0].days.pop(),
    (p) => { p.years[0].days[0].date = "2018-02-30"; },
    (p) => p.boundaryRows.push(p.boundaryRows[0]),
    (p) => { p.boundaryRows[0][2] = "foreign-farm"; },
    (p) => { p.boundaryRows[0][3] = -1; },
    (p) => { p.boundaryRows[0][3] = Number.MAX_SAFE_INTEGER + 1; },
    (p) => { p.boundaryRows[0][3] += 1; },
    (p) => { p.years[0].days[0].ubn = 12; },
    (p) => { p.source.files.extra = "a".repeat(64); },
    (p) => { delete p.source.files["giab2018.xlsx"]; },
  ]) {
    const changed = structuredClone(bundle);
    change(changed);
    assert.throws(() => validatePooledFlows(changed));
  }
});
