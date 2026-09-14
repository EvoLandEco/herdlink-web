import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { transform } from "esbuild";
import { buildComparisonChart, comparisonEventMarkerWidth, formatComparisonDelta, formatComparisonValue, groupComparisonEvents } from "../src/comparisonCharts.js";

const source = readFileSync(new URL("../src/components/ComparisonOverlay.jsx", import.meta.url), "utf8");
const component = source.match(/^const InterventionMarker = memo\(function InterventionMarker\([^]*?^\}\);/m)[0];
const hook = source.match(/^function useComparisonTipPosition\([^]*?^\}/m)[0];
const { code } = await transform(`${hook}\n${component}\nglobalThis.renderMarker = InterventionMarker;`, {
  loader: "jsx", jsxFactory: "createElement", jsxFragment: "Fragment",
});
const wrappers = ["InterventionTrack", "IntroductionMarker", "PairedChart"]
  .map((name) => source.match(new RegExp(`^function ${name}\\([^]*?^\\}`, "m"))[0]).join("\n");
const { code: wrapperCode } = await transform(`${wrappers}\nglobalThis.components = { InterventionTrack, IntroductionMarker, PairedChart };`, {
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

function renderWrapper(name, props) {
  const context = vm.createContext({
    Fragment: "fragment", InterventionMarker: "marker", axisFormatter,
    dateLabel: (date) => date, useMemo: (calculate) => calculate(), useEffect() {},
    useRef: () => ({ current: null }), useState: () => [{ width: 640, height: 198 }, () => {}],
    useAnimatedComparisonSeries: (points) => points,
    buildComparisonChart, comparisonEventMarkerWidth, formatComparisonDelta, formatComparisonValue, groupComparisonEvents,
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

test("introduction labels retain the actual date while clicks inspect its first recorded step", () => {
  const introduction = { date: "2020-01-02", recordedDate: "2020-01-08", seedLabel: "Seed region (CR35)" };
  const wrapped = renderWrapper("IntroductionMarker", { introduction, position: 0.25, onInspect() {} });
  assert.equal(wrapped.type, "marker");
  assert.equal(wrapped.props.introduction, true);
  assert.equal(wrapped.props.cluster.position, 0.25);
  const app = marker(wrapped.props.cluster, wrapped.props.introduction);
  assert.match(app.tree.props.className, /is-introduction/);
  const button = app.find((node) => node.type === "button");
  assert.equal(textContent(button), "Intro");
  assert.equal(button.props["aria-label"], "Inspect seed introduction on 2020-01-02, recorded at 2020-01-08");
  button.props.onClick();
  assert.deepEqual(app.inspected, ["2020-01-08"]);
  app.tree.props.onFocus(); app.render();
  assert.match(textContent(app.tree), /First recorded step: 2020-01-08/);
  assert.match(textContent(app.tree), /Seed introduction in Seed region \(CR35\). Both scenarios share this introduction./);
  assert.equal(app.find((node) => node.type === "time").props.dateTime, "2020-01-02");
  assert.equal(app.all((node) => node.props["aria-expanded"] !== undefined).length, 0);
});

test("dense ranges use one track span and leave introduction separate from intervention groups", () => {
  const dates = Array.from({ length: 101 }, (_, index) => new Date(Date.UTC(2020, 0, index + 1)).toISOString());
  const events = [...dates.slice(0, 35), dates.at(-1)].map((date) => ({ date, events: [{ date, description: "Exports blocked" }] }));
  const introduction = { date: dates[17], recordedDate: dates[17], seedLabel: "CR35" };
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
