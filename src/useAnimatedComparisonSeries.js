import { useLayoutEffect, useMemo, useRef, useState } from "react";

export function canAnimateComparisonSeries(from, to) {
  if (from === to || from.length !== to.length) return false;
  let changed = false;
  for (let index = 0; index < to.length; index++) {
    if (from[index].date !== to[index].date) return false;
    for (const key of ["original", "intervention"]) {
      const before = from[index][key];
      const after = to[index][key];
      if (Number.isFinite(before) !== Number.isFinite(after)) return false;
      if (Number.isFinite(after) && before !== after) changed = true;
    }
  }
  return changed;
}

export function interpolateComparisonSeries(from, to, progress) {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  return to.map((point, index) => ({
    ...point,
    original: Number.isFinite(point.original)
      ? from[index].original * (1 - progress) + point.original * progress : point.original,
    intervention: Number.isFinite(point.intervention)
      ? from[index].intervention * (1 - progress) + point.intervention * progress : point.intervention,
  }));
}

export function useAnimatedComparisonSeries(points, identity, active = true) {
  const visible = useRef({ points, identity });
  const [framePoints, setFramePoints] = useState(points);
  const animate = useMemo(() => active && visible.current.identity === identity &&
    canAnimateComparisonSeries(visible.current.points, points), [points, identity, active]);

  useLayoutEffect(() => {
    const from = visible.current.points;
    visible.current.identity = identity;
    const publish = (next) => {
      visible.current.points = next;
      setFramePoints(next);
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!animate || motion.matches) {
      publish(points);
      return;
    }
    let frame = null;
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      motion.removeEventListener("change", motionChanged);
    };
    const motionChanged = (event) => {
      if (event.matches) {
        stop();
        publish(points);
      }
    };
    const start = performance.now();
    const step = (time) => {
      frame = null;
      const progress = Math.min(1, (time - start) / 650);
      publish(interpolateComparisonSeries(from, points, 1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(step);
      else stop();
    };
    motion.addEventListener("change", motionChanged);
    frame = requestAnimationFrame(step);
    return stop;
  }, [points, identity, active, animate]);

  return animate ? framePoints : points;
}
