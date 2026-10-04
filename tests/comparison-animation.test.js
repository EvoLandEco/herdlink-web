import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { canAnimateComparisonSeries, interpolateComparisonSeries } from "../src/useAnimatedComparisonSeries.js";

const points = (value) => [
  { date: "2020-01-01", original: value, intervention: value / 2 },
  { date: "2020-01-03", original: null, intervention: value },
];

test("series transitions preserve missing data and require matching recorded dates", () => {
  const from = points(0);
  const to = points(10);
  const saved = structuredClone([from, to]);
  assert.equal(canAnimateComparisonSeries(from, to), true);
  assert.equal(canAnimateComparisonSeries(from, points(0)), false);
  assert.equal(canAnimateComparisonSeries(from, to.slice(1)), false);
  assert.equal(canAnimateComparisonSeries(from, [to[0], { ...to[1], date: "2020-01-04" }]), false);
  assert.equal(canAnimateComparisonSeries(from, [to[0], { ...to[1], original: 1 }]), false);
  assert.deepEqual(interpolateComparisonSeries(from, to, 0.5), points(5));
  assert.equal(interpolateComparisonSeries(from, to, 0), from);
  assert.equal(interpolateComparisonSeries(from, to, 1), to);
  assert.deepEqual([from, to], saved);
});

test("metric changes interpolate curve positions and axes across different units", () => {
  const from = points(500), to = points(0.002);
  const fromDomain = { minimum: -100, maximum: 1000 };
  const toDomain = { minimum: 0, maximum: 0.01 };
  const halfway = interpolateComparisonSeries(from, to, 0.5, fromDomain, toDomain);
  const domain = { minimum: -50, maximum: 500.005 };
  const position = (value, range) => (value - range.minimum) / (range.maximum - range.minimum);
  for (const key of ["original", "intervention"]) {
    const expected = (position(from[0][key], fromDomain) + position(to[0][key], toDomain)) / 2;
    assert.ok(Math.abs(position(halfway[0][key], domain) - expected) < 1e-12);
  }
  assert.equal(halfway[1].original, null);
  assert.equal(canAnimateComparisonSeries(from, from, fromDomain, toDomain), true);
  assert.equal(interpolateComparisonSeries(from, to, 1, fromDomain, toDomain), to);
});

function animation() {
  const slots = [];
  const frames = new Map();
  const listeners = new Set();
  const motion = { matches: false, addEventListener: (_, callback) => listeners.add(callback), removeEventListener: (_, callback) => listeners.delete(callback) };
  let cursor = 0;
  let nextFrame = 0;
  let time = 0;
  let effects = [];
  let args;
  let currentFrame;
  const changed = (before, after) => !before || after.some((value, index) => !Object.is(value, before[index]));
  const context = vm.createContext({
    canAnimateComparisonSeries, interpolateComparisonSeries,
    useRef: (current) => { const index = cursor++; return slots[index] ||= { current }; },
    useState: (value) => {
      const index = cursor++;
      slots[index] ||= { value };
      return [slots[index].value, (next) => { slots[index].value = next; }];
    },
    useMemo: (calculate, deps) => {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) slots[index] = { value: calculate(), deps };
      return slots[index].value;
    },
    useLayoutEffect: (effect, deps) => {
      const index = cursor++;
      if (changed(slots[index]?.deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { cleanup: effect(), deps };
      });
    },
    window: { matchMedia: () => motion },
    performance: { now: () => time },
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id),
  });
  const source = readFileSync(new URL("../src/useAnimatedComparisonSeries.js", import.meta.url), "utf8");
  vm.runInContext(source.slice(source.indexOf("export function useAnimatedComparisonSeries")).replace("export ", ""), context);
  const render = (...nextArgs) => {
    if (nextArgs.length) args = nextArgs;
    cursor = 0;
    const result = context.useAnimatedComparisonSeries(...args);
    currentFrame = result;
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
    return pending.length ? render() : result.points;
  };
  return {
    render, frames, listeners,
    get domain() { return currentFrame.domain; },
    tick(nextTime) {
      time = nextTime;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(time));
      return render();
    },
    reduceMotion() { motion.matches = true; [...listeners].forEach((callback) => callback(motion)); return render(); },
    unmount() { slots.forEach((slot) => slot.cleanup?.()); },
  };
}

test("an animation frame dated before its start keeps the starting scale", () => {
  const app = animation();
  const fromDomain = { minimum: 0, maximum: 0.01 };
  const toDomain = { minimum: 0, maximum: 1000 };
  app.render(points(0.002), fromDomain);
  app.render(points(500), toDomain);
  assert.equal(app.tick(-5)[0].original, 0.002);
  assert.equal(app.domain.maximum, 0.01);
  assert.equal(app.tick(650)[0].original, 500);
  assert.equal(app.domain.maximum, 1000);
  app.unmount();
});

test("interrupted transitions continue from visible values across domains and respect active state and reduced motion", () => {
  const domain = { minimum: 0, maximum: 100 };
  const regionalDomain = { minimum: -100, maximum: 100 };
  const app = animation();
  assert.equal(app.render(points(0), domain)[0].original, 0);
  assert.equal(app.render(points(10), domain)[0].original, 0);
  assert.equal(app.tick(325)[0].original, 8.75);
  assert.equal(app.render(points(20), domain)[0].original, 8.75);
  assert.equal(app.frames.size, 1);
  assert.equal(app.tick(975)[0].original, 20);
  assert.equal(app.frames.size, 0);
  assert.equal(app.listeners.size, 0);

  app.render(points(30), domain);
  assert.equal(app.render(points(30), domain, false)[0].original, 30);
  assert.equal(app.frames.size, 0);
  app.render(points(40), domain, true);
  assert.equal(app.frames.size, 1);
  assert.equal(app.render(points(50), regionalDomain)[0].original, 30);
  assert.equal(app.frames.size, 1);
  assert.equal(app.tick(1625)[0].original, 50);
  assert.equal(app.frames.size, 0);

  app.render(points(60), regionalDomain);
  assert.equal(app.reduceMotion()[0].original, 60);
  assert.equal(app.frames.size, 0);
  assert.equal(app.listeners.size, 0);
  assert.equal(app.render(points(70), regionalDomain)[0].original, 70);
  assert.equal(app.frames.size, 0);

  const closing = animation();
  closing.render(points(0), domain);
  closing.render(points(10), domain);
  closing.unmount();
  assert.equal(closing.frames.size, 0);
  assert.equal(closing.listeners.size, 0);
});
