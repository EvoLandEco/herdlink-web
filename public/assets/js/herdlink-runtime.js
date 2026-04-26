(() => {
  let initialized = false;

  function initHerdLinkRuntime() {
    if (initialized) {
      return;
    }

    initialized = true;

    // Global state
          let loadedCSVData = null;
          let uniqueDates = [];
          let temporalUpdateTimeout;
          window.allTemporalStats = {};
          window.allTemporalNodeStats = {};
          let hasTime = false;
          let currentTimeSpan;
          window.isPlaying = false;
          window.isSwitchingCSV = false;
          window.isSwitchingAppMode = false;
          let isDoingTemporalUpdate = false;
          window.isDoingTemporalUpdate = false;
          const svg = d3.select("#col2 svg");
          let containerCol2 = document.getElementById("col2");
          let w = containerCol2.clientWidth,
            h = containerCol2.clientHeight;
          svg.attr("viewBox", `0 0 ${w} ${h}`);
          let currentMode = "map";
          const controlTips = {
            switchToMap: "Switch to map view (M)",
            switchToGraph: "Switch to graph view (M)",
            play: "Play time steps (Space)",
            pause: "Pause time steps (Space)",
            fromStart: "Jump to first time step (F)",
            hotspotInfo: "Show hotspot details",
          };
          function setControlTip(element, tip) {
            if (!element) return;
            element.setAttribute("aria-label", tip);
            element.setAttribute("data-tip", tip);
          }
          function setModeControlTip(tip) {
            setControlTip(document.getElementById("toggleModeButton"), tip);
            setControlTip(
              document.querySelector(".toggle-button-container"),
              tip,
            );
          }
          setModeControlTip(controlTips.switchToGraph);
          let nlMapData = null,
            nlLabelPoints = null;
          let forceSim = null,
            linkGroup,
            linkSelection,
            nodeGroup,
            nodeEnter,
            labelSelection;
          let allLinks = [],
            allNodes = [],
            enabledLinks = [],
            nonZeroLinks = [];
          let selectedNodeData = null;
          let hotspots = null;
          let hotspotsMax = null;
          const numberPrintedHotspots = 3;
          let edgeExtent, edgeColor, nodeColor, nodeSize;
          const metricDisplayNames = {
            inDegree: "Vulnerable (by In-Degree)",
            outDegree: "Seeding (by Out-Degree)",
            betweenness: "Bottleneck (by Betweenness)",
            pageRank: "Sink (by PageRank)",
            eigenvector: "Amplifier (by Eigenvector)",
          };
          const hotspotColors = {
            inDegree: "#08FF08", // Fluorescent Green
            outDegree: "#05C3DD", // Aqua Blue
            betweenness: "#ff007f", // Bright Pink
            pageRank: "#FFD600", // Vivid Yellow
            eigenvector: "#8a2be2", // Strong Purple
          };
          let newSCCs;
          const nodeAnnoType = d3.annotationCallout;
          const linkAnnoType = d3.annotationCallout;
          const currentDateAnnoType = d3.annotationCalloutCircle;
          let hoveredNode = null;
          let hoveredLink = null;
          let hoveredLinkElement = null;
          let annotationGroup = null;
          let lastRadarData = null;
          const metricNames = [
            "inDegree",
            "outDegree",
            "betweenness",
            "pageRank",
            "eigenvector",
          ];
          let topNMetric = {};
          let preYDomainGlobalStats = null;
          let preYDomainNodeStats = null;
          const simulationCompartmentColors = {
            S: "#7bb661",
            E: "#f2c94c",
            I: "#eb5757",
            R: "#4f83cc",
          };
          const simulationCompartmentLabels = {
            S: "Susceptible",
            E: "Exposed",
            I: "Infectious",
            R: "Recovered",
          };
          const simulationPrevalenceScale = d3
            .scaleSequential(
              d3.interpolateRgbBasis([
                "#e5efd8",
                "#9fbe7c",
                "#d4bd69",
                "#d88a4f",
                "#b94f45",
                "#74353d",
              ]),
            )
            .domain([0, 0.35])
            .clamp(true);
          const simulationPrevalenceTextScale = d3
            .scaleSequential(
              d3.interpolateRgbBasis([
                "#4f6a3d",
                "#58713f",
                "#80642c",
                "#8c4c30",
                "#793536",
                "#5c2d36",
              ]),
            )
            .domain([0, 0.35])
            .clamp(true);
          let appDataMode = "trade";
          const appModeSwitchBounceMs = 550;
          const modePanelRenderingReleaseMs = 340;
          let appModeSwitchTimer = null;
          let appModeSwitchLocked = false;
          let modePanelRenderingFrame = null;
          let modePanelRenderingTimer = null;
          let simulationRunId = 0;
          let updateNetworkForDateHandler = null;
          let simulationRecomputeTimer = null;
          let simulationState = {
            status: "idle",
            settings: null,
            trajectory: null,
            currentFrame: null,
            currentDateKey: null,
            metricMax: null,
          };

          function isSimulationModeActive() {
            return appDataMode === "simulation";
          }

          function getNodeId(value) {
            return typeof value === "object" ? value.id : value;
          }

          function getLinkKey(source, target) {
            return `${getNodeId(source)}-${getNodeId(target)}`;
          }

          function formatCount(value) {
            const num = Number(value) || 0;
            return d3.format(",.0f")(num);
          }

          function formatSmall(value) {
            const num = Number(value) || 0;
            if (Math.abs(num) >= 100) return d3.format(",.0f")(num);
            if (Math.abs(num) >= 10) return d3.format(",.1f")(num);
            return d3.format(",.2f")(num);
          }

          function formatPct(value) {
            const num = Number(value) || 0;
            return `${(100 * num).toFixed(num >= 0.1 ? 1 : 2)}%`;
          }

          function transitionSelection(selection, duration = 300) {
            return selection.interrupt().transition().duration(duration);
          }

          function renderSimulationDateMarker(
            root,
            { x, date, height, rangeWidth = 12, lineColor = "#9ca3af" },
          ) {
            if (!date) return;
            const cx = x(date);
            const rangeX = cx - rangeWidth / 2;

            const range = root
              .selectAll("rect.simulation-current-range")
              .data([date]);
            range
              .enter()
              .insert("rect", ":first-child")
              .attr("class", "simulation-current-range")
              .attr("x", rangeX)
              .attr("y", 0)
              .attr("width", rangeWidth)
              .attr("height", height)
              .attr("rx", 3)
              .attr("ry", 3)
              .style("fill", "rgba(107, 114, 128, 0.18)")
              .merge(range)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", rangeX)
                  .attr("width", rangeWidth)
                  .attr("height", height),
              );
            range.exit().remove();

            const line = root
              .selectAll("line.simulation-current-line")
              .data([date]);
            line
              .enter()
              .append("line")
              .attr("class", "simulation-current-line")
              .attr("x1", cx)
              .attr("x2", cx)
              .attr("y1", 0)
              .attr("y2", height)
              .style("stroke", lineColor)
              .merge(line)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x1", cx)
                  .attr("x2", cx)
                  .attr("y2", height)
                  .style("stroke", lineColor),
              )
              .raise();
            line.exit().remove();
          }

          function measureSimulationCalloutText(root, text) {
            const measuringText = root
              .append("text")
              .attr("class", "simulation-compartment-callout-text")
              .attr("visibility", "hidden")
              .text(text);
            const measuredWidth =
              measuringText.node()?.getComputedTextLength?.() || 0;
            measuringText.remove();
            return measuredWidth;
          }

          function renderSimulationCompartmentCallout(root, x, y, current, width, height) {
            if (!current) return;
            const summary = current.summary;
            const cx = x(current.date);
            const keys = ["S", "E", "I", "R"];
            const labelPaddingX = 8;
            const maxLabelWidth = Math.max(40, width - 8);
            const labelHeight = 18;
            const labelGap = 5;
            const gap = 14;
            const minLabelY = 2;
            const maxLabelY = Math.max(minLabelY, height - labelHeight - 2);
            let lower = 0;
            const layout = keys.map((key) => {
              const value = summary[key] || 0;
              const share = summary.N ? value / summary.N : 0;
              const labelText = `${key}: ${formatCount(value)} (${formatPct(share)})`;
              const labelWidth = Math.min(
                maxLabelWidth,
                Math.ceil(
                  measureSimulationCalloutText(root, labelText) +
                    labelPaddingX * 2,
                ),
              );
              const midpoint = lower + value / 2;
              lower += value;
              const anchorY = Math.max(0, Math.min(height, y(midpoint)));
              return {
                key,
                value,
                share,
                color: simulationCompartmentColors[key],
                anchorX: cx,
                anchorY,
                labelText,
                labelWidth,
                labelY: Math.max(
                  minLabelY,
                  Math.min(maxLabelY, anchorY - labelHeight / 2),
                ),
              };
            });
            const widestLabel = Math.max(...layout.map((item) => item.labelWidth));
            const labelSide =
              cx + gap + widestLabel <= width || cx - gap - widestLabel < 0
                ? "right"
                : "left";
            layout.forEach((item) => {
              item.labelX =
                labelSide === "right"
                  ? Math.min(width - item.labelWidth, cx + gap)
                  : Math.max(0, cx - item.labelWidth - gap);
            });

            const orderedLayout = [...layout].sort((a, b) => a.labelY - b.labelY);
            orderedLayout.forEach((item, index) => {
              if (index === 0) return;
              item.labelY = Math.max(
                item.labelY,
                orderedLayout[index - 1].labelY + labelHeight + labelGap,
              );
            });
            const overflow =
              orderedLayout.length > 0
                ? orderedLayout[orderedLayout.length - 1].labelY - maxLabelY
                : 0;
            if (overflow > 0) {
              orderedLayout.forEach((item) => {
                item.labelY = Math.max(minLabelY, item.labelY - overflow);
              });
              orderedLayout.forEach((item, index) => {
                if (index === 0) return;
                item.labelY = Math.max(
                  item.labelY,
                  orderedLayout[index - 1].labelY + labelHeight + labelGap,
                );
              });
            }

            root.selectAll("g.simulation-current-callout").remove();

            const group = root
              .selectAll("g.simulation-compartment-callouts")
              .data([d3.timeFormat("%Y-%m-%d")(current.date)]);
            const enteredGroup = group
              .enter()
              .append("g")
              .attr("class", "simulation-compartment-callouts");
            const mergedGroup = enteredGroup.merge(group);

            const points = mergedGroup
              .selectAll("circle.simulation-compartment-callout-point")
              .data(layout, (d) => d.key);
            points
              .enter()
              .append("circle")
              .attr("class", "simulation-compartment-callout-point")
              .attr("cx", (d) => d.anchorX)
              .attr("cy", (d) => d.anchorY)
              .attr("r", 0)
              .attr("fill", (d) => d.color)
              .merge(points)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("cx", (d) => d.anchorX)
                  .attr("cy", (d) => d.anchorY)
                  .attr("r", 4.5)
                  .attr("fill", (d) => d.color),
              );
            points.exit().remove();

            const labels = mergedGroup
              .selectAll("g.simulation-compartment-callout-label")
              .data(layout, (d) => d.key);
            const enteredLabels = labels
              .enter()
              .append("g")
              .attr("class", "simulation-compartment-callout-label")
              .style("opacity", 0);
            enteredLabels
              .append("line")
              .attr("class", "simulation-compartment-callout-connector");
            enteredLabels
              .append("rect")
              .attr("class", "simulation-compartment-callout-bg")
              .attr("rx", 4)
              .attr("ry", 4)
              .attr("height", labelHeight);
            enteredLabels
              .append("text")
              .attr("class", "simulation-compartment-callout-text")
              .attr("x", labelPaddingX)
              .attr("y", 13);

            const mergedLabels = enteredLabels.merge(labels);
            transitionSelection(mergedLabels)
              .attr("transform", (d) => `translate(${d.labelX},${d.labelY})`)
              .style("opacity", 1);
            mergedLabels
              .select("rect.simulation-compartment-callout-bg")
              .attr("width", (d) => d.labelWidth)
              .attr("height", labelHeight);
            mergedLabels
              .select("line.simulation-compartment-callout-connector")
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x1", (d) => (d.labelX < cx ? d.labelWidth : 0))
                  .attr("y1", labelHeight / 2)
                  .attr("x2", (d) => d.anchorX - d.labelX)
                  .attr("y2", (d) => d.anchorY - d.labelY),
              );
            mergedLabels
              .select("text.simulation-compartment-callout-text")
              .text((d) => d.labelText);
            labels
              .exit()
              .call((selection) =>
                transitionSelection(selection).style("opacity", 0).remove(),
              );
            group.exit().remove();
            mergedGroup.raise();
          }

          function getReadablePrevalenceTextColor(value) {
            const color = d3.color(simulationPrevalenceScale(value));
            if (!color) return "#172218";
            const luminance =
              (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
            return luminance < 0.56 ? "#fff" : "#172218";
          }

          function clampNumber(value, min, max) {
            return Math.min(max, Math.max(min, value));
          }

          function setTradeEdgeScales(links) {
            const weightedLinks = links.filter((link) => link.weight > 0);
            edgeExtent = d3.extent(weightedLinks, (d) => Math.log(d.weight));
            if (edgeExtent[0] == null || edgeExtent[1] == null) {
              edgeExtent = [0, 1];
            }
            edgeColor = d3
              .scaleSequential(d3.interpolateSpectral)
              .domain([edgeExtent[1], edgeExtent[0]]);
          }

          function createSeededRandom(seed) {
            let state = Number(seed) || 1;
            state = Math.abs(Math.floor(state)) % 2147483647;
            if (state === 0) state = 1;
            return function () {
              state = (state * 16807) % 2147483647;
              return (state - 1) / 2147483646;
            };
          }

          function getCurrentSliderDate() {
            const slider = document.getElementById("timeSlider");
            if (!slider || !uniqueDates.length) {
              return window.currentDate || uniqueDates[0] || null;
            }
            const idx = clampNumber(+slider.value || 0, 0, uniqueDates.length - 1);
            return uniqueDates[idx];
          }

          function ensureSimulationControls() {
            let panel = document.getElementById("simulationControls");
            if (panel) return panel;

            panel = document.createElement("div");
            panel.id = "simulationControls";
            panel.className = "simulation-controls-panel";
            panel.hidden = true;
            panel.innerHTML = `
              <div class="simulation-controls-title">
                <span class="simulation-controls-heading-text">
                  <i class="fa-solid fa-flask"></i> Simulation Controls
                </span>
                <button
                  class="panel-info-button simulation-controls-info has-tip"
                  type="button"
                  data-tip-key="simulationControls"
                  data-tip-placement="left"
                  aria-label="Simulation settings guide"
                >
                  <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                </button>
              </div>
              <div class="simulation-control-grid">
                <label>
                  Model
                  <select id="simulationModel">
                    <option value="SEIR">SEIR</option>
                    <option value="SIR">SIR</option>
                    <option value="SIS">SIS</option>
                    <option value="SEIRS">SEIRS</option>
                  </select>
                </label>
                <label>
                  Seed
                  <input id="simulationSeed" type="number" min="1" max="999999" step="1" value="2026">
                </label>
                <label>
                  Seed regions
                  <input id="simulationSeedCount" type="number" min="1" max="8" step="1" value="2">
                </label>
                <label>
                  Initial %
                  <input id="simulationInitialPct" type="number" min="0.05" max="20" step="0.05" value="1">
                </label>
                <label>
                  Contact beta
                  <input id="simulationBeta" type="number" min="0" max="2" step="0.01" value="0.32">
                </label>
                <label>
                  Movement beta
                  <input id="simulationMovementBeta" type="number" min="0" max="2" step="0.01" value="0.08">
                </label>
                <label>
                  Latency
                  <input id="simulationSigma" type="number" min="0" max="1" step="0.01" value="0.22">
                </label>
                <label>
                  Recovery
                  <input id="simulationGamma" type="number" min="0" max="1" step="0.01" value="0.15">
                </label>
              </div>
            `;

            document.getElementById("col3")?.appendChild(panel);
            return panel;
          }

          function readSimulationSettings() {
            ensureSimulationControls();
            return {
              model: document.getElementById("simulationModel")?.value || "SEIR",
              seed: Math.max(
                1,
                +(document.getElementById("simulationSeed")?.value || 2026),
              ),
              seedCount: clampNumber(
                +(document.getElementById("simulationSeedCount")?.value || 2),
                1,
                8,
              ),
              initialPct: clampNumber(
                +(document.getElementById("simulationInitialPct")?.value || 1),
                0.05,
                20,
              ),
              beta: clampNumber(
                +(document.getElementById("simulationBeta")?.value || 0.32),
                0,
                2,
              ),
              movementBeta: clampNumber(
                +(document.getElementById("simulationMovementBeta")?.value || 0.08),
                0,
                2,
              ),
              sigma: clampNumber(
                +(document.getElementById("simulationSigma")?.value || 0.22),
                0,
                1,
              ),
              gamma: clampNumber(
                +(document.getElementById("simulationGamma")?.value || 0.15),
                0,
                1,
              ),
            };
          }

          function ensureSimulationLoadingOverlay() {
            let overlay = document.getElementById("simulationLoadingOverlay");
            if (overlay) return overlay;

            overlay = document.createElement("div");
            overlay.id = "simulationLoadingOverlay";
            overlay.className = "simulation-loading-overlay";
            overlay.setAttribute("aria-hidden", "true");
            overlay.innerHTML = `
              <div class="simulation-loading-panel">
                <div class="simulation-loading-header">
                  <i class="fa-solid fa-flask"></i>
                  <div>
                    <div class="simulation-loading-title">Preparing simulation</div>
                    <div id="simulationLoadingStage" class="simulation-loading-stage">Starting</div>
                  </div>
                  <div id="simulationLoadingPercent" class="simulation-loading-percent">0%</div>
                </div>
                <div class="simulation-progress-track">
                  <div id="simulationProgressBar" class="simulation-progress-bar"></div>
                </div>
                <div id="simulationProgressItems" class="simulation-progress-items"></div>
              </div>
            `;
            document.getElementById("col2")?.appendChild(overlay);
            return overlay;
          }

          function setSimulationOverlay(progress, stage, activeKey) {
            const overlay = ensureSimulationLoadingOverlay();
            overlay.classList.add("is-visible");
            overlay.setAttribute("aria-hidden", "false");
            const pct = clampNumber(progress, 0, 100);
            document.getElementById("simulationLoadingStage").textContent = stage;
            document.getElementById("simulationLoadingPercent").textContent =
              `${Math.round(pct)}%`;
            document.getElementById("simulationProgressBar").style.width =
              `${pct}%`;

            const items = [
              ["ledger", "Scanning trade ledger"],
              ["holdings", "Estimating holdings"],
              ["contacts", "Building movement contacts"],
              ["states", "Integrating compartments"],
              ["frames", "Building replay ledger"],
              ["render", "Rendering panels"],
            ];
            const activeIndex = Math.max(
              0,
              items.findIndex((item) => item[0] === activeKey),
            );
            document.getElementById("simulationProgressItems").innerHTML = items
              .map(([key, label], index) => {
                const state =
                  key === activeKey
                    ? "is-running"
                    : index < activeIndex
                      ? "is-done"
                      : "";
                return `<div class="simulation-progress-item ${state}">
                  <span class="simulation-progress-dot"></span>
                  <span>${label}</span>
                </div>`;
              })
              .join("");
          }

          function hideSimulationOverlay() {
            const overlay = ensureSimulationLoadingOverlay();
            overlay.classList.remove("is-visible");
            overlay.setAttribute("aria-hidden", "true");
          }

          function delaySimulationStage() {
            return new Promise((resolve) => {
              requestAnimationFrame(() => setTimeout(resolve, 80));
            });
          }

          function setSimulationPanelLabels(active) {
            const labels = active
              ? {
                  distribution:
                    {
                      html: '<i class="fa-solid fa-map-location-dot"></i> Spatial Spread:',
                      tipKey: "spatialSpread",
                      label: "Spatial spread guide",
                      placement: "right",
                    },
                  clusters:
                    {
                      html: '<i class="fa-solid fa-diagram-project"></i> Partition Exposure:',
                      tipKey: "partitionExposure",
                      label: "Partition exposure guide",
                      placement: "right",
                    },
                  nodeDistribution:
                    {
                      html: '<i class="fa-solid fa-chart-line"></i> Focus Trajectory:',
                      tipKey: "focusTrajectory",
                      label: "Focus trajectory guide",
                      placement: "right",
                    },
                  nodeInsight:
                    {
                      html: '<i class="fa-solid fa-stethoscope"></i> Focus Simulation:',
                      tipKey: "focusSimulation",
                      label: "Focus simulation guide",
                      placement: "right",
                    },
                  arbo: {
                    html: '<i class="fa-solid fa-sitemap"></i> Main Exposure Backbone',
                    tipKey: "exposureBackbone",
                    label: "Main exposure backbone guide",
                    placement: "top",
                  },
                }
              : {
                  distribution:
                    {
                      html: '<i class="fa-regular fa-chart-scatter-bubble"></i> Gravity Model:',
                      tipKey: "gravityModel",
                      label: "Gravity model guide",
                      placement: "right",
                    },
                  clusters:
                    {
                      html: '<i class="fa-regular fa-circle-nodes"></i> Trade Clusters:',
                      tipKey: "tradeClusters",
                      label: "Trade clusters guide",
                      placement: "right",
                    },
                  nodeDistribution:
                    {
                      html: '<i class="fa-regular fa-chart-scatter-bubble"></i> Gravity Model (Node):',
                      tipKey: "nodeGravityModel",
                      label: "Node gravity model guide",
                      placement: "right",
                    },
                  nodeInsight:
                    {
                      html: '<i class="fa-regular fa-circle-nodes"></i> Focus Insights:',
                      tipKey: "focusInsights",
                      label: "Focus insights guide",
                      placement: "right",
                    },
                  arbo: {
                    html: '<i class="fa-solid fa-sitemap"></i> Major Export Structure',
                    tipKey: "exportBackbone",
                    label: "Major export structure guide",
                    placement: "top",
                  },
                };

            function setPanelLabel(selector, config) {
              const label = d3.select(selector);
              const text = label.select(".panel-label-text");
              if (text.empty()) {
                label.html(`
                  <span class="panel-label-text">${config.html}</span>
                  <button
                    class="panel-info-button has-tip"
                    type="button"
                    data-tip-key="${config.tipKey}"
                    data-tip-placement="${config.placement || "right"}"
                    aria-label="${config.label}"
                  >
                    <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                  </button>
                `);
              } else {
                text.html(config.html);
                label
                  .select(".panel-info-button")
                  .attr("data-tip-key", config.tipKey)
                  .attr("data-tip-placement", config.placement || "right")
                  .attr("aria-label", config.label);
              }
            }

            setPanelLabel(".trade-distribution-label", labels.distribution);
            setPanelLabel(".trade-clusters-label", labels.clusters);
            setPanelLabel(
              ".trade-node-distribution-label",
              labels.nodeDistribution,
            );
            setPanelLabel(".trade-nodeinsight-label", labels.nodeInsight);
            setPanelLabel(".inArboTitle", labels.arbo);
          }

          function collectSimulationRegionIds(data) {
            const ids = new Set();
            for (let i = 1; i <= 40; i++) {
              ids.add("CR" + (i < 10 ? "0" + i : i));
            }
            data.forEach((row) => {
              const source = row.COROP_LEV;
              const target = row.COROP_AFN;
              if (source && source.toUpperCase() !== "NA") ids.add(source);
              if (target && target.toUpperCase() !== "NA") ids.add(target);
            });
            return Array.from(ids).sort((a, b) => {
              const aNum = parseInt(String(a).replace("CR", ""));
              const bNum = parseInt(String(b).replace("CR", ""));
              return aNum - bNum;
            });
          }

          function buildSimulationLedger(data, ids) {
            const ledgerByDate = new Map(
              uniqueDates.map((date) => [date.getTime(), []]),
            );
            const totals = new Map(ids.map((id) => [id, 0]));

            data.forEach((row) => {
              const source = row.COROP_LEV;
              const target = row.COROP_AFN;
              const weight = Math.max(0, +row.AANTAL || 0);
              if (
                !source ||
                !target ||
                source.toUpperCase() === "NA" ||
                target.toUpperCase() === "NA" ||
                !weight
              ) {
                return;
              }

              const dateKey = row.time instanceof Date ? row.time.getTime() : null;
              if (ledgerByDate.has(dateKey)) {
                ledgerByDate.get(dateKey).push({ source, target, weight });
              }
              totals.set(source, (totals.get(source) || 0) + weight);
              totals.set(target, (totals.get(target) || 0) + weight * 0.7);
            });

            return { ledgerByDate, totals };
          }

          function estimateSimulationHoldings(ids, totals) {
            const positive = ids
              .map((id) => Math.log1p(totals.get(id) || 0))
              .filter((value) => value > 0);
            const minLog = d3.min(positive) || 0;
            const maxLog = d3.max(positive) || 1;
            const span = maxLog - minLog || 1;
            const holdings = new Map();

            ids.forEach((id) => {
              const score = Math.log1p(totals.get(id) || 0);
              const scaled = score > 0 ? (score - minLog) / span : 0;
              holdings.set(id, Math.round(450 + scaled * 9550));
            });

            return holdings;
          }

          function chooseSimulationSeeds(ids, holdings, settings) {
            const rng = createSeededRandom(settings.seed);
            const chosen = new Set();
            const weightedIds = ids
              .map((id) => ({ id, weight: Math.max(1, holdings.get(id) || 1) }))
              .sort((a, b) => b.weight - a.weight);

            while (chosen.size < settings.seedCount && chosen.size < ids.length) {
              const remaining = weightedIds.filter((item) => !chosen.has(item.id));
              const total = d3.sum(remaining, (item) => item.weight);
              let draw = rng() * total;
              let selected = remaining[0]?.id;
              for (const item of remaining) {
                draw -= item.weight;
                if (draw <= 0) {
                  selected = item.id;
                  break;
                }
              }
              if (selected) chosen.add(selected);
            }

            return Array.from(chosen);
          }

          function getSimulationFrameSummary(nodeStates) {
            const summary = { S: 0, E: 0, I: 0, R: 0, N: 0, newInfections: 0 };
            Object.values(nodeStates).forEach((state) => {
              summary.S += state.S;
              summary.E += state.E;
              summary.I += state.I;
              summary.R += state.R;
              summary.N += state.N;
              summary.newInfections += state.newInfections || 0;
            });
            summary.prevalence = summary.N ? summary.I / summary.N : 0;
            summary.exposedShare = summary.N ? summary.E / summary.N : 0;
            return summary;
          }

          function buildSimulationTrajectory(settings) {
            if (!loadedCSVData || !uniqueDates.length) return null;

            const ids = collectSimulationRegionIds(loadedCSVData);
            const { ledgerByDate, totals } = buildSimulationLedger(
              loadedCSVData,
              ids,
            );
            const holdings = estimateSimulationHoldings(ids, totals);
            const seedIds = chooseSimulationSeeds(ids, holdings, settings);
            let current = new Map();

            ids.forEach((id) => {
              const N = holdings.get(id) || 450;
              current.set(id, { S: N, E: 0, I: 0, R: 0, N });
            });

            seedIds.forEach((id) => {
              const state = current.get(id);
              if (!state) return;
              const seeded = Math.max(1, (settings.initialPct / 100) * state.N);
              state.I = Math.min(state.N, seeded);
              state.S = Math.max(0, state.N - state.I);
            });

            const frameByKey = {};
            const frames = [];

            uniqueDates.forEach((date) => {
              const records = ledgerByDate.get(date.getTime()) || [];
              const incomingLoad = new Map(ids.map((id) => [id, 0]));
              const outgoingLoad = new Map(ids.map((id) => [id, 0]));
              const newInfectionByNode = new Map(ids.map((id) => [id, 0]));
              const linkStates = new Map();

              records.forEach((record) => {
                const sourceState = current.get(record.source);
                const targetState = current.get(record.target);
                if (!sourceState || !targetState || !sourceState.N || !targetState.N) {
                  return;
                }
                const sourcePrev = sourceState.I / sourceState.N;
                const targetPrev = targetState.I / targetState.N;
                const riskLoad = record.weight * sourcePrev * settings.movementBeta;
                const key = getLinkKey(record.source, record.target);
                const existing = linkStates.get(key) || {
                  source: record.source,
                  target: record.target,
                  ledgerWeight: 0,
                  riskLoad: 0,
                  sourcePrevalence: sourcePrev,
                  targetPrevalence: targetPrev,
                };
                existing.ledgerWeight += record.weight;
                existing.riskLoad += riskLoad;
                existing.sourcePrevalence = sourcePrev;
                existing.targetPrevalence = targetPrev;
                linkStates.set(key, existing);
                incomingLoad.set(
                  record.target,
                  (incomingLoad.get(record.target) || 0) + riskLoad,
                );
                outgoingLoad.set(
                  record.source,
                  (outgoingLoad.get(record.source) || 0) + riskLoad,
                );
              });

              const next = new Map();
              ids.forEach((id) => {
                const state = current.get(id);
                const N = state.N || 1;
                const prevalence = state.I / N;
                const localForce = settings.beta * prevalence;
                const movementForce = (incomingLoad.get(id) || 0) / N;
                const force = localForce + movementForce;
                const entering = Math.min(
                  state.S,
                  state.S * (1 - Math.exp(-force)),
                );
                newInfectionByNode.set(id, entering);
                const localShare = force > 0 ? localForce / force : 0;
                const localLoad = entering * localShare;
                const exposedStep =
                  settings.model === "SEIR" || settings.model === "SEIRS";
                const toInfectious = exposedStep
                  ? Math.min(state.E, state.E * settings.sigma)
                  : entering;
                const toExposed = exposedStep ? entering : 0;
                const recovered = Math.min(state.I, state.I * settings.gamma);
                const waning =
                  settings.model === "SIS"
                    ? recovered
                    : settings.model === "SEIRS"
                      ? Math.min(state.R, state.R * 0.02)
                      : 0;

                const S = Math.max(0, state.S - entering + waning);
                const E = Math.max(
                  0,
                  exposedStep ? state.E + toExposed - toInfectious : 0,
                );
                const I = Math.max(0, state.I + toInfectious - recovered);
                const R =
                  settings.model === "SIS"
                    ? 0
                    : Math.max(0, state.R + recovered - waning);
                next.set(id, { S, E, I, R, N });

                if (localLoad > 0) {
                  const key = getLinkKey(id, id);
                  linkStates.set(key, {
                    source: id,
                    target: id,
                    ledgerWeight: 0,
                    riskLoad: localLoad,
                    sourcePrevalence: prevalence,
                    targetPrevalence: prevalence,
                    local: true,
                  });
                }
              });

              current = next;

              const nodeStates = {};
              const nodeMetrics = {};
              ids.forEach((id) => {
                const state = current.get(id);
                const incoming = incomingLoad.get(id) || 0;
                const outgoing = outgoingLoad.get(id) || 0;
                const prevalence = state.N ? state.I / state.N : 0;
                const exposedShare = state.N ? state.E / state.N : 0;
                const recoveredShare = state.N ? state.R / state.N : 0;
                const newInfections = newInfectionByNode.get(id) || 0;
                nodeStates[id] = {
                  ...state,
                  prevalence,
                  exposedShare,
                  recoveredShare,
                  incomingExposure: incoming,
                  outgoingPressure: outgoing,
                  newInfections: Math.max(0, newInfections),
                  rtProxy: outgoing / Math.max(1, state.I),
                };
                nodeMetrics[id] = {
                  inDegree: incoming,
                  outDegree: outgoing,
                  betweenness: prevalence,
                  pageRank: state.I,
                  eigenvector: outgoing / Math.max(1, state.I),
                };
              });

              const summary = getSimulationFrameSummary(nodeStates);
              const frame = {
                date,
                key: date.toISOString(),
                nodeStates,
                linkStates,
                nodeMetrics,
                summary,
                seedIds,
              };
              frameByKey[frame.key] = frame;
              frames.push(frame);
            });

            const metricMax = {};
            metricNames.forEach((metric) => {
              metricMax[metric] =
                d3.max(frames, (frame) =>
                  d3.max(Object.values(frame.nodeMetrics), (node) => node[metric]),
                ) || 1;
            });

            return {
              settings,
              ids,
              holdings,
              seedIds,
              frames,
              frameByKey,
              metricMax,
            };
          }

          function applySimulationFrame(dateObj) {
            if (!isSimulationModeActive() || !simulationState.trajectory) {
              return false;
            }
            const key = dateObj?.toISOString();
            const frame =
              simulationState.trajectory.frameByKey[key] ||
              simulationState.trajectory.frames[0];
            if (!frame) return false;

            simulationState.currentFrame = frame;
            simulationState.currentDateKey = frame.key;
            simulationState.metricMax = simulationState.trajectory.metricMax;
            hotspots = frame.nodeMetrics;
            hotspotsMax = frame.metricMax || simulationState.metricMax;

            allNodes.forEach((node) => {
              const state = frame.nodeStates[node.id];
              if (!state) return;
              const partition =
                window.allTemporalStats?.[frame.key]?.partition || {};
              node.community = partition[node.id];
              node.holding = state.N;
              node.tradeTotal = state.N;
              node.active = state.N > 0;
              node.simulation = state;
            });

            allLinks.forEach((link) => {
              const key = getLinkKey(link.source, link.target);
              const simLink = frame.linkStates.get(key);
              link.ledgerWeight = Math.max(0, +link.weight || 0);
              link.simulation = simLink || {
                source: getNodeId(link.source),
                target: getNodeId(link.target),
                ledgerWeight: link.ledgerWeight,
                riskLoad: 0,
                sourcePrevalence: 0,
                targetPrevalence: 0,
              };
              link.weight = link.simulation.riskLoad;
              link.disabled = false;
            });

            enabledLinks = allLinks.filter((link) => !link.disabled && link.weight > 0);
            nonZeroLinks = allLinks.filter((link) => link.weight > 0);
            activeNodes = allNodes.filter((node) => node.active);
            edgeExtent = d3.extent(nonZeroLinks, (link) => Math.log(link.weight));
            if (!edgeExtent[0] || !edgeExtent[1]) {
              edgeExtent = [0, 1];
            }
            edgeColor = d3
              .scaleSequential(d3.interpolateYlOrRd)
              .domain([edgeExtent[0], edgeExtent[1]]);
            return true;
          }

          function getSimulationSeries() {
            const trajectory = simulationState.trajectory;
            if (!trajectory) return [];
            return trajectory.frames.map((frame) => ({
              date: frame.date,
              S: frame.summary.S,
              E: frame.summary.E,
              I: frame.summary.I,
              R: frame.summary.R,
              N: frame.summary.N,
              prevalence: frame.summary.prevalence,
              newInfections: frame.summary.newInfections,
            }));
          }

          function renderSimulationStatsContainer() {
            const frame = simulationState.currentFrame;
            if (!frame) return;
            const summary = frame.summary;
            const peak = d3.max(
              simulationState.trajectory.frames,
              (item) => item.summary.prevalence,
            );
            const rows = [
              ["fa-solid fa-users", "Holding", formatCount(summary.N)],
              ["fa-solid fa-virus", "Infectious", formatCount(summary.I)],
              ["fa-solid fa-temperature-high", "Prevalence", formatPct(summary.prevalence)],
              ["fa-solid fa-arrow-trend-up", "New infections", formatCount(summary.newInfections)],
              ["fa-solid fa-shield-heart", "Recovered", formatCount(summary.R)],
              ["fa-solid fa-seedling", "Seeds", frame.seedIds.join(", ")],
            ];
            const container = d3.select(".statsContainer");
            container
              .classed("simulation-stats-container", true)
              .style("border", selectedNodeData ? "1px dashed white" : "1px dashed #eb5757")
              .style("background", selectedNodeData ? "rgba(255,255,255,0.05)" : "rgba(235,87,87,0.08)")
              .html("");
            rows.forEach(([icon, label, value]) => {
              const item = container
                .append("div")
                .attr("class", "stat-item simulation-stat-item")
                .style("color", selectedNodeData ? "white" : "gray");
              item.append("div").attr("class", "stat-icon").html(`<i class="${icon}"></i>`);
              item.append("span").attr("class", "stat-label").text(label);
              item.append("span").attr("class", "stat-value").text(value);
            });

            const displayElement = document.getElementById("networkTransRiskScore");
            if (displayElement) {
              displayElement.style.display = "block";
              displayElement.innerHTML = `
                <i class="fa-solid fa-virus"></i> Simulation Prevalence:
                <span class="current-sr">${formatPct(summary.prevalence)}</span>
                <span class="initial-sr">(peak ${formatPct(peak || 0)})</span>
              `;
              const currentSpan = displayElement.querySelector(".current-sr");
              const initialSpan = displayElement.querySelector(".initial-sr");
              if (currentSpan) {
                currentSpan.style.color = simulationPrevalenceTextScale(
                  summary.prevalence,
                );
              }
              if (initialSpan) {
                initialSpan.style.color = simulationPrevalenceTextScale(peak || 0);
              }
            }
          }

          function renderSimulationGlobalStatsChart() {
            const data = getSimulationSeries();
            if (!data.length) return;
            const container = d3.select("#globalStats");
            const node = container.node();
            const margin = { top: 68, right: 32, bottom: 30, left: 36 };
            const width = Math.max(10, node.clientWidth - margin.left - margin.right);
            const height = Math.max(10, node.clientHeight - margin.top - margin.bottom);
            container
              .selectAll(".simulation-panel-heading")
              .data([null])
              .join("div")
              .attr("class", "simulation-panel-heading panel-title-label")
              .html(`
                <span class="panel-label-text">
                  <i class="fa-solid fa-chart-area"></i> Compartment Trajectory
                </span>
                <button
                  class="panel-info-button has-tip"
                  type="button"
                  data-tip-key="compartmentTrajectory"
                  data-tip-placement="left"
                  aria-label="Compartment trajectory guide"
                >
                  <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                </button>
              `);
            let svg = container.select("svg.simulation-global-chart");
            if (svg.empty()) {
              container.selectAll("svg").remove();
              svg = container.append("svg").attr("class", "simulation-global-chart");
            }
            svg.attr("width", node.clientWidth).attr("height", node.clientHeight);
            let g = svg.select("g.chart");
            if (g.empty()) {
              g = svg.append("g").attr("class", "chart");
            }
            g.attr("transform", `translate(${margin.left},${margin.top})`);
            svg.selectAll(".simulation-chart-legend").remove();

            const keys = ["S", "E", "I", "R"];
            const x = d3
              .scaleTime()
              .domain(d3.extent(data, (d) => d.date))
              .range([0, width]);
            const y = d3
              .scaleLinear()
              .domain([0, d3.max(data, (d) => d.N) || 1])
              .nice()
              .range([height, 0]);
            const stacked = d3.stack().keys(keys)(data);
            const area = d3
              .area()
              .x((d) => x(d.data.date))
              .y0((d) => y(d[0]))
              .y1((d) => y(d[1]))
              .curve(d3.curveMonotoneX);

            const areaLayer = g
              .selectAll("g.simulation-area-layer")
              .data([null])
              .join("g")
              .attr("class", "simulation-area-layer");
            const axisLayer = g
              .selectAll("g.simulation-axis-layer")
              .data([null])
              .join("g")
              .attr("class", "simulation-axis-layer");
            const markerLayer = g
              .selectAll("g.simulation-marker-layer")
              .data([null])
              .join("g")
              .attr("class", "simulation-marker-layer");

            areaLayer
              .selectAll(".simulation-area")
              .data(stacked, (d) => d.key)
              .join(
                (enter) =>
                  enter
                    .append("path")
                    .attr("class", "simulation-area")
                    .attr("fill", (d) => simulationCompartmentColors[d.key])
                    .attr("fill-opacity", 0.72),
                (update) => update,
                (exit) => exit.remove(),
              )
              .attr("fill", (d) => simulationCompartmentColors[d.key])
              .attr("d", area);

            axisLayer
              .selectAll("g.y-grid")
              .data([null])
              .join("g")
              .attr("class", "y-grid")
              .call(
                d3
                  .axisLeft(y)
                  .ticks(4)
                  .tickSize(-width)
                  .tickFormat(d3.format("~s")),
              )
              .call((axis) => axis.select(".domain").remove());
            axisLayer
              .selectAll("g.x-axis")
              .data([null])
              .join("g")
              .attr("class", "x-axis")
              .attr("transform", `translate(0,${height})`)
              .call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat("%b %Y")));

            const current = simulationState.currentFrame;
            if (current) {
              renderSimulationDateMarker(markerLayer, {
                x,
                date: current.date,
                height,
                rangeWidth: 12,
                lineColor: "#6b7280",
              });
              renderSimulationCompartmentCallout(
                markerLayer,
                x,
                y,
                current,
                width,
                height,
              );
            } else {
              markerLayer.selectAll("*").remove();
            }

            const legendWidth = current
              ? keys.length * 42 + 82
              : getSimulationCompartmentLegendWidth(keys);
            const legend = svg
              .append("g")
              .attr("class", "simulation-chart-legend")
              .attr(
                "transform",
                `translate(${Math.max(margin.left, (node.clientWidth - legendWidth) / 2)},42)`,
              );
            keys.forEach((key, index) => {
              const item = legend
                .append("g")
                .attr("transform", `translate(${index * 42},0)`);
              item
                .append("rect")
                .attr("width", 9)
                .attr("height", 9)
                .attr("rx", 2)
                .attr("fill", simulationCompartmentColors[key]);
              item
                .append("text")
                .attr("x", 13)
                .attr("y", 9)
                .text(key);
            });
            if (current) {
              legend
                .append("text")
                .attr("class", "simulation-chart-date-legend")
                .attr("x", keys.length * 42 + 10)
                .attr("y", 9)
                .text(d3.timeFormat("%d-%m-%Y")(current.date));
            }
          }

          function renderSimulationNodeStatsChart() {
            const frame = simulationState.currentFrame;
            if (!frame) return;
            const container = d3.select("#nodeStats");
            const node = container.node();
            const margin = { top: 58, right: 22, bottom: 24, left: 52 };
            const width = Math.max(10, node.clientWidth - margin.left - margin.right);
            const height = Math.max(10, node.clientHeight - margin.top - margin.bottom);
            container
              .selectAll(".simulation-panel-heading")
              .data([null])
              .join("div")
              .attr("class", "simulation-panel-heading panel-title-label")
              .html(`
                <span class="panel-label-text">
                  <i class="fa-solid fa-temperature-high"></i> Highest Regional Prevalence
                </span>
                <button
                  class="panel-info-button has-tip"
                  type="button"
                  data-tip-key="highestRegionalPrevalence"
                  data-tip-placement="left"
                  aria-label="Highest regional prevalence guide"
                >
                  <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                </button>
              `);
            let svg = container.select("svg.simulation-node-chart");
            if (svg.empty()) {
              container.selectAll("svg").remove();
              svg = container.append("svg").attr("class", "simulation-node-chart");
            }
            svg.attr("width", node.clientWidth).attr("height", node.clientHeight);
            let g = svg.select("g.chart");
            if (g.empty()) g = svg.append("g").attr("class", "chart");
            g.attr("transform", `translate(${margin.left},${margin.top})`);
            svg.selectAll(".simulation-panel-title").remove();

            const data = Object.entries(frame.nodeStates)
              .map(([id, state]) => ({ id, ...state, statnaam: getStatnaam(id) }))
              .sort((a, b) => b.prevalence - a.prevalence)
              .slice(0, 12);
            const x = d3
              .scaleLinear()
              .domain([0, d3.max(data, (d) => d.prevalence) || 0.01])
              .range([0, width])
              .nice();
            const y = d3
              .scaleBand()
              .domain(data.map((d) => d.id))
              .range([0, height])
              .padding(0.24);

            g.selectAll("g.x-grid")
              .data([null])
              .join("g")
              .attr("class", "x-grid")
              .call(d3.axisTop(x).ticks(4).tickFormat((d) => formatPct(d)))
              .call((axis) => axis.select(".domain").remove());
            g.selectAll("g.y-axis")
              .data([null])
              .join("g")
              .attr("class", "y-axis")
              .call(d3.axisLeft(y));

            const bars = g.selectAll(".simulation-node-bar").data(data, (d) => d.id);
            const entered = bars
              .enter()
              .append("g")
              .attr("class", "simulation-node-bar")
              .attr("transform", (d) => `translate(0,${y(d.id)})`)
              .style("opacity", 0);
            entered
              .append("rect")
              .attr("height", y.bandwidth())
              .attr("rx", 3)
              .attr("width", 0)
              .attr("fill", (d) => simulationPrevalenceScale(d.prevalence));
            entered
              .append("text")
              .attr("y", y.bandwidth() / 2 + 4)
              .text((d) => `${formatPct(d.prevalence)} · ${formatCount(d.I)}`);

            const mergedBars = entered.merge(bars);
            transitionSelection(mergedBars)
              .attr("transform", (d) => `translate(0,${y(d.id)})`)
              .style("opacity", 1);
            mergedBars
              .select("rect")
              .call((selection) =>
                transitionSelection(selection)
                  .attr("height", y.bandwidth())
                  .attr("width", (d) => x(d.prevalence))
                  .attr("fill", (d) => simulationPrevalenceScale(d.prevalence)),
              );
            mergedBars
              .select("text")
              .attr("y", y.bandwidth() / 2 + 4)
              .text((d) => `${formatPct(d.prevalence)} · ${formatCount(d.I)}`)
              .each(function (d) {
                const label = d3.select(this);
                const barEnd = x(d.prevalence);
                const labelWidth = this.getComputedTextLength();
                const padding = 6;
                const fitsOutside = barEnd + padding + labelWidth <= width;
                if (labelWidth > width - padding * 2) {
                  label
                    .attr("textLength", width - padding * 2)
                    .attr("lengthAdjust", "spacingAndGlyphs");
                }
                if (fitsOutside) {
                  label
                    .attr("x", barEnd + padding)
                    .attr("text-anchor", "start")
                    .style("fill", "#172218");
                } else {
                  label
                    .attr(
                      "x",
                      Math.max(padding, Math.min(width - padding, barEnd - padding)),
                    )
                    .attr("text-anchor", "end")
                    .style("fill", getReadablePrevalenceTextColor(d.prevalence));
                }
              });
            bars
              .exit()
              .call((selection) =>
                transitionSelection(selection)
                  .style("opacity", 0)
                  .remove(),
              );
          }

          function getSimulationPanelProjection(width, height) {
            return d3
              .geoIdentity()
              .reflectY(true)
              .fitSize([width, height], nlMapData);
          }

          function renderSimulationSpatialLegend(svg, x, y) {
            const items = [
              { label: "Prevalence", type: "fill", color: "#bed9ad" },
              { label: "Exposure flow", type: "line", color: "#f2c94c" },
              { label: "New cases", type: "circle", color: "#2e8d34" },
            ];
            const legend = svg
              .selectAll("g.simulation-spatial-mini-legend")
              .data([null])
              .join("g")
              .attr("class", "simulation-spatial-mini-legend")
              .attr("transform", `translate(${x},${y})`);
            const rows = legend
              .selectAll("g.simulation-spatial-mini-legend-row")
              .data(items, (item) => item.label)
              .join("g")
              .attr("class", "simulation-spatial-mini-legend-row")
              .attr("transform", (item, index) => `translate(0,${index * 15})`);

            rows
              .selectAll("rect.simulation-spatial-mini-legend-fill")
              .data((item) => (item.type === "fill" ? [item] : []))
              .join("rect")
              .attr("class", "simulation-spatial-mini-legend-fill")
              .attr("x", 0)
              .attr("y", 1)
              .attr("width", 10)
              .attr("height", 8)
              .attr("rx", 2)
              .attr("fill", (item) => item.color);
            rows
              .selectAll("line.simulation-spatial-mini-legend-line")
              .data((item) => (item.type === "line" ? [item] : []))
              .join("line")
              .attr("class", "simulation-spatial-mini-legend-line")
              .attr("x1", 0)
              .attr("x2", 12)
              .attr("y1", 6)
              .attr("y2", 6)
              .attr("stroke", (item) => item.color)
              .attr("stroke-width", 2)
              .attr("stroke-linecap", "round");
            rows
              .selectAll("circle.simulation-spatial-mini-legend-circle")
              .data((item) => (item.type === "circle" ? [item] : []))
              .join("circle")
              .attr("class", "simulation-spatial-mini-legend-circle")
              .attr("cx", 6)
              .attr("cy", 6)
              .attr("r", 4.5)
              .attr("fill", (item) => item.color)
              .attr("stroke", "#172218")
              .attr("stroke-width", 0.6);
            rows
              .selectAll("text")
              .data((item) => [item])
              .join("text")
              .attr("x", 17)
              .attr("y", 9)
              .text((item) => item.label);
          }

          function getSimulationLabelPoint(id, projection) {
            const feature = nlLabelPoints?.features?.find(
              (item) => item.properties.statcode === id,
            );
            if (!feature) return null;
            const coords = feature.geometry.coordinates;
            const [x, y] = projection(coords);
            return { x, y, coords };
          }

          function getSimulationRegionCoords(id) {
            const feature = nlLabelPoints?.features?.find(
              (item) => item.properties.statcode === id,
            );
            return feature?.geometry?.coordinates || null;
          }

          function getSimulationSpatialNodes(frame, projection) {
            return Object.entries(frame.nodeStates)
              .map(([id, state]) => {
                const point = getSimulationLabelPoint(id, projection);
                if (!point) return null;
                return {
                  id,
                  state,
                  x: point.x,
                  y: point.y,
                  coords: point.coords,
                  prevalence: state.prevalence || 0,
                  infectious: state.I || 0,
                  newInfections: state.newInfections || 0,
                  incomingExposure: state.incomingExposure || 0,
                  outgoingPressure: state.outgoingPressure || 0,
                };
              })
              .filter(Boolean);
          }

          function getSimulationFocusSpatialStats(frame) {
            const bands = [
              { key: "0-25", min: 0, max: 25, incoming: 0, outgoing: 0 },
              { key: "25-50", min: 25, max: 50, incoming: 0, outgoing: 0 },
              { key: "50-100", min: 50, max: 100, incoming: 0, outgoing: 0 },
              { key: "100+", min: 100, max: Infinity, incoming: 0, outgoing: 0 },
            ];
            const focalId = selectedNodeData?.id;
            const focalCoords = getSimulationRegionCoords(focalId);
            const focalPartition = getSimulationPartitionKey(focalId);
            let crossPartition = 0;

            if (!focalCoords) {
              return {
                bands,
                totalRisk: 0,
                topBand: "NA",
                crossShare: 0,
              };
            }

            frame?.linkStates?.forEach((link) => {
              if (!(link.riskLoad > 0) || link.local) return;
              const source = getNodeId(link.source);
              const target = getNodeId(link.target);
              const isOutgoing = source === focalId;
              const isIncoming = target === focalId;
              if (!isOutgoing && !isIncoming) return;

              const partnerId = isOutgoing ? target : source;
              const partnerCoords = getSimulationRegionCoords(partnerId);
              if (!partnerCoords) return;
              const distanceKm = computeDistance(focalCoords, partnerCoords);
              const band =
                bands.find(
                  (item) => distanceKm >= item.min && distanceKm < item.max,
                ) || bands[bands.length - 1];

              if (isOutgoing) {
                band.outgoing += link.riskLoad;
              } else {
                band.incoming += link.riskLoad;
              }

              if (getSimulationPartitionKey(partnerId) !== focalPartition) {
                crossPartition += link.riskLoad;
              }
            });

            bands.forEach((band) => {
              band.total = band.incoming + band.outgoing;
            });
            const totalRisk = d3.sum(bands, (band) => band.total);
            const topBand = [...bands].sort((a, b) => b.total - a.total)[0];
            return {
              bands,
              totalRisk,
              topBand: topBand?.total > 0 ? topBand.key : "NA",
              crossShare: totalRisk ? crossPartition / totalRisk : 0,
            };
          }

          function renderSimulationSpatialPatternPanel() {
            const frame = simulationState.currentFrame;
            if (!frame || selectedNodeData) return;
            const container = d3.select("#tradeDistribution");
            const node = container.node();
            const margin = { top: 48, right: 12, bottom: 38, left: 12 };
            const width = Math.max(10, node.clientWidth - margin.left - margin.right);
            const height = Math.max(10, node.clientHeight - margin.top - margin.bottom);
            let svg = container.select("svg.simulation-spatial-chart");
            if (svg.empty()) {
              container.selectAll("svg").remove();
              svg = container.append("svg").attr("class", "simulation-spatial-chart");
            }
            svg.attr("width", node.clientWidth).attr("height", node.clientHeight);
            let g = svg.select("g.chart");
            if (g.empty()) g = svg.append("g").attr("class", "chart");
            g.attr("transform", `translate(${margin.left},${margin.top})`);

            if (!nlMapData || !nlLabelPoints) {
              g.selectAll("*").remove();
              renderEmpty(g, width, height, "Map data not loaded");
              return;
            }
            g.selectAll(".empty-message").remove();
            renderSimulationSpatialLegend(svg, margin.left + 2, 34);

            const mapBoxHeight = Math.max(10, height - 8);
            const mapBox = {
              x: 0,
              y: Math.max(0, (height - mapBoxHeight) / 2),
              width,
              height: mapBoxHeight,
            };
            const projection = getSimulationPanelProjection(
              mapBox.width,
              mapBox.height,
            );
            projection.translate([
              projection.translate()[0] + mapBox.x,
              projection.translate()[1] + mapBox.y,
            ]);
            const path = d3.geoPath().projection(projection);
            const spatialNodes = getSimulationSpatialNodes(frame, projection);
            const spatialById = new Map(spatialNodes.map((item) => [item.id, item]));
            const flows = Array.from(frame.linkStates.values())
              .filter((item) => !item.local && item.riskLoad > 0)
              .map((item) => {
                const source = spatialById.get(item.source);
                const target = spatialById.get(item.target);
                if (!source || !target) return null;
                const distanceKm = computeDistance(source.coords, target.coords);
                return {
                  ...item,
                  sourcePoint: source,
                  targetPoint: target,
                  distanceKm,
                };
              })
              .filter(Boolean)
              .sort((a, b) => b.riskLoad - a.riskLoad);
            const visibleFlows = flows.slice(0, 18);
            const flowWidth = d3
              .scaleSqrt()
              .domain([0, d3.max(flows, (item) => item.riskLoad) || 1])
              .range([0.6, 4.2]);
            const bubbleRadius = d3
              .scaleSqrt()
              .domain([0, d3.max(spatialNodes, (item) => item.newInfections) || 1])
              .range([2.5, 11]);

            const regions = g
              .selectAll("path.simulation-spatial-region")
              .data(nlMapData.features, (feature) => feature.properties.statcode);
            regions
              .enter()
              .append("path")
              .attr("class", "simulation-spatial-region")
              .merge(regions)
              .attr("d", path)
              .attr("fill", (feature) => {
                const state = frame.nodeStates[feature.properties.statcode];
                return state
                  ? simulationPrevalenceScale(state.prevalence || 0)
                  : "rgba(23,34,24,0.04)";
              })
              .attr("stroke", "rgba(255,255,255,0.85)")
              .attr("stroke-width", 0.7)
              .attr("opacity", 0.86);
            regions.exit().remove();

            const flowPath = (item) => {
              const sx = item.sourcePoint.x;
              const sy = item.sourcePoint.y;
              const tx = item.targetPoint.x;
              const ty = item.targetPoint.y;
              const dx = tx - sx;
              const dy = ty - sy;
              const length = Math.sqrt(dx * dx + dy * dy) || 1;
              const bend = Math.min(26, length * 0.18);
              const cx = (sx + tx) / 2 - (dy / length) * bend;
              const cy = (sy + ty) / 2 + (dx / length) * bend;
              return `M${sx},${sy}Q${cx},${cy} ${tx},${ty}`;
            };

            const flowLayer = g
              .selectAll("g.simulation-spatial-flow-layer")
              .data([null])
              .join("g")
              .attr("class", "simulation-spatial-flow-layer");
            const flowPaths = flowLayer
              .selectAll("path.simulation-spatial-flow")
              .data(visibleFlows, (item) => `${item.source}-${item.target}`);
            flowPaths
              .enter()
              .append("path")
              .attr("class", "simulation-spatial-flow")
              .attr("fill", "none")
              .attr("stroke-linecap", "round")
              .attr("stroke", (item) =>
                simulationPrevalenceScale(item.sourcePrevalence || 0),
              )
              .attr("stroke-width", 0)
              .attr("opacity", 0)
              .merge(flowPaths)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("d", flowPath)
                  .attr("stroke", (item) =>
                    simulationPrevalenceScale(item.sourcePrevalence || 0),
                  )
                  .attr("stroke-width", (item) => flowWidth(item.riskLoad))
                  .attr("opacity", 0.45),
              );
            flowPaths
              .exit()
              .call((selection) =>
                transitionSelection(selection)
                  .attr("stroke-width", 0)
                  .attr("opacity", 0)
                  .remove(),
              );

            const bubbles = g
              .selectAll("circle.simulation-spatial-bubble")
              .data(spatialNodes, (item) => item.id);
            bubbles
              .enter()
              .append("circle")
              .attr("class", "simulation-spatial-bubble")
              .attr("cx", (item) => item.x)
              .attr("cy", (item) => item.y)
              .attr("r", 0)
              .attr("fill", (item) => simulationPrevalenceScale(item.prevalence))
              .attr("stroke", "#172218")
              .attr("stroke-width", 0.7)
              .attr("opacity", 0.88)
              .merge(bubbles)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("cx", (item) => item.x)
                  .attr("cy", (item) => item.y)
                  .attr("r", (item) => bubbleRadius(item.newInfections))
                  .attr("fill", (item) =>
                    simulationPrevalenceScale(item.prevalence),
                  ),
              );
            bubbles
              .exit()
              .call((selection) =>
                transitionSelection(selection).attr("r", 0).remove(),
              );

            const totalMovement = d3.sum(flows, (item) => item.riskLoad);
            const totalLocal = d3.sum(
              Array.from(frame.linkStates.values()).filter((item) => item.local),
              (item) => item.riskLoad,
            );
            const meanDistance =
              totalMovement > 0
                ? d3.sum(flows, (item) => item.riskLoad * item.distanceKm) /
                  totalMovement
                : 0;
            const totalNewInfections = d3.sum(
              spatialNodes,
              (item) => item.newInfections,
            );
            const topShare =
              totalNewInfections > 0
                ? d3.sum(
                    [...spatialNodes]
                      .sort((a, b) => b.newInfections - a.newInfections)
                      .slice(0, 5),
                    (item) => item.newInfections,
                  ) / totalNewInfections
                : 0;
            const kpis = [
              ["Move", formatSmall(totalMovement)],
              ["Local", formatSmall(totalLocal)],
              ["Mean km", d3.format(".0f")(meanDistance)],
              ["Top 5", formatPct(topShare)],
            ];
            const kpi = svg
              .selectAll("g.simulation-spatial-kpi")
              .data(kpis, (item) => item[0]);
            const kpiEnter = kpi
              .enter()
              .append("g")
              .attr("class", "simulation-spatial-kpi");
            kpiEnter.append("text").attr("class", "simulation-kpi-label");
            kpiEnter.append("text").attr("class", "simulation-kpi-value");
            const kpiWidth = node.clientWidth / kpis.length;
            const kpiMerged = kpiEnter.merge(kpi);
            kpiMerged.attr(
              "transform",
              (item, index) =>
                `translate(${index * kpiWidth + kpiWidth / 2},${node.clientHeight - 16})`,
            );
            kpiMerged
              .select("text.simulation-kpi-label")
              .attr("text-anchor", "middle")
              .attr("y", -10)
              .text((item) => item[0]);
            kpiMerged
              .select("text.simulation-kpi-value")
              .attr("text-anchor", "middle")
              .attr("y", 3)
              .text((item) => item[1]);
            kpi.exit().remove();
          }

          function getSimulationPartitionKey(id) {
            const node = allNodes.find((item) => item.id === id);
            const key = node?.community;
            return key === undefined || key === null ? "NA" : String(key);
          }

          function getSimulationPartitionColor(key) {
            return key === "NA" ? "#9ca3af" : nodeColor(Number(key));
          }

          function getSimulationPartitionDisplayKey(key) {
            return key === "NA" ? "NA" : `P${key}`;
          }

          function getSimulationPartitionData(frame) {
            const partitions = new Map();
            Object.entries(frame.nodeStates).forEach(([id, state]) => {
              const key = getSimulationPartitionKey(id);
              if (!partitions.has(key)) {
                partitions.set(key, {
                  key,
                  members: [],
                  N: 0,
                  E: 0,
                  I: 0,
                  R: 0,
                  newInfections: 0,
                  incomingExposure: 0,
                  outgoingPressure: 0,
                  nodeCount: 0,
                });
              }
              const partition = partitions.get(key);
              partition.members.push(id);
              partition.N += state.N || 0;
              partition.E += state.E || 0;
              partition.I += state.I || 0;
              partition.R += state.R || 0;
              partition.newInfections += state.newInfections || 0;
              partition.incomingExposure += state.incomingExposure || 0;
              partition.outgoingPressure += state.outgoingPressure || 0;
              partition.nodeCount += 1;
            });
            partitions.forEach((partition) => {
              partition.prevalence = partition.N ? partition.I / partition.N : 0;
              partition.members.sort((a, b) => {
                const aNum = parseInt(String(a).replace("CR", ""), 10);
                const bNum = parseInt(String(b).replace("CR", ""), 10);
                return aNum - bNum || d3.ascending(a, b);
              });
            });

            const matrix = new Map();
            frame.linkStates.forEach((link) => {
              if (!(link.riskLoad > 0)) return;
              const sourceKey = getSimulationPartitionKey(link.source);
              const targetKey = getSimulationPartitionKey(link.target);
              const key = `${sourceKey}->${targetKey}`;
              matrix.set(key, (matrix.get(key) || 0) + link.riskLoad);
            });

            const partitionList = Array.from(partitions.values()).sort(
              (a, b) =>
                b.I - a.I ||
                b.newInfections - a.newInfections ||
                d3.ascending(a.key, b.key),
            );
            return { partitions: partitionList, matrix };
          }

          function getSimulationPartitionMappingLayout(node) {
            const compactHeight = clampNumber(node.clientHeight * 0.23, 46, 76);
            const expandedHeight = Math.max(
              compactHeight,
              node.clientHeight - 92,
            );
            const columns = node.clientWidth >= 360 ? 2 : 1;
            const maxRows = Math.max(1, Math.floor((compactHeight - 18) / 18));
            const maxItems = Math.max(1, maxRows * columns);
            const maxMembers = clampNumber(
              Math.floor((node.clientWidth / columns - 70) / 34),
              2,
              7,
            );
            return {
              compactHeight,
              expandedHeight,
              columns,
              maxRows,
              maxItems,
              maxMembers,
            };
          }

          function renderSimulationPartitionMapping(
            container,
            partitions,
            layout,
          ) {
            let panel = container.select("div.simulation-partition-map");
            if (!partitions.length) {
              panel.remove();
              container.classed("simulation-partition-map-expanded", false);
              return;
            }
            if (panel.empty()) {
              panel = container
                .append("div")
                .attr("class", "simulation-partition-map")
                .attr("tabindex", "0")
                .attr("role", "region")
                .attr("aria-label", "Partition to CR regions");
            }
            panel
              .on("mouseenter", () =>
                container.classed("simulation-partition-map-expanded", true),
              )
              .on("mouseleave", () =>
                container.classed("simulation-partition-map-expanded", false),
              )
              .on("focusin", () =>
                container.classed("simulation-partition-map-expanded", true),
              )
              .on("focusout", () =>
                container.classed("simulation-partition-map-expanded", false),
              );

            const maxVisibleItems =
              partitions.length > layout.maxItems
                ? Math.max(1, (layout.maxRows - 1) * layout.columns)
                : layout.maxItems;
            const visiblePartitions = partitions.slice(0, maxVisibleItems);
            const hiddenPartitions = Math.max(
              0,
              partitions.length - visiblePartitions.length,
            );
            const renderRow = (partition, expanded) => {
              const members = partition.members || [];
              const visibleMembers = expanded
                ? members
                : members.slice(0, layout.maxMembers);
              const hiddenMembers = expanded
                ? 0
                : Math.max(0, members.length - visibleMembers.length);
              return `
                <div class="simulation-partition-map-row">
                  <span class="simulation-partition-map-key">
                    <span class="simulation-partition-map-swatch" style="background:${getSimulationPartitionColor(partition.key)}"></span>
                    ${getSimulationPartitionDisplayKey(partition.key)}
                  </span>
                  <span class="simulation-partition-map-regions">
                    ${visibleMembers.join(" ")}${hiddenMembers ? ` +${hiddenMembers}` : ""}
                  </span>
                </div>
              `;
            };
            const compactRows = visiblePartitions
              .map((partition) => renderRow(partition, false))
              .join("");
            const fullRows = partitions
              .map((partition) => renderRow(partition, true))
              .join("");

            panel
              .style("--partition-map-compact-height", `${layout.compactHeight}px`)
              .style("--partition-map-expanded-height", `${layout.expandedHeight}px`)
              .style("--partition-map-columns", layout.columns)
              .html(`
                <div class="simulation-partition-map-header">
                  <span class="simulation-partition-map-title">Partition -> CR regions</span>
                  <span class="simulation-partition-map-hint">Hover to expand</span>
                </div>
                <div class="simulation-partition-map-compact">
                  ${compactRows}
                  ${
                    hiddenPartitions
                      ? `<div class="simulation-partition-map-more">+${hiddenPartitions} partitions</div>`
                      : ""
                  }
                </div>
                <div class="simulation-partition-map-full">
                  ${fullRows}
                </div>
              `);
          }

          function getSelectedSimulationPartitionStats(frame) {
            const key = getSimulationPartitionKey(selectedNodeData?.id);
            const emptyPartition = {
              key,
              members: [],
              N: 0,
              E: 0,
              I: 0,
              R: 0,
              newInfections: 0,
              incomingExposure: 0,
              outgoingPressure: 0,
              nodeCount: 0,
              prevalence: 0,
            };
            if (!frame) {
              return {
                key,
                partition: emptyPartition,
                within: 0,
                incomingCross: 0,
                outgoingCross: 0,
              };
            }

            const { partitions } = getSimulationPartitionData(frame);
            const partition =
              partitions.find((item) => item.key === key) || emptyPartition;
            let within = 0;
            let incomingCross = 0;
            let outgoingCross = 0;

            frame.linkStates.forEach((link) => {
              if (!(link.riskLoad > 0)) return;
              const sourceKey = getSimulationPartitionKey(link.source);
              const targetKey = getSimulationPartitionKey(link.target);
              if (sourceKey === key && targetKey === key) {
                within += link.riskLoad;
                return;
              }
              if (targetKey === key) incomingCross += link.riskLoad;
              if (sourceKey === key) outgoingCross += link.riskLoad;
            });

            return { key, partition, within, incomingCross, outgoingCross };
          }

          function renderSimulationPartitionStructurePanel() {
            const frame = simulationState.currentFrame;
            const container = d3.select("#tradeClusters");
            if (!frame || selectedNodeData) {
              container.select("div.simulation-partition-map").remove();
              container.classed("simulation-partition-map-expanded", false);
              return;
            }
            const node = container.node();
            const { partitions, matrix } = getSimulationPartitionData(frame);
            const mappingLayout = getSimulationPartitionMappingLayout(node);
            const margin = {
              top: 78,
              right: 76,
              bottom: partitions.length ? mappingLayout.compactHeight + 12 : 36,
              left: 42,
            };
            const width = Math.max(10, node.clientWidth - margin.left - margin.right);
            const height = Math.max(10, node.clientHeight - margin.top - margin.bottom);
            let svg = container.select("svg.simulation-partition-chart");
            if (svg.empty()) {
              container.selectAll("svg").remove();
              svg = container
                .append("svg")
                .attr("class", "simulation-partition-chart");
            }
            svg.attr("width", node.clientWidth).attr("height", node.clientHeight);
            let g = svg.select("g.chart");
            if (g.empty()) g = svg.append("g").attr("class", "chart");
            g.attr("transform", `translate(${margin.left},${margin.top})`);

            if (!partitions.length) {
              renderSimulationPartitionMapping(
                container,
                partitions,
                mappingLayout,
              );
              g.selectAll("*").remove();
              renderEmpty(g, width, height, "No partition data");
              return;
            }
            g.selectAll(".empty-message").remove();
            renderSimulationPartitionMapping(
              container,
              partitions,
              mappingLayout,
            );

            const keys = partitions.map((partition) => partition.key);
            const matrixSize = Math.max(10, Math.min(width, height));
            const matrixOffsetY = Math.max(0, (height - matrixSize) / 2);
            const x = d3
              .scaleBand()
              .domain(keys)
              .range([0, matrixSize])
              .padding(0.06);
            const y = d3.scaleBand().domain(keys).range([0, matrixSize]).padding(0.06);
            const cells = keys.flatMap((source) =>
              keys.map((target) => ({
                source,
                target,
                value: matrix.get(`${source}->${target}`) || 0,
              })),
            );
            const maxValue = d3.max(cells, (cell) => cell.value) || 1;
            const color = d3
              .scaleSequential(d3.interpolateYlOrRd)
              .domain([0, maxValue]);

            const cellSelection = g
              .selectAll("rect.simulation-partition-cell")
              .data(cells, (cell) => `${cell.source}->${cell.target}`);
            cellSelection
              .enter()
              .append("rect")
              .attr("class", "simulation-partition-cell")
              .attr("x", (cell) => x(cell.target))
              .attr("y", (cell) => matrixOffsetY + y(cell.source))
              .attr("width", x.bandwidth())
              .attr("height", y.bandwidth())
              .attr("rx", 3)
              .attr("ry", 3)
              .attr("fill", "rgba(23,34,24,0.04)")
              .merge(cellSelection)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", (cell) => x(cell.target))
                  .attr("y", (cell) => matrixOffsetY + y(cell.source))
                  .attr("width", x.bandwidth())
                  .attr("height", y.bandwidth())
                  .attr("fill", (cell) =>
                    cell.value > 0 ? color(cell.value) : "rgba(23,34,24,0.04)",
                  )
                  .attr("stroke", (cell) =>
                    cell.source === cell.target
                      ? "rgba(23,34,24,0.42)"
                      : "rgba(255,255,255,0.9)",
                  )
                  .attr("stroke-width", (cell) =>
                    cell.source === cell.target ? 1.1 : 0.6,
                  ),
              );
            cellSelection
              .exit()
              .call((selection) =>
                transitionSelection(selection)
                  .attr("opacity", 0)
                  .remove(),
              );

            const displayKey = (key) => (key === "NA" ? "NA" : `P${key}`);
            g.selectAll("text.simulation-partition-column-label")
              .data(keys, (key) => key)
              .join("text")
              .attr("class", "simulation-partition-column-label")
              .attr("x", (key) => x(key) + x.bandwidth() / 2)
              .attr("y", matrixOffsetY - 8)
              .attr("text-anchor", "middle")
              .text(displayKey);
            g.selectAll("text.simulation-partition-row-label")
              .data(keys, (key) => key)
              .join("text")
              .attr("class", "simulation-partition-row-label")
              .attr("x", -8)
              .attr("y", (key) => matrixOffsetY + y(key) + y.bandwidth() / 2 + 3)
              .attr("text-anchor", "end")
              .text(displayKey);

            const burdenMax = d3.max(partitions, (partition) => partition.I) || 1;
            const burdenX = d3
              .scaleLinear()
              .domain([0, burdenMax])
              .range([0, Math.max(18, margin.right - 24)]);
            const burdenBars = g
              .selectAll("rect.simulation-partition-burden")
              .data(partitions, (partition) => partition.key);
            burdenBars
              .enter()
              .append("rect")
              .attr("class", "simulation-partition-burden")
              .attr("x", matrixSize + 10)
              .attr("y", (partition) => matrixOffsetY + y(partition.key))
              .attr("height", y.bandwidth())
              .attr("width", 0)
              .attr("rx", 3)
              .attr("fill", (partition) =>
                simulationPrevalenceScale(partition.prevalence),
              )
              .merge(burdenBars)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", matrixSize + 10)
                  .attr("y", (partition) => matrixOffsetY + y(partition.key))
                  .attr("height", y.bandwidth())
                  .attr("width", (partition) => burdenX(partition.I))
                  .attr("fill", (partition) =>
                    simulationPrevalenceScale(partition.prevalence),
                  ),
              );
            burdenBars
              .exit()
              .call((selection) =>
                transitionSelection(selection)
                  .attr("width", 0)
                  .remove(),
              );

            g.selectAll("text.simulation-partition-burden-label")
              .data(partitions, (partition) => partition.key)
              .join("text")
              .attr("class", "simulation-partition-burden-label")
              .attr("x", matrixSize + margin.right - 10)
              .attr(
                "y",
                (partition) =>
                  matrixOffsetY + y(partition.key) + y.bandwidth() / 2 + 3,
              )
              .attr("text-anchor", "end")
              .text((partition) => formatSmall(partition.I));

            const total = d3.sum(cells, (cell) => cell.value);
            const within = d3.sum(cells, (cell) =>
              cell.source === cell.target ? cell.value : 0,
            );
            const between = total - within;
            const crossSource = d3.rollups(
              cells.filter((cell) => cell.source !== cell.target),
              (values) => d3.sum(values, (cell) => cell.value),
              (cell) => cell.source,
            ).sort((a, b) => b[1] - a[1])[0];
            const summaryItems = [
              ["Within", formatPct(total ? within / total : 0)],
              ["Between", formatPct(total ? between / total : 0)],
              [
                "Bridge",
                crossSource && crossSource[1] > 0 ? displayKey(crossSource[0]) : "NA",
              ],
            ];
            const summary = svg
              .selectAll("g.simulation-partition-summary")
              .data(summaryItems, (item) => item[0]);
            const summaryEnter = summary
              .enter()
              .append("g")
              .attr("class", "simulation-partition-summary");
            summaryEnter.append("text").attr("class", "simulation-kpi-label");
            summaryEnter.append("text").attr("class", "simulation-kpi-value");
            const summaryWidth = Math.min(82, node.clientWidth / 3);
            const summaryMerged = summaryEnter.merge(summary);
            summaryMerged.attr(
              "transform",
              (item, index) => `translate(${16 + index * summaryWidth},50)`,
            );
            summaryMerged
              .select("text.simulation-kpi-label")
              .attr("x", 0)
              .attr("y", -9)
              .text((item) => item[0]);
            summaryMerged
              .select("text.simulation-kpi-value")
              .attr("x", 0)
              .attr("y", 5)
              .text((item) => item[1]);
            summary.exit().remove();
          }

          function styleSimulationFocusChartChrome(root) {
            root
              .selectAll(".simulation-focus-axis text")
              .attr("fill", "rgba(255,255,255,0.95)");
            root
              .selectAll(".simulation-focus-axis path, .simulation-focus-axis line")
              .attr("stroke", "rgba(255,255,255,0.62)");
            root
              .selectAll(".simulation-focus-grid line")
              .attr("stroke", "rgba(255,255,255,0.2)")
              .attr("stroke-dasharray", "3 3");
            root.selectAll(".simulation-focus-grid path").attr("stroke", "none");
            root.selectAll(".simulation-focus-grid text").attr("fill", "none");
          }

          function getSimulationCompartmentLegendWidth(keys) {
            return Math.max(0, (keys.length - 1) * 40 + 32);
          }

          function renderSimulationCompartmentLegend(svg, keys, x, y) {
            svg.selectAll(".simulation-focus-legend").remove();
            const legend = svg
              .append("g")
              .attr("class", "simulation-focus-legend")
              .attr("transform", `translate(${x},${y})`);

            keys.forEach((key, index) => {
              const item = legend
                .append("g")
                .attr("transform", `translate(${index * 40},0)`);
              item
                .append("line")
                .attr("x1", 0)
                .attr("x2", 14)
                .attr("y1", 6)
                .attr("y2", 6)
                .attr("stroke", simulationCompartmentColors[key])
                .attr("stroke-width", key === "I" ? 2.8 : 2);
              item
                .append("text")
                .attr("x", 20)
                .attr("y", 10)
                .text(key);
            });
          }

          function renderSimulationFocusTrajectory() {
            if (!selectedNodeData || !simulationState.trajectory) return;
            const container = d3.select("#tradeNodeDistribution");
            const node = container.node();
            const margin = { top: 74, right: 18, bottom: 24, left: 42 };
            const width = Math.max(10, node.clientWidth - margin.left - margin.right);
            const height = Math.max(10, node.clientHeight - margin.top - margin.bottom);
            const data = simulationState.trajectory.frames.map((frame) => {
              const state = frame.nodeStates[selectedNodeData.id];
              return { date: frame.date, ...state };
            });
            let svg = container.select("svg.simulation-focus-chart");
            if (svg.empty()) {
              container.selectAll("svg").remove();
              svg = container.append("svg").attr("class", "simulation-focus-chart");
            }
            svg.attr("width", node.clientWidth).attr("height", node.clientHeight);
            svg.selectAll(".simulation-focus-legend").remove();
            let g = svg.select("g.chart");
            if (g.empty()) g = svg.append("g").attr("class", "chart");
            g.attr("transform", `translate(${margin.left},${margin.top})`);

            const x = d3
              .scaleTime()
              .domain(d3.extent(data, (d) => d.date))
              .range([0, width]);
            const y = d3
              .scaleLinear()
              .domain([0, d3.max(data, (d) => d.N) || 1])
              .nice()
              .range([height, 0]);
            const line = (key) =>
              d3
                .line()
                .x((d) => x(d.date))
                .y((d) => y(d[key]))
                .curve(d3.curveMonotoneX);

            g.selectAll("g.simulation-focus-grid.x-grid")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-grid x-grid")
              .attr("transform", `translate(0,${height})`)
              .call(
                d3
                  .axisBottom(x)
                  .ticks(4)
                  .tickSize(-height)
                  .tickFormat(""),
              );
            g.selectAll("g.simulation-focus-grid.y-grid")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-grid y-grid")
              .call(
                d3
                  .axisLeft(y)
                  .ticks(4)
                  .tickSize(-width)
                  .tickFormat(""),
              );
            g.selectAll("g.simulation-focus-axis.x-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis x-axis")
              .attr("transform", `translate(0,${height})`)
              .call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat("%b")));
            g.selectAll("g.simulation-focus-axis.y-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis y-axis")
              .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")));
            styleSimulationFocusChartChrome(g);
            const seriesLayer = g
              .selectAll("g.simulation-focus-series-layer")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-series-layer");
            seriesLayer
              .selectAll("path.simulation-focus-trajectory-line")
              .data(["S", "E", "I", "R"], (key) => key)
              .join(
                (enter) =>
                  enter
                    .append("path")
                    .attr("class", "simulation-focus-trajectory-line")
                    .attr("fill", "none"),
                (update) => update,
                (exit) => exit.remove(),
              )
              .attr("stroke", (key) => simulationCompartmentColors[key])
              .attr("stroke-width", (key) => (key === "I" ? 2.4 : 1.6))
              .call((selection) =>
                transitionSelection(selection).attr("d", (key) => line(key)(data)),
              );

            const current = simulationState.currentFrame;
            if (current) {
              const markerLayer = g
                .selectAll("g.simulation-marker-layer")
                .data([null])
                .join("g")
                .attr("class", "simulation-marker-layer");
              renderSimulationDateMarker(markerLayer, {
                x,
                date: current.date,
                height,
                rangeWidth: 10,
                lineColor: "#ffffff",
              });
            }

            const legendKeys = ["S", "E", "I", "R"];
            renderSimulationCompartmentLegend(
              svg,
              legendKeys,
              Math.max(
                margin.left,
                (node.clientWidth -
                  getSimulationCompartmentLegendWidth(legendKeys)) /
                  2,
              ),
              44,
            );
          }

          function getSimulationNodeInsightView(view) {
            const selectValue =
              document.getElementById("tradeNodeInsightSelect")?.value;
            const selectedView =
              view ||
              window.currentSelectedTradeNodeInsight ||
              selectValue ||
              "partition";
            const aliases = {
              compartments: "partition",
              trajectory: "spatial",
            };
            const normalizedView = aliases[selectedView] || selectedView;
            return ["partition", "exposure", "spatial"].includes(normalizedView)
              ? normalizedView
              : "partition";
          }

          function getSelectedSimulationNodeSeries() {
            if (!selectedNodeData || !simulationState.trajectory) return [];
            return simulationState.trajectory.frames
              .map((frame) => {
                const state = frame.nodeStates[selectedNodeData.id];
                return state ? { date: frame.date, ...state } : null;
              })
              .filter(Boolean);
          }

          function renderSimulationInsightLegend(svg, items, x, y) {
            svg.selectAll(".simulation-focus-legend").remove();
            const legend = svg
              .append("g")
              .attr("class", "simulation-focus-legend")
              .attr("transform", `translate(${x},${y})`);

            items.forEach((item, index) => {
              const legendItem = legend
                .append("g")
                .attr("transform", `translate(${index * item.width},0)`);
              legendItem
                .append("line")
                .attr("x1", 0)
                .attr("x2", 18)
                .attr("y1", 6)
                .attr("y2", 6)
                .attr("stroke", item.color)
                .attr("stroke-width", 2.4);
              legendItem
                .append("text")
                .attr("x", 24)
                .attr("y", 10)
                .text(item.label);
            });
          }

          function setSimulationNodeInsightSummary(selectedView, state) {
            const sumDiv = document.getElementById("tradeNodeInsightSummary");
            if (!sumDiv) return;

            const baseRows = `
                <div><strong>[${selectedNodeData.id}]</strong> ${selectedNodeData.statnaam || ""}</div>
                <div>
                  <span style="color:${simulationCompartmentColors.I}; font-weight:600;">I:</span> ${formatCount(state.I)}
                  &nbsp; <span style="color:${simulationCompartmentColors.E}; font-weight:600;">E:</span> ${formatCount(state.E)}
                  &nbsp; <span style="opacity:0.85;">Prev:</span> ${formatPct(state.prevalence)}
                </div>
              `;

            if (selectedView === "exposure") {
              sumDiv.innerHTML = `
                ${baseRows}
                <div style="opacity:0.85;">
                  Incoming exposure: ${formatSmall(state.incomingExposure)}
                  &nbsp; Outgoing pressure: ${formatSmall(state.outgoingPressure)}
                  &nbsp; New infections: ${formatCount(state.newInfections)}
                </div>
              `;
              return;
            }

            if (selectedView === "partition") {
              const stats = getSelectedSimulationPartitionStats(
                simulationState.currentFrame,
              );
              const partition = stats.partition;
              const crossTotal = stats.incomingCross + stats.outgoingCross;
              const total = stats.within + crossTotal;
              sumDiv.innerHTML = `
                ${baseRows}
                <div style="opacity:0.85;">
                  Partition: ${getSimulationPartitionDisplayKey(stats.key)}
                  &nbsp; Nodes: ${partition.nodeCount}
                  &nbsp; P prevalence: ${formatPct(partition.prevalence || 0)}
                  &nbsp; Cross load: ${formatPct(total ? crossTotal / total : 0)}
                </div>
              `;
              return;
            }

            if (selectedView === "spatial") {
              const stats = getSimulationFocusSpatialStats(
                simulationState.currentFrame,
              );
              sumDiv.innerHTML = `
                ${baseRows}
                <div style="opacity:0.85;">
                  Spatial load: ${formatSmall(stats.totalRisk)}
                  &nbsp; Main band: ${stats.topBand}
                  &nbsp; Cross partition: ${formatPct(stats.crossShare)}
                </div>
              `;
              return;
            }

            sumDiv.innerHTML = `
              ${baseRows}
              <div style="opacity:0.85;">
                S: ${formatCount(state.S)}
                &nbsp; R: ${formatCount(state.R)}
                &nbsp; Holding: ${formatCount(state.N)}
              </div>
            `;
          }

          function prepareSimulationNodeInsightChart(svg, containerNode, options = {}) {
            const container = d3.select("#tradeNodeInsight");
            const labelNode = container.select(".trade-nodeinsight-label").node();
            const controlsNode = document.getElementById(
              "tradeNodeInsightControls",
            );
            const summaryNode = document.getElementById("tradeNodeInsightSummary");
            const legendBandHeight = options.legendBandHeight || 0;
            const overlayH =
              (labelNode ? labelNode.getBoundingClientRect().height : 0) +
              (controlsNode ? controlsNode.getBoundingClientRect().height : 0) +
              (summaryNode ? summaryNode.getBoundingClientRect().height : 0) +
              22;
            const margin = {
              top: Math.max(overlayH, 104) + legendBandHeight,
              right: options.right ?? 22,
              bottom: 28,
              left: options.left ?? 54,
            };
            const width = Math.max(
              10,
              containerNode.clientWidth - margin.left - margin.right,
            );
            const height = Math.max(
              10,
              containerNode.clientHeight - margin.top - margin.bottom,
            );
            let g = svg.select("g.simulation-nodeinsight-chart");
            if (g.empty()) {
              g = svg.append("g").attr("class", "simulation-nodeinsight-chart");
            }
            g
              .attr("transform", `translate(${margin.left},${margin.top})`);
            return { g, margin, width, height };
          }

          function renderSimulationCompartmentInsight(g, width, height, state) {
            const data = ["S", "E", "I", "R"].map((key) => ({
              key,
              value: state.N ? state[key] / state.N : 0,
            }));
            const x = d3
              .scaleBand()
              .domain(data.map((d) => d.key))
              .range([0, width])
              .padding(0.32);
            const y = d3.scaleLinear().domain([0, 1]).range([height, 0]);
            g.selectAll("g.simulation-focus-grid.y-grid")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-grid y-grid")
              .call(
                d3
                  .axisLeft(y)
                  .ticks(3)
                  .tickSize(-width)
                  .tickFormat(""),
              );
            g.selectAll("g.simulation-focus-axis.x-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis x-axis")
              .attr("transform", `translate(0,${height})`)
              .call(d3.axisBottom(x));
            g.selectAll("g.simulation-focus-axis.y-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis y-axis")
              .call(d3.axisLeft(y).ticks(3).tickFormat(d3.format(".0%")));
            styleSimulationFocusChartChrome(g);
            const bars = g.selectAll("rect.simulation-focus-bar").data(data, (d) => d.key);
            bars
              .enter()
              .append("rect")
              .attr("class", "simulation-focus-bar")
              .attr("x", (d) => x(d.key))
              .attr("y", height)
              .attr("width", x.bandwidth())
              .attr("height", 0)
              .attr("rx", 4)
              .attr("fill", (d) => simulationCompartmentColors[d.key])
              .merge(bars)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", (d) => x(d.key))
                  .attr("y", (d) => y(d.value))
                  .attr("width", x.bandwidth())
                  .attr("height", (d) => height - y(d.value))
                  .attr("fill", (d) => simulationCompartmentColors[d.key]),
              );
            bars
              .exit()
              .call((selection) =>
                transitionSelection(selection)
                  .attr("y", height)
                  .attr("height", 0)
                  .remove(),
              );
          }

          function renderSimulationPartitionInsight(g, width, height, state) {
            const stats = getSelectedSimulationPartitionStats(
              simulationState.currentFrame,
            );
            const partition = stats.partition;
            if (!partition.N) {
              g.selectAll("*").remove();
              renderEmpty(g, width, height, "No partition data");
              return;
            }
            g.selectAll(".empty-message").remove();

            const incomingBase = stats.incomingCross + stats.within;
            const outgoingBase = stats.outgoingCross + stats.within;
            const data = [
              {
                key: "P prev",
                value: partition.prevalence || 0,
                color: simulationPrevalenceScale(partition.prevalence || 0),
              },
              {
                key: "Focal I",
                value: partition.I ? (state.I || 0) / partition.I : 0,
                color: "#4f83cc",
              },
              {
                key: "In cross",
                value: incomingBase ? stats.incomingCross / incomingBase : 0,
                color: "#f2c94c",
              },
              {
                key: "Out cross",
                value: outgoingBase ? stats.outgoingCross / outgoingBase : 0,
                color: "#eb5757",
              },
            ];
            const x = d3
              .scaleBand()
              .domain(data.map((d) => d.key))
              .range([0, width])
              .padding(0.28);
            const y = d3.scaleLinear().domain([0, 1]).range([height, 0]);

            g.selectAll("g.simulation-focus-grid.y-grid")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-grid y-grid")
              .call(
                d3
                  .axisLeft(y)
                  .ticks(3)
                  .tickSize(-width)
                  .tickFormat(""),
              );
            g.selectAll("g.simulation-focus-axis.x-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis x-axis")
              .attr("transform", `translate(0,${height})`)
              .call(d3.axisBottom(x));
            g.selectAll("g.simulation-focus-axis.y-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis y-axis")
              .call(d3.axisLeft(y).ticks(3).tickFormat(d3.format(".0%")));
            styleSimulationFocusChartChrome(g);

            const bars = g
              .selectAll("rect.simulation-focus-bar")
              .data(data, (d) => d.key);
            bars
              .enter()
              .append("rect")
              .attr("class", "simulation-focus-bar")
              .attr("x", (d) => x(d.key))
              .attr("y", height)
              .attr("width", x.bandwidth())
              .attr("height", 0)
              .attr("rx", 4)
              .attr("fill", (d) => d.color)
              .merge(bars)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", (d) => x(d.key))
                  .attr("y", (d) => y(d.value))
                  .attr("width", x.bandwidth())
                  .attr("height", (d) => height - y(d.value))
                  .attr("fill", (d) => d.color),
              );
            bars
              .exit()
              .call((selection) =>
                transitionSelection(selection)
                  .attr("y", height)
                  .attr("height", 0)
                  .remove(),
              );

            const labels = g
              .selectAll("text.simulation-focus-bar-label")
              .data(data, (d) => d.key);
            labels
              .enter()
              .append("text")
              .attr("class", "simulation-focus-bar-label")
              .attr("x", (d) => x(d.key) + x.bandwidth() / 2)
              .attr("y", height - 6)
              .attr("text-anchor", "middle")
              .attr("fill", "rgba(255,255,255,0.95)")
              .text((d) => formatPct(d.value))
              .merge(labels)
              .text((d) => formatPct(d.value))
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", (d) => x(d.key) + x.bandwidth() / 2)
                  .attr("y", (d) => Math.max(12, y(d.value) - 6)),
              );
            labels
              .exit()
              .call((selection) =>
                transitionSelection(selection).attr("y", height - 6).remove(),
              );
          }

          function renderSimulationExposureInsight(g, width, height, state) {
            const data = [
              {
                key: "Incoming",
                value: state.incomingExposure || 0,
                color: "#f2c94c",
              },
              {
                key: "Outgoing",
                value: state.outgoingPressure || 0,
                color: "#eb5757",
              },
              {
                key: "New cases",
                value: state.newInfections || 0,
                color: "#4f83cc",
              },
            ];
            const x = d3
              .scaleBand()
              .domain(data.map((d) => d.key))
              .range([0, width])
              .padding(0.3);
            const y = d3
              .scaleLinear()
              .domain([0, d3.max(data, (d) => d.value) || 1])
              .nice()
              .range([height, 0]);
            g.selectAll("g.simulation-focus-grid.y-grid")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-grid y-grid")
              .call(
                d3
                  .axisLeft(y)
                  .ticks(4)
                  .tickSize(-width)
                  .tickFormat(""),
              );
            g.selectAll("g.simulation-focus-axis.x-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis x-axis")
              .attr("transform", `translate(0,${height})`)
              .call(d3.axisBottom(x));
            g.selectAll("g.simulation-focus-axis.y-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis y-axis")
              .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")));
            styleSimulationFocusChartChrome(g);
            const bars = g.selectAll("rect.simulation-focus-bar").data(data, (d) => d.key);
            bars
              .enter()
              .append("rect")
              .attr("class", "simulation-focus-bar")
              .attr("x", (d) => x(d.key))
              .attr("y", height)
              .attr("width", x.bandwidth())
              .attr("height", 0)
              .attr("rx", 4)
              .attr("fill", (d) => d.color)
              .merge(bars)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", (d) => x(d.key))
                  .attr("y", (d) => y(d.value))
                  .attr("width", x.bandwidth())
                  .attr("height", (d) => height - y(d.value))
                  .attr("fill", (d) => d.color),
              );
            bars
              .exit()
              .call((selection) =>
                transitionSelection(selection)
                  .attr("y", height)
                  .attr("height", 0)
                  .remove(),
              );

            const labels = g
              .selectAll("text.simulation-focus-bar-label")
              .data(data, (d) => d.key);
            labels
              .enter()
              .append("text")
              .attr("class", "simulation-focus-bar-label")
              .attr("x", (d) => x(d.key) + x.bandwidth() / 2)
              .attr("y", height - 6)
              .attr("text-anchor", "middle")
              .text((d) => formatSmall(d.value))
              .merge(labels)
              .text((d) => formatSmall(d.value))
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", (d) => x(d.key) + x.bandwidth() / 2)
                  .attr("y", (d) => Math.max(12, y(d.value) - 6)),
              );
            labels
              .exit()
              .call((selection) =>
                transitionSelection(selection).attr("y", height - 6).remove(),
              );
          }

          function renderSimulationSpatialInsight(g, width, height, frame) {
            const stats = getSimulationFocusSpatialStats(frame);
            if (!stats.totalRisk) {
              g.selectAll("*").remove();
              renderEmpty(g, width, height, "No spatial exposure");
              return;
            }
            g.selectAll(".empty-message").remove();

            const data = stats.bands;
            const x = d3
              .scaleBand()
              .domain(data.map((d) => d.key))
              .range([0, width])
              .padding(0.28);
            const y = d3
              .scaleLinear()
              .domain([0, d3.max(data, (d) => d.total) || 1])
              .nice()
              .range([height, 0]);

            g.selectAll("g.simulation-focus-grid.y-grid")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-grid y-grid")
              .call(
                d3
                  .axisLeft(y)
                  .ticks(4)
                  .tickSize(-width)
                  .tickFormat(""),
              );
            g.selectAll("g.simulation-focus-axis.x-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis x-axis")
              .attr("transform", `translate(0,${height})`)
              .call(d3.axisBottom(x));
            g.selectAll("g.simulation-focus-axis.y-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis y-axis")
              .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")));
            styleSimulationFocusChartChrome(g);

            const layer = g
              .selectAll("g.simulation-spatial-stack-layer")
              .data([null])
              .join("g")
              .attr("class", "simulation-spatial-stack-layer");
            const incomingBars = layer
              .selectAll("rect.simulation-spatial-incoming-bar")
              .data(data, (d) => d.key);
            incomingBars
              .enter()
              .append("rect")
              .attr("class", "simulation-spatial-incoming-bar")
              .attr("x", (d) => x(d.key))
              .attr("y", height)
              .attr("width", x.bandwidth())
              .attr("height", 0)
              .attr("rx", 4)
              .attr("fill", "#f2c94c")
              .merge(incomingBars)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", (d) => x(d.key))
                  .attr("y", (d) => y(d.incoming))
                  .attr("width", x.bandwidth())
                  .attr("height", (d) => height - y(d.incoming)),
              );
            incomingBars.exit().remove();

            const outgoingBars = layer
              .selectAll("rect.simulation-spatial-outgoing-bar")
              .data(data, (d) => d.key);
            outgoingBars
              .enter()
              .append("rect")
              .attr("class", "simulation-spatial-outgoing-bar")
              .attr("x", (d) => x(d.key))
              .attr("y", height)
              .attr("width", x.bandwidth())
              .attr("height", 0)
              .attr("rx", 4)
              .attr("fill", "#eb5757")
              .merge(outgoingBars)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", (d) => x(d.key))
                  .attr("y", (d) => y(d.total))
                  .attr("width", x.bandwidth())
                  .attr("height", (d) =>
                    Math.max(0, y(d.incoming) - y(d.total)),
                  ),
              );
            outgoingBars.exit().remove();

            const labels = g
              .selectAll("text.simulation-focus-bar-label")
              .data(data, (d) => d.key);
            labels
              .enter()
              .append("text")
              .attr("class", "simulation-focus-bar-label")
              .attr("x", (d) => x(d.key) + x.bandwidth() / 2)
              .attr("y", height - 6)
              .attr("text-anchor", "middle")
              .attr("fill", "rgba(255,255,255,0.95)")
              .text((d) => formatSmall(d.total))
              .merge(labels)
              .text((d) => (d.total > 0 ? formatSmall(d.total) : ""))
              .call((selection) =>
                transitionSelection(selection)
                  .attr("x", (d) => x(d.key) + x.bandwidth() / 2)
                  .attr("y", (d) => Math.max(12, y(d.total) - 6)),
              );
            labels.exit().remove();

            const legendData = [
              { key: "Incoming", color: "#f2c94c" },
              { key: "Outgoing", color: "#eb5757" },
            ];
            const legendItemWidth = 86;
            const legendWidth = legendData.length * legendItemWidth - 8;
            const legend = g
              .selectAll("g.simulation-focus-inline-legend")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-inline-legend")
              .attr(
                "transform",
                `translate(${Math.max(0, (width - legendWidth) / 2)},-18)`,
              );
            const items = legend
              .selectAll("g.simulation-focus-inline-legend-item")
              .data(legendData, (d) => d.key)
              .join("g")
              .attr("class", "simulation-focus-inline-legend-item")
              .attr(
                "transform",
                (d, index) => `translate(${index * legendItemWidth},0)`,
              );
            items
              .selectAll("rect")
              .data((d) => [d])
              .join("rect")
              .attr("width", 14)
              .attr("height", 8)
              .attr("rx", 2)
              .attr("fill", (d) => d.color);
            items
              .selectAll("text")
              .data((d) => [d])
              .join("text")
              .attr("x", 20)
              .attr("y", 8)
              .attr("fill", "rgba(255,255,255,0.95)")
              .style("font-size", "10px")
              .style("font-weight", 700)
              .text((d) => d.key);
          }

          function renderSimulationTrajectoryInsight(svg, g, margin, width, height, series) {
            svg.selectAll(".simulation-focus-legend").remove();
            if (!series.length) {
              renderEmpty(g, width, height, "No simulation trajectory");
              return;
            }

            const x = d3
              .scaleTime()
              .domain(d3.extent(series, (d) => d.date))
              .range([0, width]);
            const y = d3
              .scaleLinear()
              .domain([
                0,
                d3.max(series, (d) =>
                  Math.max(
                    d.prevalence || 0,
                    d.exposedShare || 0,
                    d.recoveredShare || 0,
                  ),
                ) || 0.01,
              ])
              .nice()
              .range([height, 0]);
            const line = (key) =>
              d3
                .line()
                .defined((d) => Number.isFinite(d[key]))
                .x((d) => x(d.date))
                .y((d) => y(d[key]))
                .curve(d3.curveMonotoneX);

            g.selectAll("g.simulation-focus-grid.x-grid")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-grid x-grid")
              .attr("transform", `translate(0,${height})`)
              .call(
                d3
                  .axisBottom(x)
                  .ticks(4)
                  .tickSize(-height)
                  .tickFormat(""),
              );
            g.selectAll("g.simulation-focus-grid.y-grid")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-grid y-grid")
              .call(
                d3
                  .axisLeft(y)
                  .ticks(4)
                  .tickSize(-width)
                  .tickFormat(""),
              );
            g.selectAll("g.simulation-focus-axis.x-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis x-axis")
              .attr("transform", `translate(0,${height})`)
              .call(d3.axisBottom(x).ticks(4).tickFormat(d3.timeFormat("%b")));
            g.selectAll("g.simulation-focus-axis.y-axis")
              .data([null])
              .join("g")
              .attr("class", "simulation-focus-axis y-axis")
              .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")));
            styleSimulationFocusChartChrome(g);

            const lineData = [
              { key: "prevalence", color: simulationCompartmentColors.I },
              { key: "exposedShare", color: simulationCompartmentColors.E },
              { key: "recoveredShare", color: simulationCompartmentColors.R },
            ];
            const seriesLayer = g
              .selectAll("g.simulation-trajectory-layer")
              .data([null])
              .join("g")
              .attr("class", "simulation-trajectory-layer");
            seriesLayer
              .selectAll("path.simulation-trajectory-line")
              .data(lineData, (d) => d.key)
              .join(
                (enter) =>
                  enter
                    .append("path")
                    .attr("class", "simulation-trajectory-line")
                    .attr("fill", "none"),
                (update) => update,
                (exit) => exit.remove(),
              )
              .attr("stroke", (d) => d.color)
              .attr("stroke-width", (d) => (d.key === "prevalence" ? 2.6 : 1.8))
              .attr("d", (d) => line(d.key)(series));

            const current = simulationState.currentFrame;
            if (current) {
              const markerLayer = g
                .selectAll("g.simulation-marker-layer")
                .data([null])
                .join("g")
                .attr("class", "simulation-marker-layer");
              renderSimulationDateMarker(markerLayer, {
                x,
                date: current.date,
                height,
                rangeWidth: 10,
                lineColor: "#ffffff",
              });
            }
          }

          function renderSimulationNodeInsight(view) {
            if (!selectedNodeData || !simulationState.currentFrame) return;
            const state = simulationState.currentFrame.nodeStates[selectedNodeData.id];
            if (!state) return;
            const selectedView = getSimulationNodeInsightView(view);
            window.currentSelectedTradeNodeInsight = selectedView;
            const select = document.getElementById("tradeNodeInsightSelect");
            if (select && select.value !== selectedView) {
              select.value = selectedView;
            }
            setSimulationNodeInsightSummary(selectedView, state);

            const container = d3.select("#tradeNodeInsight");
            const node = container.node();
            let svg = container.select("svg.trade-nodeinsight-svg");
            if (svg.empty()) {
              svg = container.append("svg").attr("class", "trade-nodeinsight-svg");
            }
            svg.classed("simulation-nodeinsight-svg", true);
            svg.attr("width", node.clientWidth).attr("height", node.clientHeight);
            const previousView = svg.attr("data-simulation-view");
            if (previousView !== selectedView) {
              svg.selectAll("*").remove();
            }
            svg.attr("data-simulation-view", selectedView);
            const { g, width, height } = prepareSimulationNodeInsightChart(
              svg,
              node,
              selectedView === "spatial"
                ? { legendBandHeight: 16, left: 46 }
                : {},
            );

            if (selectedView === "exposure") {
              renderSimulationExposureInsight(g, width, height, state);
              return;
            }

            if (selectedView === "spatial") {
              renderSimulationSpatialInsight(
                g,
                width,
                height,
                simulationState.currentFrame,
              );
              return;
            }

            renderSimulationPartitionInsight(g, width, height, state);
          }

          function applySimulationNodeStyles() {
            if (!isSimulationModeActive()) return;
            d3.selectAll(".nodeGroup").each(function (d) {
              const state = d.simulation;
              if (!state) return;
              d3.select(this)
                .select("circle.primary")
                .attr("fill", simulationPrevalenceScale(state.prevalence))
                .attr("stroke", state.prevalence > 0.05 ? "#7f1d1d" : null)
                .attr("stroke-width", state.prevalence > 0.05 ? 1.8 : null);
            });
            applySimulationMapPrevalence();
          }

          function applySimulationMapPrevalence() {
            if (!nlMapData) return;
            d3.selectAll(".map path").attr("fill", function (feature) {
              if (!isSimulationModeActive()) return "none";
              const id = feature?.properties?.statcode;
              const state = simulationState.currentFrame?.nodeStates[id];
              return state ? simulationPrevalenceScale(state.prevalence) : "none";
            }).attr("fill-opacity", isSimulationModeActive() ? 0.5 : null);
          }

          function renderSimulationPanels() {
            if (!isSimulationModeActive()) return;
            renderSimulationStatsContainer();
            renderSimulationGlobalStatsChart();
            renderSimulationNodeStatsChart();
            renderSimulationSpatialPatternPanel();
            renderSimulationPartitionStructurePanel();
            if (selectedNodeData) {
              renderSimulationFocusTrajectory();
              renderSimulationNodeInsight(window.currentSelectedTradeNodeInsight);
            }
            applySimulationNodeStyles();
          }

          function clearSimulationRenderState() {
            d3.selectAll(
              [
                "svg.simulation-global-chart",
                "svg.simulation-node-chart",
                "svg.simulation-spatial-chart",
                "svg.simulation-partition-chart",
                "svg.simulation-focus-chart",
              ].join(", "),
            ).remove();
            d3.selectAll("g.trade-donut.simulation-donut").remove();
            d3.selectAll(
              ".simulation-chart-legend, .simulation-panel-title, .simulation-panel-heading",
            ).remove();
            d3.selectAll(".simulation-focus-pill").remove();
            d3.selectAll(".simulation-partition-map").remove();
            resetFocusInsightRenderState();
            d3.selectAll(".nodeGroup circle.primary")
              .attr("fill", (d) => nodeColor(d.community))
              .attr("stroke", null)
              .attr("stroke-width", null);
            d3.selectAll(".map path").attr("fill", "none").attr("fill-opacity", null);
          }

          function resetFocusInsightRenderState(clearSummary = false) {
            const insightSvg = d3.select("#tradeNodeInsight svg.trade-nodeinsight-svg");
            if (!insightSvg.empty()) {
              insightSvg
                .interrupt()
                .attr("data-simulation-view", null)
                .classed("simulation-nodeinsight-svg", false);
              insightSvg.selectAll("*").interrupt().remove();
            }
            if (clearSummary) {
              const summary = document.getElementById("tradeNodeInsightSummary");
              if (summary) summary.innerHTML = "";
            }
          }

          function setTradeInsightOptionsForMode(active) {
            const select = document.getElementById("tradeNodeInsightSelect");
            if (!select) return;
            const mode = active ? "simulation" : "trade";
            if (select.dataset.mode === mode) return;
            select.dataset.mode = mode;
            select.innerHTML = active
              ? `
                <option value="partition">Partition load</option>
                <option value="exposure">Exposure balance</option>
                <option value="spatial">Spatial pattern</option>
              `
              : `
                <option value="partnerBalance">Partner balance</option>
                <option value="distanceProfile">Distance profile</option>
                <option value="communityMix">Community mixing</option>
              `;
            select.value = active ? "partition" : "partnerBalance";
            window.currentSelectedTradeNodeInsight = select.value;
          }

          function syncModeSwitcherRadios() {
            const activeValue = isSimulationModeActive()
              ? "simulation"
              : "trade-ledger";
            document
              .querySelectorAll('.mode-switcher input[name="modeType"]')
              .forEach((element) => {
                element.checked = element.value === activeValue;
              });
          }

          function setModePanelsRendering(rendering) {
            if (modePanelRenderingFrame) {
              cancelAnimationFrame(modePanelRenderingFrame);
              modePanelRenderingFrame = null;
            }
            clearTimeout(modePanelRenderingTimer);
            modePanelRenderingTimer = null;
            document.body.classList.toggle("mode-panels-rendering", rendering);
          }

          function finishModePanelsRendering() {
            if (!document.body.classList.contains("mode-panels-rendering")) {
              return;
            }
            if (modePanelRenderingFrame) {
              cancelAnimationFrame(modePanelRenderingFrame);
            }
            clearTimeout(modePanelRenderingTimer);
            modePanelRenderingTimer = setTimeout(() => {
              modePanelRenderingFrame = requestAnimationFrame(() => {
                modePanelRenderingFrame = null;
                setModePanelsRendering(false);
              });
            }, modePanelRenderingReleaseMs);
          }

          function setModeSwitcherDisabled(disabled) {
            document
              .querySelectorAll('.mode-switcher input[name="modeType"]')
              .forEach((element) => {
                element.disabled = disabled;
              });
            d3.selectAll(".mode-switcher-frame").classed(
              "disabled",
              disabled || appModeSwitchLocked,
            );
          }

          function releaseAppModeSwitchBounce() {
            appModeSwitchLocked = false;
            window.isSwitchingAppMode = false;
            if (simulationState.status !== "running" && !window.isSwitchingCSV) {
              setModeSwitcherDisabled(false);
              enableAllButtons(0);
              enableAllCheckboxes(0);
            }
          }

          function beginAppModeSwitchBounce() {
            if (appModeSwitchLocked) return false;
            appModeSwitchLocked = true;
            window.isSwitchingAppMode = true;
            clearTimeout(appModeSwitchTimer);
            disableAllButtons();
            disableAllCheckboxes();
            d3.selectAll(".mode-switcher-frame").classed("disabled", true);
            appModeSwitchTimer = setTimeout(
              releaseAppModeSwitchBounce,
              appModeSwitchBounceMs,
            );
            return true;
          }

          function canSwitchAppDataMode() {
            const mapGraphButton = document.getElementById("toggleModeButton");
            return (
              !appModeSwitchLocked &&
              !window.isSwitchingCSV &&
              !window.isPlaying &&
              !window.isDoingTemporalUpdate &&
              simulationState.status !== "running" &&
              !mapGraphButton?.disabled
            );
          }

          function setSimulationInputsDisabled(disabled) {
            ensureSimulationControls()
              .querySelectorAll("input, select")
              .forEach((element) => {
                element.disabled = disabled;
              });
            setModeSwitcherDisabled(disabled);
          }

          function configureSimulationModeUi(active) {
            const controls = ensureSimulationControls();
            controls.hidden = !active;
            controls.style.display = active && !selectedNodeData ? "block" : "none";
            document.body.classList.toggle("simulation-mode-active", active);
            if (!active) {
              document.body.classList.remove("focus-mode-active");
            }
            setSimulationPanelLabels(active);
            setTradeInsightOptionsForMode(active);
            if (active && selectedNodeData) {
              resetFocusInsightRenderState(true);
            }
            if (!selectedNodeData) {
              d3.select("#globalStatsControls").style("display", active ? "none" : "flex");
              d3.select("#nodeStatsControls").style("display", active ? "none" : "flex");
            }
          }

          function refreshCurrentNetworkFrame() {
            const date = getCurrentSliderDate();
            if (!date || !updateNetworkForDateHandler || !loadedCSVData) return;
            updateNetworkForDateHandler(date, loadedCSVData);
            updateCurrentDateDisplay(date);
          }

          async function recomputeSimulationTrajectory(reason = "Simulation run") {
            const stopRendering = () => {
              finishModePanelsRendering();
            };
            if (!loadedCSVData || !uniqueDates.length) {
              stopRendering();
              return;
            }
            const runId = ++simulationRunId;
            simulationState.status = "running";
            setSimulationInputsDisabled(true);
            disableAllButtons();
            disableAllCheckboxes();

            const stage = async (progress, key, label) => {
              if (runId !== simulationRunId) return false;
              setSimulationOverlay(progress, label, key);
              await delaySimulationStage();
              return runId === simulationRunId;
            };

            if (!(await stage(6, "ledger", reason))) return stopRendering();
            const settings = readSimulationSettings();
            if (!(await stage(18, "holdings", "Estimating regional holdings"))) return stopRendering();
            if (!(await stage(34, "contacts", "Building movement contacts"))) return stopRendering();
            if (!(await stage(48, "states", "Integrating compartment states"))) return stopRendering();
            const trajectory = buildSimulationTrajectory(settings);
            if (!(await stage(78, "frames", "Building replay ledger"))) return stopRendering();

            simulationState = {
              status: "ready",
              settings,
              trajectory,
              currentFrame: null,
              currentDateKey: null,
              metricMax: trajectory?.metricMax || null,
            };

            if (!(await stage(94, "render", "Rendering simulation view"))) return stopRendering();
            refreshCurrentNetworkFrame();
            renderSimulationPanels();
            finishModePanelsRendering();
            setSimulationOverlay(100, "Simulation ready", "render");
            await delaySimulationStage();
            hideSimulationOverlay();
            setSimulationInputsDisabled(false);
            enableAllButtons(0);
            enableAllCheckboxes(0);
          }

          function scheduleSimulationRecompute(reason = "Settings changed") {
            if (!isSimulationModeActive()) return;
            clearTimeout(simulationRecomputeTimer);
            simulationRecomputeTimer = setTimeout(() => {
              recomputeSimulationTrajectory(reason);
            }, 180);
          }

          function setAppDataMode(mode) {
            const nextMode = mode === "simulation" ? "simulation" : "trade";
            if (nextMode === appDataMode && nextMode !== "simulation") {
              syncModeSwitcherRadios();
              return false;
            }
            if (!canSwitchAppDataMode() || !beginAppModeSwitchBounce()) {
              syncModeSwitcherRadios();
              return false;
            }
            const wasSimulationRunning = simulationState.status === "running";
            setModePanelsRendering(true);
            appDataMode = nextMode;
            syncModeSwitcherRadios();
            configureSimulationModeUi(isSimulationModeActive());

            if (isSimulationModeActive()) {
              recomputeSimulationTrajectory("Preparing simulation trajectory");
              return true;
            }

            simulationRunId += 1;
            clearTimeout(simulationRecomputeTimer);
            simulationState = {
              status: "idle",
              settings: null,
              trajectory: null,
              currentFrame: null,
              currentDateKey: null,
              metricMax: null,
            };
            hideSimulationOverlay();
            clearSimulationRenderState();
            refreshCurrentNetworkFrame();
            updateNetwork(true);
            applySimulationMapPrevalence();
            finishModePanelsRendering();
            setSimulationInputsDisabled(false);
            if (wasSimulationRunning) {
              enableAllButtons(0);
              enableAllCheckboxes(0);
            }
            return true;
          }

          function bindSimulationUi() {
            const panel = ensureSimulationControls();
            if (!panel.dataset.bound) {
              panel.dataset.bound = "true";
              panel.querySelectorAll("input, select").forEach((element) => {
                const handleSettingChange = () => {
                  scheduleSimulationRecompute("Recomputing simulation");
                };
                element.addEventListener("change", handleSettingChange);
                element.addEventListener("input", handleSettingChange);
              });
            }

            document
              .querySelectorAll('.mode-switcher input[name="modeType"]')
              .forEach((radio) => {
                if (radio.dataset.bound) return;
                radio.dataset.bound = "true";
                radio.addEventListener("change", (event) => {
                  if (!event.target.checked) return;
                  setAppDataMode(
                    event.target.value === "simulation" ? "simulation" : "trade",
                  );
                });
              });
          }
    
          // Cache loaded assets in memory.
          const assetCache = {};

          function resolveAssetUrl(url) {
            if (/^(?:[a-z]+:)?\/\//i.test(url)) {
              return url;
            }

            const assetPath = url.replace(/^\.?\//, "");
            const basePath = window.HERDLINK_BASE_PATH || "/";
            const baseUrl = new URL(basePath, window.location.origin);
            return new URL(assetPath, baseUrl).toString();
          }
    
          // Load an asset and cache the result.
          // Supports JSON, blob, and text payloads.
          function fetchAsset(url, type = "json") {
            const assetUrl = resolveAssetUrl(url);
            if (assetCache[assetUrl]) {
              return Promise.resolve(assetCache[assetUrl]);
            }
            let promise;
            if (type === "json") {
              promise = fetch(assetUrl).then((response) => {
                if (!response.ok) {
                  throw new Error(`Failed to load ${assetUrl}`);
                }
                return response.json();
              });
            } else if (type === "blob") {
              promise = fetch(assetUrl).then((response) => {
                if (!response.ok) {
                  throw new Error(`Failed to load ${assetUrl}`);
                }
                return response.blob();
              });
            } else if (type === "text") {
              promise = fetch(assetUrl).then((response) => {
                if (!response.ok) {
                  throw new Error(`Failed to load ${assetUrl}`);
                }
                return response.text();
              });
            }
            return promise.then((data) => {
              assetCache[assetUrl] = data;
              return data;
            });
          }
    
          // Load GeoJSON files.
          const mapDataReady = fetchAsset(
            "assets/files/herdlink/nl_corop.geojson",
            "json",
          )
            .then((data) => {
              nlMapData = data;
            })
            .catch((error) => {
              console.error("Error loading nl_corop.geojson:", error);
              throw error;
            });
    
          const labelPointsReady = fetchAsset(
            "assets/files/herdlink/nl_corop_labelpoint.geojson",
            "json",
          )
            .then((data) => {
              nlLabelPoints = data;
            })
            .catch((error) => {
              console.error("Error loading nl_corop_labelpoint.geojson:", error);
              throw error;
            });
    
          // Disable the mode toggle until data is ready.
          d3.select("#toggleModeButton").attr("disabled", true);
    
          // Switch between graph and map modes.
          d3.select("#toggleModeButton").on("click", () => {
            if (currentMode === "graph") {
              switchToMapMode();
              d3.select("#toggleModeButton")
                .html(
                  '<span class="btn-text"><i class="fa-solid fa-hexagon-nodes"></i></span>',
                )
                .classed("map-mode", true)
                .classed("graph-mode", false);
              currentMode = "map";
              setModeControlTip(controlTips.switchToGraph);
            } else {
              switchToGraphMode();
              d3.select("#toggleModeButton")
                .html(
                  '<span class="btn-text"><i class="fa-solid fa-map-location-dot"></i></span>',
                )
                .classed("graph-mode", true)
                .classed("map-mode", false);
              currentMode = "graph";
              setModeControlTip(controlTips.switchToMap);
            }
          });
    
          // Precompute trade records for the selected date.
          function precomputeAllTradeData() {
            // Use the active date from global state.
            const currentDate = window.currentDate;
    
            // Map each node id to its trade records.
            // Store each trade once as outgoing
            // and once as incoming.
            window.precomputedTradeData = {};
    
            // Initialize an empty trade list for every node.
            allNodes.forEach((node) => {
              window.precomputedTradeData[node.id] = [];
            });
    
            // Keep only records for the active day.
            // Compare by year, month, and day.
            const filteredRecords = loadedCSVData.filter((record) => {
              const recordDate = new Date(record.time);
              return (
                recordDate.getFullYear() === currentDate.getFullYear() &&
                recordDate.getMonth() === currentDate.getMonth() &&
                recordDate.getDate() === currentDate.getDate()
              );
            });
    
            // Build records from the filtered rows.
            filteredRecords.forEach((record) => {
              const weight = +record.AANTAL;
              const source = record.COROP_LEV;
              const target = record.COROP_AFN;
              // Skip self-loops.
              if (source === target) return;
              if (weight > 0) {
                // Distance is symmetric.
                const sourceCoords = getCoordinatesForStatcode(source);
                const targetCoords = getCoordinatesForStatcode(target);
                if (!sourceCoords || !targetCoords) return;
                const distance = computeDistance(sourceCoords, targetCoords);
    
                // Resolve source and target nodes.
                const sourceNode = allNodes.find((n) => n.id === source);
                const targetNode = allNodes.find((n) => n.id === target);
                if (!sourceNode || !targetNode) return;
                const massProduct = sourceNode.tradeTotal * targetNode.tradeTotal;
    
                // Build outgoing and incoming entries.
                const outgoingRecord = {
                  sourceId: source,
                  targetId: target,
                  weight: weight,
                  distance: distance,
                  massProduct: massProduct,
                  type: "outgoing",
                };
                const incomingRecord = {
                  sourceId: source,
                  targetId: target,
                  weight: weight,
                  distance: distance,
                  massProduct: massProduct,
                  type: "incoming",
                };
    
                // Save both entries.
                // Outgoing entry for source node.
                window.precomputedTradeData[source].push(outgoingRecord);
                // Incoming entry for target node.
                window.precomputedTradeData[target].push(incomingRecord);
              }
            });
          }
    
          // Map COROP code to statnaam.
          function getStatnaam(code) {
            if (nlLabelPoints && nlLabelPoints.features) {
              let feat = nlLabelPoints.features.find(
                (f) => f.properties.statcode === code,
              );
              return feat ? feat.properties.statnaam : code;
            }
            return code;
          }
    
          function updateNetworkStats(force = false) {
            if (isSimulationModeActive() && simulationState.currentFrame) {
              hotspots = simulationState.currentFrame.nodeMetrics;
              hotspotsMax = simulationState.metricMax;
              renderSimulationStatsContainer();
              return;
            }

            // Initialize aggregate stats.
            let totalNodes,
              totalEdges,
              totalTradeVolume,
              avgTradeEdge,
              avgTradeNode,
              numComponents,
              modularity,
              partition,
              numPartitions,
              hotSpotStats;
    
            // Format numbers safely with fixed precision.
            function safeToFixed(value, digits = 0) {
              const num = Number(value);
              return isFinite(num) ? num.toFixed(digits) : "N/A";
            }
    
            // Use precomputed stats when available for the current date.
            if (
              window.currentDate &&
              window.allTemporalStats &&
              window.allTemporalStats[window.currentDate.toISOString()] &&
              !force
            ) {
              const stats =
                window.allTemporalStats[window.currentDate.toISOString()];
              totalNodes = stats.totalNodes;
              totalEdges = stats.totalEdges;
              totalTradeVolume = stats.totalTradeVolume;
              avgTradeEdge = stats.avgTradeEdge;
              avgTradeNode = stats.avgTradeNode;
              numComponents = stats.numComponents;
              modularity = stats.modularity;
              partition = stats.partition;
              numPartitions = stats.numPartitions;
    
              // Assign partition ids to nodes.
              allNodes.forEach((node) => {
                node.community = partition[node.id];
              });
            } else if (force) {
              // Recompute network-wide statistics.
              const activeNodes = allNodes.filter((node) => node.active);
    
              // Compute basic counts and totals.
              const simpleStats = computeSimpleStats(activeNodes, enabledLinks);
              // Compute connectivity on an undirected view.
              numComponents = computeNumberOfConnectedComponents(
                activeNodes,
                enabledLinks,
              );
              // Compute modularity.
              modResult = computeModularity(activeNodes, enabledLinks);
    
              // Compute spectral radius (risk score).
              spectralRadius = computeSpectralRadius(activeNodes, enabledLinks);
    
              totalNodes = simpleStats.totalNodes;
              totalEdges = simpleStats.totalEdges;
              totalTradeVolume = simpleStats.totalTradeVolume;
              avgTradeEdge = simpleStats.avgTradeEdge;
              avgTradeNode = simpleStats.avgTradeNode;
              modularity = modResult.modularity;
              partition = modResult.partition;
    
              // Count distinct partitions.
              numPartitions = new Set(Object.values(partition)).size;
    
              // Assign partition ids to nodes.
              allNodes.forEach((node) => {
                node.community = partition[node.id];
              });
            } else {
              console.error(
                "No stats found for the current date. Computing basic stats...",
              );
            }
    
            // Use cached node stats for hotspots when available.
            if (
              window.currentDate &&
              window.allTemporalNodeStats &&
              window.allTemporalNodeStats[window.currentDate.toISOString()] &&
              !force
            ) {
              hotSpotStats =
                window.allTemporalNodeStats[window.currentDate.toISOString()];
              hotspots = hotSpotStats;
            } else if (force) {
              // Recompute node-level statistics.
              hotSpotStats = computeHotSpotMetrics(allNodes, enabledLinks);
              hotspots = hotSpotStats;
            } else {
              console.error(
                "No node stats found for the current date. Computing node stats...",
              );
            }
    
            // Build stat rows for rendering.
            const statItems = [
              {
                icon: '<i class="fa-solid fa-map-pin"></i>',
                label: "Active Regions",
                value: totalNodes,
              },
              {
                icon: '<i class="fa-solid fa-route"></i>',
                label: "Trade Routes",
                value: totalEdges,
              },
              {
                icon: '<i class="fa-solid fa-dolly"></i>',
                label: "Total Volume",
                value: safeToFixed(totalTradeVolume, 0),
              },
              {
                icon: '<i class="fa-solid fa-dolly"></i>',
                label: "Avg. Volume/Route",
                value: safeToFixed(avgTradeEdge, 0),
              },
              {
                icon: '<i class="fa-solid fa-dolly"></i>',
                label: "Avg. Volume/Area",
                value: safeToFixed(avgTradeNode, 0),
              },
              {
                icon: '<i class="fa-solid fa-object-ungroup"></i>',
                label: "Communities",
                value: numPartitions,
              },
              {
                icon: '<i class="fa-solid fa-ball-pile"></i>',
                label: "Modularity",
                value: safeToFixed(modularity, 3),
              },
            ];
    
            // Select the stats container.
            const container = d3.select(".statsContainer").call(
              d3
                .drag()
                .on("start", function (event) {
                  d3.select(this).raise();
                })
                .on("drag", function (event) {
                  const parentRect = d3
                    .select("#col2")
                    .node()
                    .getBoundingClientRect();
                  const thisRect = d3.select(this).node().getBoundingClientRect();
    
                  // Read current left/top positions in pixels.
                  const currentLeft = parseFloat(d3.select(this).style("left"));
                  const currentTop = parseFloat(d3.select(this).style("top"));
    
                  // Apply drag deltas.
                  let newLeft = currentLeft + event.dx;
                  let newTop = currentTop + event.dy;
    
                  // Keep the panel within #col2 horizontally.
                  newLeft = Math.max(
                    0,
                    Math.min(newLeft, parentRect.width - thisRect.width),
                  );
    
                  // Keep the panel within #col2 vertically.
                  newTop = Math.max(
                    0,
                    Math.min(newTop, parentRect.height - thisRect.height),
                  );
    
                  // Update panel position.
                  d3.select(this)
                    .style("left", newLeft + "px")
                    .style("top", newTop + "px");
                })
                .on("end", function () {}),
            );
            container.classed("simulation-stats-container", false);
    
            // Clear previous content.
            container.html("");
    
            if (selectedNodeData) {
              container.style("border", "1px dashed white");
              container.style("background", "rgba(255, 255, 255, 0.05)");
            } else {
              container.style("border", "1px dashed green");
              container.style("background", "rgba(0, 255, 0, 0.03)");
            }
    
            // Layout constants for stat rows.
            const statItemHeight = 20;
            const statMargin = 4;
            const startX = 0;
            const valueX = 250;
    
            // Render each stat row.
            statItems.forEach((itemData) => {
              const item = container
                .append("div")
                .attr("class", "stat-item")
                .style("color", selectedNodeData ? "white" : "gray");
    
              // Render icon.
              item.append("div").attr("class", "stat-icon").html(itemData.icon);
    
              // Render label.
              item.append("span").attr("class", "stat-label").text(itemData.label);
    
              // Render value.
              item.append("span").attr("class", "stat-value").text(itemData.value);
            });
    
            // Compute spectral radius from enabled links.
            const currentSR = computeSpectralRadius(allNodes, enabledLinks);
    
            // Read maximum spectral radius from cached temporal stats.
            maxSR = window.maxTemporalStats
              ? window.maxTemporalStats.spectralRadius
              : 0;
    
            // Normalize current spectral radius against the baseline.
            const normalizedValue = currentSR / maxSR; // 1.0 means no change
            const formattedNormal = normalizedValue.toFixed(3); // three decimal places
    
            // Color scale for normalized risk score.
            // 0.0 = green, 1.0 = salmon, 2.0 = orange.
            const colorScale = d3
              .scaleLinear()
              .domain([0, 1, 2])
              .range(["#b2c248", "salmon", "orange"])
              .clamp(true);
    
            // Update the risk score display.
            const displayElement = document.getElementById("networkTransRiskScore");
            displayElement.innerHTML = `
                          <i class="fa-solid fa-virus"></i> Risk Score: <span class="current-sr">${formattedNormal}</span> <span class="initial-sr">(1.000)</span>
                      `;
    
            // Ensure the display is visible.
            if (
              displayElement.style.display === "none" ||
              getComputedStyle(displayElement).display === "none"
            ) {
              displayElement.style.display = "block";
            }
    
            // Keep baseline value color fixed to salmon.
            const initialSpan = displayElement.querySelector(".initial-sr");
            initialSpan.style.color = "salmon";
    
            // Color current value by normalized risk.
            const currentSpan = displayElement.querySelector(".current-sr");
            currentSpan.style.color = colorScale(normalizedValue);
          }
    
          function updateGlobalStatsChart(selectedStat) {
            if (isSimulationModeActive() && simulationState.trajectory) {
              renderSimulationGlobalStatsChart();
              return;
            }

            const container = d3.select("#globalStats");
            let svg = container.select("svg");
            const margin = { top: 40, right: 30, bottom: 40, left: 10 };
            let width, height;
            if (svg.empty()) {
              const containerNode = container.node();
              width = containerNode.clientWidth - margin.left - margin.right;
              height = containerNode.clientHeight - margin.top - margin.bottom;
              svg = container
                .append("svg")
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            } else {
              const containerNode = container.node();
              width = containerNode.clientWidth - margin.left - margin.right;
              height = containerNode.clientHeight - margin.top - margin.bottom;
              svg
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom);
            }
    
            // Extract and sort the data from global allTemporalStats.
            // Each datum is { date: Date, value: <number> }.
            const data = Object.keys(window.allTemporalStats)
              .map((dateStr) => {
                const statValue = window.allTemporalStats[dateStr][selectedStat];
                return {
                  date: new Date(dateStr),
                  value:
                    statValue !== undefined && !isNaN(+statValue) ? +statValue : 0,
                };
              })
              .filter((d) => !isNaN(d.value))
              .sort((a, b) => a.date - b.date);
    
            // Define scales.
            const xPadding = 20;
            const x = d3
              .scaleTime()
              .domain(d3.extent(data, (d) => d.date))
              .range([xPadding, width - xPadding]);
            const minValue = d3.min(data, (d) => d.value);
            const maxValue = d3.max(data, (d) => d.value);
            let yDomain;
            if (minValue === 0) {
              yDomain = [0, maxValue * 1.1];
            } else {
              // Otherwise, add a bit extra at both ends (10% below and above)
              yDomain = [minValue * 0.9, maxValue * 1.1];
            }
            const y = d3.scaleLinear().domain(yDomain).range([height, 0]).nice();
    
            const currentDatum = data.find(
              (d) => d.date.getTime() === window.currentDate.getTime(),
            );
            if (currentDatum) {
              const newTransform = `translate(${x(currentDatum.date)},${y(currentDatum.value)})`;
    
              // Compute transformed x and y positions.
              const xPos = x(currentDatum.date);
              const yPos = y(currentDatum.value);
    
              // Compute offset for the annotation based on the current value.
              const offsets = getAnnotationOffset(xPos, yPos, width, height);
    
              const annotationData = [
                {
                  note: {
                    title: "Current Date",
                    label: d3.timeFormat("%d-%m-%Y")(window.currentDate),
                    bgPadding: { top: 2, left: 2, right: 2, bottom: 2 },
                  },
                  className: "current-date-annotation",
                  x: 0,
                  y: 0,
                  dx: offsets.dx,
                  dy: offsets.dy,
                  subject: {
                    radius: 5,
                    radiusPadding: 5,
                  },
                },
              ];
    
              const currentAnno = d3
                .annotation()
                .type(currentDateAnnoType)
                .notePadding(10)
                .annotations(annotationData);
    
              let currentDateAnnoGroup = svg.select("g.current-date-annotation");
              if (currentDateAnnoGroup.empty()) {
                // Create the group with the correct transform and call the annotation generator.
                currentDateAnnoGroup = svg
                  .append("g")
                  .attr("class", "current-date-annotation")
                  .attr("transform", newTransform);
                currentDateAnnoGroup.call(currentAnno);
                currentDateAnnoGroup
                  .selectAll(".current-date-annotation .annotation-note text")
                  .attr("fill", "white");
                currentDateAnnoGroup
                  .selectAll("rect.annotation-note-bg")
                  .attr("fill", "green")
                  .attr("fill-opacity", 0.8)
                  .attr("rx", 4)
                  .attr("ry", 4);
                currentDateAnnoGroup.raise();
              } else {
                // Capture the old transform.
                const oldTransform = currentDateAnnoGroup.attr("transform");
                // Transition the transform attribute on the regular selection.
                currentDateAnnoGroup
                  .transition()
                  .duration(300)
                  .attrTween("transform", function () {
                    return d3.interpolateString(oldTransform, newTransform);
                  })
                  .on("end", function () {
                    // After transition, call the annotation generator on the normal selection.
                    const sel = d3.select(this);
                    sel.call(currentAnno);
                    // Reapply styles after re-rendering the annotation.
                    sel.selectAll(".annotation-note text").attr("fill", "white");
                    sel
                      .selectAll("rect.annotation-note-bg")
                      .attr("fill", "green")
                      .attr("fill-opacity", 0.8)
                      .attr("rx", 4)
                      .attr("ry", 4);
                    sel.raise();
                  });
              }
            }
    
            // Define axes.
            const xAxis = d3.axisBottom(x).tickFormat(function (date) {
              const month = d3.timeFormat("%b")(date);
              const year = d3.timeFormat("%Y")(date);
              return month === "Jan" ? year : month;
            });
    
            let xAxisG = svg.select(".x-axis");
            if (xAxisG.empty()) {
              xAxisG = svg
                .append("g")
                .attr("class", "x-axis")
                .attr("transform", `translate(0, ${height})`)
                .call(xAxis);
            } else {
              xAxisG
                .transition()
                .duration(300)
                .attr("transform", `translate(0, ${height})`)
                .call(xAxis);
            }
    
            const yAxis = d3.axisLeft(y).tickFormat(d3.format("~s"));
    
            // Select the y-grid group; if it doesn't exist, create it.
            let yGrid = svg.select("g.y-grid");
            if (yGrid.empty()) {
              yGrid = svg
                .append("g")
                .attr("class", "y-grid")
                .attr("stroke", "lightgray")
                .attr("stroke-opacity", 0.2);
            }
    
            const yGridLines = d3
              .axisLeft(y)
              .ticks(5)
              .tickSize(-width)
              .tickFormat((d) => (d === d3.min(y.domain()) ? "" : d));
    
            if (!preYDomainGlobalStats) {
              preYDomainGlobalStats = y.domain();
            }
    
            if (
              preYDomainGlobalStats &&
              preYDomainGlobalStats[0] === y.domain()[0] &&
              preYDomainGlobalStats[1] === y.domain()[1]
            ) {
              // y-domain unchanged: update immediately.
              yGrid.transition().duration(0).call(yGridLines);
              yGrid.select(".domain").remove();
              yGrid.lower();
              yGrid
                .selectAll(".tick text")
                .attr("x", 0)
                .attr("dy", "1.5em")
                .style("text-anchor", "start");
            } else {
              // y-domain changed: transition.
              yGrid.transition().duration(300).call(yGridLines);
              yGrid.select(".domain").remove();
              yGrid.lower();
              yGrid
                .selectAll(".tick text")
                .attr("x", 0)
                .attr("dy", "1.5em")
                .style("text-anchor", "start");
            }
            // Update the stored y-domain.
            preYDomainGlobalStats = y.domain();
    
            // Helper function: Compute moving average over a sliding window.
            function movingAverage(data, windowSize) {
              return data.map((d, i, arr) => {
                const start = Math.max(0, i - windowSize + 1);
                const subset = arr.slice(start, i + 1);
                const avg = d3.mean(subset, (d) => d.value);
                return { date: d.date, value: avg };
              });
            }
    
            // Helper function: Compute 95% confidence interval for each data point in a sliding window.
            function computeConfidenceIntervals(data, windowSize) {
              return data.map((d, i, arr) => {
                const start = Math.max(0, i - windowSize + 1);
                const subset = arr.slice(start, i + 1);
                const mean = d3.mean(subset, (d) => d.value);
                const sd = d3.deviation(subset, (d) => d.value) || 0;
                const n = subset.length;
                // Approximate 95% CI: margin = 1.96 * (sd / sqrt(n))
                const margin = 1.96 * (sd / Math.sqrt(n));
                return { date: d.date, lower: mean - margin, upper: mean + margin };
              });
            }
    
            // Use window size of 12 for the moving average and confidence intervals.
            // This is equivalent to a 1-year window for the monthly data.
            // Might need dynamic window size based on the data frequency.
            const windowSize = 12;
    
            // Compute the moving average and confidence intervals.
            const movingAvgData = movingAverage(data, windowSize);
            const ciData = computeConfidenceIntervals(data, windowSize);
    
            // Create an area generator for the confidence interval.
            const ciArea = d3
              .area()
              .x((d) => x(d.date))
              .y0((d) => y(d.lower))
              .y1((d) => y(d.upper))
              .curve(d3.curveMonotoneX); // smooth interpolation
    
            // Append or update the confidence interval area.
            let ciPath = svg.select("path.ci-area");
            if (ciPath.empty()) {
              ciPath = svg
                .append("path")
                .attr("class", "ci-area")
                .attr("fill", "green")
                .attr("fill-opacity", 0.1);
            }
            ciPath.datum(ciData).transition().duration(300).attr("d", ciArea);
    
            // Create a line generator for the moving average.
            const maLine = d3
              .line()
              .x((d) => x(d.date))
              .y((d) => y(d.value))
              .curve(d3.curveMonotoneX);
    
            // Append or update the moving average line.
            let maPath = svg.select("path.moving-average-line");
            if (maPath.empty()) {
              maPath = svg
                .append("path")
                .attr("class", "moving-average-line")
                .attr("fill", "none")
                .attr("stroke", "gray")
                .attr("stroke-dasharray", "5,5")
                .attr("stroke-width", 2);
            }
            maPath
              .datum(movingAvgData)
              .transition()
              .duration(300)
              .attr("d", maLine);
    
            // Define the line generator.
            const line = d3
              .line()
              .x((d) => x(d.date))
              .y((d) => y(d.value));
    
            // Select or create the line path.
            let linePath = svg.select("path.line-chart");
            if (linePath.empty()) {
              linePath = svg
                .append("path")
                .attr("class", "line-chart")
                .datum(data)
                .attr("fill", "none")
                .attr("stroke", "green")
                .attr("stroke-width", 1)
                .attr("d", line);
            } else {
              // Transition the "d" attribute using string interpolation.
              linePath
                .datum(data)
                .transition()
                .duration(300)
                .attrTween("d", function () {
                  const previous = this.getAttribute("d");
                  const current = line(data);
                  return d3.interpolateString(previous, current);
                })
                .attr("stroke", "green")
                .attr("stroke-width", 1);
            }
    
            // DATA JOIN for data point circles.
            let pointsGroup = svg.select("g.data-points");
            if (pointsGroup.empty()) {
              pointsGroup = svg.append("g").attr("class", "data-points");
              pointsGroup
                .selectAll("circle.data-point")
                .data(data, (d) => d.date)
                .enter()
                .append("circle")
                .attr("class", "data-point")
                .attr("cx", (d) => x(d.date))
                .attr("cy", (d) => y(d.value))
                .attr("r", 0)
                .attr("fill", "gray")
                .transition()
                .duration(300)
                .attr("r", 2);
            } else {
              const circles = pointsGroup
                .selectAll("circle.data-point")
                .data(data, (d) => d.date);
              circles.exit().transition().duration(300).attr("r", 0).remove();
              circles
                .transition()
                .duration(300)
                .attr("cx", (d) => x(d.date))
                .attr("cy", (d) => y(d.value));
              circles
                .enter()
                .append("circle")
                .attr("class", "data-point")
                .attr("cx", (d) => x(d.date))
                .attr("cy", (d) => y(d.value))
                .attr("r", 0)
                .attr("fill", "gray")
                .transition()
                .duration(300)
                .attr("r", 2);
            }
            svg.select("g.current-date-annotation").raise();
          }
    
          function updateNodeStatsChart(selectedMetric) {
            if (isSimulationModeActive() && simulationState.currentFrame) {
              renderSimulationNodeStatsChart();
              return;
            }

            const margin = { top: 40, right: 30, bottom: 40, left: 10 };
            const container = d3.select("#nodeStats");
            container.selectAll(".simulation-panel-heading").remove();
            const containerWidth = container.node().clientWidth;
            const containerHeight = container.node().clientHeight;
            const width = containerWidth - margin.left - margin.right;
            const height = containerHeight - margin.top - margin.bottom;
    
            // Create or update the SVG container.
            let svgContainer = container.select("svg");
            if (svgContainer.empty()) {
              svgContainer = container
                .append("svg")
                .attr("width", containerWidth)
                .attr("height", containerHeight);
              svgContainer
                .append("g")
                .attr("class", "chart-group")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            } else {
              // Update the container dimensions and transform on resize.
              svgContainer
                .attr("width", containerWidth)
                .attr("height", containerHeight);
              svgContainer
                .select("g.chart-group")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            }
            const svg = svgContainer.select("g.chart-group");
    
            // Process the global allTemporalNodeStats:
            const nodeData = {};
            const parseDate = d3.isoParse;
            const dateStrings = Object.keys(window.allTemporalNodeStats).sort(
              (a, b) => new Date(a) - new Date(b),
            );
            dateStrings.forEach((dateStr) => {
              const date = parseDate(dateStr);
              const nodes = window.allTemporalNodeStats[dateStr];
              for (const nodeId in nodes) {
                if (!nodeData[nodeId]) {
                  nodeData[nodeId] = [];
                }
                nodeData[nodeId].push({
                  date: date,
                  value: nodes[nodeId][selectedMetric],
                });
              }
            });
    
            // Convert nodeData to an array.
            const nodesArray = Object.keys(nodeData).map((nodeId) => {
              const nodeValues = nodeData[nodeId];
              const nodeInfo = allNodes.find((n) => n.id === nodeId);
              const community = nodeInfo ? nodeInfo.community : "NA";
              return {
                nodeId: nodeId,
                values: nodeValues,
                community: community,
              };
            });
    
            // Build a set of unique community ids from the nodes that appear.
            const communityIds = Array.from(
              new Set(nodesArray.map((d) => d.community)),
            );
            // Assign a color to each node based on its community.
            nodesArray.forEach((node) => {
              node.color = nodeColor(node.community);
            });
    
            // Compute overall y-domain from all values.
            let allValues = [];
            nodesArray.forEach((node) => {
              node.values.forEach((d) => allValues.push(d.value));
            });
            const yMin = d3.min(allValues);
            const yMax = d3.max(allValues);
    
            // Define scales.
            const xPadding = 20;
            const x = d3
              .scaleTime()
              .domain(d3.extent(dateStrings, (d) => parseDate(d)))
              .range([xPadding, width - xPadding]);
            let y;
            if (selectedMetric === "inDegree" || selectedMetric === "outDegree") {
              y = d3.scaleSqrt().domain([yMin, yMax]).range([height, 0]);
            } else {
              y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]).nice();
            }
    
            // Define the x-axis with abbreviated tick labels.
            const xAxis = d3.axisBottom(x).tickFormat(function (date) {
              const month = d3.timeFormat("%b")(date);
              const year = d3.timeFormat("%Y")(date);
              return month === "Jan" ? year : month;
            });
    
            let xAxisG = svg.select(".x-axis");
            if (xAxisG.empty()) {
              xAxisG = svg
                .append("g")
                .attr("class", "x-axis")
                .attr("transform", `translate(0, ${height})`)
                .call(xAxis);
            } else {
              xAxisG
                .transition()
                .duration(300)
                .attr("transform", `translate(0, ${height})`)
                .call(xAxis);
            }
    
            // Select the y-grid group; if it doesn't exist, create it.
            let yGrid = svg.select("g.y-grid");
            if (yGrid.empty()) {
              yGrid = svg
                .append("g")
                .attr("class", "y-grid")
                .attr("stroke", "lightgray")
                .attr("stroke-opacity", 0.2);
            }
    
            const yGridLines = d3
              .axisLeft(y)
              .ticks(5)
              .tickSize(-width)
              .tickFormat((d) => (d === d3.min(y.domain()) ? "" : d));
    
            if (!preYDomainNodeStats) {
              preYDomainNodeStats = y.domain();
            }
    
            if (
              preYDomainNodeStats &&
              preYDomainNodeStats[0] === y.domain()[0] &&
              preYDomainNodeStats[1] === y.domain()[1]
            ) {
              // y-domain unchanged: update immediately.
              yGrid.transition().duration(0).call(yGridLines);
              yGrid.select(".domain").remove();
              yGrid.lower();
              yGrid
                .selectAll(".tick text")
                .attr("x", 0)
                .attr("dy", "1.5em")
                .style("text-anchor", "start");
            } else {
              // y-domain changed: transition.
              yGrid.transition().duration(300).call(yGridLines);
              yGrid.select(".domain").remove();
              yGrid.lower();
              yGrid
                .selectAll(".tick text")
                .attr("x", 0)
                .attr("dy", "1.5em")
                .style("text-anchor", "start");
            }
            // Update the stored y-domain.
            preYDomainNodeStats = y.domain();
    
            // Add sliding window highlight for the current date
            // Define the width (in pixels) for the sliding window.
            const windowWidth = 15;
            // Compute the x-coordinate for the highlight (centered on window.currentDate).
            const currentX = x(window.currentDate) - windowWidth / 2;
    
            // Select (or create) the highlight rectangle.
            let highlightRect = svg.select("rect.current-date-highlight");
            if (highlightRect.empty()) {
              // Insert it as the first element so it lies behind other elements.
              highlightRect = svg
                .insert("rect", ":first-child")
                .attr("class", "current-date-highlight")
                .attr("x", currentX)
                .attr("y", 0)
                .attr("width", windowWidth)
                .attr("height", height)
                .attr("fill", "gray")
                .attr("fill-opacity", 0.1)
                .attr("rx", 3)
                .attr("ry", 3);
            } else {
              // Transition to the new x position if currentDate has changed.
              highlightRect
                .transition()
                .duration(300)
                .attr("x", currentX)
                .attr("height", height);
            }
    
            // Add vertical dashed line at the center of the window rect
            // Compute the x-coordinate for the line (center of the window rect).
            const lineX = currentX + windowWidth / 2;
            let highlightLine = svg.select("line.current-date-line");
            if (highlightLine.empty()) {
              highlightLine = svg
                .insert("line", ":first-child")
                .attr("class", "current-date-line")
                .attr("x1", lineX)
                .attr("x2", lineX)
                .attr("y1", 0)
                .attr("y2", height)
                .attr("stroke", "green")
                .attr("stroke-width", 1)
                .attr("stroke-dasharray", "4,2")
                .attr("filter", "brightness(1.2)");
              highlightLine.raise();
            } else {
              // Transition the dashed line to the new x position.
              highlightLine
                .transition()
                .duration(300)
                .attr("x1", lineX)
                .attr("x2", lineX)
                .attr("y2", height)
                .attr("filter", "brightness(1.2)");
              highlightLine.raise();
            }
    
            // Add drag behavior for the sliding window highlight.
            const sliderEl = document.getElementById("timeSlider"); // get the slider element
    
            highlightRect.call(
              d3.drag().on("drag", function (event) {
                // Compute the new x position of the rectangle and constrain it within the x-scale range.
                let newX = event.x;
                // Constrain: newX should not be less than xPadding and not beyond (width - xPadding - windowWidth)
                newX = Math.max(
                  xPadding,
                  Math.min(newX, width - xPadding - windowWidth),
                );
                // Update the rectangle's x position.
                highlightRect.attr("x", newX);
    
                // Update the dashed line: its x is at the center of the rectangle.
                const newLineX = newX + windowWidth / 2;
                highlightLine.attr("x1", newLineX).attr("x2", newLineX);
    
                // Compute the new current date by inverting the x-scale at the new center.
                const newDate = x.invert(newLineX);
                window.currentDate = newDate;
    
                // Find the closest index in uniqueDates.
                const bisect = d3.bisector((d) => d.getTime()).left;
                const idx = bisect(uniqueDates, newDate.getTime());
    
                // Update the slider value.
                if (sliderEl) {
                  sliderEl.value = idx;
                  // Fire update event on the slider.
                  sliderEl.dispatchEvent(new Event("input", { bubbles: true }));
                }
              }),
            );
    
            // Compute the top five nodes within the current window
            // For each node, find the data point (from node.values) closest to window.currentDate.
            const bisectDate = d3.bisector((d) => d.date).left;
            const topNodes = nodesArray
              .map((node) => {
                const index = bisectDate(node.values, window.currentDate);
                let currentValue;
                if (index >= node.values.length) {
                  currentValue = node.values[node.values.length - 1].value;
                } else if (index === 0) {
                  currentValue = node.values[0].value;
                } else {
                  // Choose the closer of the two surrounding points.
                  const prev = node.values[index - 1];
                  const curr = node.values[index];
                  currentValue =
                    window.currentDate - prev.date < curr.date - window.currentDate
                      ? prev.value
                      : curr.value;
                }
                return {
                  nodeId: node.nodeId,
                  value: currentValue,
                  color: node.color,
                  y: y(currentValue),
                };
              })
              .sort((a, b) => b.value - a.value) // sort descending by value
              .slice(0, 5);
    
            // Adjust label positions to avoid overlap
            // First, sort the topNodes by their natural y position (ascending: top to bottom).
            topNodes.sort((a, b) => a.y - b.y);
            const minSpacing = 22;
            topNodes.forEach((d, i) => {
              if (i === 0) {
                d.adjustedY = d.y;
              } else {
                d.adjustedY = Math.max(d.y, topNodes[i - 1].adjustedY + minSpacing);
              }
            });
    
            // Define a line generator with smooth (smoothed) curve.
            const line = d3
              .line()
              .x((d) => x(d.date))
              .y((d) => y(d.value))
              .curve(d3.curveMonotoneX);
    
            // DATA JOIN: Create groups for each node.
            const nodeGroups = svg
              .selectAll(".node-group")
              .data(nodesArray, (d) => d.nodeId);
    
            nodeGroups.exit().remove();
            const nodeGroupsEnter = nodeGroups
              .enter()
              .append("g")
              .attr("class", "node-group");
            const nodeGroupsMerge = nodeGroupsEnter.merge(nodeGroups);
    
            // For each node group, draw only a smoothed line.
            nodeGroupsMerge.each(function (d) {
              const group = d3.select(this);
    
              // Draw or update the smoothed line.
              let path = group.select("path.node-line");
              if (path.empty()) {
                path = group
                  .append("path")
                  .attr("class", "node-line")
                  .attr("fill", "none")
                  .attr("stroke", d.color)
                  .attr("stroke-width", 1.5);
              }
              path
                .datum(d.values)
                .transition()
                .duration(300)
                .attr("stroke", d.color)
                .attr("d", line);
            });
    
            // Data join for top five node labels with background
            const labelGroups = svg
              .selectAll("g.top-label-group")
              .data(topNodes, (d) => d.nodeId);
    
            labelGroups.exit().remove();
    
            const labelGroupsEnter = labelGroups
              .enter()
              .append("g")
              .attr("class", "top-label-group");
    
            // Merge and transition the entire group to its new vertical position.
            // The group is translated to (currentX + windowWidth + 5, adjustedY).
            const labelGroupsMerge = labelGroupsEnter
              .merge(labelGroups)
              .transition()
              .duration(300)
              .attr(
                "transform",
                (d) => `translate(${currentX + windowWidth + 5}, ${d.adjustedY})`,
              );
    
            labelGroupsEnter.merge(labelGroups).each(function (d) {
              const g = d3.select(this);
    
              let textEl = g.select("text");
              if (textEl.empty()) {
                textEl = g
                  .append("text")
                  .attr("font-size", "10px")
                  .attr("alignment-baseline", "middle")
                  .attr("fill", "white")
                  .attr("y", 0)
                  .text(d.nodeId);
              } else {
                textEl.text(d.nodeId).attr("fill", "white");
              }
    
              const bbox = textEl.node().getBBox();
              let bg = g.select("rect.label-bg");
              if (bg.empty()) {
                bg = g
                  .insert("rect", "text")
                  .attr("class", "label-bg")
                  .attr("rx", 3)
                  .attr("ry", 3)
                  .attr("fill", "green")
                  .attr("stroke", "none")
                  .attr("stroke-width", 0.5);
              }
              bg.transition()
                .duration(300)
                .attr("x", bbox.x - 2)
                .attr("y", bbox.y - 2)
                .attr("width", bbox.width + 4)
                .attr("height", bbox.height + 4);
    
              // Add dashed line from the left edge of the label background to the node's point
              // Compute the node's point relative to the label group's coordinate system.
              // The absolute node y is d.y, so its relative coordinate is (d.y - d.adjustedY).
              const nodePointXRelative =
                x(window.currentDate) - (currentX + windowWidth + 5);
              const nodePointYRelative = d.y - d.adjustedY;
    
              let dashLine = g.select("line.label-dash-line");
              if (dashLine.empty()) {
                dashLine = g
                  .insert("line", ":first-child")
                  .attr("class", "label-dash-line")
                  .attr("stroke", "green")
                  .attr("stroke-width", 1)
                  .attr("stroke-dasharray", "4,2");
              }
              dashLine
                .transition()
                .duration(300)
                .attr("x1", bbox.x - 2)
                .attr("y1", bbox.y + bbox.height / 2)
                .attr("x2", nodePointXRelative)
                .attr("y2", nodePointYRelative);
    
              // Raise the whole group to the top.
              g.raise();
            });
          }
    
          /**
           * Computes network statistics for each unique date.
           * For each date, it builds the network (nodes and links) from the CSV data,
           * then computes basic stats, connectivity (number of connected components), modularity, and spectral radius.
           * The results are stored globally in window.allTemporalStats, keyed by ISO date string.
           */
          function computeTemporalNetworkStats() {
            // Global object to store stats per date.
            window.allTemporalStats = {};
            window.allTemporalNodeStats = {};
    
            // Loop over each unique date.
            uniqueDates.forEach((date) => {
              // Filter the loaded CSV data to only include rows for the given date.
              // (This filter compares the getTime() values.)
              const filteredData = loadedCSVData.filter(
                (d) => d.time.getTime() === date.getTime(),
              );
    
              // Build nodes and links from the filtered data.
              const nodesMap = {};
              const links = [];
              filteredData.forEach((d) => {
                const source = d.COROP_LEV,
                  target = d.COROP_AFN,
                  weight = +d.AANTAL,
                  disabled = 0;
                // Skip rows with missing or invalid values.
                if (
                  !source ||
                  !target ||
                  source.toUpperCase() === "NA" ||
                  target.toUpperCase() === "NA"
                )
                  return;
    
                // Add source node if missing.
                if (!nodesMap[source]) {
                  nodesMap[source] = { id: source, tradeTotal: 0, active: true };
                }
                // Add target node if missing.
                if (!nodesMap[target]) {
                  nodesMap[target] = { id: target, tradeTotal: 0, active: true };
                }
                // Sum trade volume.
                nodesMap[source].tradeTotal += weight;
                nodesMap[target].tradeTotal += weight;
    
                // Build link.
                links.push({ source, target, weight, disabled });
              });
    
              // Ensure that all COROP regions CR01 to CR40 are present.
              for (let i = 1; i <= 40; i++) {
                const regionId = "CR" + (i < 10 ? "0" + i : i);
                if (!nodesMap[regionId]) {
                  nodesMap[regionId] = {
                    id: regionId,
                    tradeTotal: 0,
                    active: false,
                  };
                }
              }
    
              // Convert nodesMap to an array and sort by region number.
              let nodes = Object.values(nodesMap);
              nodes.sort((a, b) => {
                const numA = parseInt(a.id.replace("CR", ""));
                const numB = parseInt(b.id.replace("CR", ""));
                return numA - numB;
              });
    
              // Replace link source/target with actual node objects.
              links.forEach((link) => {
                link.source = nodesMap[link.source];
                link.target = nodesMap[link.target];
              });
    
              // Filter out disabled and zero-weight links.
              const enabledLinks = links.filter(
                (link) => link.weight > 0 && !link.disabled,
              );
    
              // Filter out inactive nodes.
              const activeNodes = nodes.filter((node) => node.active);
    
              // Compute basic counts and totals.
              const simpleStats = computeSimpleStats(activeNodes, enabledLinks);
              // Compute connectivity on an undirected view.
              const numComponents = computeNumberOfConnectedComponents(
                activeNodes,
                enabledLinks,
              );
              // Compute modularity.
              const { partition, modularity } = computeModularity(
                activeNodes,
                enabledLinks,
              );
              // Count distinct partitions.
              const numPartitions = new Set(Object.values(partition)).size;
              // Compute spectral radius (risk score).
              const spectralRadius = computeSpectralRadius(
                activeNodes,
                enabledLinks,
              );
    
              // Compute node stats (use all nodes).
              const nodeStats = computeHotSpotMetrics(nodes, enabledLinks);
              // Combine all stats into an object.
              const stats = {
                totalNodes: simpleStats.totalNodes,
                totalEdges: simpleStats.totalEdges,
                totalTradeVolume: simpleStats.totalTradeVolume,
                avgTradeEdge: simpleStats.avgTradeEdge,
                avgTradeNode: simpleStats.avgTradeNode,
                numComponents: numComponents,
                modularity: modularity,
                partition: partition,
                numPartitions: numPartitions,
                spectralRadius: spectralRadius,
              };
    
              // Store the stats keyed by the ISO string of the date.
              window.allTemporalStats[date.toISOString()] = stats;
              window.allTemporalNodeStats[date.toISOString()] = nodeStats;
            });
          }
    
          /**
           * Computes the maximum values for the network statistics over all dates.
           * The maximum stats are stored in a global variable window.maxTemporalStats.
           */
          function computeMaxTemporalNetworkStats() {
            const maxStats = {
              totalNodes: 0,
              totalEdges: 0,
              totalTradeVolume: 0,
              avgTradeEdge: 0,
              avgTradeNode: 0,
              numComponents: 0,
              modularity: 0,
              spectralRadius: 0,
            };
    
            // Loop through all stored dates for network stats.
            for (const date in window.allTemporalStats) {
              const stats = window.allTemporalStats[date];
              maxStats.totalNodes = Math.max(maxStats.totalNodes, stats.totalNodes);
              maxStats.totalEdges = Math.max(maxStats.totalEdges, stats.totalEdges);
              maxStats.totalTradeVolume = Math.max(
                maxStats.totalTradeVolume,
                stats.totalTradeVolume,
              );
              maxStats.avgTradeEdge = Math.max(
                maxStats.avgTradeEdge,
                stats.avgTradeEdge,
              );
              maxStats.avgTradeNode = Math.max(
                maxStats.avgTradeNode,
                stats.avgTradeNode,
              );
              maxStats.numComponents = Math.max(
                maxStats.numComponents,
                stats.numComponents,
              );
              maxStats.modularity = Math.max(maxStats.modularity, stats.modularity);
              maxStats.spectralRadius = Math.max(
                maxStats.spectralRadius,
                stats.spectralRadius,
              );
            }
    
            // Compute maximum values for each hotspot metric across all dates and nodes.
            const maxNodeStats = {
              inDegree: 0,
              outDegree: 0,
              betweenness: 0,
              pageRank: 0,
              eigenvector: 0,
            };
    
            // Loop through all dates and all nodes per date.
            for (const date in window.allTemporalNodeStats) {
              const nodes = window.allTemporalNodeStats[date];
              for (const nodeId in nodes) {
                const nodeStats = nodes[nodeId];
                maxNodeStats.inDegree = Math.max(
                  maxNodeStats.inDegree,
                  nodeStats.inDegree,
                );
                maxNodeStats.outDegree = Math.max(
                  maxNodeStats.outDegree,
                  nodeStats.outDegree,
                );
                maxNodeStats.betweenness = Math.max(
                  maxNodeStats.betweenness,
                  nodeStats.betweenness,
                );
                maxNodeStats.pageRank = Math.max(
                  maxNodeStats.pageRank,
                  nodeStats.pageRank,
                );
                maxNodeStats.eigenvector = Math.max(
                  maxNodeStats.eigenvector,
                  nodeStats.eigenvector,
                );
              }
            }
    
            // Store the computed maximums in global variables.
            window.maxTemporalStats = maxStats;
            hotspotsMax = maxNodeStats;
          }
    
          function computeSimpleStats(activeNodes, enabledLinks) {
            // Filter out nodes with no enabled links.
            const reallyActiveNodes = activeNodes.filter((node) => {
              return enabledLinks.some(
                (link) => link.source === node || link.target === node,
              );
            });
            const totalNodes = reallyActiveNodes.length;
    
            // Count only enabled links.
            const totalEdges = enabledLinks.length;
            const totalTradeVolume = d3.sum(enabledLinks, (d) => d.weight);
            const avgTradeEdge =
              totalEdges > 0 ? (totalTradeVolume / totalEdges).toFixed(2) : 0;
            const avgTradeNode =
              totalNodes > 0 ? (totalTradeVolume / totalNodes).toFixed(2) : 0;
            return {
              totalNodes,
              totalEdges,
              totalTradeVolume,
              avgTradeEdge,
              avgTradeNode,
            };
          }
    
          /**
           * computeNumberOfConnectedComponents(nodes, links)
           * Treats links as undirected, returns how many connected components are in the graph.
           */
          function computeNumberOfConnectedComponents(nodes, links) {
            // Build an undirected adjacency list.
            const adjList = {};
            nodes.forEach((n) => {
              adjList[n.id] = new Set();
            });
    
            links.forEach((e) => {
              // If e.source or e.target is an object, use e.source.id and e.target.id.
              const s = typeof e.source === "object" ? e.source.id : e.source;
              const t = typeof e.target === "object" ? e.target.id : e.target;
              // Add each direction for the undirected graph.
              adjList[s].add(t);
              adjList[t].add(s);
            });
    
            // Use BFS/DFS to count connected components.
            let visited = new Set();
            let componentCount = 0;
    
            function bfs(startId) {
              let queue = [startId];
              visited.add(startId);
              while (queue.length > 0) {
                let curr = queue.shift();
                adjList[curr].forEach((neighborId) => {
                  if (!visited.has(neighborId)) {
                    visited.add(neighborId);
                    queue.push(neighborId);
                  }
                });
              }
            }
    
            // For each node, if not visited, BFS from it => found a new component
            nodes.forEach((n) => {
              if (!visited.has(n.id)) {
                componentCount++;
                bfs(n.id);
              }
            });
    
            return componentCount;
          }
    
          function computeModularity(nodes, links) {
            // Build an array of [sourceId, targetId, weight].
            let edgesForLouvain = [];
            links.forEach((link) => {
              let s =
                typeof link.source === "object" ? link.source.id : link.source;
              let t =
                typeof link.target === "object" ? link.target.id : link.target;
              let w = link.weight;
              // For an undirected approach, add just once.
              edgesForLouvain.push({ source: s, target: t, weight: w });
            });
    
            let nodeIds = nodes.map((n) => n.id);
    
            // Now pass an array to .edges(...)
            let community = jLouvain().nodes(nodeIds).edges(edgesForLouvain);
    
            // Run the algorithm
            let results = community(); // node => community
            let assignments = results["communities"];
            let modularity = results["modularity"];
    
            return {
              partition: assignments,
              modularity: modularity,
            };
          }
    
          /**
           * Computes eigenvector centrality for the graph using only enabled links.
           * The graph is treated as undirected.
           *
           * @param {Array} allNodes Array of node objects.
           * @param {Array} enabledLinks Array of link objects.
           * @param {number} maxIter Maximum number of iterations for power iteration.
           * @param {number} tol Tolerance for convergence.
           *
           * @returns {Object} An object mapping node IDs to their computed eigenvector centrality.
           */
          function computeEigenvectorCentrality(
            allNodes,
            enabledLinks,
            maxIter = 100,
            tol = 1e-6,
          ) {
            // Build an undirected adjacency list..
            // For each node, create an object to map each neighbor to the sum of weights.
            const adj = {};
            allNodes.forEach((n) => {
              adj[n.id] = {};
            });
            enabledLinks.forEach((link) => {
              const s =
                typeof link.source === "object" ? link.source.id : link.source;
              const t =
                typeof link.target === "object" ? link.target.id : link.target;
              const w = link.weight || 1;
              if (!adj[s][t]) {
                adj[s][t] = 0;
              }
              if (!adj[t][s]) {
                adj[t][s] = 0;
              }
              adj[s][t] += w;
              adj[t][s] += w;
            });
    
            // Initialize centrality for each node with a value of 1.
            let centrality = {};
            allNodes.forEach((n) => {
              centrality[n.id] = 1;
            });
    
            // Power iteration: update centrality until convergence.
            for (let iter = 0; iter < maxIter; iter++) {
              let newCentrality = {};
              let norm = 0;
    
              // Compute new centrality values.
              allNodes.forEach((n) => {
                let sum = 0;
                for (let neighbor in adj[n.id]) {
                  sum += adj[n.id][neighbor] * centrality[neighbor];
                }
                newCentrality[n.id] = sum;
                norm += sum * sum;
              });
              norm = Math.sqrt(norm);
    
              // Normalize the new centrality vector.
              allNodes.forEach((n) => {
                newCentrality[n.id] /= norm;
              });
    
              // Check convergence.
              let diff = 0;
              allNodes.forEach((n) => {
                diff = Math.max(
                  diff,
                  Math.abs(newCentrality[n.id] - centrality[n.id]),
                );
              });
              centrality = newCentrality;
              if (diff < tol) break;
            }
    
            return centrality;
          }
    
          /**
           * computeHotSpotMetrics()
           *
           * For each node, computes:
           *  1) Weighted In-Degree
           *  2) Weighted Out-Degree
           *  3) Weighted Betweenness Centrality (using a simplified Brandes approach)
           *  4) Weighted PageRank (iterative approach)
           *  5) Eigenvector Centrality (new metric for disease transmission importance)
           *
           * Returns an object: {
           *    [nodeId]: {
           *       inDegree: Number,
           *       outDegree: Number,
           *       betweenness: Number,
           *       pageRank: Number,
           *       eigenvector: Number
           *    },
           *    ...
           * }
           *
           */
          function computeHotSpotMetrics(allNodes, enabledLinks) {
            // 1) Weighted In-Degree & Out-Degree
            const metrics = {};
            allNodes.forEach((n) => {
              metrics[n.id] = {
                inDegree: 0,
                outDegree: 0,
                betweenness: 0,
                pageRank: 1, // initial PR guess
                eigenvector: 0, // will be computed later
              };
            });
    
            // Use only enabled links.
            enabledLinks.forEach((link) => {
              const s =
                typeof link.source === "object" ? link.source.id : link.source;
              const t =
                typeof link.target === "object" ? link.target.id : link.target;
              const w = link.weight || 1;
              if (metrics[s]) {
                metrics[s].outDegree += w;
              }
              if (metrics[t]) {
                metrics[t].inDegree += w;
              }
            });
    
            // 2) Weighted Betweenness Centrality
            //    (Simplified Brandes approach)
            // A simple binary min-heap implementation for the priority queue.
            class MinHeap {
              constructor() {
                this.heap = [];
              }
              // Insert an element with its priority.
              push(element, priority) {
                this.heap.push({ element, priority });
                this.bubbleUp(this.heap.length - 1);
              }
              // Remove and return the element with the smallest priority.
              pop() {
                if (this.heap.length === 0) return null;
                const top = this.heap[0];
                const bottom = this.heap.pop();
                if (this.heap.length > 0) {
                  this.heap[0] = bottom;
                  this.sinkDown(0);
                }
                return top;
              }
              isEmpty() {
                return this.heap.length === 0;
              }
              bubbleUp(n) {
                const element = this.heap[n];
                while (n > 0) {
                  const parentN = Math.floor((n - 1) / 2);
                  const parent = this.heap[parentN];
                  if (element.priority >= parent.priority) break;
                  this.heap[n] = parent;
                  this.heap[parentN] = element;
                  n = parentN;
                }
              }
              sinkDown(n) {
                const length = this.heap.length;
                const element = this.heap[n];
                while (true) {
                  let leftChildN = 2 * n + 1;
                  let rightChildN = 2 * n + 2;
                  let swap = null;
                  if (leftChildN < length) {
                    let leftChild = this.heap[leftChildN];
                    if (leftChild.priority < element.priority) {
                      swap = leftChildN;
                    }
                  }
                  if (rightChildN < length) {
                    let rightChild = this.heap[rightChildN];
                    if (
                      (swap === null && rightChild.priority < element.priority) ||
                      (swap !== null &&
                        rightChild.priority < this.heap[swap].priority)
                    ) {
                      swap = rightChildN;
                    }
                  }
                  if (swap === null) break;
                  this.heap[n] = this.heap[swap];
                  this.heap[swap] = element;
                  n = swap;
                }
              }
            }
    
            // Build adjacency list for a weighted directed graph (using only enabled links).
            const adj = {};
            allNodes.forEach((n) => {
              adj[n.id] = [];
            });
            enabledLinks.forEach((e) => {
              const s = typeof e.source === "object" ? e.source.id : e.source;
              const t = typeof e.target === "object" ? e.target.id : e.target;
              const w = e.weight || 1;
              // For cost, use 1/weight.
              adj[s].push({ target: t, cost: 1 / w });
            });
    
            /**
             * Compute weighted betweenness centrality using Brandes' algorithm.
             * Uses a min-heap to efficiently perform Dijkstra's algorithm for each source.
             *
             * @param {Array} allNodes - Array of node objects (each must have an "id" property).
             * @param {Object} adj - Adjacency list: keys are node IDs, values are arrays of objects {target, cost}.
             */
            function brandesBetweennessWeighted(allNodes, adj) {
              // Initialize betweenness centrality for each node to zero.
              allNodes.forEach((n) => {
                metrics[n.id].betweenness = 0;
              });
    
              // For each source node s:
              allNodes.forEach((sNode) => {
                const s = sNode.id;
                // Stack to store the order in which vertices are visited.
                let S = [];
                // Predecessor list: P[w] will contain all nodes v that precede w in some shortest path from s.
                let P = {};
                // sigma[w]: number of shortest paths from s to w.
                let sigma = {};
                // dist[w]: distance from s to w.
                let dist = {};
                // delta[w]: dependency of s on w.
                let delta = {};
    
                // Initialization: for all nodes v, set default values.
                allNodes.forEach((n) => {
                  P[n.id] = [];
                  sigma[n.id] = 0;
                  dist[n.id] = Infinity;
                  delta[n.id] = 0;
                });
                sigma[s] = 1;
                dist[s] = 0;
    
                // Priority queue for Dijkstra's algorithm.
                const Q = new MinHeap();
                Q.push(s, 0);
    
                // Dijkstra's algorithm: find shortest paths from s.
                while (!Q.isEmpty()) {
                  const { element: v, priority: d } = Q.pop();
                  // If the distance in the heap is not equal to the current known distance, skip.
                  if (d > dist[v]) continue;
                  S.push(v);
                  // For each neighbor w of v:
                  adj[v].forEach((edge) => {
                    const w = edge.target;
                    const cost = edge.cost;
                    const vwDist = dist[v] + cost;
                    if (vwDist < dist[w]) {
                      dist[w] = vwDist;
                      sigma[w] = sigma[v]; // found a new shortest path to w
                      P[w] = [v];
                      Q.push(w, vwDist);
                    } else if (Math.abs(vwDist - dist[w]) < 1e-9) {
                      // Found an alternative shortest path to w via v.
                      sigma[w] += sigma[v];
                      P[w].push(v);
                    }
                  });
                }
    
                // Accumulation: back-propagate dependencies.
                while (S.length > 0) {
                  const w = S.pop();
                  P[w].forEach((v) => {
                    delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
                  });
                  if (w !== s) {
                    metrics[w].betweenness += delta[w];
                  }
                }
              });
            }
    
            // Run the weighted betweenness centrality calculation.
            brandesBetweennessWeighted(allNodes, adj);
    
            // 3) Weighted PageRank (Simplified)
            let d = 0.85;
            let N = allNodes.length;
            let outWeightSum = {};
            allNodes.forEach((n) => {
              outWeightSum[n.id] = 0;
            });
            enabledLinks.forEach((link) => {
              const s =
                typeof link.source === "object" ? link.source.id : link.source;
              const w = link.weight || 1;
              outWeightSum[s] += w;
            });
    
            function doPageRankIteration(allNodes, enabledLinks) {
              let newPR = {};
              allNodes.forEach((n) => {
                newPR[n.id] = (1 - d) / N;
              });
              enabledLinks.forEach((link) => {
                let vId =
                  typeof link.source === "object" ? link.source.id : link.source;
                let uId =
                  typeof link.target === "object" ? link.target.id : link.target;
                let w = link.weight || 1;
                if (outWeightSum[vId] > 0) {
                  let contrib =
                    d * (metrics[vId].pageRank * (w / outWeightSum[vId]));
                  newPR[uId] += contrib;
                }
              });
              allNodes.forEach((n) => {
                metrics[n.id].pageRank = newPR[n.id];
              });
            }
            for (let i = 0; i < 20; i++) {
              doPageRankIteration(allNodes, enabledLinks);
            }
    
            // 4) Eigenvector Centrality
            // Compute eigenvector centrality using only enabled links.
            const eigenCentrality = computeEigenvectorCentrality(
              allNodes,
              enabledLinks,
            );
            allNodes.forEach((n) => {
              metrics[n.id].eigenvector = eigenCentrality[n.id];
            });
    
            return metrics;
          }
    
          // Adjust the arrow endpoint.
          function getAdjustedTarget(d) {
            let dx = d.target.x - d.source.x,
              dy = d.target.y - d.source.y,
              dist = Math.sqrt(dx * dx + dy * dy);
            const r =
              d.target.r !== undefined && !isNaN(d.target.r) ? d.target.r : 0;
            if (dist === 0) return { x: d.target.x, y: d.target.y };
            return {
              x: d.target.x - (dx / dist) * r,
              y: d.target.y - (dy / dist) * r,
            };
          }
    
          function getLinkBaseClass(d) {
            const srcId = typeof d.source === "object" ? d.source.id : d.source;
            const tgtId = typeof d.target === "object" ? d.target.id : d.target;
    
            if (
              selectedNodeData &&
              d.weight > 0 &&
              !d.disabled &&
              (srcId === selectedNodeData.id || tgtId === selectedNodeData.id)
            ) {
              return srcId === selectedNodeData.id
                ? "linkSelectOut"
                : "linkSelectIn";
            }
    
            return "link";
          }
    
          function getLinkHoverClass(d) {
            const baseClass = getLinkBaseClass(d);
            if (baseClass === "linkSelectIn") return "linkSelectInOver";
            if (baseClass === "linkSelectOut") return "linkSelectOutOver";
            return "linkOver";
          }
    
          function restoreLinkClass(linkElement, d) {
            if (!linkElement || !d) return;
            d3.select(linkElement).attr("class", getLinkBaseClass(d));
          }
    
          function clearHoveredLinkState() {
            if (hoveredLinkElement) {
              const previousDatum = d3.select(hoveredLinkElement).datum();
              restoreLinkClass(hoveredLinkElement, previousDatum);
            }
    
            hoveredLink = null;
            hoveredLinkElement = null;
    
            if (annotationGroup) {
              annotationGroup.selectAll("*").remove();
            }
          }
    
          function handleLinkMouseEnter(event, d) {
            if (hoveredLinkElement && hoveredLinkElement !== this) {
              const previousDatum = d3.select(hoveredLinkElement).datum();
              restoreLinkClass(hoveredLinkElement, previousDatum);
            }
    
            hoveredLink = d;
            hoveredLinkElement = this;
    
            d3.select(this).interrupt().attr("class", getLinkHoverClass(d));
            updateAnnotationForLink(d, annotationGroup);
          }
    
          function handleLinkMouseMove(event, d) {
            if (hoveredLinkElement === this && hoveredLink === d) {
              updateAnnotationForLink(d, annotationGroup);
            }
          }
    
          function handleLinkMouseLeave(event, d) {
            restoreLinkClass(this, d);
    
            if (hoveredLinkElement === this) {
              hoveredLinkElement = null;
              hoveredLink = null;
            }
    
            if (annotationGroup) {
              annotationGroup.selectAll("*").remove();
            }
          }
    
          // Create Network
          function initNetwork(isReplot = false) {
            // Create annotation group
            annotationGroup = svg
              .append("g")
              .attr("class", "annotation-group")
              .style("pointer-events", "none");
    
            // if forceSim exists, stop it and reset the simulation
            if (forceSim) {
              forceSim.stop();
              forceSim.nodes([]);
              forceSim.force("link").links([]);
            }
    
            forceSim = d3
              .forceSimulation(allNodes)
              .force(
                "link",
                d3
                  .forceLink(nonZeroLinks)
                  .id((d) => d.id)
                  .distance(150),
              )
              .force("charge", d3.forceManyBody().strength(-300))
              .force("center", d3.forceCenter(w / 2, h / 2));
    
            linkGroup = svg.append("g").attr("class", "links");
            linkSelection = linkGroup
              .selectAll("path")
              .data(allLinks)
              .enter()
              .append("path")
              .attr("class", "link")
              .attr("stroke", (d) => {
                if (d.weight <= 0) return "none";
                return edgeColor(Math.log(d.weight));
              })
              .attr("stroke-width", (d) =>
                d.weight <= 0 ? 0 : Math.sqrt(d.weight),
              );
    
            nodeGroup = svg.append("g").attr("class", "nodes");
    
            metricNames.forEach((metric) => {
              // Sort the keys (node IDs) of hotspots by descending metric value.
              topNMetric[metric] = Object.keys(hotspots)
                .sort((a, b) => hotspots[b][metric] - hotspots[a][metric])
                .slice(0, 3);
            });
    
            // Create a group for each node (will contain circle, hotspot strokes, and label)
            nodeEnter = nodeGroup
              .selectAll(".nodeGroup")
              .data(allNodes)
              .enter()
              .append("g")
              .attr("class", "nodeGroup")
              .call(drag(forceSim))
              .on("click", debouncedOnClickNode)
              .on("mouseover", function (event, d) {
                hoveredNode = d;
                d3.select(this).select("circle.primary").attr("stroke", "black");
    
                updateAnnotationForNode(d, annotationGroup);
              })
              .on("mousemove", function (event, d) {
                if (hoveredNode === d) {
                  updateAnnotationForNode(d, annotationGroup);
                }
              })
              .on("mouseout", function (event, d) {
                hoveredNode = null;
                d3.select(this)
                  .select("circle.primary")
                  .attr("stroke", null)
                  .attr("stroke-width", null);
    
                annotationGroup.selectAll("*").remove();
    
                // Remove content in #radial-labels-container
                d3.select("#radial-labels-container").selectAll("*").remove();
              });
    
            // Append primary node shape (circle for active, FontAwesome icon for inactive).
            nodeEnter.each(function (d) {
              const nodeGroup = d3.select(this);
              // Always compute node radius so labels remain aligned.
              d.r = nodeSize(d.tradeTotal);
    
              if (d.active) {
                // Active nodes: use standard circles.
                nodeGroup
                  .append("circle")
                  .attr("class", "primary")
                  .attr("r", d.r)
                  .attr("fill", (d) => nodeColor(d.community))
                  .attr("stroke", null)
                  .attr("stroke-width", null);
              } else {
                // Inactive nodes: use a FontAwesome icon via foreignObject.
                const iconSize = d.r * 4; // Scale icon to match node size.
                const foreignObject = nodeGroup
                  .append("foreignObject")
                  .attr("class", "inactive-overlay")
                  .attr("width", iconSize)
                  .attr("height", iconSize)
                  .attr("x", -iconSize / 2)
                  .attr("y", -iconSize / 2);
    
                foreignObject
                  .append("xhtml:div")
                  .style("width", `${iconSize}px`)
                  .style("height", `${iconSize}px`)
                  .style("display", "flex")
                  .style("align-items", "center")
                  .style("justify-content", "center")
                  .style("font-size", `${iconSize * 0.7}px`)
                  .style("color", "gray")
                  .html('<i class="fa-solid fa-circle-xmark"></i>');
              }
            });
    
            // Append extra hotspot strokes based on topNMetric.
            nodeEnter.each(function (d) {
              let metricsForNode = [];
              metricNames.forEach((metric) => {
                // If this node is in the top-3 for the metric, add it.
                if (topNMetric[metric].includes(d.id)) {
                  metricsForNode.push(metric);
                }
              });
              metricsForNode.sort();
              let group = d3.select(this);
              metricsForNode.forEach((metric, i) => {
                group
                  .append("circle")
                  .attr("class", "hotspotStroke")
                  .attr("r", d.r + (i + 1) * 3) // each extra ring offset by 3px per metric
                  .attr("fill", "none")
                  .attr("stroke", hotspotColors[metric])
                  .attr("stroke-width", 2)
                  .attr("stroke-dashoffset", 0);
              });
            });
    
            // Append text labels for nodes.
            labelSelection = nodeGroup
              .selectAll(".nodeLabel")
              .data(allNodes)
              .enter()
              .append("text")
              .attr("class", "nodeLabel")
              .attr("text-anchor", "middle")
              .attr("font-size", "12px")
              .attr("fill", "black")
              .text((d) => d.id);
    
            // Raise labels above nodes.
            labelSelection.raise();
    
            // Append trade donut visualization for each node.
            nodeEnter.each(function (d) {
              // Compute self trade volume: sum of weights for links where source and target are the same.
              const selfVolume = d3.sum(
                allLinks.filter((link) => {
                  let src =
                    typeof link.source === "object" ? link.source.id : link.source;
                  let tgt =
                    typeof link.target === "object" ? link.target.id : link.target;
                  return src === d.id && tgt === d.id;
                }),
                (link) => link.weight,
              );
    
              // Compute external trade volume: sum of weights for links where source is d.id and target is not d.id.
              const otherVolume = d3.sum(
                allLinks.filter((link) => {
                  let src =
                    typeof link.source === "object" ? link.source.id : link.source;
                  let tgt =
                    typeof link.target === "object" ? link.target.id : link.target;
                  return src === d.id && tgt !== d.id;
                }),
                (link) => link.weight,
              );
    
              const totalVolume = selfVolume + otherVolume;
    
              // Only add the donut if there's any trade volume.
              if (totalVolume > 0) {
                // Define inner and outer radii for the donut relative to the node's radius.
                const innerRadius = d.r * 0.3;
                const outerRadius = d.r * 0.8;
    
                // Compute the fraction (and angle) of self trade.
                const selfFraction = selfVolume / totalVolume;
                const selfAngle = 2 * Math.PI * selfFraction;
    
                // Create an arc generator.
                const arc = d3
                  .arc()
                  .innerRadius(innerRadius)
                  .outerRadius(outerRadius);
    
                // Append a new group for the donut; since the node group is already transformed,
                // this donut will be centered at (0,0) within that group.
                const donutGroup = d3
                  .select(this)
                  .append("g")
                  .attr("class", "trade-donut")
                  .attr("transform", "translate(0,0)");
    
                // Append arc for self trade (e.g., orange).
                donutGroup
                  .append("path")
                  .attr("class", "donut-self")
                  .attr("d", arc({ startAngle: 0, endAngle: selfAngle }))
                  .attr("fill", "white")
                  .attr("opacity", 0.8);
    
                // Append arc for external trade (e.g., blue).
                donutGroup
                  .append("path")
                  .attr("class", "donut-other")
                  .attr("d", arc({ startAngle: selfAngle, endAngle: 2 * Math.PI }))
                  .attr("fill", "black")
                  .attr("opacity", 0.1);
              }
            });
    
            forceSim.on("tick", () => {
              if (currentMode === "graph") {
                // Define boundary margins.
                const inactiveMarginX = 170,
                  inactiveMarginY = 290,
                  activeMarginX = 40,
                  activeMarginY = 60;
    
                linkSelection.attr("d", function (d) {
                  // Use original positions.
                  let sX = d.source.x,
                    sY = d.source.y;
                  let tX = d.target.x,
                    tY = d.target.y;
    
                  // Clamp source coordinates.
                  if (!d.source.active) {
                    sX = Math.max(
                      inactiveMarginX,
                      Math.min(w - inactiveMarginX, sX),
                    );
                    sY = Math.max(
                      inactiveMarginY,
                      Math.min(h - inactiveMarginY, sY),
                    );
                  } else {
                    sX = Math.max(activeMarginX, Math.min(w - activeMarginX, sX));
                    sY = Math.max(activeMarginY, Math.min(h - activeMarginY, sY));
                  }
    
                  // Clamp target coordinates.
                  if (!d.target.active) {
                    tX = Math.max(
                      inactiveMarginX,
                      Math.min(w - inactiveMarginX, tX),
                    );
                    tY = Math.max(
                      inactiveMarginY,
                      Math.min(h - inactiveMarginY, tY),
                    );
                  } else {
                    tX = Math.max(activeMarginX, Math.min(w - activeMarginX, tX));
                    tY = Math.max(activeMarginY, Math.min(h - activeMarginY, tY));
                  }
    
                  const dx = tX - sX,
                    dy = tY - sY,
                    dr = Math.sqrt(dx * dx + dy * dy),
                    // Use the clamped positions to compute the adjusted target.
                    adj = getAdjustedTarget({
                      source: { x: sX, y: sY, r: d.source.r },
                      target: { x: tX, y: tY, r: d.target.r },
                    });
    
                  return (
                    "M" +
                    sX +
                    "," +
                    sY +
                    "A" +
                    dr +
                    "," +
                    dr +
                    " 0 0,1 " +
                    adj.x +
                    "," +
                    adj.y
                  );
                });
    
                // Update node positions. Clamp their positions to avoid going out of bounds.
                nodeEnter.attr("transform", (d) => {
                  if (!d.active) {
                    d.x = Math.max(
                      inactiveMarginX,
                      Math.min(w - inactiveMarginX, d.x),
                    );
                    d.y = Math.max(
                      inactiveMarginY,
                      Math.min(h - inactiveMarginY, d.y),
                    );
                  } else {
                    d.x = Math.max(activeMarginX, Math.min(w - activeMarginX, d.x));
                    d.y = Math.max(activeMarginY, Math.min(h - activeMarginY, d.y));
                  }
    
                  return `translate(${d.x},${d.y})`;
                });
                // Update text labels positions.
                labelSelection
                  .attr("x", (d) => d.x)
                  .attr("y", (d) => d.y - (d.r + 13));
                // If a node is hovered, update its annotation.
                if (hoveredNode) {
                  updateAnnotationForNode(hoveredNode, annotationGroup);
                }
                // If a link is hovered, update its annotation.
                if (hoveredLink) {
                  updateAnnotationForLink(hoveredLink, annotationGroup);
                }
              }
            });
    
            linkSelection
              .on("mouseenter", handleLinkMouseEnter)
              .on("mousemove", handleLinkMouseMove)
              .on("mouseleave", handleLinkMouseLeave);
    
            // Add Hotspot Stroke Legend
            if (!isReplot) {
              addHotspotLegend();
            }
    
            // If in map mode already, update the view.
            if (currentMode === "map") {
              switchToMapMode((instant = true));
            }
    
            // Define Edge Glow and Drop Shadow Filters
            // Select existing defs or create one if not present.
            let defs = svg.select("defs");
            if (defs.empty()) {
              defs = svg.append("defs");
            }
    
            svg
              .append("defs")
              .append("marker")
              .attr("id", "arrow")
              .attr("viewBox", "0 0 448 512")
              .attr("refX", 400)
              .attr("refY", 256)
              .attr("markerWidth", 20)
              .attr("markerHeight", 20)
              .attr("orient", "auto")
              .attr("markerUnits", "userSpaceOnUse")
              .append("path")
              .attr(
                "d",
                "M201.4 137.4c12.5-12.5 32.8-12.5 45.3 0l160 160c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L224 205.3 86.6 342.6c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3l160-160z",
              )
              .attr("fill", "white")
              .attr("transform", "rotate(90,224,256)");
    
            svg
              .append("defs")
              .append("marker")
              .attr("id", "loop")
              .attr("viewBox", "0 0 32 32")
              .attr("refX", 16)
              .attr("refY", 16)
              .attr("markerWidth", 2)
              .attr("markerHeight", 2)
              .attr("orient", "auto")
              .attr("markerUnits", "userSpaceOnUse")
              .append("path")
              // This path draws a circular arc starting at (16,2) that goes almost full circle.
              .attr("d", "M16,2 A14,14 0 1,1 15.99,2")
              .attr("stroke", "red")
              .attr("stroke-width", 2)
              .attr("fill", "none")
              .attr("stroke-dasharray", "5,2");
    
            svg
              .append("defs")
              .append("filter")
              .attr("id", "frostedGlass")
              .attr("x", "-50%")
              .attr("y", "-50%")
              .attr("width", "200%")
              .attr("height", "200%")
              .append("feGaussianBlur")
              .attr("in", "SourceGraphic")
              .attr("stdDeviation", 1.5);
    
            // Define the edge glow filter.
            const edgeGlow = defs
              .append("filter")
              .attr("id", "edgeGlow")
              .attr("x", "-50%")
              .attr("y", "-50%")
              .attr("width", "200%")
              .attr("height", "200%");
    
            edgeGlow
              .append("feGaussianBlur")
              .attr("in", "SourceGraphic")
              .attr("stdDeviation", 3)
              .attr("result", "blur");
    
            const feMerge = edgeGlow.append("feMerge");
            feMerge.append("feMergeNode").attr("in", "blur");
            feMerge.append("feMergeNode").attr("in", "SourceGraphic");
    
            // Define the drop shadow filter.
            const dropShadow = defs
              .append("filter")
              .attr("id", "dropShadow")
              .attr("x", "-50%")
              .attr("y", "-50%")
              .attr("width", "200%")
              .attr("height", "200%");
    
            dropShadow
              .append("feGaussianBlur")
              .attr("in", "SourceAlpha")
              .attr("stdDeviation", 2)
              .attr("result", "blur");
    
            dropShadow
              .append("feOffset")
              .attr("in", "blur")
              .attr("dx", 2)
              .attr("dy", 2)
              .attr("result", "offsetBlur");
    
            const dropShadowMerge = dropShadow.append("feMerge");
            dropShadowMerge.append("feMergeNode").attr("in", "offsetBlur");
            dropShadowMerge.append("feMergeNode").attr("in", "SourceGraphic");
          }
    
          function initAesthetics() {
            setTradeEdgeScales(nonZeroLinks);
            nodeColor = d3.scaleOrdinal(d3.schemeCategory10);
            nodeSize = d3
              .scaleSqrt()
              .domain(d3.extent(allNodes, (d) => d.tradeTotal))
              .range([5, 20]);
          }
    
          function updateAnnotationForNode(d, annotationGroup) {
            if (!d) {
              annotationGroup.selectAll("*").remove();
              return;
            }
    
            // Use fixed coordinates in map mode if available.
            const xPos = currentMode === "map" && d.x0 !== undefined ? d.x0 : d.x;
            const yPos = currentMode === "map" && d.y0 !== undefined ? d.y0 : d.y;
    
            const offsets = getAnnotationOffset(xPos, yPos, w, h);
    
            // Compute trade volumes using only enabled links
            const incomingTrade = d3.sum(
              allLinks.filter((link) => {
                const tgt =
                  typeof link.target === "object" ? link.target.id : link.target;
                return tgt === d.id && !link.disabled;
              }),
              (link) => link.weight,
            );
    
            const outgoingTrade = d3.sum(
              allLinks.filter((link) => {
                const src =
                  typeof link.source === "object" ? link.source.id : link.source;
                return src === d.id && !link.disabled;
              }),
              (link) => link.weight,
            );
    
            const selfTrade = d3.sum(
              allLinks.filter((link) => {
                const src =
                  typeof link.source === "object" ? link.source.id : link.source;
                const tgt =
                  typeof link.target === "object" ? link.target.id : link.target;
                return src === d.id && tgt === d.id && !link.disabled;
              }),
              (link) => link.weight,
            );
    
            // Calculate self-trade ratio. If outgoingTrade is zero, default to 0.
            const selfTradeRatio =
              outgoingTrade > 0
                ? ((selfTrade / outgoingTrade) * 100).toFixed(1)
                : "NA";
    
            const currentNode = allNodes.find((n) => n.id === d.id);
            let communityID = currentNode ? currentNode.community : "NA";
            if (communityID === undefined) communityID = "NA";

            const simState = isSimulationModeActive()
              ? simulationState.currentFrame?.nodeStates[d.id]
              : null;
            const noteLabel = simState
              ? `Holding: ${formatCount(simState.N)}\nSusceptible: ${formatCount(simState.S)}\nExposed: ${formatCount(simState.E)}\nInfectious: ${formatCount(simState.I)} (${formatPct(simState.prevalence)})\nRecovered: ${formatCount(simState.R)}\nIncoming Exposure: ${formatSmall(simState.incomingExposure)}\nOutgoing Pressure: ${formatSmall(simState.outgoingPressure)}`
              : `Community ID: ${communityID}\nIncoming Trade: ${incomingTrade}\nOutgoing Trade: ${outgoingTrade}\nSelf-Trade Ratio: ${selfTradeRatio}${selfTradeRatio !== "NA" ? "%" : ""}`;
    
            const annotations = [
              {
                note: {
                  title: `[${d.id}] ${d.statnaam}`,
                  label: noteLabel,
                  wrapSplitter: /\n/,
                  wrap: 200,
                  bgPadding: { top: 6, left: 6, right: 4, bottom: 4 },
                },
                className: "node-annotation",
                x: xPos,
                y: yPos,
                dx: offsets.dx,
                dy: offsets.dy,
              },
            ];
    
            const makeAnnotations = d3
              .annotation()
              .type(nodeAnnoType)
              .notePadding(10)
              .annotations(annotations);
    
            annotationGroup.call(makeAnnotations).raise();
    
            // Style the annotation note background.
            annotationGroup
              .selectAll("rect.annotation-note-bg")
              .classed("selected", !!selectedNodeData)
              .attr("fill-opacity", 0.8)
              .attr("rx", 4)
              .attr("ry", 4);
    
            // Update connector and note-line colors.
            annotationGroup
              .selectAll(".node-annotation")
              .classed("selected", !!selectedNodeData);
    
            // Draw the radar chart inside the annotation.
            const noteContent = annotationGroup.select(".annotation-note-content");
            drawRadarChart(noteContent, offsets, d);
    
            // Update radial axis labels.
            const radarElem = d3.select("svg.custom-radar").node();
            const bbox = radarElem.getBoundingClientRect();
            const centerX = bbox.x + bbox.width / 2;
            const centerY = bbox.y + bbox.height / 2;
    
            // Define radar chart dimensions.
            const radarChartWidth = 130;
            const radarChartHeight = 130;
            const radarChartPadding = 20;
            const drawWidth = radarChartWidth - radarChartPadding * 2;
            const drawHeight = radarChartHeight - radarChartPadding * 2;
            const radarRadius = Math.min(drawWidth, drawHeight) / 2 - 10;
    
            const axisLabels = isSimulationModeActive()
              ? ["S", "E", "I", "R", "XP"]
              : ["ID", "OD", "BT", "PR", "EC"];
            // First, clear the existing labels.
            drawRadialAxisLabels(
              centerX,
              centerY + 5,
              radarRadius,
              axisLabels,
              "#radial-labels-container",
            );
          }
    
          // Global variable to store previous radar points for each node id.
          if (!window.prevRadarPoints) window.prevRadarPoints = {};
          if (!window.prevRadarVertices) window.prevRadarVertices = {};

          function getRadarValuesForNode(d) {
            if (isSimulationModeActive()) {
              const state = simulationState.currentFrame?.nodeStates[d.id];
              if (!state) return null;
              return [
                state.N ? state.S / state.N : 0,
                state.exposedShare || 0,
                state.prevalence || 0,
                state.recoveredShare || 0,
                Math.min(1, (state.incomingExposure + state.outgoingPressure) / Math.max(1, state.N)),
              ];
            }

            const nodeMetrics = hotspots[d.id];
            if (!nodeMetrics) return null;
            return [
              Math.log(nodeMetrics.inDegree + 1) /
                Math.log(hotspotsMax.inDegree + 1),
              Math.log(nodeMetrics.outDegree + 1) /
                Math.log(hotspotsMax.outDegree + 1),
              nodeMetrics.betweenness / hotspotsMax.betweenness,
              nodeMetrics.pageRank / hotspotsMax.pageRank,
              nodeMetrics.eigenvector / hotspotsMax.eigenvector,
            ];
          }
    
          function drawRadarChart(noteContent, offsets, d) {
            // Define dimensions.
            const radarChartWidth = 130;
            const radarChartHeight = 130;
            const radarChartGap = 10;
            const radarChartPadding = 21;
    
            // Try to select the existing radar chart.
            let radarSVG = noteContent.select("svg.custom-radar");
    
            // If it doesn’t exist, create it.
            if (radarSVG.empty()) {
              if (offsets.dy < 0) {
                const titleElem = noteContent
                  .select(".annotation-note-title")
                  .node();
                const bbox = titleElem.getBBox();
                radarSVG = noteContent
                  .insert("svg", ".annotation-note-title")
                  .attr("class", "custom-radar")
                  .classed("selected", !!selectedNodeData)
                  .attr("width", radarChartWidth)
                  .attr("height", radarChartHeight)
                  .attr("x", 0)
                  .attr("y", bbox.y - radarChartHeight - radarChartGap);
              } else {
                const labelElem = noteContent
                  .select(".annotation-note-label")
                  .node();
                const bbox = labelElem.getBBox();
                radarSVG = noteContent
                  .insert("svg", ".annotation-note-title")
                  .attr("class", "custom-radar")
                  .classed("selected", !!selectedNodeData)
                  .attr("width", radarChartWidth)
                  .attr("height", radarChartHeight)
                  .attr("x", 0)
                  .attr("y", bbox.y + bbox.height + radarChartGap);
              }
              // Append background rectangle.
              radarSVG
                .append("rect")
                .attr("class", "annotation-bg")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", radarChartWidth)
                .attr("height", radarChartHeight)
                .attr("fill-opacity", 0.8)
                .attr("rx", 4)
                .attr("ry", 4);
    
              // Append a group for the radar drawing.
              radarSVG
                .append("g")
                .attr("class", "radar-drawing")
                .attr(
                  "transform",
                  `translate(${radarChartPadding},${radarChartPadding})`,
                )
                .append("path") // This is the radar polygon.
                .attr("class", "node-radar");
            } else {
              // Update position if it already exists.
              if (offsets.dy < 0) {
                const titleElem = noteContent
                  .select(".annotation-note-title")
                  .node();
                const bbox = titleElem.getBBox();
                radarSVG
                  .transition()
                  .duration(400)
                  .attr("y", bbox.y - radarChartHeight - radarChartGap);
              } else {
                const labelElem = noteContent
                  .select(".annotation-note-label")
                  .node();
                const bbox = labelElem.getBBox();
                radarSVG
                  .transition()
                  .duration(400)
                  .attr("y", bbox.y + bbox.height + radarChartGap);
              }
              radarSVG.select("rect.annotation-bg").transition().duration(400);
            }
    
            // Define drawing padding.
            const padding = {
              top: radarChartPadding - 4,
              left: radarChartPadding,
              right: radarChartPadding,
              bottom: radarChartPadding - 4,
            };
            const drawWidth = radarChartWidth - padding.left - padding.right;
            const drawHeight = radarChartHeight - padding.top - padding.bottom;
    
            // Get the drawing group.
            const drawingGroup = radarSVG.select("g.radar-drawing");
    
            const values = getRadarValuesForNode(d);
            if (!values) return;
    
            // Radar chart geometry
            const radarRadius = Math.min(drawWidth, drawHeight) / 2;
            const numAxes = 5;
            const baseAngle = -Math.PI / 2; // starting at top.
            const centerX = drawWidth / 2;
            const centerY = drawHeight / 2;
    
            // Compute new points for the radar polygon.
            const newPoints = values.map((val, i) => {
              const angle = baseAngle + (2 * Math.PI * i) / numAxes;
              return [
                radarRadius * val * Math.cos(angle) + centerX,
                radarRadius * val * Math.sin(angle) + centerY,
              ];
            });
    
            // Global storage: retrieve previous points for this node.
            let previousPoints =
              window.prevRadarPoints && window.prevRadarPoints[d.id]
                ? window.prevRadarPoints[d.id]
                : newPoints;
            // Save new points for future transitions.
            if (!window.prevRadarPoints) window.prevRadarPoints = {};
            window.prevRadarPoints[d.id] = newPoints;
    
            // Global storage for previous vertices.
            let previousVertices =
              window.prevRadarVertices && window.prevRadarVertices[d.id]
                ? window.prevRadarVertices[d.id]
                : newPoints;
            if (!window.prevRadarVertices) window.prevRadarVertices = {};
            window.prevRadarVertices[d.id] = newPoints;
    
            // Create a line generator.
            const radarLine = d3.line().curve(d3.curveLinearClosed);
    
            // Baseline points: each axis at maximum value.
            const baselinePoints = [];
            for (let i = 0; i < numAxes; i++) {
              const angle = baseAngle + (2 * Math.PI * i) / numAxes;
              baselinePoints.push([
                radarRadius * 1.0 * Math.cos(angle) + centerX,
                radarRadius * 1.0 * Math.sin(angle) + centerY,
              ]);
            }
    
            // Draw axis lines
            for (let i = 0; i < numAxes; i++) {
              const angle = baseAngle + (2 * Math.PI * i) / numAxes;
              const x2 = radarRadius * Math.cos(angle) + centerX;
              const y2 = radarRadius * Math.sin(angle) + centerY;
              let axisLine = drawingGroup.select(`line.axis-${i}`);
              if (axisLine.empty()) {
                axisLine = drawingGroup
                  .append("line")
                  .attr("class", `axis-${i}`)
                  .attr("x1", centerX)
                  .attr("y1", centerY)
                  .attr("x2", x2)
                  .attr("y2", y2)
                  .attr("stroke-dasharray", "2,2")
                  .attr("stroke-width", 1);
              } else {
                axisLine.transition().duration(300).attr("x2", x2).attr("y2", y2);
              }
            }
    
            // Draw or update baseline radar polygon
            let baselinePath = drawingGroup.select("path.radar-baseline");
            if (baselinePath.empty()) {
              baselinePath = drawingGroup
                .append("path")
                .attr("class", "radar-baseline")
                .attr("fill", "none")
                .attr("stroke-width", 1)
                .attr("stroke-dasharray", "4,4");
            }
            baselinePath
              .transition()
              .duration(300)
              .attr("d", radarLine(baselinePoints));
    
            // Get the radar polygon element.
            const radarPath = drawingGroup.select("path.node-radar");
    
            // Transition the radar polygon via interpolation.
            radarPath.attr("stroke-width", 2).interrupt(); // Stop any ongoing transitions.
    
            radarPath
              .transition()
              .duration(300)
              .attrTween("d", function () {
                const interpolator = d3.interpolateArray(previousPoints, newPoints);
                return function (t) {
                  return radarLine(interpolator(t));
                };
              });
    
            // Update vertices with interpolation using global previous positions
            const vertexSelection = drawingGroup
              .selectAll("circle.vertex")
              .data(newPoints);
    
            // Transition existing vertices.
            vertexSelection
              .transition()
              .duration(300)
              .attrTween("cx", function (d, i) {
                const prevX = previousVertices[i][0];
                const currX = newPoints[i][0];
                return d3.interpolateNumber(prevX, currX);
              })
              .attrTween("cy", function (d, i) {
                const prevY = previousVertices[i][1];
                const currY = newPoints[i][1];
                return d3.interpolateNumber(prevY, currY);
              });
    
            // Append new vertices.
            vertexSelection
              .enter()
              .append("circle")
              .attr("class", "vertex")
              .classed("selected", !!selectedNodeData)
              .attr("cx", (d, i) => previousVertices[i][0])
              .attr("cy", (d, i) => previousVertices[i][1])
              .attr("r", 2)
              .classed("selected", !!selectedNodeData)
              .transition()
              .duration(400)
              .attr("cx", (d, i) => newPoints[i][0])
              .attr("cy", (d, i) => newPoints[i][1]);
    
            // Remove exiting vertices.
            vertexSelection
              .exit()
              .transition()
              .duration(300)
              .style("opacity", 0)
              .remove();
          }
    
          /**
           * Draws radial axis labels as independent HTML elements.
           * The labels are appended to a container that is taken out of the normal layout flow.
           *
           * @param {number} centerX - X-coordinate of the radar chart center.
           * @param {number} centerY - Y-coordinate of the radar chart center.
           * @param {number} radarRadius - The radar chart radius.
           * @param {Array} labels - Array of five axis label strings.
           * @param {string} containerSelector - Selector for the overlay container.
           */
          function drawRadialAxisLabels(
            centerX,
            centerY,
            radarRadius,
            labels,
            containerSelector,
          ) {
            // Select or create the overlay container.
            let container = d3.select(containerSelector);
            if (container.empty()) {
              container = d3
                .select("body")
                .append("div")
                .attr("id", containerSelector.replace("#", ""))
                .style("position", "fixed")
                .style("top", "0px")
                .style("left", "0px")
                .style("width", "100%")
                .style("height", "100%")
                .style("pointer-events", "none")
                .style("z-index", "9999");
            }
    
            // Clear any previous labels.
            container.selectAll(".radial-axis-label").remove();
    
            // Base angle: start at the top.
            const baseAngle = -Math.PI / 2;
            // Define offset (in pixels) beyond the radar radius.
            const offset = 20;
    
            // For each label, compute its absolute (viewport) position.
            labels.forEach((label, i) => {
              const angle = baseAngle + (2 * Math.PI * i) / labels.length;
              // Compute position relative to the provided center and radius.
              const x = centerX + (radarRadius + offset) * Math.cos(angle);
              const y = centerY + (radarRadius + offset) * Math.sin(angle);
    
              // Append an independent label element.
              container
                .append("div")
                .attr("class", "radial-axis-label")
                .classed("selected", !!selectedNodeData)
                .style("position", "fixed")
                .style("left", `${x}px`)
                .style("top", `${y}px`)
                .style("transform", "translate(-50%, -50%)")
                .style("background", "rgba(0, 0, 0, 0)")
                .style("padding", "2px 4px")
                .style("border-radius", "3px")
                .style("font-size", "10px")
                .style("pointer-events", "none")
                .text(label);
            });
          }
    
          function updateAnnotationForLink(d, annotationGroup) {
            // Determine source and target coordinates:
            let sx, sy, tx, ty;
            if (
              currentMode === "map" &&
              d.source.x0 !== undefined &&
              d.source.y0 !== undefined &&
              d.target.x0 !== undefined &&
              d.target.y0 !== undefined
            ) {
              // Use fixed coordinates from the node objects when in map mode.
              sx = d.source.x0;
              sy = d.source.y0;
              tx = d.target.x0;
              ty = d.target.y0;
            } else {
              // Use dynamic positions.
              sx = typeof d.source === "object" ? d.source.x : d.source;
              sy = typeof d.source === "object" ? d.source.y : d.source;
              const adj = getAdjustedTarget(d);
              tx = adj.x;
              ty = adj.y;
            }
    
            // Compute the chord midpoint.
            const midChordX = (sx + tx) / 2;
            const midChordY = (sy + ty) / 2;
    
            // Compute chord vector and its length.
            const dx = tx - sx;
            const dy = ty - sy;
            const L = Math.sqrt(dx * dx + dy * dy);
            if (L === 0) return; // avoid division by zero
    
            // For an arc drawn as "A L,L,0,0,1,..." the subtended angle is 60° (π/3).
            // The distance from the chord midpoint to the arc midpoint is:
            // arcOffset = L * (1 - cos(θ/2))
            const thetaOver2 = Math.asin(0.5); // 30° in radians.
            const arcOffset = L * (1 - Math.cos(thetaOver2));
    
            // Compute a unit perpendicular vector to the chord (using -dy, dx).
            const ux = -dy / L,
              uy = dx / L;
    
            // Compute the arc midpoint by offsetting the chord midpoint by arcOffset along the perpendicular.
            const midX = midChordX - ux * arcOffset;
            const midY = midChordY - uy * arcOffset;
    
            const offsets = getAnnotationOffsetNoXDefault(midX, midY, w, h);
    
            const titleStringSource = getStatnaam(d.source.id);
            const titleStringTarget = getStatnaam(d.target.id);
            const noteLabel = isSimulationModeActive()
              ? `Exposure load: ${formatSmall(d.weight)}\nLedger animals: ${formatSmall(d.simulation?.ledgerWeight || d.ledgerWeight || 0)}\nSource prevalence: ${formatPct(d.simulation?.sourcePrevalence || 0)}\nTarget prevalence: ${formatPct(d.simulation?.targetPrevalence || 0)}`
              : `Trade volume: ${d.weight}`;
            const annotations = [
              {
                note: {
                  title: `${titleStringSource} → ${titleStringTarget}`,
                  label: noteLabel,
                  wrapSplitter: /\n/,
                  wrap: 0.5 * w - 60,
                  bgPadding: { top: 6, left: 6, right: 4, bottom: 4 },
                },
                className: "link-annotation",
                x: midX,
                y: midY,
                dx: offsets.dx,
                dy: offsets.dy,
              },
            ];
    
            const makeAnnotations = d3
              .annotation()
              .type(linkAnnoType)
              .notePadding(10)
              .annotations(annotations);
    
            annotationGroup.call(makeAnnotations).raise();
            annotationGroup
              .selectAll("rect.annotation-note-bg")
              .attr("fill", selectedNodeData ? "white" : "green")
              .attr("fill-opacity", 0.8)
              .attr("rx", 4)
              .attr("ry", 4);
            annotationGroup
              .selectAll(".link-annotation .annotation-connector .connector")
              .attr("stroke", selectedNodeData ? "white" : "green");
            annotationGroup
              .selectAll(".link-annotation .annotation-note .note-line")
              .attr("stroke", selectedNodeData ? "white" : "green");
            annotationGroup
              .selectAll(".link-annotation .annotation-note text")
              .attr("fill", selectedNodeData ? "gray" : "white");
          }
    
          // Helper function: Adjust dx, dy based on node position relative to SVG bounds.
          function getAnnotationOffset(x, y, svgWidth, svgHeight, amount = 50) {
            let dx = amount; // default offset
            let dy = -amount; // default offset above the node
    
            // Horizontal adjustment:
            if (x < svgWidth * 0.3) {
              // Node is near left edge: place annotation to the right.
              dx = amount;
            } else if (x > svgWidth * 0.7) {
              // Node is near right edge: place annotation to the left.
              dx = -amount;
            } else {
              dx = 0; // Centered horizontally.
            }
    
            // Vertical adjustment:
            if (y < svgHeight * 0.4) {
              // Node is near top edge: place annotation below.
              dy = amount;
            } else if (y > svgHeight * 0.6) {
              // Node is near bottom edge: place annotation above.
              dy = -amount;
            } else {
              dy = -amount; // default above node.
            }
    
            return { dx, dy };
          }
    
          function getAnnotationOffsetMidPoint(
            x,
            y,
            svgWidth,
            svgHeight,
            amount = 20,
          ) {
            let dx = amount; // default offset
            let dy = -amount; // default offset above the node
    
            dx = x > svgWidth / 2 ? -amount : amount;
            dy = y > svgHeight / 2 ? -amount : amount;
    
            return { dx, dy };
          }
    
          function getAnnotationOffsetNoXDefault(x, y, svgWidth, svgHeight) {
            // Horizontal offset: if x is more than half the width, place annotation to the left (-50); otherwise, to the right (+50).
            const dx = x > svgWidth / 2 ? -50 : 50;
    
            let dy;
            if (y < svgHeight * 0.3) {
              // Near the top edge: shift annotation downward.
              dy = 50;
            } else if (y > svgHeight * 0.7) {
              // Near the bottom edge: shift annotation upward.
              dy = -50;
            } else {
              // Default: place annotation above the point.
              dy = -50;
            }
    
            return { dx, dy };
          }
    
          function addHotspotLegend() {
            const legend = d3.select(".hotspotLegend");
            // If the container already has legend items, do nothing.
            if (!legend.empty() && legend.selectAll(".legendItem").size() > 0) {
              return;
            }
    
            const legendData = [
              { name: "Vulnerable", color: hotspotColors.inDegree },
              { name: "Seeding", color: hotspotColors.outDegree },
              { name: "Bottleneck", color: hotspotColors.betweenness },
              { name: "Sink", color: hotspotColors.pageRank },
              { name: "Amplifier", color: hotspotColors.eigenvector },
            ];
    
            const itemCount = legendData.length;
            const itemHeight = 140 / itemCount;
    
            // Create legend items.
            legendData.forEach((d, i) => {
              // Create a container for each legend item.
              const itemDiv = legend
                .append("div")
                .attr("class", "legendItem")
                .style("display", "flex")
                .style("align-items", "center")
                .style("height", itemHeight + "px")
                .style("padding-left", "9px");
    
              // Create an icon as a circle.
              // Diameter is 16px when iconRadius is 8px.
              itemDiv
                .append("div")
                .attr("class", "legendIcon")
                .style("width", "16px")
                .style("height", "16px")
                .style("border-radius", "50%")
                .style("border", `1.5px dashed ${d.color}`)
                .style("margin-right", "5px");
    
              // Append the text label.
              itemDiv
                .append("span")
                .attr("class", "legendLabel")
                .style("font-size", "12px")
                .style("color", "gray")
                .text(d.name);
            });
    
            legend.call(
              d3
                .drag()
                .on("start", function (event) {
                  d3.select(this).raise().classed("active", true);
                })
                .on("drag", function (event) {
                  // Get the bounding client rectangle of the parent.
                  const parentRect = d3
                    .select("#col2")
                    .node()
                    .getBoundingClientRect();
                  const thisRect = d3.select(this).node().getBoundingClientRect();
    
                  let newX = event.x;
                  let newY = event.y;
    
                  // Clamp horizontally (so it stays fully inside .col2).
                  // 0 is the left edge of parentRect,
                  // parentRect.width - thisRect.width is the rightmost position.
                  newX = Math.max(
                    0,
                    Math.min(newX, parentRect.width - thisRect.width),
                  );
    
                  // Keep the panel within #col2 vertically..
                  newY = Math.max(
                    0,
                    Math.min(newY, parentRect.height - thisRect.height),
                  );
    
                  // Apply the clamped positions.
                  d3.select(this)
                    .style("left", newX + "px")
                    .style("top", newY + "px");
                })
                .on("end", function () {
                  d3.select(this).classed("active", false);
                }),
            );
    
            // Append a "?" button.
            const infoBtn = d3.select(".hotspotInfoButton");
            infoBtn
              .append("div")
              .attr("class", "has-tip")
              .attr("data-tip", controlTips.hotspotInfo)
              .attr("data-tip-placement", "right")
              .attr("aria-label", controlTips.hotspotInfo)
              .html('<i class="fa-solid fa-circle-info"></i>')
              .on("click", function () {
                showHotspotInfoOverlay();
              })
              .on("mouseover", function () {
                d3.select(this)
                  .style("transform", "scale(1.1)")
                  .style("filter", "brightness(1.2)");
              })
              .on("mouseout", function () {
                d3.select(this)
                  .style("transform", "scale(1)")
                  .style("filter", "brightness(1)");
              });
    
            // Define Edge Glow and Drop Shadow Filters
            let defs = svg.select("defs");
            if (defs.empty()) {
              defs = svg.append("defs");
            }
    
            // Define the edge glow filter.
            const edgeGlow = defs
              .append("filter")
              .attr("id", "edgeGlow")
              .attr("x", "-50%")
              .attr("y", "-50%")
              .attr("width", "200%")
              .attr("height", "200%");
    
            edgeGlow
              .append("feGaussianBlur")
              .attr("in", "SourceGraphic")
              .attr("stdDeviation", 3)
              .attr("result", "blur");
    
            const feMerge = edgeGlow.append("feMerge");
            feMerge.append("feMergeNode").attr("in", "blur");
            feMerge.append("feMergeNode").attr("in", "SourceGraphic");
          }
    
          function showHotspotInfoOverlay() {
            let overlay = d3.select("body").select("#hotspotInfoOverlay");
            if (overlay.empty()) {
              overlay = d3
                .select("body")
                .append("div")
                .attr("id", "hotspotInfoOverlay");
            }

            const closeOverlay = () => {
              overlay.classed("hide", true);
              setTimeout(() => overlay.remove(), 240);
            };

            const metrics = [
              {
                code: "ID",
                name: "Weighted In Degree",
                role: "Vulnerable",
                icon: "fa-arrow-down",
                text: "Regions receiving larger livestock volumes carry higher exposure pressure.",
                method: "Incoming trade weights, log scaled",
              },
              {
                code: "OD",
                name: "Weighted Out Degree",
                role: "Seeding",
                icon: "fa-arrow-up",
                text: "Regions sending larger livestock volumes can seed wider spread.",
                method: "Outgoing trade weights, log scaled",
              },
              {
                code: "BT",
                name: "Betweenness",
                role: "Bottleneck",
                icon: "fa-route",
                text: "Regions sitting on trade paths can connect otherwise separate flows.",
                method: "Brandes shortest path score",
              },
              {
                code: "PR",
                name: "PageRank",
                role: "Sink",
                icon: "fa-magnet",
                text: "Regions receiving from important senders can collect downstream risk.",
                method: "Random walk centrality",
              },
              {
                code: "EC",
                name: "Eigenvector Centrality",
                role: "Amplifier",
                icon: "fa-tower-broadcast",
                text: "Regions linked to influential partners can magnify network pressure.",
                method: "Power iteration on adjacency",
              },
            ];

            overlay
              .attr("class", "hotspot-info-overlay")
              .attr("role", "presentation")
              .html(`
                <section class="hotspot-info-card" role="dialog" aria-modal="true" aria-labelledby="hotspotInfoTitle">
                  <button class="hotspot-info-close" type="button" aria-label="Close hotspot metrics">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                  <div class="hotspot-info-head">
                    <div>
                      <div id="hotspotInfoTitle" class="hotspot-info-badge">
                        <i class="fa-solid fa-circle-info"></i>
                        Hotspot Metrics
                      </div>
                      <p class="hotspot-info-subtitle">
                        Dashed hotspot rings mark regions with high centrality or flow pressure in the trade network.
                      </p>
                    </div>
                  </div>
                  <div class="hotspot-info-grid">
                    ${metrics
                      .map(
                        (metric) => `
                          <article class="hotspot-metric-card">
                            <div class="hotspot-metric-head">
                              <span class="hotspot-metric-code">${metric.code}</span>
                              <span class="hotspot-metric-role">
                                <i class="fa-solid ${metric.icon}"></i>
                                ${metric.role}
                              </span>
                            </div>
                            <h3>${metric.name}</h3>
                            <p>${metric.text}</p>
                            <div class="hotspot-metric-method">${metric.method}</div>
                          </article>
                        `,
                      )
                      .join("")}
                  </div>
                </section>
              `);

            overlay.on("click", function (event) {
              if (event.target === overlay.node()) {
                closeOverlay();
              }
            });
            overlay.select(".hotspot-info-close").on("click", closeOverlay);
          }
    
          function debounce(func, wait, immediate) {
            let timeout;
            return function (...args) {
              const context = this;
              const later = function () {
                timeout = null;
                if (!immediate) func.apply(context, args);
              };
              const callNow = immediate && !timeout;
              clearTimeout(timeout);
              timeout = setTimeout(later, wait);
              if (callNow) func.apply(context, args);
            };
          }
    
          const debouncedOnClickNode = debounce(
            onClickNode,
            300,
            (immediate = true),
          );
    
          // Node Click Handler
          function onClickNode(event, d) {
            if (event.defaultPrevented) return;
            clearHoveredLinkState();
            // Save previous selection before clearing
            let wasSelected = !!selectedNodeData;
            let wasSameNode = selectedNodeData && selectedNodeData.id === d.id;
            // If clicking the same node, clear selection and return.
            if (wasSameNode) {
              clearSelection(false);
              return;
            }
            clearSelection(wasSelected && !wasSameNode);
            selectedNodeData = d;
            document.body.classList.add("focus-mode-active");
    
            // Change the whole page background to black with transition
            d3.select("body")
              .transition()
              .duration(selectedNodeData ? 0 : 300)
              .style("background", "gray");
    
            // Hide the global stats display.
            d3.select("#globalStats").style("visibility", "hidden");
            d3.select("#globalStatsControls").style("display", "none");
            d3.select("#simulationControls").style("display", "none");
    
            // Hide the node stats display.
            d3.select("#nodeStats").style("visibility", "hidden");
            d3.select("#nodeStatsControls").style("display", "none");
    
            // Hide the network level gravity model and metadata groups.
            d3.select("#tradeDistribution").style("display", "none");
            d3.select("#tradeClusters").style("display", "none");
            // Show the node level gravity model and metadata groups.
            d3.select("#tradeNodeDistribution").style("visibility", "visible");
            d3.select("#tradeNodeInsight").style("visibility", "visible");
    
            // Change Gravity Model background to black.
            d3.select("#tradeNodeDistribution").style(
              "background",
              "rgba(0, 0, 0, 0.4)",
            );
            // Change Gravity Model title to white.
            d3.select(".trade-node-distribution-label").style("color", "white");
    
            // Change Placeholder background to black.
            d3.select("#tradeNodeInsight").style(
              "background",
              "rgba(0, 0, 0, 0.4)",
            );
            //  Change SCCs title to white.
            d3.select(".trade-nodeinsight-label").style("color", "white");
    
            // If clicked, change all node labels to white
            labelSelection.attr("fill", "white");
            // Then update node label styling for the selected node.
            labelSelection
              .filter((nd) => String(nd.id) === String(d.id))
              .attr("fill", "white")
              .attr("font-weight", "bold")
              .attr("background", "red")
              .attr("font-size", "21px")
              .attr("filter", "url(#dropShadow)");
    
            // Raise labels
            labelSelection.raise();
    
            // Select all foreignObject with sub class inactive-overlay
            d3.selectAll("foreignObject")
              .filter(function () {
                return d3.select(this).classed("inactive-overlay");
              })
              .attr("class", "inactive-overlay inactive-overlay-selected");
    
            // If clicked, change legend text to white
            d3.selectAll(".legendLabel").style("color", "white");
            // If clicked, add glowing filter to legend circles
            d3.selectAll(".legendIcon").style("filter", "url(#edgeGlow)");
            // If clicked, add glowing filter to main figure's hotspot strokes
            d3.selectAll(".hotspotStroke").attr("filter", "url(#edgeGlow)");
            // If clicked, change "?" button color to white
            d3.select(".hotspotInfoButton i").style("color", "white");
    
            // If clicked, change stats color to white
            d3.select(".statsContainer")
              .style("border", "1px dashed white")
              .style("background", "rgba(255, 255, 255, 0.05)");
            d3.selectAll(".stat-item").style("color", "white");
    
            // If clicked, change layer, restore and screenshot buttons to white and their text to dark mode
            d3.select(".help-overlay-button").style("color", "gray");
            d3.select(".map-layer-button").style("color", "gray");
            d3.select(".restore-button").style("color", "gray");
            d3.select(".screenshot-button").style("color", "gray");
            d3.select(".help-overlay-button").style("background", "white");
            d3.select(".map-layer-button").style("background", "white");
            d3.select(".restore-button").style("background", "white");
            d3.select(".screenshot-button").style("background", "white");
    
            // If clicked, change spectral radius display background to white and text to black
            d3.select("#networkTransRiskScore").style("color", "white");
    
            // If clicked, change the play/pause and restart buttons to white and content to black
            d3.select("#playPauseBtn").style("background", "white");
            d3.select("#fromStartBtn").style("background", "white");
            d3.select("#playPauseBtn").style("color", "black");
            d3.select("#fromStartBtn").style("color", "black");
    
            // If clicked, change date display text to white
            d3.select("#currentDateWidget").style("color", "white");
            d3.select("#timeAuthorCredit").style("color", "white");
    
            linkSelection
              .attr("display", function (linkData) {
                const srcId =
                    typeof linkData.source === "object"
                      ? linkData.source.id
                      : linkData.source,
                  tgtId =
                    typeof linkData.target === "object"
                      ? linkData.target.id
                      : linkData.target;
                // Only highlight if the link is connected to the clicked node, is enabled, and has weight > 0.
                if (linkData.weight > 0 && srcId === d.id && !linkData.disabled) {
                  d3.select(this)
                    .attr("class", "linkSelectOut")
                    .attr("stroke-width", 2)
                    .attr("filter", "url(#edgeGlow)");
                  return "block";
                } else if (
                  linkData.weight > 0 &&
                  tgtId === d.id &&
                  !linkData.disabled
                ) {
                  d3.select(this)
                    .attr("class", "linkSelectIn")
                    .attr("stroke-width", 2)
                    .attr("filter", "url(#edgeGlow)");
                  return "block";
                } else {
                  return "none";
                }
              })
              .attr("marker-end", function (linkData) {
                // Force IDs to be strings.
                const srcId = String(
                    typeof linkData.source === "object"
                      ? linkData.source.id
                      : linkData.source,
                  ),
                  tgtId = String(
                    typeof linkData.target === "object"
                      ? linkData.target.id
                      : linkData.target,
                  );
                if (
                  (srcId === String(d.id) || tgtId === String(d.id)) &&
                  !linkData.disabled &&
                  linkData.weight > 0 &&
                  srcId !== tgtId
                ) {
                  return "url(#arrow)";
                } else if (srcId === tgtId) {
                  return "url(#loop)";
                } else {
                  return null;
                }
              });
    
            // Update annotation styling for the selected node
            annotationGroup
              .selectAll(".node-annotation")
              .classed("selected", !!selectedNodeData);
    
            d3.select("svg.custom-radar").classed("selected", !!selectedNodeData);
    
            d3.selectAll("circle.vertex").classed("selected", !!selectedNodeData);
    
            d3.selectAll(".radial-axis-label").classed(
              "selected",
              !!selectedNodeData,
            );
    
            // Add an overlay to gray out the background map.
            // Always interrupt and remove any existing overlay.
            svg.select("#mapOverlay").interrupt().remove();
    
            // Insert a rectangle as the first child of the SVG.
            // Add/update overlay.
            if (svg.select("#mapOverlay").empty()) {
              if (wasSelected) {
                // Skip animation when a node is already selected.
                svg
                  .insert("rect", ":first-child")
                  .attr("id", "mapOverlay")
                  .attr("x", 0)
                  .attr("y", 0)
                  .attr("width", w)
                  .attr("height", h)
                  .attr("fill", "black")
                  .attr("opacity", 0.4);
              } else {
                // If no node was previously selected, animate the overlay.
                svg
                  .insert("rect", ":first-child")
                  .attr("id", "mapOverlay")
                  .attr("x", 0)
                  .attr("y", 0)
                  .attr("width", w)
                  .attr("height", h)
                  .attr("fill", "black")
                  .attr("opacity", 0)
                  .transition()
                  // If is called by updateTemporalNetwork, don't animate the overlay
                  .duration(isDoingTemporalUpdate ? 0 : 300)
                  .attr("opacity", 0.4);
              }
            }
            // Unhide the trade information panel
            document.getElementById("tradeInfo").style.display = "block";
            document.getElementById("inArboContainer").style.visibility = "visible";
    
            // Show/Update trade table and (re)-plot in/out arborescences
            updateTradeTable();
            updateInOutArbos();
    
            // Update the node trade distribution
            updateNodeTradeDistribution();
    
            // Update the node insight section
            updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
    
            // Compute class strings based on isTemporalUpdate
            const classStringA =
              isDoingTemporalUpdate || wasSelected
                ? "glowing-border-instant"
                : "glowing-border";
            const classStringB =
              isDoingTemporalUpdate || wasSelected
                ? "header-row-dark-instant"
                : "header-row-dark";
            const classStringC =
              isDoingTemporalUpdate || wasSelected
                ? "glowing-border-switcher-instant"
                : "glowing-border-switcher";
    
            // Switch containers to dark mode with glowing borders
            d3.select(".header-row-1").classed(classStringB, true);
            d3.selectAll(".csv-switcher, .mode-switcher-frame").classed(
              classStringC,
              true,
            );
            d3.select("#col2").classed(classStringA, true);
            d3.select("#tradeNodeDistribution").classed(classStringA, true);
            d3.select("#tradeNodeInsight").classed(classStringA, true);
            d3.selectAll(".trade-section").classed(classStringA, true);
            d3.select(".trade-info-header").classed(classStringA, true);
            d3.select("#inArboContainer").classed(classStringA, true);
    
            // Switch university logo to white version
            fetchAsset("assets/files/herdlink/WUR_W_standard_2021.svg", "blob")
              .then((blob) => {
                const objectUrl = URL.createObjectURL(blob);
                document.querySelector(".watermark-logo").src = objectUrl;
              })
              .catch((error) => {
                console.error("Error loading watermark SVG:", error);
              });
          }
    
          // Clear Selection (If Clicking Again/Unclicked)
          function clearSelection(flag) {
            clearHoveredLinkState();
            selectedNodeData = null;
            document.body.classList.remove("focus-mode-active");
    
            const colorScale = d3
              .scaleSequential(d3.interpolateSpectral)
              .domain(d3.extent(allLinks, (d) => Math.log(d.weight)).reverse()); // Inverted color scale
    
            // Change the whole page background to white.
            d3.select("body")
              .transition()
              .duration(selectedNodeData ? 0 : 300)
              .style("background", null);
    
            if (!selectedNodeData) {
              d3.select(".header-row-1").classed("header-row-dark", false);
              d3.select(".header-row-1").classed("header-row-dark-instant", false);
              d3.selectAll(".csv-switcher, .mode-switcher-frame").classed(
                "glowing-border-switcher",
                false,
              );
              d3.selectAll(".csv-switcher, .mode-switcher-frame").classed(
                "glowing-border-switcher-instant",
                false,
              );
              d3.select("#col2").classed("glowing-border", false);
              d3.select("#col2").classed("glowing-border-instant", false);
              d3.select("#tradeNodeDistribution").classed("glowing-border", false);
              d3.select("#tradeNodeDistribution").classed(
                "glowing-border-instant",
                false,
              );
              d3.select("#tradeNodeInsight").classed("glowing-border", false);
              d3.select("#tradeNodeInsight").classed(
                "glowing-border-instant",
                false,
              );
              d3.selectAll(".trade-section").classed("glowing-border", false);
              d3.selectAll(".trade-section").classed(
                "glowing-border-instant",
                false,
              );
              d3.select(".trade-info-header").classed("glowing-border", false);
              d3.select(".trade-info-header").classed(
                "glowing-border-instant",
                false,
              );
              d3.select("#inArboContainer").classed("glowing-border", false);
              d3.select("#inArboContainer").classed(
                "glowing-border-instant",
                false,
              );
            }
    
            // Restore node labels: reset fill, font-weight, and font-size.
            labelSelection
              .attr("font-weight", "normal")
              .attr("font-size", "12px")
              .attr("filter", null)
              .attr("stroke", null)
              .attr("stroke-opacity", null);
    
            // Update annotation styling for the selected node
            annotationGroup
              .selectAll(".node-annotation")
              .classed("selected", !!selectedNodeData);
    
            d3.select("svg.custom-radar").classed("selected", !!selectedNodeData);
    
            d3.selectAll("circle.vertex").classed("selected", !!selectedNodeData);
    
            d3.selectAll(".radial-axis-label").classed(
              "selected",
              !!selectedNodeData,
            );
    
            // Display the global stats display.
            d3.select("#globalStats").style("visibility", "visible");
            d3.select("#globalStatsControls").style(
              "display",
              isSimulationModeActive() ? "none" : "flex",
            );
            d3.select("#simulationControls").style(
              "display",
              isSimulationModeActive() ? "block" : "none",
            );
    
            // Display the node stats display.
            d3.select("#nodeStats").style("visibility", "visible");
            d3.select("#nodeStatsControls").style(
              "display",
              isSimulationModeActive() ? "none" : "flex",
            );
    
            // Show the network level gravity model and metadata groups.
            d3.select("#tradeDistribution").style("display", "block");
            d3.select("#tradeClusters").style("display", "block");
    
            // Hide the node level gravity model and metadata groups.
            d3.select("#tradeNodeDistribution").style("visibility", "hidden");
            d3.select("#tradeNodeInsight").style("visibility", "hidden");
    
            // Restore panel backgrounds.
            d3.select("#tradeNodeDistribution").style("background", null);
            // Change Gravity Model title to black.
            d3.select(".trade-node-distribution-label").style("color", "black");

            // Restore panel backgrounds.
            d3.select("#tradeNodeInsight").style("background", null);
            //  Change SCCs title to black.
            d3.select(".trade-nodeinsight-label").style("color", "black");
    
            // Update the global stats display.
            updateGlobalStatsChart(window.currentSelectedStat);
    
            // Update the node stats display.
            updateNodeStatsChart(window.currentSelectedNodeStat);
    
            // Update the trade distribution display.
            updateTradeDistribution();
    
            // Update the trade clusters display.
            updateSCCs();
    
            // If unclicked, change all node labels back to black
            labelSelection.attr("fill", "black");
    
            // Raise labels
            labelSelection.raise();
    
            // Select all foreignObject with sub class inactive-overlay
            d3.selectAll("foreignObject")
              .filter(function () {
                return d3.select(this).classed("inactive-overlay-selected");
              })
              .classed("inactive-overlay-selected", false);
    
            // If unclicked, change legend text back to gray
            d3.selectAll(".legendLabel").style("color", "gray");
            // If unclicked, remove glowing filter to legend circles
            d3.selectAll(".legendIcon").style("filter", null);
            // If unclicked, remove glowing filter from main figure's hotspot strokes
            d3.selectAll(".hotspotStroke").attr("filter", null);
            // If unclicked, change "?" button color back to green
            d3.select(".hotspotInfoButton i").style("color", "green");
    
            if (isSimulationModeActive() && simulationState.currentFrame) {
              renderSimulationStatsContainer();
            } else {
              d3.select(".statsContainer")
                .classed("simulation-stats-container", false)
                .style("border", "1px dashed green")
                .style("background", "rgba(0, 255, 0, 0.03)");
              d3.selectAll(".stat-item").style("color", "gray");
            }
    
            // If unclicked, change layer, restore and screenshot buttons back to green and their text to white
            d3.select(".help-overlay-button").style("color", "white");
            d3.select(".map-layer-button").style("color", "white");
            d3.select(".restore-button").style("color", "white");
            d3.select(".screenshot-button").style("color", "white");
            d3.select(".help-overlay-button").style(
              "background",
              "linear-gradient(135deg, #4CAF50, #1b872b)",
            );
            d3.select(".map-layer-button").style(
              "background",
              "linear-gradient(135deg, #4CAF50, #1b872b)",
            );
            d3.select(".restore-button").style(
              "background",
              "linear-gradient(135deg, #4CAF50, #1b872b)",
            );
            d3.select(".screenshot-button").style(
              "background",
              "linear-gradient(135deg, #4CAF50, #1b872b)",
            );
    
            // If unclicked, change spectral radius display background to green and text to white
            d3.select("#networkTransRiskScore").style("color", "green");
    
            // If unclicked, change the play/pause and restart buttons back to green and content to white
            d3.select("#playPauseBtn").style(
              "background",
              "linear-gradient(135deg, #4CAF50, #1b872b)",
            );
            d3.select("#fromStartBtn").style(
              "background",
              "linear-gradient(135deg, #4CAF50, #1b872b)",
            );
            d3.select("#playPauseBtn").style("color", "white");
            d3.select("#fromStartBtn").style("color", "white");
    
            // If unclicked, change the date display text back to gray
            d3.select("#currentDateWidget").style("color", "gray");
            d3.select("#timeAuthorCredit").style("color", "gray");
    
            // If unclicked, change link colors back, remove arrowheads and glowing filter
            linkSelection
              .interrupt()
              .attr("display", (d) => (d.weight > 0 ? "block" : "none"))
              .attr("class", "link")
              .attr("marker-end", null)
              .attr("stroke", (d) => {
                // If the link has zero (or negative) weight, don't show it.
                return d.weight <= 0 ? "none" : edgeColor(Math.log(d.weight));
              })
              .attr("stroke-width", (d) =>
                d.weight <= 0 ? 0 : Math.sqrt(d.weight),
              )
              .attr("opacity", null)
              .style("opacity", null)
              .attr("filter", null);
    
            // Hide the trade information panel
            document.getElementById("tradeInfo").style.display = "none";
            document.getElementById("inArboContainer").style.visibility = "hidden";
    
            // Remove the background overlay if select another node
            if (!flag) {
              svg
                .select("#mapOverlay")
                .interrupt()
                .transition()
                .duration(300)
                .attr("opacity", 0)
                .remove();
            } else {
              svg.select("#mapOverlay").remove();
            }
    
            // Call the updateNetwork function to reset the network with instant=true
            updateNetwork((instant = true));
    
            // Clear the trade table and arborescences
            updateTradeTable();
            updateInOutArbos();
    
            // Switch the university logo back to the black version
            fetchAsset("assets/files/herdlink/WUR_ZW_standard_2021.svg", "blob")
              .then((blob) => {
                const objectUrl = URL.createObjectURL(blob);
                document.querySelector(".watermark-logo").src = objectUrl;
              })
              .catch((error) => {
                console.error("Error loading watermark SVG:", error);
              });
          }
    
          // Lookup coordinates from the geojson by statcode.
          function getCoordinatesForStatcode(statcode) {
            // Assuming nl_corop_labelpoint is available globally.
            const feature = nlLabelPoints.features.find(
              (f) => f.properties.statcode === statcode,
            );
            return feature ? feature.geometry.coordinates : null;
          }
    
          // Compute Euclidean distance in the given coordinate system.
          // Compute Euclidean distance in CRS 28992 (meters) and convert to kilometers.
          function computeDistance(coords1, coords2) {
            if (!coords1 || !coords2) return 0;
            const dx = coords1[0] - coords2[0];
            const dy = coords1[1] - coords2[1];
            return Math.sqrt(dx * dx + dy * dy) / 1000;
          }

          function updateSimulationLedgerTable() {
            const tradePanelDiv = document.getElementById("tradePanel");
            if (!tradePanelDiv) return;
            if (!selectedNodeData) {
              tradePanelDiv.innerHTML = "";
              return;
            }

            const focalId = selectedNodeData.id;
            const outgoing = allLinks
              .filter((link) => getNodeId(link.source) === focalId && link.weight > 0)
              .sort((a, b) => b.weight - a.weight);
            const incoming = allLinks
              .filter((link) => getNodeId(link.target) === focalId && link.weight > 0)
              .sort((a, b) => b.weight - a.weight);
            const allOutgoingEnabled = outgoing.every((link) => !link.disabled);
            const allIncomingEnabled = incoming.every((link) => !link.disabled);

            function renderRows(rows, section) {
              if (!rows.length) {
                return `<div class="trade-item no-trades">No ${section} exposure.</div>`;
              }
              return rows
                .map((link) => {
                  const sourceId = getNodeId(link.source);
                  const targetId = getNodeId(link.target);
                  const partnerId = section === "outgoing" ? targetId : sourceId;
                  const partnerName = getStatnaam(partnerId);
                  const state = link.simulation || {};
                  const prevalence =
                    section === "outgoing"
                      ? state.targetPrevalence
                      : state.sourcePrevalence;
                  const barWidth = Math.min(
                    50,
                    Math.max(2, (prevalence || 0) * 180),
                  );
                  const icon =
                    sourceId === targetId
                      ? "fa-solid fa-repeat"
                      : section === "outgoing"
                        ? "fa-solid fa-arrow-right-from-line"
                        : "fa-solid fa-arrow-left-to-line";
                  return `
                    <div class="trade-item">
                      <div class="trade-item-main">
                        <span class="${section === "outgoing" ? "trade-dest" : "trade-src"}">
                          <span class="trade-icon"><i class="${icon}"></i></span>
                          <span class="trade-distance">
                            <svg class="distance-bar" viewBox="0 0 50 10" width="50" height="10" aria-hidden="true" focusable="false">
                              <rect x="0" y="0" width="50" height="10" fill="rgba(255,255,255,0.18)"></rect>
                              <rect x="0" y="0" width="${barWidth}" height="10" fill="${simulationPrevalenceScale(prevalence || 0)}"></rect>
                            </svg>
                          </span>
                          <span class="trade-route-label">[${partnerId}] ${partnerName}</span>
                        </span>
                        <span class="trade-volume">${formatSmall(link.weight)}</span>
                      </div>
                      <input type="checkbox" class="trade-checkbox" data-section="${section}" data-source="${sourceId}" data-target="${targetId}" ${!link.disabled ? "checked" : ""}>
                    </div>
                  `;
                })
                .join("");
            }

            const state =
              simulationState.currentFrame?.nodeStates[selectedNodeData.id] || {};
            tradePanelDiv.innerHTML = `
              <div class="trade-info-header">
                <i class="fa-solid fa-location-crosshairs"></i> [${focalId}] ${selectedNodeData.statnaam}
                <span class="simulation-focus-pill">Prev ${formatPct(state.prevalence || 0)}</span>
              </div>
              <div class="trade-sections">
                <div class="trade-section">
                  <div class="trade-section-header">
                    <i class="fa-solid fa-arrow-right-from-bracket"></i> Outgoing Pressure
                    <input type="checkbox" class="trade-header-checkbox" data-section="outgoing" ${allOutgoingEnabled ? "checked" : ""}>
                  </div>
                  <div class="trade-list">${renderRows(outgoing, "outgoing")}</div>
                </div>
                <div class="trade-section">
                  <div class="trade-section-header">
                    <i class="fa-solid fa-arrow-left-to-bracket"></i> Incoming Exposure
                    <input type="checkbox" class="trade-header-checkbox" data-section="incoming" ${allIncomingEnabled ? "checked" : ""}>
                  </div>
                  <div class="trade-list">${renderRows(incoming, "incoming")}</div>
                </div>
              </div>
            `;
            attachTradeCheckboxListeners();
            if (window.isPlaying) {
              disableAllCheckboxes();
            }
          }

          function updateTradeTable() {
            if (isSimulationModeActive() && simulationState.currentFrame) {
              updateSimulationLedgerTable();
              return;
            }

            const tradePanelDiv = document.getElementById("tradePanel");
            if (!selectedNodeData) {
              tradePanelDiv.innerHTML = "";
              return;
            }
    
            // Filter outgoing and incoming links for the focal node (with weight > 0).
            const outgoing = allLinks.filter(
              (d) =>
                (typeof d.source === "object" ? d.source.id : d.source) ===
                  selectedNodeData.id && d.weight > 0,
            );
            const incoming = allLinks.filter(
              (d) =>
                (typeof d.target === "object" ? d.target.id : d.target) ===
                  selectedNodeData.id && d.weight > 0,
            );
    
            // Sort descending by weight.
            outgoing.sort((a, b) => b.weight - a.weight);
            incoming.sort((a, b) => b.weight - a.weight);
    
            // Determine if all trades are enabled.
            const allOutgoingEnabled = outgoing.every((trade) => !trade.disabled);
            const allIncomingEnabled = incoming.every((trade) => !trade.disabled);
    
            // Compute distances using geojson data
            const selectedCoords = getCoordinatesForStatcode(selectedNodeData.id);
    
            // For outgoing trades, the "other" node is the target.
            outgoing.forEach((trade) => {
              const targetId =
                typeof trade.target === "object" ? trade.target.id : trade.target;
              // Self-loop if source equals target.
              trade.isSelfLoop =
                (typeof trade.source === "object"
                  ? trade.source.id
                  : trade.source) === targetId;
              if (!trade.isSelfLoop && selectedCoords) {
                const targetCoords = getCoordinatesForStatcode(targetId);
                trade.distance = computeDistance(selectedCoords, targetCoords);
              } else {
                trade.distance = 0;
              }
            });
    
            // For incoming trades, the "other" node is the source.
            incoming.forEach((trade) => {
              const sourceId =
                typeof trade.source === "object" ? trade.source.id : trade.source;
              trade.isSelfLoop = sourceId === selectedNodeData.id;
              if (!trade.isSelfLoop && selectedCoords) {
                const sourceCoords = getCoordinatesForStatcode(sourceId);
                trade.distance = computeDistance(selectedCoords, sourceCoords);
              } else {
                trade.distance = 0;
              }
            });
    
            // Determine maximum distance (avoid zero) for scaling.
            const allDistances = outgoing
              .concat(incoming)
              .map((trade) => trade.distance);
            const maxDistance = d3.max(allDistances) || 1; // fallback to 1 to avoid division by zero.
            // Scale: distances map to a foreground bar width between 0 and 50px.
            const distanceScale = d3
              .scaleLinear()
              .domain([0, maxDistance])
              .range([0, 50]);
    
            // Build HTML.
            let html = `
                              <div class="trade-info-header">
                                  <i class="fa-solid fa-location-crosshairs"></i> [${selectedNodeData.id}] ${selectedNodeData.statnaam}
                              </div>
                              <div class="trade-sections">
                              <!-- Outgoing trades section -->
                              <div class="trade-section">
                                  <div class="trade-section-header">
                                      <i class="fa-solid fa-arrow-right-from-bracket"></i> Outgoing Trades
                                      <input type="checkbox" class="trade-header-checkbox" data-section="outgoing" ${allOutgoingEnabled ? "checked" : ""}>
                                  </div>
                                  <div class="trade-list">`;
    
            if (outgoing.length > 0) {
              outgoing.forEach((trade) => {
                const dest_id =
                  typeof trade.target === "object" ? trade.target.id : trade.target;
                const dest = getStatnaam(dest_id);
                let s =
                  typeof trade.source === "object" ? trade.source.id : trade.source;
                let t = dest_id;
                const iconHTML = trade.isSelfLoop
                  ? `<span class="trade-icon"><i class="fa-solid fa-repeat"></i></span>`
                  : `<span class="trade-icon"><i class="fa-solid fa-arrow-right-from-line"></i></span>`;
                // Determine the foreground color.
                const targetNode = allNodes.find((n) => n.id === dest_id);
                const fgColor = trade.isSelfLoop
                  ? "gray"
                  : targetNode
                    ? nodeColor(targetNode.community)
                    : "gray";
                const barWidth = distanceScale(trade.distance);
                const distanceSvg = `<span class="trade-distance"><svg class="distance-bar" viewBox="0 0 50 10" width="50" height="10" aria-hidden="true" focusable="false">
                                                      <rect x="0" y="0" width="50" height="10" fill="#eee"></rect>
                                                      <rect x="0" y="0" width="${trade.isSelfLoop ? 0 : barWidth}" height="10" fill="${fgColor}"></rect>
                                                  </svg></span>`;
                html += `
                                      <div class="trade-item">
                                          <div class="trade-item-main">
                                              <span class="trade-dest">
                                                  ${iconHTML}
                                                  ${distanceSvg}
                                                  <span class="trade-route-label">[${dest_id}] ${dest}</span>
                                              </span>
                                              <span class="trade-volume">${trade.weight}</span>
                                          </div>
                                          <input type="checkbox" class="trade-checkbox" data-section="outgoing" data-source="${s}" data-target="${t}" ${!trade.disabled ? "checked" : ""}>
                                      </div>
                                  `;
              });
            } else {
              html += `<div class="trade-item no-trades">No outgoing trades.</div>`;
            }
    
            html += `
                          </div> <!-- .trade-list -->
                              </div> <!-- .trade-section -->
    
                              <!-- Incoming trades section -->
                              <div class="trade-section">
                                  <div class="trade-section-header">
                                      <i class="fa-solid fa-arrow-left-to-bracket"></i> Incoming Trades
                                      <input type="checkbox" class="trade-header-checkbox" data-section="incoming" ${allIncomingEnabled ? "checked" : ""}>
                                  </div>
                                  <div class="trade-list">`;
    
            if (incoming.length > 0) {
              incoming.forEach((trade) => {
                const src_id =
                  typeof trade.source === "object" ? trade.source.id : trade.source;
                const src = getStatnaam(src_id);
                let s = src_id;
                let t =
                  typeof trade.target === "object" ? trade.target.id : trade.target;
                const iconHTML = trade.isSelfLoop
                  ? `<span class="trade-icon"><i class="fa-solid fa-repeat"></i></span>`
                  : `<span class="trade-icon"><i class="fa-solid fa-arrow-left-to-line"></i></span>`;
                // For incoming, use the source node's community.
                const sourceNode = allNodes.find((n) => n.id === src_id);
                const fgColor = trade.isSelfLoop
                  ? "gray"
                  : sourceNode
                    ? nodeColor(sourceNode.community)
                    : "gray";
                const barWidth = distanceScale(trade.distance);
                const distanceSvg = `<span class="trade-distance"><svg class="distance-bar" viewBox="0 0 50 10" width="50" height="10" aria-hidden="true" focusable="false">
                                               <rect x="0" y="0" width="50" height="10" fill="#eee"></rect>
                                               <rect x="0" y="0" width="${trade.isSelfLoop ? 0 : barWidth}" height="10" fill="${fgColor}"></rect>
                                           </svg></span>`;
                html += `
                                  <div class="trade-item">
                                      <div class="trade-item-main">
                                          <span class="trade-src">
                                              ${iconHTML}
                                              ${distanceSvg}
                                              <span class="trade-route-label">[${src_id}] ${src}</span>
                                          </span>
                                          <span class="trade-volume">${trade.weight}</span>
                                      </div>
                                      <input type="checkbox" class="trade-checkbox" data-section="incoming" data-source="${s}" data-target="${t}" ${!trade.disabled ? "checked" : ""}>
                                  </div>
                              `;
              });
            } else {
              html += `<div class="trade-item no-trades">No incoming trades.</div>`;
            }
    
            html += `
                          </div> <!-- .trade-list -->
                              </div> <!-- .trade-section -->
                          </div> <!-- .trade-sections -->
                      `;
    
            tradePanelDiv.innerHTML = html;
            attachTradeCheckboxListeners();
    
            if (isPlaying) {
              disableAllCheckboxes();
            }
          }
    
          // Focus-mode Trade Node Insight
          const FOCUS_OUT_COLOR = "#46fa46";
          const FOCUS_IN_COLOR = "#fcc67e";
          const FOCUS_AXIS_COLOR = "rgba(255,255,255,0.6)";
    
          function getLinkSourceId(link) {
            return typeof link.source === "object" ? link.source.id : link.source;
          }
          function getLinkTargetId(link) {
            return typeof link.target === "object" ? link.target.id : link.target;
          }
    
          function weightedQuantile(values, weights, q) {
            // values/weights must be same length
            const pairs = values
              .map((v, i) => ({ v, w: Math.max(0, weights[i] || 0) }))
              .filter((d) => isFinite(d.v) && d.w > 0)
              .sort((a, b) => a.v - b.v);
    
            const totalW = d3.sum(pairs, (d) => d.w);
            if (!totalW) return null;
    
            const threshold = q * totalW;
            let cum = 0;
            for (const p of pairs) {
              cum += p.w;
              if (cum >= threshold) return p.v;
            }
            return pairs[pairs.length - 1].v;
          }
    
          function renderEmpty(g, width, height, msg) {
            g.append("text")
              .attr("class", "empty-message")
              .attr("x", width / 2)
              .attr("y", height / 2)
              .attr("text-anchor", "middle")
              .attr("dominant-baseline", "middle")
              .attr("fill", "rgba(255,255,255,0.7)")
              .style("font-size", "12px")
              .text(msg);
          }
    
          function updateTradeNodeInsight(view) {
            if (isSimulationModeActive() && simulationState.currentFrame) {
              renderSimulationNodeInsight(view);
              return;
            }

            // If not in focus mode, clear summary and skip.
            if (!selectedNodeData) {
              const sumDiv = document.getElementById("tradeNodeInsightSummary");
              if (sumDiv) sumDiv.innerHTML = "";
              return;
            }
    
            const selectedView =
              view ||
              window.currentSelectedTradeNodeInsight ||
              document.getElementById("tradeNodeInsightSelect")?.value ||
              "partnerBalance";
    
            window.currentSelectedTradeNodeInsight = selectedView;
            const focalId = selectedNodeData.id;
    
            // Respect the focus-mode checkboxes: only use enabled links.
            const activeLinks = allLinks.filter((l) => !l.disabled && l.weight > 0);
    
            const outgoingAll = activeLinks.filter(
              (l) => getLinkSourceId(l) === focalId,
            );
            const incomingAll = activeLinks.filter(
              (l) => getLinkTargetId(l) === focalId,
            );
    
            const selfLoopVol = d3.sum(
              outgoingAll.filter((l) => getLinkTargetId(l) === focalId),
              (l) => l.weight,
            );
    
            const outgoing = outgoingAll.filter(
              (l) => getLinkTargetId(l) !== focalId,
            );
            const incoming = incomingAll.filter(
              (l) => getLinkSourceId(l) !== focalId,
            );
    
            const totalOut = d3.sum(outgoing, (d) => d.weight);
            const totalIn = d3.sum(incoming, (d) => d.weight);
    
            // Partner aggregation
            const partnerMap = new Map();
            outgoing.forEach((l) => {
              const pid = getLinkTargetId(l);
              const e = partnerMap.get(pid) || {
                partnerId: pid,
                inVol: 0,
                outVol: 0,
              };
              e.outVol += l.weight;
              partnerMap.set(pid, e);
            });
            incoming.forEach((l) => {
              const pid = getLinkSourceId(l);
              const e = partnerMap.get(pid) || {
                partnerId: pid,
                inVol: 0,
                outVol: 0,
              };
              e.inVol += l.weight;
              partnerMap.set(pid, e);
            });
    
            const partners = Array.from(partnerMap.values())
              .map((p) => ({
                ...p,
                total: p.inVol + p.outVol,
                net: p.outVol - p.inVol,
                statnaam: getStatnaam(p.partnerId),
                community: (allNodes.find((n) => n.id === p.partnerId) || {})
                  .community,
              }))
              .sort((a, b) => b.total - a.total);
    
            const partnerIds = new Set(partners.map((p) => p.partnerId));
            const partnerCount = partnerIds.size;
            const reciprocalCount = partners.filter(
              (p) => p.inVol > 0 && p.outVol > 0,
            ).length;
    
            // Summary line (plus view-specific info)
            const fmt = d3.format(",.0f");
            let summaryHTML = `
                      <div><strong>[${focalId}]</strong> ${selectedNodeData.statnaam || ""}</div>
                      <div>
                      <span style="color:${FOCUS_OUT_COLOR}; font-weight:600;">Out:</span> ${fmt(totalOut)}
                      &nbsp; <span style="color:${FOCUS_IN_COLOR}; font-weight:600;">In:</span> ${fmt(totalIn)}
                      &nbsp; <span style="opacity:0.85;">Net:</span> ${fmt(totalOut - totalIn)}
                      </div>
                      <div style="opacity:0.85;">
                      Partners: ${partnerCount}
                      &nbsp; Reciprocity: ${reciprocalCount}${partnerCount ? ` (${Math.round((100 * reciprocalCount) / partnerCount)}%)` : ""}
                      &nbsp; Self-loop: ${fmt(selfLoopVol)}
                      </div>
                  `;
    
            // Extra summary per view
            if (selectedView === "partnerBalance" && partners.length) {
              const topOut = partners.reduce(
                (best, p) => (p.outVol > (best?.outVol || 0) ? p : best),
                null,
              );
              const topIn = partners.reduce(
                (best, p) => (p.inVol > (best?.inVol || 0) ? p : best),
                null,
              );
              const outShare =
                topOut && totalOut
                  ? Math.round((100 * topOut.outVol) / totalOut)
                  : 0;
              const inShare =
                topIn && totalIn ? Math.round((100 * topIn.inVol) / totalIn) : 0;
              summaryHTML += `
                      <div style="opacity:0.85;">
                          Top share — Out: ${outShare}% (${topOut ? topOut.partnerId : "-"}) · In: ${inShare}% (${topIn ? topIn.partnerId : "-"})
                      </div>`;
            }
    
            if (
              selectedView === "communityMix" &&
              selectedNodeData.community !== undefined
            ) {
              const focalComm = selectedNodeData.community;
              const outWithin = d3.sum(outgoing, (l) => {
                const tid = getLinkTargetId(l);
                const tNode = allNodes.find((n) => n.id === tid);
                return tNode && tNode.community === focalComm ? l.weight : 0;
              });
              const inWithin = d3.sum(incoming, (l) => {
                const sid = getLinkSourceId(l);
                const sNode = allNodes.find((n) => n.id === sid);
                return sNode && sNode.community === focalComm ? l.weight : 0;
              });
              const outWithinPct = totalOut
                ? Math.round((100 * outWithin) / totalOut)
                : 0;
              const inWithinPct = totalIn
                ? Math.round((100 * inWithin) / totalIn)
                : 0;
    
              summaryHTML += `
                      <div style="opacity:0.85;">
                          Within-community share — Out: ${outWithinPct}% · In: ${inWithinPct}%
                      </div>`;
            }
    
            // Commit summary now
            const sumDiv = document.getElementById("tradeNodeInsightSummary");
            if (sumDiv) sumDiv.innerHTML = summaryHTML;
    
            // Prepare SVG
            const container = d3.select("#tradeNodeInsight");
            const containerNode = container.node();
            if (!containerNode) return;
    
            let phSvg = container.select("svg.trade-nodeinsight-svg");
            if (phSvg.empty()) {
              phSvg = container
                .append("svg")
                .attr("class", "trade-nodeinsight-svg");
            }
    
            phSvg
              .attr("width", containerNode.clientWidth)
              .attr("height", containerNode.clientHeight);
            if (phSvg.classed("simulation-nodeinsight-svg")) {
              phSvg.selectAll("*").interrupt().remove();
              phSvg
                .attr("data-simulation-view", null)
                .classed("simulation-nodeinsight-svg", false);
            }
    
            // Compute top offset from overlay UI
            const labelNode = container.select(".trade-nodeinsight-label").node();
            const controlsNode = document.getElementById(
              "tradeNodeInsightControls",
            );
            const summaryNode = document.getElementById("tradeNodeInsightSummary");
    
            const overlayH =
              (labelNode ? labelNode.getBoundingClientRect().height : 0) +
              (controlsNode ? controlsNode.getBoundingClientRect().height : 0) +
              (summaryNode ? summaryNode.getBoundingClientRect().height : 0) +
              22;
    
            const margin = {
              top: Math.max(overlayH, 90),
              right: 22,
              bottom: 32,
              left: 50,
            };
    
            const width = Math.max(
              10,
              containerNode.clientWidth - margin.left - margin.right,
            );
            const height = Math.max(
              10,
              containerNode.clientHeight - margin.top - margin.bottom,
            );
    
            let g = phSvg.select("g.plotGroup");
            if (g.empty()) g = phSvg.append("g").attr("class", "plotGroup");
            g.attr("transform", `translate(${margin.left},${margin.top})`);
    
            // One named transition
            const t = phSvg
              .transition("tradeNodeInsight")
              .duration(450)
              .ease(d3.easeCubicOut);
    
            // Persistent layers
            const layerPartner = g
              .selectAll("g.layer-partner")
              .data([null])
              .join("g")
              .attr("class", "layer-partner");
    
            const layerDistance = g
              .selectAll("g.layer-distance")
              .data([null])
              .join("g")
              .attr("class", "layer-distance");
    
            const layerCommunity = g
              .selectAll("g.layer-community")
              .data([null])
              .join("g")
              .attr("class", "layer-community");
    
            // Fade between views
            layerPartner
              .transition(t)
              .style("opacity", selectedView === "partnerBalance" ? 1 : 0)
              .on("end", () =>
                layerPartner.style(
                  "pointer-events",
                  selectedView === "partnerBalance" ? "all" : "none",
                ),
              );
    
            layerDistance
              .transition(t)
              .style("opacity", selectedView === "distanceProfile" ? 1 : 0)
              .on("end", () =>
                layerDistance.style(
                  "pointer-events",
                  selectedView === "distanceProfile" ? "all" : "none",
                ),
              );
    
            layerCommunity
              .transition(t)
              .style("opacity", selectedView === "communityMix" ? 1 : 0)
              .on("end", () =>
                layerCommunity.style(
                  "pointer-events",
                  selectedView === "communityMix" ? "all" : "none",
                ),
              );
    
            // Update the active layer with joined elements + transitions
            if (selectedView === "partnerBalance") {
              updatePartnerBalance(
                layerPartner,
                width,
                height,
                partners.slice(0, 8),
                t,
              );
            } else if (selectedView === "distanceProfile") {
              updateDistanceProfile(
                layerDistance,
                width,
                height,
                outgoing,
                incoming,
                focalId,
                t,
              );
            } else if (selectedView === "communityMix") {
              updateCommunityMix(
                layerCommunity,
                width,
                height,
                outgoing,
                incoming,
                t,
              );
            }
          }
    
          function updatePartnerBalance(g, width, height, data, t) {
            // Empty-state message
            const empty = g
              .selectAll("text.empty")
              .data(data.length ? [] : ["No active trades for this node."]);
            empty.join(
              (enter) =>
                enter
                  .append("text")
                  .attr("class", "empty")
                  .attr("x", width / 2)
                  .attr("y", height / 2)
                  .attr("text-anchor", "middle")
                  .attr("dominant-baseline", "middle")
                  .attr("fill", "rgba(255,255,255,0.7)")
                  .style("font-size", "12px")
                  .style("opacity", 0)
                  .text((d) => d)
                  .call((sel) => sel.transition(t).style("opacity", 1)),
              (update) => update.text((d) => d),
              (exit) => exit.transition(t).style("opacity", 0).remove(),
            );
            if (!data.length) return;
    
            const maxSide = d3.max(data, (d) => Math.max(d.inVol, d.outVol)) || 1;
            const x = d3
              .scaleLinear()
              .domain([-maxSide, maxSide])
              .range([0, width])
              .nice();
            const y = d3
              .scaleBand()
              .domain(data.map((d) => d.partnerId))
              .range([0, height])
              .padding(0.18);
    
            // Center line (persistent)
            g.selectAll("line.center")
              .data([null])
              .join("line")
              .attr("class", "center")
              .attr("stroke", "rgba(255,255,255,0.6)")
              .transition(t)
              .attr("x1", x(0))
              .attr("x2", x(0))
              .attr("y1", 0)
              .attr("y2", height);
    
            // Incoming bars (keyed by partnerId)
            g.selectAll("rect.in")
              .data(data, (d) => d.partnerId)
              .join(
                (enter) =>
                  enter
                    .append("rect")
                    .attr("class", "in")
                    .attr("y", (d) => y(d.partnerId))
                    .attr("height", y.bandwidth())
                    .attr("fill", FOCUS_IN_COLOR)
                    .attr("opacity", 0.85)
                    // start collapsed at center
                    .attr("x", x(0))
                    .attr("width", 0)
                    .call((sel) =>
                      sel
                        .transition(t)
                        .attr("x", (d) => x(-d.inVol))
                        .attr("width", (d) => x(0) - x(-d.inVol)),
                    ),
                (update) =>
                  update.call((sel) =>
                    sel
                      .transition(t)
                      .attr("y", (d) => y(d.partnerId))
                      .attr("height", y.bandwidth())
                      .attr("x", (d) => x(-d.inVol))
                      .attr("width", (d) => x(0) - x(-d.inVol)),
                  ),
                (exit) =>
                  exit.call((sel) =>
                    sel.transition(t).attr("x", x(0)).attr("width", 0).remove(),
                  ),
              );
    
            // Outgoing bars
            g.selectAll("rect.out")
              .data(data, (d) => d.partnerId)
              .join(
                (enter) =>
                  enter
                    .append("rect")
                    .attr("class", "out")
                    .attr("y", (d) => y(d.partnerId))
                    .attr("height", y.bandwidth())
                    .attr("fill", FOCUS_OUT_COLOR)
                    .attr("opacity", 0.85)
                    .attr("x", x(0))
                    .attr("width", 0)
                    .call((sel) =>
                      sel
                        .transition(t)
                        .attr("x", x(0))
                        .attr("width", (d) => x(d.outVol) - x(0)),
                    ),
                (update) =>
                  update.call((sel) =>
                    sel
                      .transition(t)
                      .attr("y", (d) => y(d.partnerId))
                      .attr("height", y.bandwidth())
                      .attr("x", x(0))
                      .attr("width", (d) => x(d.outVol) - x(0)),
                  ),
                (exit) =>
                  exit.call((sel) => sel.transition(t).attr("width", 0).remove()),
              );
    
            // Labels (move with y-scale changes)
            const labels = g
              .selectAll("text.partner")
              .data(data, (d) => d.partnerId)
              .join(
                (enter) =>
                  enter
                    .append("text")
                    .attr("class", "partner")
                    .attr("x", -8)
                    .attr("text-anchor", "end")
                    .attr("fill", "white")
                    .style("font-size", "10px")
                    .style("opacity", 0)
                    .attr("y", (d) => y(d.partnerId) + y.bandwidth() / 2)
                    .attr("dy", "0.35em")
                    .text((d) => d.partnerId),
                (update) => update,
                (exit) => exit.transition(t).style("opacity", 0).remove(),
              );
    
            // IMPORTANT: apply opacity=1 to BOTH enter+update (fixes “stuck at 0”)
            labels
              .transition(t)
              .style("opacity", 1)
              .attr("y", (d) => y(d.partnerId) + y.bandwidth() / 2)
              .text((d) => d.partnerId);
    
            // Axis
            const axis = d3.axisBottom(x).ticks(3).tickFormat(d3.format(".2s"));
            g.selectAll("g.x-axis")
              .data([null])
              .join("g")
              .attr("class", "x-axis")
              .transition(t)
              .attr("transform", `translate(0,${height})`)
              .call(axis);
    
            g.selectAll("g.x-axis text")
              .attr("fill", "white")
              .style("font-size", "10px");
            g.selectAll("g.x-axis path, g.x-axis line").attr(
              "stroke",
              "rgba(255,255,255,0.35)",
            );
          }
    
          function updateDistanceProfile(
            g,
            width,
            height,
            outgoing,
            incoming,
            focalId,
            t,
          ) {
            // Fallback transition (in case caller passes nothing)
            const tr =
              t ||
              g
                .transition("tradeNodeInsight-distance")
                .duration(450)
                .ease(d3.easeCubicOut);
    
            // Helpers
            function weightedQuantile(values, weights, q) {
              const pairs = values
                .map((v, i) => ({ v, w: Math.max(0, weights[i] || 0) }))
                .filter((d) => isFinite(d.v) && d.w > 0)
                .sort((a, b) => a.v - b.v);
    
              const totalW = d3.sum(pairs, (d) => d.w);
              if (!totalW) return null;
    
              const threshold = q * totalW;
              let cum = 0;
              for (const p of pairs) {
                cum += p.w;
                if (cum >= threshold) return p.v;
              }
              return pairs[pairs.length - 1].v;
            }
    
            function tweenPathD(newD) {
              return function () {
                const oldD = this.getAttribute("d") || "";
                // If first render, don't try to morph from empty string
                const from = oldD.length ? oldD : newD;
                return d3.interpolateString(from, newD);
              };
            }
    
            function showEmpty(msg) {
              // Fade in/out empty-state message
              g.selectAll("text.distance-empty")
                .data([msg])
                .join(
                  (enter) =>
                    enter
                      .append("text")
                      .attr("class", "distance-empty")
                      .attr("x", width / 2)
                      .attr("y", height / 2)
                      .attr("text-anchor", "middle")
                      .attr("dominant-baseline", "middle")
                      .attr("fill", "rgba(255,255,255,0.7)")
                      .style("font-size", "12px")
                      .style("opacity", 0)
                      .text((d) => d)
                      .call((sel) => sel.transition(tr).style("opacity", 1)),
                  (update) => update.text((d) => d),
                  (exit) => exit.transition(tr).style("opacity", 0).remove(),
                );
    
              // Also fade out any existing plot elements
              g.selectAll(
                "path.distance, line.distance, g.distance-axis-container, g.x-axis, g.y-axis",
              )
                .transition(tr)
                .style("opacity", 0);
            }
    
            // Ensure plot groups exist (persistent)
            const plot = g
              .selectAll("g.distance-plot")
              .data([null])
              .join("g")
              .attr("class", "distance-plot");
    
            const axisG = plot
              .selectAll("g.distance-axis-container")
              .data([null])
              .join("g")
              .attr("class", "distance-axis-container")
              .style("opacity", 1);
    
            const pathsG = plot
              .selectAll("g.distance-paths")
              .data([null])
              .join("g")
              .attr("class", "distance-paths")
              .style("opacity", 1);
    
            const mediansG = plot
              .selectAll("g.distance-medians")
              .data([null])
              .join("g")
              .attr("class", "distance-medians")
              .style("opacity", 1);
    
            // Clear empty message if any (by joining to empty)
            g.selectAll("text.distance-empty")
              .data([])
              .join(
                (enter) => enter,
                (update) => update,
                (exit) => exit.transition(tr).style("opacity", 0).remove(),
              );
    
            // Data prep
            const focalCoords = getCoordinatesForStatcode(focalId);
            if (!focalCoords) {
              showEmpty("No coordinates for focal node.");
              return;
            }
    
            const outPts = [];
            for (const l of outgoing) {
              const tid = getLinkTargetId(l);
              const c = getCoordinatesForStatcode(tid);
              if (!c) continue;
              const dist = computeDistance(focalCoords, c);
              if (isFinite(dist)) outPts.push({ dist, w: l.weight });
            }
    
            const inPts = [];
            for (const l of incoming) {
              const sid = getLinkSourceId(l);
              const c = getCoordinatesForStatcode(sid);
              if (!c) continue;
              const dist = computeDistance(focalCoords, c);
              if (isFinite(dist)) inPts.push({ dist, w: l.weight });
            }
    
            if (!outPts.length && !inPts.length) {
              showEmpty("No distance data available.");
              return;
            }
    
            // Binning
            const maxDist = Math.max(
              d3.max(outPts, (d) => d.dist) || 0,
              d3.max(inPts, (d) => d.dist) || 0,
            );
    
            // Keep xMax stable-ish: clamp to a reasonable display range
            const xMax = Math.max(50, Math.min(380, Math.ceil(maxDist / 25) * 25));
    
            const binCount = 12;
            const binSize = xMax / binCount;
    
            const bins = d3.range(binCount).map((i) => ({
              x0: i * binSize,
              x1: (i + 1) * binSize,
              out: 0,
              in: 0,
            }));
    
            for (const p of outPts) {
              const idx = Math.min(
                binCount - 1,
                Math.max(0, Math.floor(p.dist / binSize)),
              );
              bins[idx].out += p.w;
            }
            for (const p of inPts) {
              const idx = Math.min(
                binCount - 1,
                Math.max(0, Math.floor(p.dist / binSize)),
              );
              bins[idx].in += p.w;
            }
    
            const yMax = d3.max(bins, (b) => Math.max(b.out, b.in)) || 1;
    
            // Scales
            const x = d3.scaleLinear().domain([0, xMax]).range([0, width]);
            const y = d3.scaleLinear().domain([0, yMax]).range([height, 0]).nice();
    
            const outSeries = bins.map((b) => ({ x: (b.x0 + b.x1) / 2, y: b.out }));
            const inSeries = bins.map((b) => ({ x: (b.x0 + b.x1) / 2, y: b.in }));
    
            const area = d3
              .area()
              .x((d) => x(d.x))
              .y0(height)
              .y1((d) => y(d.y))
              .curve(d3.curveMonotoneX);
    
            const line = d3
              .line()
              .x((d) => x(d.x))
              .y((d) => y(d.y))
              .curve(d3.curveMonotoneX);
    
            // Update paths with transitions
            // In area
            pathsG
              .selectAll("path.in-area")
              .data([inSeries])
              .join((enter) =>
                enter
                  .append("path")
                  .attr("class", "distance in-area")
                  .attr("fill", FOCUS_IN_COLOR)
                  .attr("fill-opacity", 0.18)
                  .attr("d", area(inSeries)),
              )
              .transition(tr)
              .attrTween("d", tweenPathD(area(inSeries)))
              .style("opacity", 1);
    
            // Out area
            pathsG
              .selectAll("path.out-area")
              .data([outSeries])
              .join((enter) =>
                enter
                  .append("path")
                  .attr("class", "distance out-area")
                  .attr("fill", FOCUS_OUT_COLOR)
                  .attr("fill-opacity", 0.14)
                  .attr("d", area(outSeries)),
              )
              .transition(tr)
              .attrTween("d", tweenPathD(area(outSeries)))
              .style("opacity", 1);
    
            // In line
            pathsG
              .selectAll("path.in-line")
              .data([inSeries])
              .join((enter) =>
                enter
                  .append("path")
                  .attr("class", "distance in-line")
                  .attr("fill", "none")
                  .attr("stroke", FOCUS_IN_COLOR)
                  .attr("stroke-width", 2)
                  .attr("d", line(inSeries)),
              )
              .transition(tr)
              .attrTween("d", tweenPathD(line(inSeries)))
              .style("opacity", 1);
    
            // Out line
            pathsG
              .selectAll("path.out-line")
              .data([outSeries])
              .join((enter) =>
                enter
                  .append("path")
                  .attr("class", "distance out-line")
                  .attr("fill", "none")
                  .attr("stroke", FOCUS_OUT_COLOR)
                  .attr("stroke-width", 2)
                  .attr("d", line(outSeries)),
              )
              .transition(tr)
              .attrTween("d", tweenPathD(line(outSeries)))
              .style("opacity", 1);
    
            // Axes (persistent groups)
            const xAxis = d3
              .axisBottom(x)
              .ticks(4)
              .tickFormat((d) => `${d}km`);
    
            const yAxis = d3.axisLeft(y).ticks(3).tickFormat(d3.format(".2s"));
    
            const xAxisG = axisG
              .selectAll("g.x-axis")
              .data([null])
              .join("g")
              .attr("class", "x-axis");
    
            xAxisG.attr("transform", `translate(0,${height})`);
    
            // Animate ticks
            xAxisG.transition(tr).call(xAxis);
    
            const yAxisG = axisG
              .selectAll("g.y-axis")
              .data([null])
              .join("g")
              .attr("class", "y-axis");
    
            yAxisG.transition(tr).call(yAxis);
    
            // Style axis elements
            axisG
              .selectAll("text")
              .attr("fill", "white")
              .style("font-size", "10px");
            axisG.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.35)");
    
            // Weighted medians
            const outMed = weightedQuantile(
              outPts.map((d) => d.dist),
              outPts.map((d) => d.w),
              0.5,
            );
            const inMed = weightedQuantile(
              inPts.map((d) => d.dist),
              inPts.map((d) => d.w),
              0.5,
            );
    
            const medianData = [
              { k: "in", v: inMed, c: FOCUS_IN_COLOR },
              { k: "out", v: outMed, c: FOCUS_OUT_COLOR },
            ].filter((d) => d.v != null);
    
            mediansG
              .selectAll("line.median")
              .data(medianData, (d) => d.k)
              .join(
                (enter) =>
                  enter
                    .append("line")
                    .attr("class", "distance median")
                    .attr("y1", 0)
                    .attr("y2", height)
                    .attr("stroke", (d) => d.c)
                    .attr("stroke-dasharray", "4,3")
                    .attr("opacity", 0)
                    // start from x=0 then slide
                    .attr("x1", x(0))
                    .attr("x2", x(0))
                    .call((sel) =>
                      sel
                        .transition(tr)
                        .attr("opacity", 0.7)
                        .attr("x1", (d) => x(d.v))
                        .attr("x2", (d) => x(d.v)),
                    ),
                (update) =>
                  update.call((sel) =>
                    sel
                      .transition(tr)
                      .attr("y2", height)
                      .attr("stroke", (d) => d.c)
                      .attr("opacity", 0.7)
                      .attr("x1", (d) => x(d.v))
                      .attr("x2", (d) => x(d.v)),
                  ),
                (exit) => exit.transition(tr).attr("opacity", 0).remove(),
              );
    
            // Make sure plot stays visible
            plot
              .selectAll(
                "path.distance, line.distance, g.distance-axis-container, g.x-axis, g.y-axis",
              )
              .style("opacity", 1);
          }
    
          function updateCommunityMix(g, width, height, outgoing, incoming, t) {
            // Fallback transition (in case caller passes nothing)
            const tr =
              t ||
              g
                .transition("tradeNodeInsight-community")
                .duration(450)
                .ease(d3.easeCubicOut);
    
            // Helpers
            function showEmpty(msg) {
              // Fade in/out empty-state message
              g.selectAll("text.community-empty")
                .data([msg])
                .join(
                  (enter) =>
                    enter
                      .append("text")
                      .attr("class", "community-empty")
                      .attr("x", width / 2)
                      .attr("y", height / 2)
                      .attr("text-anchor", "middle")
                      .attr("dominant-baseline", "middle")
                      .attr("fill", "rgba(255,255,255,0.7)")
                      .style("font-size", "12px")
                      .style("opacity", 0)
                      .text((d) => d)
                      .call((sel) => sel.transition(tr).style("opacity", 1)),
                  (update) => update.text((d) => d),
                  (exit) => exit.transition(tr).style("opacity", 0).remove(),
                );
    
              // Also fade out any existing plot elements
              g.selectAll("rect.seg, text.row-label, g.community-legend")
                .transition(tr)
                .style("opacity", 0);
            }
    
            // Ensure plot groups exist (persistent)
            const plot = g
              .selectAll("g.community-plot")
              .data([null])
              .join("g")
              .attr("class", "community-plot");
    
            const barsG = plot
              .selectAll("g.community-bars")
              .data([null])
              .join("g")
              .attr("class", "community-bars")
              .style("opacity", 1);
    
            const legendG = plot
              .selectAll("g.community-legend")
              .data([null])
              .join("g")
              .attr("class", "community-legend")
              .style("opacity", 1);
    
            // Clear empty message if any (by joining to empty)
            g.selectAll("text.community-empty")
              .data([])
              .join(
                (enter) => enter,
                (update) => update,
                (exit) => exit.transition(tr).style("opacity", 0).remove(),
              );
    
            // Aggregate by community
            function getCommunity(id) {
              const node = allNodes.find((n) => n.id === id);
              return node && node.community !== undefined ? node.community : "NA";
            }
    
            const outByComm = new Map();
            for (const l of outgoing) {
              const comm = getCommunity(getLinkTargetId(l));
              outByComm.set(comm, (outByComm.get(comm) || 0) + l.weight);
            }
    
            const inByComm = new Map();
            for (const l of incoming) {
              const comm = getCommunity(getLinkSourceId(l));
              inByComm.set(comm, (inByComm.get(comm) || 0) + l.weight);
            }
    
            const totalOut = d3.sum(Array.from(outByComm.values()));
            const totalIn = d3.sum(Array.from(inByComm.values()));
    
            if (!totalOut && !totalIn) {
              showEmpty("No active trades for this node.");
              return;
            }
    
            // Consistent set of communities across both directions
            const comms = Array.from(
              new Set([...outByComm.keys(), ...inByComm.keys()]),
            );
    
            // Sort communities by total contribution (Out+In), descending
            const commOrder = comms
              .map((c) => ({
                comm: c,
                total: (outByComm.get(c) || 0) + (inByComm.get(c) || 0),
              }))
              .sort((a, b) => b.total - a.total)
              .map((d) => d.comm);
    
            // Layout parameters
            const barH = Math.min(18, Math.max(12, height / 5));
            const gap = 14;
            const outY = 0;
            const inY = outY + barH + gap;
    
            function commFill(c) {
              return c === "NA" ? "#888" : nodeColor(c);
            }
    
            function buildSegments(map, total, row, y) {
              let x0 = 0;
              const segs = [];
              for (const comm of commOrder) {
                const v = map.get(comm) || 0;
                const w = total ? (v / total) * width : 0;
                if (w <= 0) continue;
                segs.push({
                  key: `${row}-${comm}`,
                  row,
                  comm,
                  v,
                  x0,
                  w,
                  y,
                });
                x0 += w;
              }
              return segs;
            }
    
            const segs = [
              ...buildSegments(outByComm, totalOut, "out", outY),
              ...buildSegments(inByComm, totalIn, "in", inY),
            ];
    
            // Row labels (Out / In)
            barsG
              .selectAll("text.row-label")
              .data(
                [
                  { k: "out", label: "Out", y: outY + barH / 2 },
                  { k: "in", label: "In", y: inY + barH / 2 },
                ],
                (d) => d.k,
              )
              .join(
                (enter) =>
                  enter
                    .append("text")
                    .attr("class", "row-label")
                    .attr("x", -8)
                    .attr("text-anchor", "end")
                    .attr("fill", "white")
                    .style("font-size", "10px")
                    .style("opacity", 0)
                    .attr("y", (d) => d.y)
                    .attr("dy", "0.35em")
                    .text((d) => d.label)
                    .call((sel) => sel.transition(tr).style("opacity", 1)),
                (update) =>
                  update.call((sel) => sel.transition(tr).attr("y", (d) => d.y)),
                (exit) => exit.transition(tr).style("opacity", 0).remove(),
              );
    
            // Stacked segments (keyed by row-community)
            barsG
              .selectAll("rect.seg")
              .data(segs, (d) => d.key)
              .join(
                (enter) =>
                  enter
                    .append("rect")
                    .attr("class", "seg")
                    .attr("y", (d) => d.y)
                    .attr("height", barH)
                    .attr("x", (d) => d.x0)
                    .attr("width", 0)
                    .attr("opacity", 0.9)
                    .attr("fill", (d) => commFill(d.comm))
                    .each(function (d) {
                      // tooltip
                      d3.select(this)
                        .append("title")
                        .text(
                          `C${d.comm}: ${d.row === "out" ? "Out" : "In"} ${d.v}`,
                        );
                    })
                    .call((sel) =>
                      sel
                        .transition(tr)
                        .attr("x", (d) => d.x0)
                        .attr("width", (d) => d.w),
                    ),
                (update) =>
                  update
                    .attr("fill", (d) => commFill(d.comm))
                    .each(function (d) {
                      // update tooltip text
                      const tt = d3.select(this).select("title");
                      if (!tt.empty()) {
                        tt.text(
                          `C${d.comm}: ${d.row === "out" ? "Out" : "In"} ${d.v}`,
                        );
                      } else {
                        d3.select(this)
                          .append("title")
                          .text(
                            `C${d.comm}: ${d.row === "out" ? "Out" : "In"} ${d.v}`,
                          );
                      }
                    })
                    .call((sel) =>
                      sel
                        .transition(tr)
                        .attr("y", (d) => d.y)
                        .attr("height", barH)
                        .attr("x", (d) => d.x0)
                        .attr("width", (d) => d.w),
                    ),
                (exit) =>
                  exit.call((sel) => sel.transition(tr).attr("width", 0).remove()),
              );
    
            // Legend top 5 communities by total
            const grandTotal = totalOut + totalIn;
            const legendItems = commOrder
              .map((c) => ({
                comm: c,
                total: (outByComm.get(c) || 0) + (inByComm.get(c) || 0),
              }))
              .filter((d) => d.total > 0);
    
            // Cap by available height
            const legendY0 = inY + barH + 18;
            const maxRows = Math.max(0, Math.floor((height - legendY0) / 14));
            const legendToShow = legendItems.slice(
              0,
              Math.max(1, Math.min(5, maxRows || 5)),
            );
    
            const rows = legendG
              .selectAll("g.legend-row")
              .data(legendToShow, (d) => d.comm)
              .join(
                (enter) => {
                  const row = enter
                    .append("g")
                    .attr("class", "legend-row")
                    .style("opacity", 0);
    
                  row
                    .append("rect")
                    .attr("x", 0)
                    .attr("y", -10)
                    .attr("width", 10)
                    .attr("height", 10);
    
                  row
                    .append("text")
                    .attr("x", 14)
                    .attr("y", -1)
                    .attr("fill", "white")
                    .style("font-size", "10px");
    
                  return row;
                },
                (update) => update,
                (exit) => exit.transition(tr).style("opacity", 0).remove(),
              );
    
            // IMPORTANT: force opacity=1 for both enter+update
            rows
              .transition(tr)
              .style("opacity", 1)
              .attr("transform", (d, i) => `translate(0,${legendY0 + i * 14})`);
    
            rows
              .select("rect")
              .transition(tr)
              .attr("fill", (d) => commFill(d.comm));
    
            rows.select("text").text((d) => {
              const pct = grandTotal ? Math.round((100 * d.total) / grandTotal) : 0;
              return `C${d.comm}: ${pct}%`;
            });
    
            // Make sure plot stays visible
            plot
              .selectAll("rect.seg, text.row-label, g.community-legend")
              .style("opacity", 1);
          }
    
          function attachTradeCheckboxListeners() {
            // Header checkboxes toggle all trade checkboxes in that section.
            d3.selectAll(".trade-header-checkbox").on("change", function () {
              const section = this.dataset.section; // "outgoing" or "incoming"
              const checked = this.checked;
              // Toggle all individual checkboxes for that section.
              d3.selectAll(`.trade-checkbox[data-section='${section}']`).property(
                "checked",
                checked,
              );
    
              // For self-loops, update all self-loop checkboxes across both sections.
              d3.selectAll(".trade-checkbox")
                .filter(function () {
                  return this.dataset.source === this.dataset.target;
                })
                .property("checked", checked);
    
              updateNetwork();
              updateDonutCharts();
              updateNetworkStats((force = true));
              updateInOutArbos();
              updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
              debouncedUpdateHotspotMarks();
              computeSCCs();
              updateSCCs();
              updateAnnotationForNode(selectedNodeData, annotationGroup);
    
              // Update header checkbox state based on the current state of individuals.
              updateHeaderCheckboxes();
            });
    
            // Individual trade checkbox changes trigger a network update.
            d3.selectAll(".trade-checkbox").on("change", function () {
              const checkbox = this;
              const source = checkbox.dataset.source;
              const target = checkbox.dataset.target;
              const isEnabled = checkbox.checked;
              // If it's a self-loop (source equals target), update all self-loop checkboxes across both sections.
              if (source === target) {
                d3.selectAll(".trade-checkbox")
                  .filter(function () {
                    return (
                      this.dataset.source === source &&
                      this.dataset.target === target
                    );
                  })
                  .property("checked", isEnabled);
              }
              updateNetwork();
              updateDonutCharts();
              updateNetworkStats((force = true));
              updateInOutArbos();
              updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
              //updateHotspotLists();
              debouncedUpdateHotspotMarks();
              computeSCCs();
              updateSCCs();
              updateAnnotationForNode(selectedNodeData, annotationGroup);
    
              // Update header checkbox state for both sections.
              updateHeaderCheckboxes();
            });
          }
    
          // Helper function to update header checkbox states.
          function updateHeaderCheckboxes() {
            ["incoming", "outgoing"].forEach((section) => {
              // Select all individual checkboxes for the section.
              const checkboxes = d3
                .selectAll(`.trade-checkbox[data-section='${section}']`)
                .nodes();
              // If every individual checkbox is checked, then the header is checked.
              const allChecked = Array.from(checkboxes).every((cb) => cb.checked);
              d3.select(
                `.trade-header-checkbox[data-section='${section}']`,
              ).property("checked", allChecked);
            });
          }
    
          function updateNetwork(instant = false) {
            // Disable buttons and checkboxes during transitions.
            disableAllButtons();
            disableAllCheckboxes();
            clearHoveredLinkState();
            if (linkSelection) linkSelection.interrupt();
            if (nodeEnter) nodeEnter.interrupt();
            if (labelSelection) labelSelection.interrupt();
    
            // 1. Update link.disabled based on checkboxes.
            d3.selectAll(".trade-checkbox").each(function () {
              const checkbox = this;
              const source = checkbox.dataset.source;
              const target = checkbox.dataset.target;
              const isEnabled = checkbox.checked;
              allLinks.forEach((link) => {
                let s =
                  typeof link.source === "object" ? link.source.id : link.source;
                let t =
                  typeof link.target === "object" ? link.target.id : link.target;
                if (s === source && t === target) {
                  link.disabled = !isEnabled;
                }
              });
              // Update enabledLinks array to filter out disabled and zero-weight links.
              enabledLinks = allLinks.filter(
                (link) => !link.disabled && link.weight > 0,
              );
            });
    
            // 2. Update link attributes.
            // When computing the log scale, ignore zero-weight links.
            const validLinks = allLinks.filter((link) => link.weight > 0);
            const edgeExtent = d3.extent(validLinks, (d) => Math.log(d.weight));
            const edgeColor = d3
              .scaleSequential(
                isSimulationModeActive()
                  ? d3.interpolateYlOrRd
                  : d3.interpolateSpectral,
              )
              .domain(
                isSimulationModeActive()
                  ? [edgeExtent[0] ?? 0, edgeExtent[1] ?? 1]
                  : [edgeExtent[1] ?? 1, edgeExtent[0] ?? 0],
              );
    
            if (selectedNodeData) {
              // When a node is selected: highlight only links connected to that node and enabled.
              linkSelection.each(function (d) {
                const srcId = typeof d.source === "object" ? d.source.id : d.source;
                const tgtId = typeof d.target === "object" ? d.target.id : d.target;
                const relevant =
                  srcId === selectedNodeData.id || tgtId === selectedNodeData.id;
    
                // Also treat links with zero or negative weight as "disabled"
                if (d.disabled || !relevant || d.weight <= 0) {
                  if (instant) {
                    d3.select(this)
                      .style("opacity", 0)
                      .attr("opacity", null)
                      .attr("display", "none")
                      .attr("class", "link")
                      .attr("filter", null)
                      .attr("marker-end", null);
                  } else {
                    d3.select(this)
                      .interrupt()
                      .transition()
                      .duration(500)
                      .style("opacity", 0)
                      .attr("opacity", null)
                      .on("end", function () {
                        d3.select(this)
                          .attr("display", "none")
                          .attr("class", "link")
                          .attr("filter", null)
                          .attr("marker-end", null);
                      });
                  }
                } else {
                  const isSelf = srcId === tgtId;
                  const isOutgoing = srcId === selectedNodeData.id;
                  if (instant) {
                    d3.select(this)
                      .attr("display", "block")
                      .style("opacity", 1)
                      .attr("opacity", null)
                      .attr("class", isOutgoing ? "linkSelectOut" : "linkSelectIn")
                      .attr("stroke-width", 2)
                      .attr("filter", "url(#edgeGlow)")
                      .attr("marker-end", isSelf ? "url(#loop)" : "url(#arrow)");
                  } else {
                    d3.select(this)
                      .interrupt()
                      .attr("display", "block")
                      .transition()
                      .duration(500)
                      .style("opacity", 1)
                      .attr("opacity", null)
                      .on("start", function () {
                        d3.select(this)
                          .attr(
                            "class",
                            isOutgoing ? "linkSelectOut" : "linkSelectIn",
                          )
                          .attr("stroke-width", 2)
                          .attr("filter", "url(#edgeGlow)")
                          .attr(
                            "marker-end",
                            isSelf ? "url(#loop)" : "url(#arrow)",
                          );
                      });
                  }
                }
              });
            } else {
              // When no node is selected: show only enabled links with weight > 0.
              linkSelection.each(function (d) {
                if (d.disabled || d.weight <= 0) {
                  if (instant) {
                    d3.select(this)
                      .style("opacity", null)
                      .attr("opacity", null)
                      .attr("display", "none")
                      .attr("class", "link")
                      .attr("filter", null)
                      .attr("marker-end", null);
                  } else {
                    d3.select(this)
                      .interrupt()
                      .transition()
                      .duration(500)
                      .attr("opacity", 0)
                      .style("opacity", null)
                      .on("end", function () {
                        d3.select(this)
                          .attr("display", "none")
                          .attr("class", "link")
                          .attr("filter", null)
                          .attr("marker-end", null);
                      });
                  }
                } else {
                  if (instant) {
                    d3.select(this)
                      .attr("display", "block")
                      .style("opacity", null)
                      .attr("opacity", null)
                      .attr("class", "link")
                      .attr("stroke", edgeColor(Math.log(d.weight)))
                      .attr("stroke-width", Math.sqrt(d.weight))
                      .attr("filter", null)
                      .attr("marker-end", null);
                  } else {
                    d3.select(this)
                      .interrupt()
                      .attr("display", "block")
                      .transition()
                      .duration(500)
                      .style("opacity", null)
                      .attr("opacity", null)
                      .on("start", function (d) {
                        d3.select(this)
                          .attr("class", "link")
                          .attr("stroke", edgeColor(Math.log(d.weight)))
                          .attr("stroke-width", Math.sqrt(d.weight))
                          .attr("filter", null)
                          .attr("marker-end", null);
                      });
                  }
                }
              });
            }
    
            // 3. Update node/label positions only if in "graph" mode.
            if (currentMode === "graph") {
              if (instant) {
                nodeEnter.attr("transform", (d) => `translate(${d.x},${d.y})`);
                labelSelection
                  .attr("x", (d) => d.x)
                  .attr("y", (d) => d.y - (d.r + 13));
              } else {
                nodeEnter
                  .transition()
                  .duration(500)
                  .attr("transform", (d) => `translate(${d.x},${d.y})`);
                labelSelection
                  .transition()
                  .duration(500)
                  .attr("x", (d) => d.x)
                  .attr("y", (d) => d.y - (d.r + 13));
              }
            }
    
            // Re-enable buttons and checkboxes after transitions.
            applySimulationNodeStyles();

            if (instant) {
              enableAllButtons(isSwitchingCSV ? 550 : 0);
              enableAllCheckboxes(isSwitchingCSV ? 550 : 0);
            } else {
              enableAllButtons(550);
              enableAllCheckboxes(550);
            }
          }
    
          function updateTradeDistribution() {
            if (isSimulationModeActive() && simulationState.currentFrame) {
              renderSimulationSpatialPatternPanel();
              return;
            }
            if (selectedNodeData) {
              return; // Skip if a node is selected.
            }
            // Select container and set margins/dimensions.
            const container = d3.select("#tradeDistribution");
            const containerNode = container.node();
            const margin = { top: 60, right: 20, bottom: 13, left: 13 };
            const width = containerNode.clientWidth - margin.left - margin.right;
            const height = containerNode.clientHeight - margin.top - margin.bottom;
    
            // Create or update the SVG.
            let svg = container.select("svg");
            if (svg.empty()) {
              svg = container
                .append("svg")
                .attr("width", containerNode.clientWidth)
                .attr("height", containerNode.clientHeight);
              svg
                .append("g")
                .attr("class", "plotGroup")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            } else {
              svg
                .attr("width", containerNode.clientWidth)
                .attr("height", containerNode.clientHeight);
            }
            const g = svg.select("g.plotGroup");
    
            // Build tradeData from allLinks: Exclude self-loops.
            const tradeData = [];
            allLinks.forEach((link) => {
              if (link.weight > 0) {
                const sourceId =
                  typeof link.source === "object" ? link.source.id : link.source;
                const targetId =
                  typeof link.target === "object" ? link.target.id : link.target;
                if (sourceId === targetId) return; // Skip self-loops.
                const sourceNode = allNodes.find((n) => n.id === sourceId);
                const targetNode = allNodes.find((n) => n.id === targetId);
                if (!sourceNode || !targetNode) return;
                const sourceCoords = getCoordinatesForStatcode(sourceId);
                const targetCoords = getCoordinatesForStatcode(targetId);
                if (!sourceCoords || !targetCoords) return;
                const distance = computeDistance(sourceCoords, targetCoords);
                const massProduct = sourceNode.tradeTotal * targetNode.tradeTotal;
                tradeData.push({
                  sourceId,
                  targetId,
                  weight: link.weight,
                  distance,
                  massProduct,
                });
              }
            });
    
            // If no trade data available, display a message.
            if (tradeData.length === 0) {
              g.selectAll("*").remove();
              g.append("text")
                .text("No trade data available for gravity model analysis.")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle");
              return;
            }
    
            // X-scale: distance (log scale). Maximum is fixed at 380 (km).
            const xMin = d3.min(tradeData, (d) => d.distance);
            const xScale = d3
              .scaleLog()
              .domain([Math.max(1, xMin), 380])
              .range([0, width]);
            xScale.nice();
            xScale.domain([xScale.domain()[0], 380]);
    
            // Y-scale: trade weight (log scale).
            const yMin = d3.min(tradeData, (d) => d.weight);
            const yMax = d3.max(tradeData, (d) => d.weight);
            const yScale = d3
              .scaleLog()
              .domain([Math.max(1, yMin), yMax])
              .range([height, 0])
              .nice();
    
            // Circle size: massProduct.
            const massExtent = d3.extent(tradeData, (d) => d.massProduct);
            const sizeScale = d3.scaleSqrt().domain(massExtent).range([3, 10]);
    
            // Use same tick formatter as before.
            const tickFormat = d3.format("~s");
    
            // Vertical grid lines & x tick labels
            const xTicks = xScale.ticks(5, "~s").filter((d, i) => i % 2 === 0);
    
            // Vertical grid lines.
            const xGrid = g.selectAll(".x-grid").data(xTicks);
            xGrid
              .enter()
              .append("line")
              .attr("class", "x-grid")
              .merge(xGrid)
              .transition()
              .duration(750)
              .attr("x1", (d) => xScale(d))
              .attr("y1", 0)
              .attr("x2", (d) => xScale(d))
              .attr("y2", height)
              .attr("stroke", "lightgray")
              .attr("stroke-dasharray", "2,2");
            xGrid.exit().remove();
    
            // X tick labels at the bottom right of each vertical grid line.
            const xGridLabels = g.selectAll(".x-grid-label").data(xTicks);
            xGridLabels
              .enter()
              .append("text")
              .attr("class", "x-grid-label")
              .merge(xGridLabels)
              .transition()
              .duration(750)
              .attr("x", (d) => xScale(d) + 6) // slight offset to the right
              .attr("y", height - 3) // near the bottom of the grid line
              .attr("text-anchor", "start")
              .attr("fill", "gray")
              .style("font", "10px sans-serif")
              .text((d) => tickFormat(d));
            xGridLabels.exit().remove();
    
            // Horizontal grid lines & y tick labels
            const yTicks = yScale.ticks(5, "~s").filter((d, i) => i % 1 === 0);
            // Horizontal grid lines.
            const yGrid = g.selectAll(".y-grid").data(yTicks);
            yGrid
              .enter()
              .append("line")
              .attr("class", "y-grid")
              .merge(yGrid)
              .transition()
              .duration(750)
              .attr("x1", 0)
              .attr("y1", (d) => yScale(d))
              .attr("x2", width)
              .attr("y2", (d) => yScale(d))
              .attr("stroke", "lightgray")
              .attr("stroke-dasharray", "2,2");
            yGrid.exit().remove();
    
            // Y tick labels: placed below each grid line, starting at the left end (x = 0).
            const yGridLabels = g.selectAll(".y-grid-label").data(yTicks);
            yGridLabels
              .enter()
              .append("text")
              .attr("class", "y-grid-label")
              .merge(yGridLabels)
              .transition()
              .duration(750)
              .attr("x", 0)
              .attr("y", (d) => yScale(d) - 5) // slightly above the grid line
              .attr("text-anchor", "start")
              .attr("fill", "gray")
              .style("font", "10px sans-serif")
              .text((d) => tickFormat(d));
            yGridLabels.exit().remove();
    
            // Contour Plot Background
            // Compute density contours weighted by massProduct.
            const densityData = d3
              .contourDensity()
              .x((d) => xScale(d.distance))
              .y((d) => yScale(d.weight))
              .size([width, height])
              .bandwidth(30) // bandwith for kernel density estimation
              .thresholds(5) // threshold levels for contour lines
              .weight((d) => d.massProduct)(tradeData);
    
            // Create a sequential color scale for the density values.
            const maxDensity = d3.max(densityData, (d) => d.value);
            const colorScale = d3.scaleSequential(
              [0, maxDensity],
              d3.interpolateGreys,
            );
    
            // Insert or update the contour layer behind other elements.
            let contourLayer = g.select(".contour-layer");
            if (contourLayer.empty()) {
              contourLayer = g
                .insert("g", ":first-child")
                .attr("class", "contour-layer");
            }
            const contours = contourLayer.selectAll("path").data(densityData);
            contours
              .enter()
              .append("path")
              .merge(contours)
              .transition()
              .duration(750)
              .attr("d", d3.geoPath())
              .attr("fill", (d) => colorScale(d.value))
              .attr("stroke", "gray")
              .attr("opacity", 0.12);
            contours.exit().remove();
    
            contourLayer.lower(); // move to the bottom of the group
    
            // Update scatter points using the D3 update pattern
            const circles = g
              .selectAll(".trade-circle")
              .data(tradeData, (d) => d.sourceId + "-" + d.targetId);
            circles.exit().transition().duration(750).attr("r", 0).remove();
            circles
              .transition()
              .duration(750)
              .attr("cx", (d) => xScale(d.distance))
              .attr("cy", (d) => yScale(d.weight))
              .attr("r", (d) => sizeScale(d.massProduct));
            circles
              .enter()
              .append("circle")
              .attr("class", "trade-circle")
              .attr("cx", (d) => xScale(d.distance))
              .attr("cy", (d) => yScale(d.weight))
              .attr("r", 0)
              .attr("fill", (d) => {
                const sourceNode = allNodes.find((n) => n.id === d.sourceId);
                return sourceNode ? nodeColor(sourceNode.community) : "gray";
              })
              .attr("opacity", 0.7)
              .transition()
              .duration(750)
              .attr("r", (d) => sizeScale(d.massProduct));
    
            // Add tooltip on mouseover
            // Not working, placeholder here
    
            // Regression Trend Line
            const logData = tradeData.map((d) => ({
              logDistance: Math.log(d.distance),
              logWeight: Math.log(d.weight),
              w: d.massProduct,
            }));
            const sumW = d3.sum(logData, (d) => d.w);
            const xBar = d3.sum(logData, (d) => d.w * d.logDistance) / sumW;
            const yBar = d3.sum(logData, (d) => d.w * d.logWeight) / sumW;
            const num = d3.sum(
              logData,
              (d) => d.w * (d.logDistance - xBar) * (d.logWeight - yBar),
            );
            const den = d3.sum(
              logData,
              (d) => d.w * Math.pow(d.logDistance - xBar, 2),
            );
            const slope = num / den;
            const intercept = yBar - slope * xBar;
            const xTrendMin = xScale.domain()[0] + 4;
            const xTrendMax = xScale.domain()[1] - 50;
            const yTrendMin = Math.exp(intercept + slope * Math.log(xTrendMin));
            const yTrendMax = Math.exp(intercept + slope * Math.log(xTrendMax));
            let trendLine = g.select(".trend-line");
            if (trendLine.empty()) {
              trendLine = g
                .append("line")
                .attr("class", "trend-line")
                .attr("stroke", "green")
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5,5");
            }
            trendLine
              .transition()
              .duration(750)
              .attr("x1", xScale(xTrendMin))
              .attr("y1", yScale(yTrendMin))
              .attr("x2", xScale(xTrendMax))
              .attr("y2", yScale(yTrendMax));
    
            // Axis Labeling
            let topLabel = svg.select(".top-label");
            if (topLabel.empty()) {
              topLabel = svg.append("g").attr("class", "top-label");
              topLabel
                .append("text")
                .attr("class", "distance-label")
                .attr("text-anchor", "middle")
                .attr("fill", "black")
                .style("font", "12px sans-serif")
                .text("Distance →");
            }
            topLabel.attr(
              "transform",
              `translate(${containerNode.clientWidth / 2}, ${margin.top / 2})`,
            );
            topLabel.select(".distance-label").attr("y", 20);
    
            // R² Display at Top Right
            const ssTot = d3.sum(
              logData,
              (d) => d.w * Math.pow(d.logWeight - yBar, 2),
            );
            const ssRes = d3.sum(
              logData,
              (d) =>
                d.w *
                Math.pow(d.logWeight - (intercept + slope * d.logDistance), 2),
            );
            const rSquared = 1 - ssRes / ssTot;
            const rSquaredText = `R² = ${rSquared.toFixed(3)}`;
    
            // Create or update the text element.
            let r2Label = g.select(".r2-label");
            if (r2Label.empty()) {
              r2Label = g
                .append("text")
                .attr("class", "r2-label")
                .attr("text-anchor", "end")
                .attr("fill", "black")
                .style("font", "11px sans-serif");
            }
            r2Label.attr("x", width).attr("y", -10).text(rSquaredText);
    
            let rightLabel = svg.select(".right-label");
            if (rightLabel.empty()) {
              rightLabel = svg.append("g").attr("class", "right-label");
              rightLabel
                .append("text")
                .attr("class", "volume-label")
                .attr("text-anchor", "middle")
                .attr("fill", "black")
                .style("font", "12px sans-serif")
                .text("Volume →");
            }
            rightLabel.attr(
              "transform",
              `translate(${containerNode.clientWidth - margin.right / 2}, ${containerNode.clientHeight / 2})`,
            );
            rightLabel
              .select(".volume-label")
              .attr("transform", "rotate(-90)")
              .attr("x", 0)
              .attr("y", 0);
          }
    
          function updateNodeTradeDistribution() {
            if (isSimulationModeActive() && simulationState.currentFrame) {
              renderSimulationFocusTrajectory();
              return;
            }
            if (!selectedNodeData) return;
            precomputeAllTradeData();
            // Get focal node id from selectedNodeData (e.g., "CR01")
            const focalNodeId = selectedNodeData.id;
    
            // Retrieve precomputed trade records for this node.
            const tradeDataAll = window.precomputedTradeData[focalNodeId] || [];
            // Split into outgoing and incoming subsets.
            const outgoingData = tradeDataAll.filter((d) => d.type === "outgoing");
            const incomingData = tradeDataAll.filter((d) => d.type === "incoming");
    
            // Select container and set margins/dimensions.
            const container = d3.select("#tradeNodeDistribution");
            const containerNode = container.node();
            const margin = { top: 60, right: 20, bottom: 18, left: 13 };
            const width = containerNode.clientWidth - margin.left - margin.right;
            const height = containerNode.clientHeight - margin.top - margin.bottom;
    
            // Create or update the SVG.
            let svg = container.select("svg");
            if (svg.empty()) {
              svg = container
                .append("svg")
                .attr("width", containerNode.clientWidth)
                .attr("height", containerNode.clientHeight);
              svg
                .append("g")
                .attr("class", "plotGroup")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            } else {
              svg
                .attr("width", containerNode.clientWidth)
                .attr("height", containerNode.clientHeight);
            }
            const g = svg.select("g.plotGroup");
    
            // If no trade data is found, display a message.
            if (tradeDataAll.length === 0) {
              g.selectAll("*").remove();
              g.append("text")
                .text("No data available")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("fill", "gray")
                .attr("text-anchor", "middle")
                .style("font-style", "italic");
              return;
            }
    
            // Scales
            // X-scale: distance (log scale). Maximum is fixed at 380 km.
            const xMin = d3.min(tradeDataAll, (d) => d.distance);
            const xScale = d3
              .scaleLog()
              .domain([Math.max(1, xMin), 380])
              .range([0, width]);
            xScale.nice();
            xScale.domain([xScale.domain()[0], 380]);
    
            // Y-scale: trade weight (log scale).
            const yMin = d3.min(tradeDataAll, (d) => d.weight);
            const yMax = d3.max(tradeDataAll, (d) => d.weight);
            const yScale = d3
              .scaleLog()
              .domain([Math.max(1, yMin), yMax])
              .range([height, 0])
              .nice();
    
            // Circle size: massProduct.
            const massExtent = d3.extent(tradeDataAll, (d) => d.massProduct);
            const sizeScale = d3.scaleSqrt().domain(massExtent).range([3, 10]);
    
            // Colors for circles.
            const outgoingColor = "#46fa46"; // bright green
            const incomingColor = "#fcc67e"; // bright orange
    
            const tickFormat = d3.format("~s");
    
            // Vertical grid lines & x tick labels
            const xTicks = xScale.ticks(5, "~s").filter((d, i) => i % 2 === 0);
            const xGrid = g.selectAll(".x-grid").data(xTicks);
            xGrid
              .enter()
              .append("line")
              .attr("class", "x-grid")
              .merge(xGrid)
              .transition()
              .duration(750)
              .attr("x1", (d) => xScale(d))
              .attr("y1", 0)
              .attr("x2", (d) => xScale(d))
              .attr("y2", height)
              .attr("stroke", "white")
              .attr("stroke-dasharray", "2,2");
            xGrid.exit().remove();
    
            const xGridLabels = g.selectAll(".x-grid-label").data(xTicks);
            xGridLabels
              .enter()
              .append("text")
              .attr("class", "x-grid-label")
              .merge(xGridLabels)
              .transition()
              .duration(750)
              .attr("x", (d) => xScale(d) + 6)
              .attr("y", height - 3)
              .attr("text-anchor", "start")
              .attr("fill", "white")
              .style("font", "10px sans-serif")
              .text((d) => tickFormat(d));
            xGridLabels.exit().remove();
    
            // Horizontal grid lines & y tick labels
            const yTicks = yScale.ticks(2, "~s");
            const yGrid = g.selectAll(".y-grid").data(yTicks);
            yGrid
              .enter()
              .append("line")
              .attr("class", "y-grid")
              .merge(yGrid)
              .transition()
              .duration(750)
              .attr("x1", 0)
              .attr("y1", (d) => yScale(d))
              .attr("x2", width)
              .attr("y2", (d) => yScale(d))
              .attr("stroke", "white")
              .attr("stroke-dasharray", "2,2");
            yGrid.exit().remove();
    
            const yGridLabels = g.selectAll(".y-grid-label").data(yTicks);
            yGridLabels
              .enter()
              .append("text")
              .attr("class", "y-grid-label")
              .merge(yGridLabels)
              .transition()
              .duration(750)
              .attr("x", 0)
              .attr("y", (d) => yScale(d) - 5)
              .attr("text-anchor", "start")
              .attr("fill", "white")
              .style("font", "10px sans-serif")
              .text((d) => tickFormat(d));
            yGridLabels.exit().remove();
    
            // Contour Density Layers
            function updateContourLayer(data, groupClass, fillColor) {
              const densityData = d3
                .contourDensity()
                .x((d) => xScale(d.distance))
                .y((d) => yScale(d.weight))
                .size([width, height])
                .bandwidth(30)
                .thresholds(5)
                .weight((d) => d.massProduct)(data);
              let contourLayer = g.select(`.${groupClass}`);
              if (contourLayer.empty()) {
                contourLayer = g
                  .insert("g", ":first-child")
                  .attr("class", groupClass);
              }
              const paths = contourLayer.selectAll("path").data(densityData);
              paths
                .enter()
                .append("path")
                .merge(paths)
                .transition()
                .duration(750)
                .attr("d", d3.geoPath())
                .attr("fill", fillColor)
                .attr("stroke", "white")
                .attr("opacity", 0.12);
              paths.exit().remove();
              contourLayer.lower();
            }
    
            // Overall contour (fuchsia), outgoing (#46fa46) and incoming (#fcc67e).
            updateContourLayer(tradeDataAll, "contour-all", "fuchsia");
            if (outgoingData.length > 0) {
              updateContourLayer(outgoingData, "contour-outgoing", outgoingColor);
            }
            if (incomingData.length > 0) {
              updateContourLayer(incomingData, "contour-incoming", incomingColor);
            }
    
            // Update Scatter Points
            const sampledData =
              tradeDataAll.length > 200
                ? d3.shuffle(tradeDataAll).slice(0, 200)
                : tradeDataAll;
            const circles = g
              .selectAll(".trade-circle")
              .data(sampledData, (d) => d.sourceId + "-" + d.targetId);
            circles.exit().transition().duration(750).attr("r", 0).remove();
            circles
              .transition()
              .duration(750)
              .attr("cx", (d) => xScale(d.distance))
              .attr("cy", (d) => yScale(d.weight))
              .attr("r", (d) => sizeScale(d.massProduct))
              .attr("fill", (d) =>
                d.type === "outgoing" ? outgoingColor : incomingColor,
              );
            circles
              .enter()
              .append("circle")
              .attr("class", "trade-circle")
              .attr("cx", (d) => xScale(d.distance))
              .attr("cy", (d) => yScale(d.weight))
              .attr("r", 0)
              .attr("fill", (d) =>
                d.type === "outgoing" ? outgoingColor : incomingColor,
              )
              .attr("opacity", 0.7)
              .transition()
              .duration(750)
              .attr("r", (d) => sizeScale(d.massProduct));
    
            // Regression Lines & R² for Each Subset
            // Compute regression parameters for a data array.
            function computeRegression(data) {
              const logData = data.map((d) => ({
                logDistance: Math.log(d.distance),
                logWeight: Math.log(d.weight),
                w: d.massProduct,
              }));
              const sumW = d3.sum(logData, (d) => d.w);
              const xBar = d3.sum(logData, (d) => d.w * d.logDistance) / sumW;
              const yBar = d3.sum(logData, (d) => d.w * d.logWeight) / sumW;
              const num = d3.sum(
                logData,
                (d) => d.w * (d.logDistance - xBar) * (d.logWeight - yBar),
              );
              const den = d3.sum(
                logData,
                (d) => d.w * Math.pow(d.logDistance - xBar, 2),
              );
              const slope = num / den;
              const intercept = yBar - slope * xBar;
              // Use same trend limits based on xScale domain.
              const xTMin = xScale.domain()[0] + 4;
              const xTMax = xScale.domain()[1] - 50;
              const yTMin = Math.exp(intercept + slope * Math.log(xTMin));
              const yTMax = Math.exp(intercept + slope * Math.log(xTMax));
              return {
                slope,
                intercept,
                xTMin,
                xTMax,
                yTMin,
                yTMax,
                logData,
                xBar,
                yBar,
              };
            }
    
            // Helper to compute R² from a regression result.
            function computeRSquared(reg) {
              const ssTot = d3.sum(
                reg.logData,
                (d) => d.w * Math.pow(d.logWeight - reg.yBar, 2),
              );
              const ssRes = d3.sum(
                reg.logData,
                (d) =>
                  d.w *
                  Math.pow(
                    d.logWeight - (reg.intercept + reg.slope * d.logDistance),
                    2,
                  ),
              );
              return 1 - ssRes / ssTot;
            }
    
            // Regression Lines & R² for Each Subset
            // Compute regression for overall.
            const overallReg = computeRegression(tradeDataAll);
            let regLineAll = g.select(".regression-all");
            if (regLineAll.empty()) {
              regLineAll = g
                .append("line")
                .attr("class", "regression-all")
                .attr("stroke", "fuchsia")
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "5,5");
            }
            regLineAll
              .transition()
              .duration(750)
              .attr("x1", xScale(overallReg.xTMin))
              .attr("y1", yScale(overallReg.yTMin))
              .attr("x2", xScale(overallReg.xTMax))
              .attr("y2", yScale(overallReg.yTMax));
    
            // Compute regression for outgoing.
            let outgoingReg, regLineOut;
            if (outgoingData.length > 0) {
              outgoingReg = computeRegression(outgoingData);
              regLineOut = g.select(".regression-outgoing");
              if (regLineOut.empty()) {
                regLineOut = g
                  .append("line")
                  .attr("class", "regression-outgoing")
                  .attr("stroke", outgoingColor)
                  .attr("stroke-width", 2)
                  .attr("stroke-dasharray", "4,4");
              }
              regLineOut
                .transition()
                .duration(750)
                .attr("x1", xScale(outgoingReg.xTMin))
                .attr("y1", yScale(outgoingReg.yTMin))
                .attr("x2", xScale(outgoingReg.xTMax))
                .attr("y2", yScale(outgoingReg.yTMax));
            }
    
            // Compute regression for incoming.
            let incomingReg, regLineIn;
            if (incomingData.length > 0) {
              incomingReg = computeRegression(incomingData);
              regLineIn = g.select(".regression-incoming");
              if (regLineIn.empty()) {
                regLineIn = g
                  .append("line")
                  .attr("class", "regression-incoming")
                  .attr("stroke", incomingColor)
                  .attr("stroke-width", 2)
                  .attr("stroke-dasharray", "4,4");
              }
              regLineIn
                .transition()
                .duration(750)
                .attr("x1", xScale(incomingReg.xTMin))
                .attr("y1", yScale(incomingReg.yTMin))
                .attr("x2", xScale(incomingReg.xTMax))
                .attr("y2", yScale(incomingReg.yTMax));
            }
    
            // Compute R² values.
            const overallRSq = computeRSquared(overallReg);
            const outgoingRSq =
              outgoingData.length > 0 ? computeRSquared(outgoingReg) : null;
            const incomingRSq =
              incomingData.length > 0 ? computeRSquared(incomingReg) : null;
    
            // R² Display at Top Right
            // Use a single text element with three tspans.
            let r2Label = g.select(".r2-label");
            if (r2Label.empty()) {
              r2Label = g
                .append("text")
                .attr("class", "r2-label")
                .attr("text-anchor", "end")
                .attr("fill", "white")
                .style("font", "11px sans-serif");
            }
            // Clear previous content.
            r2Label.html("");
            r2Label.attr("x", width).attr("y", height - 50);
            r2Label
              .append("tspan")
              .attr("x", width)
              .attr("dy", "0em")
              .attr("fill", "fuchsia")
              .text("All: R² = " + overallRSq.toFixed(3));
            r2Label
              .append("tspan")
              .attr("x", width)
              .attr("dy", "1.2em")
              .attr("fill", outgoingColor)
              .text(
                "Out: R² = " +
                  (outgoingRSq !== null ? outgoingRSq.toFixed(3) : "NA"),
              );
            r2Label
              .append("tspan")
              .attr("x", width)
              .attr("dy", "1.2em")
              .attr("fill", incomingColor)
              .text(
                "In: R² = " +
                  (incomingRSq !== null ? incomingRSq.toFixed(3) : "NA"),
              );
    
            // Axis Labeling
            let topLabel = svg.select(".top-label");
            if (topLabel.empty()) {
              topLabel = svg.append("g").attr("class", "top-label");
              topLabel
                .append("text")
                .attr("class", "distance-label")
                .attr("text-anchor", "middle")
                .attr("fill", "white")
                .style("font", "12px sans-serif")
                .text("Distance →");
            }
            topLabel.attr(
              "transform",
              `translate(${containerNode.clientWidth / 2}, ${margin.top / 2})`,
            );
            topLabel.select(".distance-label").attr("y", 20);
    
            let rightLabel = svg.select(".right-label");
            if (rightLabel.empty()) {
              rightLabel = svg.append("g").attr("class", "right-label");
              rightLabel
                .append("text")
                .attr("class", "volume-label")
                .attr("text-anchor", "middle")
                .attr("fill", "white")
                .style("font", "12px sans-serif")
                .text("Volume →");
            }
            rightLabel.attr(
              "transform",
              `translate(${containerNode.clientWidth - margin.right / 2}, ${containerNode.clientHeight / 2})`,
            );
            rightLabel
              .select(".volume-label")
              .attr("transform", "rotate(-90)")
              .attr("x", 0)
              .attr("y", 0);
          }
    
          function updateTemporalNetwork() {
            isDoingTemporalUpdate = true;
            window.isDoingTemporalUpdate = true;
            let previousLinkIndex = hoveredLink ? hoveredLink.id : null;
            clearHoveredLinkState();
            d3.select("#radial-labels-container").selectAll("*").remove();
    
            let lastSelectedNodeIndex = null;
    
            // If a node is selected, clear the selection.
            if (selectedNodeData) {
              // Check if the id is null or undefined.
              if (
                selectedNodeData.id === null ||
                selectedNodeData.id === undefined
              ) {
                console.error("Selected node id is null or undefined.");
              }
              lastSelectedNodeIndex = selectedNodeData.id;
              clearSelection(true);
            }
    
            // Stop the current simulation.
            forceSim.stop();
    
            // Update simulation data.
            forceSim.nodes(allNodes);
            forceSim.force("link").links(nonZeroLinks);
            forceSim.alpha(1).restart();
    
            // Define a composite key function for links.
            const linkKey = (d) => {
              const s = typeof d.source === "object" ? d.source.id : d.source;
              const t = typeof d.target === "object" ? d.target.id : d.target;
              return s + "-" + t;
            };
    
            // DATA JOIN for links.
            const linksSelection = linkGroup
              .selectAll("path")
              .data(allLinks, linkKey);
    
            // EXIT: Transition out old links.
            linksSelection.exit().each(function (d) {
              const totalLength = this.getTotalLength();
              d3.select(this)
                .attr("stroke-dasharray", totalLength + " " + totalLength)
                .attr("stroke-dashoffset", 0)
                .transition()
                .duration(400)
                .attr("stroke-dashoffset", totalLength)
                .style("opacity", 0)
                .remove();
            });
    
            // ENTER: Create new links.
            const linksEnter = linksSelection
              .enter()
              .append("path")
              .attr("class", "link")
              .attr("stroke", (d) =>
                d.weight <= 0 ? "none" : edgeColor(Math.log(d.weight)),
              )
              .attr("stroke-width", (d) =>
                d.weight <= 0 ? 0 : Math.sqrt(d.weight),
              )
              .each(function (d) {
                const totalLength = this.getTotalLength();
                d3.select(this)
                  .attr("stroke-dasharray", totalLength + " " + totalLength)
                  .attr("stroke-dashoffset", totalLength);
              })
              .on("mouseenter", handleLinkMouseEnter)
              .on("mousemove", handleLinkMouseMove)
              .on("mouseleave", handleLinkMouseLeave);
    
            // MERGE and transition links.
            linkSelection = linksEnter.merge(linksSelection);
            linkSelection
              .interrupt()
              .attr("display", (d) => (d.weight > 0 ? "block" : "none"))
              .attr("class", "link")
              .attr("filter", null)
              .attr("marker-end", null)
              .attr("opacity", (d) => (d.weight > 0 ? null : 0))
              .style("opacity", null)
              .transition()
              .duration(400)
              .attr("stroke", (d) => {
                if (d.weight <= 0) return "none";
                if (selectedNodeData) {
                  const src = typeof d.source === "object" ? d.source.id : d.source;
                  return src === selectedNodeData.id ? "#46fa46" : "#fcc67e";
                } else {
                  return edgeColor(Math.log(d.weight));
                }
              })
              .attr("stroke-width", (d) =>
                d.weight <= 0 ? 0 : Math.sqrt(d.weight),
              )
              .attr("stroke-dashoffset", 0);
    
            // DATA JOIN for nodes.
            const nodesSelection = nodeGroup
              .selectAll("g.nodeGroup")
              .data(allNodes, (d) => d.id);
    
            // EXIT: Remove old nodes.
            nodesSelection
              .exit()
              .transition()
              .duration(400)
              .style("opacity", 0)
              .remove();
    
            // ENTER: Create new nodes.
            const nodesEnter = nodesSelection
              .enter()
              .append("g")
              .attr("class", "nodeGroup")
              .style("opacity", 0)
              .call(drag(forceSim))
              .on("click", debouncedOnClickNode)
              .on("mouseover", function (event, d) {
                hoveredNode = d;
                d3.select(this).select("circle.primary").attr("stroke", "black");
                updateAnnotationForNode(d, annotationGroup);
              })
              .on("mousemove", function (event, d) {
                if (hoveredNode === d) {
                  updateAnnotationForNode(d, annotationGroup);
                }
              })
              .on("mouseout", function (event, d) {
                hoveredNode = null;
                d3.select(this)
                  .select("circle.primary")
                  .attr("stroke", null)
                  .attr("stroke-width", null);
                annotationGroup.selectAll("*").remove();
              });
    
            // In the enter selection, build the node shapes.
            nodesEnter.each(function (d) {
              const nodeGroup = d3.select(this);
              // Always compute node radius so labels remain aligned.
              d.r = nodeSize(d.tradeTotal);
    
              if (d.active) {
                // Active nodes: use standard circles.
                nodeGroup
                  .append("circle")
                  .attr("class", "primary")
                  .attr("r", d.r)
                  .attr("fill", (d) => nodeColor(d.community))
                  .attr("stroke", null)
                  .attr("stroke-width", null);
              } else {
                // Inactive nodes: use a FontAwesome icon via foreignObject.
                const iconSize = d.r * 4; // Scale icon to match node size.
                const foreignObject = nodeGroup
                  .append("foreignObject")
                  .attr("class", "inactive-overlay")
                  .attr("width", iconSize)
                  .attr("height", iconSize)
                  .attr("x", -iconSize / 2)
                  .attr("y", -iconSize / 2);
    
                foreignObject
                  .append("xhtml:div")
                  .style("width", `${iconSize}px`)
                  .style("height", `${iconSize}px`)
                  .style("display", "flex")
                  .style("align-items", "center")
                  .style("justify-content", "center")
                  .style("font-size", `${iconSize * 0.7}px`)
                  .style("color", "gray")
                  .html('<i class="fa-solid fa-circle-xmark"></i>');
              }
            });
    
            // Append extra hotspot strokes based on topNMetric.
            nodesEnter.each(function (d) {
              let metricsForNode = [];
              metricNames.forEach((metric) => {
                // If this node is in the top-3 for the metric, add it.
                if (topNMetric[metric].includes(d.id)) {
                  metricsForNode.push(metric);
                }
              });
              metricsForNode.sort();
              let group = d3.select(this);
              metricsForNode.forEach((metric, i) => {
                group
                  .append("circle")
                  .attr("class", "hotspotStroke")
                  .attr("r", d.r + (i + 1) * 3) // each extra ring offset by 3px per metric
                  .attr("fill", "none")
                  .attr("stroke", hotspotColors[metric])
                  .attr("stroke-width", 2)
                  .attr("stroke-dashoffset", 0);
              });
            });
    
            // Append trade donut visualization for each node.
            nodesEnter.each(function (d) {
              // Compute self trade volume: sum of weights for links where source and target are the same.
              const selfVolume = d3.sum(
                allLinks.filter((link) => {
                  let src =
                    typeof link.source === "object" ? link.source.id : link.source;
                  let tgt =
                    typeof link.target === "object" ? link.target.id : link.target;
                  return src === d.id && tgt === d.id;
                }),
                (link) => link.weight,
              );
    
              // Compute external trade volume: sum of weights for links where source is d.id and target is not d.id.
              const otherVolume = d3.sum(
                allLinks.filter((link) => {
                  let src =
                    typeof link.source === "object" ? link.source.id : link.source;
                  let tgt =
                    typeof link.target === "object" ? link.target.id : link.target;
                  return src === d.id && tgt !== d.id;
                }),
                (link) => link.weight,
              );
    
              const totalVolume = selfVolume + otherVolume;
    
              // Only add the donut if there's any trade volume.
              if (totalVolume > 0) {
                // Define inner and outer radii for the donut relative to the node's radius.
                const innerRadius = d.r * 0.3;
                const outerRadius = d.r * 0.8;
    
                // Compute the fraction (and angle) of self trade.
                const selfFraction = selfVolume / totalVolume;
                const selfAngle = 2 * Math.PI * selfFraction;
    
                // Create an arc generator.
                const arc = d3
                  .arc()
                  .innerRadius(innerRadius)
                  .outerRadius(outerRadius);
    
                // Append a new group for the donut.
                const donutGroup = d3
                  .select(this)
                  .append("g")
                  .attr("class", "trade-donut")
                  .attr("transform", "translate(0,0)");
    
                // Append arc for self trade (e.g., orange).
                donutGroup
                  .append("path")
                  .attr("class", "donut-self")
                  .attr("d", arc({ startAngle: 0, endAngle: selfAngle }))
                  .attr("fill", "white")
                  .attr("opacity", 0.8);
    
                // Append arc for external trade (e.g., blue).
                donutGroup
                  .append("path")
                  .attr("class", "donut-other")
                  .attr("d", arc({ startAngle: selfAngle, endAngle: 2 * Math.PI }))
                  .attr("fill", "black")
                  .attr("opacity", 0.1);
              }
            });
    
            // Transition update for nodes.
            nodesSelection.transition().duration(400).style("opacity", 1);
    
            // MERGE enter and update nodes.
            nodeEnter = nodesEnter.merge(nodesSelection);
    
            // Recalculate node radius for all nodes (new and updated).
            nodeSize.domain(d3.extent(allNodes, (d) => d.tradeTotal));
            nodeColor.domain(d3.extent(allNodes, (d) => d.community));
    
            nodeEnter.each(function (d) {
              d.r = nodeSize(d.tradeTotal);
            });
    
            // Routinely re-render nodes
            nodeEnter.each(function (d) {
              const nodeGroup = d3.select(this);
              // Recompute radius from new tradeTotal.
              d.r = nodeSize(d.tradeTotal);
    
              // Select existing circle and foreignObject.
              let circleSel = nodeGroup.select("circle.primary");
              let foSel = nodeGroup.select("foreignObject.inactive-overlay");
    
              // If no circle exists, append one.
              if (circleSel.empty()) {
                nodeGroup
                  .append("circle")
                  .attr("class", "primary")
                  .attr("r", d.r)
                  .attr("fill", nodeColor(d.community))
                  .attr("stroke", null)
                  .attr("stroke-width", null)
                  // Initially hide the circle.
                  .style("opacity", 0);
                circleSel = nodeGroup.select("circle.primary");
              }
    
              // If no foreignObject exists, append one.
              if (foSel.empty()) {
                const iconSize = d.r * 4; // Scale icon to match node size.
                nodeGroup
                  .append("foreignObject")
                  .style("opacity", 0)
                  .attr("class", "inactive-overlay")
                  .attr("width", iconSize)
                  .attr("height", iconSize)
                  .attr("x", -iconSize / 2)
                  .attr("y", -iconSize / 2)
                  // Initially hide the foreignObject.
                  .style("opacity", 0)
                  .append("xhtml:div")
                  .style("width", iconSize + "px")
                  .style("height", iconSize + "px")
                  .style("display", "flex")
                  .style("align-items", "center")
                  .style("justify-content", "center")
                  .style("font-size", iconSize * 0.7 + "px")
                  .style("color", "gray")
                  .html('<i class="fa-solid fa-circle-xmark"></i>');
                foSel = nodeGroup.select("foreignObject.inactive-overlay");
              }
    
              // If tradeTotal > 0, fade in the circle and fade out the overlay.
              if (d.tradeTotal > 0) {
                circleSel
                  .transition()
                  .duration(200)
                  .style("opacity", 1)
                  .attr("r", d.r)
                  .attr("fill", nodeColor(d.community))
                  .attr("stroke", null)
                  .attr("stroke-width", null);
                foSel
                  .transition()
                  .duration(200)
                  .style("opacity", 0)
                  .on("end", function () {
                    d3.select(this).style("display", "none");
                  });
              } else {
                // Otherwise, fade out the circle and fade in the overlay.
                circleSel.transition().duration(200).style("opacity", 0);
                foSel
                  .style("display", "block")
                  .transition()
                  .duration(200)
                  .style("opacity", 1);
              }
            });
    
            // Raise the donut charts
            nodeEnter.selectAll(".trade-donut").raise();
    
            // DATA JOIN for labels.
            const labelsSelection = nodeGroup
              .selectAll("text.nodeLabel")
              .data(allNodes, (d) => d.id);
    
            labelsSelection
              .exit()
              .transition()
              .duration(400)
              .style("opacity", 0)
              .remove();
    
            const labelsEnter = labelsSelection
              .enter()
              .append("text")
              .attr("class", "nodeLabel")
              .attr("text-anchor", "middle")
              .style("opacity", 0)
              .text((d) => d.id);
    
            labelsEnter.transition().duration(400).style("opacity", 1);
    
            labelSelection = labelsEnter.merge(labelsSelection);
    
            // Restart simulation in graph mode.
            if (currentMode === "graph") {
              forceSim.alphaTarget(0.1).restart();
            } else {
              updateMapPositionsWithTransition(
                (instant = true),
                (recordOnly = true),
              );
            }
    
            // If previously hovered over a link, first check if it has zero weight.
            if (previousLinkIndex !== null) {
              const previousLink = allLinks.find((d) => d.id === previousLinkIndex);
              if (previousLink && previousLink.weight > 0) {
                hoveredLink = previousLink;
                updateAnnotationForLink(hoveredLink, annotationGroup);
              }
            }
    
            // Restore previsouly selected node if it still exists.
            if (lastSelectedNodeIndex) {
              const lastSelectedNode = allNodes.find(
                (d) => d.id === lastSelectedNodeIndex,
              );
              if (lastSelectedNode) {
                onClickNode("click", lastSelectedNode);
              }
            }
    
            // Force update annotation for hovered node.
            if (hoveredNode) {
              if (currentMode === "graph") {
                hoveredNode = null;
                updateAnnotationForNode(null, annotationGroup);
              } else {
                updateAnnotationForNode(hoveredNode, annotationGroup);
              }
            }

            if (isSimulationModeActive()) {
              applySimulationNodeStyles();
              renderSimulationPanels();
            }
    
            isDoingTemporalUpdate = false;
            window.isDoingTemporalUpdate = false;
          }
    
          function updateCurrentDateDisplay(dateObj) {
            // Display the current date widget
            const currendDateWidget = document.querySelector(
              ".current-date-widget",
            );
            if (currendDateWidget) {
              currendDateWidget.style.display = "block";
            } else {
              console.error("Current date widget not found.");
            }
    
            const dateLabelEl = document.querySelector(".current-date-label");
            if (dateLabelEl && currentTimeSpan) {
              // Switch condition according to current time span
              if (currentTimeSpan === "daily") {
                dateLabelEl.innerHTML = '<i class="fa-solid fa-calendar-day"></i>';
              } else if (currentTimeSpan === "weekly") {
                dateLabelEl.innerHTML = '<i class="fa-solid fa-calendar-week"></i>';
              } else if (currentTimeSpan === "monthly") {
                dateLabelEl.innerHTML = '<i class="fa-solid fa-calendar-days"></i>';
              } else if (currentTimeSpan === "yearly") {
                dateLabelEl.innerHTML =
                  '<i class="fa-regular fa-calendar-days"></i>';
              }
            }
    
            const dateValueEl = document.querySelector(".current-date-value");
            if (dateValueEl && dateObj) {
              if (currentTimeSpan === "daily") {
                dateValueEl.innerHTML = dateObj.toDateString();
              } else if (currentTimeSpan === "weekly") {
                dateValueEl.innerHTML = `Week ${dateObj.getWeekNumber()} of ${dateObj.getFullYear()}`;
              } else if (currentTimeSpan === "monthly") {
                let month = dateObj.toLocaleString("default", { month: "long" });
                // Capitalize first letter
                month = month.charAt(0).toUpperCase() + month.slice(1);
                dateValueEl.innerHTML = `${month} ${dateObj.getFullYear()}`;
              } else if (currentTimeSpan === "yearly") {
                dateValueEl.innerHTML = dateObj.getFullYear();
              }
            }
          }

          function updateCompartmentDonutCharts() {
            d3.selectAll(".nodeGroup").each(function (d) {
              const state = d.simulation;
              if (!state || !state.N) return;
              let donutGroup = d3.select(this).select("g.trade-donut");
              if (donutGroup.empty()) {
                donutGroup = d3
                  .select(this)
                  .append("g")
                  .attr("class", "trade-donut simulation-donut")
                  .attr("transform", "translate(0,0)");
              }
              donutGroup.classed("simulation-donut", true).style("display", "block");
              donutGroup.selectAll("path").remove();

              const innerRadius = d.r * 0.28;
              const outerRadius = d.r * 0.86;
              const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);
              let startAngle = 0;
              ["S", "E", "I", "R"].forEach((key) => {
                const share = state.N ? state[key] / state.N : 0;
                const endAngle = startAngle + 2 * Math.PI * share;
                donutGroup
                  .append("path")
                  .attr("class", `donut-compartment-${key}`)
                  .attr("d", arc({ startAngle, endAngle }))
                  .attr("fill", simulationCompartmentColors[key])
                  .attr("opacity", key === "S" ? 0.48 : 0.88);
                startAngle = endAngle;
              });
            });
          }
    
          function updateDonutCharts() {
            if (isSimulationModeActive()) {
              updateCompartmentDonutCharts();
              applySimulationNodeStyles();
              return;
            }

            // For each node group (each node)
            d3.selectAll(".nodeGroup").each(function (d) {
              // Filter enabled links that involve this node.
              const filteredLinks = enabledLinks.filter((link) => {
                const src =
                  typeof link.source === "object" ? link.source.id : link.source;
                // For this donut chart, consider outgoing trades for external volume
                // and self-loops for self trade.
                return src === d.id;
              });
    
              // Compute self trade volume: links where target is the same as the source.
              const selfVolume = d3.sum(
                filteredLinks.filter((link) => {
                  const tgt =
                    typeof link.target === "object" ? link.target.id : link.target;
                  return tgt === d.id;
                }),
                (link) => link.weight,
              );
    
              // Compute external trade volume: links where target is different.
              const otherVolume = d3.sum(
                filteredLinks.filter((link) => {
                  const tgt =
                    typeof link.target === "object" ? link.target.id : link.target;
                  return tgt !== d.id;
                }),
                (link) => link.weight,
              );
    
              const totalVolume = selfVolume + otherVolume;
    
              // Select (or create) the donut group inside the node group.
              let donutGroup = d3.select(this).select("g.trade-donut");
              if (!donutGroup.empty() && donutGroup.classed("simulation-donut")) {
                donutGroup.remove();
                donutGroup = d3.select(this).select("g.trade-donut");
              }
    
              if (totalVolume === 0) {
                if (!donutGroup.empty()) {
                  donutGroup
                    .transition()
                    .duration(400)
                    .style("opacity", 0)
                    .on("end", function () {
                      d3.select(this).style("display", "none");
                    });
                }
                return; // Exit early.
              } else {
                // If there is trade volume, make sure the donut group is visible.
                if (!donutGroup.empty()) {
                  donutGroup
                    .style("display", "block")
                    .transition()
                    .duration(400)
                    .style("opacity", 1);
                } else {
                  // Create a new donut group if it doesn't exist.
                  donutGroup = d3
                    .select(this)
                    .append("g")
                    .attr("class", "trade-donut")
                    .attr("transform", "translate(0,0)");
                  // Append two paths for the two segments.
                  donutGroup.append("path").attr("class", "donut-self");
                  donutGroup.append("path").attr("class", "donut-other");
                }
              }
    
              // Define radii for the donut relative to the node's radius.
              const innerRadius = d.r * 0.3;
              const outerRadius = d.r * 0.8;
    
              // Compute fraction of self-trade.
              const selfFraction = selfVolume / totalVolume;
              const selfAngle = 2 * Math.PI * selfFraction;
    
              // Create an arc generator.
              const arc = d3
                .arc()
                .innerRadius(innerRadius)
                .outerRadius(outerRadius);
    
              // Transition the self trade arc.
              donutGroup
                .select(".donut-self")
                .interrupt() // Cancel any ongoing transitions.
                .transition()
                .duration(400)
                .attrTween("d", function () {
                  const previous = d3.select(this).attr("data-arc")
                    ? JSON.parse(d3.select(this).attr("data-arc"))
                    : { startAngle: 0, endAngle: 0 };
                  const current = { startAngle: 0, endAngle: selfAngle };
                  d3.select(this).attr("data-arc", JSON.stringify(current));
                  const interpolate = d3.interpolate(previous, current);
                  return function (t) {
                    return arc(interpolate(t));
                  };
                })
                .attr("fill", "white")
                .attr("opacity", 0.8);
    
              // Transition the external trade arc.
              donutGroup
                .select(".donut-other")
                .interrupt() // Cancel any ongoing transitions.
                .transition()
                .duration(400)
                .attrTween("d", function () {
                  const previous = d3.select(this).attr("data-arc")
                    ? JSON.parse(d3.select(this).attr("data-arc"))
                    : { startAngle: selfAngle, endAngle: selfAngle };
                  const current = { startAngle: selfAngle, endAngle: 2 * Math.PI };
                  d3.select(this).attr("data-arc", JSON.stringify(current));
                  const interpolate = d3.interpolate(previous, current);
                  return function (t) {
                    return arc(interpolate(t));
                  };
                })
                .attr("fill", "black")
                .attr("opacity", 0.1);
            });
          }
    
          const debouncedUpdateHotspotMarks = debounce(
            updateHotspotMarks,
            200,
            false,
          );
    
          function updateHotspotMarks() {
            metricNames.forEach((metric) => {
              // Sort the keys (node IDs) of hotspots by descending metric value.
              topNMetric[metric] = Object.keys(hotspots)
                .sort((a, b) => hotspots[b][metric] - hotspots[a][metric])
                .slice(0, 3);
            });
            // Use all node groups, not only the initial enter selection.
            d3.selectAll(".nodeGroup").each(function (d) {
              let group = d3.select(this);
    
              // Compute the updated list of metrics (hotspots) for this node.
              let newMetrics = [];
              metricNames.forEach((metric) => {
                if (topNMetric[metric].includes(d.id)) {
                  newMetrics.push(metric);
                }
              });
              newMetrics.sort(); // ensure consistent order
    
              // Bind newMetrics to the existing hotspot stroke circles.
              let strokes = group
                .selectAll("circle.hotspotStroke")
                .data(newMetrics, (m) => m); // key is the metric
    
              // Remove any strokes that are no longer needed.
              strokes
                .exit()
                .interrupt()
                .transition()
                .duration(150)
                .attr("r", d.r) // shrink back to the node's radius
                .style("opacity", 0)
                .remove();
    
              // Update existing strokes: adjust radius and stroke color.
              strokes
                .interrupt()
                .transition()
                .duration(150)
                .attr("r", (m, i) => d.r + (i + 1) * 3)
                .attr("stroke", (m) => hotspotColors[m]);
    
              // Append new strokes for any newly added metrics.
              strokes
                .enter()
                .append("circle")
                .attr("class", "hotspotStroke")
                .attr("data-metric", (m) => m)
                .attr("fill", "none")
                .attr("stroke-width", 2)
                .attr("stroke-dashoffset", 0)
                .attr("stroke", (m) => hotspotColors[m])
                .attr("r", d.r) // start at the node's radius
                .style("opacity", 0)
                .transition()
                .duration(150)
                .style("opacity", 1)
                .attr("r", (m, i) => d.r + (i + 1) * 3);
            });
          }
    
          // Restore function: re-enable all links and update the trade panel checkboxes.
          function restoreLinks() {
            // Stop time replay by simulating a click on the pause button.
            playBtn = document.getElementById("playPauseBtn");
            const wasPlaying = window.isPlaying;
            if (wasPlaying) {
              playBtn.click();
            }
    
            // Buttons are already managed by updateNetwork().
            // Set all links to enabled.
            allLinks.forEach((link) => {
              link.disabled = false;
            });
    
            // Update enabledLinks array to filter out disabled and zero-weight links.
            enabledLinks = allLinks.filter(
              (link) => !link.disabled && link.weight > 0,
            );
    
            // Force all trade checkboxes to be checked.
            d3.selectAll(".trade-checkbox").property("checked", true);
            d3.selectAll(".trade-header-checkbox").property("checked", true);
    
            updateTradeTable();
            updateInOutArbos();
            updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
    
            // Update the network so that all links are shown.
            updateNetwork();
            updateDonutCharts();
            updateNetworkStats();
            //updateHotspotLists();
            debouncedUpdateHotspotMarks();
            computeSCCs();
            updateSCCs();
            updateAnnotationForNode(selectedNodeData, annotationGroup);
    
            // Even though updateNetwork() toggles checkbox states, we still need to mimic
            // this visual change here because updateTradeTable() above re-initializes the checkboxes.
            disableAllCheckboxes();
            enableAllCheckboxes(550);
    
            if (wasPlaying && !window.isPlaying) {
              playBtn.click();
            }
          }
    
          // Force Simulation Drag Handler
          function drag(simulation) {
            function dragstarted(event, d) {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            }
            function dragged(event, d) {
              d.fx = event.x;
              d.fy = event.y;
            }
            function dragended(event, d) {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            }
            return d3
              .drag()
              .on("start", dragstarted)
              .on("drag", dragged)
              .on("end", dragended);
          }
    
          // Functions to switch between graph and map mode
          function switchToMapMode(instant = false) {
            if (forceSim) forceSim.stop();
            if (!nlMapData) {
              console.error("Failed to load NL map data.");
              return;
            }
    
            // Stop time replay by simulating a click on the pause button.
            playBtn = document.getElementById("playPauseBtn");
            const wasPlaying = window.isPlaying;
            if (wasPlaying) {
              playBtn.click();
            }
    
            disableAllButtons();
            disableAllCheckboxes();
    
            const projection = d3
              .geoIdentity()
              .reflectY(true)
              .fitSize([w, h], nlMapData);
            const path = d3.geoPath().projection(projection);
    
            // Insert the map layer with initial opacity 0.
            const mapLayer = svg
              .insert("g", ":first-child")
              .attr("class", "map")
              .style("opacity", 0);
    
            mapLayer
              .selectAll("path")
              .data(nlMapData.features)
              .enter()
              .append("path")
              .attr("d", path)
              .attr("fill", "none")
              .attr("stroke", "#999");
    
            // Fade in the map layer.
            if (instant) {
              mapLayer.style("opacity", 1);
            } else {
              mapLayer.transition().duration(300).style("opacity", 1);
            }
    
            // Re-create the map overlay if needed.
            if (!svg.select("#mapOverlay").empty()) {
              svg.select("#mapOverlay").remove();
              svg
                .insert("rect", ":first-child")
                .attr("id", "mapOverlay")
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", w)
                .attr("height", h)
                .attr("fill", "black")
                .attr("opacity", 0.4);
            }
    
            if (!nlLabelPoints) {
              console.error("NL label point data not loaded.");
            } else {
              nodeEnter.each(function (d) {
                const labelFeature = nlLabelPoints.features.find(
                  (f) => f.properties.statcode === d.id,
                );
                if (labelFeature) {
                  const coords = projection(labelFeature.geometry.coordinates);
                  d.x = coords[0];
                  d.y = coords[1];
                }
              });
            }
    
            updateMapPositionsWithTransition(instant);
            applySimulationMapPrevalence();
    
            if (instant) {
              enableAllButtons(isSwitchingCSV ? 550 : 0);
              enableAllCheckboxes(isSwitchingCSV ? 550 : 0);
            } else {
              enableAllButtons(550);
              enableAllCheckboxes(550);
            }
    
            if (wasPlaying && !window.isPlaying) {
              playBtn.click();
            }
          }
    
          function switchToGraphMode() {
            disableAllButtons();
            disableAllCheckboxes();
    
            // Stop time replay by simulating a click on the pause button.
            playBtn = document.getElementById("playPauseBtn");
            const wasPlaying = window.isPlaying;
            if (wasPlaying) {
              playBtn.click();
            }
    
            // Fade out the map layer then remove it.
            svg
              .selectAll(".map")
              .transition()
              .duration(300)
              .style("opacity", 0)
              .remove();
            nodeEnter.each(function (d) {
              d.fx = null;
              d.fy = null;
            });
            if (forceSim) {
              forceSim.alpha(1).restart();
            }
    
            enableAllButtons(550);
            enableAllCheckboxes(550);
    
            if (wasPlaying && !window.isPlaying) {
              playBtn.click();
            }
          }
    
          // Update Node Positions When Switching to Map Mode
          function updateMapPositionsWithTransition(
            instant = false,
            recordOnly = false,
          ) {
            const transitionDuration = instant ? 0 : 1000;

            const getMapLinkPath = (d) => {
              const dx = d.target.x - d.source.x,
                dy = d.target.y - d.source.y,
                dr = Math.sqrt(dx * dx + dy * dy),
                adj = getAdjustedTarget(d);
              return (
                "M" +
                d.source.x +
                "," +
                d.source.y +
                "A" +
                dr +
                "," +
                dr +
                " 0 0,1 " +
                adj.x +
                "," +
                adj.y
              );
            };

            const recordNodeMapPosition = (d) => {
              d.x0 = d.x;
              d.y0 = d.y;
              if (selectedNodeData && selectedNodeData.id === d.id) {
                updateAnnotationForNode(d, annotationGroup);
              }
              if (hoveredNode && hoveredNode.id === d.id) {
                updateAnnotationForNode(d, annotationGroup);
              }
            };

            const recordLinkMapPosition = (d) => {
              if (typeof d.source === "object") {
                d.source.x0 = d.source.x;
                d.source.y0 = d.source.y;
              }
              if (typeof d.target === "object") {
                d.target.x0 = d.target.x;
                d.target.y0 = d.target.y;
              }
            };
    
            if (!recordOnly) {
              if (instant) {
                nodeEnter
                  .interrupt()
                  .attr("transform", (d) => `translate(${d.x},${d.y})`)
                  .each(recordNodeMapPosition);

                linkSelection
                  .interrupt()
                  .attr("d", getMapLinkPath)
                  .each(recordLinkMapPosition);

                labelSelection
                  .interrupt()
                  .attr("x", (d) => d.x)
                  .attr("y", (d) => d.y - (d.r + 13));

                return;
              }

              // Transition node groups.
              nodeEnter
                .transition()
                .duration(transitionDuration)
                .attr("transform", (d) => `translate(${d.x},${d.y})`)
                .on("end", function () {
                  recordNodeMapPosition(d3.select(this).datum());
                });
    
              // Transition link positions.
              linkSelection
                .transition()
                .duration(transitionDuration)
                .attr("d", getMapLinkPath)
                .on("end", function () {
                  recordLinkMapPosition(d3.select(this).datum());
                });
    
              // Transition label positions.
              labelSelection
                .transition()
                .duration(transitionDuration)
                .attr("x", (d) => d.x)
                .attr("y", (d) => d.y - (d.r + 13));
            } else {
              // In recordOnly mode, do not change element positions—just record what is currently shown.
              nodeEnter.each(function (d) {
                // Get the current transform attribute from the node element.
                const transformStr = d3.select(this).attr("transform");
                if (transformStr) {
                  const match = transformStr.match(
                    /translate\(([^,]+),\s*([^)]+)\)/,
                  );
                  if (match) {
                    d.x0 = +match[1];
                    d.y0 = +match[2];
                  }
                } else {
                  d.x0 = d.x;
                  d.y0 = d.y;
                }
              });
              allLinks.forEach((link) => {
                link.x0 =
                  typeof link.source === "object" ? link.source.x0 : link.source;
                link.y0 =
                  typeof link.source === "object" ? link.source.y0 : link.source;
                link.x1 =
                  typeof link.target === "object" ? link.target.x0 : link.target;
                link.y1 =
                  typeof link.target === "object" ? link.target.y0 : link.target;
              });
            }
          }
    
          // Function to bridge native graph data and JSNetworkX
          // function createJSNetworkxGraph(nodes, links) {
          //     // Create a new directed graph.
          //     const G = new jsnx.DiGraph();
    
          //     // Add all nodes with their attributes.
          //     nodes.forEach(n => {
          //         G.addNode(n.id, n);
          //     });
    
          //     // Add only enabled edges.
          //     links.forEach(link => {
          //         if (!link.disabled) {
          //             const source = (typeof link.source === 'object') ? link.source.id : link.source;
          //             const target = (typeof link.target === 'object') ? link.target.id : link.target;
          //             G.addEdge(source, target, { weight: link.weight });
          //         }
          //     });
    
          //     return G;
          // }
    
          /**
           * chuLiuEdmonds(nodes, edges, root, direction)
           *
           * Computes a maximum spanning arborescence using a simplified Chu-Liu/Edmonds approach.
           *
           * @param {Array} nodes - Array of node objects, each with at least {id: string}.
           * @param {Array} edges - Array of edge objects, each with {source, target, weight}.
           *                        source/target can be either a node object or an ID string.
           * @param {Object} root - The root node object for the arborescence, e.g. {id: "Root"}
           * @param {String} direction - "in" or "out".
           *    - "in":   each node except root has exactly one incoming edge (a standard in-arborescence).
           *    - "out":  each node except root has exactly one outgoing edge (equivalent to reversing edges,
           *              computing an in-arbo, then reversing them back).
           * @returns {Array} an array of edges ( {source, target, weight} ) forming the maximum arborescence.
           */
          function chuLiuEdmonds(nodes, edges, root, direction) {
            // If OUT-arborescence, reverse edges first.
            let reversed = false;
            let workingEdges = edges;
            if (direction === "out") {
              reversed = true;
              workingEdges = edges.map((e) => ({
                source: e.target,
                target: e.source,
                weight: e.weight,
              }));
            }
    
            // Step 1: For each node (except root), pick the single incoming edge of maximum weight
            //         in the (possibly reversed) graph
            let inEdges = {};
            nodes.forEach((node) => {
              if (node.id === root.id) return;
              // all edges that lead *into* this node
              const incoming = workingEdges.filter((e) => {
                const t = typeof e.target === "object" ? e.target.id : e.target;
                return t === node.id;
              });
              if (incoming.length > 0) {
                // pick the heaviest edge
                inEdges[node.id] = incoming.reduce((a, b) =>
                  a.weight > b.weight ? a : b,
                );
              }
            });
    
            // Step 2: Detect a cycle by DFS
            let cycle = null;
            let visited = {};
    
            // DFS to detect a cycle
            function dfsCycle(nodeId, path) {
              if (visited[nodeId]) {
                // if visited before in the current path, then there's a cycle
                const idx = path.indexOf(nodeId);
                if (idx !== -1) {
                  cycle = path.slice(idx);
                }
                return;
              }
              visited[nodeId] = true;
              if (inEdges[nodeId]) {
                // follow the one incoming edge
                const src =
                  typeof inEdges[nodeId].source === "object"
                    ? inEdges[nodeId].source.id
                    : inEdges[nodeId].source;
                dfsCycle(src, path.concat([nodeId]));
              }
            }
    
            // run DFS for each node except root
            nodes.forEach((node) => {
              if (node.id !== root.id && !visited[node.id]) {
                dfsCycle(node.id, []);
              }
            });
    
            // if there's no cycle, there's a valid arborescence
            if (!cycle) {
              // collecting all the inEdges values is enough to define the arborescence
              let result = Object.values(inEdges);
    
              // if reversed edges for "out", should also reverse the result back
              if (reversed) {
                result = result.map((e) => ({
                  source: e.target,
                  target: e.source,
                  weight: e.weight,
                }));
              }
              return result;
            }
    
            // Step 3: Contract the cycle
            // create a synthetic node ID for the entire cycle
            let cycleId = cycle.join("_");
    
            // remove cycle nodes from 'nodes' and add one new "contracted" node
            let contractedNodes = nodes.filter((n) => !cycle.includes(n.id));
            contractedNodes.push({ id: cycleId });
    
            // build new edges with cycle references replaced by 'cycleId'
            let contractedEdges = [];
            for (const e of workingEdges) {
              const s = typeof e.source === "object" ? e.source.id : e.source;
              const t = typeof e.target === "object" ? e.target.id : e.target;
              let newS = cycle.includes(s) ? cycleId : s;
              let newT = cycle.includes(t) ? cycleId : t;
    
              // skip self loops
              if (newS === newT) continue;
    
              let newWeight = e.weight;
              // if t is in the cycle, but s is not, subtract the weight of that node's chosen edge
              if (cycle.includes(t) && !cycle.includes(s)) {
                newWeight = e.weight - inEdges[t].weight;
              }
    
              contractedEdges.push({
                source: newS,
                target: newT,
                weight: newWeight,
              });
            }
    
            // recursively compute arbo on contracted graph
            const contractedRoot = root.id === cycleId ? { id: cycleId } : root;
            let T = chuLiuEdmonds(
              contractedNodes,
              contractedEdges,
              contractedRoot,
              "in",
            );
            // ^ pass direction = "in" here
    
            // Step 4: Expand the cycle
            // find the edge pointing to the cycleId in T
            let cycleEdge = T.find((e) => {
              const tid = typeof e.target === "object" ? e.target.id : e.target;
              return tid === cycleId;
            });
    
            // remove that edge from T
            T = T.filter((e) => {
              const tid = typeof e.target === "object" ? e.target.id : e.target;
              return tid !== cycleId;
            });
    
            // restore the cycle's chosen edges
            cycle.forEach((id) => {
              T.push(inEdges[id]);
            });
    
            // if reversed edges for "out", should also reverse the final result back
            if (reversed) {
              T = T.map((e) => ({
                source: e.target,
                target: e.source,
                weight: e.weight,
              }));
            }
    
            return T;
          }
    
          /**
           * visualizeArborescence(treeEdges, containerSelector, rootId)
           *
           * Displays a directed arborescence in a top-down tree layout using d3.tree().
           * If 'treeEdges' is empty, shows "No arborescence found."
           *
           * @param {Array} treeEdges - Arborescence edges: {source, target, weight}
           * @param {String} containerSelector - e.g. "#inArboSVG"
           * @param {String} rootId - ID of the root node
           */
          function visualizeArborescence(treeEdges, containerSelector, rootId) {
            // 1) Clear the container
            const container = d3.select(containerSelector);
            // Clear svg inside
            container.select("svg").remove();
            container.select("div.no-arbo").remove();
    
            // If no edges, display message
            if (!treeEdges || treeEdges.length === 0) {
              container
                .append("text")
                .attr("x", 10)
                .attr("y", 20)
                .text("No major routes found.");
              return;
            }
    
            // 2) Collect node IDs from edges
            let nodeIds = new Set();
            treeEdges.forEach((e) => {
              let s = typeof e.source === "object" ? e.source.id : e.source;
              let t = typeof e.target === "object" ? e.target.id : e.target;
              nodeIds.add(s);
              nodeIds.add(t);
            });
    
            // 3) Filter allNodes to only those in arbo
            let treeNodes = allNodes.filter((n) => nodeIds.has(n.id));
    
            // 4) Build adjacency: childrenMap[parentId] = [childId1, childId2, ...]
            let childrenMap = {};
            treeNodes.forEach((n) => {
              childrenMap[n.id] = [];
            });
            // Each edge is parent -> child
            treeEdges.forEach((e) => {
              let s = typeof e.source === "object" ? e.source.id : e.source;
              let t = typeof e.target === "object" ? e.target.id : e.target;
              if (childrenMap[s]) {
                childrenMap[s].push(t);
              }
            });
    
            // 5) Build a nested structure for d3.tree with 'rootId' as the root
            function buildHierarchy(nodeId) {
              return {
                name: nodeId,
                children: (childrenMap[nodeId] || []).map((childId) =>
                  buildHierarchy(childId),
                ),
              };
            }
    
            // If rootId not in treeNodes, show error
            let rootNode = treeNodes.find((n) => n.id === rootId);
            if (!rootNode) {
              container
                .append("div")
                .attr("class", "no-arbo")
                .attr("x", 10)
                .attr("y", 20)
                .text(`Root ${rootId} not found in arborescence.`);
              return;
            }
    
            let rootData = buildHierarchy(rootId);
    
            // 6) Get dynamic dimensions from the parent container and define margins.
            const rect = container.node().getBoundingClientRect();
            const containerWidth = rect.width;
            const containerHeight = rect.height;
            const margin = { top: 50, right: 30, bottom: 40, left: 10 };
            const width = containerWidth - margin.left - margin.right;
            const height = containerHeight - margin.top - margin.bottom - 25;
    
            // 7) Create an SVG that fills the parent, then append a group with margin transform.
            let svg = container
              .append("svg")
              .attr("width", containerWidth)
              .attr("height", containerHeight - 25)
              .append("g")
              .attr("transform", `translate(${margin.left},${margin.top})`);
    
            let defs = svg.select("defs");
            if (defs.empty()) {
              defs = svg.append("defs");
            }
            // Define the edge glow filter.
            const edgeGlow = defs
              .append("filter")
              .attr("id", "edgeGlow")
              .attr("x", "-50%")
              .attr("y", "-50%")
              .attr("width", "200%")
              .attr("height", "200%");
    
            edgeGlow
              .append("feGaussianBlur")
              .attr("in", "SourceGraphic")
              .attr("stdDeviation", 3)
              .attr("result", "blur");
    
            const feMerge = edgeGlow.append("feMerge");
            feMerge.append("feMergeNode").attr("in", "blur");
            feMerge.append("feMergeNode").attr("in", "SourceGraphic");
    
            // 8) Use d3.tree() with the computed inner dimensions.
            let layout = d3.tree().size([width, height]);
            let root = d3.hierarchy(rootData, (d) => d.children);
            layout(root);
    
            // 9) Draw edges (links)
            svg
              .selectAll(".arbo-link")
              .data(root.links())
              .enter()
              .append("path")
              .attr("class", "arbo-link")
              .attr("fill", "none")
              .attr(
                "d",
                d3
                  .linkVertical()
                  .x((d) => d.x)
                  .y((d) => d.y),
              );
            //.attr("filter", "url(#edgeGlow)");
    
            // 10) Draw nodes
            let nodeGroup = svg
              .selectAll(".node")
              .data(root.descendants())
              .enter()
              .append("g")
              .attr("class", "node")
              .attr("transform", (d) => `translate(${d.x},${d.y})`);
    
            // Onhover, highlight the node and its descendants.
            nodeGroup
              .on("mouseover", function (event, d) {
                let descendants = d.descendants();
                nodeGroup
                  .selectAll("circle")
                  .transition()
                  .duration(200)
                  .attr("fill", (n) => {
                    if (n === d)
                      return "orange"; // hovered node
                    else if (descendants.includes(n))
                      return "cyan"; // its descendants
                    else return "lightgray"; // all others
                  });
              })
              .on("mouseout", function () {
                // Reset: For example, restore the default colors:
                nodeGroup
                  .selectAll("circle")
                  .transition()
                  .duration(200)
                  .attr("fill", (n) =>
                    n.data.name === rootId ? "salmon" : "cyan",
                  );
              });
    
            // Add on click event to each node
            nodeGroup.on("click", function (event, d) {
              // If the clicked node is the root, do nothing.
              if (d.data.name === rootId) return;
              // Otherwise, find matching data in allNodes.
              const selectedNode = allNodes.find((n) => n.id === d.data.name);
              // Call the debounced function with both event and node.
              debouncedOnClickNode(event, selectedNode);
            });
    
            // 11) Circles for each node
            nodeGroup
              .append("circle")
              .attr("r", 5)
              .attr("fill", (d) => (d.data.name === rootId ? "salmon" : "cyan"))
              .attr("filter", "url(#edgeGlow)");
    
            // 13) Labels
            nodeGroup
              .append("text")
              .attr("dy", -4)
              .attr("dx", 14)
              .attr("font-size", "9px")
              .attr("fill", "white")
              .attr("text-anchor", "middle")
              .attr("transform", (d) => `rotate(-45)`)
              .text((d) => d.data.name);
          }
    
          // Maximum Clique Computation with Reciprocal Edges
          // Only consider an undirected edge between two nodes if both A->B and B->A exist.
          function computeMaximumClique() {
            let directedEdges = new Set();
            // Record all directed edges.
            allLinks.forEach((link) => {
              const s =
                typeof link.source === "object" ? link.source.id : link.source;
              const t =
                typeof link.target === "object" ? link.target.id : link.target;
              directedEdges.add(s + "->" + t);
            });
            // Build the undirected graph using only reciprocal edges.
            let adjList = {};
            allNodes.forEach((n) => {
              adjList[n.id] = new Set();
            });
            allLinks.forEach((link) => {
              const s =
                typeof link.source === "object" ? link.source.id : link.source;
              const t =
                typeof link.target === "object" ? link.target.id : link.target;
              // Only add the edge if both directions exist.
              if (
                directedEdges.has(s + "->" + t) &&
                directedEdges.has(t + "->" + s)
              ) {
                adjList[s].add(t);
                adjList[t].add(s);
              }
            });
    
            let maxClique = [];
    
            function bronKerboschPivot(R, P, X) {
              if (P.length === 0 && X.length === 0) {
                if (R.length > maxClique.length) {
                  maxClique = R;
                }
                return;
              }
              // Choose a pivot from P ∪ X.
              let pivotCandidates = P.concat(X);
              let pivot = pivotCandidates[0];
              let pivotNeighbors = adjList[pivot.id];
              // Only consider vertices in P that are not neighbors of the pivot.
              let PwithoutNeighbors = P.filter((v) => !pivotNeighbors.has(v.id));
              for (let v of PwithoutNeighbors) {
                let newR = R.concat([v]);
                let newP = P.filter((u) => adjList[v.id].has(u.id));
                let newX = X.filter((u) => adjList[v.id].has(u.id));
                bronKerboschPivot(newR, newP, newX);
                P = P.filter((u) => u.id !== v.id);
                X.push(v);
              }
            }
    
            bronKerboschPivot([], allNodes.slice(), []);
            return maxClique;
          }
    
          /**
           * computeSCCs()
           *
           * Uses Tarjan’s Algorithm to find strongly connected components (SCCs)
           * in a directed graph.
           *
           * @param {Array} nodes - Array of node objects, each with at least {id: string}.
           * @param {Array} edges - Array of directed edges: {source, target}.
           *                        source/target may be node objects or strings.
           * @returns {Array} array of SCCs, where each SCC is array of node IDs
           *
           * Complexity: O(V + E)
           */
          function computeSCCs() {
            // 1) Build adjacency list from enabled edges
            const adj = buildAdjList(activeNodes, enabledLinks);
    
            // 2) Tarjan’s data structures
            let indexCounter = 0;
            const stack = [];
            const onStack = {};
            const index = {}; // index[nodeId]
            const lowLink = {}; // lowLink[nodeId]
            const sccList = []; // final array of SCCs
    
            activeNodes.forEach((n) => {
              index[n.id] = -1; // uninitialized
              lowLink[n.id] = -1;
              onStack[n.id] = false;
            });
    
            // Tarjan’s stronglyConnected procedure
            function strongConnect(v) {
              // Set the depth index for v.
              index[v] = indexCounter;
              lowLink[v] = indexCounter;
              indexCounter++;
              stack.push(v);
              onStack[v] = true;
    
              // Consider successors of v.
              for (let w of adj[v]) {
                if (index[w] === -1) {
                  // Successor w has not yet been visited; recurse on it.
                  strongConnect(w);
                  lowLink[v] = Math.min(lowLink[v], lowLink[w]);
                } else if (onStack[w]) {
                  // Successor w is in the stack, meaning v is part of a cycle.
                  lowLink[v] = Math.min(lowLink[v], index[w]);
                }
              }
    
              // If v is a root node, pop the stack and generate an SCC.
              if (lowLink[v] === index[v]) {
                const scc = [];
                let w = null;
                do {
                  w = stack.pop();
                  onStack[w] = false;
                  scc.push(w);
                } while (w !== v);
                sccList.push(scc);
              }
            }
    
            // 3) Run Tarjan’s procedure for each unvisited node.
            activeNodes.forEach((n) => {
              if (index[n.id] === -1) {
                strongConnect(n.id);
              }
            });
    
            newSCCs = sccList;
          }
    
          function computeSpectralRadius(
            allNodes,
            enabledLinks,
            maxIter = 100,
            tol = 1e-6,
          ) {
            // 1. Filter out disabled links.
            // Already configured globally.
    
            // 2. Create a mapping from node id to index.
            const n = allNodes.length;
            const idToIndex = {};
            allNodes.forEach((node, i) => {
              idToIndex[node.id] = i;
            });
    
            // 3. Build the adjacency matrix.
            // Here use a 2D array with dimensions n x n, initialized to 0.
            const A = Array.from({ length: n }, () => Array(n).fill(0));
            enabledLinks.forEach((link) => {
              const source =
                typeof link.source === "object" ? link.source.id : link.source;
              const target =
                typeof link.target === "object" ? link.target.id : link.target;
              const i = idToIndex[source];
              const j = idToIndex[target];
              if (i !== undefined && j !== undefined) {
                A[i][j] += link.weight || 1;
              }
            });
    
            // 4. Use power iteration to estimate the spectral radius.
            // Start with a random vector (or a vector of ones).
            let v = Array(n).fill(1);
    
            // Function to compute matrix-vector multiplication.
            function matVecMult(matrix, vec) {
              const result = Array(vec.length).fill(0);
              for (let i = 0; i < matrix.length; i++) {
                for (let j = 0; j < matrix[i].length; j++) {
                  result[i] += matrix[i][j] * vec[j];
                }
              }
              return result;
            }
    
            // Function to compute the Euclidean norm of a vector.
            function norm(vec) {
              return Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0));
            }
    
            let eigenvalue = 0;
            for (let iter = 0; iter < maxIter; iter++) {
              // Multiply matrix by vector.
              let newV = matVecMult(A, v);
              const newNorm = norm(newV);
              // Normalize the new vector.
              newV = newV.map((x) => x / newNorm);
    
              // Estimate eigenvalue using Rayleigh quotient.
              const Av = matVecMult(A, newV);
              const rayleigh = newV.reduce((sum, x, i) => sum + x * Av[i], 0);
    
              // Check for convergence.
              if (Math.abs(rayleigh - eigenvalue) < tol) {
                eigenvalue = rayleigh;
                break;
              }
              eigenvalue = rayleigh;
              v = newV;
            }
    
            return eigenvalue;
          }
    
          // Build an adjacency list for a directed graph.
          function buildAdjList(nodes, edges) {
            const adj = {};
            nodes.forEach((n) => {
              adj[n.id] = [];
            });
            edges.forEach((e) => {
              const s = typeof e.source === "object" ? e.source.id : e.source;
              const t = typeof e.target === "object" ? e.target.id : e.target;
              if (!adj[s]) {
                adj[s] = [];
              }
              adj[s].push(t);
            });
            return adj;
          }

          function getTradeCommunityLabel(key) {
            return key === "NA" ? "NA" : `P${key}`;
          }

          function getTradeCommunityColor(key) {
            return key === "NA" ? "#9ca3af" : nodeColor(Number(key));
          }

          function getTradeCommunityStructureData() {
            const nodes = activeNodes.length
              ? activeNodes
              : allNodes.filter((node) => node.active);
            const links = enabledLinks.filter((link) => link.weight > 0);
            const temporalStats =
              window.currentDate &&
              window.allTemporalStats?.[window.currentDate.toISOString()];

            if (temporalStats?.partition) {
              allNodes.forEach((node) => {
                node.community = temporalStats.partition[node.id];
              });
            }

            const communities = new Map();
            const nodeCommunity = new Map();
            nodes.forEach((node) => {
              const key =
                node.community === undefined || node.community === null
                  ? "NA"
                  : String(node.community);
              nodeCommunity.set(node.id, key);
              if (!communities.has(key)) {
                communities.set(key, {
                  key,
                  members: [],
                  nodeCount: 0,
                  nodeVolume: 0,
                  incoming: 0,
                  outgoing: 0,
                  load: 0,
                });
              }
              const community = communities.get(key);
              community.members.push(node.id);
              community.nodeCount += 1;
              community.nodeVolume += node.tradeTotal || 0;
            });

            let total = 0;
            let within = 0;
            const matrix = new Map();
            links.forEach((link) => {
              const sourceId = getNodeId(link.source);
              const targetId = getNodeId(link.target);
              const sourceKey = nodeCommunity.get(sourceId);
              const targetKey = nodeCommunity.get(targetId);
              const weight = Math.max(0, +link.weight || 0);
              if (!sourceKey || !targetKey || !weight) return;

              const key = `${sourceKey}->${targetKey}`;
              matrix.set(key, (matrix.get(key) || 0) + weight);
              communities.get(sourceKey).outgoing += weight;
              communities.get(targetKey).incoming += weight;
              total += weight;
              if (sourceKey === targetKey) within += weight;
            });

            communities.forEach((community) => {
              community.load = community.incoming + community.outgoing;
              community.members.sort((a, b) => {
                const aNum = parseInt(String(a).replace("CR", ""), 10);
                const bNum = parseInt(String(b).replace("CR", ""), 10);
                return aNum - bNum || d3.ascending(a, b);
              });
            });

            const communityList = Array.from(communities.values()).sort(
              (a, b) =>
                b.load - a.load ||
                b.nodeVolume - a.nodeVolume ||
                b.nodeCount - a.nodeCount ||
                d3.ascending(a.key, b.key),
            );
            const modularity =
              temporalStats?.modularity ??
              computeModularity(nodes, links).modularity ??
              0;

            return {
              communities: communityList,
              matrix,
              total,
              within,
              between: total - within,
              modularity,
            };
          }

          function renderTradeCommunityStructurePanel() {
            const container = d3.select("#tradeClusters");
            const containerNode = container.node();
            const data = getTradeCommunityStructureData();
            const { communities, matrix } = data;
            const mappingLayout = getSimulationPartitionMappingLayout(containerNode);
            const margin = {
              top: 78,
              right: 104,
              bottom: communities.length ? mappingLayout.compactHeight + 12 : 36,
              left: 42,
            };
            const width = Math.max(
              10,
              containerNode.clientWidth - margin.left - margin.right,
            );
            const height = Math.max(
              10,
              containerNode.clientHeight - margin.top - margin.bottom,
            );

            let svg = container.select("svg.trade-community-chart");
            if (svg.empty()) {
              container.selectAll("svg").remove();
              svg = container.append("svg").attr("class", "trade-community-chart");
            }
            svg
              .attr("width", containerNode.clientWidth)
              .attr("height", containerNode.clientHeight);

            const g = svg
              .selectAll("g.trade-community-chart-group")
              .data([null])
              .join("g")
              .attr("class", "trade-community-chart-group")
              .attr("transform", `translate(${margin.left},${margin.top})`);

            if (!communities.length) {
              renderSimulationPartitionMapping(
                container,
                communities,
                mappingLayout,
              );
              svg.selectAll("g.trade-community-summary").remove();
              g.selectAll("*").interrupt().remove();
              renderEmpty(g, width, height, "No community data");
              return;
            }
            renderSimulationPartitionMapping(container, communities, mappingLayout);
            g.selectAll(".empty-message").remove();

            const keys = communities.map((community) => community.key);
            const matrixSize = Math.max(10, Math.min(width, height));
            const matrixOffsetY = Math.max(0, (height - matrixSize) / 2);
            const x = d3
              .scaleBand()
              .domain(keys)
              .range([0, matrixSize])
              .padding(0.06);
            const y = d3
              .scaleBand()
              .domain(keys)
              .range([matrixOffsetY, matrixOffsetY + matrixSize])
              .padding(0.06);
            const cells = keys.flatMap((source) =>
              keys.map((target) => ({
                source,
                target,
                value: matrix.get(`${source}->${target}`) || 0,
              })),
            );
            const maxValue = d3.max(cells, (cell) => cell.value) || 1;
            const color = d3
              .scaleSequential(d3.interpolateYlGnBu)
              .domain([0, maxValue]);

            const summaryItems = [
              ["Within", formatPct(data.total ? data.within / data.total : 0)],
              ["Between", formatPct(data.total ? data.between / data.total : 0)],
              ["Modularity", d3.format(".3f")(data.modularity || 0)],
            ];
            const summaryWidth = Math.min(92, containerNode.clientWidth / 3);
            const summary = svg
              .selectAll("g.trade-community-summary")
              .data([null])
              .join("g")
              .attr("class", "trade-community-summary")
              .attr("transform", "translate(16,50)");
            const summaryGroups = summary
              .selectAll("g.trade-community-summary-item")
              .data(summaryItems, (item) => item[0])
              .join(
                (enter) => {
                  const item = enter
                    .append("g")
                    .attr("class", "trade-community-summary-item")
                    .style("opacity", 0);
                  item
                    .append("text")
                    .attr("class", "trade-community-summary-label")
                    .attr("y", -9);
                  item
                    .append("text")
                    .attr("class", "trade-community-summary-value")
                    .attr("y", 5);
                  return item;
                },
                (update) => update,
                (exit) =>
                  exit.call((selection) =>
                    transitionSelection(selection).style("opacity", 0).remove(),
                  ),
              );
            summaryGroups
              .call((selection) =>
                transitionSelection(selection)
                  .style("opacity", 1)
                  .attr(
                    "transform",
                    (item, index) => `translate(${index * summaryWidth},0)`,
                  ),
              );
            summaryGroups
              .select("text.trade-community-summary-label")
              .text((item) => item[0]);
            summaryGroups
              .select("text.trade-community-summary-value")
              .text((item) => item[1]);

            const cellSelection = g
              .selectAll("rect.trade-community-cell")
              .data(cells, (cell) => `${cell.source}->${cell.target}`)
              .join(
                (enter) =>
                  enter
                    .append("rect")
                    .attr("class", "trade-community-cell")
                    .attr("x", (cell) => x(cell.target))
                    .attr("y", matrixOffsetY + matrixSize)
                    .attr("width", x.bandwidth())
                    .attr("height", 0)
                    .attr("rx", 3)
                    .attr("ry", 3)
                    .style("opacity", 0),
                (update) => update,
                (exit) =>
                  exit.call((selection) =>
                    transitionSelection(selection)
                      .style("opacity", 0)
                      .attr("height", 0)
                      .remove(),
                  ),
              );
            cellSelection
              .call((selection) =>
                transitionSelection(selection)
                  .style("opacity", 1)
                  .attr("x", (cell) => x(cell.target))
                  .attr("y", (cell) => y(cell.source))
                  .attr("width", x.bandwidth())
                  .attr("height", y.bandwidth())
                  .attr("fill", (cell) =>
                    cell.value > 0 ? color(cell.value) : "rgba(23,34,24,0.04)",
                  )
                  .attr("stroke", (cell) =>
                    cell.source === cell.target
                      ? "rgba(23,34,24,0.45)"
                      : "rgba(255,255,255,0.9)",
                  )
                  .attr("stroke-width", (cell) =>
                    cell.source === cell.target ? 1.2 : 0.6,
                  ),
              );
            cellSelection
              .selectAll("title")
              .data((cell) => [cell])
              .join("title")
              .text(
                (cell) =>
                  `${getTradeCommunityLabel(cell.source)} -> ${getTradeCommunityLabel(cell.target)}: ${formatSmall(cell.value)}`,
              );

            g.selectAll("text.trade-community-column-label")
              .data(keys, (key) => key)
              .join(
                (enter) =>
                  enter
                    .append("text")
                    .attr("class", "trade-community-column-label")
                    .attr("text-anchor", "middle")
                    .style("opacity", 0),
                (update) => update,
                (exit) =>
                  exit.call((selection) =>
                    transitionSelection(selection).style("opacity", 0).remove(),
                  ),
              )
              .call((selection) =>
                transitionSelection(selection)
                  .style("opacity", 1)
                  .attr("x", (key) => x(key) + x.bandwidth() / 2)
                  .attr("y", matrixOffsetY - 8),
              )
              .text(getTradeCommunityLabel);
            g.selectAll("text.trade-community-row-label")
              .data(keys, (key) => key)
              .join(
                (enter) =>
                  enter
                    .append("text")
                    .attr("class", "trade-community-row-label")
                    .attr("text-anchor", "end")
                    .style("opacity", 0),
                (update) => update,
                (exit) =>
                  exit.call((selection) =>
                    transitionSelection(selection).style("opacity", 0).remove(),
                  ),
              )
              .call((selection) =>
                transitionSelection(selection)
                  .style("opacity", 1)
                  .attr("x", -8)
                  .attr("y", (key) => y(key) + y.bandwidth() / 2 + 3),
              )
              .text(getTradeCommunityLabel);

            const maxLoad = d3.max(communities, (community) => community.load) || 1;
            const loadX = d3
              .scaleLinear()
              .domain([0, maxLoad])
              .range([0, Math.max(18, margin.right - 48)]);
            const loadLayer = g
              .selectAll("g.trade-community-load-layer")
              .data([null])
              .join("g")
              .attr("class", "trade-community-load-layer")
              .attr("transform", `translate(${matrixSize + 12},0)`);
            loadLayer
              .selectAll("rect.trade-community-load-bar")
              .data(communities, (community) => community.key)
              .join(
                (enter) =>
                  enter
                    .append("rect")
                    .attr("class", "trade-community-load-bar")
                    .attr("x", 0)
                    .attr("y", (community) => y(community.key))
                    .attr("width", 0)
                    .attr("height", y.bandwidth())
                    .attr("rx", 3)
                    .attr("fill", (community) =>
                      getTradeCommunityColor(community.key),
                    ),
                (update) => update,
                (exit) =>
                  exit.call((selection) =>
                    transitionSelection(selection)
                      .attr("width", 0)
                      .style("opacity", 0)
                      .remove(),
                  ),
              )
              .call((selection) =>
                transitionSelection(selection)
                  .style("opacity", 1)
                  .attr("y", (community) => y(community.key))
                  .attr("width", (community) => loadX(community.load))
                  .attr("height", y.bandwidth())
                  .attr("fill", (community) =>
                    getTradeCommunityColor(community.key),
                  ),
              );
            loadLayer
              .selectAll("text.trade-community-load-label")
              .data(communities, (community) => community.key)
              .join(
                (enter) =>
                  enter
                    .append("text")
                    .attr("class", "trade-community-load-label")
                    .attr("text-anchor", "end")
                    .style("opacity", 0),
                (update) => update,
                (exit) =>
                  exit.call((selection) =>
                    transitionSelection(selection).style("opacity", 0).remove(),
                  ),
              )
              .call((selection) =>
                transitionSelection(selection)
                  .style("opacity", 1)
                  .attr("x", margin.right - 24)
                  .attr(
                    "y",
                    (community) => y(community.key) + y.bandwidth() / 2 + 3,
                  ),
              )
              .text((community) => formatSmall(community.load));
          }
   
          /**
           * Renders global partition structure for the ledger view.
           */
          function updateSCCs() {
            if (isSimulationModeActive() && simulationState.currentFrame) {
              renderSimulationPartitionStructurePanel();
              return;
            }
            if (selectedNodeData) {
              return; // Do not update if a node is selected.
            }
            renderTradeCommunityStructurePanel();
            return;
            const container = d3.select("#tradeClusters");
    
            let svg = container.select("svg");
            let g;
            const margin = { top: 60, right: 0, bottom: 10, left: 0 };
            const containerNode = container.node();
            const width = containerNode.clientWidth - margin.left - margin.right;
            const height = containerNode.clientHeight - margin.top - margin.bottom;
    
            if (svg.empty()) {
              svg = container.append("svg");
              g = svg.append("g");
            } else {
              g = svg.select("g");
              svg.selectAll("*").remove();
              g = svg.append("g");
            }
    
            svg
              .attr("width", width + margin.left + margin.right)
              .attr("height", height + margin.top + margin.bottom);
    
            g.attr("transform", `translate(${margin.left},${margin.top})`);
    
            const nodeMap = new Map();
            allNodes.forEach((n) => {
              nodeMap.set(n.id, {
                id: n.id,
                tradeTotal: n.tradeTotal,
                community: n.community,
              });
            });
    
            const simNodes = [];
            const simLinks = [];
    
            function addLink(sourceId, targetId) {
              simLinks.push({ source: sourceId, target: targetId });
            }
    
            const addedNodeIds = new Set();
    
            newSCCs.forEach((component, sccIndex) => {
              const n = component.length;
              if (n < 1) return;
    
              // For each node in this SCC
              component.forEach((nodeId) => {
                if (!addedNodeIds.has(nodeId) && nodeMap.has(nodeId)) {
                  const nodeObj = nodeMap.get(nodeId);
                  // Record which SCC this node belongs to
                  nodeObj.sccIndex = sccIndex;
                  // Add node to simNodes
                  simNodes.push(nodeObj);
                  addedNodeIds.add(nodeId);
                }
              });
    
              // Create "ring" links among this SCC’s nodes
              for (let i = 0; i < n; i++) {
                const sourceId = component[i];
                const targetId = component[(i + 1) % n];
                addLink(sourceId, targetId);
              }
            });
    
            // Number of SCC clusters
            const nClusters = newSCCs.length;
    
            // Use mini force simulation to compute centers for each cluster
            const clusterCenters = computeCentersViaMiniForceSim(
              nClusters,
              width,
              height,
            );
    
            // Build the main force simulation
            const simulation = d3
              .forceSimulation(simNodes)
              .force(
                "link",
                d3
                  .forceLink(simLinks)
                  .id((d) => d.id)
                  .distance(10)
                  .strength(2),
              )
              .force("charge", d3.forceManyBody().strength(5))
              .force("collide", d3.forceCollide(5))
              .force(
                "x",
                d3.forceX((d) => clusterCenters[d.sccIndex].x).strength(0.3),
              )
              .force(
                "y",
                d3.forceY((d) => clusterCenters[d.sccIndex].y).strength(0.3),
              )
              .on("tick", ticked);
    
            const linkSelection = g
              .selectAll(".ringLink")
              .data(simLinks)
              .enter()
              .append("line")
              .attr("class", "ringLink")
              .attr("stroke", "#999")
              .attr("stroke-opacity", 0.6)
              .attr("stroke-width", 1.5);
    
            const nodeSelection = g
              .selectAll(".ringNode")
              .data(simNodes)
              .enter()
              .append("circle")
              .attr("class", "ringNode")
              .attr("r", (d) => nodeSize(d.tradeTotal))
              .attr("fill", (d) => nodeColor(d.community))
              .attr("stroke", "gray")
              .attr("stroke-width", 1)
              .call(
                d3
                  .drag()
                  .on("start", dragStarted)
                  .on("drag", dragged)
                  .on("end", dragEnded),
              );
    
            // Create a group for each node label
            const labelGroup = g
              .selectAll(".ringNodeLabelGroup")
              .data(simNodes)
              .enter()
              .append("g")
              .attr("class", "ringNodeLabelGroup")
              .style("display", "none"); // Hide by default
    
            // Append the background rectangle inside the group
            labelGroup
              .append("rect")
              .attr("class", "ringNodeLabelBg")
              .attr("rx", 4)
              .attr("ry", 4)
              .attr("fill", "gray");
    
            // Append the text element inside the same group
            labelGroup
              .append("text")
              .attr("class", "ringNodeLabel")
              .attr("text-anchor", "middle")
              .attr("dy", "-0.5em")
              .style("font-size", "8px")
              .style("fill", "white")
              .style("font-weight", "bold")
              .text((d) => d.id)
              .each(function () {
                const bbox = this.getBBox();
                d3.select(this.parentNode)
                  .select("rect")
                  .attr("x", bbox.x - 2)
                  .attr("y", bbox.y - 2)
                  .attr("width", bbox.width + 4)
                  .attr("height", bbox.height + 4);
              });
    
            nodeSelection
              .on("click", function (event, d) {
                const selectedNode = allNodes.find((n) => n.id === d.id);
                // Call the debounced function with both event and node.
                debouncedOnClickNode(event, selectedNode);
              })
              .on("mouseover", function (event, d) {
                labelGroup.filter((ld) => ld.id === d.id).style("display", "block");
              })
              .on("mouseout", function (event, d) {
                labelGroup.filter((ld) => ld.id === d.id).style("display", "none");
              });
    
            // Convex hull setup
            const hullSelection = g
              .selectAll(".clusterHull")
              .data(d3.range(nClusters))
              .enter()
              .append("path")
              .attr("class", "clusterHull")
              .style("fill", "orange")
              .style("fill-opacity", 0.15)
              .style("stroke", "orange")
              .style("stroke-width", 2)
              .style("stroke-opacity", 0.6);
    
            // Create a group for each cluster label
            const clusterLabelGroup = g
              .selectAll(".clusterLabelGroup")
              .data(d3.range(nClusters))
              .enter()
              .append("g")
              .attr("class", "clusterLabelGroup");
    
            // Append the text inside the group
            clusterLabelGroup
              .append("text")
              .attr("class", "clusterLabel")
              .attr("text-anchor", "middle")
              .style("font-weight", "bold")
              .style("font-size", "14px")
              .style("fill", "white")
              .text((d) => `Cluster #${d + 1}`);
    
            // Append a background rectangle behind the text inside the group.
            clusterLabelGroup.each(function () {
              const group = d3.select(this);
              const textEl = group.select("text");
              const bbox = textEl.node().getBBox();
              group
                .insert("rect", "text")
                .attr("x", bbox.x - 2)
                .attr("y", bbox.y - 2)
                .attr("width", bbox.width + 4)
                .attr("height", bbox.height + 4)
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("fill", "green");
            });
    
            clusterLabelGroup
              .on("mouseover", function (event, clusterIndex) {
                // Compute the cluster’s center using the same logic as in ticked()
                const clusterNodes = simNodes.filter(
                  (n) => n.sccIndex === clusterIndex,
                );
                const cx = clusterNodes.length
                  ? d3.mean(clusterNodes, (d) => d.x)
                  : 0;
                const cy = clusterNodes.length
                  ? d3.mean(clusterNodes, (d) => d.y) - 25
                  : 0;
    
                // Get offsets for the annotation (assuming getAnnotationOffset exists)
                const offsets = getAnnotationOffsetMidPoint(
                  cx,
                  cy,
                  width,
                  height,
                  (amount = 15),
                );
    
                const annotationData = [
                  {
                    note: {
                      label: clusterNodes.map((n) => n.id).join(", "),
                      wrap: 140,
                      bgPadding: { top: 4, left: 4, right: 4, bottom: 4 },
                    },
                    x: cx,
                    y: cy,
                    dx: offsets.dx,
                    dy: offsets.dy,
                    type: d3.annotationElbow,
                  },
                ];
    
                const makeAnnotations = d3.annotation().annotations(annotationData);
    
                // Append the annotation group with a custom class for styling
                g.append("g")
                  .attr("class", "cluster-annotation")
                  .call(makeAnnotations);
    
                // Style the annotation note background via the custom class
                g.select("g.cluster-annotation")
                  .selectAll("rect.annotation-note-bg")
                  .attr("fill", "green")
                  .attr("fill-opacity", 0.8)
                  .attr("rx", 4)
                  .attr("ry", 4);
    
                g.select("g.cluster-annotation")
                  .selectAll(
                    "text.annotation-note-title, text.annotation-note-label",
                  )
                  .attr("fill", "white");
              })
              .on("mouseout", function () {
                g.selectAll(".cluster-annotation").remove();
              });
    
            function ticked() {
              linkSelection
                .attr("x1", (d) => d.source.x)
                .attr("y1", (d) => d.source.y)
                .attr("x2", (d) => d.target.x)
                .attr("y2", (d) => d.target.y);
    
              nodeSelection
                .attr("cx", (d) => {
                  d.x = Math.max(8 + 5, Math.min(width - 8 - 5, d.x));
                  return d.x;
                })
                .attr("cy", (d) => {
                  d.y = Math.max(8, Math.min(height - 8 - 20, d.y));
                  return d.y;
                });
    
              labelGroup.attr("transform", (d) => `translate(${d.x},${d.y - 8})`);
    
              // Update convex hulls with padding
              const SCALE_FACTOR = 1.7;
              hullSelection.attr("d", function (clusterIndex) {
                const clusterNodes = simNodes.filter(
                  (n) => n.sccIndex === clusterIndex,
                );
                if (clusterNodes.length === 0) return null;
    
                if (clusterNodes.length < 3) {
                  // For clusters with 1 or 2 nodes, compute a randomly perturbed polygon that roughly looks like an oval.
                  const minX = d3.min(clusterNodes, (d) => d.x);
                  const maxX = d3.max(clusterNodes, (d) => d.x);
                  const minY = d3.min(clusterNodes, (d) => d.y);
                  const maxY = d3.max(clusterNodes, (d) => d.y);
                  const cx = (minX + maxX) / 2;
                  const cy = (minY + maxY) / 2;
                  // Define radii with extra padding.
                  const rx = (maxX - minX) / 2 + 15;
                  const ry = (maxY - minY) / 2 + 16;
                  // Choose a fixed number of points for the polygon.
                  const numPoints = 8;
                  let points = [];
                  for (let i = 0; i < numPoints; i++) {
                    const angle = (2 * Math.PI * i) / numPoints;
                    // Generate a random factor between 0.9 and 1.1
                    const factor = 1 + (Math.random() - 0.5) * 0.2;
                    const xPoint = cx + rx * factor * Math.cos(angle);
                    const yPoint = cy + ry * factor * Math.sin(angle);
                    points.push([xPoint, yPoint]);
                  }
                  return "M" + points.map((p) => p.join(",")).join("L") + "Z";
                } else {
                  // For clusters with 3 or more nodes, compute the convex hull and expand it.
                  const points = clusterNodes.map((n) => [n.x, n.y]);
                  let hull = d3.polygonHull(points);
                  if (!hull) return null;
                  const cx = d3.mean(hull, (p) => p[0]);
                  const cy = d3.mean(hull, (p) => p[1]);
                  hull = hull.map((pt) => {
                    const dx = pt[0] - cx;
                    const dy = pt[1] - cy;
                    return [cx + dx * SCALE_FACTOR, cy + dy * SCALE_FACTOR];
                  });
                  return "M" + hull.join("L") + "Z";
                }
              });
    
              hullSelection.lower();
    
              clusterLabelGroup.attr("transform", (clusterIndex) => {
                const clusterNodes = simNodes.filter(
                  (n) => n.sccIndex === clusterIndex,
                );
                const cx = clusterNodes.length
                  ? d3.mean(clusterNodes, (d) => d.x)
                  : 0;
                const cy = clusterNodes.length
                  ? d3.mean(clusterNodes, (d) => d.y) - 25
                  : 0;
                return `translate(${cx},${cy})`;
              });
            }
    
            function dragStarted(event, d) {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            }
            function dragged(event, d) {
              d.fx = event.x;
              d.fy = event.y;
            }
            function dragEnded(event, d) {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            }
          }
    
          /**
           * Mini force simulation for cluster centers.
           * Returns an array of { x, y } for each cluster.
           */
          function computeCentersViaMiniForceSim(nClusters, width, height) {
            const centerNodes = d3.range(nClusters).map((i) => ({ id: i }));
            const centerSim = d3
              .forceSimulation(centerNodes)
              .force("charge", d3.forceManyBody().strength(200))
              .force("collide", d3.forceCollide(Math.max(40, 50 - 2 * nClusters)))
              .force("center", d3.forceCenter(width / 2, height / 2))
              .stop();
            for (let i = 0; i < 50; i++) centerSim.tick();
            return centerNodes.map((d) => ({ x: d.x, y: d.y }));
          }
    
          function updateInOutArbos() {
            if (!selectedNodeData) {
              return; // Do not update if no node is selected.
            }
            const newRootId = selectedNodeData ? selectedNodeData.id : null;
    
            // 0) Clear the existing SVGs if newRootId is null
            if (!newRootId) {
              d3.select("#inArboSVG").selectAll("*").remove();
              d3.select("#outArboSVG").selectAll("*").remove();
              return;
            }
    
            // 1) Find the new root node object
            let newRoot = allNodes.find((n) => n.id === newRootId);
            if (!newRoot) {
              console.warn("No root found for ID:", newRootId);
              return;
            }
    
            // 2) Filter out disabled links from allLinks.
            // Already configured globally.
    
            // 3) Compute in-arbo and out-arbo using only enabled links.
            let inArbo = chuLiuEdmonds(activeNodes, enabledLinks, newRoot, "in");
            // let outArbo = chuLiuEdmonds(activeNodes, enabledLinks, newRoot, "out");
    
            // 4) Visualize the computed arbos.
            visualizeArborescence(inArbo, "#inArboContainer", newRootId);
            // visualizeArborescence(outArbo, "#outArboSVG", newRootId);
          }
    
          // MAIN ENTRY POINT of HerdLink

          function bootstrapHerdLink() {
            // Clear any previous network visualization.
            if (svg && svg.node().hasChildNodes()) {
              svg.selectAll("*").remove();
            }
    
            // Use weekly aggregation as the default CSV file.
            const defaultCSVUrl = resolveAssetUrl(
              "assets/data/weekly_aggregation.csv",
            );
    
            // Initialize the network visualization with the default CSV file.
            document
              .getElementsByClassName("csv-switcher")[0]
              .querySelector('input[value="weekly"]').checked = true;
            // Update the global stats chart with the initial stat.
            window.currentSelectedStat = "totalTradeVolume";
            // Update the node stats chart with the initial node stat.
            window.currentSelectedNodeStat = "eigenvector";
            const statSelect = document.getElementById("statSelect");
            const nodeStatSelect = document.getElementById("nodeStatSelect");
            if (statSelect) {
              statSelect.value = window.currentSelectedStat;
            }
            if (nodeStatSelect) {
              nodeStatSelect.value = window.currentSelectedNodeStat;
            }
            // Update the trade node insights with the initial insight.
            window.currentSelectedTradeNodeInsight = "partnerBalance";
            // Update the initial time span.
            currentTimeSpan = "weekly";
            bindSimulationUi();
            configureSimulationModeUi(false);
            initHerdLink(defaultCSVUrl);
          }
    
          // Listen for changes on the csv switcher
          document
            .querySelectorAll('.csv-switcher input[name="csvResolution"]')
            .forEach((radio) => {
              radio.addEventListener("change", function (event) {
                const resolution = event.target.value;
                currentTimeSpan = resolution;
    
                const fileName = `${resolution}_aggregation.csv`;
                const csvUrl = resolveAssetUrl(`assets/data/${fileName}`);
    
                // Load CSV file using d3.csv
                initHerdLink(csvUrl);
              });
            });
    
          let sliderKeyListener = null;
          let playPauseKeyListener = null;
          let fromStartKeyListener = null;
          let persistentUiHandlersBound = false;
    
          // Helper function to remove existing document-level listeners for time controls.
          function removeTimeControlListeners() {
            if (sliderKeyListener) {
              document.removeEventListener("keydown", sliderKeyListener);
              sliderKeyListener = null;
            }
            if (playPauseKeyListener) {
              document.removeEventListener("keydown", playPauseKeyListener);
              playPauseKeyListener = null;
            }
            if (fromStartKeyListener) {
              document.removeEventListener("keydown", fromStartKeyListener);
              fromStartKeyListener = null;
            }
          }
    
          function initHerdLink(csvUrl) {
            // Clear any previous network visualization.
            if (svg && svg.node().hasChildNodes()) {
              svg.selectAll("*").remove();
            }
    
            window.isSwitchingCSV = true;
            disableAllButtons();
            removeTimeControlListeners();
    
            // Hide/reset UI elements that depend on the CSV.
            const timeControls = document.getElementById("timeControlsContainer");
            timeControls.style.display = "none";
            timeControls.innerHTML = "";
            if (document.getElementById("currentDateWidget")) {
              document.getElementById("currentDateWidget").style.display = "none";
            }
            if (document.getElementById("timeAuthorCredit")) {
              document.getElementById("timeAuthorCredit").style.display = "none";
            }
    
            // Fetch and process the CSV data, then initialize the visualization.
            fetch(csvUrl)
              .then(function (response) {
                if (!response.ok) {
                  throw new Error("Network error: " + response.statusText);
                }
                return response.text();
              })
              .then(function (csvText) {
                // CSV successfully loaded and parsed.
                var data = d3.csvParse(csvText);
    
                // Detect if a time column exists (case-insensitive) and process as before.
                const headers = data.columns.map((h) => h.toLowerCase());
                hasTime = headers.includes("time");
    
                function initNodesAndLinks(data) {
                  const nodesMap = {},
                    links = [];
    
                  // Process CSV rows.
                  data.forEach((d) => {
                    const source = d.COROP_LEV,
                      target = d.COROP_AFN,
                      weight = +d.AANTAL,
                      disabled = 0;
                    // Skip rows with missing or NA values.
                    if (
                      !source ||
                      !target ||
                      source.toUpperCase() === "NA" ||
                      target.toUpperCase() === "NA"
                    )
                      return;
    
                    if (!nodesMap[source]) {
                      nodesMap[source] = {
                        id: source,
                        tradeTotal: 0,
                        active: true,
                      };
                    }
                    if (!nodesMap[target]) {
                      nodesMap[target] = {
                        id: target,
                        tradeTotal: 0,
                        active: true,
                      };
                    }
                    nodesMap[source].tradeTotal += weight;
                    nodesMap[target].tradeTotal += weight;
                    links.push({
                      id: source + "-" + target,
                      source: source,
                      target: target,
                      weight: weight,
                      disabled: disabled,
                    });
                  });
    
                  // Ensure all COROP regions (CR01 to CR40) are present.
                  for (let i = 1; i <= 40; i++) {
                    const regionId = "CR" + (i < 10 ? "0" + i : i);
                    if (!nodesMap[regionId]) {
                      nodesMap[regionId] = {
                        id: regionId,
                        tradeTotal: 0,
                        active: false,
                      };
                    }
                  }
    
                  // Get an array of all node IDs.
                  const nodeIds = Object.keys(nodesMap);
    
                  // First, add missing self-loops.
                  nodeIds.forEach((id) => {
                    if (
                      !links.some(
                        (link) => link.source === id && link.target === id,
                      )
                    ) {
                      links.push({
                        id: id + "-" + id,
                        source: id,
                        target: id,
                        weight: 0,
                        disabled: 0,
                      });
                    }
                  });
    
                  // Then, for every ordered pair (id1, id2) with id1 !== id2, add a dummy link if missing.
                  nodeIds.forEach((sourceId) => {
                    nodeIds.forEach((targetId) => {
                      if (sourceId === targetId) return;
                      if (
                        !links.some(
                          (link) =>
                            link.source === sourceId && link.target === targetId,
                        )
                      ) {
                        links.push({
                          id: sourceId + "-" + targetId,
                          source: sourceId,
                          target: targetId,
                          weight: 0,
                          disabled: 0,
                        });
                      }
                    });
                  });
    
                  // Convert nodesMap to an array.
                  let nodes = Object.values(nodesMap);
    
                  // Sort nodes by the numeric part of their id.
                  nodes.sort((a, b) => {
                    const numA = parseInt(a.id.replace("CR", ""));
                    const numB = parseInt(b.id.replace("CR", ""));
                    return numA - numB;
                  });
    
                  // Convert link source/target from strings to actual node objects.
                  links.forEach((link) => {
                    link.source = nodesMap[link.source];
                    link.target = nodesMap[link.target];
                  });
    
                  setTradeEdgeScales(links);
    
                  allNodes = nodes;
                  allLinks = links;
                  // Initially, only links with weight > 0 are considered "enabled".
                  enabledLinks = links.filter((l) => l.weight > 0);
                  nonZeroLinks = links.filter((l) => l.weight > 0);
                  activeNodes = nodes.filter((n) => n.active);
    
                  // Set display names for nodes.
                  allNodes.forEach((d) => {
                    d.statnaam =
                      nlLabelPoints && nlLabelPoints.features
                        ? nlLabelPoints.features.find(
                            (f) => f.properties.statcode === d.id,
                          )?.properties.statnaam || d.id
                        : d.id;
                  });
                }
    
                if (hasTime) {
                  // Extend Date prototype with getWeekNumber method
                  Date.prototype.getWeekNumber = function () {
                    const d = new Date(
                      Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()),
                    );
                    // Set to nearest Thursday: current date + 4 - current day number, with Sunday as 7
                    const dayNum = d.getUTCDay() || 7;
                    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
                    // Get first day of year
                    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                    // Calculate full weeks to nearest Thursday
                    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
                  };
    
                  // Find the actual column name that equals "time" (preserving original casing).
                  const timeCol = data.columns.find(
                    (h) => h.toLowerCase() === "time",
                  );
                  data.forEach((d) => {
                    d.time = new Date(d[timeCol]);
                  });
    
                  // Get unique dates and sort them.
                  uniqueDates = Array.from(
                    new Set(data.map((d) => d.time.getTime())),
                  )
                    .map((t) => new Date(t))
                    .sort((a, b) => a - b);
    
                  // Append time control widgets to the preexisting container.
                  let timeControls = document.getElementById(
                    "timeControlsContainer",
                  );
                  // Make sure the container is visible.
                  timeControls.style.display = "flex";
                  const timeAuthorCredit =
                    document.getElementById("timeAuthorCredit");
                  if (timeAuthorCredit) {
                    timeAuthorCredit.style.display = "flex";
                  }
                  // Clear any previous content.
                  timeControls.innerHTML = "";
    
                  // Create "Play/Pause" button.
                  const playPauseBtn = document.createElement("button");
                  playPauseBtn.id = "playPauseBtn";
                  playPauseBtn.className = "has-tip";
                  playPauseBtn.dataset.tipPlacement = "top";
                  setControlTip(playPauseBtn, controlTips.play);
                  playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                  timeControls.appendChild(playPauseBtn);
    
                  // Create "From Start" button.
                  const fromStartBtn = document.createElement("button");
                  fromStartBtn.id = "fromStartBtn";
                  fromStartBtn.className = "has-tip";
                  fromStartBtn.dataset.tipPlacement = "top";
                  setControlTip(fromStartBtn, controlTips.fromStart);
                  fromStartBtn.innerHTML =
                    '<i class="fa-solid fa-clock-rotate-left"></i>';
                  timeControls.appendChild(fromStartBtn);
    
                  // Create a slider.
                  const slider = document.createElement("input");
                  slider.type = "range";
                  slider.id = "timeSlider";
                  slider.min = 0;
                  slider.max = uniqueDates.length - 1;
                  slider.value = 0;
                  timeControls.appendChild(slider);
    
                  let playInterval = null;
    
                  // Store the loaded data for later use.
                  loadedCSVData = data;
                  computeTemporalNetworkStats();
                  computeMaxTemporalNetworkStats();
    
                  // Function to update the network for a given date.
                  function updateNetworkForDate(selectedDate, fullData) {
                    window.currentDate = selectedDate;
                    const filteredData = fullData.filter(
                      (d) => d.time.getTime() === selectedDate.getTime(),
                    );
                    initNodesAndLinks(filteredData);
                    applySimulationFrame(selectedDate);
    
                    updateNetworkStats();
    
                    computeSCCs();
                    updateSCCs();
    
                    updateTemporalNetwork();
                    debouncedUpdateHotspotMarks();
                    updateDonutCharts();
                    updateGlobalStatsChart(window.currentSelectedStat);
                    updateNodeStatsChart(window.currentSelectedNodeStat);
                    updateTradeDistribution();
                  }

                  updateNetworkForDateHandler = updateNetworkForDate;
    
                  // Slider event.
                  slider.addEventListener("input", function () {
                    const idx = +slider.value;
                    updateNetworkForDate(uniqueDates[idx], loadedCSVData);
                    updateCurrentDateDisplay(uniqueDates[idx]);
                  });
    
                  // Shortcut for the slider
                  sliderKeyListener = function (event) {
                    let currentValue = +slider.value;
                    if (
                      event.key === "ArrowLeft" &&
                      !window.isSwitchingCSV &&
                      !window.isSwitchingAppMode &&
                      !window.isDoingTemporalUpdate
                    ) {
                      if (currentValue > +slider.min) {
                        slider.value = currentValue - 1;
                        const idx = +slider.value;
                        updateNetworkForDate(uniqueDates[idx], loadedCSVData);
                        updateCurrentDateDisplay(uniqueDates[idx]);
                      }
                    } else if (
                      event.key === "ArrowRight" &&
                      !window.isSwitchingCSV &&
                      !window.isSwitchingAppMode &&
                      !window.isDoingTemporalUpdate
                    ) {
                      if (currentValue < +slider.max) {
                        slider.value = currentValue + 1;
                        const idx = +slider.value;
                        updateNetworkForDate(uniqueDates[idx], loadedCSVData);
                        updateCurrentDateDisplay(uniqueDates[idx]);
                      }
                    }
                  };
                  document.addEventListener("keydown", sliderKeyListener);
    
                  // Play/Pause event.
                  playPauseBtn.addEventListener("click", function () {
                    if (playPauseBtn.innerHTML.includes("play")) {
                      window.isPlaying = true;
                      setControlTip(playPauseBtn, controlTips.pause);
                      playPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
                      playInterval = setInterval(() => {
                        let currentIdx = +slider.value;
                        if (currentIdx < uniqueDates.length - 1) {
                          slider.value = currentIdx + 1;
                          updateNetworkForDate(uniqueDates[slider.value], data);
                          updateCurrentDateDisplay(uniqueDates[slider.value]);
                        } else {
                          clearInterval(playInterval);
                          setControlTip(playPauseBtn, controlTips.play);
                          playPauseBtn.innerHTML =
                            '<i class="fa-solid fa-play"></i>';
                        }
                      }, 1000);
                    } else {
                      setControlTip(playPauseBtn, controlTips.play);
                      playPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                      clearInterval(playInterval);
                      window.isPlaying = false;
                    }
                  });
    
                  // Shortcut for the play/pause button
                  playPauseKeyListener = function (event) {
                    if (
                      event.key === " " &&
                      !window.isSwitchingCSV &&
                      !window.isSwitchingAppMode &&
                      !window.isDoingTemporalUpdate
                    ) {
                      // Space key pressed
                      const playPauseBtn = document.getElementById("playPauseBtn");
                      if (playPauseBtn && !playPauseBtn.disabled) {
                        playPauseBtn.click();
                        if (window.isPlaying) {
                          disableAllButtons();
                          disableAllCheckboxes();
                        } else {
                          enableAllButtons(10);
                          enableAllCheckboxes(10);
                        }
                      }
                    }
                  };
                  document.addEventListener("keydown", playPauseKeyListener);
    
                  // "From Start" event.
                  fromStartBtn.addEventListener("click", function () {
                    slider.value = 0;
                    updateNetworkForDate(uniqueDates[0], loadedCSVData);
                    updateCurrentDateDisplay(uniqueDates[0]);
                  });
    
                  // Shortcut for the from-start button
                  fromStartKeyListener = function (event) {
                    if (
                      event.key === "f" &&
                      !window.isSwitchingAppMode &&
                      !window.isSwitchingCSV &&
                      !window.isDoingTemporalUpdate
                    ) {
                      const fromStartBtn = document.getElementById("fromStartBtn");
                      if (fromStartBtn && !fromStartBtn.disabled) {
                        fromStartBtn.click();
                      }
                    }
                  };
                  document.addEventListener("keydown", fromStartKeyListener);
                }
    
                if (!hasTime) {
                  timeControls.style.display = "none";
                  const timeAuthorCredit =
                    document.getElementById("timeAuthorCredit");
                  if (timeAuthorCredit) {
                    timeAuthorCredit.style.display = "none";
                  }
                  console.error("Time information not found in the CSV file.");
                }
    
                // For initial network, if time exists, filter by the first unique date.
                let initialData = data;
                if (hasTime && uniqueDates.length > 0) {
                  const firstDate = uniqueDates[0];
                  window.currentDate = firstDate;
                  initialData = data.filter(
                    (d) => d.time.getTime() === firstDate.getTime(),
                  );
                }
    
                // Build nodes and links.
                initNodesAndLinks(initialData);
                initAesthetics();
    
                updateNetworkStats();
                initNetwork((isReplot = false));
                updateTemporalNetwork();
                updateNetwork((instant = true));
                updateDonutCharts();
                computeSCCs();
                updateSCCs();
    
                updateGlobalStatsChart(window.currentSelectedStat);
                updateNodeStatsChart(window.currentSelectedNodeStat);
                updateCurrentDateDisplay(window.currentDate);
                updateTradeDistribution();
                disableAllCheckboxes();
    
                window.isSwitchingCSV = false;
    
                enableAllButtons(550);
                enableAllCheckboxes(550);

                if (isSimulationModeActive()) {
                  recomputeSimulationTrajectory("Preparing simulation trajectory");
                }
              })
              .catch(function (error) {
                console.error("Error loading trade data:", error);
              });

            if (!persistentUiHandlersBound) {
              window.addEventListener("resize", matchButtonWidths);

              document
                .getElementById("statSelect")
                .addEventListener("change", function () {
                  window.currentSelectedStat = this.value;
                  updateGlobalStatsChart(window.currentSelectedStat);
                });

              window.addEventListener("resize", () => {
                updateGlobalStatsChart(
                  window.currentSelectedStat || "totalTradeVolume",
                );
              });

              document
                .getElementById("nodeStatSelect")
                .addEventListener("change", function () {
                  window.currentSelectedNodeStat = this.value;
                  updateNodeStatsChart(window.currentSelectedNodeStat);
                });

              window.addEventListener("resize", () => {
                updateNodeStatsChart(
                  window.currentSelectedNodeStat || "eigenvector",
                );
              });

              const tradeNodeInsightSelect = document.getElementById(
                "tradeNodeInsightSelect",
              );
              if (tradeNodeInsightSelect) {
                tradeNodeInsightSelect.value =
                  window.currentSelectedTradeNodeInsight || "partnerBalance";
                tradeNodeInsightSelect.addEventListener("change", function () {
                  window.currentSelectedTradeNodeInsight = this.value;
                  updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
                });
              }

              window.addEventListener("resize", () => {
                updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
              });

              window.addEventListener("resize", updateTradeDistribution);
              window.addEventListener("resize", updateNodeTradeDistribution);
              window.addEventListener("resize", updateSCCs);
              window.addEventListener("resize", updateInOutArbos);

              persistentUiHandlersBound = true;
            }
          }
    
          // Intro overlay
    
          (() => {
            const PREF_KEY = "hideIntro";
    
            let kbd = null;
            let lines = [];
            let keyboardReadyObserver = null;
    
            const introOverlay = document.getElementById("introOverlay");
            const okBtn = document.getElementById("introOkButton");
            const dontShowAgain = document.getElementById("dontShowAgain");
            const helpBtn = document.getElementById("helpOverlayButton");
    
            function overlayIsOpen() {
              if (!introOverlay) return false;
              if (introOverlay.style.display === "none") return false;
              if (introOverlay.classList.contains("hide")) return false;
              return true;
            }
    
            function cleanupLines() {
              lines.forEach((l) => {
                try {
                  l.remove();
                } catch (e) {}
              });
              lines = [];
            }
    
            function positionLinesRepeated() {
              let i = 0;
              const t = setInterval(() => {
                lines.forEach((l) => {
                  try {
                    l.position();
                  } catch (e) {}
                });
                if (++i > 14) clearInterval(t);
              }, 50);
            }
    
            function buildKeyboard() {
              const Keyboard = window.SimpleKeyboard?.default;
              if (!Keyboard) throw new Error("SimpleKeyboard not loaded");
    
              // Build the keyboard once and reuse it.
              if (kbd) return;
    
              kbd = new Keyboard(".introKeyboard", {
                theme:
                  "introKeyboard simple-keyboard hg-theme-default hg-layout-default",
                layout: {
                  default: [
                    "q w e r t y u i o p",
                    "a s d f g h j k l",
                    "z x c v b n m",
                    "{space}",
                    "{arrowleft} {arrowup} {arrowdown} {arrowright}",
                  ],
                },
                display: {
                  "{space}": "SPACE",
                  "{arrowleft}": "←",
                  "{arrowup}": "↑",
                  "{arrowdown}": "↓",
                  "{arrowright}": "→",
                },
                buttonTheme: [
                  {
                    class: "intro-key--hot",
                    buttons:
                      "s e m h q r f {space} {arrowleft} {arrowup} {arrowdown} {arrowright}",
                  },
                ],
                onChange: () => {},
                onKeyPress: () => {},
              });
            }
    
            function connect(key, dotId, lineSockets = {}) {
              const dot = document.getElementById(dotId);
              if (!dot) return null;
    
              const btnMaybe = kbd.getButtonElement(key);
              const btn = Array.isArray(btnMaybe) ? btnMaybe[0] : btnMaybe;
              if (!btn) return null;
    
              const isArrow =
                key === "{arrowleft}" ||
                key === "{arrowright}" ||
                key === "{arrowup}" ||
                key === "{arrowdown}";
    
              const line = new LeaderLine(btn, dot, {
                path: "magnet",
                startSocket: lineSockets.start || (isArrow ? "bottom" : "auto"),
                endSocket:
                  lineSockets.end || (dotId === "introDotArrows" ? "top" : "auto"),
                startPlug: "disc",
                endPlug: "arrow3",
                size: 3,
                color: "rgba(255,0,0,0.95)",
                dash: { animation: true },
              });
    
              line.show("draw", { duration: 450 });
              return line;
            }
    
            function buildLines() {
              cleanupLines();
              if (!kbd) return;
              if (typeof LeaderLine === "undefined") return;
    
              const map = [
                ["s", "introDotS"],
                ["e", "introDotE", { start: "top", end: "right" }],
                ["m", "introDotM"],
                ["q", "introDotQ"],
                ["h", "introDotH"],
                ["r", "introDotR"],
                ["f", "introDotF"],
                ["{space}", "introDotSpace"],
                ["{arrowleft}", "introDotArrows"],
                ["{arrowright}", "introDotArrows"],
                ["{arrowup}", "introDotArrows"],
                ["{arrowdown}", "introDotArrows"],
              ];
    
              map.forEach(([k, id, sockets]) => {
                const ln = connect(k, id, sockets);
                if (ln) lines.push(ln);
              });
    
              positionLinesRepeated();
            }
    
            // Wait until simple-keyboard renders buttons, then draw connector lines.
            function ensureLinesWhenReady(timeoutMs = 2500) {
              if (!overlayIsOpen()) return;
    
              // If buttons already exist, draw lines now.
              const qBtnMaybe = kbd?.getButtonElement("q");
              const qBtn = Array.isArray(qBtnMaybe) ? qBtnMaybe[0] : qBtnMaybe;
              if (qBtn) {
                buildLines();
                return;
              }
    
              // Watch keyboard DOM changes until buttons appear.
              const kbRoot = document.querySelector("#introKeyboard");
              if (!kbRoot) {
                // Fallback retry.
                setTimeout(() => {
                  if (overlayIsOpen()) buildLines();
                }, 300);
                return;
              }
    
              // Clean up existing observer.
              if (keyboardReadyObserver) {
                try {
                  keyboardReadyObserver.disconnect();
                } catch (e) {}
                keyboardReadyObserver = null;
              }
    
              const start = performance.now();
    
              keyboardReadyObserver = new MutationObserver(() => {
                if (!overlayIsOpen()) return;
                const elMaybe = kbd?.getButtonElement("q");
                const el = Array.isArray(elMaybe) ? elMaybe[0] : elMaybe;
                if (el) {
                  try {
                    keyboardReadyObserver.disconnect();
                  } catch (e) {}
                  keyboardReadyObserver = null;
                  // Use two RAF ticks to let layout settle.
                  requestAnimationFrame(() => requestAnimationFrame(buildLines));
                } else if (performance.now() - start > timeoutMs) {
                  try {
                    keyboardReadyObserver.disconnect();
                  } catch (e) {}
                  keyboardReadyObserver = null;
                  buildLines(); // last attempt
                }
              });
    
              keyboardReadyObserver.observe(kbRoot, {
                childList: true,
                subtree: true,
              });
    
              // Final timeout fallback.
              setTimeout(() => {
                if (keyboardReadyObserver) {
                  try {
                    keyboardReadyObserver.disconnect();
                  } catch (e) {}
                  keyboardReadyObserver = null;
                  if (overlayIsOpen()) buildLines();
                }
              }, timeoutMs);
            }
    
            function openIntro(force = false) {
              if (!introOverlay) return;
    
              if (!force && localStorage.getItem(PREF_KEY) === "true") {
                introOverlay.style.display = "none";
                introOverlay.classList.add("hide");
                return;
              }
    
              introOverlay.style.display = "flex";
              introOverlay.style.pointerEvents = "auto";
              introOverlay.classList.remove("hide");
    
              buildKeyboard();
              ensureLinesWhenReady();
            }
    
            function closeIntro(persist = true) {
              if (!introOverlay) return;
    
              if (persist && dontShowAgain?.checked) {
                localStorage.setItem(PREF_KEY, "true");
              }
    
              // Stop blocking clicks immediately.
              introOverlay.style.pointerEvents = "none";
    
              // Fade out overlay.
              introOverlay.classList.add("hide");
    
              // Remove connector lines; they live outside the overlay.
              cleanupLines();
            }
    
            // After fade-out, remove overlay from layout to avoid blocking clicks.
            if (introOverlay) {
              introOverlay.addEventListener("animationend", (e) => {
                if (e.animationName !== "overlayFadeOut") return;
                if (!introOverlay.classList.contains("hide")) return;
                introOverlay.style.display = "none";
              });
            }
    
            // Button bindings
            okBtn?.addEventListener("click", () => closeIntro(true));
            helpBtn?.addEventListener("click", () => openIntro(true));
    
            // Reposition lines when the window resizes.
            window.addEventListener("resize", () => {
              if (!overlayIsOpen()) return;
              lines.forEach((l) => {
                try {
                  l.position();
                } catch (e) {}
              });
            });
    
            openIntro(false);
    
            // Expose a minimal API for hotkeys and UI controls.
            window.isIntroOverlayOpen = function () {
              const overlay = document.getElementById("introOverlay");
              if (!overlay) return false;
              if (overlay.style.display === "none") return false;
              if (overlay.classList.contains("hide")) return false;
              return true;
            };
    
            window.openIntroOverlay = function (force = false) {
              openIntro(force);
            };
    
            window.closeIntroOverlay = function (persist = true) {
              closeIntro(persist);
            };
          })();
    
          // Animated network logo
    
          // Initialize Vivus animation for the card header SVG.
          var drawDuration = 24;
          var myAnim = new Vivus("mySVG", {
            duration: drawDuration,
            start: "autostart",
            type: "scenario-sync",
          });
    
          var animator = function () {
            myAnim.play();
          };
    
          function fadeInNodes(step, maxStep) {
            setTimeout(() => {
              // Select nodes for the current animation step.
              const nodes = document.querySelectorAll(".circle.step" + step);
              nodes.forEach((node) => {
                node.classList.add("blue-bg");
              });
              if (step < maxStep) {
                fadeInNodes(++step, maxStep);
              }
            }, 1000);
          }
    
          setTimeout(() => {
            fadeInNodes(1, 5);
          }, 1000);
    
          // Other UI logic
    
          // Disable all controls, then optionally re-enable them after a timeout.
          function disableAllButtons() {
            d3.selectAll(".csv-switcher, .mode-switcher-frame").classed(
              "disabled",
              true,
            );
            d3.select("#mapLayerButton").attr("disabled", true);
            d3.select("#toggleModeButton").attr("disabled", true);
            d3.select("#screenshotButton").attr("disabled", true);
            d3.select("#restoreButton").attr("disabled", true);
          }
    
          function enableAllButtons(timeoutVal) {
            if (!window.isPlaying) {
              d3.timeout(() => {
                if (appModeSwitchLocked) return;
                d3.selectAll(".csv-switcher").classed("disabled", false);
                if (simulationState.status !== "running") {
                  d3.selectAll(".mode-switcher-frame").classed("disabled", false);
                }
                d3.select("#mapLayerButton").attr("disabled", true);
                d3.select("#toggleModeButton").attr("disabled", null);
                d3.select("#screenshotButton").attr("disabled", null);
                d3.select("#restoreButton").attr("disabled", null);
              }, timeoutVal);
            }
          }
    
          function disableAllCheckboxes() {
            // Disable link checkboxes.
            d3.selectAll(".trade-checkbox").property("disabled", true);
            // Disable header checkboxes.
            d3.selectAll(".trade-header-checkbox").property("disabled", true);
          }
    
          function enableAllCheckboxes(timeoutVal) {
            if (!window.isPlaying) {
              d3.timeout(() => {
                if (appModeSwitchLocked) return;
                // Enable link checkboxes.
                d3.selectAll(".trade-checkbox").property("disabled", false);
                // Enable header checkboxes.
                d3.selectAll(".trade-header-checkbox").property("disabled", false);
              }, timeoutVal);
            }
          }
    
          document
            .getElementById("mapLayerButton")
            .addEventListener("click", function () {
              if (this.disabled) {
                return;
              }
              const menu = document.getElementById("mapLayerMenu");
              menu.classList.toggle("active");
            });
    
          // Save the current SVG as a PNG file.
          function downloadSvg() {
            // Generate a filename from timestamp and random suffix.
            const timestamp = new Date()
              .toISOString()
              .replace(/[-:]/g, "")
              .replace("T", "_")
              .split(".")[0];
            const filename = `network_${timestamp}_${Math.random().toString(36).substring(7)}.png`;
    
            // Download the SVG as PNG.
            saveSvgAsPng(document.getElementById("mainFigureSVG"), filename);
          }
    
          // Screenshot button handler.
          document
            .getElementById("screenshotButton")
            .addEventListener("click", downloadSvg);
    
          // Restore button handler.
          document
            .getElementById("restoreButton")
            .addEventListener("click", restoreLinks);
    
          // Match screenshot and restore button widths.
          function matchButtonWidths() {
            const screenshotButton = document.getElementById("screenshotButton");
            const restoreButton = document.getElementById("restoreButton");
    
            if (screenshotButton && restoreButton) {
              const width = screenshotButton.offsetWidth; // Get the screenshot button's width
              restoreButton.style.width = width + "px"; // Apply the same width to restore button
            }
          }
    
          matchButtonWidths();

          function isShortcutTextTarget(target) {
            const tag = target?.tagName ? target.tagName.toLowerCase() : "";
            return (
              tag === "input" ||
              tag === "textarea" ||
              tag === "select" ||
              Boolean(target?.isContentEditable)
            );
          }
	    
          // Keyboard shortcuts
    
          // Shortcut: press "s" to take a screenshot.
          const screenshotButton = document.getElementById("screenshotButton");
          document.addEventListener("keydown", function (event) {
            if (
              event.key === "s" &&
              !window.isSwitchingCSV &&
              !window.isSwitchingAppMode &&
              !window.isPlaying &&
              !window.isDoingTemporalUpdate
            ) {
              if (
                !screenshotButton.disabled &&
                !window.isSwitchingCSV &&
                !window.isSwitchingAppMode &&
                !window.isPlaying &&
                !window.isDoingTemporalUpdate
              ) {
                event.preventDefault();
                screenshotButton.click();
              }
            }
          });

          // Shortcut: press "m" to toggle network mode.
          const toggleModeButton = document.getElementById("toggleModeButton");
          document.addEventListener("keydown", function (event) {
            if (
              event.key === "m" &&
              !window.isSwitchingCSV &&
              !window.isSwitchingAppMode &&
              !window.isPlaying &&
              !window.isDoingTemporalUpdate
            ) {
              if (
                !toggleModeButton.disabled &&
                !window.isSwitchingCSV &&
                !window.isSwitchingAppMode &&
                !window.isPlaying &&
                !window.isDoingTemporalUpdate
              ) {
                event.preventDefault();
                toggleModeButton.click();
              }
            }
          });

          document.addEventListener("keydown", function (event) {
            if (
              event.key.toLowerCase() !== "e" ||
              event.repeat ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey ||
              isShortcutTextTarget(event.target) ||
              window.isSwitchingCSV ||
              window.isSwitchingAppMode ||
              window.isPlaying ||
              window.isDoingTemporalUpdate ||
              window.isIntroOverlayOpen?.()
            ) {
              return;
            }

            const nextMode = isSimulationModeActive() ? "trade" : "simulation";
            const nextValue =
              nextMode === "simulation" ? "simulation" : "trade-ledger";
            const nextInput = document.querySelector(
              `.mode-switcher input[name="modeType"][value="${nextValue}"]`,
            );

            if (!nextInput || nextInput.disabled || !canSwitchAppDataMode()) {
              syncModeSwitcherRadios();
              return;
            }

            event.preventDefault();
            nextInput.checked = true;
            nextInput.dispatchEvent(new Event("change", { bubbles: true }));
          });

          // Shortcut: press "q" to exit focus mode.
          // Clears node focus using clearSelection(false).
          document.addEventListener("keydown", function (event) {
            if (
              event.key === "q" &&
              !window.isSwitchingCSV &&
              !window.isSwitchingAppMode &&
              !window.isDoingTemporalUpdate
            ) {
              event.preventDefault();
              if (selectedNodeData) {
                clearSelection(false);
              }
            }
          });

          // Shortcut: press "r" to restore links.
          const restoreButton = document.getElementById("restoreButton");
          document.addEventListener("keydown", function (event) {
            if (
              event.key === "r" &&
              !window.isSwitchingCSV &&
              !window.isSwitchingAppMode &&
              !window.isPlaying &&
              !window.isDoingTemporalUpdate
            ) {
              if (!restoreButton.disabled) {
                event.preventDefault();
                restoreButton.click();
              }
            }
          });
    
          // Shortcut: press Space to play/pause time replay.
          // Listener is registered where the control is created.
    
          // Shortcut: press "f" to play/pause time replay.
          // Listener is registered where the control is created.
    
          // Shortcut: left/right arrows adjust the time slider.
          // Listener is registered where the control is created.
    
          // Shortcut: up/down arrows switch focal nodes.
          document.addEventListener("keydown", function (e) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              if (
                !window.isSwitchingCSV &&
                !window.isSwitchingAppMode &&
                !window.isPlaying &&
                !window.isDoingTemporalUpdate
              ) {
                e.preventDefault();
    
                // Get all node elements attached to .nodeGroup.
                const nodesArray = d3.selectAll(".nodeGroup").nodes();
                if (!nodesArray.length) return;
    
                // Resolve the current index from selectedNodeData.
                let currentIndex = -1;
                if (selectedNodeData) {
                  currentIndex = nodesArray.findIndex(
                    (el) => el.__data__.id === selectedNodeData.id,
                  );
                }
                // Default to the first node if nothing is selected.
                if (currentIndex === -1) {
                  currentIndex = 0;
                } else {
                  // ArrowDown moves forward; ArrowUp moves backward.
                  if (e.key === "ArrowDown") {
                    currentIndex = (currentIndex + 1) % nodesArray.length;
                  } else if (e.key === "ArrowUp") {
                    currentIndex =
                      (currentIndex - 1 + nodesArray.length) % nodesArray.length;
                  }
                }
    
                // Resolve node data from allNodes.
                const selectedNode = allNodes.find(
                  (n) => n.id === nodesArray[currentIndex].__data__.id,
                );
    
                // Focus the node via debouncedOnClickNode.
                debouncedOnClickNode("click", selectedNode);
              }
            }
          });
    
          // Shortcut: press "h" to toggle the intro overlay.
          document.addEventListener("keydown", function (event) {
            // Do not intercept typing in editable fields.
            const t = event.target;
            const tag = t && t.tagName ? t.tagName.toLowerCase() : "";
            if (tag === "input" || tag === "textarea" || (t && t.isContentEditable))
              return;
    
            if (event.key === "h" || event.key === "H") {
              event.preventDefault();
    
              if (window.isIntroOverlayOpen && window.isIntroOverlayOpen()) {
                // Close without persisting "don't show again".
                window.closeIntroOverlay?.(false);
              } else {
                // Open even if "don't show again" is set.
                window.openIntroOverlay?.(true);
              }
            }
          });
          // While intro overlay is open, block shortcuts except Tab and Escape.
          document.addEventListener(
            "keydown",
            function (event) {
              if (!window.isIntroOverlayOpen || !window.isIntroOverlayOpen())
                return;
    
              if (event.key === "Tab") return;
    
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                window.closeIntroOverlay?.(false);
                return;
              }
    
              // Allow "h" to close while overlay is open.
              if (event.key === "h" || event.key === "H") {
                event.preventDefault();
                event.stopImmediatePropagation();
                window.closeIntroOverlay?.(false);
                return;
              }
    
              event.preventDefault();
              event.stopImmediatePropagation();
            },
            true,
          );

          Promise.all([mapDataReady, labelPointsReady])
            .then(bootstrapHerdLink)
            .catch((error) => {
              console.error("Error starting HerdLink:", error);
            });
  }

  window.addEventListener("herdlink:mount", initHerdLinkRuntime, { once: true });

  if (document.getElementById("mainContainer")) {
    initHerdLinkRuntime();
  }
})();
