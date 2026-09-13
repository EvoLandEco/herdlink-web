import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const hookSource = readFileSync(new URL("../src/useComparison.js", import.meta.url), "utf8");
const runtimeSource = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");

function extractFunction(source, name) {
  const match = source.replace(/^export /gm, "").match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Function ${name} exists`);
  return match[0];
}

function target(...selectors) {
  return { closest: (query) => query.split(", ").some((selector) => selectors.includes(selector)) ? {} : null };
}

function key(key, element = target(), properties = {}) {
  return { key, target: element, ...properties };
}

const comparisonShortcut = vm.runInNewContext(`${extractFunction(hookSource, "isComparisonShortcut")}; isComparisonShortcut;`);
const nativeControls = [
  target("input", "input:not([type='range'])"),
  target("input"),
  target("select"),
  target("textarea"),
  target("[contenteditable]:not([contenteditable='false'])"),
];

test("comparison letters work on the canvas and focused buttons", () => {
  for (const element of [target(), target("button"), target("[role='button']"), target("[role='switch']")]) {
    for (const value of ["c", "C", "e", "E"]) {
      assert.equal(comparisonShortcut(key(value, element)), true);
    }
    for (const value of ["h", "m", " ", "Enter", "Escape", "ArrowRight"]) {
      assert.equal(comparisonShortcut(key(value, element)), false);
    }
  }
  assert.equal(comparisonShortcut(key("C", target(), { shiftKey: true })), true);
});

test("comparison shortcuts leave native controls, composing text and modified keys alone", () => {
  for (const element of nativeControls) {
    for (const value of ["c", "C", "e", "E"]) {
      assert.equal(comparisonShortcut(key(value, element)), false);
    }
  }
  for (const flag of ["defaultPrevented", "repeat", "isComposing", "altKey", "ctrlKey", "metaKey"]) {
    for (const value of ["c", "e"]) {
      assert.equal(comparisonShortcut(key(value, target(), { [flag]: true })), false, flag);
    }
  }
});

test("an open comparison blocks runtime actions and help without stealing native control keys", () => {
  let comparisonOpen = true;
  let screenBlocked = false;
  const context = vm.createContext({
    document: { getElementById: () => ({ closest: () => screenBlocked ? {} : null }) },
    window: { isComparisonOverlayOpen: () => comparisonOpen },
    screenshotInProgress: false,
  });
  vm.runInContext([
    extractFunction(runtimeSource, "handlesAppShortcut"),
    extractFunction(runtimeSource, "isIntroToggleShortcut"),
  ].join("\n"), context);

  for (const value of ["m", "e", "s", "r", "q", "f", " ", "ArrowLeft", "ArrowRight"]) {
    assert.equal(context.handlesAppShortcut(key(value)), false);
  }
  assert.equal(context.isIntroToggleShortcut(key("h")), false);
  assert.equal(context.isIntroToggleShortcut(key("H", target("button"))), false);

  comparisonOpen = false;
  assert.equal(context.handlesAppShortcut(key("m", target("button"))), true);
  assert.equal(context.isIntroToggleShortcut(key("h", target("button"))), true);
  for (const element of nativeControls) {
    assert.equal(context.handlesAppShortcut(key("e", element)), false);
    assert.equal(context.handlesAppShortcut(key("ArrowRight", element)), false);
  }
  for (const element of [target("button"), target("[role='button']"), target("[role='switch']")]) {
    assert.equal(context.handlesAppShortcut(key(" ", element)), false);
    assert.equal(context.handlesAppShortcut(key("Enter", element)), false);
  }

  screenBlocked = true;
  assert.equal(context.handlesAppShortcut(key("m")), false);
  assert.equal(context.isIntroToggleShortcut(key("h")), false);
});

test("opening waits for runtime registration, respects capture and viewport locks, and closes visible help", () => {
  function hook({ supported = true, inert = false, canOpen = true, helpOpen = false, runtimeReady = true } = {}) {
    const state = [];
    const calls = [];
    const bridge = {
      canOpen: () => canOpen,
      prepare: () => calls.push("prepare"),
    };
    const context = vm.createContext({
      useState: (value) => {
        const slot = { value };
        state.push(slot);
        return [value, (value) => { slot.value = value; }];
      },
      useCallback: (callback) => callback,
      useRef: (current) => ({ current }),
      useEffect() {},
      document: { getElementById: () => ({ closest: () => inert ? {} : null }) },
      window: {
        herdlinkComparison: runtimeReady ? bridge : undefined,
        isIntroOverlayOpen: () => helpOpen,
        closeIntroOverlay: () => calls.push("close help"),
        dispatchEvent: (event) => calls.push(event.type),
      },
      Event,
    });
    vm.runInContext(extractFunction(hookSource, "useComparison"), context);
    return { api: context.useComparison(supported), state, calls, bridge, window: context.window };
  }

  for (const lock of [{ supported: false }, { inert: true }, { canOpen: false }, { runtimeReady: false }]) {
    const app = hook(lock);
    app.api.toggle();
    assert.equal(app.state[0].value, false);
    assert.deepEqual(app.calls, []);
  }
  for (const helpOpen of [false, true]) {
    const app = hook({ helpOpen });
    app.api.toggle();
    assert.equal(app.state[0].value, true);
    assert.deepEqual(app.calls, [
      ...(helpOpen ? ["close help"] : []), "prepare", "herdlink:comparison-change",
    ]);
    app.bridge.canOpen = () => false;
    app.api.toggle();
    assert.equal(app.state[0].value, false);
  }

  const loading = hook({ runtimeReady: false, helpOpen: true });
  loading.api.toggle();
  assert.equal(loading.state[0].value, false);
  assert.deepEqual(loading.calls, []);
  loading.window.herdlinkComparison = loading.bridge;
  loading.api.toggle();
  assert.equal(loading.state[0].value, true);
  assert.deepEqual(loading.calls, ["close help", "prepare", "herdlink:comparison-change"]);
  delete loading.window.herdlinkComparison;
  loading.api.toggle();
  assert.equal(loading.state[0].value, false);
});
