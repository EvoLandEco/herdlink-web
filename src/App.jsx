import { useEffect } from "react";
import { IntroOverlay } from "./components/IntroOverlay";
import { LeftPanel } from "./components/LeftPanel";
import { NetworkPanel } from "./components/NetworkPanel";
import { RightPanel } from "./components/RightPanel";

const basePath = import.meta.env.BASE_URL;

const runtimeScripts = [
  { src: "https://d3js.org/d3.v6.min.js" },
  { src: `${basePath}assets/js/jLouvain.js` },
  { src: "https://cdnjs.cloudflare.com/ajax/libs/vivus/0.3.1/vivus.min.js" },
  { src: `${basePath}assets/js/savesvg.js` },
  { src: `${basePath}assets/js/d3anno.js` },
  { src: "https://unpkg.com/simple-keyboard@latest/build/index.js" },
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/leader-line/1.0.6/leader-line.min.js",
  },
  { src: `${basePath}assets/js/herdlink-runtime.js` },
];

const scriptLoaders = new Map();
const tooltipGap = 10;
const tooltipMargin = 8;
const oppositePlacements = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};

function loadRuntimeScript({ src, crossOrigin }) {
  const existing = document.querySelector(`script[data-herdlink-src="${src}"]`);

  if (existing?.dataset.loaded === "true") {
    return Promise.resolve(existing);
  }

  if (scriptLoaders.has(src)) {
    return scriptLoaders.get(src);
  }

  const loader = new Promise((resolve, reject) => {
    const script = existing || document.createElement("script");

    const handleLoad = () => {
      script.dataset.loaded = "true";
      scriptLoaders.delete(src);
      resolve(script);
    };

    const handleError = () => {
      scriptLoaders.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    if (!existing) {
      script.src = src;
      script.async = false;
      script.dataset.herdlinkSrc = src;
      if (crossOrigin) {
        script.crossOrigin = crossOrigin;
      }
      document.head.appendChild(script);
    }
  });

  scriptLoaders.set(src, loader);
  return loader;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getTipTarget(event) {
  if (!(event.target instanceof Element)) {
    return null;
  }

  return event.target.closest(".has-tip[data-tip]");
}

function getPlacementQueue(placement) {
  return [
    placement,
    oppositePlacements[placement],
    "top",
    "bottom",
    "right",
    "left",
  ].filter((item, index, list) => item && list.indexOf(item) === index);
}

function getTooltipPosition(targetRect, tooltipRect, placement) {
  if (placement === "bottom") {
    return {
      left: targetRect.left + targetRect.width / 2 - tooltipRect.width / 2,
      top: targetRect.bottom + tooltipGap,
    };
  }

  if (placement === "left") {
    return {
      left: targetRect.left - tooltipRect.width - tooltipGap,
      top: targetRect.top + targetRect.height / 2 - tooltipRect.height / 2,
    };
  }

  if (placement === "right") {
    return {
      left: targetRect.right + tooltipGap,
      top: targetRect.top + targetRect.height / 2 - tooltipRect.height / 2,
    };
  }

  return {
    left: targetRect.left + targetRect.width / 2 - tooltipRect.width / 2,
    top: targetRect.top - tooltipRect.height - tooltipGap,
  };
}

function isTooltipOnScreen(position, tooltipRect) {
  return (
    position.left >= tooltipMargin &&
    position.top >= tooltipMargin &&
    position.left + tooltipRect.width <= window.innerWidth - tooltipMargin &&
    position.top + tooltipRect.height <= window.innerHeight - tooltipMargin
  );
}

export default function App() {
  useEffect(() => {
    const tooltip = document.getElementById("herdlinkTooltip");
    let activeTarget = null;

    if (!tooltip) {
      return undefined;
    }

    const placeTooltip = () => {
      if (!activeTarget) {
        return;
      }

      const targetRect = activeTarget.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const preferredPlacement = activeTarget.dataset.tipPlacement || "top";
      const placements = getPlacementQueue(preferredPlacement);
      const chosenPosition =
        placements
          .map((placement) =>
            getTooltipPosition(targetRect, tooltipRect, placement),
          )
          .find((position) => isTooltipOnScreen(position, tooltipRect)) ||
        getTooltipPosition(targetRect, tooltipRect, preferredPlacement);

      const maxLeft = window.innerWidth - tooltipRect.width - tooltipMargin;
      const maxTop = window.innerHeight - tooltipRect.height - tooltipMargin;

      tooltip.style.left = `${clamp(
        chosenPosition.left,
        tooltipMargin,
        maxLeft,
      )}px`;
      tooltip.style.top = `${clamp(
        chosenPosition.top,
        tooltipMargin,
        maxTop,
      )}px`;
    };

    const showTooltip = (target) => {
      const tip = target.dataset.tip;

      if (!tip) {
        return;
      }

      activeTarget = target;
      tooltip.textContent = tip;
      tooltip.classList.add("is-visible");
      tooltip.setAttribute("aria-hidden", "false");
      placeTooltip();
    };

    const hideTooltip = () => {
      activeTarget = null;
      tooltip.classList.remove("is-visible");
      tooltip.setAttribute("aria-hidden", "true");
    };

    const handlePointerOver = (event) => {
      const target = getTipTarget(event);

      if (target) {
        showTooltip(target);
      }
    };

    const handlePointerOut = (event) => {
      if (
        activeTarget &&
        event.relatedTarget instanceof Node &&
        activeTarget.contains(event.relatedTarget)
      ) {
        return;
      }

      hideTooltip();
    };

    const handleFocusIn = (event) => {
      const target = getTipTarget(event);

      if (target) {
        showTooltip(target);
      }
    };

    document.addEventListener("pointerover", handlePointerOver);
    document.addEventListener("pointerout", handlePointerOut);
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", hideTooltip);
    window.addEventListener("resize", placeTooltip);
    window.addEventListener("scroll", placeTooltip, true);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", hideTooltip);
      window.removeEventListener("resize", placeTooltip);
      window.removeEventListener("scroll", placeTooltip, true);
    };
  }, []);

  useEffect(() => {
    let frameId = null;
    let cancelled = false;

    window.HERDLINK_BASE_PATH = basePath;

    runtimeScripts
      .reduce((chain, script) => {
        return chain.then(() => {
          if (cancelled) {
            return undefined;
          }

          return loadRuntimeScript(script);
        });
      }, Promise.resolve())
      .then(() => {
        if (cancelled) {
          return;
        }

        frameId = window.requestAnimationFrame(() => {
          window.dispatchEvent(new Event("herdlink:mount"));
        });
      })
      .catch((error) => {
        console.error("Failed to load HerdLink runtime scripts:", error);
      });

    return () => {
      cancelled = true;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);

  return (
    <>
      <IntroOverlay />
      <div
        id="herdlinkTooltip"
        className="herdlink-tooltip"
        role="tooltip"
        aria-hidden="true"
      ></div>
      <div id="radial-labels-container"></div>
      <div id="mainContainer">
        <LeftPanel />
        <NetworkPanel />
        <RightPanel />
      </div>
    </>
  );
}
