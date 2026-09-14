import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function runtime() {
  const context = vm.createContext({ Map, Set });
  const functions = ["getNodeId", "buildCommunityFlowData"].map(extractFunction);
  vm.runInContext(functions.join("\n"), context);
  return context;
}

test("flow rosters retain every COROP and group absent trade regions as unassigned", () => {
  const context = runtime();
  const ids = Array.from({ length: 40 }, (_, i) => `CR${String(i + 1).padStart(2, "0")}`);
  const partition = { CR01: 10, CR03: 10, CR02: 2 };
  const result = context.buildCommunityFlowData(ids, partition, []);

  assert.equal(result.nodes.length, 40);
  assert.equal(new Set(result.nodes.map((node) => node.id)).size, 40);
  assert.deepEqual(plain(result.groups.map(({ key, nodeCount }) => ({ key, nodeCount }))), [
    { key: "2", nodeCount: 1 }, { key: "10", nodeCount: 2 }, { key: "NA", nodeCount: 37 },
  ]);
  assert.deepEqual(plain(result.groups[1].members), ["CR01", "CR03"]);
  assert.ok(result.nodes.every((node) => node.incoming === 0 && node.outgoing === 0 && node.local === 0));
  assert.deepEqual(plain(result.flows), []);
  assert.equal(result.total, 0);
  assert.equal(result.local, 0);
  assert.equal(result.activeCount, 0);

  const empty = context.buildCommunityFlowData(ids, {}, []);
  assert.equal(empty.groups.length, 1);
  assert.equal(empty.groups[0].key, "NA");
  assert.equal(empty.groups[0].nodeCount, 40);
});

test("flow node positions have the same roster order across dates and input ordering", () => {
  const context = runtime();
  const ids = ["CR10", "CR03", "CR02", "CR01"];
  const partition = { CR10: 1, CR03: 2, CR02: 1 };
  const early = context.buildCommunityFlowData(ids, partition, [
    { source: "CR03", target: "CR02", weight: 9999 },
  ]);
  const late = context.buildCommunityFlowData([...ids].reverse(), { CR02: 1, CR10: 1, CR03: 2 }, [
    { source: "CR01", target: "CR10", weight: 2 },
  ]);
  const roster = (data) => plain(data.nodes.map(({ id, key }) => ({ id, key })));

  assert.deepEqual(roster(early), [
    { id: "CR02", key: "1" }, { id: "CR10", key: "1" },
    { id: "CR03", key: "2" }, { id: "CR01", key: "NA" },
  ]);
  assert.deepEqual(roster(late), roster(early));
  assert.deepEqual(plain(late.groups), plain(early.groups));
});

test("flow totals preserve direction, duplicate routes and local movement", () => {
  const context = runtime();
  const links = [
    { source: "CR01", target: "CR02", weight: 11 },
    { source: { id: "CR01" }, target: { id: "CR02" }, weight: 7 },
    { source: "CR02", target: "CR01", weight: 3 },
    { source: "CR01", target: "CR01", weight: 5 },
  ];
  const snapshot = plain(links);
  const result = context.buildCommunityFlowData(["CR01", "CR02"], { CR01: 0, CR02: 1 }, links);
  const flows = new Map(result.flows.map((flow) => [flow.key, flow]));
  const nodes = new Map(result.nodes.map((node) => [node.id, node]));

  assert.equal(flows.size, 3);
  assert.equal(flows.get('["CR01","CR02"]').weight, 18);
  assert.equal(flows.get('["CR02","CR01"]').weight, 3);
  assert.equal(flows.get('["CR01","CR01"]').weight, 5);
  assert.equal(nodes.get("CR01").incoming, 8);
  assert.equal(nodes.get("CR01").outgoing, 23);
  assert.equal(nodes.get("CR01").local, 5);
  assert.equal(nodes.get("CR02").incoming, 18);
  assert.equal(nodes.get("CR02").outgoing, 3);
  assert.equal(nodes.get("CR02").local, 0);
  assert.equal(result.nodes.reduce((sum, node) => sum + node.incoming, 0), 26);
  assert.equal(result.nodes.reduce((sum, node) => sum + node.outgoing, 0), 26);
  assert.equal(result.total, 26);
  assert.equal(result.local, 5);
  assert.equal(result.activeCount, 2);
  assert.deepEqual(plain(links), snapshot);
});

test("flow summary counts local exposure once and includes only active regions", () => {
  const context = runtime();
  const result = context.buildCommunityFlowData(["CR01", "CR02", "CR03"], {}, [
    { source: "CR01", target: "CR01", weight: 0.125 },
    { source: "CR01", target: "CR01", weight: 0.25 },
    { source: "CR02", target: "CR03", weight: 1000, disabled: true },
  ]);
  assert.equal(result.total, 0.375);
  assert.equal(result.local, result.total);
  assert.equal(result.activeCount, 1);
});

test("flow inputs exclude disabled routes, unknown endpoints and invalid weights", () => {
  const context = runtime();
  const links = [
    { source: "CR01", target: "CR02", weight: 4 },
    ...[0, -4, Infinity, -Infinity, NaN, undefined].map((weight) => ({ source: "CR01", target: "CR02", weight })),
    { source: "CR01", target: "CR02", weight: 1000, disabled: true },
    { source: "NA", target: "CR02", weight: 1000 },
    { source: "CR01", target: "missing", weight: 1000 },
    { source: null, target: "CR02", weight: 1000 },
  ];
  const result = context.buildCommunityFlowData(["CR01", "CR02"], {}, links);

  assert.equal(result.flows.length, 1);
  assert.equal(result.flows[0].weight, 4);
  assert.equal(result.total, 4);
  assert.equal(result.local, 0);
  assert.equal(result.activeCount, 2);
  assert.ok(result.nodes.every((node) => Number.isFinite(node.incoming) && Number.isFinite(node.outgoing)));
  assert.deepEqual(plain(context.buildCommunityFlowData([], {}, links)), {
    nodes: [], groups: [], flows: [], total: 0, local: 0, activeCount: 0,
  });
});

test("community view selection renders only the panel and leaves analysis state untouched", () => {
  const context = runtime();
  const calls = [];
  const partition = Object.freeze({ CR01: 0 });
  const stats = Object.freeze({ date: Object.freeze({ numPartitions: 1 }) });
  const trajectory = Object.freeze({ frames: [] });
  Object.assign(context, {
    communityView: "heatmap", loadedCSVData: [], tradeCommunityTimeline: { partition },
    window: { allTemporalStats: stats, isSwitchingCSV: false },
    simulationState: { trajectory },
    document: { getElementById(id) {
      assert.equal(id, "communityViewSwitch");
      return { setAttribute: (name, value) => calls.push([name, value]) };
    } },
    updateSCCs: () => calls.push("render"),
  });
  for (const name of ["computeTradeCommunityTimeline", "computeTemporalNetworkStats", "computeModularity",
    "setTradeCommunityScale", "buildSimulationTrajectory", "refreshCurrentNetworkFrame"]) {
    context[name] = () => assert.fail(`${name} must not run for a view selection`);
  }
  vm.runInContext(extractFunction("setCommunityView"), context);

  assert.equal(context.setCommunityView("flow"), true);
  assert.equal(context.communityView, "flow");
  assert.deepEqual(calls, [["aria-checked", "true"], "render"]);
  assert.equal(context.setCommunityView("heatmap"), true);
  assert.equal(context.communityView, "heatmap");
  assert.deepEqual(calls.slice(2), [["aria-checked", "false"], "render"]);
  assert.equal(context.tradeCommunityTimeline.partition, partition);
  assert.equal(context.window.allTemporalStats, stats);
  assert.equal(context.simulationState.trajectory, trajectory);

  calls.length = 0;
  for (const view of ["heatmap", "invalid", "FLOW", "", null, undefined]) {
    assert.equal(context.setCommunityView(view), false);
  }
  assert.equal(context.communityView, "heatmap");
  assert.deepEqual(calls, []);

  context.window.isSwitchingCSV = true;
  assert.equal(context.setCommunityView("flow"), true);
  assert.deepEqual(calls, [["aria-checked", "true"]]);
});

test("flow geometry is reused for the same roster and rebuilt when community membership changes", () => {
  const context = runtime();
  let hierarchyCalls = 0, clusterCalls = 0;
  const sizes = [];
  Object.assign(context, {
    communityFlowGeometry: null,
    d3: {
      hierarchy(data) {
        hierarchyCalls++;
        return { leaves: () => data.children.flatMap((group) => group.children.map((data) => ({ data }))) };
      },
      cluster() {
        return { size(value) {
          sizes.push(Array.from(value));
          return () => { clusterCalls++; };
        } };
      },
    },
  });
  vm.runInContext(extractFunction("getCommunityFlowGeometry"), context);
  const partition = { CR01: 0, CR02: 1 };
  const groups = [{ key: "0", members: ["CR01"] }, { key: "1", members: ["CR02"] }];
  const first = context.getCommunityFlowGeometry(groups, partition);
  const second = context.getCommunityFlowGeometry(plain(groups), partition);
  assert.equal(second, first);
  assert.equal(hierarchyCalls, 1);
  assert.equal(clusterCalls, 1);
  assert.deepEqual(sizes, [[2 * Math.PI, 1]]);
  assert.deepEqual(Array.from(first.nodesById.keys()), ["CR01", "CR02"]);

  const third = context.getCommunityFlowGeometry(groups, { ...partition });
  assert.notEqual(third, first);
  assert.equal(clusterCalls, 2);
  const fourth = context.getCommunityFlowGeometry([{ key: "0", members: ["CR01", "CR02"] }], third.partition);
  assert.notEqual(fourth, third);
  assert.equal(clusterCalls, 3);
  assert.equal(fourth.nodesById.get("CR02").data.key, "0");
});

test("simulation frame rendering preserves the selected community view", () => {
  const context = runtime();
  const calls = [];
  Object.assign(context, {
    communityView: "flow", selectedNodeData: null, simulationState: { currentFrame: {} },
    isSimulationModeActive: () => true,
    renderCommunityFlowPanel: () => calls.push("flow"),
    renderSimulationPartitionStructurePanel: () => calls.push("heatmap"),
  });
  for (const name of ["renderSimulationNodeControls", "renderSimulationStatsContainer", "renderSimulationGlobalStatsChart",
    "renderSimulationNodeStatsChart", "renderSimulationSpatialPatternPanel", "applySimulationNodeStyles"]) {
    context[name] = () => {};
  }
  vm.runInContext(["renderSimulationPanels", "updateSCCs"].map(extractFunction).join("\n"), context);
  context.renderSimulationPanels();
  assert.deepEqual(calls, ["flow"]);
  context.communityView = "heatmap";
  context.renderSimulationPanels();
  assert.deepEqual(calls, ["flow", "heatmap"]);
});

function flowAnimation(reducedMotion = false) {
  function select(nodes) {
    return {
      filter(selector) {
        assert.equal(selector, ":not(.is-exiting)");
        return select(nodes.filter((node) => !node.exiting));
      },
      classed(name, value) {
        assert.equal(name, "is-exiting");
        nodes.forEach((node) => { node.exiting = value; });
        return this;
      },
      selectAll(selector) {
        assert.equal(selector, "*");
        return select(nodes.flatMap((node) => node.children || []));
      },
      interrupt() {
        nodes.forEach((node) => {
          if (node.pending) node.pending.cancelled = true;
          node.pending = null;
        });
        return this;
      },
      attr(name, value) {
        nodes.forEach((node) => { node[name] = value; });
        return this;
      },
      style(name, value) {
        nodes.forEach((node) => { (node.styles ||= {})[name] = value; });
        return this;
      },
      remove() { nodes.forEach((node) => { node.removed = true; }); },
      transition() {
        const pending = nodes.map((node) => node.pending = { node, attributes: {}, styles: {} });
        return {
          duration(value) { pending.forEach((item) => { item.duration = value; }); return this; },
          attr(name, value) { pending.forEach((item) => { item.attributes[name] = value; }); return this; },
          style(name, value) { pending.forEach((item) => { item.styles[name] = value; }); return this; },
          on(name, callback) {
            assert.equal(name, "end");
            pending.forEach((item) => { item.end = callback; });
            return this;
          },
          remove() { pending.forEach((item) => { item.remove = true; }); return this; },
        };
      },
    };
  }
  const context = vm.createContext({ reducedMotion, d3: { select: (node) => select([node]) } });
  vm.runInContext(["transitionSelection", "animateFlow", "exitFlow"].map(extractFunction).join("\n"), context);
  return {
    context, select,
    finish(pending) {
      if (pending.cancelled) return;
      Object.assign(pending.node, pending.attributes);
      Object.assign(pending.node.styles ||= {}, pending.styles);
      pending.end?.call(pending.node);
      if (pending.remove) pending.node.removed = true;
      pending.node.pending = null;
    },
  };
}

test("returning flows cancel pending removal and finish at their latest visible state", () => {
  const { context, select, finish } = flowAnimation();
  const node = { opacity: 0.6, styles: { "--flow-fade": 0.4 } };
  const selection = select([node]);
  context.exitFlow(selection);
  const departure = node.pending;
  assert.equal(departure.remove, true);
  assert.equal(departure.styles["--flow-fade"], 0);

  context.animateFlow(selection.classed("is-exiting", false)).attr("opacity", 1)
    .style("--flow-weight", 0.5).style("--flow-fade", 1);
  const arrival = node.pending;
  assert.equal(departure.cancelled, true);
  assert.equal(arrival.duration, 300);
  assert.equal(node.opacity, 0.6);
  assert.equal(node.styles["--flow-fade"], 0.4);
  finish(departure);
  assert.notEqual(node.removed, true);
  assert.equal(node.styles["--flow-fade"], 0.4);
  finish(arrival);
  assert.equal(node.opacity, 1);
  assert.equal(node.styles["--flow-fade"], 1);
  assert.equal(node.styles["--flow-weight"], 0.5);
  assert.equal(node.pending, null);
});

test("repeated flow exits keep their removal timer and stop descendant transitions at completion", () => {
  const { context, select, finish } = flowAnimation();
  const child = {};
  context.animateFlow(select([child])).attr("opacity", 1);
  const childTransition = child.pending;
  const node = { children: [child] };
  const selection = select([node]);
  context.exitFlow(selection);
  const departure = node.pending;
  context.exitFlow(selection);
  assert.equal(node.pending, departure);
  assert.notEqual(departure.cancelled, true);
  finish(departure);
  assert.equal(node.removed, true);
  assert.equal(node.styles["--flow-fade"], 0);
  assert.equal(childTransition.cancelled, true);
  assert.equal(child.pending, null);
});

test("reduced motion applies flow attributes immediately and stops parent and descendant transitions on removal", () => {
  const { context, select } = flowAnimation();
  const childTransition = {};
  const child = { pending: childTransition };
  const parentTransition = {};
  const node = { pending: parentTransition, children: [child] };
  const selection = select([node]);
  context.reducedMotion = true;
  context.animateFlow(selection).attr("opacity", 1).style("--flow-fade", 1);
  assert.equal(node.opacity, 1);
  assert.equal(node.styles["--flow-fade"], 1);
  assert.equal(node.pending, null);
  assert.equal(parentTransition.cancelled, true);

  node.pending = {};
  const removalTransition = node.pending;
  context.exitFlow(selection);
  assert.equal(removalTransition.cancelled, true);
  assert.equal(childTransition.cancelled, true);
  assert.equal(child.pending, null);
  assert.equal(node.removed, true);
});
