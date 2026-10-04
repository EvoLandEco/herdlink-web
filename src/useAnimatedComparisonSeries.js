import { useLayoutEffect, useMemo, useRef, useState } from "react";

export function canAnimateComparisonSeries(from, to, fromDomain, toDomain) {
  if (from.length !== to.length) return false;
  let changed = Boolean(fromDomain && toDomain &&
    (fromDomain.minimum !== toDomain.minimum || fromDomain.maximum !== toDomain.maximum));
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

export function interpolateComparisonSeries(from, to, progress, fromDomain, toDomain) {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  const minimum = fromDomain && toDomain ? fromDomain.minimum * (1 - progress) + toDomain.minimum * progress : 0;
  const maximum = fromDomain && toDomain ? fromDomain.maximum * (1 - progress) + toDomain.maximum * progress : 1;
  const interpolate = (before, after) => fromDomain && toDomain
    ? minimum + ((before - fromDomain.minimum) / (fromDomain.maximum - fromDomain.minimum) * (1 - progress)
      + (after - toDomain.minimum) / (toDomain.maximum - toDomain.minimum) * progress) * (maximum - minimum)
    : before * (1 - progress) + after * progress;
  return to.map((point, index) => ({
    ...point,
    original: Number.isFinite(point.original)
      ? interpolate(from[index].original, point.original) : point.original,
    intervention: Number.isFinite(point.intervention)
      ? interpolate(from[index].intervention, point.intervention) : point.intervention,
  }));
}

export function useAnimatedComparisonSeries(points, domain, active = true) {
  const visible = useRef({ points, domain });
  const [frame, setFrame] = useState({ points, domain });
  const animate = useMemo(() => active && visible.current.domain && domain &&
    canAnimateComparisonSeries(visible.current.points, points, visible.current.domain, domain), [points, domain, active]);

  useLayoutEffect(() => {
    const from = visible.current;
    const publish = (nextPoints, nextDomain) => {
      visible.current = { points: nextPoints, domain: nextDomain };
      setFrame(visible.current);
    };
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!animate || motion.matches) {
      publish(points, domain);
      return;
    }
    let request = null;
    const stop = () => {
      if (request !== null) cancelAnimationFrame(request);
      motion.removeEventListener("change", motionChanged);
    };
    const motionChanged = (event) => {
      if (event.matches) {
        stop();
        publish(points, domain);
      }
    };
    const start = performance.now();
    const step = (time) => {
      request = null;
      const progress = Math.max(0, Math.min(1, (time - start) / 650));
      const eased = 1 - (1 - progress) ** 3;
      publish(interpolateComparisonSeries(from.points, points, eased, from.domain, domain), {
        minimum: from.domain.minimum * (1 - eased) + domain.minimum * eased,
        maximum: from.domain.maximum * (1 - eased) + domain.maximum * eased,
      });
      if (progress < 1) request = requestAnimationFrame(step);
      else stop();
    };
    motion.addEventListener("change", motionChanged);
    request = requestAnimationFrame(step);
    return stop;
  }, [points, domain, active, animate]);

  return animate ? frame : { points, domain };
}
