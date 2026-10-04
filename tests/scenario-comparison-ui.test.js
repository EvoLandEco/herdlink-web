import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transform } from "esbuild";
import { comparisonConfigurations, comparisonSets } from "../src/scenarioComparison.js";
import { formatComparisonValue, getComparisonIntroduction, pairComparisonSeries, topComparisonRegions } from "../src/comparisonCharts.js";

const source = readFileSync(new URL("../src/components/ScenarioComparison.jsx", import.meta.url), "utf8");
const icons = source.match(/import \{ ([^}]+) \} from "@fortawesome\/free-solid-svg-icons"/)[1].split(", ");
const { code } = await transform(source.replace(/^import .*;\n/gm, "").replace(/^export /gm, ""), {
  loader: "jsx", jsxFactory: "createElement", jsxFragment: "Fragment",
});
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree && typeof tree === "object" ? [tree, ...tree.children.flatMap(elements)] : [];
}

test("sidebar details show shared settings, actual target counts and each saved scenario's model", async () => {
  const details = readFileSync(new URL("../src/components/ComparisonScenarioDetails.jsx", import.meta.url), "utf8");
  const detailIcons = details.match(/import \{ ([^}]+) \} from "@fortawesome\/free-solid-svg-icons"/)[1].split(", ");
  const { code: detailCode } = await transform(details.replace(/^import .*;\n/gm, "").replace(/^export /gm, ""), { loader: "jsx", jsxFactory: "createElement", jsxFragment: "Fragment" });
  const context = vm.createContext({
    ...Object.fromEntries(detailIcons.map((icon) => [icon, icon])), FontAwesomeIcon: "icon", Fragment: "fragment",
    comparisonColors: ["teal", "violet", "salmon"], presetIcons: { "open-trade": "open", "seed-containment": "seed" }, presetLabels: { "open-trade": "Open", "seed-containment": "Seed" },
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  });
  vm.runInContext(detailCode, context);
  const settings = { model: "SEIR", seedRegion: "CR01", introductionDate: "2020-01-01", initializationConvention: "prevalence-shares", initialPct: 5,
    beta: 0.1, movementBeta: 0.04, gamma: 0.15, sigma: 0.2, omega: 0.01,
    population: { kind: "synthetic", values: { CR01: 1000, CR02: 2000 }, reference: { id: "demo", countUnit: "model-unit" } },
  };
  const data = { mode: "simulation", settings, dates: ["2020-01-01", "2020-02-01"], regions: [{ id: "CR01", name: "First" }, { id: "CR02", name: "Second" }],
    scenarioContext: { settings, datasetLabel: "Weekly trade", presets: [{ id: "seed-containment", label: "Seed containment", description: "Seed exports close." }],
      nodeInterventions: [[1, [["CR01", { exports: false }]]], [2, [["CR01", { exports: true }]]]],
      linkInterventions: [[1, [["CR01-CR02", false]]], [2, [["CR01-CR02", true]]]],
    },
  };
  const props = { data, threeScenarios: false, activePresetId: "seed-containment", Info: "info", evaluation: { status: "idle" } };
  const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree && typeof tree === "object" ? text(tree.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
  const render = () => elements(context.ComparisonScenarioDetails(props));
  let nodes = render();
  assert.ok(text(nodes[0]).includes("Scenario details"));
  assert.equal(text(nodes[0]).includes("Original & Scenario"), false);
  assert.ok(text(nodes[0]).includes("SEIR"));
  assert.ok(text(nodes[0]).includes("3,000 units"));
  assert.ok(text(nodes[0]).includes("1 region · 1 route with controls"));
  assert.equal(nodes.find((node) => node.type === "info" && node.props.label === "Scenario details").props.rows.find(([label]) => label === "Seed region")[1], "CR01 · First");

  props.threeScenarios = true;
  props.configurations = [{ presetId: "open-trade" }, { presetId: "seed-containment" }, { presetId: "saved-0" }];
  props.slots = [{ name: "Saved model" }, null, null];
  props.evaluation = { status: "ready", results: [
    { settings, label: "Open", targets: [], detail: "All movements open." },
    { settings, label: "Seed", targets: ["CR01"], detail: "Seed exports close." },
    { settings, label: "Saved model", detail: "Saved schedule." },
  ] };
  nodes = render();
  assert.equal(text(nodes[0]).includes("Three independent scenarios"), false);
  assert.equal(nodes.filter((node) => node.props.className === "comparison-details__scenario").length, 3);
  assert.ok(text(nodes[0]).includes("0 regions targeted"));
  assert.ok(text(nodes[0]).includes("1 region targeted"));
  assert.ok(text(nodes[0]).includes("Saved schedule"));
  props.evaluation.results[2].settings = { ...settings, model: "SIR", seedRegion: "CR02", introductionDate: "2020-01-07",
    initializationConvention: "absolute-counts", initialStates: { CR01: { I: 10 }, CR02: { I: 20 } } };
  nodes = render();
  assert.ok(text(nodes[0]).includes("Varies by column"));
  const savedRows = nodes.find((node) => node.type === "info" && node.props.label === "Scenario 3 settings").props.rows;
  assert.equal(savedRows.find(([label]) => label === "Model")[1], "SIR");
  assert.equal(savedRows.find(([label]) => label === "Seed region")[1], "CR02 · Second");
  assert.equal(savedRows.find(([label]) => label === "Introduction")[1], "7 Jan 2020");
  assert.equal(savedRows.find(([label]) => label === "Initial infectious")[1], "30 units");
  assert.equal(savedRows.some(([label]) => label === "Progression" || label === "Waning"), false);
  props.evaluation = { status: "loading", completed: 1 };
  nodes = render();
  assert.equal(nodes.filter((node) => node.props.className === "comparison-details__scenario-name").filter((node) => text(node).includes("Calculating…")).length, 3);
  assert.equal(nodes.some((node) => node.type === "info" && node.props.label === "Scenario 3 settings"), false);
  data.mode = "trade";
  props.threeScenarios = false;
  nodes = render();
  assert.ok(text(nodes[0]).includes("Trade ledger"));
  assert.equal(nodes.find((node) => node.type === "info" && node.props.label === "Scenario details").props.rows.some(([label]) => label === "Model" || label === "Recovery"), false);
});

test("comparison preset cards show configured columns, shared timing and matching scenario icons", () => {
  const library = readFileSync(new URL("../src/components/ScenarioLibrary.jsx", import.meta.url), "utf8");
  const libraryIcons = library.match(/import \{ ([^}]+) \} from "@fortawesome\/free-solid-svg-icons"/)[1].split(", ");
  const shared = ["presetIcons", "presetLabels"].map((name) => library.match(new RegExp(`^export const ${name} = \\{[^]*?^\\};`, "m"))[0].replace(/^export /, "")).join("\n");
  const context = vm.createContext({
    ...Object.fromEntries([...icons, ...libraryIcons].map((icon) => [icon, icon])), FontAwesomeIcon: "icon", Fragment: "fragment", comparisonSets,
    createElement: (type, props, ...children) => typeof type === "function" ? type({ ...props, children }) : { type, props: props || {}, children },
  });
  vm.runInContext(`${shared}\n${code}`, context);
  const presetIcons = vm.runInContext("presetIcons", context);
  const settings = { targetBudget: 8, responseDays: 11, standstillDays: 20 };
  const data = { controlsValid: true, presetSettings: settings,
    presets: [...new Set(comparisonSets.flatMap((set) => set.presets))].map((id) => ({ id })),
  };
  const Info = ({ children, ...props }) => ({ type: "info", props, children });
  const text = (tree) => Array.isArray(tree) ? tree.map(text).join("") : tree && typeof tree === "object" ? text(tree.children) : typeof tree === "string" || typeof tree === "number" ? String(tree) : "";
  const render = () => elements(context.RecommendedComparisons({ context: data, selectedSet: null, Info }));
  const tiles = render().filter((node) => node.props.className === "scenario-preset");
  tiles.forEach((tile, index) => {
    const set = comparisonSets[index];
    const button = elements(tile).find((node) => node.type === "button");
    assert.deepEqual(elements(button).filter((node) => node.type === "icon").map((node) => node.props.icon), [...new Set(set.presets)].map((id) => presetIcons[id]));
    const info = elements(tile).find((node) => node.type === "info");
    assert.equal(info.props.rich, true);
    const rows = elements(info).filter((node) => node.props.className === "comparison-preset-help__column");
    assert.equal(rows.length, 3);
    rows.forEach((row, column) => {
      assert.equal(elements(row).find((node) => node.type === "icon").props.icon, presetIcons[set.presets[column]]);
      if (set.field) assert.ok(text(row).includes(String(comparisonConfigurations(set.id, settings)[column][set.field])));
    });
    assert.equal(text(info).includes("Response: 11 days."), set.field !== "responseDays");
    assert.ok(text(info).includes("Shared model, population, seed and introduction"));
  });
  data.presets.find((preset) => preset.id === "seed-containment").disabledReason = "Daily history unavailable.";
  const unavailable = render().filter((node) => node.type === "info" && text(node).includes("Daily history unavailable."));
  assert.deepEqual(unavailable.map((node) => node.props.label), ["Strategies", "Response delays"]);
});

test("column edits cancel pending batches and date inspection uses the completed shared results", () => {
  const states = [], refs = [], effects = [], timers = new Map(), frames = new Map(), calls = [];
  let stateIndex, refIndex, effectIndex, jobs, nextId = 0, tree;
  const dates = ["2020-01-01", "2020-01-02"];
  const settings = { model: "SEIR", seedRegion: "CR01", introductionDate: dates[0], population: { reference: { id: "test" } } };
  const metric = { key: "prevalence", label: "Prevalence", format: "percent" };
  const infectious = { key: "I", label: "Infectious", format: "decimal" };
  const data = { status: "ready", mode: "simulation", dates, date: dates[0], globalMetrics: [metric, infectious], nodeMetrics: [metric, infectious],
    regions: [{ id: "CR01", name: "Region 1" }], original: { nodes: { CR01: dates.map((date) => ({ date, prevalence: 1, I: 100 })) } },
    scenarioContext: { settings, communityScale: "finer", controlsValid: true, disabled: false,
      presetSettings: { targetBudget: 3, responseDays: 7, standstillDays: 14 },
      presets: ["open-trade", "seed-containment", "partner-ring", "hub-controls"].map((id) => ({ id, label: id })),
      provenance: { movementData: { start: dates[0], end: "2020-02-01" } },
    },
  };
  const props = { data, enabled: true, slots: [null, null, null], metric, regionView: "top-3", Chart: "chart", Info: "info",
    configurations: comparisonConfigurations("strategies", data.scenarioContext.presetSettings),
    onChangeConfigurations: (columns) => { props.configurations = columns; },
  };
  const context = vm.createContext({
    ...Object.fromEntries(icons.map((icon) => [icon, icon])), FontAwesomeIcon: "svg",
    Fragment: "fragment", Intl, Date, comparisonConfigurations, comparisonSets,
    formatComparisonValue, getComparisonIntroduction, pairComparisonSeries, topComparisonRegions,
    useId: () => "test-id", useMemo: (calculate) => calculate(),
    useRef: (current) => refs[refIndex++] ||= { current },
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useEffect: (effect, dependencies) => {
      const index = effectIndex++;
      if (!effects[index] || dependencies.some((value, i) => value !== effects[index].dependencies[i])) jobs.push({ index, effect, dependencies });
    },
    setTimeout: (callback, delay) => { assert.equal(delay, 600); timers.set(++nextId, callback); return nextId; },
    clearTimeout: (id) => timers.delete(id),
    requestAnimationFrame: (callback) => { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    window: { herdlinkComparison: { evaluateComparisonScenario: (config) => {
      calls.push({ ...config });
      const series = dates.map((date, index) => ({ date, prevalence: index * (config.responseDays || 0) / 100, I: 100 + index * (config.responseDays || 0) }));
      return { label: config.presetId, settings, series: { global: series, nodes: { CR01: series } }, targets: [], interventionEvents: [] };
    } } },
    createElement: (type, attributes, ...children) => ({ type, props: attributes || {}, children }),
  });
  vm.runInContext(code, context);
  const render = () => {
    stateIndex = refIndex = effectIndex = 0; jobs = [];
    props.evaluation = context.useScenarioComparison(props);
    tree = context.ScenarioComparison(props);
    jobs.forEach(({ index, effect, dependencies }) => {
      effects[index]?.cleanup?.();
      effects[index] = { dependencies, cleanup: effect() };
    });
  };
  const flush = (queue) => {
    const callbacks = [...queue.values()]; queue.clear(); callbacks.forEach((callback) => callback()); render();
  };
  render();
  assert.equal(calls.length, 0);
  flush(timers); flush(frames);
  assert.equal(calls.length, 1);
  elements(tree).find((node) => node.props["aria-label"] === "Scenario 2 delay (days)").props.onChange({ target: { value: "21" } });
  render();
  assert.equal(frames.size, 0);
  flush(timers); flush(frames); flush(frames); flush(frames);
  assert.equal(calls.length, 4);
  assert.deepEqual(calls.map((config) => config.responseDays), [undefined, undefined, 21, 7]);
  assert.equal(elements(tree).filter((node) => node.props.className === "scenario-comparison-pending").length, 0);
  assert.equal(props.evaluation.results.length, 3);
  assert.equal(elements(tree).some((node) => node.props.className === "scenario-comparison-context"), false);
  const charts = elements(tree).filter((node) => node.type === "chart");
  assert.equal(charts.length, 6);
  assert.ok(charts.every((chart) => chart.props.metric === metric));
  assert.ok(charts.every((chart) => chart.props.animate));
  assert.equal(elements(tree).some((node) => node.props.className === "scenario-comparison-controls"), false);
  assert.equal(charts[0].props.scalePoints, charts[2].props.scalePoints);
  const controls = context.ComparisonChartControls({ data, metrics: data.globalMetrics, metric, regionView: props.regionView,
    onMetricChange: (key) => { props.metric = data.globalMetrics.find((entry) => entry.key === key); },
    onRegionChange: (value) => { props.regionView = value; } });
  assert.equal(elements(controls).some((node) => node.type === "info" || node.children.includes("Shared chart scales")), false);
  const selectors = elements(controls).filter((node) => node.type === "select");
  assert.deepEqual(selectors.map((node) => node.props["aria-label"]), ["Shared comparison metric", "Shared regions"]);
  assert.deepEqual(elements(selectors[1]).filter((node) => node.type === "option" && node.props.value.startsWith("top-")).map((node) => node.props.value), ["top-3"]);
  selectors[0].props.onChange({ target: { value: "I" } });
  selectors[1].props.onChange({ target: { value: "CR01" } });
  render();
  const changedCharts = elements(tree).filter((node) => node.type === "chart");
  assert.ok(changedCharts.every((chart) => chart.props.metric === infectious));
  assert.deepEqual(changedCharts.map((chart) => chart.props.points[1].intervention), [100, 100, 121, 121, 107, 107]);
  assert.equal(calls.length, 4);
  assert.equal(timers.size, 0);
  charts[0].props.onInspect(dates[1]); render();
  assert.equal(elements(tree).find((node) => node.type === "chart").props.date, dates[1]);
  assert.equal(calls.length, 4);
  assert.equal(timers.size, 0);
  elements(tree).find((node) => node.type === "chart").props.onInspect(null); render();
  assert.equal(elements(tree).find((node) => node.type === "chart").props.date, dates[0]);
  assert.equal(elements(tree).some((node) => node.type === "footer" || node.props.type === "range"), false);
  assert.equal(calls.length, 4);
  assert.equal(timers.size, 0);
  elements(tree).find((node) => node.props["aria-label"] === "Scenario 2 delay (days)").props.onChange({ target: { value: "14" } });
  render();
  const completedResults = props.evaluation.results;
  assert.equal(props.evaluation.status, "loading");
  assert.equal(completedResults.length, 3);
  assert.equal(elements(tree).filter((node) => node.props.className === "scenario-comparison-pending").length, 0);
  assert.deepEqual(elements(tree).filter((node) => node.type === "chart").map((chart) => chart.props.points[1].intervention), [100, 100, 121, 121, 107, 107]);
  assert.ok(elements(tree).filter((node) => node.type === "chart").every((chart) => !chart.props.animate));
  assert.equal(elements(tree).find((node) => node.props.className === "scenario-comparison-network").props.inert, "");
  flush(timers); flush(frames);
  assert.equal(props.evaluation.results, completedResults);
  elements(tree).find((node) => node.props["aria-label"] === "Scenario 2 delay (days)").props.onChange({ target: { value: "10" } });
  render();
  assert.equal(frames.size, 0);
  assert.equal(props.evaluation.results, completedResults);
  flush(timers); flush(frames); flush(frames); flush(frames);
  assert.equal(props.evaluation.status, "ready");
  assert.deepEqual(elements(tree).filter((node) => node.type === "chart").map((chart) => chart.props.points[1].intervention), [100, 100, 110, 110, 107, 107]);
  assert.ok(elements(tree).filter((node) => node.type === "chart").every((chart) => chart.props.animate));
  elements(tree).find((node) => node.props["aria-label"] === "Scenario 2 delay (days)").props.onChange({ target: { value: "12" } });
  render();
  props.enabled = false; render();
  assert.equal(timers.size, 0);
  assert.equal(frames.size, 0);
  data.mode = "trade";
  render();
  assert.equal(props.evaluation.results, null);
});
