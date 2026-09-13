import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/assets/js/herdlink-runtime.js", import.meta.url), "utf8");
const extract = (name) => source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"))[0];

test("date lookups reuse one index per dataset and preserve interleaved records", () => {
  const context = vm.createContext({ tradeRecordsByDataset: new WeakMap() });
  vm.runInContext(extract("getTradeRecordsByDate"), context);
  let reads = 0;
  const dates = [new Date("2020-01-01"), new Date("2020-01-02")];
  const row = (index) => ({ get time() { reads++; return dates[index]; } });
  const data = [row(1), row(0), row(1)];
  const index = context.getTradeRecordsByDate(data);
  assert.deepEqual(Array.from(index.get(+dates[1])), [data[0], data[2]]);
  assert.deepEqual(Array.from(index.get(+dates[0])), [data[1]]);
  assert.equal(reads, 3);
  assert.equal(context.getTradeRecordsByDate(data), index);
  assert.equal(reads, 3);
  const replacement = [row(0)];
  assert.notEqual(context.getTradeRecordsByDate(replacement), index);
  assert.equal(reads, 4);
  assert.equal(index.get(+dates[1]).length, 2);
});

test("frame construction preserves recorded routes and completes missing directed controls", () => {
  const context = vm.createContext({
    window: { currentDate: new Date("2020-01-01") }, nlLabelPoints: null,
    getDisabledLinkKeys: () => new Set(["CR35-CR01", "CR35-CR41"]),
    setTradeEdgeScales() {},
  });
  vm.runInContext(["getNodeId", "getLinkKey", "initNodesAndLinks"].map(extract).join("\n"), context);
  for (const routes of [[], [["CR35", "CR35", 10]], [["CR35", "CR01", 5], ["CR01", "CR35", 7], ["CR41", "CR35", 3]]]) {
    context.initNodesAndLinks(routes.map(([COROP_LEV, COROP_AFN, AANTAL]) => ({ COROP_LEV, COROP_AFN, AANTAL })));
    const links = context.allLinks;
    const nodes = context.allNodes;
    assert.equal(links.length, nodes.length ** 2);
    assert.equal(new Set(links.map((link) => link.id)).size, links.length);
    for (const [source, target, weight] of routes) {
      const link = links.find((link) => link.id === `${source}-${target}`);
      assert.equal(link.weight, weight);
      assert.equal(link.ledgerWeight, weight);
      assert.equal(link.source, nodes.find((node) => node.id === source));
      assert.equal(link.target, nodes.find((node) => node.id === target));
    }
    assert.equal(links.find((link) => link.id === "CR35-CR01").disabled, true);
    assert.equal(links.find((link) => link.id === "CR01-CR35").disabled, false);
    assert.equal(context.enabledLinks.some((link) => link.disabled || link.weight <= 0), false);
    assert.equal(nodes.reduce((sum, node) => sum + node.tradeTotal, 0), 2 * routes.reduce((sum, row) => sum + row[2], 0));
  }
});
