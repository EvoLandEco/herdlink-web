import { useEffect, useRef, useState } from "react";
import { IntroOverlay } from "./components/IntroOverlay";
import { ComparisonOverlay } from "./components/ComparisonOverlay";
import { useComparison } from "./useComparison";
import { LeftPanel } from "./components/LeftPanel";
import { NetworkPanel } from "./components/NetworkPanel";
import { RightPanel } from "./components/RightPanel";
import { ScreenSizeNotice } from "./components/ScreenSizeNotice";
import { createMapLayers } from "./mapLayers";
import { downloadAppScreenshot } from "./screenshot";
import { assetUrls } from "./assetUrls";
import jLouvainUrl from "./runtime/jLouvain.js?url";
import d3AnnotationUrl from "./runtime/d3anno.js?url";
import herdLinkRuntimeUrl from "./runtime/herdlink-runtime.js?url";

window.createHerdLinkMapLayers = createMapLayers;
window.downloadHerdLinkScreenshot = downloadAppScreenshot;
window.HERDLINK_ASSET_URLS = assetUrls;

const runtimeScripts = [
  { src: "https://cdn.jsdelivr.net/npm/d3@6.7.0/dist/d3.min.js" },
  { src: jLouvainUrl },
  { src: "https://cdnjs.cloudflare.com/ajax/libs/vivus/0.3.1/vivus.min.js" },
  { src: d3AnnotationUrl },
  { src: "https://unpkg.com/simple-keyboard@3.8.187/build/index.js" },
  {
    src: "https://cdnjs.cloudflare.com/ajax/libs/leader-line/1.0.6/leader-line.min.js",
  },
  { src: herdLinkRuntimeUrl },
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

const distanceTradeEquation = `
  <math xmlns="http://www.w3.org/1998/Math/MathML" display="block"
    aria-label="V of d equals A times one plus d over sigma, raised to the power negative nu">
    <mrow>
      <mrow><mi>V</mi><mo>(</mo><mi>d</mi><mo>)</mo></mrow>
      <mo>=</mo><mi>A</mi><mo>⁢</mo>
      <msup>
        <mrow>
          <mo>(</mo><mn>1</mn><mo>+</mo>
          <mfrac><mi>d</mi><mi>σ</mi></mfrac><mo>)</mo>
        </mrow>
        <mrow><mo>−</mo><mi>ν</mi></mrow>
      </msup>
    </mrow>
  </math>
`;

const importsExportsGuide = {
  title: "Imports & Exports",
  iconClass: "fa-solid fa-arrow-right-arrow-left",
  intro:
    "Choose whether each region can send livestock to or receive livestock from other regions. These permissions are shared by network and simulation modes.",
  sections: [
    {
      iconClass: "fa-solid fa-route",
      title: "Directions",
      text:
        "Exports allow movement out of a region. Imports allow movement into it. These permissions cover every partner, including routes that appear on future dates. The local checkbox controls movement within a region separately.",
    },
    {
      iconClass: "fa-solid fa-calendar-days",
      title: "Timing",
      text:
        "Changes start at the displayed date and stay in place until re-enabled. The timeline shows each region with restrictions anywhere in the schedule. Hover a segment to inspect its period and permissions, or a diamond to inspect a change. Scroll horizontally to inspect closely spaced dates. Click a diamond to jump to its date; at coarser time resolutions, this selects the first available time step on or after that date. Dates outside the replay range select the nearest endpoint.",
    },
    {
      iconClass: "fa-solid fa-timeline",
      title: "Timeline colors",
      text:
        "Teal allows both directions. Salmon blocks exports, purple blocks imports, and amber blocks both. The white line marks the displayed date. The timeline covers the full schedule even when the region list is filtered.",
    },
    {
      iconClass: "fa-solid fa-list-check",
      title: "Bulk controls",
      text:
        "All exports and All imports apply to every region, including regions outside the search results. A teal thumb on the right allows movement; a coral thumb on the left blocks it. A centered amber thumb means some regions are allowed and others are blocked. Selecting a mixed control allows every region. Restore all in either mode clears link edits and import or export permissions across every date.",
    },
    {
      iconClass: "fa-solid fa-flask",
      title: "Shared network",
      text:
        "Network mode measures the allowed trade routes by movement volume. Simulation mode uses the same routes to calculate disease pressure. Restrictions set in either mode can change later disease outcomes; earlier simulated states stay fixed.",
    },
  ],
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
          "Seed region chooses the single region that begins infected, with CR35 selected by default. Initial % sets the infected share in that region at the start of the simulation.",
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
    title: "Trade vs Distance",
    iconClass: "fa-regular fa-chart-scatter-bubble",
    intro:
      "See how recorded trade volume varies with distance across the network.",
    sections: [
      {
        iconClass: "fa-solid fa-circle",
        title: "Dots",
        text:
          "Each dot shows an allowed trade route on this date. The log axes show distance between regional reference points in kilometres and the number of animals traded.",
      },
      {
        iconClass: "fa-solid fa-chart-line",
        title: "Distance curve",
        equation: distanceTradeEquation,
        text:
          "The dashed curve summarizes typical trade volume, giving each route equal weight on the log scale. A sets the volume level, σ the distance scale, and ν the decline.",
      },
      {
        iconClass: "fa-solid fa-chart-area",
        title: "Confidence band",
        text:
          "Shading shows approximate 95% confidence intervals for typical volume at each distance, using the curve form shown. The calculation accounts for routes sharing a region.",
      },
      {
        iconClass: "fa-solid fa-magnifying-glass-chart",
        title: "What to look for",
        text:
          "The summary shows route counts and the fitted decline across the observed distances. Dots above the curve carry more animals than the typical fitted volume.",
      },
    ],
  },
  tradeClusters: {
    title: "Trade Clusters",
    iconClass: "fa-regular fa-circle-nodes",
    intro:
      "Communities group regions by allowed trade across the full period. Larger volumes have more influence. Colors and membership stay fixed during date replay.",
    sections: [
      {
        iconClass: "fa-solid fa-layer-group",
        title: "Community scale",
        text:
          "Finer (γ = 1.5) explores smaller groups; Broad (γ = 1) highlights larger patterns. Each scale finds its own groups from the full period.",
      },
      {
        iconClass: "fa-solid fa-table-cells",
        title: "Heatmap",
        text:
          "Rows are source communities; columns are destinations. Brighter cells and longer side bars show more trade on the displayed date.",
      },
      {
        iconClass: "fa-solid fa-circle-nodes",
        title: "Circular flows",
        text:
          "Each COROP region has a fixed position within its community. Thicker curves carry more trade; arrows show direction. Hover or focus a region for its flows and totals.",
      },
      {
        iconClass: "fa-solid fa-chart-simple",
        title: "Scheduled restrictions",
        text:
          "Routes contribute on dates when trade is allowed. Editing restrictions rebuilds the groups across the whole period, including earlier dates.",
      },
      {
        iconClass: "fa-solid fa-people-arrows",
        title: "Reading the groups",
        text:
          "Within and between show how trade between regions is shared across communities. Compare these shares and group sizes to explore each scale. Higher modularity at the same scale means stronger agreement with the fixed groups.",
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
      ["Communities", "Number of fixed communities across the full loaded period at the selected community scale."],
      ["Modularity", "Agreement of each date's trade with those fixed communities at the selected resolution. Compare values at the same community scale; scores can be negative."],
      ["Spectral Radius", "A network pressure score tied to amplification potential."],
    ],
  },
  nodeMetric: {
    title: "Node Metric",
    iconClass: "fa-regular fa-share-nodes",
    intro:
      "Each line is a region. Scores use allowed routes between regions. Labels mark the highest ranked regions at the current date.",
    options: [
      ["Sink (PageRank)", "Regions that receive risk from important senders."],
      ["Bottleneck (Betweenness)", "Regions that sit on many trade paths."],
      ["Amplifier (Eigenvector)", "Regions connected to other influential regions."],
      ["Vulnerable (In Degree)", "Regions receiving large incoming volume."],
      ["Seeding (Out Degree)", "Regions sending large outgoing volume."],
    ],
  },
  nodeGravityModel: {
    title: "Trade vs Distance",
    iconClass: "fa-regular fa-chart-scatter-bubble",
    intro:
      "See how the selected region's recorded trade volume varies with distance.",
    sections: [
      {
        iconClass: "fa-solid fa-route",
        title: "Focused routes",
        text:
          "Dots show the region's allowed imports and exports on this date. The log axes show distance in kilometres between regional reference points and the number of animals traded.",
      },
      {
        iconClass: "fa-solid fa-ruler-horizontal",
        title: "Distance curves",
        equation: distanceTradeEquation,
        text:
          "All, Out and In fit the same shape to all routes, exports and imports, with equal weight per route on the log scale. A sets the volume level, σ the distance scale, and ν the decline.",
      },
      {
        iconClass: "fa-solid fa-weight-hanging",
        title: "Volume reading",
        text:
          "Compare the curves to see how imports and exports vary with distance. Summaries show route counts and fitted decline; higher dots represent larger trade volumes. Fit labels show which distance pattern the routes support.",
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
      {
        iconClass: "fa-solid fa-list-check",
        title: "Controls",
        text:
          "Link checkboxes change routes for the displayed time step. The switch beside the region name opens Imports & Exports, where regional permissions last until re-enabled. Both controls are shared with simulation mode. Restore all clears both schedules across every date.",
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
  localTrades: {
    title: "Local Trades",
    iconClass: "fa-solid fa-repeat",
    intro:
      "Control recorded livestock movements that begin and end within the selected region. The value shows their recorded volume.",
    sections: [
      {
        iconClass: "fa-solid fa-calendar-day",
        title: "Timing",
        text:
          "The checkbox controls local routes for the displayed time step, independently of regional import and export permissions.",
      },
      {
        iconClass: "fa-solid fa-flask",
        title: "Shared with simulation",
        text:
          "The same checkbox controls local contact spread in simulation, including dates with zero recorded local trade. Its effects carry forward through the simulation; earlier states stay fixed.",
      },
    ],
  },
  outgoingTrades: {
    title: "Outgoing Trades",
    iconClass: "fa-solid fa-arrow-right-from-bracket",
    intro:
      "Inspect livestock movements from the selected region to other regions.",
    sections: [
      {
        iconClass: "fa-solid fa-chart-simple",
        title: "Reading routes",
        text:
          "The value is recorded movement volume. The bar shows distance to the destination, with its color indicating the destination's community. Network measures use allowed routes.",
      },
      {
        iconClass: "fa-solid fa-list-check",
        title: "Availability",
        text:
          "Each checkbox controls one route for the displayed time step. The title checkbox changes all displayed outgoing routes; a mixed mark means only some are checked. A checked route also needs source exports and destination imports to be allowed. These settings are shared with simulation mode.",
      },
    ],
  },
  incomingTrades: {
    title: "Incoming Trades",
    iconClass: "fa-solid fa-arrow-left-to-bracket",
    intro:
      "Inspect livestock movements into the selected region from other regions.",
    sections: [
      {
        iconClass: "fa-solid fa-chart-simple",
        title: "Reading routes",
        text:
          "The value is recorded movement volume. The bar shows distance to the source, with its color indicating the source's community. Network measures use allowed routes.",
      },
      {
        iconClass: "fa-solid fa-list-check",
        title: "Availability",
        text:
          "Each checkbox controls one route for the displayed time step. The title checkbox changes all displayed incoming routes; a mixed mark means only some are checked. A checked route also needs source exports and destination imports to be allowed. These settings are shared with simulation mode.",
      },
    ],
  },
  localTransmission: {
    title: "Local Transmission",
    iconClass: "fa-solid fa-repeat",
    intro:
      "Control spread within the selected region for the displayed time step.",
    sections: [
      {
        iconClass: "fa-solid fa-virus",
        title: "Within the region",
        text:
          "This checkbox controls local contact spread and livestock movements within the region. It shares the Local Trades setting in network mode and operates independently of regional import and export permissions.",
      },
      {
        iconClass: "fa-solid fa-calendar-day",
        title: "Timing",
        text:
          "The change applies to the displayed time step. The simulation recomputes disease outcomes from that point onward, while earlier states stay fixed.",
      },
    ],
  },
  outgoingPressure: {
    title: "Outgoing Pressure",
    iconClass: "fa-solid fa-arrow-right-from-bracket",
    intro:
      "Inspect routes carrying infection pressure from the selected region to other regions.",
    sections: [
      {
        iconClass: "fa-solid fa-chart-simple",
        title: "Reading routes",
        text:
          "For an allowed route, the value is movement volume multiplied by source prevalence and Movement beta. The bar shows the destination's infectious share. Blocked routes contribute zero pressure.",
      },
      {
        iconClass: "fa-solid fa-list-check",
        title: "Availability",
        text:
          "Each checkbox controls one route for the displayed time step. The title checkbox changes all displayed outgoing routes; a mixed mark means only some are checked. A checked route also needs source exports and destination imports to be allowed. These settings are shared with network mode. Changes can affect later disease outcomes, while earlier states stay fixed.",
      },
    ],
  },
  incomingExposure: {
    title: "Incoming Exposure",
    iconClass: "fa-solid fa-arrow-left-to-bracket",
    intro:
      "Inspect routes carrying infection pressure into the selected region from other regions.",
    sections: [
      {
        iconClass: "fa-solid fa-chart-simple",
        title: "Reading routes",
        text:
          "For an allowed route, the value is movement volume multiplied by source prevalence and Movement beta. The bar shows the source's infectious share. Blocked routes contribute zero exposure.",
      },
      {
        iconClass: "fa-solid fa-list-check",
        title: "Availability",
        text:
          "Each checkbox controls one route for the displayed time step. The title checkbox changes all displayed incoming routes; a mixed mark means only some are checked. A checked route also needs source exports and destination imports to be allowed. These settings are shared with network mode. Changes can affect later disease outcomes, while earlier states stay fixed.",
      },
    ],
  },
  importsExports: importsExportsGuide,
  importsExportsTrade: importsExportsGuide,
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
          "Link checkboxes apply only to the displayed time step. The switch beside the region name opens Imports & Exports controls, which apply from the selected date until re-enabled and include future partners. Both controls are shared with network mode and can change later disease outcomes; earlier states stay fixed. Restore all clears link edits and import or export restrictions across every date.",
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
      "Explore simulated pressure within and between trade communities. Groups reflect allowed trade across the full period, including scheduled restrictions.",
    sections: [
      {
        iconClass: "fa-solid fa-layer-group",
        title: "Community scale",
        text:
          "Finer (γ = 1.5) explores smaller groups; Broad (γ = 1) highlights larger patterns. Changing scale regroups the same simulation results. Membership stays fixed during replay; editing restrictions rebuilds the groups across the whole period.",
      },
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

function getHerdLinkLayoutRequirement() {
  const { innerWidth, innerHeight, screen } = window;
  if (
    Math.min(screen.width, screen.height) < minimumScreenEdge ||
    Math.max(innerWidth, innerHeight) < minimumViewportWidth
  ) {
    return "larger-screen";
  }

  return innerWidth > innerHeight ? null : "landscape";
}

function useScreenRequirement() {
  const [requirement, setRequirement] = useState(getHerdLinkLayoutRequirement);

  useEffect(() => {
    const updateScreenSize = () => {
      setRequirement(getHerdLinkLayoutRequirement());
    };

    window.addEventListener("resize", updateScreenSize);
    return () => window.removeEventListener("resize", updateScreenSize);
  }, []);

  return requirement;
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
      script.removeEventListener("error", handleError);
      script.dataset.loaded = "true";
      scriptLoaders.delete(src);
      resolve(script);
    };

    const handleError = () => {
      script.removeEventListener("load", handleLoad);
      script.remove();
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
  if (event.target.closest(".comparison-overlay")) return null;

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

      const copy = document.createElement("div");
      copy.className = "tip-section-copy";

      const sectionTitle = document.createElement("strong");
      sectionTitle.textContent = section.title;
      copy.append(sectionTitle);

      if (section.equation) {
        const equation = document.createElement("div");
        equation.className = "tip-equation";
        equation.innerHTML = section.equation;
        copy.append(equation);
      }

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
  const screenRequirement = useScreenRequirement();
  const hasSupportedScreen = screenRequirement === null;
  const runtimeReady = useRef(false);
  const comparison = useComparison(hasSupportedScreen);

  useEffect(() => {
    window.dispatchEvent(new Event("herdlink:screen-access-change"));
  }, [hasSupportedScreen]);

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
      {!hasSupportedScreen && <ScreenSizeNotice reason={screenRequirement} />}
      <div
        className={`screen-access-content${
          hasSupportedScreen ? "" : " is-screen-blocked"
        }`}
        aria-hidden={!hasSupportedScreen}
        inert={hasSupportedScreen ? undefined : ""}
      >
        <IntroOverlay />
        <ComparisonOverlay
          open={comparison.open}
          data={comparison.data}
          recomputing={comparison.recomputing}
          onClose={comparison.close}
          onModeChange={comparison.changeMode}
          scenarioSlots={comparison.scenarioSlots}
          activePresetId={comparison.activePresetId}
          activeScenarioSlot={comparison.activeScenarioSlot}
          scenarioError={comparison.scenarioError}
          scenarioNotice={comparison.scenarioNotice}
          onLoadPreset={comparison.loadPreset}
          onSaveScenario={comparison.saveScenario}
          onLoadScenario={comparison.loadScenario}
        />
        <div
          id="herdlinkTooltip"
          className="herdlink-tooltip"
          role="tooltip"
          aria-hidden="true"
        ></div>
        <div id="radial-labels-container"></div>
        <div id="mainContainer">
          <LeftPanel />
          <NetworkPanel onOpenComparison={comparison.toggle} />
          <RightPanel />
        </div>
      </div>
    </>
  );
}
