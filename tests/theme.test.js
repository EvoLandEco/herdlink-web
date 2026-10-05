import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/theme.js", import.meta.url), "utf8").replace(/^export /gm, "");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function setup() {
  const animations = [];
  const saved = new Map();
  const root = { dataset: { theme: "dark" }, animate: (...args) => animations.push(args) };
  const button = { closest: () => null, getBoundingClientRect: () => ({ left: 940, top: 540, width: 40, height: 40 }) };
  const context = {
    document: { documentElement: root, querySelectorAll: () => [] },
    window: { innerWidth: 1000, innerHeight: 600, matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, root, button, animations, saved };
}

test("saved light theme loads before styles; unknown or inaccessible storage keeps dark", () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(html.includes('<html lang="en" data-theme="dark">'));
  assert.ok(html.indexOf("herdlink-theme") < html.indexOf('rel="stylesheet"'));
  for (const stored of ["light", "dark", "other", undefined]) {
    const { context, root, saved } = setup();
    saved.set("herdlink-theme", stored);
    vm.runInContext(script, context);
    assert.equal(root.dataset.theme, stored === "light" ? "light" : "dark");
  }
  const { context, root } = setup();
  context.localStorage.getItem = () => { throw new Error("Storage blocked"); };
  vm.runInContext(script, context);
  assert.equal(root.dataset.theme, "dark");
});

test("theme changes persist without requiring View Transitions", async () => {
  const { context, root, button, saved } = setup();
  const state = [];
  await context.toggleTheme(button, (theme) => state.push(theme));
  assert.equal(root.dataset.theme, "light");
  assert.equal(saved.get("herdlink-theme"), "light");
  assert.deepEqual(state, ["light"]);
  context.localStorage.setItem = () => { throw new Error("Storage blocked"); };
  await context.toggleTheme(button, (theme) => state.push(theme));
  assert.equal(root.dataset.theme, "dark");
  assert.deepEqual(state, ["light", "dark"]);
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
