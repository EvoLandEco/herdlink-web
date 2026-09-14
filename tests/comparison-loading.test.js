import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { scenarioSignature } from "../src/scenarioStorage.js";

const source = readFileSync(new URL("../src/useComparison.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replace(/^export /gm, "");

function hook() {
  const states = [];
  const refs = [];
  const effects = [];
  const callbacks = [];
  let pendingEffects = [];
  let layoutEffects = [];
  let stateIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let callbackIndex = 0;
  let supportedScreen = true;
  let unmounted = false;
  const frames = new Map();
  const calls = [];
  let frameId = 0;
  let snapshot = { status: "ready" };
  let slots = [{ name: "Saved seed", scenario: { settings: { seedRegion: "CR35" } } }, null, null];
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
      return [state.value, (next) => { state.value = typeof next === "function" ? next(state.value) : next; }];
    },
    useRef: (current) => refs[refIndex++] ||= { current },
    useCallback: (callback, dependencies) => {
      const index = callbackIndex++;
      if (!callbacks[index] || dependencies.some((value, i) => !Object.is(value, callbacks[index].dependencies[i]))) {
        callbacks[index] = { callback, dependencies };
      }
      return callbacks[index].callback;
    },
    useMemo: (calculate) => calculate(),
    useEffect: (effect, dependencies) => {
      const index = effectIndex++;
      if (!effects[index] || dependencies.some((value, i) => !Object.is(value, effects[index].dependencies[i]))) {
        pendingEffects.push({ index, effect, dependencies });
      }
    },
    useLayoutEffect: (effect) => layoutEffects.push(effect),
    getComputedStyle: (element) => ({ visibility: element.visibility }),
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
    readScenarioSlots: () => slots,
    saveScenarioSlot: (storage, index, name, scenario) => {
      slots = slots.slice();
      slots[index] = { name, scenario };
      return slots;
    },
    scenarioSignature,
    scenarioStorageKey: "scenarios",
  });
  vm.runInContext(source, context);
  let api;
  const commit = () => {
    if (unmounted) return;
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    callbackIndex = 0;
    pendingEffects = [];
    layoutEffects = [];
    api = context.useComparison(supportedScreen);
    layoutEffects.forEach((effect) => effect());
    pendingEffects.forEach(({ index }) => effects[index]?.cleanup?.());
    pendingEffects.forEach(({ index, effect, dependencies }) => {
      effects[index] = { dependencies, cleanup: effect() };
    });
  };
  commit();
  return {
    bridge, calls, frames, document, commit,
    get api() { return api; },
    get slots() { return slots; },
    get data() { return states[1].value; },
    get error() { return states[3].value; },
    get notice() { return states[4].value; },
    get recomputing() { return states[5].value; },
    setSupportedScreen(next) { supportedScreen = next; commit(); commit(); },
    setSnapshot(next) { snapshot = next; },
    setSlots(next) {
      slots = next;
      window.dispatchEvent(Object.assign(new Event("storage"), { key: "scenarios" }));
      commit();
    },
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
    unmount() { unmounted = true; effects.forEach(({ cleanup }) => cleanup?.()); },
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

const openScenario = {
  datasetKey: "weekly", dates: ["2020-01-01T00:00:00.000Z", "2020-01-08T00:00:00.000Z"],
  settings: { model: "SEIR", seedRegion: "CR35", initialPct: 1, beta: 0.32, movementBeta: 0.08, sigma: 0.22, gamma: 0.15 },
  nodeInterventions: [], linkInterventions: [],
};
const seedScenario = { ...openScenario, nodeInterventions: [[1578441600000, [["CR35", { exports: false }]]]] };
const comparison = (scenario, status = "ready") => ({ status, mode: "trade", dates: scenario.dates, scenarioContext: scenario });
const finishLoad = (app) => { app.frame(); app.frame(); app.frame(); };

test("active indicators follow complete configurations through loads, inspection, manual edits and slot changes", () => {
  const app = hook();
  app.setSnapshot(comparison(openScenario));
  app.api.toggle();
  app.frame();
  assert.equal(app.api.activePresetId, "open-trade");
  app.bridge.loadPreset = () => {
    app.setSnapshot(comparison(seedScenario));
    return { label: "Seed", scenario: seedScenario };
  };
  app.api.loadPreset("seed-containment");
  app.commit();
  assert.equal(app.api.activePresetId, null);
  finishLoad(app);
  assert.equal(app.api.activePresetId, "seed-containment");
  app.bridge.captureScenario = () => seedScenario;
  app.api.saveScenario(1, "Seed saved");
  app.commit();
  assert.equal(app.api.activeScenarioSlot, 1);
  app.api.saveScenario(1, "Seed renamed");
  app.commit();
  assert.equal(app.api.activeScenarioSlot, 1);
  app.setSlots([null, { name: "Other tab", scenario: openScenario }, { name: "Same configuration", scenario: seedScenario }]);
  assert.equal(app.api.activeScenarioSlot, null);
  app.setSnapshot({ ...comparison(seedScenario), mode: "simulation", date: openScenario.dates[1], selectedRegionId: "CR02" });
  app.refresh(); app.frame();
  assert.equal(app.api.activePresetId, "seed-containment");
  for (const changed of [
    { ...seedScenario, linkInterventions: [[1578441600000, [["CR01-CR02", true]]]] },
    { ...seedScenario, settings: { ...seedScenario.settings, beta: 0.6 } },
    { ...seedScenario, datasetKey: "daily" },
  ]) {
    app.setSnapshot(comparison(changed)); app.refresh(); app.frame();
    assert.equal(app.api.activePresetId, null);
    assert.equal(app.api.activeScenarioSlot, null);
  }
  app.setSnapshot(comparison(openScenario)); app.refresh(); app.frame();
  assert.equal(app.api.activePresetId, "open-trade");
});

test("a successful no-action preset outranks Open while failed and canceled loads cannot claim another preset", () => {
  const app = hook();
  app.setSnapshot(comparison(openScenario)); app.api.toggle(); app.frame();
  app.bridge.loadPreset = () => ({ label: "Delayed", scenario: openScenario });
  app.api.loadPreset("delayed-response"); finishLoad(app);
  assert.equal(app.api.activePresetId, "delayed-response");
  app.api.loadPreset("delayed-response"); finishLoad(app);
  assert.equal(app.api.activePresetId, "delayed-response");
  app.bridge.loadPreset = () => { throw new Error("Load failed"); };
  app.api.loadPreset("hub-controls"); finishLoad(app);
  assert.equal(app.api.activePresetId, "delayed-response");
  app.bridge.loadPreset = () => {
    app.setSnapshot(comparison(seedScenario, "loading"));
    return { label: "Seed", scenario: seedScenario };
  };
  app.api.loadPreset("seed-containment"); finishLoad(app);
  assert.equal(app.api.activePresetId, null);
  app.setSnapshot(comparison(seedScenario, "error")); app.refresh(); app.frame();
  app.setSnapshot(comparison(seedScenario)); app.refresh(); app.frame();
  assert.equal(app.api.activePresetId, null);
  app.api.loadPreset("seed-containment"); app.api.close(); app.frame();
  app.api.toggle(); app.frame();
  assert.equal(app.api.activePresetId, null);
});

test("preset completion while closed matches its captured configuration before claiming an active preset", () => {
  for (const changedWhileClosed of [false, true]) {
    const app = hook();
    app.setSnapshot(comparison(openScenario)); app.api.toggle(); app.frame();
    app.bridge.loadPreset = () => {
      app.setSnapshot(comparison(seedScenario, "loading"));
      return { label: "Seed", scenario: seedScenario };
    };
    app.api.loadPreset("seed-containment"); finishLoad(app);
    app.api.close();
    app.setSnapshot(comparison(changedWhileClosed ? { ...seedScenario, settings: { ...seedScenario.settings, gamma: 0.5 } } : seedScenario));
    app.api.toggle(); app.frame();
    assert.equal(app.api.activePresetId, changedWhileClosed ? null : "seed-containment");
    app.api.close(); app.api.toggle(); app.frame();
    assert.equal(app.api.activePresetId, changedWhileClosed ? null : "seed-containment");
  }
});

test("screen changes retain started preset identity and cancel queued loads", () => {
  for (const started of [false, true]) {
    const app = hook();
    app.setSnapshot(comparison(openScenario)); app.api.toggle(); app.frame();
    app.bridge.loadPreset = () => {
      app.calls.push(["simulation started"]);
      app.setSnapshot(comparison(seedScenario, "loading"));
      return { label: "Seed", scenario: seedScenario };
    };
    app.api.loadPreset("seed-containment");
    app.frame();
    if (started) app.frame();
    app.setSupportedScreen(false);
    assert.equal(app.api.open, false);
    assert.equal(app.recomputing, false);
    app.frame();
    assert.equal(app.calls.length, started ? 1 : 0);
    app.api.toggle(); app.commit();
    assert.equal(app.api.open, false);
    app.setSnapshot(comparison(started ? seedScenario : openScenario));
    app.setSupportedScreen(true);
    app.api.toggle(); app.frame();
    assert.equal(app.api.activePresetId, started ? "seed-containment" : "open-trade");
  }
});

test("custom loads recognize known presets and equivalent schedules prefer the most recent successful preset", () => {
  const app = hook();
  const pause = { ...seedScenario, nodeInterventions: [[1578441600000, [["CR35", { exports: false }], ["CR02", { exports: false }]]]] };
  const configurations = { "seed-containment": seedScenario, "temporary-standstill": pause, "open-trade": openScenario, "delayed-response": openScenario };
  app.setSnapshot(comparison(openScenario)); app.api.toggle(); app.frame();
  app.bridge.loadPreset = (id) => {
    app.setSnapshot(comparison(configurations[id]));
    return { label: id, scenario: configurations[id] };
  };
  app.api.loadPreset("seed-containment"); finishLoad(app);
  app.bridge.captureScenario = () => seedScenario;
  app.api.saveScenario(0, "Saved seed"); app.commit();
  app.api.loadPreset("temporary-standstill"); finishLoad(app);
  assert.equal(app.api.activePresetId, "temporary-standstill");
  app.bridge.loadScenario = (scenario) => app.setSnapshot(comparison(scenario));
  app.api.loadScenario(0); finishLoad(app);
  assert.equal(app.api.activePresetId, "seed-containment");
  assert.equal(app.api.activeScenarioSlot, 0);
  for (const id of ["delayed-response", "open-trade", "delayed-response"]) {
    app.api.loadPreset(id); finishLoad(app);
    assert.equal(app.api.activePresetId, id);
  }
});

test("identical custom scenarios highlight only the latest deliberate save or load", () => {
  const app = hook();
  app.setSlots([0, 1, 2].map((index) => ({ name: `Copy ${index}`, scenario: seedScenario })));
  app.setSnapshot(comparison(seedScenario)); app.api.toggle(); app.frame();
  assert.equal(app.api.activeScenarioSlot, null);
  app.bridge.loadScenario = (scenario) => app.setSnapshot(comparison(scenario));
  for (const index of [0, 1, 0]) {
    app.api.loadScenario(index); finishLoad(app);
    assert.equal(app.api.activeScenarioSlot, index);
  }
  app.bridge.captureScenario = () => seedScenario;
  app.api.saveScenario(2, "Saved copy"); app.commit();
  assert.equal(app.api.activeScenarioSlot, 2);
  app.bridge.captureScenario = () => { throw new Error("Save denied"); };
  app.api.saveScenario(1, "Failed copy"); app.commit();
  assert.equal(app.api.activeScenarioSlot, 2);
  app.setSlots(app.slots.map((slot, index) => index === 2 ? { ...slot, name: "Renamed elsewhere" } : slot));
  assert.equal(app.api.activeScenarioSlot, 2);
  app.setSlots(app.slots.map((slot, index) => index === 2 ? { ...slot, scenario: openScenario } : slot));
  assert.equal(app.api.activeScenarioSlot, null);
  app.api.loadScenario(1); finishLoad(app);
  assert.equal(app.api.activeScenarioSlot, 1);
  for (const snapshot of [
    { ...comparison(seedScenario), mode: "simulation", date: seedScenario.dates[1], selectedRegionId: "CR02" },
    comparison({ ...seedScenario, settings: { ...seedScenario.settings, beta: 0.6 } }),
    comparison({ ...seedScenario, datasetKey: "daily" }),
    comparison(seedScenario),
  ]) {
    app.setSnapshot(snapshot); app.refresh(); app.frame();
    const matches = scenarioSignature(snapshot.scenarioContext) === scenarioSignature(seedScenario);
    assert.equal(app.api.activeScenarioSlot, matches ? 1 : null);
  }
  app.api.close(); app.api.toggle(); app.frame();
  assert.equal(app.api.activeScenarioSlot, 1);
  app.setSupportedScreen(false); app.setSupportedScreen(true); app.api.toggle(); app.frame();
  assert.equal(app.api.activeScenarioSlot, 1);
  app.bridge.loadPreset = () => ({ label: "Seed", scenario: seedScenario });
  app.api.loadPreset("seed-containment"); finishLoad(app);
  assert.equal(app.api.activeScenarioSlot, null);
});

test("failed and canceled custom loads retain the selected slot without claiming an identical copy", () => {
  for (const outcome of ["throw", "read error", "error", "empty", "cancel first frame", "cancel second frame"]) {
    const app = hook();
    app.setSlots([0, 1, 2].map((index) => ({ name: `Copy ${index}`, scenario: seedScenario })));
    app.setSnapshot(comparison(seedScenario)); app.api.toggle(); app.frame();
    app.bridge.captureScenario = () => seedScenario;
    app.api.saveScenario(0, "Selected"); app.commit();
    app.bridge.loadScenario = () => {
      if (outcome === "throw") throw new Error("Load denied");
      app.setSnapshot(comparison(seedScenario, "loading"));
    };
    app.api.loadScenario(1);
    if (outcome.startsWith("cancel")) {
      if (outcome === "cancel second frame") app.frame();
      app.api.close(); app.api.toggle(); finishLoad(app);
    } else {
      finishLoad(app);
      if (outcome !== "throw") {
        const read = app.bridge.read;
        if (outcome === "read error") app.bridge.read = () => { throw new Error("Read denied"); };
        else app.setSnapshot(comparison(seedScenario, outcome));
        app.refresh(); app.frame();
        app.bridge.read = read;
        app.setSnapshot(comparison(seedScenario)); app.refresh(); app.frame();
      }
    }
    assert.equal(app.api.activeScenarioSlot, 0, outcome);
  }
});

test("custom completion survives closing and screen changes and still requires matching data and storage", () => {
  for (const close of ["dialog", "screen"]) {
    for (const changed of ["none", "settings", "slot"]) {
      const app = hook();
      app.setSlots([null, { name: "Saved seed", scenario: seedScenario }, null]);
      app.setSnapshot(comparison(openScenario)); app.api.toggle(); app.frame();
      app.bridge.loadScenario = () => app.setSnapshot(comparison(seedScenario, "loading"));
      app.api.loadScenario(1); finishLoad(app);
      assert.equal(app.api.activeScenarioSlot, null);
      if (close === "dialog") app.api.close();
      else app.setSupportedScreen(false);
      app.setSnapshot(comparison(changed === "settings"
        ? { ...seedScenario, settings: { ...seedScenario.settings, gamma: 0.5 } } : seedScenario));
      if (changed === "slot") app.setSlots([null, { name: "Overwritten", scenario: openScenario }, null]);
      if (close === "screen") app.setSupportedScreen(true);
      app.api.toggle(); app.frame();
      assert.equal(app.api.activeScenarioSlot, changed === "none" ? 1 : null, `${close}: ${changed}`);
    }
  }
});

test("preset failures preserve the chosen custom slot and successful matching presets clear it", () => {
  for (const failure of ["throw", "error"]) {
    const app = hook();
    app.setSnapshot(comparison(seedScenario)); app.api.toggle(); app.frame();
    app.bridge.captureScenario = () => seedScenario;
    app.api.saveScenario(0, "Selected seed"); app.commit();
    app.bridge.loadPreset = () => {
      if (failure === "throw") throw new Error("Preset denied");
      app.setSnapshot(comparison(seedScenario, "loading"));
      return { label: "Seed", scenario: seedScenario };
    };
    app.api.loadPreset("seed-containment"); finishLoad(app);
    if (failure === "error") {
      app.setSnapshot(comparison(seedScenario, "error")); app.refresh(); app.frame();
      app.setSnapshot(comparison(seedScenario)); app.refresh(); app.frame();
    }
    assert.equal(app.api.activeScenarioSlot, 0);
    app.bridge.loadPreset = () => ({ label: "Seed", scenario: seedScenario });
    app.api.loadPreset("seed-containment"); finishLoad(app);
    assert.equal(app.api.activeScenarioSlot, null);
  }
});
