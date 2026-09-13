import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const helper = source.match(/^([ ]*)function computeGravityRegression\([^]*?^\1}/m);
assert.ok(helper);
const context = vm.createContext({});
vm.runInContext(helper[0], context);
const fit = context.computeGravityRegression;
const point = (distance, weight, massProduct = 1) => ({ distance, weight, massProduct });

test("gravity fits require distinct positive distances and positive weights", () => {
  for (const data of [[], [point(10, 20)], [point(10, 20), point(10, 40)],
    [point(0, 20), point(10, 40)], [point(10, 0), point(20, 40)],
    [point(10, 20, 0), point(20, 40, 0)], [point(Infinity, 20), point(20, 40)]]) {
    assert.equal(fit(data), null);
  }
});

test("weighted gravity fits recover a power law and leave constant-response R² undefined", () => {
  const result = fit([point(2, 12, 1), point(3, 27, 4), point(5, 75, 10)]);
  assert.ok(Math.abs(result.slope - 2) < 1e-12);
  assert.ok(Math.abs(result.intercept - Math.log(3)) < 1e-12);
  assert.ok(Math.abs(result.rSquared - 1) < 1e-12);
  const constant = fit([point(2, 10, 1), point(3, 10, 4)]);
  assert.ok(Math.abs(constant.slope) < 1e-12);
  assert.equal(constant.rSquared, null);
});
