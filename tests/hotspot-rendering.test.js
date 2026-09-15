import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const metricNames = ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"];
const scores = (values = {}) => Object.assign(Object.fromEntries(metricNames.map((metric) => [metric, 0])), values);

function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function runtime() {
  const context = vm.createContext({
    metricNames, numberPrintedHotspots: 3, isSimulationModeActive: () => false,
  });
  vm.runInContext(["getHotspotRankings", "hotspotLabelDy", "updateHotspotMarks"].map(extractFunction).join("\n"), context);
  return context;
}

test("hotspot ranks exclude zero and invalid scores and break ties consistently", () => {
  const context = runtime();
  const metrics = {
    CR35: scores({ outDegree: 0 }),
    CR10: scores({ outDegree: 8 }),
    CR02: scores({ outDegree: 8 }),
    CR03: scores({ outDegree: 12 }),
    CR01: scores({ outDegree: 1 }),
    CR04: scores({ outDegree: NaN }),
    CR05: scores({ outDegree: Infinity }),
    CR06: scores({ outDegree: -1 }),
  };
  assert.deepEqual(Array.from(context.getHotspotRankings(metrics).outDegree), ["CR03", "CR02", "CR10"]);
  assert.deepEqual(Array.from(context.getHotspotRankings(metrics, false, 5).outDegree), ["CR03", "CR02", "CR10", "CR01"]);
  assert.deepEqual(Array.from(context.getHotspotRankings({ CR35: metrics.CR35 }).outDegree), []);
  assert.ok(Object.values(context.getHotspotRankings(null)).every((ranks) => ranks.length === 0));
});

test("network structural marks require cross-region flow while simulation marks use their disease metrics", () => {
  const context = runtime();
  const metrics = {
    CR01: scores({ pageRank: 0.9, eigenvector: 0.8 }),
    CR02: scores({ outDegree: 1, pageRank: 0.4, eigenvector: 0.2 }),
    CR03: scores({ inDegree: 1, pageRank: 0.2, eigenvector: 0.1 }),
  };
  const networkRanks = context.getHotspotRankings(metrics, false);
  assert.deepEqual(Array.from(networkRanks.pageRank), ["CR03"]);
  assert.deepEqual(Array.from(networkRanks.eigenvector), ["CR02", "CR03"]);

  const simulationRanks = context.getHotspotRankings(metrics, true);
  assert.deepEqual(Array.from(simulationRanks.pageRank), ["CR01", "CR02", "CR03"]);
  assert.deepEqual(Array.from(simulationRanks.eigenvector), ["CR01", "CR02", "CR03"]);
});

test("legend labels, symbol codes and info button text follow the active mode in both directions", () => {
  const context = runtime();
  const items = metricNames.map((metric) => {
    const icon = { dataset: { metric }, innerHTML: "" };
    const label = { textContent: "" };
    return { icon, label, querySelector: (selector) => selector === ".legendIcon" ? icon : label };
  });
  const buttonAttributes = new Map();
  const button = { setAttribute: (name, value) => buttonAttributes.set(name, value) };
  context.document = {
    querySelector(selector) { assert.equal(selector, ".hotspotInfoButton"); return button; },
    querySelectorAll: () => items,
  };
  context.controlTips = { hotspotInfo: "Show hotspot details" };
  context.hotspotStyles = Object.fromEntries(metricNames.map((metric) => [metric, {
    color: "blue", dash: "none", pattern: "Solid",
  }]));
  vm.runInContext(["setControlTip", "getHotspotDefinitions", "hotspotSymbol", "updateHotspotLegend"].map(extractFunction).join("\n"), context);
  for (const simulation of [false, true, false]) {
    context.isSimulationModeActive = () => simulation;
    context.updateHotspotLegend();
    const tip = simulation ? "Show simulation indicators" : "Show hotspot details";
    assert.equal(buttonAttributes.get("aria-label"), tip);
    assert.equal(buttonAttributes.get("data-tip"), tip);
    const expected = simulation
      ? [["Incoming Exposure", "IN"], ["Outgoing Pressure", "OUT"], ["Prevalence", "I%"], ["Infectious Burden", "I"], ["Pressure per Infectious", "P/I"]]
      : [["Vulnerable", "ID"], ["Seeding", "OD"], ["Bottleneck", "BT"], ["Sink", "PR"], ["Amplifier", "EC"]];
    expected.forEach(([label, code], index) => {
      assert.equal(items[index].label.textContent, label);
      assert.ok(items[index].icon.innerHTML.includes(`<title>${code}: Solid ring</title>`));
      assert.ok(items[index].icon.innerHTML.includes(`>${code}</text>`));
    });
  }
});

test("the hotspot guide shows the active mode's title and five metric definitions", () => {
  const context = runtime();
  let markup;
  let closeFocusCount = 0;
  const closeButton = { focus() { closeFocusCount += 1; } };
  const closeSelection = { on() { return this; }, node: () => closeButton };
  const overlay = {
    empty: () => false,
    attr() { return this; },
    html(value) { markup = value; return this; },
    on() { return this; },
    select(selector) { assert.equal(selector, ".hotspot-info-close"); return closeSelection; },
  };
  context.document = { activeElement: null };
  context.d3 = { select(selector) {
    assert.equal(selector, "body");
    return { select(id) { assert.equal(id, "#hotspotInfoOverlay"); return overlay; } };
  } };
  context.hotspotStyles = Object.fromEntries(metricNames.map((metric) => [metric, {
    color: "blue", dash: "none", pattern: "Solid",
  }]));
  vm.runInContext(["getHotspotDefinitions", "hotspotSymbol", "showHotspotInfoOverlay"].map(extractFunction).join("\n"), context);

  for (const simulation of [false, true, false]) {
    context.isSimulationModeActive = () => simulation;
    context.showHotspotInfoOverlay();
    const title = simulation ? "Simulation Indicators" : "Hotspot Metrics";
    const titleBlock = markup.match(/id="hotspotInfoTitle"[^>]*>([\s\S]*?)<\/div>/)[1];
    assert.ok(titleBlock.includes(title));
    assert.ok(markup.includes(`aria-label="Close ${title.toLowerCase()}"`));
    const headerTitles = [...markup.matchAll(/<span class="hotspot-metric-title">(.*?)<\/span>/g)].map((match) => match[1]);
    assert.deepEqual(headerTitles, simulation ? [
      "Incoming Exposure", "Outgoing Pressure", "Prevalence", "Infectious Burden", "Pressure per Infectious",
    ] : ["Vulnerable", "Seeding", "Bottleneck", "Sink", "Amplifier"]);
    assert.equal((markup.match(/<h3 class="hotspot-metric-role">/g) || []).length, 5);
    const bodyHeadings = [...markup.matchAll(/<h3>(.*?)<\/h3>/g)].map((match) => match[1]);
    assert.deepEqual(bodyHeadings, simulation ? [] : [
      "Weighted In Degree", "Weighted Out Degree", "Betweenness", "PageRank", "Eigenvector Centrality",
    ]);
    assert.equal((markup.match(/class="hotspot-metric-method"/g) || []).length, 5);
    if (simulation) {
      assert.match(markup, /up to three regions with positive scores/);
      assert.match(markup, /sender infectious share at step start × movement beta/);
      assert.match(markup, /max\(1, infectious population at step end\)/);
      assert.match(markup, /Outgoing movement pressure relative to the infectious population at the end of the step/);
    } else {
      assert.match(markup, /Weighted PageRank with damping 0\.85/);
    }
  }
  assert.equal(closeFocusCount, 3);
});

test("a hotspot regained during its exit transition becomes visible and keeps its ring", () => {
  const context = runtime();
  const node = { id: "CR35", r: 12 };
  const ring = { metric: "outDegree", attrs: {}, styles: { opacity: 1 }, removalPending: false };
  function selectRings(items) {
    return {
      interrupt() { items.forEach((item) => { item.removalPending = false; }); return this; },
      transition() { return this; }, duration() { return this; },
      attr(name, value) {
        items.forEach((item, index) => { item.attrs[name] = typeof value === "function" ? value(item.metric, index) : value; });
        return this;
      },
      style(name, value) { items.forEach((item) => { item.styles[name] = value; }); return this; },
      remove() { items.forEach((item) => { item.removalPending = true; }); return this; },
      append() { return this; },
    };
  }
  const ringGroup = {
    selectAll(selector) {
      assert.equal(selector, "circle.hotspotStroke");
      return { data(metrics, key) {
        const retained = metrics.some((metric) => key(metric) === ring.metric);
        return Object.assign(selectRings(retained ? [ring] : []), {
          exit: () => selectRings(retained ? [] : [ring]),
          enter: () => selectRings([]),
        });
      } };
    },
  };
  let labelOffset;
  const boundaryRefreshes = [];
  Object.assign(context, {
    hotspots: { CR35: scores() }, hotspotRingSpacing: 4,
    hotspotStyles: { outDegree: { color: "blue", dash: "10 5" } },
    nodeGroup: { selectAll(selector) {
      assert.equal(selector, ".nodeGroup");
      return { each(callback) { callback.call(node, node); } };
    } },
    labelSelection: { attr(name, value) { assert.equal(name, "dy"); labelOffset = value(node); } },
    updateNetworkLinkBoundaries: (includeTransition) => boundaryRefreshes.push(includeTransition),
    d3: { select(element) {
      assert.equal(element, node);
      return { select(selector) { assert.equal(selector, ".hotspot-rings"); return ringGroup; } };
    } },
  });

  context.updateHotspotMarks();
  assert.equal(ring.removalPending, true);
  assert.equal(ring.styles.opacity, 0);
  assert.equal(Math.abs(labelOffset), 0);

  context.hotspots.CR35.outDegree = 10;
  context.updateHotspotMarks();
  assert.equal(ring.removalPending, false);
  assert.equal(ring.styles.opacity, 1);
  assert.equal(ring.attrs.r, 16);
  assert.equal(labelOffset, -4);
  assert.deepEqual(boundaryRefreshes, [true, true]);
});
