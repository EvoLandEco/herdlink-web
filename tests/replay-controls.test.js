import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../public/assets/js/herdlink-runtime.js", import.meta.url), "utf8");
const extractFunction = (name) => {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
};
const handlers = source.match(/ {18}\/\/ Slider event\.[\s\S]*? {18}document.addEventListener\("keydown", fromStartKeyListener\);/)[0];

function replay(dateCount = 3) {
  const timers = new Map();
  let timerId = 0;
  const calls = [];
  const elements = {};
  for (const id of ["timeSlider", "playPauseBtn", "fromStartBtn"]) {
    const listeners = {};
    elements[id] = {
      addEventListener: (name, callback) => { listeners[name] = callback; },
      click() { listeners.click(); },
      min: 0, max: dateCount - 1, value: 0, disabled: false,
    };
  }
  const context = vm.createContext({
    window: { isPlaying: false },
    screenshotInProgress: false,
    simulationState: { status: "ready" },
    document: { getElementById: (id) => elements[id], addEventListener() {} },
    slider: elements.timeSlider, playPauseBtn: elements.playPauseBtn,
    fromStartBtn: elements.fromStartBtn, playInterval: null,
    uniqueDates: Array.from({ length: dateCount }, (_, i) => new Date(Date.UTC(2020, 0, i + 1))),
    data: [], loadedCSVData: [], controlTips: { play: "Play", pause: "Pause" },
    setControlTip: (button, tip) => { button.tip = tip; },
    setSimulationInputsDisabled: (disabled) => calls.push(["simulationInputs", disabled]),
    disableAllButtons: () => calls.push(["buttons", true]),
    disableAllCheckboxes: () => calls.push(["checkboxes", true]),
    enableAllButtons: () => calls.push(["buttons", false]),
    enableAllCheckboxes: () => calls.push(["checkboxes", false]),
    updateNetworkForDate: (date) => calls.push(["frame", date]),
    updateCurrentDateDisplay() {},
    setInterval: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearInterval: (id) => timers.delete(id),
  });
  vm.runInContext([extractFunction("setTimeReplayState"), extractFunction("handlesAppShortcut"), handlers].join("\n"), context);
  return { context, calls, timers, elements, tick: () => [...timers.values()].forEach((callback) => callback()) };
}

function key(key, onControl = false) {
  return {
    key, defaultPrevented: false, target: { closest: () => onControl ? {} : null },
    preventDefault() { this.defaultPrevented = true; },
  };
}

test("mouse replay locks edits and releases controls and its timer on the final frame", () => {
  const { context, calls, timers, elements, tick } = replay();
  elements.playPauseBtn.click();
  assert.equal(context.window.isPlaying, true);
  assert.equal(timers.size, 1);
  assert.deepEqual(calls, [["simulationInputs", true], ["buttons", true], ["checkboxes", true]]);

  tick();
  assert.equal(context.window.isPlaying, true);
  tick();
  assert.equal(elements.timeSlider.value, 2);
  assert.equal(context.window.isPlaying, false);
  assert.equal(context.playInterval, null);
  assert.equal(timers.size, 0);
  assert.equal(elements.playPauseBtn.tip, "Play");
  assert.deepEqual(calls.slice(-3), [["simulationInputs", false], ["buttons", false], ["checkboxes", false]]);
  assert.equal(calls.filter(([name]) => name === "frame").length, 2);

  elements.playPauseBtn.click();
  assert.equal(context.window.isPlaying, false);
  assert.equal(timers.size, 0);
});

test("mouse and keyboard pause both cancel replay without advancing another frame", () => {
  for (const pauseWithKeyboard of [false, true]) {
    const { context, calls, timers, elements, tick } = replay();
    elements.playPauseBtn.click();
    if (pauseWithKeyboard) {
      const event = key(" ");
      context.playPauseKeyListener(event);
      assert.equal(event.defaultPrevented, true);
    } else elements.playPauseBtn.click();
    tick();
    assert.equal(context.window.isPlaying, false);
    assert.equal(timers.size, 0);
    assert.equal(calls.some(([name]) => name === "frame"), false);
    assert.deepEqual(calls.slice(-3), [["simulationInputs", false], ["buttons", false], ["checkboxes", false]]);
  }
});

test("a one-date dataset never starts an idle replay interval", () => {
  const { context, timers, elements } = replay(1);
  elements.playPauseBtn.click();
  assert.equal(timers.size, 0);
  assert.equal(context.window.isPlaying, false);
});

test("stopping replay during a dataset load cancels the old timer without unlocking its controls", () => {
  const { context, calls, timers, elements, tick } = replay();
  elements.playPauseBtn.click();
  calls.length = 0;
  context.window.isSwitchingCSV = true;
  context.setTimeReplayState(false);
  tick();
  assert.equal(timers.size, 0);
  assert.equal(context.window.isPlaying, false);
  assert.deepEqual(calls, [["simulationInputs", true]]);
  context.window.isSwitchingCSV = false;
  context.setTimeReplayState(false);
  assert.deepEqual(calls.slice(-3), [["simulationInputs", false], ["buttons", false], ["checkboxes", false]]);
});

test("document shortcuts leave native slider, field, and button keys alone", () => {
  const { context, calls, elements } = replay();
  for (const [handler, value] of [["sliderKeyListener", "ArrowRight"], ["playPauseKeyListener", " "], ["fromStartKeyListener", "f"]]) {
    const event = key(value, true);
    context[handler](event);
    assert.equal(event.defaultPrevented, false);
  }
  assert.equal(elements.timeSlider.value, 0);
  assert.equal(context.window.isPlaying, false);
  assert.deepEqual(calls, []);

  const arrow = key("ArrowRight");
  context.sliderKeyListener(arrow);
  assert.equal(elements.timeSlider.value, 1);
  assert.equal(arrow.defaultPrevented, true);
  assert.equal(calls.filter(([name]) => name === "frame").length, 1);
  context.playPauseKeyListener({ ...key(" "), repeat: true });
  assert.equal(context.window.isPlaying, false);
});

test("screenshot capture prevents keyboard changes to the displayed date", () => {
  const { context, calls, elements } = replay();
  context.screenshotInProgress = true;
  context.sliderKeyListener(key("ArrowRight"));
  context.playPauseKeyListener(key(" "));
  context.fromStartKeyListener(key("f"));
  assert.equal(elements.timeSlider.value, 0);
  assert.equal(context.window.isPlaying, false);
  assert.deepEqual(calls, []);
});


test("pending unlock timers cannot enable controls during a dataset load", () => {
  const callbacks = [];
  const writes = [];
  const selection = new Proxy({}, { get: (_, method) => (...args) => { writes.push([method, ...args]); return selection; } });
  const context = vm.createContext({
    window: { isPlaying: false, isSwitchingCSV: false },
    simulationState: { status: "ready" }, appModeSwitchLocked: false, currentMode: "map",
    d3: { timeout: (callback) => callbacks.push(callback), select: () => selection, selectAll: () => selection },
  });
  vm.runInContext(["enableAllButtons", "enableAllCheckboxes"].map(extractFunction).join("\n"), context);
  context.enableAllButtons(550);
  context.enableAllCheckboxes(550);
  context.window.isSwitchingCSV = true;
  callbacks.forEach((callback) => callback());
  assert.deepEqual(writes, []);
  context.window.isSwitchingCSV = false;
  callbacks.forEach((callback) => callback());
  assert.ok(writes.length > 0);
});
