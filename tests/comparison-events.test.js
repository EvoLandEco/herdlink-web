import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transform } from "esbuild";
import { buildComparisonChart, comparisonChartDomain, comparisonEventMarkerWidth, formatComparisonDelta, formatComparisonValue, getComparisonIntroduction, groupComparisonEvents, pairComparisonSeries, topComparisonRegions } from "../src/comparisonCharts.js";
import { comparisonConfigurations } from "../src/scenarioComparison.js";

const source = readFileSync(new URL("../src/components/ComparisonOverlay.jsx", import.meta.url), "utf8");
const component = source.match(/^const InterventionMarker = memo\(function InterventionMarker\([^]*?^\}\);/m)[0];
const hook = source.match(/^function useComparisonTipPosition\([^]*?^\}/m)[0];
const { code } = await transform(`${hook}\n${component}\nglobalThis.renderMarker = InterventionMarker;`, {
  loader: "jsx", jsxFactory: "createElement", jsxFragment: "Fragment",
});
const wrappers = ["InterventionTrack", "IntroductionMarker", "PairedChart", "ComparisonScope", "ComparisonContent", "ComparisonOverlay"]
  .map((name) => source.match(new RegExp(`^(?:export )?function ${name}\\([^]*?^\\}`, "m"))[0].replace(/^export /, "")).join("\n");
const { code: wrapperCode } = await transform(`${wrappers}\nglobalThis.components = { InterventionTrack, IntroductionMarker, PairedChart, ComparisonScope, ComparisonContent, ComparisonOverlay };`, {
  loader: "jsx", jsxFactory: "createElement", jsxFragment: "Fragment",
});
const axisFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumSignificantDigits: 3 });

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...tree.children.flatMap(elements)];
}

function marker(cluster, introduction = false) {
  const states = [], refs = [], inspected = [];
  let stateIndex = 0, refIndex = 0, tree;
  const document = { activeElement: null };
  const context = vm.createContext({
    document, dateLabel: (date) => date, faCalendarDays: "calendar", faLocationDot: "location", axisFormatter, FontAwesomeIcon: "svg", Fragment: "fragment",
    memo: (render) => render, useId: () => "event-tip",
    useState: (initial) => {
      const state = states[stateIndex++] ||= { value: initial };
      return [state.value, (value) => { state.value = value; }];
    },
    useRef: (current) => refs[refIndex++] ||= { current },
    useLayoutEffect() {},
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  });
  vm.runInContext(code, context);
  const render = () => {
    stateIndex = 0; refIndex = 0;
    tree = context.renderMarker({ cluster, introduction, onInspect: (date) => inspected.push(date) });
    for (const node of elements(tree)) if (node.props.ref) {
      node.props.ref.current = { focus() { document.activeElement = this; tree.props.onFocus(); } };
    }
    return tree;
  };
  render();
  return { render, inspected, document, get tree() { return tree; },
    find: (predicate) => elements(tree).find(predicate),
    all: (predicate) => elements(tree).filter(predicate) };
}

function renderWrapper(name, props, states = []) {
  let stateIndex = 0;
  const context = vm.createContext({
    Fragment: "fragment", InterventionMarker: "marker", ComparisonInfo: "info", ScenarioPresets: "presets", ScenarioPresetSettings: "preset-settings", ScenarioLibrary: "library", ScenarioComparison: "three-scenarios", RecommendedComparisons: "recommended-comparisons", ComparisonChartControls: "chart-controls", ComparisonScenarioDetails: "scenario-details", useScenarioComparison: () => ({ status: "loading", completed: 0 }),
    FontAwesomeIcon: "svg", faBook: "book", faFlask: "flask", faLayerGroup: "layers", faCodeCompare: "compare", faCalendarDays: "calendar", faNetworkWired: "network", faLocationDot: "region", faScaleBalanced: "balance", axisFormatter,
    dateLabel: (date) => date, useMemo: (calculate) => calculate(), useEffect() {}, useLayoutEffect() {},
    useRef: () => ({ current: null }), useId: () => "content-id",
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = name === "PairedChart" ? { width: 640, height: 198 } : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useAnimatedComparisonSeries: (points, domain) => ({ points, domain }),
    buildComparisonChart, comparisonChartDomain, comparisonEventMarkerWidth, formatComparisonDelta, formatComparisonValue, getComparisonIntroduction, groupComparisonEvents, pairComparisonSeries, topComparisonRegions,
    comparisonConfigurations,
    createElement: (type, attributes, ...children) => ({ type: typeof type === "function" ? type.name : type, props: attributes || {}, children }),
  });
  vm.runInContext(wrapperCode, context);
  return context.components[name](props);
}

function textContent(tree) {
  if (Array.isArray(tree)) return tree.map(textContent).join("");
  if (!tree || typeof tree === "boolean") return "";
  return typeof tree === "object" ? textContent(tree.children) : String(tree);
}

test("comparison tooltips stay within scrollports and preserve fixed sidebar placement", () => {
  let sidebar = false, cssOffset = -296, tipWidth = 320, resize, observedResize, cleanup;
  const bounds = { left: 330, top: 80 };
  const anchor = { left: 400, top: 100, bottom: 120 };
  const listeners = new Map();
  const body = {
    clientLeft: 2, clientTop: 0, clientWidth: 600, clientHeight: 500,
    classList: { contains: () => sidebar },
    getBoundingClientRect: () => bounds,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  const info = { clientLeft: 1, dataset: {}, closest: () => body, getBoundingClientRect: () => anchor };
  const tip = {
    style: {}, scrollHeight: 200,
    getBoundingClientRect() {
      const width = Math.min(tipWidth, parseFloat(this.style.maxWidth) || Infinity);
      const left = this.style.left
        ? anchor.left + info.clientLeft + parseFloat(this.style.left)
        : anchor.left + info.clientLeft + cssOffset;
      return { left, right: left + width, width };
    },
  };
  const refs = [{ current: info }, { current: tip }];
  const context = vm.createContext({
    useRef: () => refs.shift(), useState: () => [true, () => {}],
    useLayoutEffect: (effect) => { cleanup = effect(); },
    ResizeObserver: class {
      constructor(callback) { observedResize = callback; }
      observe() {}
      disconnect() { observedResize = null; }
    },
    window: {
      addEventListener: (name, callback) => { assert.equal(name, "resize"); resize = callback; },
      removeEventListener: (name) => { assert.equal(name, "resize"); resize = null; },
    },
  });
  vm.runInContext(`${hook}\nuseComparisonTipPosition("Overall");`, context);
  assert.equal(tip.getBoundingClientRect().left, 332);
  assert.equal(tip.style.right, "auto");
  assert.equal(info.dataset.placement, "below");

  anchor.left = 880; cssOffset = 0;
  observedResize();
  assert.equal(tip.getBoundingClientRect().right, 932);

  anchor.left = 570; cssOffset = -120;
  listeners.get("scroll")();
  assert.equal(tip.getBoundingClientRect().left, 451);

  anchor.left = 400; cssOffset = -296; body.clientWidth = 180;
  resize();
  assert.equal(tip.style.maxWidth, "180px");
  assert.deepEqual(tip.getBoundingClientRect(), { left: 332, right: 512, width: 180 });

  bounds.left = 40; body.clientWidth = 1000;
  resize();
  assert.equal(tip.getBoundingClientRect().left, 105);
  bounds.left = 130;
  listeners.get("scroll")();
  assert.equal(tip.getBoundingClientRect().left, 132);
  bounds.left = 40;
  observedResize();
  assert.equal(tip.getBoundingClientRect().left, 105);

  sidebar = true; tip.style = {}; tipWidth = 380; tip.scrollHeight = 500;
  bounds.left = 18; body.clientWidth = 294;
  anchor.left = 280; anchor.top = 490; anchor.bottom = 510;
  listeners.get("scroll")();
  assert.equal(tip.style.maxWidth, undefined);
  assert.equal(tip.style.left, "280px");
  assert.equal(tip.style.right, "auto");
  assert.equal(tip.style.top, "80px");
  assert.equal(tip.style.bottom, "auto");
  assert.equal(tip.style.maxHeight, "400px");
  assert.equal(info.dataset.placement, "above");
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(resize, null);
  assert.equal(observedResize, null);
});

test("comparison sidebar switches views and groups custom scenarios with presets", () => {
  const states = [], loaded = [], patches = [];
  const props = { open: true, data: { status: "ready", mode: "trade", scenarioContext: { controlsValid: true,
    presetSettings: { targetBudget: 3, responseDays: 7, standstillDays: 14 } },
    globalMetrics: [{ key: "totalTradeVolume" }, { key: "outDegree" }, { key: "inDegree" }, { key: "modularity" }, { key: "spectralRadius" }],
    nodeMetrics: [{ key: "totalTradeVolume" }, { key: "outDegree" }, { key: "inDegree" }, { key: "betweenness" }, { key: "pageRank" }, { key: "eigenvector" }] },
    onLoadPreset: (id) => loaded.push(id), onChangePresetSettings: (patch) => patches.push(patch) };
  const render = () => elements(renderWrapper("ComparisonOverlay", props, states));
  const sidebar = () => render().find((node) => node.props.className === "comparison-sidebar");
  const customButton = () => render().find((node) => node.props.className?.startsWith("comparison-scenarios-toggle"));
  const viewSwitch = () => sidebar().children[0];
  const resultChildren = render().find((node) => node.props.className === "comparison-results").children;
  assert.equal(resultChildren[0].props.className, "comparison-sidebar");
  assert.equal(resultChildren[1].props.className, "comparison-results__content");
  assert.equal(viewSwitch().props.className, "comparison-view-switch");
  const header = render().find((node) => node.props.className === "comparison-header");
  assert.equal(elements(header).some((node) => node.props.className === "comparison-view-switch" || node.props.className?.startsWith("comparison-scenarios-toggle")), false);
  const presets = () => sidebar().children[2];
  const details = () => sidebar().children[1];
  assert.equal(details().type, "scenario-details");
  assert.equal(details().props.threeScenarios, false);
  const presetSettings = () => elements(sidebar()).find((node) => node.type === "preset-settings");
  const chartControls = () => elements(sidebar()).find((node) => node.type === "chart-controls");
  const comparison = () => render().find((node) => node.type === "three-scenarios");
  assert.equal(presets().type, "presets");
  assert.equal(elements(presets()).find((node) => node.props.className === "comparison-scenarios-toggle").type, "button");
  assert.ok(presetSettings());
  assert.equal(chartControls(), undefined);
  presetSettings().props.onChangePresetSettings({ responseDays: 3 });
  assert.deepEqual(patches, [{ responseDays: 3 }]);
  assert.equal(elements(sidebar()).some((node) => node.type === "library"), false);
  assert.equal(render().find((node) => node.type === "library").props.open, false);
  assert.equal(render().some((node) => textContent(node) === "Largest changes"), false);
  const choices = () => elements(viewSwitch()).filter((node) => node.type === "button");
  assert.deepEqual(choices().map(textContent), ["Baseline", "Compare 3"]);
  assert.deepEqual(choices().map((node) => node.props["aria-pressed"]), [true, false]);
  assert.equal(render().some((node) => node.props.className?.startsWith("comparison-recomputing")), false);
  choices()[1].props.onClick();
  assert.ok(render().some((node) => node.type === "three-scenarios"));
  assert.equal(render().find((node) => node.props.className === "comparison-results").props["aria-busy"], true);
  const overlay = render().find((node) => node.props.className?.startsWith("comparison-recomputing"));
  assert.ok(overlay.props.className.includes("comparison-recomputing--editable"));
  assert.ok(textContent(overlay).includes("Recomputing scenarios"));
  assert.equal(render().find((node) => node.props.className === "comparison-results__content").props.inert, undefined);
  assert.equal(presets().type, "recommended-comparisons");
  assert.equal(elements(sidebar()).some((node) => node.type === "preset-settings"), false);
  assert.equal(render().some((node) => node.type === "presets"), false);
  assert.deepEqual(sidebar().children.filter((node) => node && typeof node === "object").map((node) => node.type), ["div", "scenario-details", "recommended-comparisons", "chart-controls"]);
  assert.equal(details().props.threeScenarios, true);
  assert.equal(customButton(), undefined);
  assert.deepEqual(Array.from(chartControls().props.metrics, (metric) => metric.key), ["totalTradeVolume", "outDegree", "inDegree"]);
  assert.deepEqual(Array.from(chartControls().props.nodeMetrics, (metric) => metric.key), ["totalTradeVolume", "outDegree", "inDegree"]);
  assert.equal(chartControls().props.metric.key, "outDegree");
  assert.equal(chartControls().props.nodeMetric.key, "outDegree");
  assert.equal(chartControls().props.regionView, "top-3");
  assert.equal(chartControls().props.metricsLocked, true);
  chartControls().props.onMetricsLockedChange(false);
  chartControls().props.onMetricChange("totalTradeVolume");
  assert.equal(comparison().props.metric.key, "totalTradeVolume");
  assert.equal(comparison().props.nodeMetric.key, "outDegree");
  chartControls().props.onNodeMetricChange("inDegree");
  chartControls().props.onRegionChange("CR01");
  assert.equal(comparison().props.metric.key, "totalTradeVolume");
  assert.equal(comparison().props.nodeMetric.key, "inDegree");
  assert.equal(comparison().props.regionView, "CR01");
  props.recomputing = true;
  assert.equal(chartControls().props.disabled, true);
  props.recomputing = false;
  assert.equal(presets().props.selectedSet, "strategies");
  presets().props.onChooseSet("targets");
  assert.equal(presets().props.selectedSet, "targets");
  assert.deepEqual(Array.from(render().find((node) => node.type === "three-scenarios").props.configurations,
    (column) => column.targetBudget), [1, 3, 5]);
  const columns = render().find((node) => node.type === "three-scenarios").props.configurations;
  render().find((node) => node.type === "three-scenarios").props.onChangeConfigurations(columns.map((column, index) =>
    index === 1 ? { ...column, targetBudget: 8 } : column));
  assert.equal(presets().props.selectedSet, null);
  assert.deepEqual(Array.from(render().find((node) => node.type === "three-scenarios").props.configurations,
    (column) => column.targetBudget), [1, 8, 5]);
  assert.deepEqual(choices().map((node) => node.props["aria-pressed"]), [false, true]);
  choices()[0].props.onClick();
  customButton().props.onClick();
  assert.equal(customButton().props["aria-expanded"], true);
  assert.equal(render().find((node) => node.type === "library").props.open, true);
  assert.equal(sidebar().props.inert, undefined);
  assert.equal(viewSwitch().props.inert, "");
  assert.equal(presets().props.inert, true);
  assert.equal(presetSettings().props.inert, true);
  assert.equal(details().props.inert, true);
  assert.equal(customButton().props.inert, undefined);
  customButton().props.onClick();
  assert.equal(viewSwitch().props.inert, undefined);
  choices()[0].props.onClick();
  assert.equal(presets().type, "presets");
  assert.equal(elements(presets()).find((node) => node.props.className === "comparison-scenarios-toggle").type, "button");
  assert.equal(chartControls(), undefined);
  assert.equal(elements(sidebar()).some((node) => node.type === "preset-settings"), true);
  presets().props.onLoadPreset("seed-containment");
  assert.deepEqual(loaded, ["seed-containment"]);
  assert.ok(render().some((node) => node.type === "ComparisonContent"));
  props.recomputing = true;
  assert.ok(choices().every((node) => node.props.disabled));
  assert.equal(presets().props.context.disabled, true);
  assert.equal(elements(sidebar()).find((node) => node.type === "preset-settings").props.context.disabled, true);
});

test("Compare 3 filters metrics by mode and preserves locked and independent selections", () => {
  const states = [];
  const definitions = {
    trade: {
      globalMetrics: ["outDegree", "inDegree", "totalTradeVolume", "modularity"].map((key) => ({ key })),
      nodeMetrics: ["outDegree", "inDegree", "totalTradeVolume", "pageRank"].map((key) => ({ key })),
    },
    simulation: {
      globalMetrics: ["prevalence", "I", "R", "totalTradeVolume"].map((key) => ({ key })),
      nodeMetrics: ["prevalence", "I", "R", "totalTradeVolume", "incomingExposure"].map((key) => ({ key })),
    },
  };
  const props = { open: true, data: { status: "ready", mode: "trade", ...definitions.trade,
    scenarioContext: { controlsValid: true, presetSettings: { targetBudget: 3, responseDays: 7, standstillDays: 14 } } } };
  const render = () => elements(renderWrapper("ComparisonOverlay", props, states));
  const controls = () => render().find((node) => node.type === "chart-controls").props;
  const view = (index) => elements(render().find((node) => node.props.className === "comparison-view-switch"))
    .filter((node) => node.type === "button")[index].props.onClick();
  const mode = (value) => { props.data = { ...props.data, mode: value, ...definitions[value] }; };
  const assertSelection = (locked, overall, regional) => {
    const current = controls();
    assert.equal(current.metricsLocked, locked);
    assert.equal(current.metric.key, overall);
    assert.equal(current.nodeMetric.key, regional);
  };

  view(1);
  assert.deepEqual(Array.from(controls().metrics, ({ key }) => key), ["outDegree", "inDegree", "totalTradeVolume"]);
  assert.deepEqual(Array.from(controls().nodeMetrics, ({ key }) => key), ["outDegree", "inDegree", "totalTradeVolume"]);
  assertSelection(true, "outDegree", "outDegree");
  controls().onMetricChange("inDegree");
  assertSelection(true, "inDegree", "inDegree");
  controls().onNodeMetricChange("outDegree");
  assertSelection(true, "outDegree", "outDegree");
  controls().onMetricsLockedChange(false);
  controls().onMetricChange("totalTradeVolume");
  assertSelection(false, "totalTradeVolume", "outDegree");
  controls().onNodeMetricChange("inDegree");
  assertSelection(false, "totalTradeVolume", "inDegree");

  mode("simulation");
  assert.deepEqual(Array.from(controls().metrics, ({ key }) => key), ["prevalence", "I", "R"]);
  assert.deepEqual(Array.from(controls().nodeMetrics, ({ key }) => key), ["prevalence", "I", "R", "incomingExposure"]);
  assertSelection(true, "prevalence", "prevalence");
  controls().onMetricChange("I");
  assertSelection(true, "I", "I");
  controls().onNodeMetricChange("R");
  assertSelection(true, "R", "R");
  controls().onMetricsLockedChange(false);
  controls().onMetricChange("I");
  controls().onNodeMetricChange("incomingExposure");
  assertSelection(false, "I", "incomingExposure");

  mode("trade");
  assertSelection(false, "totalTradeVolume", "inDegree");
  controls().onMetricChange("inDegree");
  controls().onMetricsLockedChange(true);
  assertSelection(true, "inDegree", "inDegree");
  mode("simulation");
  assertSelection(false, "I", "incomingExposure");
  controls().onMetricsLockedChange(true);
  assertSelection(true, "I", "I");
  mode("trade");
  assertSelection(true, "inDegree", "inDegree");

  controls().onMetricsLockedChange(false);
  mode("simulation");
  controls().onMetricsLockedChange(false);
  view(0);
  view(1);
  assertSelection(true, "prevalence", "prevalence");
  mode("trade");
  assertSelection(true, "outDegree", "outDegree");
  view(0);
  assert.strictEqual(render().find((node) => node.type === "ComparisonContent").props.data, props.data);
  assert.ok(props.data.globalMetrics.some(({ key }) => key === "modularity"));
  mode("simulation");
  assert.strictEqual(render().find((node) => node.type === "ComparisonContent").props.data, props.data);
  assert.ok(props.data.globalMetrics.some(({ key }) => key === "totalTradeVolume"));
});

test("dense event clusters mount one selected date's details during interaction", () => {
  let descriptionsRead = 0;
  const steps = Array.from({ length: 171 }, (_, day) => ({
    date: new Date(Date.UTC(2020, 0, day + 1)).toISOString(),
    events: Array.from({ length: 200 }, (_, route) => ({
      date: new Date(Date.UTC(2020, 0, day + 1)).toISOString(),
      get description() { descriptionsRead++; return `Day ${day}, route ${route}`; },
    })),
  }));
  const app = marker({ position: 0.5, steps });
  assert.equal(descriptionsRead, 0);
  assert.equal(app.all((node) => node.type === "li").length, 0);
  assert.equal(app.all((node) => node.type === "button").length, 1);
  assert.equal(textContent(app.find((node) => node.type === "button")), "171 steps");
  assert.match(app.find((node) => node.type === "button").props["aria-label"], /171 intervention steps/);
  app.tree.props.onPointerEnter(); app.render();
  assert.equal(descriptionsRead, 200);
  assert.equal(app.all((node) => node.type === "li").length, 200);
  const choices = app.all((node) => node.type === "button" && "aria-expanded" in node.props);
  assert.equal(choices.length, steps.length);
  assert.equal(choices[0].props["aria-expanded"], true);
  choices.at(-1).props.onClick(); app.render();
  assert.deepEqual(app.inspected, [steps.at(-1).date]);
  const details = app.all((node) => node.type === "li");
  assert.equal(details.length, 200);
  assert.equal(details[0].children.at(-1), "Day 170, route 0");
  assert.equal(details.at(-1).children.at(-1), "Day 170, route 199");
  const selected = app.find((node) => node.type === "button" && node.props["aria-expanded"] === true);
  assert.equal(selected.props["aria-controls"], app.find((node) => node.type === "ul").props.id);
  app.tree.props.onPointerLeave({ currentTarget: { contains: () => false } }); app.render();
  assert.equal(app.all((node) => node.type === "li").length, 0);
});

test("marker details support keyboard focus and persist while focus stays inside", () => {
  const steps = ["2020-01-01", "2020-01-02"].map((date) => ({ date, events: [{ date, description: date }] }));
  const app = marker({ position: 0, steps });
  const button = () => app.find((node) => node.props.className?.startsWith("comparison-event__marker"));
  assert.equal(button().props["aria-describedby"], undefined);
  button().props.onClick(); app.render();
  assert.equal(button().props["aria-describedby"], "event-tip");
  assert.equal(app.all((node) => node.type === "li").length, 1);
  app.tree.props.onPointerLeave({ currentTarget: { contains: () => true } }); app.render();
  assert.equal(app.all((node) => node.type === "li").length, 1);
  app.tree.props.onBlur({ relatedTarget: null, currentTarget: { contains: () => false, matches: () => false } }); app.render();
  assert.equal(button().props["aria-describedby"], undefined);
  assert.equal(app.all((node) => node.type === "li").length, 0);
});

test("a single-date marker exposes every event and inspects its date directly", () => {
  const date = "2020-01-02";
  const app = marker({ position: 0, steps: [{ date, events: [
    { date: "2020-01-01", description: "Earlier event" }, { date, description: "Recorded event" },
  ] }] });
  assert.equal(textContent(app.find((node) => node.type === "button")), "2 events");
  assert.match(app.find((node) => node.type === "button").props["aria-label"], /2 intervention events/);
  app.tree.props.onFocus(); app.render();
  assert.equal(app.all((node) => node.type === "li").length, 2);
  assert.equal(app.find((node) => node.props.role === "tooltip").props.id, "event-tip");
  assert.equal(app.find((node) => node.type === "time").props.dateTime, "2020-01-01");
  app.find((node) => node.type === "button").props.onClick();
  assert.deepEqual(app.inspected, [date]);
});

test("introduction labels retain the actual date while clicks inspect its containing display period", () => {
  const introduction = { date: "2020-01-02", displayDate: "2020-01-01", seedLabel: "Seed region (CR35)" };
  const wrapped = renderWrapper("IntroductionMarker", { introduction, position: 0.25, onInspect() {} });
  assert.equal(wrapped.type, "marker");
  assert.equal(wrapped.props.introduction, true);
  assert.equal(wrapped.props.cluster.position, 0.25);
  const app = marker(wrapped.props.cluster, wrapped.props.introduction);
  assert.match(app.tree.props.className, /is-introduction/);
  const button = app.find((node) => node.type === "button");
  assert.equal(textContent(button), "Intro");
  assert.equal(button.props["aria-label"], "Inspect seed introduction on 2020-01-02");
  button.props.onClick();
  assert.deepEqual(app.inspected, ["2020-01-01"]);
  app.tree.props.onFocus(); app.render();
  assert.match(textContent(app.tree), /Display period: 2020-01-01/);
  assert.match(textContent(app.tree), /Seed introduction in Seed region \(CR35\). Both scenarios share this introduction./);
  assert.equal(app.find((node) => node.type === "time").props.dateTime, "2020-01-02");
  assert.equal(app.all((node) => node.props["aria-expanded"] !== undefined).length, 0);
});

test("dense ranges use one track span and leave introduction separate from intervention groups", () => {
  const dates = Array.from({ length: 101 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString());
  const events = [...dates.slice(0, 35), dates.at(-1)].map((date) => ({ date, events: [{ date, description: "Exports blocked" }] }));
  const introduction = { date: dates[17], displayDate: dates[17], seedLabel: "CR35" };
  const tree = renderWrapper("PairedChart", {
    points: dates.map((date) => ({ date, original: 1, intervention: 0.5 })),
    metric: { label: "Prevalence", format: "percent" }, date: dates[0], currentDate: dates[0],
    interventionEvents: events, introduction, scope: "Network", identity: "network:prevalence", animate: false, onInspect() {},
  });
  const all = elements(tree);
  const track = all.find((node) => node.type === "InterventionTrack");
  assert.deepEqual(track.props.clusters.map((cluster) => cluster.steps.length), [35, 1]);
  const ranges = elements(renderWrapper("InterventionTrack", track.props));
  const range = ranges.filter((node) => node.props.className === "comparison-event-range");
  assert.equal(range.length, 1);
  assert.equal(range[0].props["aria-hidden"], "true");
  assert.ok(parseFloat(range[0].props.style.width) > 0);
  assert.equal(ranges.filter((node) => node.type === "marker").length, 2);
  const svgGroup = all.find((node) => node.props.className === "comparison-chart-interventions");
  assert.equal(elements(svgGroup).filter((node) => node.type === "line").length, 1);
  assert.equal(all.filter((node) => node.props.className === "comparison-introduction-line").length, 1);
  assert.equal(all.filter((node) => node.type === "IntroductionMarker").length, 1);
  assert.equal(track.props.clusters.flatMap((cluster) => cluster.steps).length, events.length);
  assert.ok(track.props.clusters.flatMap((cluster) => cluster.steps).every((step) => step.events[0].description === "Exports blocked"));
});


test("comparison content passes source coverage to chart introductions in the final display bin", () => {
  const dates = ["2020-01-01T00:00:00.000Z", "2020-02-01T00:00:00.000Z"];
  const data = { status: "ready", mode: "simulation", dates, date: dates[0],
    settings: { introductionDate: "2020-02-10" }, regions: [], nodeMetrics: [], globalMetrics: [],
    original: { global: [] }, intervention: { global: [] },
    scenarioContext: { seedLabel: "CR35", provenance: { movementData: { start: dates[0], end: "2020-02-12T00:00:00.000Z" } } },
  };
  const tree = renderWrapper("ComparisonContent", { data, animate: false });
  const introduction = elements(tree).find((node) => node.type === "ComparisonScope").props.introduction;
  assert.equal(introduction.displayDate, dates[1]);
  assert.equal(introduction.date, "2020-02-10T00:00:00.000Z");
  assert.equal(introduction.index, 1);
  assert.equal(elements(tree).some((node) => node.type === "footer" || node.props.type === "range"), false);
  data.settings.introductionDate = "2020-02-12";
  assert.equal(elements(renderWrapper("ComparisonContent", { data, animate: false })).find((node) => node.type === "ComparisonScope").props.introduction, null);
});

test("charts inspect dates with keyboard controls and follow the replay on Enter", () => {
  const dates = ["2020-01-01", "2020-01-02", "2020-01-03"];
  const inspected = [];
  const props = { points: dates.map((date) => ({ date, original: 0.1, intervention: 0.2 })),
    metric: { key: "prevalence", label: "Prevalence", format: "percent" }, date: dates[1], currentDate: dates[1],
    interventionEvents: [], scope: "Overall", onInspect: (date) => inspected.push(date) };
  let prevented = 0;
  for (const key of ["ArrowLeft", "ArrowLeft", "ArrowRight", "End", "ArrowRight", "Home", "Enter", "Tab"]) {
    const svg = elements(renderWrapper("PairedChart", props)).find((node) => node.type === "svg");
    assert.equal(svg.props.tabIndex, 0);
    svg.props.onKeyDown({ key, preventDefault() { prevented++; } });
    props.date = inspected.at(-1) ?? props.currentDate;
  }
  assert.deepEqual(inspected, [dates[0], dates[0], dates[1], dates[2], dates[2], dates[0], null]);
  assert.equal(prevented, 7);
});

test("both modes offer only three top region charts and allow individual selection", () => {
  for (const mode of ["trade", "simulation"]) {
    const dates = ["2020-01-01", "2020-01-02", "2020-01-03"];
    const regions = Array.from({ length: 7 }, (_, i) => ({ id: `CR0${i + 1}`, name: `Region ${i + 1}` }));
    const key = mode === "simulation" ? "prevalence" : "eigenvector";
    const original = Object.fromEntries(regions.map((region, i) => [region.id,
      dates.map((date, j) => ({ date, [key]: j === 1 ? (i + 1) / 10 : 0 })),
    ]));
    const intervention = Object.fromEntries(regions.map((region) => [region.id,
      dates.map((date) => ({ date, [key]: region.id === "CR01" ? 10 : 0 })),
    ]));
    const data = { status: "ready", mode, dates, date: dates[0], regions, selectedRegionId: "CR01",
      settings: {}, scenarioContext: {}, globalMetrics: [], nodeMetrics: [{ key, label: key, format: "percent" }],
      original: { nodes: original, global: [] }, intervention: { nodes: intervention, global: [] },
    };
    const states = [];
    const render = () => elements(renderWrapper("ComparisonContent", { data, animate: false }, states));
    const regionScope = () => render().find((node) => node.type === "ComparisonScope" && node.props.title === "Region");
    const select = () => render().find((node) => node.type === "select");
    assert.equal(select().props.value, "top-3");
    const topOptions = elements(select()).filter((node) => node.type === "option" && node.props.value.startsWith("top-"));
    assert.deepEqual(topOptions.map((node) => node.props.value), ["top-3"]);
    assert.equal(textContent(topOptions[0]), "Top 3 regions");
    assert.deepEqual(Array.from(regionScope().props.regions, (region) => region.id), ["CR07", "CR06", "CR05"]);
    const scope = regionScope();
    const details = elements(renderWrapper("ComparisonScope", { ...scope.props, children: scope.children }));
    assert.equal(details.filter((node) => node.props["aria-label"]?.startsWith("Inspect Region ")).length, 3);
    assert.equal(details.filter((node) => node.type === "table" || node.type === "details").length, 0);
    const charts = details.filter((node) => node.type === "PairedChart");
    assert.equal(charts.length, 3);
    charts.forEach((chart, index) => {
      assert.equal(chart.props.compact, true);
      assert.equal(chart.props.points, scope.props.regions[index].points);
      const plot = elements(renderWrapper("PairedChart", chart.props));
      assert.equal(plot.filter((node) => node.type === "path").length, 2);
      assert.match(plot.find((node) => node.type === "svg").props["aria-label"], new RegExp(`Region ${7 - index}:`));
    });
    const values = details.filter((node) => node.props.className === "comparison-region-row__values");
    assert.equal(values.length, 3);
    assert.equal(textContent(values[0]), "Original 0%Intervention 0%Δ 0 pp");
    details.find((node) => node.props["aria-label"] === "Inspect Region 7 (CR07)").props.onClick();
    assert.equal(select().props.value, "CR07");
    assert.equal(regionScope().props.regions, undefined);
    assert.equal(regionScope().props.original, original.CR07);
    select().props.onChange({ target: { value: "CR01" } });
    assert.equal(regionScope().props.original, original.CR01);
    select().props.onChange({ target: { value: "top-3" } });
    assert.equal(regionScope().props.regions.length, 3);
    data.date = dates[1];
    const inspected = regionScope();
    const inspectedValues = elements(renderWrapper("ComparisonScope", inspected.props))
      .find((node) => node.props.className === "comparison-region-row__values");
    assert.equal(textContent(inspectedValues), "Original 70%Intervention 0%Δ −70 pp");
    data.date = dates[2];
    assert.deepEqual(Array.from(regionScope().props.regions, (region) => region.id), ["CR07", "CR06", "CR05"]);
  }
});
