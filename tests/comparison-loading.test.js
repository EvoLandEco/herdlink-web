import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/useComparison.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replace(/^export /gm, "");

function hook() {
  const states = [];
  const refs = [];
  const effects = [];
  let layoutEffects = [];
  let stateIndex = 0;
  let refIndex = 0;
  let mounted = false;
  let unmounted = false;
  const frames = new Map();
  const calls = [];
  let frameId = 0;
  let snapshot = { status: "ready" };
  const slots = [{ name: "Saved seed", scenario: { settings: { seedRegion: "CR35" } } }, null, null];
  const window = new EventTarget();
  const body = {};
  const document = Object.assign(new EventTarget(), { body, activeElement: body, getElementById: () => null });
  const bridge = {
    canOpen: () => true, prepare() {},
    read: () => snapshot,
    loadPreset: (id) => { calls.push(["preset", id]); return { label: id, detail: "Applied." }; },
    loadScenario: (scenario) => calls.push(["scenario", scenario]),
    setMode: (mode) => calls.push(["mode", mode]),
    captureScenario: () => { calls.push(["save"]); return {}; },
  };
  window.herdlinkComparison = bridge;
  const context = vm.createContext({
    window, document, Event, console: { error() {} },
    useState: (value) => {
      const state = states[stateIndex] ||= { value };
      stateIndex++;
      return [state.value, (next) => { state.value = next; }];
    },
    useRef: (current) => refs[refIndex++] ||= { current },
    useCallback: (callback) => callback,
    useEffect: (effect) => { if (!mounted) effects.push(effect); },
    useLayoutEffect: (effect) => layoutEffects.push(effect),
    getComputedStyle: (element) => ({ visibility: element.visibility }),
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    readScenarioSlots: () => slots,
    saveScenarioSlot: () => slots,
    scenarioStorageKey: "scenarios",
  });
  vm.runInContext(source, context);
  const api = context.useComparison(true);
  layoutEffects.forEach((effect) => effect());
  const cleanups = effects.map((effect) => effect());
  mounted = true;
  const commit = () => {
    if (unmounted) return;
    stateIndex = 0;
    refIndex = 0;
    layoutEffects = [];
    context.useComparison(true);
    layoutEffects.forEach((effect) => effect());
  };
  return {
    api, bridge, calls, frames, slots, document, commit,
    get data() { return states[1].value; },
    get error() { return states[3].value; },
    get notice() { return states[4].value; },
    get recomputing() { return states[5].value; },
    setSnapshot(next) { snapshot = next; },
    refresh() { window.dispatchEvent(new Event("herdlink:comparison-change")); },
    frame(render = true) {
      for (const id of Array.from(frames.keys())) {
        const callback = frames.get(id);
        if (!callback) continue;
        frames.delete(id);
        callback();
      }
      if (render) commit();
    },
    unmount() { unmounted = true; cleanups.forEach((cleanup) => cleanup?.()); },
  };
}

test("scenario loads wait two frames, reject duplicate work and settle unchanged results", () => {
  const app = hook();
  app.api.toggle();
  app.api.loadPreset("open-trade");
  assert.equal(app.recomputing, true);
  app.api.loadPreset("seed-containment");
  app.api.loadScenario(0);
  app.api.changeMode("simulation");
  app.api.saveScenario(0, "Old settings");
  assert.deepEqual(app.calls, []);
  app.frame();
  assert.equal(app.recomputing, true);
  assert.deepEqual(app.calls, []);
  app.frame();
  assert.deepEqual(app.calls, [["preset", "open-trade"]]);
  assert.equal(app.recomputing, true);
  app.frame();
  assert.equal(app.recomputing, false);
  assert.match(app.notice, /open-trade loaded/);
  app.api.changeMode("simulation");
  assert.deepEqual(app.calls.at(-1), ["mode", "simulation"]);
});

test("saved scenario loads stay pending through simulation loading until a final snapshot", () => {
  const app = hook();
  app.api.toggle();
  app.frame();
  app.bridge.loadScenario = (scenario) => {
    app.calls.push(["scenario", scenario]);
    app.setSnapshot({ status: "loading" });
    app.refresh();
  };
  app.api.loadScenario(0);
  app.frame();
  app.frame();
  app.frame();
  assert.deepEqual(app.calls, [["scenario", app.slots[0].scenario]]);
  assert.equal(app.recomputing, true);
  assert.equal(app.data.status, "loading");
  assert.match(app.notice, /Saved seed loaded/);
  app.setSnapshot({ status: "ready", result: "new trajectory" });
  app.refresh();
  app.frame();
  assert.equal(app.recomputing, false);
  assert.equal(app.data.result, "new trajectory");
});

test("close and unmount cancel queued loads at either animation frame", () => {
  for (const finish of ["close", "unmount"]) {
    for (const elapsedFrames of [0, 1]) {
      const app = hook();
      app.api.toggle();
      app.frame();
      app.api.loadPreset("seed-containment");
      if (elapsedFrames) app.frame();
      if (finish === "close") app.api.close();
      else app.unmount();
      app.frame();
      app.frame();
      assert.deepEqual(app.calls, []);
      assert.equal(app.frames.size, 0);
      if (finish === "close") assert.equal(app.recomputing, false);
    }
  }
});

test("closing an active simulation stops local pending state and reopening reads its completion", () => {
  const app = hook();
  app.api.toggle();
  app.frame();
  app.bridge.loadPreset = () => {
    app.calls.push(["simulation started"]);
    app.setSnapshot({ status: "loading" });
    return { label: "Seed" };
  };
  app.api.loadPreset("seed-containment");
  app.frame();
  app.frame();
  app.api.close();
  assert.equal(app.recomputing, false);
  app.setSnapshot({ status: "ready", result: "completed while closed" });
  app.refresh();
  app.frame();
  assert.equal(app.data.result, undefined);
  app.api.toggle();
  app.frame();
  assert.equal(app.data.result, "completed while closed");
  assert.deepEqual(app.calls, [["simulation started"]]);
});

test("load failures and final error or empty snapshots release pending state", () => {
  for (const outcome of ["load error", "read error", "error", "empty"]) {
    const app = hook();
    app.api.toggle();
    app.frame();
    if (outcome === "load error") app.bridge.loadPreset = () => { throw new Error("Invalid scenario"); };
    else if (outcome === "read error") app.bridge.read = () => { throw new Error("Calculation failed"); };
    else app.setSnapshot({ status: outcome });
    app.api.loadPreset("seed-containment");
    app.frame();
    app.frame();
    assert.equal(app.recomputing, true);
    app.frame();
    assert.equal(app.recomputing, false, outcome);
    if (outcome === "load error") assert.equal(app.error, "Invalid scenario");
    else assert.equal(app.data.status, outcome === "read error" ? "error" : outcome);
  }
});

function focusControl(app) {
  const focused = [];
  const control = {
    isConnected: true, disabled: false, inert: false, hidden: false, inside: true, visibility: "visible",
    closest(selector) {
      return selector === "#comparisonOverlay" ? (this.inside ? {} : null) : this.inert ? {} : null;
    },
    matches() { return this.disabled; },
    getClientRects() { return this.hidden ? [] : [{}]; },
    focus(options) { focused.push(options); app.document.activeElement = this; },
  };
  return { control, focused };
}

test("preset and saved loads restore lost focus after the initiating control is enabled", () => {
  for (const kind of ["preset", "saved"]) {
    const app = hook();
    app.api.toggle();
    app.frame();
    const { control, focused } = focusControl(app);
    app.document.activeElement = control;
    if (kind === "preset") app.api.loadPreset("seed-containment");
    else app.api.loadScenario(0);
    control.disabled = true;
    app.document.activeElement = app.document.body;
    app.commit();
    app.frame();
    app.frame();
    app.frame(false);
    assert.equal(app.recomputing, false);
    assert.equal(focused.length, 0);
    control.disabled = false;
    app.commit();
    assert.equal(app.document.activeElement, control);
    assert.equal(focused.length, 1);
    assert.equal(focused[0].preventScroll, true);
    app.document.activeElement = app.document.body;
    app.commit();
    assert.equal(focused.length, 1);
  }
});

test("focus restoration respects dismissal, removed controls, visibility and user focus moves", () => {
  for (const condition of ["closed", "unmounted", "disconnected", "outside", "disabled", "inert", "hidden", "visibility", "user focus"]) {
    const app = hook();
    app.api.toggle();
    app.frame();
    const { control, focused } = focusControl(app);
    app.document.activeElement = control;
    app.api.loadPreset("seed-containment");
    app.document.activeElement = app.document.body;
    app.commit();
    app.frame();
    app.frame();
    app.frame(false);
    if (condition === "closed") app.api.close();
    if (condition === "unmounted") app.unmount();
    if (condition === "disconnected") control.isConnected = false;
    if (condition === "outside") control.inside = false;
    if (condition === "disabled") control.disabled = true;
    if (condition === "inert") control.inert = true;
    if (condition === "hidden") control.hidden = true;
    if (condition === "visibility") control.visibility = "hidden";
    if (condition === "user focus") app.document.activeElement = {};
    app.commit();
    assert.equal(focused.length, 0, condition);
  }
});
