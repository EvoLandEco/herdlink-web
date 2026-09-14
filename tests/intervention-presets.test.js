import test from "node:test";
import assert from "node:assert/strict";
import {
  getHistoricalPresetGraph, selectHubTargets, selectBridgeTargets, selectTraceRingTargets,
  getSeedCommunityMembers, isCommunityCordonRoute,
} from "../src/runtime/intervention-presets.js";

const day = (index) => new Date(Date.UTC(2020, 0, index + 1));
const row = (source, target, weight = 1, date = 0) =>
  ({ time: day(date), COROP_LEV: source, COROP_AFN: target, AANTAL: weight });
const graph = (data) => getHistoricalPresetGraph(data, day(0), day(10));

test("an immediate Trace Ring response uses only the seed and leaves the ledger unread", () => {
  const data = { [Symbol.iterator]() { assert.fail("An empty observation window needs no ledger scan"); } };
  assert.deepEqual(selectTraceRingTargets(data, "CR01", day(0), day(0)), ["CR01"]);
  assert.throws(() => selectTraceRingTargets(data, "CR01", NaN, NaN), RangeError);
});

test("history is half open, directed, and built solely from positive cross-region movements", () => {
  const data = [row("A", "B", 3, -1), row("A", "B", 2), row("A", "B", 5, 9),
    row("B", "A", 4), row("A", "A", 1000), row("A", "C", 8, 10), row("D", "A", 9, 11),
    row("NA", "B", 10), row("B", "na", 10), row("", "A", 8), row("A", "C", 0),
    row("A", "C", -1), row("A", "C", Infinity), row("A", "C", NaN)];
  const history = graph(data);
  assert.deepEqual(history.ids, ["A", "B"]);
  assert.deepEqual(history.links, [{ source: "A", target: "B", weight: 7 }, { source: "B", target: "A", weight: 4 }]);
  const changedFuture = data.filter((item) => +item.time < +day(10));
  changedFuture.push(row("FUTURE", "A", 1e6, 10), row("A", "A", 1e9));
  assert.deepEqual(graph(changedFuture), history);
  assert.equal(graph(data), history);
  assert.notEqual(getHistoricalPresetGraph(data, day(1), day(10)), history);
});

test("hubs rank unique destinations, then volume, then ID, and share a source eligibility rule", () => {
  const history = graph([row("A", "X", 3), row("A", "Y", 2), row("A", "Y", 2),
    row("B", "X", 4), row("B", "Y", 4), row("C", "X", 4), row("C", "Y", 4),
    row("D", "X", 1000)]);
  assert.deepEqual(selectHubTargets(history, 10), ["B", "C", "A", "D"]);
  assert.deepEqual(selectHubTargets(history, 2), ["B", "C"]);
  assert.deepEqual(selectBridgeTargets(history, 10), ["A", "B", "C", "D"]);
  assert.deepEqual(selectHubTargets(history, 0), []);
  for (const k of [-1, 1.5, Infinity, NaN]) assert.throws(() => selectHubTargets(history, k), RangeError);
});

test("directed Brandes splits shortest-path credit and ignores trade volume", () => {
  const data = [row("A", "B"), row("A", "C"), row("B", "D"), row("C", "D"), row("D", "E")];
  assert.deepEqual(selectBridgeTargets(graph(data), 10), ["D", "B", "C", "A"]);
  const changedWeights = data.map((item, index) => ({ ...item, AANTAL: index === 0 ? 1e9 : 0.1 }));
  assert.deepEqual(selectBridgeTargets(graph(changedWeights), 10), ["D", "B", "C", "A"]);
  const selected = selectBridgeTargets(graph(data), 2);
  selected.reverse();
  assert.deepEqual(selectBridgeTargets(graph(data), 2), ["D", "B"]);
});

// Enumerating simple paths supplies an independent oracle on five-node graphs.
function enumerateBridgeRanking(history) {
  const neighbors = Object.fromEntries(history.ids.map((id) => [id, []]));
  for (const { source, target } of history.links) neighbors[source].push(target);
  const scores = Object.fromEntries(history.ids.map((id) => [id, 0]));
  for (const source of history.ids) for (const target of history.ids) {
    if (source === target) continue;
    const paths = [];
    function visit(path) {
      const last = path.at(-1);
      if (last === target) paths.push(path);
      else for (const next of neighbors[last]) if (!path.includes(next)) visit([...path, next]);
    }
    visit([source]);
    const shortest = paths.filter((path) => path.length === Math.min(...paths.map((item) => item.length)));
    // With five vertices, shortest-path counts divide 60, keeping credit exact.
    for (const path of shortest) for (const id of path.slice(1, -1)) scores[id] += 60 / shortest.length;
  }
  return history.ids.filter((id) => history.outDegree[id] > 0).sort((a, b) =>
    scores[b] - scores[a] || history.outDegree[b] - history.outDegree[a] || a.localeCompare(b));
}

test("bridge rankings agree with exhaustive directed shortest paths", () => {
  let state = 3729;
  for (let sample = 0; sample < 40; sample++) {
    const data = [];
    for (const source of ["A", "B", "C", "D", "E"]) for (const target of ["A", "B", "C", "D", "E"]) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      if (source !== target && state % 5 < 2) data.push(row(source, target));
    }
    const history = graph(data);
    assert.deepEqual(selectBridgeTargets(history, 5), enumerateBridgeRanking(history), `graph ${sample}`);
  }
});

test("target rankings are cached independently of budgets and community resolution", () => {
  const history = graph([row("A", "B"), row("B", "C"), row("C", "D")]);
  selectBridgeTargets(history, 1);
  selectHubTargets(history, 1);
  const detector = (_nodes, _links, resolution) => ({ partition: { A: 0, B: resolution === 1 ? 0 : 1, C: 1, D: 1 } });
  getSeedCommunityMembers(history, "A", 1, detector);
  getSeedCommunityMembers(history, "A", 1.5, detector);
  const links = history.links;
  const degrees = history.outDegree;
  Object.defineProperty(history, "links", { get() { throw new Error("Cached selection read links"); } });
  Object.defineProperty(history, "outDegree", { get() { throw new Error("Cached selection read degree"); } });
  assert.deepEqual(selectBridgeTargets(history, 3), ["B", "C", "A"]);
  assert.deepEqual(selectHubTargets(history, 3), ["A", "B", "C"]);
  assert.equal(links.length, 3);
  assert.equal(degrees.A, 1);
});

test("Trace Ring uses only outgoing movements inside its calendar window", () => {
  const data = [row("S", "BEFORE", 1, -1), row("S", "A", 1, 0), row("INCOMING", "S", 1, 2),
    row("S", "B", 1, 6), row("S", "AT_RESPONSE", 1, 7), row("S", "AFTER", 1, 8),
    row("S", "A", 2, 3), row("S", "S", 1, 3), row("S", "ZERO", 0, 3), row("S", "NA", 3, 3)];
  assert.deepEqual(selectTraceRingTargets(data, "S", day(0), day(7)), ["A", "B", "S"]);
  assert.deepEqual(selectTraceRingTargets(data, "S", day(0), day(0)), ["S"]);
  assert.deepEqual(selectTraceRingTargets([...data].reverse(), "S", day(0), day(7)), ["A", "B", "S"]);
  assert.throws(() => selectTraceRingTargets(data, "S", day(7), day(0)), RangeError);
});

test("historical communities reuse partitions and cordons cover new outward routes", () => {
  const history = graph([row("A", "B", 3), row("B", "A", 3), row("B", "C")]);
  const calls = [];
  const detector = (nodes, links, resolution) => {
    calls.push({ nodes, links, resolution });
    return { partition: resolution === 1 ? { A: 0, B: 0, C: 1 } : { A: 0, B: 1, C: 2 } };
  };
  const members = getSeedCommunityMembers(history, "A", 1, detector);
  assert.deepEqual([...members], ["A", "B"]);
  assert.deepEqual([...getSeedCommunityMembers(history, "B", 1, detector)], ["A", "B"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].links, history.links);
  assert.deepEqual([...getSeedCommunityMembers(history, "A", 1.5, detector)], ["A"]);
  assert.equal(calls.length, 2);
  assert.deepEqual([...getSeedCommunityMembers(history, "UNOBSERVED", 1, detector)], ["UNOBSERVED"]);
  assert.equal(isCommunityCordonRoute(members, "A", "B"), false);
  assert.equal(isCommunityCordonRoute(members, "B", "C"), true);
  assert.equal(isCommunityCordonRoute(members, "C", "A"), false);
  assert.equal(isCommunityCordonRoute(members, "A", "A"), false);
  assert.equal(isCommunityCordonRoute(members, "A", "FUTURE_DESTINATION"), true);
});

test("empty history leaves selectors with their declared target sets", () => {
  const history = graph([]);
  assert.deepEqual(selectHubTargets(history, 3), []);
  assert.deepEqual(selectBridgeTargets(history, 3), []);
  assert.deepEqual([...getSeedCommunityMembers(history, "S", 1, () => ({ partition: {} }))], ["S"]);
  assert.throws(() => getHistoricalPresetGraph([], day(0), day(0)), RangeError);
  assert.throws(() => getHistoricalPresetGraph([], new Date(NaN), day(1)), RangeError);
});
