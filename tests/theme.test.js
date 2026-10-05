import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/theme.js", import.meta.url), "utf8").replace(/^export /gm, "");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function setup() {
  const animations = [];
  const listeners = new Set();
  const preference = {
    matches: false,
    addEventListener: (type, listener) => { assert.equal(type, "change"); listeners.add(listener); },
    removeEventListener: (type, listener) => { assert.equal(type, "change"); listeners.delete(listener); },
  };
  const root = { dataset: { theme: "dark" }, animate: (...args) => animations.push(args) };
  const button = { closest: () => null, getBoundingClientRect: () => ({ left: 940, top: 540, width: 40, height: 40 }) };
  const context = {
    document: { documentElement: root, querySelectorAll: () => [] },
    window: { innerWidth: 1000, innerHeight: 600,
      matchMedia: (query) => query === "(prefers-color-scheme: dark)" ? preference : { matches: false } },
    localStorage: {
      getItem: () => assert.fail("Theme startup follows the system preference"),
      setItem: () => assert.fail("Manual theme changes stay within the page session"),
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, root, button, animations, preference, listeners };
}

test("light is the default and the system theme loads before styles", () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(html.includes('<html lang="en" data-theme="light">'));
  assert.ok(html.indexOf("prefers-color-scheme") < html.indexOf('rel="stylesheet"'));
  for (const dark of [false, true]) {
    const { context, root, preference } = setup();
    preference.matches = dark;
    vm.runInContext(script, context);
    assert.equal(root.dataset.theme, dark ? "dark" : "light");
  }
});

test("manual theme changes work without storage or View Transitions", async () => {
  const { context, root, button } = setup();
  const state = [];
  await context.toggleTheme(button, (theme) => state.push(theme));
  assert.equal(root.dataset.theme, "light");
  assert.deepEqual(state, ["light"]);
  await context.toggleTheme(button, (theme) => state.push(theme));
  assert.equal(root.dataset.theme, "dark");
  assert.deepEqual(state, ["light", "dark"]);
});

test("system changes update the page and button state after manual toggles and clean up on unmount", async () => {
  const { context, root, button, preference, listeners } = setup();
  const state = [];
  const onChange = (theme) => state.push(theme);
  const stop = context.followSystemTheme(onChange);
  assert.equal(root.dataset.theme, "light");
  assert.equal(listeners.size, 1);
  await context.toggleTheme(button, onChange);
  assert.equal(root.dataset.theme, "dark");
  for (const dark of [true, false, true]) {
    preference.matches = dark;
    for (const listener of listeners) listener();
    assert.equal(root.dataset.theme, dark ? "dark" : "light");
    assert.equal(state.at(-1), root.dataset.theme);
  }
  stop();
  assert.equal(listeners.size, 0);
});

test("a system change takes precedence over a pending manual transition", async () => {
  const { context, root, button, preference, listeners } = setup();
  const state = [];
  const onChange = (theme) => state.push(theme);
  const stop = context.followSystemTheme(onChange);
  await context.toggleTheme(button, onChange);
  assert.equal(root.dataset.theme, "dark");
  let applyPending, rejectReady, finishUpdate, finishTransition, skipped = 0;
  context.document.startViewTransition = (apply) => {
    applyPending = apply;
    return {
      ready: new Promise((_, reject) => { rejectReady = reject; }),
      updateCallbackDone: new Promise((resolve) => { finishUpdate = resolve; }),
      finished: new Promise((resolve) => { finishTransition = resolve; }),
      skipTransition: () => { skipped++; rejectReady(new Error("System theme changed")); },
    };
  };
  const pending = context.toggleTheme(button, onChange);
  preference.matches = true;
  for (const listener of listeners) listener();
  applyPending();
  finishUpdate();
  finishTransition();
  await pending;
  assert.equal(skipped, 1);
  assert.equal(root.dataset.theme, "dark");
  assert.equal(state.at(-1), "dark");
  delete context.document.startViewTransition;
  await context.toggleTheme(button, onChange);
  assert.equal(root.dataset.theme, "light");
  stop();
});

test("reduced motion applies the theme immediately", async () => {
  const { context, root, button, animations } = setup();
  context.window.matchMedia = () => ({ matches: true });
  context.document.startViewTransition = () => assert.fail("Reduced motion must not create a transition");
  await context.toggleTheme(button, () => {});
  assert.equal(root.dataset.theme, "light");
  assert.equal(animations.length, 0);
});

test("the circle covers the farthest corner and rapid clicks do not overlap transitions", async () => {
  const { context, root, button, animations } = setup();
  let finish;
  context.document.startViewTransition = (apply) => {
    apply();
    return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: new Promise((resolve) => { finish = resolve; }) };
  };
  const first = context.toggleTheme(button, () => {});
  await context.toggleTheme(button, () => {});
  assert.equal(root.dataset.theme, "light");
  assert.equal(animations.length, 1);
  const [frames, timing] = animations[0];
  assert.deepEqual(Array.from(frames.clipPath), ["circle(0px at 960px 560px)", `circle(${Math.hypot(960, 560)}px at 960px 560px)`]);
  assert.equal(timing.duration, 400);
  assert.equal(timing.easing, "ease-in-out");
  assert.equal(timing.pseudoElement, "::view-transition-new(root)");
  finish();
  await first;
  const second = context.toggleTheme(button, () => {});
  finish();
  await second;
  assert.equal(root.dataset.theme, "dark");
  assert.equal(animations.length, 2);
});

test("a skipped browser transition retains its theme and releases the next switch", async () => {
  const { context, root, button, animations } = setup();
  context.document.startViewTransition = (apply) => {
    apply();
    return { ready: Promise.reject(new Error("Transition skipped")), updateCallbackDone: Promise.resolve(), finished: Promise.resolve() };
  };
  await context.toggleTheme(button, () => {});
  assert.equal(root.dataset.theme, "light");
  assert.equal(animations.length, 0);
  delete context.document.startViewTransition;
  await context.toggleTheme(button, () => {});
  assert.equal(root.dataset.theme, "dark");
});

test("T shortcut respects typing, key combinations, repeating keys, inert content and dialogs", () => {
  const { context, button } = setup();
  const event = { key: "t", target: { closest: () => null } };
  assert.equal(context.isThemeShortcut(event, button), true);
  assert.equal(context.isThemeShortcut({ ...event, key: "T", shiftKey: true }, button), true);
  assert.equal(context.isThemeShortcut({ ...event, key: "s" }, button), false);
  for (const flag of ["defaultPrevented", "repeat", "isComposing", "altKey", "ctrlKey", "metaKey"]) {
    assert.equal(context.isThemeShortcut({ ...event, [flag]: true }, button), false, flag);
  }
  assert.equal(context.isThemeShortcut({ ...event, target: { closest: () => ({}) } }, button), false);
  button.closest = () => ({});
  assert.equal(context.isThemeShortcut(event, button), false);
  button.closest = () => null;
  context.document.querySelectorAll = (selector) => {
    assert.equal(selector, 'dialog:modal, [aria-modal="true"]');
    return [{ closest: () => null, getClientRects: () => [{}] }];
  };
  assert.equal(context.isThemeShortcut(event, button), false);
  context.document.querySelectorAll = () => [{ closest: () => ({}), getClientRects: () => [{}] }];
  assert.equal(context.isThemeShortcut(event, button), true);
  context.document.querySelectorAll = () => [{ closest: () => null, getClientRects: () => [] }];
  assert.equal(context.isThemeShortcut(event, button), true);
});
