import { useEffect, useRef, useState } from "react";
import { IntroOverlay } from "./components/IntroOverlay";
import { LeftPanel } from "./components/LeftPanel";
import { NetworkPanel } from "./components/NetworkPanel";
import { RightPanel } from "./components/RightPanel";
import { ScreenSizeNotice } from "./components/ScreenSizeNotice";

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
const minimumViewportWidth = 720;
const minimumScreenEdge = 600;
const tooltipGap = 10;
const tooltipMargin = 8;
const oppositePlacements = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
};

const richTips = {
  simulationControls: {
    title: "Simulation Controls",
    iconClass: "fa-solid fa-flask",
    intro:
      "Set the disease model before replaying spread through local contacts and livestock movements.",
    sections: [
      {
        iconClass: "fa-solid fa-diagram-project",
        title: "Model choices",
        text:
          "SEIR adds a latent exposed stage. SIR moves straight from susceptible to infectious. SIS permits reinfection. SEIRS adds waning recovery.",
      },
      {
        iconClass: "fa-solid fa-location-dot",
        title: "Starting state",
        text:
          "Seed keeps repeatable random choices. Seed regions sets how many areas begin infected. Initial % sets starting infection pressure.",
      },
      {
        iconClass: "fa-solid fa-arrows-turn-to-dots",
        title: "Spread rates",
        text:
          "Contact beta controls local spread. Movement beta controls spread along trade links.",
      },
      {
        iconClass: "fa-solid fa-clock",
        title: "Timing",
        text:
          "Latency moves exposed regions toward infectious. Recovery moves infectious regions into recovered or susceptible states.",
      },
    ],
  },
  gravityModel: {
    title: "Gravity Model",
    iconClass: "fa-regular fa-chart-scatter-bubble",
    intro:
      "Read this as distance versus trade volume for the full network.",
    sections: [
      {
        iconClass: "fa-solid fa-circle",
        title: "Dots",
        text:
          "Each dot is a trade route. The horizontal axis is distance, and the vertical axis is volume on a log scale.",
      },
      {
        iconClass: "fa-solid fa-chart-line",
        title: "Trend",
        text:
          "The dashed line shows the distance volume pattern. R2 shows how much of the volume pattern is explained by distance.",
      },
      {
        iconClass: "fa-solid fa-magnifying-glass-chart",
        title: "What to look for",
        text:
          "Routes high above the line are heavier than expected for their distance. Far right routes show long range trade ties.",
      },
    ],
  },
  tradeClusters: {
    title: "Trade Clusters",
    iconClass: "fa-regular fa-circle-nodes",
    intro:
      "This panel shows how trade volume is organized across detected communities.",
    sections: [
      {
        iconClass: "fa-solid fa-table-cells",
        title: "Matrix",
        text:
          "Rows and columns are trade partitions. Brighter cells show stronger volume between a source partition and a destination partition.",
      },
      {
        iconClass: "fa-solid fa-chart-simple",
        title: "Side bars",
        text:
          "Bars rank partitions by total trade volume, so large hubs stand out quickly.",
      },
      {
        iconClass: "fa-solid fa-people-arrows",
        title: "Signals",
        text:
          "Within, between, and modularity summarize whether trade is mostly inside communities or spread across them.",
      },
    ],
  },
  globalMetric: {
    title: "Global Metric",
    iconClass: "fa-regular fa-globe",
    intro:
      "The chart follows one network wide measure over time. The marker shows the current time step.",
    options: [
      ["Active Regions", "Regions with trade activity at that time step."],
      ["Trade Routes", "Active directed routes between regions."],
      ["Total Volume", "Total livestock movement volume across all active routes."],
      ["Avg. Volume/Route", "Average volume carried by each active route."],
      ["Avg. Volume/Area", "Average volume associated with each active region."],
      ["Communities", "Number of detected trade communities."],
      ["Modularity", "How strongly the network separates into communities."],
      ["Spectral Radius", "A network pressure score tied to amplification potential."],
    ],
  },
  nodeMetric: {
    title: "Node Metric",
    iconClass: "fa-regular fa-share-nodes",
    intro:
      "Each line is a region. Labels mark the highest ranked regions at the current date.",
    options: [
      ["Sink (PageRank)", "Regions that receive risk from important senders."],
      ["Bottleneck (Betweenness)", "Regions that sit on many trade paths."],
      ["Amplifier (Eigenvector)", "Regions connected to other influential regions."],
      ["Vulnerable (In Degree)", "Regions receiving large incoming volume."],
      ["Seeding (Out Degree)", "Regions sending large outgoing volume."],
    ],
  },
  nodeGravityModel: {
    title: "Gravity Model (Node)",
    iconClass: "fa-regular fa-chart-scatter-bubble",
    intro:
      "This is the distance volume pattern for the selected region.",
    sections: [
      {
        iconClass: "fa-solid fa-route",
        title: "Focused routes",
        text:
          "Dots represent incoming and outgoing trades tied to the selected region.",
      },
      {
        iconClass: "fa-solid fa-ruler-horizontal",
        title: "Distance reading",
        text:
          "Short distance routes show local dependency. Long distance routes show wider exposure reach.",
      },
      {
        iconClass: "fa-solid fa-weight-hanging",
        title: "Volume reading",
        text:
          "High dots point to the routes that dominate the region's trade pressure.",
      },
    ],
  },
  focusInsights: {
    title: "Focus Insights",
    iconClass: "fa-regular fa-circle-nodes",
    intro:
      "Use these views to inspect how the selected region trades with partners.",
    options: [
      ["Partner balance", "Compares incoming and outgoing volume by partner."],
      ["Distance profile", "Shows whether trade pressure is local or long range."],
      ["Community mixing", "Separates within community and cross community trade."],
    ],
  },
  exportBackbone: {
    title: "Major Export Structure",
    iconClass: "fa-solid fa-sitemap",
    intro:
      "This tree extracts a compact route backbone around the selected region.",
    sections: [
      {
        iconClass: "fa-solid fa-sitemap",
        title: "Backbone",
        text:
          "The tree keeps the strongest connecting routes so the main export structure is easier to scan.",
      },
      {
        iconClass: "fa-solid fa-arrow-trend-up",
        title: "Insight",
        text:
          "Use it to find which upstream and downstream areas anchor the selected region's trade role.",
      },
    ],
  },
  focusTrajectory: {
    title: "Focus Trajectory",
    iconClass: "fa-solid fa-chart-line",
    intro:
      "This simulation chart tracks disease compartments for the selected region over time.",
    sections: [
      {
        iconClass: "fa-solid fa-virus",
        title: "Prevalence",
        text:
          "The main line shows infection pressure at the focal region through the replay.",
      },
      {
        iconClass: "fa-solid fa-layer-group",
        title: "Compartments",
        text:
          "Susceptible, exposed, infectious, and recovered shares show where the region sits in the outbreak cycle.",
      },
      {
        iconClass: "fa-solid fa-calendar-day",
        title: "Current frame",
        text:
          "The date marker links the chart to the map and the focus trade table.",
      },
    ],
  },
  focusSimulation: {
    title: "Focus Simulation",
    iconClass: "fa-solid fa-stethoscope",
    intro:
      "Select a view to explain why the focal region is exposed in the current simulation frame.",
    options: [
      ["Partition load", "Shows how burden is distributed across trade partitions."],
      ["Exposure balance", "Compares incoming exposure and outgoing pressure."],
      ["Spatial pattern", "Shows nearby and distant regions contributing to exposure."],
    ],
  },
  exposureBackbone: {
    title: "Main Exposure Backbone",
    iconClass: "fa-solid fa-sitemap",
    intro:
      "This tree highlights the strongest exposure routes around the focal region in simulation mode.",
    sections: [
      {
        iconClass: "fa-solid fa-arrow-right-arrow-left",
        title: "Exposure paths",
        text:
          "Links show the main movement channels that can carry pressure into or out of the selected region.",
      },
      {
        iconClass: "fa-solid fa-filter",
        title: "Filtered reading",
        text:
          "Use the focus trade checkboxes to test how removing routes changes the exposure backbone.",
      },
    ],
  },
  spatialSpread: {
    title: "Spatial Spread",
    iconClass: "fa-solid fa-map-location-dot",
    intro:
      "This simulation panel shows where infection pressure is concentrated across regions.",
    sections: [
      {
        iconClass: "fa-solid fa-map",
        title: "Map pattern",
        text:
          "Darker or stronger marks show regions with higher simulated pressure at the current frame.",
      },
      {
        iconClass: "fa-solid fa-arrows-split-up-and-left",
        title: "Movement signal",
        text:
          "Use the pattern to see whether pressure stays local or reaches across partitions.",
      },
    ],
  },
  partitionExposure: {
    title: "Partition Exposure",
    iconClass: "fa-solid fa-diagram-project",
    intro:
      "This panel groups simulation pressure by trade partition.",
    sections: [
      {
        iconClass: "fa-solid fa-table-cells-large",
        title: "Partition load",
        text:
          "Cells and bars show which trade communities carry the most simulated burden.",
      },
      {
        iconClass: "fa-solid fa-people-arrows",
        title: "Cross partition spread",
        text:
          "Use the between partition pattern to spot pressure that may bridge communities.",
      },
    ],
  },
  compartmentTrajectory: {
    title: "Compartment Trajectory",
    iconClass: "fa-solid fa-chart-area",
    intro:
      "This chart shows how the simulated population moves through disease states over time.",
    sections: [
      {
        iconClass: "fa-solid fa-layer-group",
        title: "Stacked areas",
        text:
          "Each band is a compartment. S is susceptible, E is exposed, I is infectious, and R is recovered.",
      },
      {
        iconClass: "fa-solid fa-chart-line",
        title: "Shape over time",
        text:
          "Expanding infectious or exposed bands mark outbreak growth. A growing recovered band shows accumulated resolved cases.",
      },
      {
        iconClass: "fa-solid fa-calendar-day",
        title: "Current frame",
        text:
          "The date marker matches the map, regional prevalence ranking, and timeline controls.",
      },
    ],
  },
  highestRegionalPrevalence: {
    title: "Highest Regional Prevalence",
    iconClass: "fa-solid fa-temperature-high",
    intro:
      "This ranking shows which regions carry the largest infectious share at the current simulation frame.",
    sections: [
      {
        iconClass: "fa-solid fa-ranking-star",
        title: "Ranking",
        text:
          "Bars are sorted by prevalence, so the highest pressure regions stay at the top.",
      },
      {
        iconClass: "fa-solid fa-percent",
        title: "Labels",
        text:
          "Each label combines prevalence percentage with the infectious count for that region.",
      },
      {
        iconClass: "fa-solid fa-map-location-dot",
        title: "Map link",
        text:
          "Use the list with the map to see whether regional pressure is clustered or spread across the network.",
      },
    ],
  },
};

function supportsHerdLinkLayout() {
  return (
    window.innerWidth >= minimumViewportWidth &&
    Math.min(window.screen.width, window.screen.height) >= minimumScreenEdge
  );
}

function useSupportedScreenSize() {
  const [isSupported, setIsSupported] = useState(supportsHerdLinkLayout);

  useEffect(() => {
    const updateScreenSize = () => {
      setIsSupported(supportsHerdLinkLayout());
    };

    window.addEventListener("resize", updateScreenSize);
    return () => window.removeEventListener("resize", updateScreenSize);
  }, []);

  return isSupported;
}

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

  return event.target.closest(".has-tip[data-tip], .has-tip[data-tip-key]");
}

function appendIcon(parent, iconClass) {
  if (!iconClass) {
    return;
  }

  const icon = document.createElement("i");
  icon.className = iconClass;
  icon.setAttribute("aria-hidden", "true");
  parent.append(icon);
}

function createRichTooltipContent(tip) {
  const wrapper = document.createElement("div");
  wrapper.className = "tip-card";

  const heading = document.createElement("div");
  heading.className = "tip-heading";
  appendIcon(heading, tip.iconClass);

  const title = document.createElement("span");
  title.textContent = tip.title;
  heading.append(title);
  wrapper.append(heading);

  if (tip.intro) {
    const intro = document.createElement("p");
    intro.className = "tip-intro";
    intro.textContent = tip.intro;
    wrapper.append(intro);
  }

  if (tip.sections?.length) {
    const sectionList = document.createElement("div");
    sectionList.className = "tip-section-list";
    tip.sections.forEach((section) => {
      const item = document.createElement("div");
      item.className = "tip-section";

      const iconWrap = document.createElement("span");
      iconWrap.className = "tip-section-icon";
      appendIcon(iconWrap, section.iconClass);
      item.append(iconWrap);

      const copy = document.createElement("span");
      copy.className = "tip-section-copy";

      const sectionTitle = document.createElement("strong");
      sectionTitle.textContent = section.title;
      copy.append(sectionTitle);

      const text = document.createElement("span");
      text.textContent = section.text;
      copy.append(text);
      item.append(copy);
      sectionList.append(item);
    });
    wrapper.append(sectionList);
  }

  if (tip.options?.length) {
    const options = document.createElement("div");
    options.className = "tip-options";
    tip.options.forEach(([label, text]) => {
      const option = document.createElement("div");
      option.className = "tip-option";

      const optionLabel = document.createElement("strong");
      optionLabel.textContent = label;
      option.append(optionLabel);

      const optionText = document.createElement("span");
      optionText.textContent = text;
      option.append(optionText);
      options.append(option);
    });
    wrapper.append(options);
  }

  return wrapper;
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
  const hasSupportedScreen = useSupportedScreenSize();
  const runtimeReady = useRef(false);

  useEffect(() => {
    if (!hasSupportedScreen) {
      return undefined;
    }

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
      const richTip = richTips[target.dataset.tipKey];

      if (!tip && !richTip) {
        return;
      }

      activeTarget = target;
      tooltip.classList.toggle("is-rich", Boolean(richTip));
      if (richTip) {
        tooltip.replaceChildren(createRichTooltipContent(richTip));
      } else {
        tooltip.textContent = tip;
      }
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
  }, [hasSupportedScreen]);

  useEffect(() => {
    if (!hasSupportedScreen || runtimeReady.current) {
      return undefined;
    }

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
          if (cancelled) {
            return;
          }

          runtimeReady.current = true;
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
  }, [hasSupportedScreen]);

  return (
    <>
      {!hasSupportedScreen && <ScreenSizeNotice />}
      <div
        className={`screen-access-content${
          hasSupportedScreen ? "" : " is-screen-blocked"
        }`}
        aria-hidden={!hasSupportedScreen}
        inert={hasSupportedScreen ? undefined : ""}
      >
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
      </div>
    </>
  );
}
