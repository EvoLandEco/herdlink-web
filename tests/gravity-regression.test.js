import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const context = vm.createContext({});
for (const name of ["computeDistanceTradeFit", "evaluateDistanceTradeLog"]) {
  const helper = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(helper);
  vm.runInContext(helper[0], context);
}
const fit = context.computeDistanceTradeFit;
const evaluate = context.evaluateDistanceTradeLog;
const point = (distance, weight, massProduct = 1) => ({ distance, weight, massProduct });
const distances = [1, 2, 3, 5, 10, 20, 50, 100, 200, 500];
const kernel = (sigma, nu = 1.3, amplitude = 1000) => distances.map((distance) =>
  point(distance, amplitude * Math.exp(-nu * Math.log1p(distance / sigma))),
);
const close = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} differs from ${expected}`);
};

test("finite distance curves recover amplitude, scale, and decay", () => {
  for (const sigma of [0.001, 0.1, 1, 10, 100, 1000, 100000]) {
    const data = kernel(sigma);
    const result = fit(data);
    assert.equal(result.status, "fit");
    close(result.sigma / sigma, 1);
    close(result.nu, 1.3);
    close(result.logAmplitude, Math.log(1000));
    assert.ok(result.logRmse < 1e-8);
    assert.equal(result.n, distances.length);
    assert.equal(result.distanceMin, 1);
    assert.equal(result.distanceMax, 500);
    for (const { distance, weight } of data) close(evaluate(result, distance), Math.log(weight), 1e-8);
  }
});

test("noisy route fits agree with independent three-parameter least squares", () => {
  const data = Array.from({ length: 40 }, (_, i) => {
    const distance = 0.1 * 10000 ** (i / 39);
    const noise = 0.12 * Math.sin(i * 1.9) + 0.07 * Math.cos(i * 0.8);
    return point(distance, 1200 * Math.exp(-1.7 * Math.log1p(distance / 25) + noise));
  });
  const result = fit(data);
  assert.equal(result.status, "fit");
  // SciPy least_squares fits log amplitude, log scale, and log decay to these routes.
  close(result.logAmplitude, 7.0942183977);
  close(result.sigma, 25.02088343);
  close(result.nu, 1.7043614191);
  close(result.logRmse, 0.0977862369868, 1e-10);
  const rmse = Math.sqrt(data.reduce((sum, datum) => sum + (Math.log(datum.weight) - evaluate(result, datum.distance)) ** 2, 0) / data.length);
  close(rmse, result.logRmse, 1e-12);
});

test("distance and volume units preserve fitted shape across floating-point scales", () => {
  const data = kernel(20);
  const original = fit(data);
  for (const distanceScale of [1e-300, 1e-100, 1e100, 1e300]) {
    for (const volumeScale of [1e-200, 1e200]) {
      const scaled = data.map(({ distance, weight }) => point(distance * distanceScale, weight * volumeScale));
      const result = fit(scaled);
      assert.equal(result.status, "fit");
      close(result.sigma / distanceScale, original.sigma, 1e-5);
      close(result.nu, original.nu);
      close(result.logAmplitude - Math.log(volumeScale), original.logAmplitude);
      assert.ok(result.logRmse < 1e-7);
      for (const { distance, weight } of scaled) close(evaluate(result, distance), Math.log(weight), 1e-8);
    }
  }
});

test("each route has equal influence regardless of node mass and input order", () => {
  const data = kernel(20).map((datum, i) => ({ ...datum, weight: datum.weight * Math.exp(0.1 * Math.sin(i)) }));
  const original = fit(data);
  const variedMass = fit(data.map((datum, i) => ({ ...datum, massProduct: [0, -1, NaN, Infinity, 1e300][i % 5] })).reverse());
  assert.equal(variedMass.status, "fit");
  close(variedMass.sigma, original.sigma);
  close(variedMass.nu, original.nu);
  close(variedMass.logAmplitude, original.logAmplitude);
  const repeated = fit(data.flatMap((datum) => [datum, datum, datum]));
  close(repeated.sigma, original.sigma);
  close(repeated.nu, original.nu);
  close(repeated.logRmse, original.logRmse);
});

test("insufficient routes and invalid observations do not produce curves", () => {
  for (const data of [[], [point(10, 20)], [point(10, 20), point(20, 10)],
    [point(10, 20), point(10, 40), point(20, 10)],
    [point(0, 20), point(10, 40), point(20, 10)],
    [point(10, 0), point(20, 40), point(30, 10)],
    [point(Infinity, 20), point(20, 40), point(30, 10)]]) {
    assert.equal(fit(data).status, "insufficient-data");
  }
  const data = kernel(20);
  const result = fit([...data, point(NaN, 20), point(20, Infinity), point(-20, 1)]);
  assert.equal(result.status, "fit");
  assert.equal(result.n, data.length);
  close(result.sigma, 20);
});

test("flat and increasing observations do not force a decreasing curve", () => {
  for (const response of [() => 100, (distance) => distance]) {
    const result = fit(distances.map((distance) => point(distance, response(distance))));
    assert.equal(result.status, "no-decay");
    assert.ok(Number.isNaN(evaluate(result, 10)));
  }
});

test("distances indistinguishable in log space are reported as unidentifiable", () => {
  const distance = 1e100;
  const result = fit([distance, distance * (1 + Number.EPSILON), distance * (1 + 2 * Number.EPSILON)]
    .map((value, i) => point(value, 3 - i)));
  assert.equal(result.status, "unidentifiable");
  assert.equal(result.n, 3);
});

test("power-law and exponential limits have exact curves without finite scale estimates", () => {
  for (const [status, response] of [
    ["power-law-limit", (distance) => 100 * distance ** -1.3],
    ["exponential-limit", (distance) => 100 * Math.exp(-distance / 100)],
  ]) {
    const data = distances.map((distance) => point(distance, response(distance)));
    const result = fit(data);
    assert.equal(result.status, status);
    assert.equal(result.sigma, undefined);
    assert.ok(result.logRmse < 1e-12);
    for (const { distance, weight } of data) close(evaluate(result, distance), Math.log(weight), 1e-12);
  }
});
