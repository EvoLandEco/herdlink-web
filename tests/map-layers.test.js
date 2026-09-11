import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { censusValue, wmtsTiles } from "../src/mapLayers.js";

const matrices = [
  { id: "00", resolution: 4, origin: [0, 2048], tileWidth: 256, tileHeight: 256, width: 2, height: 2 },
  { id: "01", resolution: 2, origin: [0, 2048], tileWidth: 256, tileHeight: 256, width: 4, height: 4 },
];

test("WMTS coverage respects exact tile edges and northing direction", () => {
  assert.deepEqual(wmtsTiles(matrices, [512, 1024, 1024, 1536], 2), [
    { matrix: "01", row: 1, col: 1, x: 512, y: 1536, width: 512, height: 512 },
  ]);
  const tiles = wmtsTiles(matrices, [510, 1022, 1026, 1538], 2);
  assert.equal(tiles.length, 9);
  assert.deepEqual(tiles.map(({ row, col }) => [row, col]), [
    [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2],
  ]);
});

test("WMTS chooses sufficient resolution and stays within matrix coverage", () => {
  assert.equal(wmtsTiles(matrices, [0, 1024, 1024, 2048], 3)[0].matrix, "01");
  assert.equal(wmtsTiles(matrices, [-500, -500, 2500, 2500], 4).length, 4);
  assert.deepEqual(wmtsTiles(matrices, [-500, -500, -1, -1], 2), []);
});

test("census data keep zero distinct from missing and use the exact year", () => {
  const census = { years: { 2019: { CR01: { pigsPerKm2: 0, holdingsPerKm2: null } } } };
  assert.equal(censusValue(census, 2019, "CR01", "pigs"), 0);
  assert.equal(censusValue(census, 2019, "CR01", "holdings"), null);
  assert.equal(censusValue(census, 2020, "CR01", "pigs"), null);
  assert.equal(censusValue(census, 2019, "CR02", "pigs"), null);
});

test("bundled census covers the weekly spillover year and land densities", () => {
  const census = JSON.parse(readFileSync(new URL("../public/assets/data/pig-census.json", import.meta.url)));
  for (const year of [2018, 2019, 2020, 2021, 2022]) {
    assert.equal(Object.keys(census.years[year]).length, 40);
    for (const [code, row] of Object.entries(census.years[year])) {
      for (const [metric, count] of [["pigs", row.pigs], ["holdings", row.holdings]]) {
        const value = censusValue(census, year, code, metric);
        assert.ok(Math.abs(value - count / row.landAreaKm2) < 0.000001);
      }
    }
  }
});
