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
import * as interventionPresets from "./runtime/intervention-presets.js";
import * as simulationEngine from "./runtime/simulation-engine.js";
import * as simulationPopulation from "./runtime/simulation-population.js";

window.createHerdLinkMapLayers = createMapLayers;
window.downloadHerdLinkScreenshot = downloadAppScreenshot;
window.HERDLINK_ASSET_URLS = assetUrls;
window.herdlinkPresetTools = interventionPresets;
window.herdlinkSimulation = { ...simulationEngine, ...simulationPopulation };

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
const minimumViewportWidth = 1024;
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
        "Ledger mode applies permissions at each aggregated record's date label. Simulation mode applies restrictions to each calendar day and sums attributed infection entries. Use the daily ledger for trade totals that account for closures within coarse bins.",
    },
  ],
};

const richTips = {
  simulationControls: {
    title: "Simulation Controls",
    iconClass: "fa-solid fa-flask",
    intro:
      "Choose a population, starting state and model settings for an exploratory simulation.",
    sections: [
      {
        iconClass: "fa-solid fa-users",
        title: "Population",
        text:
          "Regional populations are scaled from trade activity and held fixed throughout a run. Each comparison uses the same population on both sides.",
      },
      {
        iconClass: "fa-solid fa-diagram-project",
        title: "Model choices",
        text:
          "SEIR includes an exposed stage before infectiousness. SIR enters infectiousness directly. SIS returns recovered units to susceptibility. SEIRS includes a daily fraction for waning immunity.",
      },
      {
        iconClass: "fa-solid fa-location-dot",
        title: "Starting state",
        text:
          "Seed region chooses where infection starts, with CR35 selected by default. Initial infectious, exposed and recovered shares define its exact state at the start of Introduction date. The engine stores that state before the first daily transition; displayed compartments show the bin end.",
      },
      {
        iconClass: "fa-solid fa-calendar-days",
        title: "Scenario date",
        text:
          "Introduction date sets infection timing while restrictions keep their calendar dates. Custom sets target count, response delay and Standstill duration, then reapplies the selected preset after a short pause. These presets choose restriction schedules; they do not choose disease parameters.",
      },
      {
        iconClass: "fa-solid fa-arrows-turn-to-dots",
        title: "Transmission controls",
        text:
          "Contact controls exposure within a region. Movement controls exposure along recorded routes. Local movement checkboxes affect the recorded routes within a region; contact remains separate.",
      },
      {
        iconClass: "fa-solid fa-clock",
        title: "Timing",
        text:
          "Progression, recovery and waning apply once per day. Weekly, monthly and yearly views show states at the end of each period and total new infections during it.",
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
      "Communities group regions by allowed interregional trade across the full period. Larger volumes have more influence. Colors and membership stay fixed during date replay. Local trade remains visible in both charts.",
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
          "Ledger summaries apply permissions at each record's label date. Coarse bins do not reconstruct daily closures. Editing restrictions rebuilds the groups across the whole period, including earlier dates.",
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
      ["Risk Score", "Spectral radius relative to the highest unrestricted value across the loaded period at this temporal resolution. A score of 1 marks that reference peak."],
      ["Modularity", "Agreement of each date's trade with those fixed communities at the selected resolution. Compare values at the same community scale; scores can be negative."],
      ["Spectral Radius", "A network pressure score tied to amplification potential."],
    ],
  },
  tradeConcentration: {
    title: "Trade Concentration",
    iconClass: "fa-solid fa-chart-area",
    intro:
      "See how much of the selected interval's livestock volume is carried by its busiest directed routes.",
    sections: [
      {
        iconClass: "fa-solid fa-arrow-down-wide-short",
        title: "Ranked routes",
        text:
          "Routes run from busiest to smallest along the horizontal axis. The amber curve shows their cumulative share of all allowed volume, including movements within a region. Repeated records for the same source and destination count as one route.",
      },
      {
        iconClass: "fa-solid fa-chart-line",
        title: "Equal share",
        text:
          "The dashed diagonal shows equal volume on every route. A curve rising well above it means fewer routes carry more of the volume. Both axes use percentages, so dates with different route counts can be compared.",
      },
      {
        iconClass: "fa-solid fa-bullseye",
        title: "Readouts",
        text:
          "Top 5 gives the share carried by up to five busiest routes. The 80% readout gives the fewest whole routes needed to reach that share, marked by the dot. Date changes and movement controls refresh the distribution; blocked and zero-volume routes are excluded.",
      },
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
          "Link checkboxes change routes across the daily intervals covered by the displayed bin. The switch beside the region name opens Imports & Exports, where regional permissions last until re-enabled. Both controls are shared with simulation mode. Restore all clears both schedules across every date.",
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
          "The infectious share is I divided by the region's fixed model population. Each displayed point describes the state at the end of its covered bin.",
      },
      {
        iconClass: "fa-solid fa-layer-group",
        title: "Compartments",
        text:
          "Susceptible, exposed, infectious and recovered shares describe the model's compartments. Daily infection entries count transitions out of susceptibility; initial seeds are separate.",
      },
      {
        iconClass: "fa-solid fa-calendar-day",
        title: "Current frame",
        text:
          "The marker uses the bin's start date, matching the map and focus trade table. The chart samples the end state from the daily simulation.",
      },
    ],
  },
  focusSimulation: {
    title: "Focus Simulation",
    iconClass: "fa-solid fa-stethoscope",
    intro:
      "Inspect the focal region's model state, movement pressure and attributed infection entries for the displayed bin.",
    options: [
      ["Partition load", "Compares the region's state with its trade community."],
      ["Exposure balance", "Compares summed daily incoming and outgoing movement pressure, distinct from infection entries."],
      ["Spatial pattern", "Groups attributed infection entries on incoming and outgoing routes by partner distance."],
    ],
  },
  localTrades: {
    title: "Local Movements",
    iconClass: "fa-solid fa-repeat",
    intro:
      "Control recorded livestock movements that begin and end within the selected region. The value shows their recorded volume.",
    sections: [
      {
        iconClass: "fa-solid fa-calendar-day",
        title: "Timing",
        text:
          "The checkbox controls recorded local routes across the daily intervals covered by the displayed bin, independently of regional import and export permissions. A mixed mark indicates that only part of the bin has a route closure.",
      },
      {
        iconClass: "fa-solid fa-flask",
        title: "Shared with simulation",
        text:
          "The same checkbox controls pressure from recorded local movements in simulation. Contact beta controls a separate local contact pathway that remains active when these movements are blocked.",
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
          "Each checkbox controls one route across the daily intervals covered by the displayed bin. The title checkbox changes all displayed outgoing routes; a mixed mark means only some are checked. A checked route also needs source exports and destination imports to be allowed. These settings are shared with simulation mode.",
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
          "Each checkbox controls one route across the daily intervals covered by the displayed bin. The title checkbox changes all displayed incoming routes; a mixed mark means only some are checked. A checked route also needs source exports and destination imports to be allowed. These settings are shared with simulation mode.",
      },
    ],
  },
  localTransmission: {
    title: "Local Movements",
    iconClass: "fa-solid fa-repeat",
    intro:
      "Control recorded movements within the selected region for the displayed bin.",
    sections: [
      {
        iconClass: "fa-solid fa-virus",
        title: "Within the region",
        text:
          "This checkbox controls pressure from recorded movements within the region. It shares the Local Trades setting in network mode and operates independently of regional import and export permissions. Contact beta controls a separate local contact pathway.",
      },
      {
        iconClass: "fa-solid fa-calendar-day",
        title: "Timing",
        text:
          "The setting applies to the daily intervals covered by the displayed bin. The simulation uses each calendar day's restrictions before calculating that day's transition.",
      },
    ],
  },
  outgoingPressure: {
    title: "Outgoing Entries",
    iconClass: "fa-solid fa-arrow-right-from-bracket",
    intro:
      "Inspect infection entries attributed to movements from the selected region to other regions.",
    sections: [
      {
        iconClass: "fa-solid fa-chart-simple",
        title: "Reading routes",
        text:
          "The value sums daily infection entries attributed to this route's share of the destination's total hazard. The bar shows the destination's infectious share at the bin end. Movement pressure is a separate quantity; attributed entries are model calculations, not observed transmission links.",
      },
      {
        iconClass: "fa-solid fa-list-check",
        title: "Availability",
        text:
          "Each checkbox controls one route across the daily intervals covered by the displayed bin. The title checkbox changes all displayed outgoing routes; a mixed mark means only some are checked. A route also needs source exports and destination imports to be allowed. These settings are shared with network mode.",
      },
    ],
  },
  incomingExposure: {
    title: "Incoming Entries",
    iconClass: "fa-solid fa-arrow-left-to-bracket",
    intro:
      "Inspect infection entries attributed to movements into the selected region from other regions.",
    sections: [
      {
        iconClass: "fa-solid fa-chart-simple",
        title: "Reading routes",
        text:
          "The value sums daily infection entries attributed to this route's share of the destination's total hazard. The bar shows the source's infectious share at the bin end. Movement pressure is a separate quantity; attributed entries are model calculations, not observed transmission links.",
      },
      {
        iconClass: "fa-solid fa-list-check",
        title: "Availability",
        text:
          "Each checkbox controls one route across the daily intervals covered by the displayed bin. The title checkbox changes all displayed incoming routes; a mixed mark means only some are checked. A route also needs source exports and destination imports to be allowed. These settings are shared with network mode.",
      },
    ],
  },
  importsExports: importsExportsGuide,
  importsExportsTrade: importsExportsGuide,
  exposureBackbone: {
    title: "Main Exposure Backbone",
    iconClass: "fa-solid fa-sitemap",
    intro:
      "This tree highlights routes with the largest attributed infection entries around the focal region.",
    sections: [
      {
        iconClass: "fa-solid fa-arrow-right-arrow-left",
        title: "Exposure paths",
        text:
          "Link weights sum daily infection entries attributed to incoming or outgoing movements. Attribution allocates the model's incidence across contributing pathways.",
      },
      {
        iconClass: "fa-solid fa-filter",
        title: "Filtered reading",
        text:
          "Link checkboxes apply across the daily intervals covered by the displayed bin. Imports & Exports controls apply from the selected date until re-enabled and include future partners. Both controls are shared with network mode. Restore all clears link edits and import or export restrictions across every date.",
      },
    ],
  },
  spatialSpread: {
    title: "Spatial Spread",
    iconClass: "fa-solid fa-map-location-dot",
    intro:
      "Inspect the geographic distribution of infectious shares, infection entries and attributed movement pathways.",
    sections: [
      {
        iconClass: "fa-solid fa-map",
        title: "Map pattern",
        text:
          "Regional fills show the infectious share at the bin end. The color range uses the full daily run, including the initial state, and stays fixed during replay. Teal circle area shows new infection entries summed within the selected bin; zero entries have no circle.",
      },
      {
        iconClass: "fa-solid fa-arrows-split-up-and-left",
        title: "Movement signal",
        text:
          "Amber curves show the 18 largest cross-region movement pathways in the selected bin. Width shows attributed infection entries. Move totals all cross-region entries; Local combines contact transmission with local movements. Mean km is weighted by cross-region entries; Top 5 is the share of all new entries in the five largest regions.",
      },
    ],
  },
  partitionExposure: {
    title: "Partition Exposure",
    iconClass: "fa-solid fa-diagram-project",
    intro:
      "Explore attributed infection entries within and between trade communities. Groups reflect allowed interregional trade across the full period, including scheduled restrictions. Local entries remain visible in the charts.",
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
          "Cells and bars sum daily infection entries attributed to the source and destination communities. Local contact and local movement entries share the diagonal.",
      },
      {
        iconClass: "fa-solid fa-people-arrows",
        title: "Cross partition spread",
        text:
          "Entries between communities describe the model's allocation to cross-community movements. They are not observed transmission chains.",
      },
    ],
  },
  compartmentTrajectory: {
    title: "Compartment Trajectory",
    iconClass: "fa-solid fa-chart-area",
    intro:
      "This chart shows how synthetic model population units move through disease states over time. Regional populations are scaled from trade activity and held fixed throughout a run.",
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
          "Band size shows the compartment count at each bin end. R contains recovered model units and can decrease through SEIRS waning; it does not count all infection episodes.",
      },
      {
        iconClass: "fa-solid fa-calendar-day",
        title: "Current frame",
        text:
          "The marker uses the bin's start date, matching the map, regional prevalence ranking and timeline controls. Compartment values describe the actual bin end.",
      },
    ],
  },
  simulationIncidence: {
    title: "New Infections",
    iconClass: "fa-solid fa-chart-line",
    intro:
      "New infection entries during each displayed interval, split by the model's contact and movement contributions.",
    sections: [
      {
        iconClass: "fa-solid fa-layer-group",
        title: "Sources",
        text:
          "Teal shows contact within regions. Amber shows recorded movements, including movements within the same region. Their sum is the total number of new infection entries. These are model attributions, not observed transmission chains.",
      },
      {
        iconClass: "fa-solid fa-calendar-days",
        title: "Time resolution",
        text:
          "Daily, weekly, monthly and yearly views sum entries within their display bins. The marker and the two readouts follow the selected interval. Initial exposed and infectious units are starting states and are not counted as new entries.",
      },
    ],
  },
  highestRegionalPrevalence: {
    title: "Highest Regional Prevalence",
    iconClass: "fa-solid fa-temperature-high",
    intro:
      "This ranking shows regions with the largest infectious share at the end of the displayed bin.",
    sections: [
      {
        iconClass: "fa-solid fa-ranking-star",
        title: "Ranking",
        text:
          "Bar length shows I divided by the region's fixed model population, with the largest infectious shares at the top. Bar colors match the region's cluster in Partition Exposure and follow the selected community scale.",
      },
      {
        iconClass: "fa-solid fa-percent",
        title: "Labels",
        text:
          "Each label combines the infectious percentage with the infectious count in synthetic model units.",
      },
      {
        iconClass: "fa-solid fa-map-location-dot",
        title: "Map link",
        text:
          "Use the list with the map to inspect the geographic pattern of regional infectious shares.",
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
      {!hasSupportedScreen && <ScreenSizeNotice reason={screenRequirement} minimumWidth={minimumViewportWidth} />}
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
          onChangePresetSettings={comparison.changePresetSettings}
          onSaveScenario={comparison.saveScenario}
          onLoadScenario={comparison.loadScenario}
        />
        <div
          id="herdlinkTooltip"
          className="herdlink-tooltip"
          role="tooltip"
          aria-hidden="true"
        ></div>
        <div id="mainContainer">
          <LeftPanel />
          <NetworkPanel onOpenComparison={comparison.toggle} />
          <RightPanel />
        </div>
      </div>
    </>
  );
}
