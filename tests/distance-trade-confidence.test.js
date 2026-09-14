import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const context = vm.createContext({});
for (const name of ["computeDistanceTradeFit", "evaluateDistanceTradeLog", "computeDistanceTradeConfidence"]) {
  const helper = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(helper, `${name} is defined`);
  vm.runInContext(helper[0], context);
}
const fitCurve = context.computeDistanceTradeFit;
const evaluate = context.evaluateDistanceTradeLog;
const confidence = context.computeDistanceTradeConfidence;
const close = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} differs from ${expected}`);
};
const grid = [4, 30, 80, 140, 200];

function routes(response) {
  const data = [];
  for (let source = 0; source < 12; source++) {
    for (let target = source + 1; target < 12; target++) {
      const distance = 4 + ((source * 31 + target * 19) % 66) * 3;
      for (const direction of [-1, 1]) {
        const error = 0.13 * (Math.sin(source * 1.7) + Math.sin(target * 1.7)) +
          direction * 0.05 * Math.cos(source + target * 1.3);
        data.push({
          sourceId: `R${direction < 0 ? source : target}`,
          targetId: `R${direction < 0 ? target : source}`,
          distance, weight: Math.exp(response(distance) + error),
        });
      }
    }
  }
  return data;
}

function boundaryFit(data, status) {
  const distanceMin = Math.min(...data.map((point) => point.distance));
  const distanceMax = Math.max(...data.map((point) => point.distance));
  const x = data.map(({ distance }) => status === "power-law-limit"
    ? Math.log(distance / distanceMin) / Math.log(distanceMax / distanceMin)
    : (distance - distanceMin) / (distanceMax - distanceMin));
  const y = data.map(({ weight }) => Math.log(weight));
  const meanX = x.reduce((sum, value) => sum + value, 0) / data.length;
  const meanY = y.reduce((sum, value) => sum + value, 0) / data.length;
  const slope = x.reduce((sum, value, i) => sum + (value - meanX) * (y[i] - meanY), 0) /
    x.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  return { status, distanceMin, distanceMax, slope, logReferenceVolume: meanY - slope * meanX };
}

// The oracle enumerates every pair of routes sharing either endpoint.
function oracle(data, fit, distances, includeHessian = true) {
  const finite = fit.status === "fit";
  const p = finite ? 3 : 2;
  const matrix = () => Array.from({ length: p }, () => Array(p).fill(0));
  function derivative(distance) {
    if (!finite) {
      return { j: [1, fit.status === "power-law-limit"
        ? Math.log(distance / fit.distanceMin) / Math.log(fit.distanceMax / fit.distanceMin)
        : (distance - fit.distanceMin) / (fit.distanceMax - fit.distanceMin)], h: matrix() };
    }
    const ratio = distance / fit.sigma;
    const fraction = ratio / (1 + ratio);
    const h = matrix();
    h[1][2] = h[2][1] = fraction;
    h[2][2] = -fit.nu * ratio / (1 + ratio) ** 2;
    return { j: [1, -Math.log1p(ratio), fit.nu * fraction], h };
  }
  const bread = matrix();
  const meat = matrix();
  const observations = data.map((point) => {
    const residual = Math.log(point.weight) - evaluate(fit, point.distance);
    const { j, h } = derivative(point.distance);
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) bread[a][b] += j[a] * j[b] - (includeHessian ? residual * h[a][b] : 0);
    }
    return { ...point, score: j.map((value) => residual * value) };
  });
  for (const first of observations) {
    for (const second of observations) {
      if (![first.sourceId, first.targetId].some((id) => id === second.sourceId || id === second.targetId)) continue;
      for (let a = 0; a < p; a++) {
        for (let b = 0; b < p; b++) meat[a][b] += first.score[a] * second.score[b];
      }
    }
  }
  const determinant = (m) => m.length === 2
    ? m[0][0] * m[1][1] - m[0][1] * m[1][0]
    : m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const det = determinant(bread);
  const inverse = matrix();
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < p; b++) {
      const minor = bread.filter((_, row) => row !== b).map((row) => row.filter((_, column) => column !== a));
      inverse[a][b] = (-1) ** (a + b) * (p === 2 ? minor[0][0] : determinant(minor)) / det;
    }
  }
  const covariance = matrix();
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < p; b++) {
      for (let c = 0; c < p; c++) {
        for (let d = 0; d < p; d++) covariance[a][b] += inverse[a][c] * meat[c][d] * inverse[b][d];
      }
    }
  }
  return distances.map((distance) => {
    const { j } = derivative(distance);
    let variance = 0;
    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) variance += j[a] * covariance[a][b] * j[b];
    }
    const predicted = evaluate(fit, distance);
    return { distance, logLower: predicted - 1.959963984540054 * Math.sqrt(variance),
      logUpper: predicted + 1.959963984540054 * Math.sqrt(variance) };
  });
}

const finiteData = routes((distance) => 8 - 1.6 * Math.log1p(distance / 35));
const finiteFit = fitCurve(finiteData);
assert.equal(finiteFit.status, "fit");

test("dyadic confidence bands agree with the full covariance oracle for every curve family", () => {
  const families = [
    [finiteData, finiteFit],
    ...["exponential-limit", "power-law-limit"].map((status) => {
      const data = routes((distance) => status === "exponential-limit" ? 8 - distance / 90 : 8 - 1.4 * Math.log(distance));
      return [data, boundaryFit(data, status)];
    }),
  ];
  for (const [data, fit] of families) {
    const result = confidence(data, fit, grid);
    assert.equal(result.status, "available", fit.status);
    assert.equal(result.regions, 12);
    const expected = oracle(data, fit, grid);
    result.points.forEach((point, i) => {
      close(point.logLower, expected[i].logLower);
      close(point.logUpper, expected[i].logUpper);
      assert.ok(point.logUpper > point.logLower);
    });
  }
  const exact = oracle(finiteData, finiteFit, grid);
  const gaussNewton = oracle(finiteData, finiteFit, grid, false);
  assert.ok(exact.some((point, i) => Math.abs(point.logUpper - gaussNewton[i].logUpper) > 1e-5));
});

test("repeated and reversed routes remain in the same unordered dyad", () => {
  const original = confidence(finiteData, finiteFit, grid);
  const repeated = finiteData.flatMap((point) => [point, { ...point, sourceId: point.targetId, targetId: point.sourceId }]);
  const result = confidence(repeated.reverse(), finiteFit, grid);
  assert.equal(result.status, "available");
  result.points.forEach((point, i) => {
    close(point.logLower, original.points[i].logLower);
    close(point.logUpper, original.points[i].logUpper);
  });
  const names = ["a|b", "c", "a", "b|c", "a,b", "b", 1, "1", "r8", "r9", "r10", "r11"];
  const renamed = finiteData.map((point) => ({ ...point,
    sourceId: names[Number(point.sourceId.slice(1))], targetId: names[Number(point.targetId.slice(1))] }));
  const collisionSafe = confidence(renamed, finiteFit, grid);
  assert.equal(collisionSafe.status, "available");
  assert.equal(collisionSafe.regions, 12);
  collisionSafe.points.forEach((point, i) => close(point.logUpper, original.points[i].logUpper));
});

test("confidence bands preserve distance and volume unit changes", () => {
  const original = confidence(finiteData, finiteFit, grid);
  for (const distanceScale of [1e-100, 1e100]) {
    for (const volumeScale of [1e-100, 1e100]) {
      const data = finiteData.map((point) => ({ ...point,
        distance: point.distance * distanceScale, weight: point.weight * volumeScale }));
      const fit = fitCurve(data);
      const result = confidence(data, fit, grid.map((distance) => distance * distanceScale));
      assert.equal(result.status, "available");
      result.points.forEach((point, i) => {
        close(point.logLower - Math.log(volumeScale), original.points[i].logLower, 1e-7);
        close(point.logUpper - Math.log(volumeScale), original.points[i].logUpper, 1e-7);
      });
    }
  }
});

test("unsupported or singular data return an explicit reason", () => {
  const unavailable = (data, fit, distances, reason) => {
    const result = confidence(data, fit, distances);
    assert.equal(result.status, "unavailable");
    assert.equal(result.reason, reason);
    assert.equal(result.points, undefined);
  };
  unavailable(finiteData, { status: "no-decay" }, grid, "no-fit");
  unavailable(finiteData.map(({ sourceId, ...point }) => point), finiteFit, grid, "missing-region-ids");
  unavailable(finiteData.slice(0, 3), finiteFit, grid, "insufficient-data");
  unavailable(finiteData, finiteFit, [NaN], "invalid-distance");
  unavailable(finiteData, finiteFit, [0], "invalid-distance");
  unavailable(finiteData, finiteFit, [], "invalid-distance");
  unavailable(finiteData, { ...finiteFit, nu: 0 }, grid, "singular");
  const equalDistances = finiteData.map((point) => ({ ...point, distance: 30 }));
  const linear = boundaryFit(finiteData, "exponential-limit");
  unavailable(equalDistances, linear, grid, "singular");
  const extra = [{ distance: 0, weight: 12 }, { distance: 20, weight: NaN }];
  const filtered = confidence([...finiteData, ...extra], finiteFit, grid);
  const original = confidence(finiteData, finiteFit, grid);
  assert.equal(filtered.status, "available");
  filtered.points.forEach((point, i) => close(point.logUpper, original.points[i].logUpper, 1e-12));
});

test("negative dyadic variance is reported instead of clipped into a confidence band", () => {
  const data = Array.from({ length: 8 }, (_, i) => ({
    sourceId: `R${i}`, targetId: `R${(i + 1) % 8}`, distance: i + 1,
    weight: Math.exp(8 - i * 0.3 + 0.2 * Math.sin((i + 1) * 2.7)),
  }));
  const fit = fitCurve(data);
  assert.equal(fit.status, "fit");
  assert.ok(oracle(data, fit, [1, 2, 4, 8]).some((point) => Number.isNaN(point.logUpper)));
  const result = confidence(data, fit, [1, 2, 4, 8]);
  assert.equal(result.status, "unavailable");
  assert.equal(result.reason, "invalid-variance");
  assert.equal(result.regions, 8);
  assert.equal(result.points, undefined);
});
