import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { scenarioSignature } from "../src/scenarioStorage.js";
import { presetSettingsKey } from "../src/runtime/intervention-presets.js";

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
    scenarioSignature, presetSettingsKey,
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
  app.bridge.loadPreset = () => ({ label: "Standstill", scenario: openScenario });
  app.api.loadPreset("temporary-standstill"); finishLoad(app);
  assert.equal(app.api.activePresetId, "temporary-standstill");
  app.api.loadPreset("temporary-standstill"); finishLoad(app);
  assert.equal(app.api.activePresetId, "temporary-standstill");
  app.bridge.loadPreset = () => { throw new Error("Load failed"); };
  app.api.loadPreset("hub-controls"); finishLoad(app);
  assert.equal(app.api.activePresetId, "temporary-standstill");
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

test("network preset active state follows the scale used to select its saved targets", () => {
  const app = hook();
  const atScale = (scale) => {
    const data = comparison(seedScenario);
    data.scenarioContext.communityScale = scale;
    return data;
  };
  app.setSnapshot(atScale("finer")); app.api.toggle(); app.frame();
  app.bridge.loadPreset = () => ({ label: "Community", scenario: seedScenario, communityScale: "finer" });
  app.api.loadPreset("seed-community"); finishLoad(app);
  assert.equal(app.api.activePresetId, "seed-community");
  app.setSnapshot(atScale("broad")); app.refresh(); app.frame();
  assert.equal(app.api.activePresetId, null);
  app.setSnapshot(atScale("finer")); app.refresh(); app.frame();
  assert.equal(app.api.activePresetId, "seed-community");
});

test("ranked preset identity follows its date and budget while community scale stays independent", () => {
  const app = hook();
  const atSettings = (targetBudget, introductionDate = "2020-01-01", communityScale = "finer") => {
    const data = comparison(seedScenario);
    data.scenarioContext.presetSettings = { targetBudget, introductionDate, responseDays: 7, standstillDays: 14 };
    data.scenarioContext.communityScale = communityScale;
    return data;
  };
  app.setSnapshot(atSettings(3)); app.api.toggle(); app.frame();
  app.bridge.loadPreset = () => ({ label: "Hubs", scenario: seedScenario,
    presetKey: presetSettingsKey("hub-controls", { introductionDate: "2020-01-01", targetBudget: 3, responseDays: 7, standstillDays: 14 }) });
  app.api.loadPreset("hub-controls"); finishLoad(app);
  assert.equal(app.api.activePresetId, "hub-controls");
  app.setSnapshot(atSettings(3, "2020-01-01", "broad")); app.refresh(); app.frame();
  assert.equal(app.api.activePresetId, "hub-controls");
  app.setSnapshot(atSettings(5)); app.refresh(); app.frame();
  assert.equal(app.api.activePresetId, null);
  app.setSnapshot(atSettings(3, "2020-04-01")); app.refresh(); app.frame();
  assert.equal(app.api.activePresetId, null);
  let changed;
  app.bridge.setPresetSettings = (patch) => { changed = patch; };
  app.api.changePresetSettings({ targetBudget: 5 }); app.commit();
  assert.equal(changed.targetBudget, 5);
  assert.equal(app.recomputing, false);
});

test("preset badges follow only the timing and count settings that each preset uses", () => {
  const baseSettings = { introductionDate: "2020-01-01", targetBudget: 3, responseDays: 7, standstillDays: 14 };
  const ids = ["open-trade", "seed-containment", "partner-ring", "seed-community", "hub-controls", "trade-bottlenecks", "temporary-standstill"];
  for (const id of ids) {
    const app = hook();
    const scenario = { ...(id === "open-trade" ? openScenario : seedScenario),
      settings: { ...seedScenario.settings, introductionDate: baseSettings.introductionDate } };
    const atSettings = (patch) => {
      const data = comparison(scenario);
      data.scenarioContext.presetSettings = { ...baseSettings, ...patch };
      return data;
    };
    app.setSnapshot(atSettings({})); app.api.toggle(); app.frame();
    app.bridge.loadPreset = () => ({ label: id, scenario, presetKey: presetSettingsKey(id, baseSettings) });
    app.api.loadPreset(id); finishLoad(app);
    assert.equal(app.api.activePresetId, id);
    for (const [key, value, relevant] of [
      ["introductionDate", "2020-02-01", true],
      ["responseDays", 0, id !== "open-trade"],
      ["targetBudget", 5, ["hub-controls", "trade-bottlenecks"].includes(id)],
      ["standstillDays", 2, id === "temporary-standstill"],
    ]) {
      app.setSnapshot(atSettings({ [key]: value })); app.refresh(); app.frame();
      assert.equal(app.api.activePresetId, relevant ? null : id, `${id}: ${key}`);
    }
    let configured;
    app.bridge.setPresetSettings = (patch) => { configured = patch; };
    app.api.changePresetSettings({ responseDays: 3, standstillDays: 5 }); app.commit();
    assert.deepEqual(configured, { responseDays: 3, standstillDays: 5 });
    assert.equal(app.recomputing, false);
  }
});

test("the Open badge follows the applied introduction date", () => {
  const app = hook();
  const data = comparison({ ...openScenario, settings: { ...openScenario.settings, introductionDate: "2020-01-01" } });
  data.scenarioContext.presetSettings = { introductionDate: "2020-01-01", targetBudget: 3 };
  app.setSnapshot(data); app.api.toggle(); app.frame();
  assert.equal(app.api.activePresetId, "open-trade");
  app.setSnapshot({ ...data, scenarioContext: { ...data.scenarioContext,
    presetSettings: { introductionDate: "2020-04-01", targetBudget: 3 } } });
  app.refresh(); app.frame();
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
  const ring = { ...seedScenario, nodeInterventions: [[1578441600000, [["CR35", { exports: false }], ["CR02", { exports: false }]]]] };
  const configurations = { "seed-containment": seedScenario, "partner-ring": ring, "open-trade": openScenario, "temporary-standstill": openScenario };
  app.setSnapshot(comparison(openScenario)); app.api.toggle(); app.frame();
  app.bridge.loadPreset = (id) => {
    app.setSnapshot(comparison(configurations[id]));
    return { label: id, scenario: configurations[id] };
  };
  app.api.loadPreset("seed-containment"); finishLoad(app);
  app.bridge.captureScenario = () => seedScenario;
  app.api.saveScenario(0, "Saved seed"); app.commit();
  app.api.loadPreset("partner-ring"); finishLoad(app);
  assert.equal(app.api.activePresetId, "partner-ring");
  app.bridge.loadScenario = (scenario) => app.setSnapshot(comparison(scenario));
  app.api.loadScenario(0); finishLoad(app);
  assert.equal(app.api.activePresetId, "seed-containment");
  assert.equal(app.api.activeScenarioSlot, 0);
  for (const id of ["temporary-standstill", "open-trade", "temporary-standstill"]) {
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
