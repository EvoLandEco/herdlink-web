import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"))[0];
const context = vm.createContext({});
vm.runInContext(["getNodeId", "getLinkKey", "getTradeConcentrationData"].map(extract).join("\n"), context);
const plain = (value) => JSON.parse(JSON.stringify(value));

test("route concentration merges directed records and includes local movements while excluding blocked or empty routes", () => {
  const links = [
    { source: "A", target: "B", weight: 40 },
    { source: { id: "A" }, target: { id: "B" }, weight: 20 },
    { source: "B", target: "A", weight: 20 },
    { source: "A", target: "A", weight: 20 },
    { source: "C", target: "A", weight: 500, disabled: true },
    ...[0, -1, NaN, Infinity].map((weight) => ({ source: "C", target: "B", weight })),
  ];
  const snapshot = plain(links);
  const result = context.getTradeConcentrationData(links);
  assert.equal(result.total, 100);
  assert.equal(result.routeCount, 3);
  assert.equal(result.topFiveShare, 1);
  assert.deepEqual(plain(result.points), [
    { routeShare: 0, volumeShare: 0, routeCount: 0 },
    { routeShare: 1 / 3, volumeShare: 0.6, routeCount: 1 },
    { routeShare: 2 / 3, volumeShare: 0.8, routeCount: 2 },
    { routeShare: 1, volumeShare: 1, routeCount: 3 },
  ]);
  assert.equal(result.coverage.routeCount, 2);
  assert.deepEqual(plain(context.getTradeConcentrationData([...links].reverse())), plain(result));
  assert.deepEqual(plain(links), snapshot);

  links[0].disabled = true;
  assert.equal(context.getTradeConcentrationData(links).total, 60);
  assert.deepEqual(plain(context.getTradeConcentrationData(links.map((link) => ({ ...link, disabled: true })))),
    { points: [], routeCount: 0, total: 0, topFiveShare: null, coverage: null });
});

test("equal and concentrated volumes have the expected cumulative shares and whole-route coverage", () => {
  const links = Array.from({ length: 10 }, (_, index) => ({ source: String(index), target: "B", weight: 1 }));
  const equal = context.getTradeConcentrationData(links);
  assert.ok(equal.points.every((point) => point.routeShare === point.volumeShare));
  assert.equal(equal.topFiveShare, 0.5);
  assert.equal(equal.coverage.routeCount, 8);

  links[0].weight = 91;
  const concentrated = context.getTradeConcentrationData(links);
  assert.equal(concentrated.total, 100);
  assert.equal(concentrated.topFiveShare, 0.95);
  assert.equal(concentrated.coverage.routeCount, 1);
  assert.equal(concentrated.coverage.volumeShare, 0.91);
  assert.equal(concentrated.points.at(-1).volumeShare, 1);
  assert.ok(concentrated.points.every((point, index, points) => index === 0 || point.volumeShare >= points[index - 1].volumeShare));
  assert.deepEqual(plain(context.getTradeConcentrationData([])),
    { points: [], routeCount: 0, total: 0, topFiveShare: null, coverage: null });
});
