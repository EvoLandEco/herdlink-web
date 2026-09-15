import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const extract = (name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
};

function trajectory(values = [0, 0.1, 0.4], dates = ["2020-01-01", "2020-01-03", "2020-02-01"], introductionDate = "2020-01-02") {
  return {
    settings: { introductionDate },
    frames: values.map((prevalence, index) => ({ date: new Date(dates[index]), summary: { prevalence } })),
  };
}

function runtime(data = trajectory()) {
  const calls = { max: 0, line: 0, area: 0 };
  const paths = new Map();
  const pathData = new Map();
  const marker = { hidden: true, style: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const point = { style: {} };
  const lane = { hidden: true, querySelector: (selector) => ({
    ".simulation-timeline-introduction": marker,
    ".simulation-timeline-current": point,
  })[selector] };
  const slider = { value: "0" };
  let datum;
  const selectPaths = (selector) => {
    const selectors = selector === "path"
      ? [".simulation-timeline-curve", ".simulation-timeline-area"] : [selector];
    return {
      attr(name, value) { assert.equal(name, "d"); selectors.forEach((key) => paths.set(key, value)); },
      datum(value) { selectors.forEach((key) => pathData.set(key, value == null ? undefined : value)); },
    };
  };
  const chart = {
    datum(value) { if (arguments.length) datum = value == null ? undefined : value; else return datum; return chart; },
    select(selector) {
      if (datum !== undefined) pathData.set(selector, datum);
      return selectPaths(selector);
    },
    selectAll: selectPaths,
  };
  const generator = (kind) => {
    let x, y, y0;
    const draw = (frames) => {
      calls[kind]++;
      return frames.map((frame, index) => kind === "line"
        ? [x(frame, index), y(frame, index)]
        : [x(frame, index), y0, y(frame, index)]);
    };
    draw.x = (value) => { x = value; return draw; };
    draw.y = draw.y1 = (value) => { y = value; return draw; };
    draw.y0 = (value) => { y0 = value; return draw; };
    return draw;
  };
  const elements = { simulationTimeline: lane, timeSlider: slider };
  const context = vm.createContext({
    window: {}, simulationState: { status: "ready", trajectory: data },
    isSimulationModeActive: () => true,
    document: { getElementById: (id) => elements[id] },
    d3: {
      select(element) { assert.equal(element, lane); return { select(selector) { assert.equal(selector, "svg"); return chart; } }; },
      max(frames, value) { calls.max++; return Math.max(...frames.map(value)); },
      line: () => generator("line"), area: () => generator("area"),
    },
  });
  vm.runInContext(extract("renderSimulationTimeline"), context);
  return { context, lane, marker, point, slider, calls, paths, pathData, chart, elements };
}

test("prevalence samples follow slider indices across irregular dates and mark the introduction step", () => {
  const app = runtime();
  app.context.renderSimulationTimeline();
  assert.equal(app.lane.hidden, false);
  assert.deepEqual(app.paths.get(".simulation-timeline-curve"), [[0, 32], [500, 25], [1000, 4]]);
  assert.deepEqual(app.paths.get(".simulation-timeline-area"), [[0, 32, 32], [500, 32, 25], [1000, 32, 4]]);
  assert.equal(app.marker.hidden, false);
  assert.equal(app.marker.style.left, "50%");
  assert.equal(app.marker.attributes["aria-label"], "Simulation introduction: 2020-01-02");

  for (const [value, left, top] of [[0, "0%", "32px"], [1, "50%", "25px"], [2, "100%", "4px"]]) {
    app.slider.value = String(value);
    app.context.renderSimulationTimeline();
    assert.deepEqual(app.point.style, { left, top });
  }
});

test("introduction markers cover the first and final frames and hide beyond the timeline", () => {
  for (const [introduction, position] of [
    ["2019-12-31", "0%"], ["2020-01-01", "0%"], ["2020-01-03", "50%"],
    ["2020-01-04", "100%"], ["2020-02-01", "100%"], [undefined, "0%"],
  ]) {
    const data = trajectory();
    data.settings.introductionDate = introduction;
    const app = runtime(data);
    app.context.renderSimulationTimeline();
    assert.equal(app.marker.hidden, false, introduction);
    assert.equal(app.marker.style.left, position, introduction);
  }
  const app = runtime();
  app.context.renderSimulationTimeline();
  app.context.simulationState.trajectory = trajectory([0, 0, 0], undefined, "2020-02-02");
  app.context.renderSimulationTimeline();
  assert.equal(app.marker.hidden, true);
  assert.equal(app.lane.hidden, false);
});

test("zero prevalence stays on its baseline and single frames have finite centered coordinates", () => {
  const zero = runtime(trajectory([0, 0, 0]));
  zero.context.renderSimulationTimeline();
  assert.deepEqual(zero.paths.get(".simulation-timeline-curve"), [[0, 32], [500, 32], [1000, 32]]);
  for (const [prevalence, top] of [[0, 32], [0.1, 4]]) {
    const app = runtime(trajectory([prevalence], ["2020-01-01"], "2020-01-01"));
    app.context.renderSimulationTimeline();
    assert.deepEqual(app.paths.get(".simulation-timeline-curve"), [[500, top]]);
    assert.deepEqual(app.point.style, { left: "50%", top: `${top}px` });
    assert.equal(app.marker.style.left, "50%");
  }
});

test("scrubbing reuses path geometry and replacing the trajectory rebuilds it once", () => {
  const app = runtime();
  app.context.renderSimulationTimeline();
  for (let index = 0; index < 50; index++) {
    app.slider.value = String(index % 3);
    app.context.selectedNodeData = { id: index % 2 ? "CR35" : "CR10" };
    app.context.renderSimulationTimeline();
  }
  assert.deepEqual(app.calls, { max: 1, line: 1, area: 1 });
  app.context.simulationState.trajectory = trajectory([0.2, 0.1, 0], undefined, "2020-01-01");
  app.context.renderSimulationTimeline();
  assert.deepEqual(app.calls, { max: 2, line: 2, area: 2 });
  assert.deepEqual(app.paths.get(".simulation-timeline-curve"), [[0, 4], [500, 18], [1000, 32]]);
  assert.equal(app.marker.style.left, "0%");
  assert.equal(app.chart.datum().trajectory, app.context.simulationState.trajectory);
  assert.ok([...app.pathData.values()].every((value) => value === undefined));
});

test("ledger, dataset changes, unfinished runs and empty trajectories hide the timeline", () => {
  const app = runtime();
  app.context.renderSimulationTimeline();
  const original = app.context.simulationState.trajectory;
  for (const status of ["idle", "running", "error"]) {
    app.context.simulationState.status = status;
    app.context.renderSimulationTimeline();
    assert.equal(app.lane.hidden, true, status);
    assert.equal(app.chart.datum(), undefined);
  }
  app.context.simulationState.status = "ready";
  app.context.window.isSwitchingCSV = true;
  app.context.renderSimulationTimeline();
  assert.equal(app.lane.hidden, true);
  app.context.window.isSwitchingCSV = false;
  app.context.isSimulationModeActive = () => false;
  app.context.renderSimulationTimeline();
  assert.equal(app.lane.hidden, true);
  app.context.isSimulationModeActive = () => true;
  for (const empty of [null, trajectory([])]) {
    app.context.simulationState.trajectory = empty;
    app.context.renderSimulationTimeline();
    assert.equal(app.lane.hidden, true);
  }
  assert.deepEqual(app.calls, { max: 1, line: 1, area: 1 });
  app.context.simulationState.trajectory = original;
  app.context.renderSimulationTimeline();
  assert.equal(app.lane.hidden, false);
  assert.deepEqual(app.calls, { max: 2, line: 2, area: 2 });
  delete app.elements.simulationTimeline;
  assert.doesNotThrow(() => app.context.renderSimulationTimeline());
});

test("hiding the timeline releases every cached trajectory reference", () => {
  for (const hide of [
    (app) => { app.context.isSimulationModeActive = () => false; app.context.simulationState.trajectory = null; },
    (app) => { app.context.simulationState.status = "error"; },
    (app) => { app.context.simulationState.status = "running"; },
    (app) => { app.context.window.isSwitchingCSV = true; },
  ]) {
    const app = runtime();
    app.context.renderSimulationTimeline();
    const geometry = app.chart.datum();
    assert.equal(geometry.trajectory, app.context.simulationState.trajectory);
    app.pathData.set(".simulation-timeline-curve", geometry);
    app.pathData.set(".simulation-timeline-area", geometry);
    hide(app);
    app.context.renderSimulationTimeline();
    assert.equal(app.lane.hidden, true);
    assert.equal(app.chart.datum(), undefined);
    assert.ok([...app.pathData.values()].every((value) => value === undefined));
  }
});
