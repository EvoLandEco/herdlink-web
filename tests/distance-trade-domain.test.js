import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const context = vm.createContext({
  d3: { extent: (data, value) => [Math.min(...data.map(value)), Math.max(...data.map(value))] },
});
vm.runInContext(source.match(/^([ ]*)function getDistanceTradeDomain\([^]*?^\1}/m)[0], context);
const domain = context.getDistanceTradeDomain;
const position = (value, [low, high]) => Math.log(value / low) / Math.log(high / low);

test("log axes enclose the current routes with equal, small margins at both ends", () => {
  for (const [minimum, maximum] of [[23, 222], [90, 95], [420, 680], [0.01, 0.08], [1, 90000]]) {
    const data = [{ distance: minimum }, { distance: maximum }];
    const bounds = domain(data, "distance");
    assert.ok(bounds[0] > 0 && bounds[0] < minimum && bounds[1] > maximum);
    const left = position(minimum, bounds);
    const right = 1 - position(maximum, bounds);
    assert.ok(Math.abs(left - right) < 1e-10);
    assert.ok(left > 0.04 && left < 0.07);
  }
});

test("a narrower date or focused region contracts both axes without retaining past extrema", () => {
  const all = [{ distance: 25, weight: 1 }, { distance: 120, weight: 1000 }, { distance: 250, weight: 50000 }];
  const focused = [{ distance: 110, weight: 800 }, { distance: 130, weight: 1200 }];
  for (const field of ["distance", "weight"]) {
    const wide = domain(all, field);
    const narrow = domain(focused, field);
    assert.ok(narrow[0] > wide[0] && narrow[1] < wide[1]);
    const rescaled = domain(focused.map(point => ({ [field]: point[field] * 100 })), field);
    narrow.forEach((bound, i) => assert.ok(Math.abs(rescaled[i] / bound - 100) < 1e-10));
  }
});

test("single routes and equal values have a finite log range centered on the observation", () => {
  for (const value of [0.001, 1, 85, 123456]) {
    for (const count of [1, 5]) {
      const bounds = domain(Array.from({ length: count }, () => ({ weight: value })), "weight");
      assert.ok(bounds.every(Number.isFinite) && bounds[0] > 0 && bounds[1] > bounds[0]);
      assert.ok(Math.abs(position(value, bounds) - 0.5) < 1e-10);
    }
  }
});
