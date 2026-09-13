import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../src/runtime/herdlink-runtime.js", import.meta.url), "utf8");
const overlaySource = source.match(/\/\/ Intro overlay\s+(\(\(\) => \{[\s\S]*?\n          \}\)\(\);)/)[1];

function extractFunction(name) {
  const match = source.match(new RegExp(`^([ ]*)function ${name}\\([^]*?^\\1}`, "m"));
  assert.ok(match, `Runtime function ${name} exists`);
  return match[0];
}

function runtime({ blocked = false } = {}) {
  const elements = {};
  const drawnLines = [];
  const frames = new Map();
  const windowListeners = {};
  let keyboardBuilds = 0;
  let resize;
  let frameId = 0;
  const document = {
    getElementById: (id) => elements[id],
    querySelector: (selector) => elements[selector.slice(1)],
  };
  function element(id, inside = true) {
    const classes = new Set();
    return elements[id] = {
      id, inside, isConnected: true, tabIndex: 0, hidden: false,
      style: {}, listeners: {}, attributes: {},
      bounds: { left: 40, top: 24 }, clientWidth: 920, clientHeight: 450,
      classList: {
        add: (value) => classes.add(value),
        remove: (value) => classes.delete(value),
        contains: (value) => classes.has(value),
      },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      focus() { document.activeElement = this; },
      getClientRects() { return this.hidden ? [] : [{}]; },
      getBoundingClientRect() { return this.bounds; },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      closest() { return null; },
    };
  }
  document.body = element("body", false);
  const opener = element("opener", false);
  const overlay = element("introOverlay");
  const main = element("mainContainer", false);
  main.inert = blocked;
  overlay.closest = main.closest = () => main.inert ? main : null;
  overlay.contains = (target) => target.inside;
  const guide = element("introGuidePage");
  const pages = element("introPages");
  const clip = element("introConnectorClipRect");
  const pageSwitch = element("introPageSwitch");
  const nodeButton = element("nodeButton");
  const range = element("range");
  range.closest = (selector) => selector.includes("input:not") ? null : range;
  const closeButton = element("introOkButton");
  const help = element("helpOverlayButton", false);
  help.closest = (selector) => selector.split(", ").includes("button") ? help : null;
  const controls = [pageSwitch, nodeButton, range, closeButton];
  overlay.querySelectorAll = () => controls;
  document.activeElement = opener;
  element("introKeyboard");
  for (const suffix of ["S", "E", "M", "Q", "H", "C", "R", "F", "Space", "Arrows"]) {
    element(`introDot${suffix}`);
  }
  const context = vm.createContext({
    document, screenshotInProgress: false, theme: {},
    window: {
      scrollX: 0, scrollY: 0,
      addEventListener: (name, callback) => { windowListeners[name] = callback; },
      SimpleKeyboard: { default: class {
        constructor() { keyboardBuilds += 1; }
        getButtonElement() { return {}; }
      } },
    },
    LeaderLine: class {
      constructor() { this.removed = false; this.positions = 0; drawnLines.push(this); }
      show() {}
      position() { this.positions += 1; }
      remove() { this.removed = true; }
    },
    ResizeObserver: class {
      constructor(callback) { resize = callback; }
      observe() {}
    },
    requestAnimationFrame: (callback) => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  vm.runInContext([
    extractFunction("handlesAppShortcut"), extractFunction("isIntroToggleShortcut"),
    extractFunction("handleIntroKeydown"), overlaySource,
  ].join("\n"), context);
  return {
    context, document, overlay, main, guide, pages, clip, controls, opener, help, pageSwitch, range,
    drawnLines, frames, windowListeners,
    liveLines: () => drawnLines.filter((line) => !line.removed),
    keyboardBuilds: () => keyboardBuilds,
    resize: () => resize(),
    changePage: () => windowListeners["herdlink:intro-page-change"](),
  };
}

function key(value, target, extra = {}) {
  return {
    key: value, target, defaultPrevented: false, stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...extra,
  };
}

test("guide connectors follow page visibility and reuse the keyboard", () => {
  const app = runtime();
  assert.equal(app.liveLines().length, 13);
  const initialPositions = app.liveLines()[0].positions;
  app.resize();
  assert.equal(app.liveLines()[0].positions, initialPositions + 1);

  app.guide.hidden = true;
  app.changePage();
  assert.equal(app.liveLines().length, 0);
  app.context.window.closeIntroOverlay();
  app.context.window.openIntroOverlay();
  assert.equal(app.liveLines().length, 0);

  app.guide.hidden = false;
  app.changePage();
  assert.equal(app.liveLines().length, 13);
  assert.equal(app.keyboardBuilds(), 1);
  app.context.window.closeIntroOverlay();
  app.changePage();
  assert.equal(app.liveLines().length, 0);
});

test("opening help focuses its switch and closing restores the opener", () => {
  const app = runtime();
  assert.equal(app.document.activeElement, app.pageSwitch);
  assert.equal(app.overlay.inert, false);
  app.context.window.closeIntroOverlay();
  assert.equal(app.overlay.inert, true);
  assert.equal(app.document.activeElement, app.opener);

  app.document.activeElement = app.document.body;
  app.context.window.openIntroOverlay();
  app.context.window.closeIntroOverlay();
  assert.equal(app.document.activeElement, app.help);
  assert.equal(app.context.isIntroToggleShortcut(key("h", app.help)), true);
  for (const value of ["m", "e", "s", "r", "q", "f", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    assert.equal(app.context.handlesAppShortcut(key(value, app.document.activeElement)), true);
  }
  for (const value of [" ", "Enter"]) {
    assert.equal(app.context.handlesAppShortcut(key(value, app.help)), false);
  }
  assert.equal(app.context.handlesAppShortcut(key(" ", app.document.body)), true);
  assert.equal(app.context.handlesAppShortcut(key("m", app.help, { ctrlKey: true })), false);
  assert.equal(app.context.handlesAppShortcut(key("ArrowRight", app.range)), false);
});

test("screen access initializes a visible guide and preserves dismissed help", () => {
  const app = runtime({ blocked: true });
  const screenAccessChanged = app.windowListeners["herdlink:screen-access-change"];
  assert.equal(app.keyboardBuilds(), 0);
  assert.equal(app.liveLines().length, 0);

  app.main.inert = false;
  screenAccessChanged();
  assert.equal(app.keyboardBuilds(), 1);
  assert.equal(app.liveLines().length, 13);

  app.main.inert = true;
  screenAccessChanged();
  assert.equal(app.liveLines().length, 0);
  app.main.inert = false;
  screenAccessChanged();
  assert.equal(app.keyboardBuilds(), 1);
  assert.equal(app.liveLines().length, 13);

  app.context.window.closeIntroOverlay();
  app.main.inert = true;
  screenAccessChanged();
  app.main.inert = false;
  screenAccessChanged();
  assert.equal(app.context.window.isIntroOverlayOpen(), false);
  assert.equal(app.liveLines().length, 0);
});

test("connector clipping follows the visible page bounds during scrolling and resizing", () => {
  const app = runtime();
  assert.deepEqual(app.clip.attributes, { x: "40", y: "24", width: "920", height: "450" });
  app.pages.bounds = { left: 60, top: 32 };
  app.pages.clientWidth = 850;
  app.pages.clientHeight = 360;
  app.context.window.scrollX = 5;
  app.context.window.scrollY = 80;
  app.overlay.listeners.scroll();
  assert.deepEqual(app.clip.attributes, { x: "65", y: "112", width: "850", height: "360" });
  app.pages.clientHeight = 300;
  app.resize();
  assert.equal(app.clip.attributes.height, "300");
});

test("native illustration controls receive their keys while app shortcuts stay blocked", () => {
  const app = runtime();
  for (const value of ["ArrowLeft", "ArrowRight", " ", "Enter", "s", "f"]) {
    const event = key(value, app.range);
    app.context.handleIntroKeydown(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, false);
    assert.equal(app.context.handlesAppShortcut(event), false);
  }
  assert.equal(app.context.handlesAppShortcut(key("s", app.overlay)), false);
  app.context.window.closeIntroOverlay();
  assert.equal(app.context.handlesAppShortcut(key("s", app.overlay)), true);
});

test("Tab wraps through visible dialog controls and excludes hidden lesson controls", () => {
  const app = runtime();
  const last = app.controls.at(-1);
  last.focus();
  const forward = key("Tab", last);
  app.context.handleIntroKeydown(forward);
  assert.equal(forward.defaultPrevented, true);
  assert.equal(app.document.activeElement, app.pageSwitch);

  last.hidden = true;
  const backward = key("Tab", app.pageSwitch, { shiftKey: true });
  app.context.handleIntroKeydown(backward);
  assert.equal(backward.defaultPrevented, true);
  assert.equal(app.document.activeElement, app.range);

  app.pageSwitch.focus();
  const middle = key("Tab", app.pageSwitch);
  app.context.handleIntroKeydown(middle);
  assert.equal(middle.defaultPrevented, false);
});

test("H and Escape close help without consuming modified or repeated H keys", () => {
  for (const value of ["h", "H", "Escape"]) {
    const app = runtime();
    const event = key(value, app.range);
    app.context.handleIntroKeydown(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
    assert.equal(app.context.window.isIntroOverlayOpen(), false);
  }
  for (const extra of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }, { repeat: true }]) {
    const app = runtime();
    const event = key("h", app.range, extra);
    app.context.handleIntroKeydown(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(app.context.window.isIntroOverlayOpen(), true);
  }
});

test("connector positioning tracks the slide animation and stops on dismissal", () => {
  const app = runtime();
  app.overlay.listeners.animationstart({ animationName: "contentSlideIn" });
  assert.equal(app.frames.size, 1);
  app.overlay.listeners.animationend({ animationName: "contentSlideIn" });
  assert.equal(app.frames.size, 0);
  app.overlay.listeners.animationstart({ animationName: "contentSlideIn" });
  app.context.window.closeIntroOverlay();
  assert.equal(app.frames.size, 0);
  assert.equal(app.liveLines().length, 0);
});

test("screen notices leave the hidden app and help keyboard handlers inactive", () => {
  const app = runtime();
  app.overlay.closest = app.main.closest = () => ({});
  assert.equal(app.context.window.isIntroOverlayOpen(), false);
  assert.equal(app.context.handlesAppShortcut(key("m", app.document.body)), false);
  assert.equal(app.context.isIntroToggleShortcut(key("h", app.document.body)), false);
  const event = key("Tab", app.document.body);
  app.context.handleIntroKeydown(event);
  assert.equal(event.defaultPrevented, false);
});
