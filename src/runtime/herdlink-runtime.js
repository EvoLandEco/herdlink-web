(() => {
  let initialized = false;

  function initHerdLinkRuntime() {
    if (initialized) {
      return;
    }

    initialized = true;

    // Global state
          let loadedCSVData = null;
          const simulationRegionIdsByDataset = new WeakMap();
          const tradeRecordsByDataset = new WeakMap();
          const originalLedgerStatsByDataset = new WeakMap();
          let presetDailyData = null;
          let presetDailyDates = [];
          let presetDailyDataPromise = null;
          let presetDailyDataError = null;
          let presetTargetBudget = 3;
          let presetResponseDays = 7;
          let presetStandstillDays = 14;
          let simulationIntroductionDate = null;
          let simulationPresetHoldings = null;
          let tradeCommunityTimeline = null;
          let communityScale = "finer";
          let communityView = "flow";
          let communityFlowGeometry = null;
          let communityFlowLayoutId = 0;
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
          const themeStyles = getComputedStyle(document.documentElement);
          const theme = {
            text: themeStyles.getPropertyValue("--color-text").trim(),
            muted: themeStyles.getPropertyValue("--color-text-muted").trim(),
            surface: themeStyles.getPropertyValue("--color-surface").trim(),
            elevated: themeStyles.getPropertyValue("--color-surface-strong").trim(),
            canvas: themeStyles.getPropertyValue("--color-canvas").trim(),
            border: themeStyles.getPropertyValue("--color-border").trim(),
            grid: themeStyles.getPropertyValue("--color-chart-grid").trim(),
            accent: themeStyles.getPropertyValue("--color-accent").trim(),
            onAccent: themeStyles.getPropertyValue("--color-on-accent").trim(),
            incoming: themeStyles.getPropertyValue("--color-chart-incoming").trim(),
            outgoing: themeStyles.getPropertyValue("--color-chart-outgoing").trim(),
            font: themeStyles.getPropertyValue("--font-body").trim(),
          };
          const tradeIntensity = d3.interpolateRgb(theme.accent, "#364f67");
          const exposureIntensity = d3.interpolateRgb("#634350", "#ffb599");
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
          let ledgerHotspotsMax = null;
          const numberPrintedHotspots = 3;
          let edgeExtent, edgeColor, nodeColor, nodeSize;
          const hotspotStyles = {
            inDegree: { color: "#009e73", dash: "none", pattern: "Solid" },
            outDegree: { color: "#56b4e9", dash: "10 5", pattern: "Long dash" },
            betweenness: { color: "#e69f00", dash: "0 5", pattern: "Dotted" },
            pageRank: { color: "#f0e442", dash: "8 4 0 4", pattern: "Dash and dot" },
            eigenvector: { color: "#cc79a7", dash: "3 5", pattern: "Short dash" },
          };
          const hotspotRingSpacing = 4;
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
            S: "#7ccbae",
            E: "#f1c77b",
            I: "#f28b96",
            R: "#78b8ed",
          };
          const simulationCompartmentLabels = {
            S: "Susceptible",
            E: "Exposed",
            I: "Infectious",
            R: "Recovered",
          };

          function setLedgerHotspotsMax(maxNodeStats) {
            ledgerHotspotsMax = { ...maxNodeStats };
            window.maxTemporalNodeStats = ledgerHotspotsMax;
            hotspotsMax = ledgerHotspotsMax;
          }

          function restoreLedgerHotspotsMax() {
            if (ledgerHotspotsMax) {
              hotspotsMax = ledgerHotspotsMax;
            }
          }

          function resetRadarRenderState() {
            window.prevRadarPoints = {};
            window.prevRadarVertices = {};
            d3.selectAll(
              "svg.custom-radar path, svg.custom-radar line, svg.custom-radar circle.vertex",
            ).interrupt();
          }
          const simulationPrevalenceScale = d3
            .scaleSequential(
              d3.interpolateRgbBasis([
                "#263b4c",
                "#46526a",
                "#79637a",
                "#af7a87",
                "#db9b97",
                "#ffcca8",
              ]),
            )
            .domain([0, 0.35])
            .clamp(true);
          const simulationPrevalenceTextScale = d3
            .scaleSequential(
              d3.interpolateRgbBasis([
                "#a5b5c8",
                "#b5bbca",
                "#c7b9ca",
                "#ddb2bf",
                "#efb7b2",
                "#ffcca8",
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
          const simulationLinkInterventions = new Map();
          const simulationNodeInterventions = new Map();
          const networkStatsDirtyDates = new Set();
          let networkStatsDirtyFrom = null;
          let ledgerBaselineSpectralRadius = 0;
          let simulationControlView = "links";
          let simulationNodeControlsPanel = null;
          let simulationState = {
            status: "idle",
            settings: null,
            trajectory: null,
            currentFrame: null,
            currentDateKey: null,
            metricMax: null,
          };
          const comparisonDataCache = new Map();
          let comparisonDataError = null;

          function isSimulationModeActive() {
            return appDataMode === "simulation";
          }

          function areNetworkControlsLocked() {
            return window.isPlaying || window.isSwitchingCSV || appModeSwitchLocked ||
              simulationState.status === "running";
          }

          function getNodeId(value) {
            return typeof value === "object" ? value.id : value;
          }

          function getLinkKey(source, target) {
            return `${getNodeId(source)}-${getNodeId(target)}`;
          }

          function getTradeRecordsByDate(data) {
            if (tradeRecordsByDataset.has(data)) return tradeRecordsByDataset.get(data);
            const recordsByDate = new Map();
            for (const row of data) {
              const time = row.time.getTime();
              if (!recordsByDate.has(time)) recordsByDate.set(time, []);
              recordsByDate.get(time).push(row);
            }
            tradeRecordsByDataset.set(data, recordsByDate);
            return recordsByDate;
          }

          function setSimulationLinkIntervention(key, disabled, date) {
            const time = date.getTime();
            networkStatsDirtyDates.add(time);
            if (disabled && !simulationLinkInterventions.has(time)) {
              simulationLinkInterventions.set(time, new Map());
            }
            const changes = simulationLinkInterventions.get(time);
            if (disabled) changes.set(key, true);
            else if (changes) {
              changes.delete(key);
              if (!changes.size) simulationLinkInterventions.delete(time);
            }
          }

          function getSimulationLinkAvailability(date, interventions = simulationLinkInterventions) {
            return new Set(date ? interventions.get(date.getTime())?.keys() : []);
          }

          function setSimulationNodeIntervention(id, direction, allowed, date) {
            const time = date.getTime();
            networkStatsDirtyFrom = networkStatsDirtyFrom === null
              ? time : Math.min(networkStatsDirtyFrom, time);
            if (!simulationNodeInterventions.has(time)) {
              simulationNodeInterventions.set(time, new Map());
            }
            const changes = simulationNodeInterventions.get(time);
            changes.set(id, { ...changes.get(id), [direction]: allowed });
          }

          function setAllSimulationNodePermissions(direction, allowed, date) {
            const permissions = getSimulationNodePermissions(date);
            for (const id of collectSimulationRegionIds(loadedCSVData)) {
              if ((permissions.get(id)?.[direction] ?? true) !== allowed) {
                setSimulationNodeIntervention(id, direction, allowed, date);
              }
            }
          }

          function getSimulationNodePermissions(date) {
            const permissions = new Map();
            if (!date) return permissions;
            const interventions = Array.from(simulationNodeInterventions)
              .sort(([a], [b]) => a - b);
            for (const [time, changes] of interventions) {
              if (time > date.getTime()) break;
              applySimulationNodePermissions(permissions, changes, time);
            }
            return permissions;
          }

          function applySimulationNodePermissions(permissions, changes, time) {
            for (const [id, directions] of changes) {
              const permission = permissions.get(id) || { exports: true, imports: true };
              for (const [direction, allowed] of Object.entries(directions)) {
                if (permission[direction] === allowed) continue;
                permission[direction] = allowed;
                permission[`${direction}Since`] = time;
              }
              permissions.set(id, permission);
            }
          }

          function getSimulationRestrictionTimeline(ids, dates, interventions = simulationNodeInterventions) {
            const events = Array.from(interventions).sort(([a], [b]) => a - b);
            const times = dates.map((date) => date.getTime()).concat(events.map(([time]) => time));
            if (!times.length) return { start: null, end: null, rows: [] };
            const start = Math.min(...times);
            const end = Math.max(...times);
            const regions = new Map(ids.map((id) => [id, {
              id, segments: [], points: [], cursor: start,
              exports: true, imports: true, restricted: false,
            }]));
            for (const [time, changes] of events) {
              for (const [id, directions] of changes) {
                const region = regions.get(id);
                if (!region) continue;
                const changed = {};
                for (const direction of ["exports", "imports"]) {
                  if (direction in directions && directions[direction] !== region[direction]) {
                    changed[direction] = directions[direction];
                  }
                }
                if (!Object.keys(changed).length) continue;
                if (time > region.cursor) {
                  region.segments.push({
                    start: region.cursor, end: time,
                    exports: region.exports, imports: region.imports,
                  });
                }
                Object.assign(region, changed);
                region.cursor = time;
                region.restricted ||= !region.exports || !region.imports;
                region.points.push({
                  time, exports: region.exports, imports: region.imports, changes: changed,
                });
              }
            }
            const rows = [];
            for (const region of regions.values()) {
              if (!region.restricted) continue;
              if (region.cursor < end) {
                region.segments.push({
                  start: region.cursor, end, exports: region.exports, imports: region.imports,
                });
              }
              rows.push({ id: region.id, segments: region.segments, points: region.points });
            }
            return { start, end, rows };
          }

          function getDisabledLinkKeys(date, ids, permissions = getSimulationNodePermissions(date), linkInterventions = simulationLinkInterventions) {
            const disabledKeys = getSimulationLinkAvailability(date, linkInterventions);
            if (!permissions.size) return disabledKeys;
            ids = ids || collectSimulationRegionIds(loadedCSVData || []);
            for (const [id, permission] of permissions) {
              for (const partner of ids) {
                if (id === partner) continue;
                if (!permission.exports) disabledKeys.add(getLinkKey(id, partner));
                if (!permission.imports) disabledKeys.add(getLinkKey(partner, id));
              }
            }
            return disabledKeys;
          }

          function getSimulationTrajectoryPath(data, generator, boundaryIndices = simulationState.trajectory.boundaryIndices) {
            if (!data.length) return null;
            const paths = [];
            let start = 0;
            for (const index of boundaryIndices) {
              if (index >= data.length) break;
              if (index - start > 1) {
                paths.push(generator.curve(d3.curveMonotoneX)(data.slice(start, index)));
              }
              paths.push(generator.curve(d3.curveStepAfter)(data.slice(index - 1, index + 1)));
              start = index;
            }
            if (data.length - start > 1 || !paths.length) {
              paths.push(generator.curve(d3.curveMonotoneX)(data.slice(start)));
            }
            return paths.filter(Boolean).join("");
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
            { x, date, height, rangeWidth = 12, lineColor = theme.muted },
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
            if (!color) return theme.onAccent;
            const luminance =
              (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
            return luminance < 0.56 ? "#fff" : theme.onAccent;
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
              .scaleSequential(tradeIntensity)
              .domain([edgeExtent[1], edgeExtent[0]]);
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
                <label class="simulation-seed-region">
                  Seed region
                  <select id="simulationSeedRegion">
                    <option value="CR35">CR35</option>
                  </select>
                </label>
                <label class="simulation-introduction-date">
                  Introduction date
                  <input id="simulationIntroductionDate" type="date" aria-label="Simulation introduction date" title="Infection starts on this date. Load a preset to build its response schedule from this date.">
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

          function ensureSimulationNodeControls() {
            if (simulationNodeControlsPanel) return simulationNodeControlsPanel;
            const panel = document.createElement("section");
            panel.id = "simulationNodeControls";
            panel.className = "simulation-node-controls";
            panel.setAttribute("aria-label", "Imports and Exports");
            panel.hidden = true;
            panel.innerHTML = `
              <div class="simulation-node-controls-title panel-title-label">
                <span class="panel-label-text"><i class="fa-solid fa-arrow-right-arrow-left"></i> Imports &amp; Exports</span>
                <button class="panel-info-button has-tip" type="button" data-tip-key="importsExports" data-tip-placement="left" aria-label="Imports and Exports guide">
                  <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                </button>
              </div>
              <div id="simulationRestrictionTimeline" class="simulation-restriction-timeline" role="group" aria-label="Import and export restriction timelines">
                <div class="simulation-restriction-scroll">
                  <div class="simulation-restriction-content">
                    <div class="simulation-restriction-axis" aria-hidden="true">
                      <span></span>
                      <div class="simulation-restriction-axis-range"><span></span><span></span></div>
                    </div>
                    <div class="simulation-restriction-rows"></div>
                  </div>
                </div>
                <p class="simulation-restriction-empty">No restrictions scheduled</p>
              </div>
              <div class="simulation-node-controls-body">
                <label class="simulation-node-search-label" for="simulationNodeSearch">Find a node</label>
                <input id="simulationNodeSearch" type="search" placeholder="Region name or code" autocomplete="off">
                <table class="simulation-node-permissions-table">
                  <caption id="simulationNodeCount"></caption>
                  <thead><tr>
                    <th scope="col">Node</th>
                    <th scope="col"><label class="simulation-node-bulk-label">All exports<input type="checkbox" class="simulation-node-permission simulation-node-bulk" data-direction="exports" aria-label="Allow exports for all regions"></label></th>
                    <th scope="col"><label class="simulation-node-bulk-label">All imports<input type="checkbox" class="simulation-node-permission simulation-node-bulk" data-direction="imports" aria-label="Allow imports for all regions"></label></th>
                  </tr></thead>
                  <tbody></tbody>
                </table>
              </div>
            `;
            panel.querySelector("#simulationNodeSearch").addEventListener("input", renderSimulationNodeControls);
            panel.addEventListener("keydown", (event) => event.stopPropagation());
            panel.addEventListener("keyup", (event) => event.stopPropagation());
            panel.addEventListener("click", (event) => {
              const point = event.target.closest(".simulation-restriction-point");
              if (!point || areNetworkControlsLocked()) return;
              const slider = document.getElementById("timeSlider");
              slider.value = point.dataset.frameIndex;
              slider.dispatchEvent(new Event("input", { bubbles: true }));
            });
            panel.addEventListener("change", (event) => {
              const input = event.target;
              if (!input.matches(".simulation-node-permission") || areNetworkControlsLocked()) return;
              const date = getCurrentSliderDate();
              if (!date) return;
              if (input.classList.contains("simulation-node-bulk")) {
                setAllSimulationNodePermissions(input.dataset.direction, input.checked, date);
              } else {
                setSimulationNodeIntervention(input.dataset.nodeId, input.dataset.direction, input.checked, date);
              }
              renderSimulationNodeControls();
              applyNetworkControlChanges("Applying import and export controls");
            });
            simulationNodeControlsPanel = panel;
            return panel;
          }

          function renderSimulationRestrictionTimeline(panel, ids, date) {
            const timeline = getSimulationRestrictionTimeline(ids, uniqueDates);
            const chart = d3.select(panel).select("#simulationRestrictionTimeline");
            chart.select(".simulation-restriction-empty").property("hidden", timeline.rows.length > 0);
            chart.select(".simulation-restriction-scroll").property("hidden", !timeline.rows.length);
            let minGap = Infinity;
            for (const row of timeline.rows) {
              const times = Array.from(new Set([timeline.start, ...row.points.map((point) => point.time), timeline.end])).sort((a, b) => a - b);
              for (let index = 1; index < times.length; index += 1) {
                minGap = Math.min(minGap, times[index] - times[index - 1]);
              }
            }
            chart.style("--restriction-rail-width", `${18 * (timeline.end - timeline.start) / minGap}px`);
            const dateLabel = (time) => d3.timeFormat("%Y-%m-%d")(new Date(time));
            const position = (time) => timeline.start === timeline.end
              ? 50 : 100 * (time - timeline.start) / (timeline.end - timeline.start);
            const stateClass = (state) => state.exports
              ? (state.imports ? "is-allowed" : "is-imports")
              : (state.imports ? "is-exports" : "is-both");
            const describeState = (state) => `Exports ${state.exports ? "allowed" : "blocked"}; imports ${state.imports ? "allowed" : "blocked"}.`;
            chart.select(".simulation-restriction-axis-range").selectAll("span")
              .data([timeline.start, timeline.end]).text((time) => time == null ? "" : dateLabel(time));
            const rows = chart.select(".simulation-restriction-rows")
              .selectAll(".simulation-restriction-row")
              .data(timeline.rows, (row) => row.id).join((enter) => {
                const row = enter.append("div").attr("class", "simulation-restriction-row");
                row.append("span").attr("class", "simulation-restriction-region has-tip")
                  .attr("tabindex", 0).attr("data-tip-placement", "left");
                const track = row.append("div").attr("class", "simulation-restriction-track");
                track.append("div").attr("class", "simulation-restriction-baseline").attr("aria-hidden", "true");
                track.append("div").attr("class", "simulation-restriction-cursor").attr("aria-hidden", "true");
                return row;
              }).attr("data-node-id", (row) => row.id);
            rows.select(".simulation-restriction-region")
              .text((row) => row.id).attr("data-tip", (row) => `${getStatnaam(row.id)} (${row.id})`);
            rows.each(function (row) {
              const name = `${getStatnaam(row.id)} (${row.id})`;
              const track = d3.select(this).select(".simulation-restriction-track");
              track.selectAll(".simulation-restriction-segment")
                .data(row.segments, (segment) => segment.start).join("span")
                .attr("class", (segment) => `simulation-restriction-segment has-tip ${stateClass(segment)}`)
                .attr("tabindex", 0).attr("role", "img").attr("data-tip-placement", "left")
                .attr("data-start", (segment) => segment.start)
                .attr("data-end", (segment) => segment.end)
                .style("left", (segment) => `${position(segment.start)}%`)
                .style("width", (segment) => `${position(segment.end) - position(segment.start)}%`)
                .attr("data-tip", (segment) => `${name}. From ${dateLabel(segment.start)} ${segment.end === timeline.end && row.points[row.points.length - 1].time < segment.end ? "onward" : `until ${dateLabel(segment.end)}`}. ${describeState(segment)}`)
                .attr("aria-label", function () { return this.dataset.tip; });
              const points = new Map([
                [timeline.start, { time: timeline.start, exports: true, imports: true }],
                [timeline.end, { ...row.points[row.points.length - 1], time: timeline.end, changes: null }],
              ]);
              for (const point of row.points) points.set(point.time, point);
              track.selectAll(".simulation-restriction-point")
                .data(Array.from(points.values()).sort((a, b) => a.time - b.time), (point) => point.time)
                .join("button")
                .attr("class", (point) => `simulation-restriction-point has-tip ${stateClass(point)}`)
                .classed("is-current", (point) => point.time === date.getTime())
                .attr("type", "button").attr("data-tip-placement", "left")
                .attr("data-time", (point) => point.time)
                .attr("data-frame-index", (point) => Math.min(d3.bisectLeft(uniqueDates, new Date(point.time)), uniqueDates.length - 1))
                .property("disabled", areNetworkControlsLocked())
                .style("left", (point) => `${position(point.time)}%`)
                .attr("data-tip", function (point) {
                  const state = ["exports", "imports"].map((direction) =>
                    `${direction === "exports" ? "Exports" : "Imports"} ${point[direction] ? (point.changes?.[direction] ? "reopened" : "allowed") : "blocked"}`).join("; ");
                  return `${name} · ${dateLabel(point.time)}. ${state}. Jump to ${dateLabel(uniqueDates[+this.dataset.frameIndex])}.`;
                })
                .attr("aria-label", function () { return this.dataset.tip; });
              track.select(".simulation-restriction-cursor").style("left", `${position(date.getTime())}%`);
            });
          }

          function renderSimulationNodeControls() {
            const panel = ensureSimulationNodeControls();
            panel.hidden = !selectedNodeData || simulationControlView !== "nodes";
            if (panel.hidden || !loadedCSVData) return;
            const date = getCurrentSliderDate();
            if (!date) return;
            const dateLabel = d3.timeFormat("%Y-%m-%d");
            const ids = collectSimulationRegionIds(loadedCSVData);
            panel.querySelector(".panel-info-button").dataset.tipKey = isSimulationModeActive() ? "importsExports" : "importsExportsTrade";
            const permissions = getSimulationNodePermissions(date);
            for (const direction of ["exports", "imports"]) {
              const input = panel.querySelector(`.simulation-node-bulk[data-direction="${direction}"]`);
              const allowedCount = ids.filter((id) => permissions.get(id)?.[direction] !== false).length;
              input.checked = allowedCount === ids.length;
              input.indeterminate = allowedCount > 0 && allowedCount < ids.length;
              input.disabled = areNetworkControlsLocked();
              input.title = `Allow ${direction} for all ${ids.length} regions, including regions outside the search results`;
            }
            renderSimulationRestrictionTimeline(panel, ids, date);
            const search = panel.querySelector("#simulationNodeSearch");
            const selectedId = selectedNodeData?.id || "";
            const selectionChanged = panel.dataset.selectedNode !== selectedId;
            if (selectionChanged) search.value = "";
            panel.dataset.selectedNode = selectedId;
            const query = search.value.trim().toLowerCase();
            const shownIds = ids.filter((id) => `${id} ${getStatnaam(id)}`.toLowerCase().includes(query));
            panel.querySelector("#simulationNodeCount").textContent =
              `${ids.length} nodes across the dataset${query ? ` · ${shownIds.length} shown` : ""}`;
            const rows = d3.select(panel).select("tbody").selectAll("tr")
              .data(shownIds, (id) => id).join((enter) => {
                const row = enter.append("tr");
                row.append("th").attr("scope", "row");
                for (const direction of ["exports", "imports"]) {
                  const cell = row.append("td");
                  cell.append("input")
                    .attr("type", "checkbox")
                    .attr("role", "switch")
                    .attr("class", "simulation-node-permission")
                    .attr("data-direction", direction);
                }
                return row;
              })
              .classed("is-selected", (id) => id === selectedId)
              .attr("data-node-id", (id) => id);
            rows.select("th").text((id) => `${getStatnaam(id)} (${id})`);
            rows.each(function (id) {
              const permission = permissions.get(id) || { exports: true, imports: true };
              for (const direction of ["exports", "imports"]) {
                const input = this.querySelector(`[data-direction="${direction}"]`);
                input.dataset.nodeId = id;
                input.checked = permission[direction];
                input.disabled = areNetworkControlsLocked();
                input.setAttribute("aria-label", `Allow ${direction} ${direction === "exports" ? "from" : "to"} ${getStatnaam(id)} (${id}) from ${dateLabel(date)}`);
              }
            });
            if (selectionChanged && selectedId && panel.isConnected) {
              panel.querySelector("tr.is-selected")?.scrollIntoView({ block: "nearest" });
            }
          }

          function readSimulationSettings() {
            ensureSimulationControls();
            syncSimulationIntroductionControl();
            const regionSelect = document.getElementById("simulationSeedRegion");
            const seedRegion = regionSelect.value;
            d3.select(regionSelect).selectAll("option")
              .data(collectSimulationRegionIds(loadedCSVData || [])).join("option")
              .attr("value", (id) => id)
              .text((id) => `${id} · ${getStatnaam(id)}`);
            regionSelect.value = seedRegion;
            return {
              introductionDate: getPresetSettings().introductionDate,
              ...(simulationPresetHoldings ? { holdings: { ...simulationPresetHoldings } } : {}),
              model: document.getElementById("simulationModel")?.value || "SEIR",
              seedRegion,
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
              ["holdings", "Preparing model population"],
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
                      html: '<i class="fa-regular fa-chart-scatter-bubble"></i> Trade vs Distance:',
                      tipKey: "gravityModel",
                      label: "Trade and distance guide",
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
                      html: '<i class="fa-regular fa-chart-scatter-bubble"></i> Trade vs Distance:',
                      tipKey: "nodeGravityModel",
                      label: "Regional trade and distance guide",
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
            if (simulationRegionIdsByDataset.has(data)) {
              return simulationRegionIdsByDataset.get(data);
            }
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
            const sortedIds = Array.from(ids).sort((a, b) => {
              const aNum = parseInt(String(a).replace("CR", ""));
              const bNum = parseInt(String(b).replace("CR", ""));
              return aNum - bNum;
            });
            simulationRegionIdsByDataset.set(data, sortedIds);
            return sortedIds;
          }

          function buildSimulationLedger(data, ids, dates = uniqueDates) {
            const ledgerByDate = new Map(
              dates.map((date) => [date.getTime(), []]),
            );
            const totals = new Map(ids.map((id) => [id, 0]));

            data.forEach((row) => {
              const source = row.COROP_LEV;
              const target = row.COROP_AFN;
              const weight = +row.AANTAL;
              if (
                !source ||
                !target ||
                source.toUpperCase() === "NA" ||
                target.toUpperCase() === "NA" ||
                !Number.isFinite(weight) || weight <= 0
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

          function getSimulationFrameSummary(nodeStates) {
            const summary = { S: 0, E: 0, I: 0, R: 0, N: 0, newInfections: 0, cumulativeInfections: 0 };
            Object.values(nodeStates).forEach((state) => {
              summary.S += state.S;
              summary.E += state.E;
              summary.I += state.I;
              summary.R += state.R;
              summary.N += state.N;
              summary.newInfections += state.newInfections || 0;
              summary.cumulativeInfections += state.cumulativeInfections || 0;
            });
            summary.prevalence = summary.N ? summary.I / summary.N : 0;
            summary.exposedShare = summary.N ? summary.E / summary.N : 0;
            return summary;
          }

          function buildSimulationTrajectory(settings, inputs = {}) {
            const {
              data = loadedCSVData,
              dates = uniqueDates,
              nodeInterventions = simulationNodeInterventions,
              linkInterventions = simulationLinkInterventions,
            } = inputs;
            if (!data || !dates.length) return null;

            const ids = collectSimulationRegionIds(data);
            const { ledgerByDate, totals } = buildSimulationLedger(
              data,
              ids,
              dates,
            );
            const holdings = settings.holdings
              ? new Map(ids.map((id) => [id, settings.holdings[id]]))
              : estimateSimulationHoldings(ids, totals);
            const seedIds = [settings.seedRegion];
            let current = new Map();

            ids.forEach((id) => {
              const N = holdings.get(id);
              if (!Number.isFinite(N) || N <= 0) {
                throw new Error(`Model population for ${id} must be a positive finite number.`);
              }
              current.set(id, { S: N, E: 0, I: 0, R: 0, N });
            });

            const introductionTime = settings.introductionDate ? Date.parse(settings.introductionDate) : dates[0].getTime();
            let introduced = false;

            const frameByKey = {};
            const frames = [];
            const boundaryIndices = [];
            const cumulativeInfections = new Map(ids.map((id) => [id, 0]));
            const nodeEvents = Array.from(nodeInterventions).sort(([a], [b]) => a - b);
            const permissions = new Map();
            let interventionIndex = 0;
            let previousAvailability;
            let previousDisabledKeys = new Set();

            dates.forEach((date, frameIndex) => {
              if (!introduced && date.getTime() >= introductionTime) {
                seedIds.forEach((id) => {
                  const state = current.get(id);
                  if (!state) return;
                  const seeded = Math.min(state.N, Math.max(1, settings.initialPct / 100 * state.N));
                  state.I = seeded;
                  state.S = state.N - seeded;
                });
                introduced = true;
              }
              let permissionsChanged = false;
              while (interventionIndex < nodeEvents.length && nodeEvents[interventionIndex][0] <= date.getTime()) {
                const [time, changes] = nodeEvents[interventionIndex++];
                applySimulationNodePermissions(permissions, changes, time);
                permissionsChanged = true;
              }
              const availability = linkInterventions.get(date.getTime());
              if (permissionsChanged || availability !== previousAvailability) {
                const disabledKeys = getDisabledLinkKeys(date, ids, permissions, linkInterventions);
                if (frameIndex > 0 && (disabledKeys.size !== previousDisabledKeys.size ||
                  Array.from(disabledKeys).some((key) => !previousDisabledKeys.has(key)))) {
                  boundaryIndices.push(frameIndex);
                }
                previousDisabledKeys = disabledKeys;
              }
              previousAvailability = availability;
              const records = ledgerByDate.get(date.getTime()) || [];
              const incomingLoad = new Map(ids.map((id) => [id, 0]));
              const externalIncomingLoad = new Map(ids.map((id) => [id, 0]));
              const outgoingLoad = new Map(ids.map((id) => [id, 0]));
              const newInfectionByNode = new Map(ids.map((id) => [id, 0]));
              const linkStates = new Map();

              records.forEach((record) => {
                const key = getLinkKey(record.source, record.target);
                if (availability?.has(key) || (record.source !== record.target &&
                  (permissions.get(record.source)?.exports === false || permissions.get(record.target)?.imports === false))) return;
                const sourceState = current.get(record.source);
                const targetState = current.get(record.target);
                if (!sourceState || !targetState || !sourceState.N || !targetState.N) {
                  return;
                }
                const sourcePrev = sourceState.I / sourceState.N;
                const targetPrev = targetState.I / targetState.N;
                const riskLoad = record.weight * sourcePrev * settings.movementBeta;
                const existing = linkStates.get(key) || {
                  source: record.source,
                  target: record.target,
                  local: record.source === record.target,
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
                if (record.source !== record.target) {
                  externalIncomingLoad.set(
                    record.target,
                    (externalIncomingLoad.get(record.target) || 0) + riskLoad,
                  );
                  outgoingLoad.set(
                    record.source,
                    (outgoingLoad.get(record.source) || 0) + riskLoad,
                  );
                }
              });

              const next = new Map();
              ids.forEach((id) => {
                const state = current.get(id);
                const N = state.N;
                const prevalence = state.I / N;
                const localForce = availability?.has(getLinkKey(id, id))
                  ? 0
                  : settings.beta * prevalence;
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
                  const localMovement = linkStates.get(key);
                  linkStates.set(key, {
                    source: id,
                    target: id,
                    ledgerWeight: localMovement?.ledgerWeight || 0,
                    riskLoad: (localMovement?.riskLoad || 0) + localLoad,
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
                const incoming = externalIncomingLoad.get(id) || 0;
                const outgoing = outgoingLoad.get(id) || 0;
                const prevalence = state.N ? state.I / state.N : 0;
                const exposedShare = state.N ? state.E / state.N : 0;
                const recoveredShare = state.N ? state.R / state.N : 0;
                const newInfections = newInfectionByNode.get(id) || 0;
                cumulativeInfections.set(id, cumulativeInfections.get(id) + newInfections);
                nodeStates[id] = {
                  ...state,
                  prevalence,
                  exposedShare,
                  recoveredShare,
                  incomingExposure: incoming,
                  outgoingPressure: outgoing,
                  newInfections: Math.max(0, newInfections),
                  cumulativeInfections: cumulativeInfections.get(id),
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
              boundaryIndices,
            };
          }

          function getComparisonInterventionEvents(dates, ids, mode, nodeInterventions = simulationNodeInterventions, linkInterventions = simulationLinkInterventions) {
            const groups = new Map();
            const regionLabel = (id) => {
              const name = getStatnaam(id);
              return name === id ? id : `${name} (${id})`;
            };
            const addEvent = (sampleDate, time, description) => {
              const date = sampleDate.toISOString();
              if (!groups.has(date)) groups.set(date, { date, events: [] });
              groups.get(date).events.push({ date: new Date(time).toISOString(), description });
            };
            const timeline = getSimulationRestrictionTimeline(ids, dates, nodeInterventions);
            for (const row of timeline.rows) {
              for (const point of row.points) {
                const sampleDate = dates.find((date) => date.getTime() >= point.time);
                if (!sampleDate) continue;
                for (const [direction, allowed] of Object.entries(point.changes)) {
                  const scope = direction === "exports" ? "Exports" : "Imports";
                  addEvent(sampleDate, point.time,
                    `${scope} ${allowed ? "allowed" : "blocked"} for ${regionLabel(row.id)} from this date onward.`);
                }
              }
            }
            for (const date of dates) {
              for (const key of linkInterventions.get(date.getTime())?.keys() || []) {
                const [source, target] = key.split("-");
                const description = source === target
                  ? `${mode === "simulation" ? "Local transmission and movements" : "Movements"} blocked within ${regionLabel(source)} for this step.`
                  : `Movements blocked from ${regionLabel(source)} to ${regionLabel(target)} for this step.`;
                addEvent(date, date.getTime(), description);
              }
            }
            return Array.from(groups.values()).sort((a, b) => a.date.localeCompare(b.date))
              .map((group) => ({ ...group, events: group.events.sort((a, b) =>
                a.date.localeCompare(b.date) || a.description.localeCompare(b.description)) }));
          }

          function getComparisonMetricDefinitions(mode) {
            const metric = (key, label, format, description) => ({ key, label, format, description });
            if (mode === "simulation") {
              const compartments = [
                metric("S", "Susceptible", "decimal", "Susceptible model population units at the end of the recorded step."),
                metric("E", "Exposed", "decimal", "Model population units in the latent stage between exposure and infectiousness at the end of the recorded step."),
                metric("I", "Infectious", "decimal", "Infectious model population units at the end of the recorded step."),
                metric("R", "Recovered", "decimal", "Recovered model population units at the end of the recorded step."),
                metric("N", "Model population", "count", "Synthetic population units derived from trade activity and shared by both scenarios. CBS census counts provide separate map context."),
                metric("prevalence", "Prevalence", "percent", "Infectious model population divided by total model population at the end of the recorded step."),
                metric("newInfections", "New infections", "decimal", "Model population units newly infected during the recorded step, including those entering the exposed compartment."),
                metric("cumulativeInfections", "Cumulative infections", "decimal", "New infection events summed across recorded steps, excluding the initial seed. Reinfections count again in SIS and SEIRS."),
              ];
              return {
                globalMetrics: compartments,
                nodeMetrics: compartments.concat([
                  metric("incomingExposure", "Incoming exposure", "decimal", "Incoming movements from other regions weighted by source prevalence at the start of the step and the movement transmission rate."),
                  metric("outgoingPressure", "Outgoing pressure", "decimal", "Outgoing movements to other regions weighted by this region's prevalence at the start of the step and the movement transmission rate."),
                ]),
              };
            }
            return {
              globalMetrics: [
                metric("totalTradeVolume", "Animal movements", "count", "Total animal movements on enabled ledger records, including movements within a region."),
                metric("totalNodes", "Trading regions", "count", "Regions with at least one enabled positive ledger record."),
                metric("totalEdges", "Trade records", "count", "Enabled positive ledger records, including records within a region."),
                metric("avgTradeEdge", "Movements per record", "decimal", "Total animal movements divided by enabled positive ledger records."),
                metric("avgTradeNode", "Movements per region", "decimal", "Total animal movements divided by regions with enabled positive records."),
                metric("numComponents", "Connected components", "count", "Components with direction ignored, including isolated regions present in this date's ledger."),
                metric("numPartitions", "Communities", "count", "Number of fixed communities from interregional trade across the full loaded period, with scheduled restrictions applied."),
                metric("modularity", "Modularity", "decimal", "Agreement of this date's allowed interregional trade with the fixed full-period communities, using the selected scale's strength penalty. Compare scores at the same community scale."),
                metric("spectralRadius", "Spectral radius", "decimal", "The largest eigenvalue magnitude of the directed movement matrix for this date, describing amplification through trade connections."),
              ],
              nodeMetrics: [
                metric("inDegree", "Incoming movements", "count", "Animal movements arriving from other regions on enabled records."),
                metric("outDegree", "Outgoing movements", "count", "Animal movements sent to other regions on enabled records."),
                metric("betweenness", "Betweenness", "decimal", "Directed weighted shortest path betweenness, using inverse movement volume as distance."),
                metric("pageRank", "PageRank", "decimal", "Weighted directed PageRank on movements between regions."),
                metric("eigenvector", "Eigenvector centrality", "decimal", "Unit length centrality of the symmetric movement adjacency between regions."),
              ],
            };
          }

          function buildComparisonSeries(dates, ids, definitions, globalAtDate, nodesAtDate) {
            const project = (values, metrics) => Object.fromEntries(metrics.map(({ key }) =>
              [key, Number.isFinite(values?.[key]) ? values[key] : null]));
            const series = { global: [], nodes: Object.fromEntries(ids.map((id) => [id, []])) };
            for (const date of dates) {
              const key = date.toISOString();
              series.global.push({ date: key, ...project(globalAtDate(key), definitions.globalMetrics) });
              const nodes = nodesAtDate(key);
              for (const id of ids) {
                series.nodes[id].push({ date: key, ...project(nodes?.[id], definitions.nodeMetrics) });
              }
            }
            return series;
          }

          function getOriginalSimulationSeries(settings, originalTrajectory = null) {
            const datesKey = uniqueDates.map((date) => date.toISOString()).join(",");
            const settingsKey = JSON.stringify(settings);
            let cache = comparisonDataCache.get("simulation");
            if (!cache || cache.data !== loadedCSVData || cache.datesKey !== datesKey || cache.settingsKey !== settingsKey) {
              cache = { data: loadedCSVData, datesKey, settingsKey };
              comparisonDataCache.set("simulation", cache);
            }
            if (!cache.original) {
              const trajectory = originalTrajectory || buildSimulationTrajectory(settings, {
                  data: loadedCSVData, dates: uniqueDates,
                  nodeInterventions: new Map(), linkInterventions: new Map(),
                });
              cache.original = buildComparisonSeries(uniqueDates, trajectory.ids, getComparisonMetricDefinitions("simulation"),
                (key) => trajectory.frameByKey[key]?.summary, (key) => trajectory.frameByKey[key]?.nodeStates);
            }
            return cache.original;
          }

          function areScenarioControlsDisabled() {
            return !loadedCSVData || !uniqueDates.length || !currentTimeSpan ||
              areNetworkControlsLocked() || window.isDoingTemporalUpdate || window.isSwitchingAppMode ||
              simulationRecomputeTimer !== null || screenshotInProgress ||
              !!document.getElementById("mainContainer")?.closest("[inert]");
          }

          function ensurePresetDailyData() {
            const cached = Boolean(presetDailyData);
            const initialize = (data) => {
              let changed = !cached || presetDailyDataError !== null;
              if (data && loadedCSVData && uniqueDates.length && simulationIntroductionDate === null) {
                const introductionDate = getPresetSettings().introductionDate;
                const holdings = getSimulationPopulationForDate(introductionDate);
                simulationIntroductionDate = introductionDate;
                simulationPresetHoldings = holdings;
                changed = true;
              }
              presetDailyDataError = null;
              if (changed) {
                syncSimulationIntroductionControl();
                window.herdlinkComparison?.refresh();
              }
              return data;
            };
            const failed = (error) => {
              presetDailyDataError = `${presetDailyData ? "Simulation settings could not be initialized" : "Daily history could not be loaded"}: ${error.message}`;
              presetDailyDataPromise = null;
              window.herdlinkComparison?.refresh();
              return null;
            };
            if (presetDailyData) return Promise.resolve(presetDailyData).then(initialize).catch(failed);
            if (presetDailyDataPromise) return presetDailyDataPromise;
            presetDailyDataError = null;
            presetDailyDataPromise = fetchAsset("assets/data/daily_aggregation.csv", "text").then((csv) => {
              const data = d3.csvParse(csv, (row) => ({ ...row, time: new Date(row.time), AANTAL: +row.AANTAL }));
              const times = [...new Set(data.map((row) => row.time.getTime()))].sort((a, b) => a - b);
              if (!times.length || times.some((time, index) => !Number.isFinite(time) ||
                (index > 0 && time - times[index - 1] !== 86400000))) {
                throw new Error("Daily history needs a complete calendar with one recorded date per day.");
              }
              presetDailyData = data;
              presetDailyDates = times;
              return data;
            }).then(initialize).catch(failed);
            return presetDailyDataPromise;
          }

          function getPresetSettings() {
            const first = uniqueDates[0]?.getTime() ?? 0;
            const last = uniqueDates.at(-1)?.getTime() ?? first;
            const dateLabel = (time) => new Date(time).toISOString().slice(0, 10);
            const defaultTime = Math.max(first, Math.min((presetDailyDates[0] ?? first) + 365 * 86400000, last));
            return {
              introductionDate: simulationIntroductionDate || dateLabel(defaultTime),
              minIntroductionDate: dateLabel(first), maxIntroductionDate: dateLabel(last),
              targetBudget: presetTargetBudget, historyDays: 365,
              responseDays: presetResponseDays, standstillDays: presetStandstillDays,
              ready: Boolean(presetDailyData) && !presetDailyDataError,
            };
          }

          function setPresetSettings(patch) {
            if (areScenarioControlsDisabled()) throw new Error("Wait for the current network operation to finish.");
            const current = getPresetSettings();
            if (Object.keys(patch).some((key) => !["introductionDate", "targetBudget", "responseDays", "standstillDays"].includes(key))) {
              throw new Error("Choose an introduction date, target count, response delay or standstill duration.");
            }
            if (patch.introductionDate !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(patch.introductionDate) ||
              !Number.isFinite(Date.parse(patch.introductionDate)) || new Date(patch.introductionDate).toISOString().slice(0, 10) !== patch.introductionDate ||
              patch.introductionDate < current.minIntroductionDate || patch.introductionDate > current.maxIntroductionDate)) {
              throw new Error("Choose an introduction date within the recorded period.");
            }
            const counts = { targetBudget: [1, 40, "target count"], responseDays: [0, 365, "response delay"], standstillDays: [1, 365, "standstill duration"] };
            for (const [key, [min, max, label]] of Object.entries(counts)) {
              if (patch[key] !== undefined && (!Number.isInteger(patch[key]) || patch[key] < min || patch[key] > max)) {
                throw new Error(`Choose a ${label} between ${min} and ${max}.`);
              }
            }
            const dateChanged = patch.introductionDate !== undefined && patch.introductionDate !== current.introductionDate;
            if (dateChanged) {
              if (!current.ready) throw new Error(presetDailyDataError || "Wait for daily movement history to load.");
              const holdings = getSimulationPopulationForDate(patch.introductionDate);
              simulationIntroductionDate = patch.introductionDate;
              simulationPresetHoldings = holdings;
              comparisonDataCache.delete("simulation");
              syncSimulationIntroductionControl();
            }
            if (patch.targetBudget !== undefined) presetTargetBudget = patch.targetBudget;
            if (patch.responseDays !== undefined) presetResponseDays = patch.responseDays;
            if (patch.standstillDays !== undefined) presetStandstillDays = patch.standstillDays;
            if (dateChanged && isSimulationModeActive()) scheduleSimulationRecompute("Applying introduction date");
            window.herdlinkComparison?.refresh();
          }

          function syncSimulationIntroductionControl() {
            const input = document.getElementById("simulationIntroductionDate");
            if (!input) return;
            const settings = getPresetSettings();
            input.value = settings.introductionDate;
            input.min = settings.minIntroductionDate;
            input.max = settings.maxIntroductionDate;
          }

          function getSimulationPopulationForDate(introductionDate) {
            const introduction = Date.parse(introductionDate);
            const history = presetDailyData.filter((row) => row.time.getTime() >= introduction - 365 * 86400000 && row.time.getTime() < introduction);
            const ids = collectSimulationRegionIds(loadedCSVData);
            const { totals } = buildSimulationLedger(history, ids, []);
            return Object.fromEntries(estimateSimulationHoldings(ids, totals));
          }

          function getNetworkPresetGraph(data = presetDailyData, introductionDate = getPresetSettings().introductionDate) {
            const end = Date.parse(introductionDate);
            return window.herdlinkPresetTools.getHistoricalPresetGraph(data, end - 365 * 86400000, end);
          }

          function getNetworkPresetSelection(id, graph, scale, seedRegion, budget = presetTargetBudget) {
            if (id === "seed-community") {
              const members = window.herdlinkPresetTools.getSeedCommunityMembers(graph, seedRegion,
                scale === "broad" ? 1 : 1.5, computeModularity);
              return { targets: [...members], members };
            }
            if (id === "hub-controls") return { targets: window.herdlinkPresetTools.selectHubTargets(graph, budget), budget };
            if (id === "trade-bottlenecks") return { targets: window.herdlinkPresetTools.selectBridgeTargets(graph, budget), budget };
            throw new Error("Choose a community, hub or bridge selector.");
          }

          function getScenarioContext() {
            const settings = readSimulationSettings();
            const presetSettings = getPresetSettings();
            const seedLabel = `${getStatnaam(settings.seedRegion)} (${settings.seedRegion})`;
            const start = Date.parse(presetSettings.introductionDate);
            const readyReason = presetDailyDataError || (!presetDailyData ? "Loading daily movement history."
              : presetSettings.introductionDate < presetSettings.minIntroductionDate || presetSettings.introductionDate > presetSettings.maxIntroductionDate
                ? "Choose an introduction date within this resolution's recorded period." : null);
            const historyReason = readyReason || (start - 365 * 86400000 < presetDailyDates[0]
              ? "Choose an introduction date with 365 preceding days of movement history." : null);
            const communityMembers = historyReason ? null : getNetworkPresetSelection("seed-community",
              getNetworkPresetGraph(presetDailyData, presetSettings.introductionDate), communityScale, settings.seedRegion).targets;
            const { responseDays, standstillDays } = presetSettings;
            const responseDate = new Date(start + responseDays * 86400000).toISOString().slice(0, 10);
            const timing = responseDays === 0 ? `On the introduction date (${responseDate}).`
              : `${responseDays} calendar day${responseDays === 1 ? "" : "s"} after introduction (${responseDate}).`;
            const common = { delayDays: responseDays, timing, duration: "Through the remaining timeline.", disabledReason: readyReason };
            const rankedScope = `Up to ${presetSettings.targetBudget} regions with outgoing historical trade. Targets stay fixed.`;
            return {
              datasetKey: currentTimeSpan,
              datasetLabel: currentTimeSpan ? `${currentTimeSpan[0].toUpperCase()}${currentTimeSpan.slice(1)} trade` : "Animal trade network",
              settings, seedLabel, presetSettings, communityScale, mode: appDataMode, disabled: areScenarioControlsDisabled() || !presetSettings.ready,
              nodeInterventions: Array.from(simulationNodeInterventions, ([time, changes]) =>
                [time, Array.from(changes, ([id, directions]) => [id, { ...directions }])]),
              linkInterventions: Array.from(simulationLinkInterventions, ([time, changes]) => [time, Array.from(changes)]),
              presets: [
                { ...common, id: "open-trade", label: "Open trade", delayDays: 0,
                  description: "Keep all regional movements open.", scope: "The full network.",
                  timing: "Unrestricted reference with the selected introduction date.",
                  detail: "Uses the same introduction and model population as the restricted scenarios." },
                { ...common, id: "seed-containment", label: "Seed containment",
                  description: "Close exports from the seed region.", scope: seedLabel,
                  detail: "The known introduction region is the sole target." },
                { ...common, id: "partner-ring", label: "Trace Ring",
                  description: "Close exports from the seed and its direct outgoing recipients.",
                  scope: responseDays === 0 ? "Seed region at introduction."
                    : "Recipients observed between introduction and response, using daily movement dates.",
                  detail: responseDays === 0 ? "Immediate response targets the seed region."
                    : `Forward tracing includes positive seed exports during the ${responseDays} calendar day${responseDays === 1 ? "" : "s"} from introduction up to response. Targets stay fixed at response.` },
                { ...common, id: "seed-community", label: "Community Cordon", disabledReason: historyReason,
                  description: "Close routes leaving the seed's historical trade community.",
                  scope: `${communityScale === "broad" ? "Broad" : "Finer"} historical community${communityMembers
                    ? `: ${communityMembers.length} region${communityMembers.length === 1 ? "" : "s"} (${communityMembers.join(", ")}).`
                    : " from the preceding year's interregional trade."}`,
                  detail: "Internal movements, inbound routes and local contacts continue. Membership stays fixed throughout the scenario." },
                { ...common, id: "hub-controls", label: "Hubs", disabledReason: historyReason,
                  description: "Close exports from regions with the most outgoing trading partners.", scope: rankedScope,
                  detail: "Rank the preceding year's out-degree, then outgoing volume and region ID. Target count is independent of community scale." },
                { ...common, id: "trade-bottlenecks", label: "Bridges", disabledReason: historyReason,
                  description: "Close exports from regions connecting directed trade paths.", scope: rankedScope,
                  detail: "Rank directed hop-count betweenness in the preceding year, then out-degree and region ID. Target count is independent of community scale." },
                { ...common, id: "temporary-standstill", label: "Standstill",
                  description: "Pause cross-region movements throughout the country.", scope: "All regions; local movements and contacts continue.",
                  duration: `${standstillDays} calendar day${standstillDays === 1 ? "" : "s"} from response, followed by reopening.`,
                  detail: "A national reference for temporary movement restrictions." },
              ],
            };
          }

          function validateScenario(snapshot) {
            const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
            const keysAre = (value, keys) => object(value) && Object.keys(value).every((key) => keys.includes(key));
            const fail = (message) => { throw new Error(message); };
            if (!keysAre(snapshot, ["schemaVersion", "datasetKey", "dates", "settings", "nodeInterventions", "linkInterventions"]) || Object.keys(snapshot).length !== 6 ||
              snapshot.schemaVersion !== 1) fail("This scenario format is not supported.");
            if (snapshot.datasetKey !== currentTimeSpan || !Array.isArray(snapshot.dates) ||
              snapshot.dates.length !== uniqueDates.length || uniqueDates.some((date, index) => snapshot.dates[index] !== date.toISOString())) {
              fail("This scenario belongs to a different trade dataset or recorded date range.");
            }
            const ids = collectSimulationRegionIds(loadedCSVData);
            const settings = snapshot.settings;
            const ranges = { initialPct: [0.05, 20], beta: [0, 2], movementBeta: [0, 2], sigma: [0, 1], gamma: [0, 1] };
            if (!keysAre(settings, ["model", "seedRegion", "introductionDate", "holdings", ...Object.keys(ranges)]) || ![7, 8, 9].includes(Object.keys(settings).length) ||
              !["SIR", "SIS", "SEIR", "SEIRS"].includes(settings.model) || !ids.includes(settings.seedRegion)) {
              fail("The scenario model or seed region is invalid.");
            }
            for (const [key, [min, max]] of Object.entries(ranges)) {
              if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) {
                fail(`The scenario setting ${key} must be between ${min} and ${max}.`);
              }
            }
            if (settings.introductionDate !== undefined || settings.holdings !== undefined) {
              const time = Date.parse(settings.introductionDate);
              if (typeof settings.introductionDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(settings.introductionDate) ||
                !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== settings.introductionDate ||
                time < uniqueDates[0].getTime() || time > uniqueDates.at(-1).getTime() ||
                (settings.holdings !== undefined && (!object(settings.holdings) || Object.keys(settings.holdings).length !== ids.length ||
                !ids.every((id) => Number.isFinite(settings.holdings[id]) && settings.holdings[id] >= 450 && settings.holdings[id] <= 10000)))) {
                fail("The scenario introduction date or model population is invalid.");
              }
            }
            const linkKeys = new Set(ids.flatMap((source) => ids.map((target) => getLinkKey(source, target))));
            const schedules = {};
            for (const kind of ["nodeInterventions", "linkInterventions"]) {
              if (!Array.isArray(snapshot[kind])) fail("Scenario restrictions must be dated lists.");
              const schedule = new Map();
              for (const entry of snapshot[kind]) {
                if (!Array.isArray(entry) || entry.length !== 2) fail("A scenario restriction entry is invalid.");
                const [time, entries] = entry;
                if (!Number.isSafeInteger(time) || Math.abs(time) > 8640000000000000 || schedule.has(time) ||
                  !Array.isArray(entries) || !entries.length) fail("A scenario restriction date is invalid or duplicated.");
                const changes = new Map();
                for (const change of entries) {
                  if (!Array.isArray(change) || change.length !== 2) fail("A scenario restriction is invalid.");
                  const [id, value] = change;
                  if (changes.has(id)) fail("A scenario restriction contains duplicate regions or routes.");
                  if (kind === "nodeInterventions") {
                    if (!ids.includes(id) || !keysAre(value, ["exports", "imports"]) || !Object.keys(value).length ||
                      !Object.values(value).every((allowed) => typeof allowed === "boolean")) {
                      fail("A scenario regional permission is invalid.");
                    }
                    changes.set(id, { ...value });
                  } else {
                    if (!linkKeys.has(id) || value !== true) fail("A scenario route restriction is invalid.");
                    changes.set(id, true);
                  }
                }
                schedule.set(time, changes);
              }
              schedules[kind] = schedule;
            }
            return { settings: { ...settings,
              introductionDate: settings.introductionDate || uniqueDates[0].toISOString().slice(0, 10),
              ...(settings.holdings ? { holdings: { ...settings.holdings } } : {}) }, ...schedules };
          }

          function captureScenario() {
            if (areScenarioControlsDisabled()) throw new Error("Wait for the current network operation to finish before saving a scenario.");
            const snapshot = {
              schemaVersion: 1, datasetKey: currentTimeSpan,
              dates: uniqueDates.map((date) => date.toISOString()), settings: readSimulationSettings(),
              nodeInterventions: Array.from(simulationNodeInterventions, ([time, changes]) =>
                [time, Array.from(changes, ([id, directions]) => [id, { ...directions }])]),
              linkInterventions: Array.from(simulationLinkInterventions, ([time, changes]) => [time, Array.from(changes)]),
            };
            validateScenario(snapshot);
            return snapshot;
          }

          function applyScenario(nodeInterventions, linkInterventions, settings, label) {
            let settingsChanged = false;
            if (settings) {
              const currentSettings = readSimulationSettings();
              settingsChanged = Object.keys({ ...settings, ...currentSettings }).some((key) => {
                const next = settings[key], previous = currentSettings[key];
                return key === "holdings" && next && previous
                  ? Object.keys(next).length !== Object.keys(previous).length || Object.keys(next).some((id) => next[id] !== previous[id])
                  : next !== previous;
              });
              simulationIntroductionDate = settings.introductionDate || uniqueDates[0].toISOString().slice(0, 10);
              simulationPresetHoldings = settings.holdings ? { ...settings.holdings } : null;
              syncSimulationIntroductionControl();
              const controls = { model: "Model", seedRegion: "SeedRegion", initialPct: "InitialPct", beta: "Beta", movementBeta: "MovementBeta", sigma: "Sigma", gamma: "Gamma" };
              for (const [key, suffix] of Object.entries(controls)) {
                document.getElementById(`simulation${suffix}`).value = settings[key];
              }
            }
            const sameSchedule = (next, current) => next.size === current.size && Array.from(next).every(([time, changes]) => {
              const existing = current.get(time);
              return existing?.size === changes.size && Array.from(changes).every(([id, value]) => {
                const previous = existing.get(id);
                return typeof value === "boolean" ? value === previous : previous &&
                  Object.keys(value).length === Object.keys(previous).length &&
                  Object.keys(value).every((key) => value[key] === previous[key]);
              });
            });
            if (!settingsChanged && !comparisonDataError && !networkStatsDirtyDates.size && networkStatsDirtyFrom === null &&
              sameSchedule(nodeInterventions, simulationNodeInterventions) &&
              sameSchedule(linkInterventions, simulationLinkInterventions)) return;
            simulationNodeInterventions.clear();
            simulationLinkInterventions.clear();
            for (const [time, changes] of nodeInterventions) simulationNodeInterventions.set(time, changes);
            for (const [time, changes] of linkInterventions) simulationLinkInterventions.set(time, changes);
            networkStatsDirtyDates.clear();
            networkStatsDirtyFrom = uniqueDates[0].getTime();
            comparisonDataError = null;
            try {
              applyNetworkControlChanges(`Applying ${label}`);
            } catch (error) {
              comparisonDataError = `The scenario could not be calculated: ${error.message || error}`;
              window.herdlinkComparison?.refresh();
              throw error;
            }
          }

          function loadScenario(snapshot) {
            if (areScenarioControlsDisabled()) throw new Error("Wait for the current network operation to finish before loading a scenario.");
            const scenario = validateScenario(snapshot);
            applyScenario(scenario.nodeInterventions, scenario.linkInterventions, scenario.settings, "saved scenario");
            return { label: "Saved scenario", detail: "Model settings and all dated trade restrictions restored." };
          }

          function loadPreset(id) {
            if (areScenarioControlsDisabled()) throw new Error("Wait for the current network operation to finish before loading a preset.");
            const context = getScenarioContext();
            const preset = context.presets.find((item) => item.id === id);
            if (!preset) throw new Error("Choose one of the seven intervention presets.");
            if (preset.disabledReason) throw new Error(preset.disabledReason);
            const { introductionDate, targetBudget, responseDays, standstillDays } = context.presetSettings;
            const introduction = Date.parse(introductionDate);
            const response = introduction + responseDays * 86400000;
            const ids = collectSimulationRegionIds(loadedCSVData);
            const roster = new Set(ids);
            const holdings = getSimulationPopulationForDate(introductionDate);
            const settings = { ...context.settings, introductionDate, holdings };
            const nodes = new Map(), links = new Map();
            let targets = [], members;
            if (id === "seed-containment") targets = [settings.seedRegion];
            if (id === "partner-ring") targets = window.herdlinkPresetTools.selectTraceRingTargets(
              presetDailyData, settings.seedRegion, introduction, response).filter((region) => roster.has(region));
            if (["seed-community", "hub-controls", "trade-bottlenecks"].includes(id)) {
              const selection = getNetworkPresetSelection(id, getNetworkPresetGraph(presetDailyData, introductionDate),
                communityScale, settings.seedRegion, targetBudget);
              targets = selection.targets.filter((region) => roster.has(region));
              members = selection.members;
            }
            if (id === "temporary-standstill") targets = ids;
            const startDate = uniqueDates.find((date) => date.getTime() >= response);
            let detail = "All movements stay open.";
            if (startDate && members) {
              for (const row of loadedCSVData) {
                const time = row.time.getTime();
                if (time < response || !(+row.AANTAL > 0) || !roster.has(row.COROP_LEV) || !roster.has(row.COROP_AFN) ||
                  !window.herdlinkPresetTools.isCommunityCordonRoute(members, row.COROP_LEV, row.COROP_AFN)) continue;
                if (!links.has(time)) links.set(time, new Map());
                links.get(time).set(getLinkKey(row.COROP_LEV, row.COROP_AFN), true);
              }
              detail = `Outgoing boundary routes close from ${new Date(response).toISOString().slice(0, 10)}. Historical community: ${targets.join(", ")}. Internal and inbound trade continue.`;
            } else if (targets.length && !members) {
              nodes.set(response, new Map(targets.map((region) => [region, { exports: false }])));
              if (id === "temporary-standstill") nodes.set(response + standstillDays * 86400000,
                new Map(targets.map((region) => [region, { exports: true }])));
              detail = `Exports close on ${new Date(response).toISOString().slice(0, 10)} for ${targets.length} region${targets.length === 1 ? "" : "s"}: ${targets.join(", ")}.`;
              if (id === "temporary-standstill") detail += ` Reopening: ${new Date(response + standstillDays * 86400000).toISOString().slice(0, 10)}.`;
            }
            if (id !== "open-trade" && !startDate) detail = "The response falls beyond the displayed timeline; recorded trade stays open.";
            applyScenario(nodes, links, settings, preset.label);
            return { label: preset.label, detail, communityScale: id === "seed-community" ? communityScale : null,
              presetKey: window.herdlinkPresetTools.presetSettingsKey(id, context.presetSettings),
              scenario: { datasetKey: currentTimeSpan, dates: uniqueDates.map((date) => date.toISOString()), settings,
                nodeInterventions: Array.from(nodes, ([time, changes]) =>
                  [time, Array.from(changes, ([region, directions]) => [region, { ...directions }])]),
                linkInterventions: Array.from(links, ([time, changes]) => [time, Array.from(changes)]),
              } };
          }

          function getComparisonData() {
            const mode = appDataMode;
            const definitions = getComparisonMetricDefinitions(mode);
            const dates = uniqueDates.map((date) => date.toISOString());
            const snapshot = {
              mode, dates, date: window.currentDate?.toISOString() || dates[0] || null,
              selectedRegionId: selectedNodeData?.id || null,
              settings: mode === "simulation" ? simulationState.settings : null,
              interventionEvents: [],
              ...definitions,
            };
            if (comparisonDataError) {
              return { ...snapshot, status: "error", message: comparisonDataError, regions: [], original: null, intervention: null };
            }
            if (window.isSwitchingCSV || (mode === "simulation" &&
              (simulationRecomputeTimer !== null || simulationState.status !== "ready"))) {
              return { ...snapshot, status: "loading", regions: [], original: null, intervention: null };
            }
            if (!loadedCSVData || !dates.length) {
              return { ...snapshot, status: "empty", regions: [], original: null, intervention: null };
            }
            const ids = collectSimulationRegionIds(loadedCSVData);
            const regions = ids.map((id) => ({ id, name: getStatnaam(id) }));
            const datesKey = dates.join(",");
            const settings = mode === "simulation" ? simulationState.trajectory?.settings : null;
            const settingsKey = JSON.stringify(settings);
            let cache = comparisonDataCache.get(mode);
            if (!cache || cache.data !== loadedCSVData || cache.datesKey !== datesKey || cache.settingsKey !== settingsKey) {
              cache = { data: loadedCSVData, datesKey, settingsKey };
              comparisonDataCache.set(mode, cache);
            }
            const interventionsKey = JSON.stringify([simulationNodeInterventions, simulationLinkInterventions],
              (_, value) => value instanceof Map ? Array.from(value) : value);
            if (cache.eventsKey !== interventionsKey) {
              cache.interventionEvents = getComparisonInterventionEvents(uniqueDates, ids, mode);
              cache.eventsKey = interventionsKey;
            }
            if (mode === "simulation") {
              const trajectory = simulationState.trajectory;
              if (!trajectory) return { ...snapshot, status: "loading", regions, original: null, intervention: null };
              const project = (value) => buildComparisonSeries(uniqueDates, ids, definitions,
                (key) => value.frameByKey[key]?.summary,
                (key) => value.frameByKey[key]?.nodeStates);
              if (!cache.original) {
                cache.original = getOriginalSimulationSeries(settings,
                  !simulationNodeInterventions.size && !simulationLinkInterventions.size ? trajectory : null);
              }
              if (cache.trajectory !== trajectory) {
                cache.intervention = project(trajectory);
                cache.trajectory = trajectory;
              }
            } else {
              if (cache.interventionsKey !== interventionsKey) {
                const statsReady = !networkStatsDirtyDates.size && networkStatsDirtyFrom === null &&
                  dates.every((key) => window.allTemporalStats?.[key] && window.allTemporalNodeStats?.[key]);
                const current = statsReady
                  ? { global: window.allTemporalStats, node: window.allTemporalNodeStats }
                  : computeTemporalNetworkStats(uniqueDates, { store: false });
                const project = (value) => buildComparisonSeries(uniqueDates, ids, definitions,
                  (key) => ({ ...value.global[key], ...value.global[key]?.communityScales?.[communityScale] }),
                  (key) => value.node[key]);
                cache.intervention = project(current);
                if (!cache.original) {
                  if (!simulationNodeInterventions.size && !simulationLinkInterventions.size) {
                    cache.original = cache.intervention;
                  } else {
                    const original = originalLedgerStatsByDataset.get(loadedCSVData) || { global: {}, node: {} };
                    const missingDates = uniqueDates.filter((date) => !original.global[date.toISOString()]);
                    if (missingDates.length) {
                      const missing = computeTemporalNetworkStats(missingDates, {
                        data: loadedCSVData, nodeInterventions: new Map(), linkInterventions: new Map(), store: false,
                      });
                      Object.assign(original.global, missing.global);
                      Object.assign(original.node, missing.node);
                    }
                    originalLedgerStatsByDataset.set(loadedCSVData, original);
                    cache.original = project(original);
                  }
                }
                cache.interventionsKey = interventionsKey;
              }
            }
            return {
              ...snapshot, status: "ready", settings, regions,
              original: cache.original, intervention: cache.intervention,
              interventionEvents: cache.interventionEvents,
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

            const disabledLinkKeys = getDisabledLinkKeys(frame.date, simulationState.trajectory.ids);
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
              link.ledgerWeight ??= Math.max(0, +link.weight || 0);
              link.simulation = simLink || {
                source: getNodeId(link.source),
                target: getNodeId(link.target),
                ledgerWeight: link.ledgerWeight,
                riskLoad: 0,
                sourcePrevalence: 0,
                targetPrevalence: 0,
              };
              link.weight = link.simulation.riskLoad;
              link.disabled = disabledLinkKeys.has(key);
            });

            enabledLinks = allLinks.filter((link) => !link.disabled && link.weight > 0);
            nonZeroLinks = allLinks.filter((link) => link.weight > 0);
            activeNodes = allNodes.filter((node) => node.active);
            edgeExtent = d3.extent(nonZeroLinks, (link) => Math.log(link.weight));
            if (edgeExtent[0] == null || edgeExtent[1] == null) {
              edgeExtent = [0, 1];
            }
            edgeColor = d3
              .scaleSequential(exposureIntensity)
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
              ["fa-solid fa-users", "Model units", formatCount(summary.N)],
              ["fa-solid fa-virus", "Infectious", formatCount(summary.I)],
              ["fa-solid fa-temperature-high", "Prevalence", formatPct(summary.prevalence)],
              ["fa-solid fa-arrow-trend-up", "New infections", formatCount(summary.newInfections)],
              ["fa-solid fa-shield-heart", "Recovered", formatCount(summary.R)],
              ["fa-solid fa-seedling", "Seed region", frame.seedIds.join(", ")],
            ];
            const container = d3.select(".statsContainer");
            container
              .classed("simulation-stats-container", true)
              .style("border", `1px solid ${theme.border}`)
              .style("background", theme.surface)
              .html("");
            rows.forEach(([icon, label, value]) => {
              const item = container
                .append("div")
                .attr("class", "stat-item simulation-stat-item")
                .style("color", selectedNodeData ? theme.text : theme.muted);
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
            if (selectedNodeData) return;
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
              .y1((d) => y(d[1]));

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
              .attr("d", (d) => getSimulationTrajectoryPath(d, area));

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
                lineColor: theme.muted,
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
            if (!frame || selectedNodeData) return;
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
                    .style("fill", theme.text);
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
              { label: "Prevalence", type: "fill", color: "#a5f0df" },
              { label: "Exposure flow", type: "line", color: "#f1c77b" },
              { label: "New cases", type: "circle", color: theme.accent },
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
              .attr("stroke", theme.onAccent)
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
                  : theme.surface;
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
              .attr("stroke", theme.onAccent)
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
            const key = tradeCommunityTimeline?.partition[id];
            return key === undefined || key === null ? "NA" : String(key);
          }

          function getSimulationPartitionColor(key) {
            return key === "NA" ? theme.muted : nodeColor(Number(key));
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
                Number(a.key) - Number(b.key) ||
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
                    ${members.length} region${members.length === 1 ? "" : "s"} · ${visibleMembers.join(" ")}${hiddenMembers ? ` +${hiddenMembers}` : ""}
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
                  <span class="simulation-partition-map-title">${partitions.filter((partition) => partition.key !== "NA").length} fixed groups · ${partitions.filter((partition) => partition.key !== "NA" && partition.members.length === 1).length} singletons</span>
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
              top: 124,
              right: 76,
              bottom: partitions.length ? mappingLayout.compactHeight + 12 : 36,
              left: 42,
            };
            const width = Math.max(10, node.clientWidth - margin.left - margin.right);
            const height = Math.max(10, node.clientHeight - margin.top - margin.bottom);
            let svg = container.select("svg.simulation-partition-chart");
            if (svg.empty()) {
              container.selectAll("svg.simulation-partition-chart, svg.trade-community-chart, svg.community-flow-chart")
                .interrupt().call((charts) => charts.selectAll("*").interrupt()).remove();
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
              .scaleSequential(exposureIntensity)
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
              .attr("fill", theme.surface)
              .merge(cellSelection)
              .call((selection) =>
                transitionSelection(selection)
                  .attr("opacity", 1)
                  .attr("x", (cell) => x(cell.target))
                  .attr("y", (cell) => matrixOffsetY + y(cell.source))
                  .attr("width", x.bandwidth())
                  .attr("height", y.bandwidth())
                  .attr("fill", (cell) =>
                    cell.value > 0 ? color(cell.value) : theme.surface,
                  )
                  .attr("stroke", (cell) =>
                    cell.source === cell.target
                      ? theme.muted
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
            const summaryWidth = (node.clientWidth - 32) / summaryItems.length;
            const summaryMerged = summaryEnter.merge(summary).attr("text-anchor", "middle");
            summaryMerged.attr(
              "transform",
              (item, index) => `translate(${16 + (index + 0.5) * summaryWidth},96)`,
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
                .y((d) => y(d[key]));

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
              .interrupt()
              .attr("stroke", (key) => simulationCompartmentColors[key])
              .attr("stroke-width", (key) => (key === "I" ? 2.4 : 1.6))
              .attr("d", (key) => getSimulationTrajectoryPath(data, line(key)));

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
                &nbsp; Model units: ${formatCount(state.N)}
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
                color: "#78b8ed",
              },
              {
                key: "In cross",
                value: incomingBase ? stats.incomingCross / incomingBase : 0,
                color: "#f1c77b",
              },
              {
                key: "Out cross",
                value: outgoingBase ? stats.outgoingCross / outgoingBase : 0,
                color: "#f28b96",
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
                color: "#f1c77b",
              },
              {
                key: "Outgoing",
                value: state.outgoingPressure || 0,
                color: "#f28b96",
              },
              {
                key: "New cases",
                value: state.newInfections || 0,
                color: "#78b8ed",
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
              .attr("fill", "#f1c77b")
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
              .attr("fill", "#f28b96")
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
              { key: "Incoming", color: "#f1c77b" },
              { key: "Outgoing", color: "#f28b96" },
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
                .y((d) => y(d[key]));

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
              .attr("d", (d) => getSimulationTrajectoryPath(series, line(d.key)));

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
            const regions = svg.selectAll(".map-region");
            if (mapLayers.applyRegionFill(regions, window.currentDate?.getFullYear())) return;
            regions.attr("fill", function (feature) {
              if (!isSimulationModeActive()) return "none";
              const id = feature?.properties?.statcode;
              const state = simulationState.currentFrame?.nodeStates[id];
              return state ? simulationPrevalenceScale(state.prevalence) : "none";
            }).attr("fill-opacity", isSimulationModeActive() ? 0.5 : null);
          }

          function renderSimulationPanels() {
            if (!isSimulationModeActive()) return;
            renderSimulationNodeControls();
            renderSimulationStatsContainer();
            renderSimulationGlobalStatsChart();
            renderSimulationNodeStatsChart();
            renderSimulationSpatialPatternPanel();
            updateSCCs();
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
            applySimulationMapPrevalence();
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
            window.herdlinkComparison?.refresh();
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
                element.disabled = disabled || (element.id === "simulationIntroductionDate" && !getPresetSettings().ready);
              });
            setModeSwitcherDisabled(disabled);
          }

          function configureSimulationModeUi(active) {
            const controls = ensureSimulationControls();
            syncSimulationIntroductionControl();
            controls.hidden = !active;
            controls.style.display = active && !selectedNodeData ? "block" : "none";
            ensureSimulationNodeControls().hidden = !selectedNodeData || simulationControlView !== "nodes";
            const restore = document.getElementById("restoreButton");
            restore.dataset.tip = "Restore all links and node permissions across all dates (R)";
            restore.setAttribute("aria-label", "Restore all links and node permissions (R)");
            document.body.classList.toggle("simulation-mode-active", active);
            document.body.classList.toggle("focus-mode-active", !!selectedNodeData);
            updateFocusIndicator();
            setSimulationPanelLabels(active);
            updateHotspotLegend();
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

          function refreshTradeCommunityScale() {
            const partition = tradeCommunityTimeline.partition;
            allNodes.forEach((node) => {
              node.community = partition[node.id];
            });
            nodeColor.domain(Array.from(new Set(Object.values(partition))).sort((a, b) => a - b));
            updateSCCs();
            if (isSimulationModeActive()) {
              if (selectedNodeData) updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
              return;
            }
            updateNetworkStats();
            if (window.currentSelectedStat === "modularity") {
              updateGlobalStatsChart(window.currentSelectedStat);
            }
            updateNodeStatsChart(window.currentSelectedNodeStat);
            d3.selectAll("#tradeDistribution .trade-circle")
              .attr("fill", (point) => nodeColor(partition[point.sourceId]));
            if (selectedNodeData) {
              updateTradeTable();
              updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
            }
          }

          function setTradeCommunityScale(scale) {
            if ((scale !== "broad" && scale !== "finer") || scale === communityScale) return false;
            communityScale = scale;
            comparisonDataCache.delete("trade");
            if (tradeCommunityTimeline) {
              const byScale = tradeCommunityTimeline.byScale;
              tradeCommunityTimeline = { ...byScale[scale], byScale };
              let maxModularity = 0;
              for (const [key, stats] of Object.entries(window.allTemporalStats)) {
                window.allTemporalStats[key] = { ...stats, ...stats.communityScales[scale] };
                maxModularity = Math.max(maxModularity, window.allTemporalStats[key].modularity);
              }
              window.maxTemporalStats.modularity = maxModularity;
              if (!window.isSwitchingCSV) refreshTradeCommunityScale();
            }
            window.herdlinkComparison?.refresh();
            return true;
          }

          function cancelSimulationRecompute() {
            simulationRunId += 1;
            clearTimeout(simulationRecomputeTimer);
            simulationRecomputeTimer = null;
          }

          async function recomputeSimulationTrajectory(reason = "Simulation run") {
            clearTimeout(simulationRecomputeTimer);
            simulationRecomputeTimer = null;
            if (window.isSwitchingCSV) return;
            if (!loadedCSVData || !uniqueDates.length) {
              finishModePanelsRendering();
              return;
            }
            if (window.isPlaying) setTimeReplayState(false);
            const runId = ++simulationRunId;
            comparisonDataError = null;
            simulationState.status = "running";
            window.herdlinkComparison?.refresh();
            setSimulationInputsDisabled(true);
            disableAllButtons();
            disableAllCheckboxes();

            const stage = async (progress, key, label) => {
              if (runId !== simulationRunId) return false;
              setSimulationOverlay(progress, label, key);
              await delaySimulationStage();
              return runId === simulationRunId;
            };

            if (!(await stage(6, "ledger", reason))) return;
            let settings, trajectory;
            try {
              const history = await ensurePresetDailyData();
              if (runId !== simulationRunId) return;
              if (!history) throw new Error(presetDailyDataError || "Daily movement history is unavailable.");
              refreshNetworkControlStats();
              settings = readSimulationSettings();
              if (!(await stage(18, "holdings", "Preparing regional model population"))) return;
              if (!(await stage(34, "contacts", "Building movement contacts"))) return;
              if (!(await stage(48, "states", "Integrating compartment states"))) return;
              trajectory = buildSimulationTrajectory(settings);
              if (!(await stage(78, "frames", "Building replay ledger"))) return;

              simulationState = {
                status: "running",
                settings,
                trajectory,
                currentFrame: null,
                currentDateKey: null,
                metricMax: trajectory?.metricMax || null,
              };

              if (!(await stage(94, "render", "Rendering simulation view"))) return;
              refreshCurrentNetworkFrame();
              finishModePanelsRendering();
              setSimulationOverlay(100, "Simulation ready", "render");
              await delaySimulationStage();
              if (runId !== simulationRunId) return;
              simulationState.status = "ready";
              hideSimulationOverlay();
              setSimulationInputsDisabled(false);
              enableAllButtons(0);
              enableAllCheckboxes(0);
              window.herdlinkComparison?.refresh();
            } catch (error) {
              if (runId !== simulationRunId) return;
              simulationState.status = "error";
              comparisonDataError = `The simulation could not be calculated: ${error.message || error}`;
              finishModePanelsRendering();
              hideSimulationOverlay();
              setSimulationInputsDisabled(false);
              enableAllButtons(0);
              enableAllCheckboxes(0);
              window.herdlinkComparison?.refresh();
            }
          }

          function scheduleSimulationRecompute(reason = "Settings changed") {
            if (!isSimulationModeActive()) return;
            clearTimeout(simulationRecomputeTimer);
            simulationRecomputeTimer = setTimeout(() => {
              simulationRecomputeTimer = null;
              if (!isSimulationModeActive() || window.isSwitchingCSV) return;
              recomputeSimulationTrajectory(reason);
            }, 180);
            window.herdlinkComparison?.refresh();
          }

          function refreshNetworkControlStats() {
            const dates = uniqueDates.filter((date) =>
              networkStatsDirtyDates.has(date.getTime()) ||
              (networkStatsDirtyFrom !== null && date.getTime() >= networkStatsDirtyFrom),
            );
            if (dates.length) {
              computeTemporalNetworkStats(dates);
              computeMaxTemporalNetworkStats();
            }
            networkStatsDirtyDates.clear();
            networkStatsDirtyFrom = null;
          }

          function applyNetworkControlChanges(reason = "Applying network controls") {
            if (isSimulationModeActive()) {
              scheduleSimulationRecompute(reason);
            } else {
              refreshNetworkControlStats();
            }
            updateNetwork();
            updateNetworkStats();
            updateTradeTable();
            updateDonutCharts();
            updateInOutArbos();
            updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
            updateHotspotMarks();
            computeSCCs();
            updateSCCs();
            updateAnnotationForNode(selectedNodeData, annotationGroup);
            if (!isSimulationModeActive()) {
              updateGlobalStatsChart(window.currentSelectedStat);
              updateNodeStatsChart(window.currentSelectedNodeStat);
              if (selectedNodeData) updateNodeTradeDistribution();
              else updateTradeDistribution();
            }
            window.herdlinkComparison?.refresh();
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
            resetRadarRenderState();
            syncModeSwitcherRadios();
            configureSimulationModeUi(isSimulationModeActive());

            if (isSimulationModeActive()) {
              recomputeSimulationTrajectory("Preparing simulation trajectory");
              return true;
            }

            cancelSimulationRecompute();
            simulationState = {
              status: "idle",
              settings: null,
              trajectory: null,
              currentFrame: null,
              currentDateKey: null,
              metricMax: null,
            };
            restoreLedgerHotspotsMax();
            hideSimulationOverlay();
            clearSimulationRenderState();
            refreshNetworkControlStats();
            refreshCurrentNetworkFrame();
            updateNetwork(true);
            applySimulationMapPrevalence();
            finishModePanelsRendering();
            setSimulationInputsDisabled(false);
            if (wasSimulationRunning) {
              enableAllButtons(0);
              enableAllCheckboxes(0);
            }
            window.herdlinkComparison?.refresh();
            return true;
          }

          function bindSimulationUi() {
            const panel = ensureSimulationControls();
            if (!panel.dataset.bound) {
              panel.dataset.bound = "true";
              panel.querySelectorAll("input, select").forEach((element) => {
                if (element.id === "simulationIntroductionDate") {
                  element.addEventListener("change", () => {
                    const value = element.value;
                    if (!value || !element.validity.valid) {
                      syncSimulationIntroductionControl();
                      return;
                    }
                    try {
                      setPresetSettings({ introductionDate: value });
                      element.setCustomValidity("");
                    } catch (error) {
                      syncSimulationIntroductionControl();
                      element.setCustomValidity(error.message);
                      element.reportValidity();
                    }
                  });
                  element.addEventListener("input", () => element.setCustomValidity(""));
                  return;
                }
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
            const assetUrl = window.HERDLINK_ASSET_URLS[assetPath];
            if (!assetUrl) throw new Error(`Unknown bundled asset: ${assetPath}`);
            return new URL(assetUrl, window.location.href).toString();
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
    
          const mapLayers = window.createHerdLinkMapLayers({
            svg,
            theme,
            fetchAsset,
            refreshRegions: applySimulationMapPrevalence,
          });

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
            const disabledKeys = getDisabledLinkKeys(currentDate);
    
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
              if (source === target || disabledKeys.has(getLinkKey(source, target))) return;
              if (weight > 0) {
                // Distance is symmetric.
                const sourceCoords = getCoordinatesForStatcode(source);
                const targetCoords = getCoordinatesForStatcode(target);
                if (!sourceCoords || !targetCoords) return;
                const distance = computeDistance(sourceCoords, targetCoords);
                if (!Number.isFinite(distance) || distance <= 0) return;
    
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
            restoreLedgerHotspotsMax();

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
              spectralRadius,
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
              spectralRadius = stats.spectralRadius;
    
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
              partition = tradeCommunityTimeline.partition;
    
              // Compute spectral radius (risk score).
              spectralRadius = computeSpectralRadius(activeNodes, enabledLinks);
    
              totalNodes = simpleStats.totalNodes;
              totalEdges = simpleStats.totalEdges;
              totalTradeVolume = simpleStats.totalTradeVolume;
              avgTradeEdge = simpleStats.avgTradeEdge;
              avgTradeNode = simpleStats.avgTradeNode;
              modularity = evaluatePartitionModularity(enabledLinks, partition, tradeCommunityTimeline.resolution);
    
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

            if (partition) {
              nodeColor.domain(Array.from(new Set(Object.values(partition))).sort((a, b) => a - b));
            }
            d3.selectAll(".nodeGroup circle.primary")
              .attr("fill", (node) => nodeColor(node.community));
    
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
    
            container.style("border", `1px solid ${theme.border}`);
            container.style("background", theme.surface);
    
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
                .style("color", selectedNodeData ? theme.text : theme.muted);
    
              // Render icon.
              item.append("div").attr("class", "stat-icon").html(itemData.icon);
    
              // Render label.
              item.append("span").attr("class", "stat-label").text(itemData.label);
    
              // Render value.
              item.append("span").attr("class", "stat-value").text(itemData.value);
            });
    
            const normalizedValue = getLedgerRiskScore(spectralRadius);
            const formattedNormal = normalizedValue.toFixed(3); // three decimal places
    
            // Color scale for normalized risk score.
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
    
          function getLedgerRiskScore(spectralRadius) {
            return ledgerBaselineSpectralRadius > 0
              ? spectralRadius / ledgerBaselineSpectralRadius : 0;
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
                const stats = window.allTemporalStats[dateStr];
                const statValue = selectedStat === "riskScore"
                  ? getLedgerRiskScore(stats.spectralRadius) : stats[selectedStat];
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
              yDomain = [0, maxValue === 0 ? 1 : maxValue * 1.1];
            } else {
              // Otherwise, add a bit extra at both ends (10% below and above)
              yDomain = [minValue - Math.abs(minValue) * 0.1, maxValue + Math.abs(maxValue) * 0.1];
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
                    bgPadding: { top: 4, left: 6, right: 6, bottom: 4 },
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
                  .attr("fill", theme.text);
                currentDateAnnoGroup
                  .selectAll("rect.annotation-note-bg")
                  .attr("fill", theme.elevated)
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
                    sel.selectAll(".annotation-note text").attr("fill", theme.text);
                    sel
                      .selectAll("rect.annotation-note-bg")
                      .attr("fill", theme.elevated)
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
    
            // Select the y-grid group; if it doesn't exist, create it.
            let yGrid = svg.select("g.y-grid");
            if (yGrid.empty()) {
              yGrid = svg
                .append("g")
                .attr("class", "y-grid")
                .attr("stroke", theme.grid)
                .attr("stroke-opacity", 0.2);
            }
    
            const yGridLines = d3
              .axisLeft(y)
              .ticks(5)
              .tickSize(-width)
              .tickFormat((d) => d === d3.min(y.domain()) ? ""
                : selectedStat === "riskScore" ? d.toFixed(3) : d);
    
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
                .attr("fill", theme.accent)
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
                .attr("stroke", theme.muted)
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
                .attr("stroke", theme.accent)
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
                .attr("stroke", theme.accent)
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
                .attr("fill", theme.muted)
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
                .attr("fill", theme.muted)
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
                .attr("stroke", theme.grid)
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
                .attr("fill", theme.muted)
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
                .attr("stroke", theme.accent)
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
    
            // Position labels for the highest eligible scores at the displayed date.
            const bisectDate = d3.bisector((d) => d.date).left;
            const highlighted = new Set(getHotspotRankings(hotspots, false, 5)[selectedMetric]);
            const topNodes = nodesArray
              .filter((node) => highlighted.has(node.nodeId))
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
              });
    
            topNodes.sort((a, b) => a.y - b.y);
    
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
    
            labelGroupsEnter.append("line")
              .attr("class", "label-dash-line")
              .attr("stroke", theme.accent)
              .attr("stroke-width", 1)
              .attr("stroke-dasharray", "4,2");
            labelGroupsEnter.append("rect")
              .attr("class", "label-bg")
              .attr("rx", 4)
              .attr("ry", 4);
            labelGroupsEnter.append("text")
              .attr("alignment-baseline", "middle");

            const labelGroupsMerge = labelGroupsEnter.merge(labelGroups);
            labelGroupsMerge.select("text")
              .attr("fill", (d) => d.color)
              .text((d) => d.nodeId);
            labelGroupsMerge.each(function (d) {
              const bbox = d3.select(this).select("text").node().getBBox();
              d.box = {
                x: bbox.x - 6,
                y: bbox.y - 4,
                width: bbox.width + 12,
                height: bbox.height + 8,
              };
            });

            const labelGap = 8;
            const edgePadding = 6;
            const connectorGap = 18;
            topNodes.forEach((d, i) => {
              const rightX = lineX + connectorGap;
              const leftX = lineX - connectorGap - d.box.width;
              d.boxLeft = rightX + d.box.width <= width - edgePadding
                ? rightX : leftX;
              d.boxLeft = Math.max(edgePadding, Math.min(width - edgePadding - d.box.width, d.boxLeft));
              d.boxTop = Math.max(edgePadding, d.y - d.box.height / 2);
              if (i > 0) {
                const previous = topNodes[i - 1];
                d.boxTop = Math.max(d.boxTop, previous.boxTop + previous.box.height + labelGap);
              }
            });
            for (let i = topNodes.length - 1; i >= 0; i -= 1) {
              const bottom = i === topNodes.length - 1
                ? height - edgePadding : topNodes[i + 1].boxTop - labelGap;
              topNodes[i].boxTop = Math.min(topNodes[i].boxTop, bottom - topNodes[i].box.height);
            }

            labelGroupsMerge.transition().duration(300)
              .attr("transform", (d) => `translate(${d.boxLeft - d.box.x},${d.boxTop - d.box.y})`);
            labelGroupsMerge.select("rect.label-bg").transition().duration(300)
              .attr("x", (d) => d.box.x)
              .attr("y", (d) => d.box.y)
              .attr("width", (d) => d.box.width)
              .attr("height", (d) => d.box.height);
            labelGroupsMerge.select("line.label-dash-line").transition().duration(300)
              .attr("x1", (d) => lineX < d.boxLeft ? d.box.x : d.box.x + d.box.width)
              .attr("y1", (d) => d.box.y + d.box.height / 2)
              .attr("x2", (d) => lineX - (d.boxLeft - d.box.x))
              .attr("y2", (d) => d.y - (d.boxTop - d.box.y));
            labelGroupsMerge.raise();
          }
    
          // Date statistics share a partition fitted to allowed trade across the full dataset.
          function computeTemporalNetworkStats(dates = uniqueDates, inputs = {}) {
            const {
              data = loadedCSVData,
              nodeInterventions = simulationNodeInterventions,
              linkInterventions = simulationLinkInterventions,
              store = true,
            } = inputs;
            if (store && dates === uniqueDates) {
              window.allTemporalStats = {};
              window.allTemporalNodeStats = {};
              networkStatsDirtyDates.clear();
              networkStatsDirtyFrom = null;
              ledgerBaselineSpectralRadius = 0;
            }
            const result = { global: {}, node: {} };
            const original = store
              ? originalLedgerStatsByDataset.get(data) || { global: {}, node: {} }
              : null;
            if (store) originalLedgerStatsByDataset.set(data, original);
            const ids = collectSimulationRegionIds(data);
            const rowsByDate = getTradeRecordsByDate(data);
            const communities = computeTradeCommunityTimeline(data, nodeInterventions, linkInterventions);
            const communityStatsForDate = (date) => {
              const communityScales = Object.fromEntries(Object.entries(communities.byScale).map(([scale, value]) =>
                [scale, {
                  partition: value.partition,
                  numPartitions: value.numPartitions,
                  modularity: value.modularityByDate.get(date.getTime()) ?? 0,
                }]));
              return { ...communityScales[communityScale], communityScales };
            };
            if (store) {
              tradeCommunityTimeline = communities;
              // A schedule edit can change reference groups even on dates with unchanged routes.
              for (const [key, stats] of Object.entries(window.allTemporalStats)) {
                window.allTemporalStats[key] = {
                  ...stats,
                  ...communityStatsForDate(new Date(key)),
                };
              }
            }
            const nodeEvents = Array.from(nodeInterventions).sort(([a], [b]) => a - b);
            const permissions = new Map();
            let interventionIndex = 0;
    
            // Loop over each unique date.
            [...dates].sort((a, b) => a - b).forEach((date) => {
              while (interventionIndex < nodeEvents.length && nodeEvents[interventionIndex][0] <= date.getTime()) {
                const [time, changes] = nodeEvents[interventionIndex++];
                applySimulationNodePermissions(permissions, changes, time);
              }
              const disabledKeys = getDisabledLinkKeys(date, ids, permissions, linkInterventions);
              const filteredData = rowsByDate.get(date.getTime()) || [];
    
              // Build nodes and links from the filtered data.
              const nodesMap = {};
              const links = [];
              filteredData.forEach((d) => {
                const source = d.COROP_LEV,
                  target = d.COROP_AFN,
                  weight = +d.AANTAL,
                  disabled = disabledKeys.has(getLinkKey(source, target));
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
              // Compute spectral radius (risk score).
              const spectralRadius = computeSpectralRadius(
                activeNodes,
                enabledLinks,
              );
              if (store && dates === uniqueDates) {
                const baselineRadius = disabledKeys.size
                  ? computeSpectralRadius(activeNodes, links.filter((link) => link.weight > 0))
                  : spectralRadius;
                ledgerBaselineSpectralRadius = Math.max(ledgerBaselineSpectralRadius, baselineRadius);
              }
    
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
                ...communityStatsForDate(date),
                spectralRadius: spectralRadius,
              };
    
              const key = date.toISOString();
              result.global[key] = stats;
              result.node[key] = nodeStats;
              if (store) {
                window.allTemporalStats[key] = stats;
                window.allTemporalNodeStats[key] = nodeStats;
                if (!nodeInterventions.size && !linkInterventions.size) {
                  original.global[key] = stats;
                  original.node[key] = nodeStats;
                }
              }
            });
            return result;
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
            setLedgerHotspotsMax(maxNodeStats);
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
              totalEdges > 0 ? totalTradeVolume / totalEdges : 0;
            const avgTradeNode =
              totalNodes > 0 ? totalTradeVolume / totalNodes : 0;
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
    
          function computeModularity(nodes, links, resolution = 1) {
            const nodeIds = nodes.map((node) => node.id).sort();
            const edges = new Map();
            for (const link of links) {
              const ids = [getNodeId(link.source), getNodeId(link.target)].sort();
              const key = JSON.stringify(ids);
              const edge = edges.get(key);
              if (edge) edge.weight += link.weight;
              else edges.set(key, { source: ids[0], target: ids[1], weight: link.weight });
            }
            if (!edges.size) {
              return {
                partition: Object.fromEntries(nodeIds.map((id, index) => [id, index])),
                modularity: 0,
              };
            }
            // Louvain uses one undirected edge for the combined volume in both directions.
            const orderedEdges = [...edges.values()].sort((a, b) =>
              a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
            const results = jLouvain().nodes(nodeIds).edges(orderedEdges).resolution(resolution)();
            const labels = new Map();
            const partition = Object.fromEntries(nodeIds.map((id) => {
              const group = results.communities[id];
              if (!labels.has(group)) labels.set(group, labels.size);
              return [id, labels.get(group)];
            }));
            return { partition, modularity: results.modularity };
          }

          function evaluatePartitionModularity(links, partition, resolution = 1) {
            let volume = 0;
            let within = 0;
            const strengths = Object.create(null);
            for (const link of links) {
              const sourceId = getNodeId(link.source);
              const targetId = getNodeId(link.target);
              if (sourceId === targetId) continue;
              const source = partition[sourceId];
              const target = partition[targetId];
              volume += link.weight;
              if (source === target) within += link.weight;
              strengths[source] = (strengths[source] || 0) + link.weight;
              strengths[target] = (strengths[target] || 0) + link.weight;
            }
            if (!volume) return 0;
            let expected = 0;
            for (const strength of Object.values(strengths)) expected += (strength / (2 * volume)) ** 2;
            return within / volume - resolution * expected;
          }

          function computeTradeCommunityTimeline(data, nodeInterventions, linkInterventions) {
            const rowsByDate = getTradeRecordsByDate(data);
            const ids = collectSimulationRegionIds(data);
            const events = [...nodeInterventions].sort(([a], [b]) => a - b);
            const permissions = new Map();
            const aggregate = new Map();
            const graphs = new Map();
            let eventIndex = 0;
            for (const [time, rows] of [...rowsByDate].sort(([a], [b]) => a - b)) {
              while (eventIndex < events.length && events[eventIndex][0] <= time) {
                const [eventTime, changes] = events[eventIndex++];
                applySimulationNodePermissions(permissions, changes, eventTime);
              }
              const disabled = getDisabledLinkKeys(new Date(time), ids, permissions, linkInterventions);
              const links = [];
              for (const row of rows) {
                const source = row.COROP_LEV;
                const target = row.COROP_AFN;
                const weight = +row.AANTAL;
                if (!source || !target || source === target || source.toUpperCase() === "NA" || target.toUpperCase() === "NA" ||
                    !(weight > 0) || !Number.isFinite(weight) || disabled.has(`${source}-${target}`)) continue;
                links.push({ source, target, weight });
                const a = source < target ? source : target;
                const b = source < target ? target : source;
                const key = `${a}-${b}`;
                const edge = aggregate.get(key);
                if (edge) edge.weight += weight;
                else aggregate.set(key, { source: a, target: b, weight });
              }
              graphs.set(time, links);
            }
            const edges = [...aggregate.values()];
            // Interregional movements provide the evidence for community membership.
            const nodes = [...new Set(edges.flatMap((edge) => [edge.source, edge.target]))]
              .map((id) => ({ id }));
            const byScale = Object.fromEntries([["broad", 1], ["finer", 1.5]].map(([scale, resolution]) => {
              const { partition } = computeModularity(nodes, edges, resolution);
              const modularityByDate = new Map([...graphs].map(([time, links]) =>
                [time, evaluatePartitionModularity(links, partition, resolution)]));
              return [scale, { partition, resolution,
                numPartitions: new Set(Object.values(partition)).size, modularityByDate }];
            }));
            return { ...byScale[communityScale], byScale };
          }

          /**
           * Computes unit-length centrality from the symmetric movement adjacency.
           * Tied dominant blocks use the projection of an all-ones starting vector.
           * The returned vector must satisfy the requested relative residual tolerance.
           */
          function computeEigenvectorCentrality(allNodes, enabledLinks, maxIter = 100, tol = 1e-6) {
            const centrality = Object.fromEntries(allNodes.map((node) => [node.id, 0]));
            const ids = new Set(allNodes.map((node) => node.id));
            const links = enabledLinks.filter((link) => link.weight > 0 &&
              ids.has(getNodeId(link.source)) && ids.has(getNodeId(link.target)));
            const symmetricLinks = links.flatMap((link) => [link,
              { source: link.target, target: link.source, weight: link.weight }]);
            const components = getStronglyConnectedComponents(allNodes, symmetricLinks);
            const positions = new Map();
            const matrices = components.map((component, componentIndex) => {
              component.forEach((id, index) => positions.set(id, { componentIndex, index }));
              return component.map(() => Array(component.length).fill(0));
            });
            for (const link of symmetricLinks) {
              const source = positions.get(getNodeId(link.source));
              const target = positions.get(getNodeId(link.target));
              matrices[source.componentIndex][source.index][target.index] += link.weight;
            }
            const pairs = matrices.map((matrix) => matrix.length === 1
              ? { value: matrix[0][0], lower: matrix[0][0], upper: matrix[0][0], vector: [1] }
              : computePerronPair(matrix, maxIter, tol / 4));
            const lower = Math.max(0, ...pairs.map((pair) => pair.lower));
            const upper = Math.max(0, ...pairs.map((pair) => pair.upper));
            if (upper === 0) return centrality;

            // Overlapping Perron intervals describe the dominant eigenspace at this tolerance.
            pairs.forEach((pair, componentIndex) => {
              if (pair.upper < lower) return;
              const projection = pair.vector.reduce((sum, value) => sum + value, 0);
              components[componentIndex].forEach((id, index) => {
                centrality[id] = pair.vector[index] * projection;
              });
            });
            const norm = Math.hypot(...Object.values(centrality));
            allNodes.forEach(({ id }) => { centrality[id] /= norm; });
            const action = Object.fromEntries(allNodes.map((node) => [node.id, 0]));
            for (const link of symmetricLinks) {
              action[getNodeId(link.source)] += link.weight * centrality[getNodeId(link.target)];
            }
            const eigenvalue = allNodes.reduce((sum, { id }) => sum + centrality[id] * action[id], 0);
            const residual = Math.hypot(...allNodes.map(({ id }) => action[id] - eigenvalue * centrality[id]));
            if (!(residual <= tol * eigenvalue && upper - eigenvalue <= tol * upper)) {
              throw new Error("Eigenvector centrality did not meet its residual tolerance");
            }
            return centrality;
          }

          /**
           * Computes weighted degree, directed betweenness, PageRank and symmetric
           * eigenvector centrality from available movements between regions.
           */
          function computeHotSpotMetrics(allNodes, enabledLinks) {
            const ids = new Set(allNodes.map((node) => node.id));
            enabledLinks = enabledLinks.filter((link) => !link.disabled &&
              Number.isFinite(link.weight) && link.weight > 0 &&
              getNodeId(link.source) !== getNodeId(link.target) &&
              ids.has(getNodeId(link.source)) && ids.has(getNodeId(link.target)));
            const metrics = {};
            allNodes.forEach((n) => {
              metrics[n.id] = {
                inDegree: 0,
                outDegree: 0,
                betweenness: 0,
                pageRank: allNodes.length ? 1 / allNodes.length : 0,
                eigenvector: 0,
              };
            });
            if (!enabledLinks.length) return metrics;
    
            // Use only enabled links.
            enabledLinks.forEach((link) => {
              const s =
                typeof link.source === "object" ? link.source.id : link.source;
              const t =
                typeof link.target === "object" ? link.target.id : link.target;
              const w = link.weight;
              if (metrics[s]) {
                metrics[s].outDegree += w;
              }
              if (metrics[t]) {
                metrics[t].inDegree += w;
              }
            });
    
            // 2) Directed weighted Brandes betweenness.
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
    
            // Scale inverse weights to exact integer lengths so equal paths share credit.
            const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
            const bits = new DataView(new ArrayBuffer(8));
            const rationalWeights = enabledLinks.map(({ weight }) => {
              if (Number.isInteger(weight)) return [BigInt(weight), 1n];
              bits.setFloat64(0, weight);
              const value = bits.getBigUint64(0);
              const exponent = Number((value >> 52n) & 2047n);
              let numerator = (value & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n);
              const power = exponent ? exponent - 1075 : -1074;
              let denominator = 1n;
              if (power >= 0) numerator <<= BigInt(power);
              else denominator <<= BigInt(-power);
              const divisor = gcd(numerator, denominator);
              return [numerator / divisor, denominator / divisor];
            });
            const common = rationalWeights.reduce((scale, [numerator]) => scale / gcd(scale, numerator) * numerator, 1n);
            const integerCosts = rationalWeights.map(([numerator, denominator]) => common / numerator * denominator);

            // Build adjacency for the available directed routes.
            const adj = {};
            allNodes.forEach((n) => {
              adj[n.id] = [];
            });
            enabledLinks.forEach((e, index) => {
              const s = typeof e.source === "object" ? e.source.id : e.source;
              const t = typeof e.target === "object" ? e.target.id : e.target;
              adj[s].push({ target: t, cost: integerCosts[index] });
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
                dist[s] = 0n;
    
                // Priority queue for Dijkstra's algorithm.
                const Q = new MinHeap();
                Q.push(s, 0n);
    
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
                    } else if (vwDist === dist[w]) {
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
    
            const count = allNodes.length;
            if (!count) return metrics;
            const damping = 0.85;
            const positions = new Map(allNodes.map((node, index) => [node.id, index]));
            const transitions = enabledLinks.map((link) => ({
              source: positions.get(getNodeId(link.source)),
              target: positions.get(getNodeId(link.target)),
              probability: link.weight / metrics[getNodeId(link.source)].outDegree,
            }));
            const dangling = allNodes.flatMap((node, index) => metrics[node.id].outDegree === 0 ? [index] : []);
            let ranks = Array(count).fill(1 / count);
            let converged = false;
            for (let iteration = 0; iteration < 200; iteration += 1) {
              const danglingMass = dangling.reduce((sum, index) => sum + ranks[index], 0);
              const next = Array(count).fill((1 - damping + damping * danglingMass) / count);
              transitions.forEach(({ source, target, probability }) => {
                next[target] += damping * ranks[source] * probability;
              });
              const residual = next.reduce((sum, value, index) => sum + Math.abs(value - ranks[index]), 0);
              ranks = next;
              if (residual / (1 - damping) <= 1e-10) {
                converged = true;
                break;
              }
            }
            if (!converged) throw new Error("PageRank did not meet its residual tolerance");
            allNodes.forEach((node, index) => { metrics[node.id].pageRank = ranks[index]; });

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
    
          function renderGraphPositions() {
            if (currentMode === "graph") {
              // Define boundary margins.
              const inactiveMarginX = Math.min(170, w / 2),
                inactiveMarginY = Math.min(290, h / 2),
                activeMarginX = Math.min(40, w / 2),
                activeMarginY = Math.min(60, h / 2);

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
              if (hoveredLink) {
                updateAnnotationForLink(hoveredLink, annotationGroup);
              } else if (hoveredNode || selectedNodeData) {
                updateAnnotationForNode(hoveredNode || selectedNodeData, annotationGroup);
              }
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
    
            topNMetric = getHotspotRankings(hotspots);
    
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
                d3.select(this).select("circle.primary").attr("stroke", theme.text);
    
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
                  .style("color", theme.muted)
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
              const group = d3.select(this).append("g").attr("class", "hotspot-rings");
              metricsForNode.forEach((metric, i) => {
                group
                  .append("circle")
                  .datum(metric)
                  .attr("class", "hotspotStroke")
                  .attr("data-metric", metric)
                  .attr("r", d.r + (i + 1) * hotspotRingSpacing)
                  .attr("fill", "none")
                  .attr("stroke", hotspotStyles[metric].color)
                  .attr("stroke-width", 2.5)
                  .attr("stroke-linecap", "round")
                  .attr("stroke-dasharray", hotspotStyles[metric].dash)
                  .attr("filter", "url(#hotspotOutline)");
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
              .attr("dy", hotspotLabelDy)
              .attr("font-size", "12px")
              .attr("fill", theme.text)
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
                  .attr("fill", theme.text)
                  .attr("opacity", 0.8);
    
                // Append arc for external trade (e.g., blue).
                donutGroup
                  .append("path")
                  .attr("class", "donut-other")
                  .attr("d", arc({ startAngle: selfAngle, endAngle: 2 * Math.PI }))
                  .attr("fill", theme.canvas)
                  .attr("opacity", 0.1);
              }
            });
    
            forceSim.on("tick", renderGraphPositions);
    
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

            const hotspotOutline = defs.append("filter")
              .attr("id", "hotspotOutline")
              .attr("x", "-50%")
              .attr("y", "-50%")
              .attr("width", "200%")
              .attr("height", "200%");
            hotspotOutline.append("feMorphology")
              .attr("in", "SourceAlpha")
              .attr("operator", "dilate")
              .attr("radius", 1)
              .attr("result", "outline");
            hotspotOutline.append("feFlood").attr("flood-color", theme.canvas);
            hotspotOutline.append("feComposite").attr("in2", "outline").attr("operator", "in");
            const outlineMerge = hotspotOutline.append("feMerge");
            outlineMerge.append("feMergeNode");
            outlineMerge.append("feMergeNode").attr("in", "SourceGraphic");
    
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
              .attr("fill", theme.text)
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
            nodeColor = d3.scaleOrdinal(["#78b8ed", "#ffba86", "#7ccbae", "#f28b96", "#bca6ed", "#d3b49a", "#e8a2cf", "#a0b1c5", "#cfce87", "#72d5df"])
              .domain(Array.from(new Set(Object.values(tradeCommunityTimeline?.partition || {}))).sort((a, b) => a - b))
              .unknown(theme.muted);
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
                const src =
                  typeof link.source === "object" ? link.source.id : link.source;
                const tgt =
                  typeof link.target === "object" ? link.target.id : link.target;
                return tgt === d.id && src !== d.id && !link.disabled;
              }),
              (link) => link.weight,
            );
    
            const outgoingTrade = d3.sum(
              allLinks.filter((link) => {
                const src =
                  typeof link.source === "object" ? link.source.id : link.source;
                const tgt =
                  typeof link.target === "object" ? link.target.id : link.target;
                return src === d.id && tgt !== d.id && !link.disabled;
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
    
            // Local trades count toward total outflow, alongside exports.
            const selfTradeRatio =
              outgoingTrade + selfTrade > 0
                ? ((selfTrade / (outgoingTrade + selfTrade)) * 100).toFixed(1)
                : "NA";
    
            const currentNode = allNodes.find((n) => n.id === d.id);
            let communityID = currentNode ? currentNode.community : "NA";
            if (communityID === undefined) communityID = "NA";

            const simState = isSimulationModeActive()
              ? simulationState.currentFrame?.nodeStates[d.id]
              : null;
            const noteLabel = simState
              ? `Model population units: ${formatCount(simState.N)}\nSusceptible: ${formatCount(simState.S)}\nExposed: ${formatCount(simState.E)}\nInfectious: ${formatCount(simState.I)} (${formatPct(simState.prevalence)})\nRecovered: ${formatCount(simState.R)}\nIncoming Exposure: ${formatSmall(simState.incomingExposure)}\nOutgoing Pressure: ${formatSmall(simState.outgoingPressure)}`
              : `Community ID: ${communityID}\nIncoming Trade: ${incomingTrade}\nOutgoing Trade: ${outgoingTrade}\nLocal Trade: ${selfTrade}\nSelf-Trade Ratio: ${selfTradeRatio}${selfTradeRatio !== "NA" ? "%" : ""}`;
    
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
            const radarElem = noteContent.select("svg.custom-radar").node();
            if (!radarElem) return;
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
              hotspotsMax.inDegree > 0
                ? Math.log(nodeMetrics.inDegree + 1) / Math.log(hotspotsMax.inDegree + 1) : 0,
              hotspotsMax.outDegree > 0
                ? Math.log(nodeMetrics.outDegree + 1) / Math.log(hotspotsMax.outDegree + 1) : 0,
              hotspotsMax.betweenness > 0 ? nodeMetrics.betweenness / hotspotsMax.betweenness : 0,
              hotspotsMax.pageRank > 0 ? nodeMetrics.pageRank / hotspotsMax.pageRank : 0,
              hotspotsMax.eigenvector > 0 ? nodeMetrics.eigenvector / hotspotsMax.eigenvector : 0,
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
            const numAxes = values.length;
            const radarCacheKey = [
              isSimulationModeActive() ? "simulation" : "ledger",
              d.id,
              radarChartWidth,
              radarChartHeight,
              numAxes,
            ].join(":");
    
            // Radar chart geometry
            const radarRadius = Math.min(drawWidth, drawHeight) / 2;
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
              window.prevRadarPoints && window.prevRadarPoints[radarCacheKey]
                ? window.prevRadarPoints[radarCacheKey]
                : newPoints;
            if (previousPoints.length !== newPoints.length) {
              previousPoints = newPoints;
            }
            // Save new points for future transitions.
            if (!window.prevRadarPoints) window.prevRadarPoints = {};
            window.prevRadarPoints[radarCacheKey] = newPoints;
    
            // Global storage for previous vertices.
            let previousVertices =
              window.prevRadarVertices && window.prevRadarVertices[radarCacheKey]
                ? window.prevRadarVertices[radarCacheKey]
                : newPoints;
            if (previousVertices.length !== newPoints.length) {
              previousVertices = newPoints;
            }
            if (!window.prevRadarVertices) window.prevRadarVertices = {};
            window.prevRadarVertices[radarCacheKey] = newPoints;
    
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
              .data(newPoints, (point, index) => index);
    
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
            annotationGroup.selectAll("svg.custom-radar").remove();
            d3.select("#radial-labels-container").selectAll(".radial-axis-label").remove();

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
              .attr("fill", theme.elevated)
              .attr("fill-opacity", 0.8)
              .attr("rx", 4)
              .attr("ry", 4);
            annotationGroup
              .selectAll(".link-annotation .annotation-connector .connector")
              .attr("stroke", selectedNodeData ? theme.text : theme.accent);
            annotationGroup
              .selectAll(".link-annotation .annotation-note .note-line")
              .attr("stroke", selectedNodeData ? theme.text : theme.accent);
            annotationGroup
              .selectAll(".link-annotation .annotation-note text")
              .attr("fill", theme.text);
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
    
          function getHotspotDefinitions(simulation = isSimulationModeActive()) {
            if (simulation) return [
              {
                metric: "inDegree", code: "IN", name: "Incoming Exposure", role: "Incoming Exposure", icon: "fa-arrow-down",
                text: "Infectious movement pressure received from other regions during this step.",
                method: "Incoming trade volume × sender infectious share at step start × movement beta, summed over allowed routes",
              },
              {
                metric: "outDegree", code: "OUT", name: "Outgoing Pressure", role: "Outgoing Pressure", icon: "fa-arrow-up",
                text: "Infectious movement pressure sent to other regions during this step. Blocking exports sets this score to zero.",
                method: "Outgoing trade volume × regional infectious share at step start × movement beta, summed over allowed routes",
              },
              {
                metric: "betweenness", code: "I%", name: "Infectious Prevalence", role: "Prevalence", icon: "fa-percent",
                text: "The infectious share of the regional population at the end of this step. It can remain positive when movement is blocked.",
                method: "Infectious population / total population",
              },
              {
                metric: "pageRank", code: "I", name: "Infectious Burden", role: "Infectious Burden", icon: "fa-magnet",
                text: "The infectious model population in the region at the end of this step, measured in synthetic population units.",
                method: "Infectious compartment count",
              },
              {
                metric: "eigenvector", code: "P/I", name: "Pressure per Infectious", role: "Pressure per Infectious", icon: "fa-tower-broadcast",
                text: "Outgoing movement pressure relative to the infectious population at the end of the step.",
                method: "Outgoing pressure / max(1, infectious population at step end)",
              },
            ];
            return [
              {
                metric: "inDegree", code: "ID", name: "Weighted In Degree", role: "Vulnerable", icon: "fa-arrow-down",
                text: "Regions receiving larger livestock volumes from other regions carry higher exposure pressure.",
                method: "Sum of allowed incoming trade weights",
              },
              {
                metric: "outDegree", code: "OD", name: "Weighted Out Degree", role: "Seeding", icon: "fa-arrow-up",
                text: "Regions sending larger livestock volumes to other regions can seed wider spread. Blocking exports removes this mark.",
                method: "Sum of allowed outgoing trade weights",
              },
              {
                metric: "betweenness", code: "BT", name: "Betweenness", role: "Bottleneck", icon: "fa-route",
                text: "Regions on directed trade paths can connect otherwise separate flows.",
                method: "Brandes shortest paths with inverse trade weights as distances",
              },
              {
                metric: "pageRank", code: "PR", name: "PageRank", role: "Sink", icon: "fa-magnet",
                text: "Regions receiving from influential senders can collect downstream risk. This mark requires an incoming route.",
                method: "Weighted PageRank with damping 0.85 and uniform teleportation",
              },
              {
                metric: "eigenvector", code: "EC", name: "Eigenvector Centrality", role: "Amplifier", icon: "fa-tower-broadcast",
                text: "Regions connected to influential trading partners score highly. Either incoming or outgoing routes can support this mark.",
                method: "Leading eigenvector of the symmetrized trade adjacency matrix",
              },
            ];
          }

          function hotspotSymbol(metric) {
            const { color, dash, pattern } = hotspotStyles[metric];
            const { code } = getHotspotDefinitions().find((entry) => entry.metric === metric);
            return `<svg class="hotspot-symbol" viewBox="0 0 32 32" aria-hidden="true">
              <title>${code}: ${pattern} ring</title>
              <circle cx="16" cy="16" r="13" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="${dash}" filter="url(#hotspotOutline)" />
              <text x="16" y="16" text-anchor="middle" dominant-baseline="central">${code}</text>
            </svg>`;
          }

          function updateHotspotLegend() {
            const definitions = getHotspotDefinitions();
            setControlTip(document.querySelector(".hotspotInfoButton"),
              isSimulationModeActive() ? "Show simulation indicators" : controlTips.hotspotInfo);
            document.querySelectorAll(".hotspotLegend .legendItem").forEach((item) => {
              const icon = item.querySelector(".legendIcon");
              const definition = definitions.find((entry) => entry.metric === icon.dataset.metric);
              icon.innerHTML = hotspotSymbol(definition.metric);
              item.querySelector(".legendLabel").textContent = definition.role;
            });
          }

          function addHotspotLegend() {
            const legend = d3.select(".hotspotLegend");
            if (!legend.empty() && legend.selectAll(".legendItem").size() > 0) {
              updateHotspotLegend();
              return;
            }
    
            const legendData = getHotspotDefinitions();
    
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
    
              itemDiv
                .append("div")
                .attr("class", "legendIcon")
                .attr("data-metric", d.metric)
                .html(hotspotSymbol(d.metric));
    
              // Append the text label.
              itemDiv
                .append("span")
                .attr("class", "legendLabel")
                .style("font-size", "12px")
                .style("color", theme.muted)
                .text(d.role);
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
    
                  const currentLeft = parseFloat(d3.select(this).style("left"));
                  const currentTop = parseFloat(d3.select(this).style("top"));
                  let newX = currentLeft + event.dx;
                  let newY = currentTop + event.dy;
    
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
                    .style("top", newY + "px")
                    .style("right", "auto")
                    .style("bottom", "auto");
                })
                .on("end", function () {
                  d3.select(this).classed("active", false);
                }),
            );
    
            d3.select(".hotspotInfoButton").on("click", showHotspotInfoOverlay);
            updateHotspotLegend();
    

          }
    
          function showHotspotInfoOverlay() {
            const trigger = document.activeElement;
            let overlay = d3.select("body").select("#hotspotInfoOverlay");
            if (overlay.empty()) {
              overlay = d3
                .select("body")
                .append("div")
                .attr("id", "hotspotInfoOverlay");
            }

            const closeOverlay = () => {
              overlay.classed("hide", true);
              setTimeout(() => {
                overlay.remove();
                trigger?.focus();
              }, 240);
            };

            const metrics = getHotspotDefinitions();
            const simulation = isSimulationModeActive();
            const title = simulation ? "Simulation Indicators" : "Hotspot Metrics";

            overlay
              .attr("class", "hotspot-info-overlay")
              .attr("role", "presentation")
              .html(`
                <section class="hotspot-info-card" role="dialog" aria-modal="true" aria-labelledby="hotspotInfoTitle">
                  <button class="hotspot-info-close" type="button" aria-label="Close ${title.toLowerCase()}">
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                  <div class="hotspot-info-head">
                    <div>
                      <div id="hotspotInfoTitle" class="hotspot-info-badge">
                        <i class="fa-solid fa-circle-info"></i>
                        ${title}
                      </div>
                      <p class="hotspot-info-subtitle">
                        ${simulation
                          ? "Rings mark up to three regions with positive scores for each metric in this simulation step. Movement pressure measures exposure carried between regions using infectious shares at step start. Prevalence and burden describe the population at step end."
                          : "Rings mark up to three regions with positive eligible scores on allowed routes between regions at this date. Sink highlights regions receiving imports; Amplifier highlights regions connected to influential partners."}
                        Each metric has a distinct color and ring pattern, shared with the legend.
                      </p>
                    </div>
                  </div>
                  <div class="hotspot-info-grid">
                    ${metrics
                      .map(
                        (metric) => `
                          <article class="hotspot-metric-card">
                            <div class="hotspot-metric-head">
                              <span class="hotspot-metric-code" data-metric="${metric.metric}">${hotspotSymbol(metric.metric)}</span>
                              <h3 class="hotspot-metric-role">
                                <i class="fa-solid ${metric.icon}"></i>
                                <span class="hotspot-metric-title">${metric.role}</span>
                              </h3>
                            </div>
                            ${simulation ? "" : `<h3>${metric.name}</h3>`}
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
            overlay.on("keydown", function (event) {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                closeOverlay();
              } else if (event.key === "Tab") {
                event.preventDefault();
                overlay.select(".hotspot-info-close").node().focus();
              }
            });
            overlay.select(".hotspot-info-close").node().focus();
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
    
          function updateFocusIndicator() {
            const id = selectedNodeData?.id;
            const indicator = document.getElementById("networkFocusIndicator");
            indicator.hidden = !id;
            if (id) {
              const region = document.getElementById("networkFocusRegion");
              const label = `Focus on ${id}`;
              if (region.textContent !== label) region.textContent = label;
            }
            nodeGroup?.selectAll(".nodeGroup")
              .classed("is-focused", (node) => node.id === id);
          }

          function exitNodeFocus() {
            if (!selectedNodeData || window.isSwitchingCSV || window.isSwitchingAppMode || window.isDoingTemporalUpdate) return;
            clearSelection(false);
            const model = isSimulationModeActive() && document.getElementById("simulationModel");
            document.getElementById(model && !model.disabled ? "simulationModel" : "mainFigureSVG")
              ?.focus({ preventScroll: true });
          }

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
            clearSelection(wasSelected && !wasSameNode, window.isDoingTemporalUpdate);
            selectedNodeData = d;
            window.herdlinkComparison?.refresh();
            document.body.classList.add("focus-mode-active");
            updateFocusIndicator();


    
            // Hide the global stats display.
            d3.select("#globalStats").style("visibility", "hidden");
            d3.select("#globalStatsControls").style("display", "none");
            d3.select("#simulationControls").style("display", "none");
    
            // Hide the node stats display.
            d3.select("#nodeStats").style("visibility", "hidden");
            d3.select("#nodeStatsControls").style("display", "none");
    
            // Hide the network trade panel and metadata groups.
            d3.select("#tradeDistribution").style("display", "none");
            d3.select("#tradeClusters").style("display", "none");
            // Show the regional trade panel and metadata groups.
            d3.select("#tradeNodeDistribution").style("visibility", "visible");
            d3.select("#tradeNodeInsight").style("visibility", "visible");





            labelSelection.attr("fill", theme.text);
            // Then update node label styling for the selected node.
            labelSelection
              .filter((nd) => String(nd.id) === String(d.id))
              .attr("fill", theme.text)
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





            d3.select(".statsContainer")
              .style("border", `1px solid ${theme.border}`)
              .style("background", theme.surface);





    
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
                    .attr("stroke-width", 2);
                  return "block";
                } else if (
                  linkData.weight > 0 &&
                  tgtId === d.id &&
                  !linkData.disabled
                ) {
                  d3.select(this)
                    .attr("class", "linkSelectIn")
                    .attr("stroke-width", 2);
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
                  .attr("fill", theme.canvas)
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
                  .attr("fill", theme.canvas)
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
    
            if (!isSimulationModeActive() || !window.isDoingTemporalUpdate) {
              updateNodeTradeDistribution();
              updateTradeNodeInsight(window.currentSelectedTradeNodeInsight);
            }
    
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
            d3.select("#tradeNodeDistribution").classed(classStringA, true);
            d3.select("#tradeNodeInsight").classed(classStringA, true);
            d3.selectAll(".trade-section, .simulation-node-controls").classed(classStringA, true);
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
          function clearSelection(flag, keepFocusPanels = false) {
            clearHoveredLinkState();
            selectedNodeData = null;
            if (!keepFocusPanels) updateFocusIndicator();
            window.herdlinkComparison?.refresh();
            if (!keepFocusPanels) document.body.classList.remove("focus-mode-active");
            if (!flag && !window.isDoingTemporalUpdate) {
              renderSimulationNodeControls();
            }
    
            const colorScale = d3
              .scaleSequential(tradeIntensity)
              .domain(d3.extent(allLinks, (d) => Math.log(d.weight)).reverse()); // Inverted color scale


    
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
              d3.selectAll(".trade-section, .simulation-node-controls").classed("glowing-border", false);
              d3.selectAll(".trade-section, .simulation-node-controls").classed(
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
    
            if (!keepFocusPanels) {
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

              // Show the network trade panel and metadata groups.
              d3.select("#tradeDistribution").style("display", "block");
              d3.select("#tradeClusters").style("display", "block");

              // Hide the regional trade panel and metadata groups.
              d3.select("#tradeNodeDistribution").style("visibility", "hidden");
              d3.select("#tradeNodeInsight").style("visibility", "hidden");
            }





    
            if (!keepFocusPanels && (!isSimulationModeActive() || !window.isDoingTemporalUpdate)) {
              updateGlobalStatsChart(window.currentSelectedStat);
              updateNodeStatsChart(window.currentSelectedNodeStat);
              updateTradeDistribution();
              updateSCCs();
            }

            labelSelection.attr("fill", theme.text);
    
            // Raise labels
            labelSelection.raise();
    
            // Select all foreignObject with sub class inactive-overlay
            d3.selectAll("foreignObject")
              .filter(function () {
                return d3.select(this).classed("inactive-overlay-selected");
              })
              .classed("inactive-overlay-selected", false);





    
            if (isSimulationModeActive() && simulationState.currentFrame) {
              if (!window.isDoingTemporalUpdate) renderSimulationStatsContainer();
            } else {
              d3.select(".statsContainer")
                .classed("simulation-stats-container", false)
                .style("border", `1px solid ${theme.border}`)
                .style("background", theme.surface);

            }





    
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
            if (!keepFocusPanels) {
              document.getElementById("tradeInfo").style.display = "none";
              document.getElementById("inArboContainer").style.visibility = "hidden";
            }
    
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
            if (!keepFocusPanels) {
              updateTradeTable();
              updateInOutArbos();
            }
    
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

          function updateTradeTable() {
            const tradePanelDiv = document.getElementById("tradePanel");
            if (!tradePanelDiv) return;
            if (!selectedNodeData) {
              tradePanelDiv.innerHTML = "";
              return;
            }

            const focalId = selectedNodeData.id;
            const simulationMode = isSimulationModeActive();
            const localLabel = simulationMode ? "Local Transmission" : "Local Trades";
            const outgoingLabel = simulationMode ? "Outgoing Pressure" : "Outgoing Trades";
            const incomingLabel = simulationMode ? "Incoming Exposure" : "Incoming Trades";
            const date = getCurrentSliderDate();
            const unavailable = getSimulationLinkAvailability(date);
            const permissions = getSimulationNodePermissions(date);
            const available = (link) => !unavailable.has(getLinkKey(link.source, link.target));
            const hasRoute = (link) => getNodeId(link.source) !== getNodeId(link.target) &&
              (link.ledgerWeight > 0 || link.weight > 0 || !available(link));
            const outgoing = allLinks
              .filter((link) =>
                getNodeId(link.source) === focalId && hasRoute(link),
              )
              .sort((a, b) => b.weight - a.weight);
            const incoming = allLinks
              .filter((link) =>
                getNodeId(link.target) === focalId && hasRoute(link),
              )
              .sort((a, b) => b.weight - a.weight);
            const allOutgoingEnabled = outgoing.every(available);
            const allIncomingEnabled = incoming.every(available);
            const distances = new Map();
            if (!simulationMode) {
              const selectedCoords = getCoordinatesForStatcode(focalId);
              for (const link of [...outgoing, ...incoming]) {
                const partnerId = getNodeId(link.source) === focalId ? getNodeId(link.target) : getNodeId(link.source);
                distances.set(link, computeDistance(selectedCoords, getCoordinatesForStatcode(partnerId)));
              }
            }
            const maxDistance = d3.max(distances.values()) || 0;
            const localVolume = d3.sum(allLinks.filter((link) =>
              getNodeId(link.source) === focalId && getNodeId(link.target) === focalId), (link) => link.weight);

            function renderRows(rows, section) {
              if (!rows.length) {
                return `<div class="trade-item no-trades">No ${section} ${simulationMode ? "exposure" : "trades"}.</div>`;
              }
              return rows
                .map((link) => {
                  const sourceId = getNodeId(link.source);
                  const targetId = getNodeId(link.target);
                  const partnerId = section === "outgoing" ? targetId : sourceId;
                  const partnerName = getStatnaam(partnerId);
                  const reasons = [];
                  if (!available(link)) reasons.push("link unavailable on this date");
                  if (permissions.get(sourceId)?.exports === false) reasons.push("source exports disabled");
                  if (permissions.get(targetId)?.imports === false) reasons.push("destination imports disabled");
                  const state = link.simulation || {};
                  const prevalence =
                    section === "outgoing"
                      ? state.targetPrevalence
                      : state.sourcePrevalence;
                  const barWidth = simulationMode ? Math.min(
                    50,
                    Math.max(2, (prevalence || 0) * 180),
                  ) : maxDistance > 0 ? 50 * distances.get(link) / maxDistance : 0;
                  const partner = allNodes.find((node) => node.id === partnerId);
                  const barColor = simulationMode ? simulationPrevalenceScale(prevalence || 0)
                    : partner ? nodeColor(partner.community) : theme.muted;
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
                              <rect x="0" y="0" width="${barWidth}" height="10" fill="${barColor}"></rect>
                            </svg>
                          </span>
                          <span class="trade-route-label">[${partnerId}] ${partnerName}${reasons.length ? `<small class="simulation-link-status">Blocked: ${reasons.join("; ")}</small>` : ""}</span>
                        </span>
                        <span class="trade-volume">${simulationMode ? formatSmall(link.weight) : formatCount(link.weight)}</span>
                      </div>
                      <input type="checkbox" class="trade-checkbox" data-section="${section}" data-source="${sourceId}" data-target="${targetId}" aria-label="Available ${sourceId} to ${targetId} on this date" ${available(link) ? "checked" : ""}>
                    </div>
                  `;
                })
                .join("");
            }

            const state =
              simulationState.currentFrame?.nodeStates[selectedNodeData.id] || {};
            const showNodeControls = simulationControlView === "nodes";
            const nodeControls = ensureSimulationNodeControls();
            for (const child of Array.from(tradePanelDiv.childNodes)) {
              if (child !== nodeControls) child.remove();
            }
            tradePanelDiv.insertAdjacentHTML("afterbegin", `
              <div class="simulation-controls-toolbar">
                <button id="simulationControlSwitch" class="simulation-control-switch has-tip" type="button" data-mode="${simulationControlView}" aria-label="${showNodeControls ? "Current mode: Imports and exports. Switch to links on this date." : "Current mode: Links on this date. Switch to imports and exports."}" aria-controls="simulationDateLinkControls simulationNodeControls" data-tip="${showNodeControls ? "Switch to links on this date" : "Switch to imports and exports"}" data-tip-placement="left">
                  <span class="simulation-control-switch-thumb" aria-hidden="true">
                    <span class="simulation-control-switch-icon"><i class="fa-solid fa-shuffle"></i></span>
                  </span>
                </button>
                <div class="trade-info-header">
                  <span class="simulation-focus-region-name" title="[${focalId}] ${selectedNodeData.statnaam}"><i class="fa-solid fa-location-crosshairs"></i> [${focalId}] ${selectedNodeData.statnaam}</span>
                  ${simulationMode ? `<span class="simulation-focus-pill">Prev ${formatPct(state.prevalence || 0)}</span>` : ""}
                </div>
              </div>
              <div id="simulationDateLinkControls" class="trade-sections" ${showNodeControls ? "hidden" : ""}>
                <div class="trade-section trade-section-header simulation-local-control panel-title-label">
                  <label class="simulation-link-control-label">
                    <span><i class="fa-solid fa-repeat" aria-hidden="true"></i> ${localLabel}</span>
                    <input type="checkbox" class="trade-checkbox" data-section="local" data-source="${focalId}" data-target="${focalId}" aria-label="${localLabel} on this date" ${!unavailable.has(getLinkKey(focalId, focalId)) ? "checked" : ""}>
                  </label>
                  ${simulationMode ? "" : `<span class="trade-volume simulation-local-volume" title="Recorded movements within this region">${formatCount(localVolume)}</span>`}
                  <button class="panel-info-button has-tip" type="button" data-tip-key="${simulationMode ? "localTransmission" : "localTrades"}" data-tip-placement="left" aria-label="${localLabel} guide">
                    <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                  </button>
                </div>
                <div class="trade-section">
                  <div class="trade-section-header panel-title-label">
                    <label class="simulation-link-control-label">
                      <span><i class="fa-solid fa-arrow-right-from-bracket"></i> ${outgoingLabel}</span>
                      <input type="checkbox" class="trade-header-checkbox" data-section="outgoing" aria-label="All displayed outgoing links available on this date" ${allOutgoingEnabled ? "checked" : ""}>
                    </label>
                    <button class="panel-info-button has-tip" type="button" data-tip-key="${simulationMode ? "outgoingPressure" : "outgoingTrades"}" data-tip-placement="left" aria-label="${outgoingLabel} guide">
                      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div class="trade-list">${renderRows(outgoing, "outgoing")}</div>
                </div>
                <div class="trade-section">
                  <div class="trade-section-header panel-title-label">
                    <label class="simulation-link-control-label">
                      <span><i class="fa-solid fa-arrow-left-to-bracket"></i> ${incomingLabel}</span>
                      <input type="checkbox" class="trade-header-checkbox" data-section="incoming" aria-label="All displayed incoming links available on this date" ${allIncomingEnabled ? "checked" : ""}>
                    </label>
                    <button class="panel-info-button has-tip" type="button" data-tip-key="${simulationMode ? "incomingExposure" : "incomingTrades"}" data-tip-placement="left" aria-label="${incomingLabel} guide">
                      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div class="trade-list">${renderRows(incoming, "incoming")}</div>
                </div>
              </div>
            `);
            if (nodeControls.parentElement !== tradePanelDiv) tradePanelDiv.appendChild(nodeControls);
            renderSimulationNodeControls();
            const controlSwitch = document.getElementById("simulationControlSwitch");
            controlSwitch.addEventListener("keydown", (event) => event.stopPropagation());
            controlSwitch.addEventListener("keyup", (event) => event.stopPropagation());
            controlSwitch.addEventListener("click", () => {
              simulationControlView = simulationControlView === "links" ? "nodes" : "links";
              const showNodes = simulationControlView === "nodes";
              controlSwitch.dataset.mode = simulationControlView;
              controlSwitch.setAttribute("aria-label", showNodes ? "Current mode: Imports and exports. Switch to links on this date." : "Current mode: Links on this date. Switch to imports and exports.");
              controlSwitch.dataset.tip = showNodes ? "Switch to links on this date" : "Switch to imports and exports";
              document.getElementById("simulationDateLinkControls").hidden = showNodes;
              renderSimulationNodeControls();
            });
            attachTradeCheckboxListeners();
            if (areNetworkControlsLocked()) {
              disableAllCheckboxes();
            }
          }

          // Focus-mode Trade Node Insight
          const FOCUS_OUT_COLOR = theme.outgoing;
          const FOCUS_IN_COLOR = theme.incoming;
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
                    .attr("fill", theme.text)
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
              .attr("fill", theme.text)
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
              .attr("fill", theme.text)
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
              return c === "NA" ? theme.muted : nodeColor(c);
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
                    .attr("fill", theme.text)
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
                    .attr("fill", theme.text)
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
    
          function recordSimulationLinkCheckboxes() {
            const date = getCurrentSliderDate();
            if (!date) return;
            const disabledKeys = getSimulationLinkAvailability(date);
            let changed = false;
            d3.selectAll(".trade-checkbox").each(function () {
              const key = getLinkKey(this.dataset.source, this.dataset.target);
              const disabled = !this.checked;
              if (disabled !== disabledKeys.has(key)) {
                setSimulationLinkIntervention(key, disabled, date);
                changed = true;
              }
            });
            if (changed) applyNetworkControlChanges("Applying availability for this date");
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
    
              recordSimulationLinkCheckboxes();
    
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
              recordSimulationLinkCheckboxes();
    
              // Update header checkbox state for both sections.
              updateHeaderCheckboxes();
            });
            updateHeaderCheckboxes();
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
              )
                .property("checked", allChecked)
                .property("indeterminate", !allChecked && checkboxes.some((cb) => cb.checked));
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
    
            const disabledKeys = getDisabledLinkKeys(getCurrentSliderDate());
            allLinks.forEach((link) => {
              link.disabled = disabledKeys.has(getLinkKey(link.source, link.target));
            });
            enabledLinks = allLinks.filter((link) => !link.disabled && link.weight > 0);
    
            // 2. Update link attributes.
            // When computing the log scale, ignore zero-weight links.
            const validLinks = allLinks.filter((link) => link.weight > 0);
            const edgeExtent = d3.extent(validLinks, (d) => Math.log(d.weight));
            const edgeColor = d3
              .scaleSequential(
                isSimulationModeActive()
                  ? exposureIntensity
                  : tradeIntensity,
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
    
          function computeDistanceTradeFit(data) {
            const points = data.filter((point) =>
              Number.isFinite(point.distance) && point.distance > 0 &&
              Number.isFinite(point.weight) && point.weight > 0,
            );
            const n = points.length;
            if (new Set(points.map((point) => point.distance)).size < 3) {
              return { status: "insufficient-data", n };
            }
            const logDistances = points.map((point) => Math.log(point.distance));
            const logWeights = points.map((point) => Math.log(point.weight));
            const logMin = logDistances.reduce((min, value) => Math.min(min, value), Infinity);
            const logMax = logDistances.reduce((max, value) => Math.max(max, value), -Infinity);
            if (logMin === logMax) return { status: "unidentifiable", n };
            const center = (logMin + logMax) / 2;
            const yMean = logWeights.reduce((sum, value) => sum + value, 0) / n;
            const ys = logWeights.map((value) => value - yMean);
            const ssTotal = ys.reduce((sum, value) => sum + value * value, 0);
            const yScale = logWeights.reduce((max, value) => Math.max(max, Math.abs(value)), 1);
            const roundingNoise = n * (Number.EPSILON * yScale) ** 2;
            if (ssTotal <= roundingNoise) return { status: "no-decay", n };
            const differences = logDistances.map((value) =>
              value === logMin ? -Infinity : value + Math.log(-Math.expm1(logMin - value)),
            );
            const normalized = differences.map((value) => Math.exp(value - logMax));
            const maxDifference = logMax + Math.log(-Math.expm1(logMin - logMax));
            const maxNormalized = Math.exp(maxDifference - logMax);
            const softplus = (value) => value > 0
              ? value + Math.log1p(Math.exp(-value)) : Math.log1p(Math.exp(value));
            const log1pRatio = (value) => value === 0 ? 1 : Math.log1p(value) / value;
            const xs = new Float64Array(n);

            // Variable projection solves amplitude and decay for each distance scale.
            function profile(theta) {
              const logSigma = center + Math.tan(theta);
              const denominator = logMin + softplus(logSigma - logMin);
              let range;
              if (theta === -Math.PI / 2) {
                range = logMax - logMin;
                for (let i = 0; i < n; i++) xs[i] = (logDistances[i] - logMin) / range;
              } else if (theta === Math.PI / 2) {
                range = 0;
                for (let i = 0; i < n; i++) xs[i] = normalized[i] / maxNormalized;
              } else if (denominator < logMax) {
                range = softplus(maxDifference - denominator);
                for (let i = 0; i < n; i++) xs[i] = softplus(differences[i] - denominator) / range;
              } else {
                const ratio = Math.exp(logMax - denominator);
                const scaledRange = maxNormalized * log1pRatio(ratio * maxNormalized);
                range = ratio * scaledRange;
                for (let i = 0; i < n; i++) {
                  xs[i] = normalized[i] * log1pRatio(ratio * normalized[i]) / scaledRange;
                }
              }
              let xMean = 0;
              for (let i = 0; i < n; i++) xMean += xs[i];
              xMean /= n;
              let covariance = 0;
              let variance = 0;
              for (let i = 0; i < n; i++) {
                const dx = xs[i] - xMean;
                covariance += dx * ys[i];
                variance += dx * dx;
              }
              const slope = Math.min(0, covariance / variance);
              let error = 0;
              for (let i = 0; i < n; i++) {
                const residual = ys[i] - slope * (xs[i] - xMean);
                error += residual * residual;
              }
              return { error, slope, xMean, range, logSigma };
            }

            // Brent's bounded minimizer uses atan(log sigma) to cover positive scales.
            let a = -Math.PI / 2;
            let b = Math.PI / 2;
            const power = profile(a);
            const exponential = profile(b);
            let x = 0;
            let w = x;
            let v = x;
            let current = profile(x);
            let fw = current.error;
            let fv = fw;
            let step = 0;
            let previousStep = 0;
            let converged = false;
            const golden = (3 - Math.sqrt(5)) / 2;
            for (let iteration = 0; iteration < 128; iteration++) {
              const midpoint = (a + b) / 2;
              const tolerance = 1e-9 * Math.abs(x) + 1e-11;
              if (Math.abs(x - midpoint) <= 2 * tolerance - (b - a) / 2) {
                converged = true;
                break;
              }
              let parabolic = false;
              if (Math.abs(previousStep) > tolerance) {
                const r = (x - w) * (current.error - fv);
                const q = (x - v) * (current.error - fw);
                let numerator = (x - v) * q - (x - w) * r;
                let denominator = 2 * (q - r);
                if (denominator > 0) numerator = -numerator;
                denominator = Math.abs(denominator);
                const savedStep = previousStep;
                previousStep = step;
                if (Math.abs(numerator) < Math.abs(denominator * savedStep / 2) &&
                    numerator > denominator * (a - x) && numerator < denominator * (b - x)) {
                  step = numerator / denominator;
                  const candidate = x + step;
                  if (candidate - a < 2 * tolerance || b - candidate < 2 * tolerance) {
                    step = x < midpoint ? tolerance : -tolerance;
                  }
                  parabolic = true;
                }
              }
              if (!parabolic) {
                previousStep = x < midpoint ? b - x : a - x;
                step = golden * previousStep;
              }
              const u = x + (Math.abs(step) >= tolerance ? step : step > 0 ? tolerance : -tolerance);
              const candidate = profile(u);
              if (!Number.isFinite(candidate.error)) return { status: "optimization-failed", n };
              if (candidate.error <= current.error) {
                if (u < x) b = x;
                else a = x;
                v = w;
                fv = fw;
                w = x;
                fw = current.error;
                x = u;
                current = candidate;
              } else {
                if (u < x) a = u;
                else b = u;
                if (candidate.error <= fw || w === x) {
                  v = w;
                  fv = fw;
                  w = u;
                  fw = candidate.error;
                } else if (candidate.error <= fv || v === x || v === w) {
                  v = u;
                  fv = candidate.error;
                }
              }
            }
            if (!converged) return { status: "optimization-failed", n };
            if (current.slope === 0 && power.slope === 0 && exponential.slope === 0) {
              return { status: "no-decay", n };
            }
            let status = "fit";
            const errorTolerance = 64 * (Number.EPSILON * ssTotal + roundingNoise);
            if (Math.min(power.error, exponential.error) <= current.error + errorTolerance) {
              const usePower = power.error <= exponential.error;
              current = usePower ? power : exponential;
              status = usePower ? "power-law-limit" : "exponential-limit";
            }
            if (current.slope === 0) return { status: "no-decay", n };
            const result = {
              status, n, slope: current.slope,
              logReferenceVolume: yMean - current.slope * current.xMean,
              logRmse: Math.sqrt(current.error / n),
              distanceMin: points.reduce((min, point) => Math.min(min, point.distance), Infinity),
              distanceMax: points.reduce((max, point) => Math.max(max, point.distance), -Infinity),
            };
            if (status !== "fit") return result;
            const sigma = Math.exp(current.logSigma);
            const nu = -current.slope / current.range;
            const logAmplitude = result.logReferenceVolume + nu * softplus(logMin - current.logSigma);
            if (!(sigma > 0) || !Number.isFinite(sigma) || !Number.isFinite(nu) || !Number.isFinite(logAmplitude)) {
              return { status: "unidentifiable", n };
            }
            return {
              ...result, sigma, nu, logSigma: current.logSigma, logAmplitude,
            };
          }

          function evaluateDistanceTradeLog(fit, distance) {
            const logMin = Math.log(fit.distanceMin);
            const logMax = Math.log(fit.distanceMax);
            const logDistance = Math.log(distance);
            let position;
            if (fit.status === "power-law-limit") {
              position = (logDistance - logMin) / (logMax - logMin);
            } else if (fit.status === "exponential-limit") {
              position = (distance - fit.distanceMin) / (fit.distanceMax - fit.distanceMin);
            } else if (fit.status === "fit") {
              const softplus = (value) => value > 0
                ? value + Math.log1p(Math.exp(-value)) : Math.log1p(Math.exp(value));
              const denominator = logMin + softplus(fit.logSigma - logMin);
              if (denominator < logMax) {
                const difference = logDistance + Math.log(-Math.expm1(logMin - logDistance));
                const maxDifference = logMax + Math.log(-Math.expm1(logMin - logMax));
                position = softplus(difference - denominator) / softplus(maxDifference - denominator);
              } else {
                const ratio = Math.exp(logMax - denominator);
                const scaled = Math.exp(logDistance - logMax) * -Math.expm1(logMin - logDistance);
                const maxScaled = -Math.expm1(logMin - logMax);
                const log1pRatio = (value) => value === 0 ? 1 : Math.log1p(value) / value;
                position = scaled * log1pRatio(ratio * scaled) / (maxScaled * log1pRatio(ratio * maxScaled));
              }
            } else {
              return NaN;
            }
            return fit.logReferenceVolume + fit.slope * position;
          }

          function computeDistanceTradeConfidence(data, fit, distances) {
            const finite = fit.status === "fit";
            const hasCurve = finite || fit.status === "power-law-limit" || fit.status === "exponential-limit";
            const points = data.filter((point) =>
              Number.isFinite(point.distance) && point.distance > 0 &&
              Number.isFinite(point.weight) && point.weight > 0,
            );
            const regions = new Map();
            const unavailable = (reason) => ({ status: "unavailable", reason, regions: regions.size });
            if (!hasCurve) return unavailable("no-fit");
            const validId = (id) => (typeof id === "string" && id.length > 0) ||
              (typeof id === "number" && Number.isFinite(id));
            for (const point of points) {
              if (!validId(point.sourceId) || !validId(point.targetId) || point.sourceId === point.targetId) {
                return unavailable("missing-region-ids");
              }
              for (const id of [point.sourceId, point.targetId]) {
                if (!regions.has(id)) regions.set(id, regions.size);
              }
            }
            const p = finite ? 3 : 2;
            if (points.length <= p || regions.size <= p) return unavailable("insufficient-data");
            if (!distances.length || distances.some((distance) => !Number.isFinite(distance) || distance <= 0)) {
              return unavailable("invalid-distance");
            }
            const logMin = Math.log(fit.distanceMin);
            const logRange = Math.log(fit.distanceMax) - logMin;
            function derivatives(distance) {
              if (!finite) {
                const position = fit.status === "power-law-limit"
                  ? (Math.log(distance) - logMin) / logRange
                  : (distance - fit.distanceMin) / (fit.distanceMax - fit.distanceMin);
                return { j: [1, position] };
              }
              const q = Math.log(distance) - fit.logSigma;
              const value = q > 0 ? q + Math.log1p(Math.exp(-q)) : Math.log1p(Math.exp(q));
              const w = q >= 0 ? 1 / (1 + Math.exp(-q)) : Math.exp(q) / (1 + Math.exp(q));
              return { j: [1, -value, fit.nu * w], w };
            }
            const rows = points.map((point) => ({
              ...derivatives(point.distance),
              residual: Math.log(point.weight) - evaluateDistanceTradeLog(fit, point.distance),
              source: regions.get(point.sourceId), target: regions.get(point.targetId),
            }));
            if (rows.some((row) => !Number.isFinite(row.residual) || row.j.some((value) => !Number.isFinite(value)))) {
              return unavailable("singular");
            }
            const scales = Array(p).fill(0);
            for (const row of rows) {
              for (let i = 0; i < p; i++) scales[i] = Math.hypot(scales[i], row.j[i]);
            }
            if (scales.some((value) => !(value > 0) || !Number.isFinite(value))) return unavailable("singular");
            const matrix = () => Array.from({ length: p }, () => Array(p).fill(0));
            const bread = matrix();
            const meat = matrix();
            const regionScores = Array.from({ length: regions.size }, () => Array(p).fill(0));
            const pairScores = new Map();
            for (const row of rows) {
              const j = row.j.map((value, i) => value / scales[i]);
              for (let i = 0; i < p; i++) {
                for (let k = 0; k < p; k++) bread[i][k] += j[i] * j[k];
              }
              if (finite) {
                const cross = row.residual * (row.w / scales[1] / scales[2]);
                bread[1][2] -= cross;
                bread[2][1] -= cross;
                bread[2][2] += row.residual * (fit.nu * row.w * (1 - row.w) / scales[2] / scales[2]);
              }
              const first = Math.min(row.source, row.target);
              const second = Math.max(row.source, row.target);
              if (!pairScores.has(first)) pairScores.set(first, new Map());
              const pairs = pairScores.get(first);
              if (!pairs.has(second)) pairs.set(second, Array(p).fill(0));
              const pair = pairs.get(second);
              for (let i = 0; i < p; i++) {
                const score = row.residual * j[i];
                regionScores[row.source][i] += score;
                regionScores[row.target][i] += score;
                pair[i] += score;
              }
            }
            function addOuter(score, sign) {
              for (let i = 0; i < p; i++) {
                for (let k = 0; k < p; k++) meat[i][k] += sign * score[i] * score[k];
              }
            }
            for (const score of regionScores) addOuter(score, 1);
            for (const pairs of pairScores.values()) {
              for (const score of pairs.values()) addOuter(score, -1);
            }
            // Column scaling and partial pivoting expose rank loss without changing the model.
            const inverse = matrix();
            for (let i = 0; i < p; i++) inverse[i][i] = 1;
            const norm = Math.max(...bread.map((row) => row.reduce((sum, value) => sum + Math.abs(value), 0)));
            const tolerance = Number.EPSILON * p * norm;
            for (let column = 0; column < p; column++) {
              let pivot = column;
              for (let row = column + 1; row < p; row++) {
                if (Math.abs(bread[row][column]) > Math.abs(bread[pivot][column])) pivot = row;
              }
              if (!Number.isFinite(bread[pivot][column]) || Math.abs(bread[pivot][column]) <= tolerance) {
                return unavailable("singular");
              }
              [bread[column], bread[pivot]] = [bread[pivot], bread[column]];
              [inverse[column], inverse[pivot]] = [inverse[pivot], inverse[column]];
              const divisor = bread[column][column];
              for (let k = 0; k < p; k++) {
                bread[column][k] /= divisor;
                inverse[column][k] /= divisor;
              }
              for (let row = 0; row < p; row++) {
                if (row === column) continue;
                const factor = bread[row][column];
                for (let k = 0; k < p; k++) {
                  bread[row][k] -= factor * bread[column][k];
                  inverse[row][k] -= factor * inverse[column][k];
                }
              }
            }
            const band = [];
            for (const distance of distances) {
              const j = derivatives(distance).j.map((value, i) => value / scales[i]);
              const influence = Array(p).fill(0);
              for (let i = 0; i < p; i++) {
                for (let k = 0; k < p; k++) influence[i] += inverse[k][i] * j[k];
              }
              let variance = 0;
              for (let i = 0; i < p; i++) {
                for (let k = 0; k < p; k++) variance += influence[i] * meat[i][k] * influence[k];
              }
              const predicted = evaluateDistanceTradeLog(fit, distance);
              if (!(variance >= 0) || !Number.isFinite(variance) || !Number.isFinite(predicted)) {
                return unavailable("invalid-variance");
              }
              const halfWidth = 1.959963984540054 * Math.sqrt(variance);
              band.push({ distance, logLower: predicted - halfWidth, logUpper: predicted + halfWidth });
            }
            return { status: "available", regions: regions.size, points: band };
          }

          function renderDistanceTradeCurve(g, data, className, color, dash, x, y, network = false) {
            const fit = computeDistanceTradeFit(data);
            const hasCurve = ["fit", "power-law-limit", "exponential-limit"].includes(fit.status);
            const curves = g.selectAll(`path.${className}-outline, path.${className}`)
              .data(hasCurve ? network ? ["outline", "line"] : ["line"] : []);
            const logY = d3.scaleLinear().domain(y.domain().map(Math.log)).range(y.range());
            let path = null;
            let distances = [];
            if (hasCurve) {
              const logMin = Math.log(fit.distanceMin);
              const logRange = Math.log(fit.distanceMax) - logMin;
              distances = Array.from({ length: 65 }, (_, i) =>
                i === 0 ? fit.distanceMin : i === 64 ? fit.distanceMax
                  : Math.exp(logMin + logRange * i / 64),
              );
              path = d3.line()(distances.map((distance) =>
                [x(distance), logY(evaluateDistanceTradeLog(fit, distance))],
              ));
            }
            const clipId = `${className}-clip`;
            g.selectAll(`clipPath.${className}`).data([null]).join("clipPath")
              .attr("class", className).attr("id", clipId)
              .selectAll("rect").data([null]).join("rect")
              .attr("width", x.range()[1]).attr("height", y.range()[0]);
            if (network) {
              fit.confidence = computeDistanceTradeConfidence(data, fit, distances);
              g.selectAll("path.distance-trade-confidence")
                .data(fit.confidence.status === "available" ? [fit.confidence.points] : [])
                .join("path")
                .attr("class", "distance-trade-confidence")
                .attr("fill", color).attr("fill-opacity", 0.18)
                .attr("pointer-events", "none")
                .attr("clip-path", `url(#${clipId})`)
                .lower()
                .transition().duration(750)
                .attr("d", d3.area()
                  .x((point) => x(point.distance))
                  .y0((point) => logY(point.logLower))
                  .y1((point) => logY(point.logUpper)));
            }
            curves.join("path")
              .attr("class", (layer) => layer === "outline" ? `${className}-outline` : className)
              .attr("fill", "none")
              .attr("stroke", (layer) => layer === "outline" ? theme.surface : color)
              .attr("stroke-width", (layer) => layer === "outline" ? 7 : network ? 3 : 2)
              .attr("stroke-dasharray", (layer) => layer === "outline" ? null : dash)
              .attr("stroke-linecap", "round")
              .attr("stroke-linejoin", "round")
              .attr("pointer-events", "none")
              .attr("clip-path", `url(#${clipId})`)
              .raise()
              .transition().duration(750)
              .attr("d", path);
            return fit;
          }

          function renderDistanceTradeSummary(g, fits, width, network = false) {
            const rows = [];
            for (const { label, color, model } of fits) {
              const prefix = network ? "" : `${label}: `;
              let detail = `${model.n} routes`;
              if (Number.isFinite(model.slope)) {
                const drop = d3.format(".0%")(-Math.expm1(model.slope));
                const range = `${d3.format(".0f")(model.distanceMin)}–${d3.format(".0f")(model.distanceMax)} km`;
                if (network) {
                  rows.push({ text: `${detail} · ${model.confidence.regions} regions`, color });
                  detail = `${drop} fitted drop · ${range}`;
                } else {
                  detail += ` · ${drop} drop (${range})`;
                }
              }
              rows.push({ text: prefix + detail, color,
                title: Number.isFinite(model.slope)
                  ? "Fitted decline from the shortest to the longest observed route. This is a descriptive association with distance."
                  : "Number of recorded routes with positive volume and a known positive distance." });
              if (network && Number.isFinite(model.slope)) {
                const available = model.confidence.status === "available";
                rows.push({ text: available ? "Approx. 95% CI" : "CI unavailable", color: theme.muted,
                  title: available
                    ? "Approximate 95% confidence intervals for typical volume at each distance, using the curve form shown and accounting for routes that share a region."
                    : "The plot shows the fitted typical volume; the confidence estimate is unavailable for this curve." });
              }
            }
            const summaries = g.selectAll("text.distance-fit-summary").data(rows).join("text")
              .attr("class", "distance-fit-summary")
              .attr("text-anchor", "end")
              .attr("x", width - 4).attr("y", (_, i) => (network ? 30 : 15) + i * 15)
              .attr("fill", (row) => row.color)
              .style("font", `10px ${theme.font}`)
              .text((row) => row.text)
              .raise();
            summaries.append("title").text((row) => row.title || "Recorded routes and their participating regions.");
          }

          function distanceTradeFitLabel(fit) {
            if (fit.status === "fit") return "Distance curve";
            if (fit.status === "power-law-limit") return "Power-law limit";
            if (fit.status === "exponential-limit") return "Exponential limit";
            if (fit.status === "insufficient-data") return "Too few distances";
            if (fit.status === "no-decay") return "No decreasing fit";
            return "No finite curve fit";
          }

          function distanceTradeFitColor(fit) {
            if (fit.status === "fit") return "#39ff14";
            if (fit.status === "exponential-limit") return "#00e5ff";
            if (fit.status === "power-law-limit") return "#fff200";
            return "#ff1744";
          }

          function distanceTradeFitDescription(fit) {
            if (fit.status === "fit") {
              return `V(d) = A (1 + d/σ)^−ν; σ = ${fit.sigma.toPrecision(3)} km; ν = ${fit.nu.toPrecision(3)}. Log RMSE = ${fit.logRmse.toFixed(3)} across ${fit.n} routes. The curve describes typical trade volume on recorded routes.`;
            }
            if (fit.status === "insufficient-data") return "A curve needs at least three distinct positive distances and positive trade volumes.";
            if (fit.status === "no-decay") return "The fitted distance trend is flat across these routes.";
            if (fit.status === "power-law-limit" || fit.status === "exponential-limit") {
              const name = fit.status === "power-law-limit" ? "power-law" : "exponential";
              return `The fitted trade curve follows the kernel's ${name} limit. Log RMSE = ${fit.logRmse.toFixed(3)} across ${fit.n} routes. This limit describes how typical volume changes with distance.`;
            }
            if (fit.status === "unidentifiable") return "The distance scale and decline shape remain unresolved for these routes.";
            return "Curve fitting stopped before convergence.";
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
              if (!link.disabled && link.weight > 0) {
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
                if (!Number.isFinite(distance) || distance <= 0) return;
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
                .attr("class", "no-trade-data")
                .text("No trade routes with known distance.")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle");
              return;
            }
            g.select(".no-trade-data").remove();
    
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
              .attr("stroke", theme.grid)
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
              .attr("fill", theme.muted)
              .style("font", `10px ${theme.font}`)
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
              .attr("stroke", theme.grid)
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
              .attr("fill", theme.muted)
              .style("font", `10px ${theme.font}`)
              .text((d) => tickFormat(d));
            yGridLabels.exit().remove();
    
            // Update scatter points using the D3 update pattern
            const communityByNode = tradeCommunityTimeline?.partition || {};
            const circles = g
              .selectAll(".trade-circle")
              .data(tradeData, (d) => d.sourceId + "-" + d.targetId);
            circles.exit().transition().duration(750).attr("r", 0).remove();
            circles
              .attr("fill", (d) => nodeColor(communityByNode[d.sourceId]))
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
              .attr("fill", (d) => nodeColor(communityByNode[d.sourceId]))
              .attr("opacity", 0.7)
              .transition()
              .duration(750)
              .attr("r", (d) => sizeScale(d.massProduct));
    
            const fit = renderDistanceTradeCurve(g, tradeData, "distance-curve-network", theme.accent, "5,5", xScale, yScale, true);
            renderDistanceTradeSummary(g, [{ model: fit, color: theme.text }], width, true);

            // Axis Labeling
            let topLabel = svg.select(".top-label");
            if (topLabel.empty()) {
              topLabel = svg.append("g").attr("class", "top-label");
              topLabel
                .append("text")
                .attr("class", "distance-label")
                .attr("text-anchor", "middle")
                .attr("fill", theme.text)
                .style("font", `12px ${theme.font}`)
                .text("Distance (km) →");
            }
            topLabel.attr(
              "transform",
              `translate(${containerNode.clientWidth / 2}, ${margin.top / 2})`,
            );
            topLabel.select(".distance-label").attr("y", 20);
    
            const fitLabel = g.selectAll("text.distance-fit-label").data([fit]).join("text")
              .raise()
              .attr("class", "distance-fit-label")
              .attr("text-anchor", "end")
              .attr("fill", theme.text)
              .style("font", `11px ${theme.font}`)
              .attr("x", width - 4).attr("y", 15)
              .text(null);
            fitLabel.append("tspan")
              .attr("class", "distance-fit-dot")
              .attr("color", distanceTradeFitColor)
              .attr("aria-hidden", "true")
              .text("● ");
            fitLabel.append("tspan").text(distanceTradeFitLabel);
            fitLabel.append("title").text(distanceTradeFitDescription);
    
            let rightLabel = svg.select(".right-label");
            if (rightLabel.empty()) {
              rightLabel = svg.append("g").attr("class", "right-label");
              rightLabel
                .append("text")
                .attr("class", "volume-label")
                .attr("text-anchor", "middle")
                .attr("fill", theme.text)
                .style("font", `12px ${theme.font}`)
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
                .attr("class", "no-trade-data")
                .text("No data available")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("fill", theme.muted)
                .attr("text-anchor", "middle")
                .style("font-style", "italic");
              return;
            }
            g.select(".no-trade-data").remove();
    
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
            const outgoingColor = theme.outgoing;
            const incomingColor = theme.incoming;
    
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
              .attr("stroke", theme.grid)
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
              .attr("fill", theme.text)
              .style("font", `10px ${theme.font}`)
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
              .attr("stroke", theme.grid)
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
              .attr("fill", theme.text)
              .style("font", `10px ${theme.font}`)
              .text((d) => tickFormat(d));
            yGridLabels.exit().remove();
    
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
    
            const fits = [
              { label: "All", color: "fuchsia", model: renderDistanceTradeCurve(g, tradeDataAll, "distance-curve-all", "fuchsia", "5,5", xScale, yScale) },
              { label: "Out", color: outgoingColor, model: renderDistanceTradeCurve(g, outgoingData, "distance-curve-outgoing", outgoingColor, "4,4", xScale, yScale) },
              { label: "In", color: incomingColor, model: renderDistanceTradeCurve(g, incomingData, "distance-curve-incoming", incomingColor, "4,4", xScale, yScale) },
            ];
            const fitLabels = g.selectAll("text.distance-fit-label").data(fits).join("text")
              .raise()
              .attr("class", "distance-fit-label")
              .attr("text-anchor", "end")
              .attr("fill", (d) => d.color)
              .style("font", `11px ${theme.font}`)
              .attr("x", width).attr("y", (_, i) => height - 50 + i * 14)
              .text(null);
            fitLabels.append("tspan").text((d) => `${d.label}: `);
            fitLabels.append("tspan")
              .attr("class", "distance-fit-dot")
              .attr("color", (d) => distanceTradeFitColor(d.model))
              .attr("aria-hidden", "true")
              .text("● ");
            fitLabels.append("tspan").text((d) => distanceTradeFitLabel(d.model));
            fitLabels.append("title").text((d) => distanceTradeFitDescription(d.model));
            renderDistanceTradeSummary(g, fits, width);

            // Axis Labeling
            let topLabel = svg.select(".top-label");
            if (topLabel.empty()) {
              topLabel = svg.append("g").attr("class", "top-label");
              topLabel
                .append("text")
                .attr("class", "distance-label")
                .attr("text-anchor", "middle")
                .attr("fill", theme.text)
                .style("font", `12px ${theme.font}`)
                .text("Distance (km) →");
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
                .attr("fill", theme.text)
                .style("font", `12px ${theme.font}`)
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
            topNMetric = getHotspotRankings(hotspots);
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
              clearSelection(true, true);
            }
    
            // Stop the current simulation.
            forceSim.alphaTarget(0).stop();
    
            // Update simulation data.
            forceSim.nodes(allNodes);
            forceSim.force("link").links(nonZeroLinks);
    
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
              .attr("display", (d) => (!d.disabled && d.weight > 0 ? "block" : "none"))
              .attr("class", "link")
              .attr("filter", null)
              .attr("marker-end", null)
              .attr("opacity", (d) => (!d.disabled && d.weight > 0 ? null : 0))
              .style("opacity", null)
              .transition()
              .duration(400)
              .attr("stroke", (d) => {
                if (d.weight <= 0) return "none";
                if (selectedNodeData) {
                  const src = typeof d.source === "object" ? d.source.id : d.source;
                  return src === selectedNodeData.id ? theme.outgoing : theme.incoming;
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
                d3.select(this).select("circle.primary").attr("stroke", theme.text);
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
                  .style("color", theme.muted)
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
              const group = d3.select(this).append("g").attr("class", "hotspot-rings");
              metricsForNode.forEach((metric, i) => {
                group
                  .append("circle")
                  .datum(metric)
                  .attr("class", "hotspotStroke")
                  .attr("data-metric", metric)
                  .attr("r", d.r + (i + 1) * hotspotRingSpacing)
                  .attr("fill", "none")
                  .attr("stroke", hotspotStyles[metric].color)
                  .attr("stroke-width", 2.5)
                  .attr("stroke-linecap", "round")
                  .attr("stroke-dasharray", hotspotStyles[metric].dash)
                  .attr("filter", "url(#hotspotOutline)");
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
                  .attr("fill", theme.text)
                  .attr("opacity", 0.8);
    
                // Append arc for external trade (e.g., blue).
                donutGroup
                  .append("path")
                  .attr("class", "donut-other")
                  .attr("d", arc({ startAngle: selfAngle, endAngle: 2 * Math.PI }))
                  .attr("fill", theme.canvas)
                  .attr("opacity", 0.1);
              }
            });
    
            // Transition update for nodes.
            nodesSelection.transition().duration(400).style("opacity", 1);
    
            // MERGE enter and update nodes.
            nodeEnter = nodesEnter.merge(nodesSelection);
    
            // Recalculate node radius for all nodes (new and updated).
            nodeSize.domain(d3.extent(allNodes, (d) => d.tradeTotal));
            nodeColor.domain(Array.from(new Set(Object.values(tradeCommunityTimeline?.partition || {}))).sort((a, b) => a - b));
    
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
                  .style("color", theme.muted)
                  .html('<i class="fa-solid fa-circle-xmark"></i>');
                foSel = nodeGroup.select("foreignObject.inactive-overlay");
              }
    
              // If tradeTotal > 0, fade in the circle and fade out the overlay.
              if (d.tradeTotal > 0) {
                circleSel
                  .attr("fill", nodeColor(d.community))
                  .transition()
                  .duration(200)
                  .style("opacity", 1)
                  .attr("r", d.r)
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
    
            labelSelection = labelsEnter.merge(labelsSelection)
              .attr("dy", hotspotLabelDy);
    
            // Restart simulation in graph mode.
            if (currentMode === "graph") {
              forceSim.alpha(1).restart();
            } else {
              updateMapPositionsWithTransition(
                (instant = true),
                (recordOnly = true),
              );
            }
    
            // If previously hovered over a link, first check if it has zero weight.
            if (previousLinkIndex !== null) {
              const previousLink = allLinks.find((d) => d.id === previousLinkIndex);
              if (previousLink && !previousLink.disabled && previousLink.weight > 0) {
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
              } else {
                clearSelection(false);
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
              renderSimulationPanels();
            }
    
            isDoingTemporalUpdate = false;
            window.isDoingTemporalUpdate = false;
          }
    
          function updateCurrentDateDisplay(dateObj) {
            window.herdlinkComparison?.refresh();
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
                .attr("fill", theme.canvas)
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
                .attr("fill", theme.text)
                .attr("opacity", 0.1);
            });
          }
    
          function getHotspotRankings(metrics, simulation = isSimulationModeActive(), limit = numberPrintedHotspots) {
            return Object.fromEntries(metricNames.map((metric) => {
              const eligible = Object.keys(metrics || {}).filter((id) => {
                const scores = metrics[id];
                if (!Number.isFinite(scores[metric]) || scores[metric] <= 0) return false;
                if (simulation) return true;
                if (metric === "pageRank") return scores.inDegree > 0;
                if (metric === "eigenvector") return scores.inDegree + scores.outDegree > 0;
                return true;
              });
              eligible.sort((a, b) => metrics[b][metric] - metrics[a][metric] || a.localeCompare(b));
              return [metric, eligible.slice(0, limit)];
            }));
          }
    
          function hotspotLabelDy(d) {
            const ringCount = metricNames.filter((metric) =>
              topNMetric[metric].includes(d.id),
            ).length;
            return -ringCount * hotspotRingSpacing;
          }

          function updateHotspotMarks() {
            topNMetric = getHotspotRankings(hotspots);
            nodeGroup.selectAll(".nodeGroup").each(function (d) {
              const group = d3.select(this).select(".hotspot-rings");
    
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
                .attr("r", (m, i) => d.r + (i + 1) * hotspotRingSpacing)
                .style("opacity", 1)
                .attr("stroke", (m) => hotspotStyles[m].color);
    
              // Append new strokes for any newly added metrics.
              strokes
                .enter()
                .append("circle")
                .attr("class", "hotspotStroke")
                .attr("data-metric", (m) => m)
                .attr("fill", "none")
                .attr("stroke-width", 2.5)
                .attr("stroke-linecap", "round")
                .attr("stroke-dasharray", (m) => hotspotStyles[m].dash)
                .attr("stroke", (m) => hotspotStyles[m].color)
                .attr("filter", "url(#hotspotOutline)")
                .attr("r", d.r) // start at the node's radius
                .style("opacity", 0)
                .transition()
                .duration(150)
                .style("opacity", 1)
                .attr("r", (m, i) => d.r + (i + 1) * hotspotRingSpacing);
            });
            labelSelection.attr("dy", hotspotLabelDy);
          }
    
          function restoreLinks() {
            if (!simulationLinkInterventions.size && !simulationNodeInterventions.size) return;
            const playBtn = document.getElementById("playPauseBtn");
            const wasPlaying = window.isPlaying;
            if (wasPlaying) playBtn.click();

            simulationLinkInterventions.clear();
            simulationNodeInterventions.clear();
            networkStatsDirtyFrom = uniqueDates[0]?.getTime() ?? null;
            applyNetworkControlChanges("Restoring all links and node permissions");
            disableAllCheckboxes();
            enableAllCheckboxes(550);

            if (wasPlaying && !window.isPlaying) playBtn.click();
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
              .filter((event) => currentMode === "graph" && !event.ctrlKey && !event.button)
              .on("start", dragstarted)
              .on("drag", dragged)
              .on("end", dragended);
          }
    
          function updateMapLayout(instant = false) {
            const projection = d3
              .geoIdentity()
              .reflectY(true)
              .fitSize([w, h], nlMapData);
            const path = d3.geoPath().projection(projection);

            svg.selectAll(".map-region").attr("d", path);
            mapLayers.mount({ projection, geometry: nlMapData, width: w, height: h });

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
            if (hoveredLink) updateAnnotationForLink(hoveredLink, annotationGroup);
          }

          function resizeNetworkPanel() {
            const width = containerCol2.clientWidth;
            const height = containerCol2.clientHeight;
            if (width <= 0 || height <= 0 || (width === w && height === h)) return;
            const scaleX = width / w;
            const scaleY = height / h;
            w = width;
            h = height;
            svg.attr("viewBox", `0 0 ${w} ${h}`);
            svg.select("#mapOverlay").attr("width", w).attr("height", h);
            if (!forceSim) return;

            forceSim.force("center").x(w / 2).y(h / 2);
            if (currentMode === "map") {
              if (nlMapData && nlLabelPoints) updateMapLayout(true);
            } else {
              for (const node of allNodes) {
                node.x *= scaleX;
                node.y *= scaleY;
                node.vx *= scaleX;
                node.vy *= scaleY;
                if (node.fx != null) node.fx *= scaleX;
                if (node.fy != null) node.fy *= scaleY;
              }
              renderGraphPositions();
              forceSim.alpha(1).alphaTarget(0).restart();
            }
          }

          // Functions to switch between graph and map mode
          function switchToMapMode(instant = false) {
            if (forceSim) forceSim.alphaTarget(0).stop();
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
    
            // Insert the map layer with initial opacity 0.
            svg.selectAll(".map").interrupt().remove();
            const mapLayer = svg
              .insert("g", ":first-child")
              .attr("class", "map")
              .style("opacity", 0);
    
            mapLayer
              .selectAll("path")
              .data(nlMapData.features)
              .enter()
              .append("path")
              .attr("class", "map-region")
              .attr("fill", "none")
              .attr("stroke", theme.muted);

    
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
                .attr("fill", theme.canvas)
                .attr("opacity", 0.4);
            }
    
            updateMapLayout(instant);
    
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
            mapLayers.unmount();
            nodeEnter.interrupt("map-position");
            linkSelection.interrupt("map-position");
            labelSelection.interrupt("map-position");
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
              forceSim.alpha(1).alphaTarget(0).restart();
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
                  .interrupt("map-position")
                  .attr("transform", (d) => `translate(${d.x},${d.y})`)
                  .each(recordNodeMapPosition);

                linkSelection
                  .interrupt("map-position")
                  .attr("d", getMapLinkPath)
                  .each(recordLinkMapPosition);

                labelSelection
                  .interrupt("map-position")
                  .attr("x", (d) => d.x)
                  .attr("y", (d) => d.y - (d.r + 13));

                return;
              }

              // Transition node groups.
              nodeEnter
                .transition("map-position")
                .duration(transitionDuration)
                .attr("transform", (d) => `translate(${d.x},${d.y})`)
                .on("end", function () {
                  recordNodeMapPosition(d3.select(this).datum());
                });
    
              // Transition link positions.
              linkSelection
                .transition("map-position")
                .duration(transitionDuration)
                .attr("d", getMapLinkPath)
                .on("end", function () {
                  recordLinkMapPosition(d3.select(this).datum());
                });
    
              // Transition label positions.
              labelSelection
                .transition("map-position")
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
           * Maximum-weight rooted tree over allowed positive routes.
           * "in" gives each reachable node one incoming edge, leading away from root.
           * "out" reverses that construction, giving paths toward root.
           */
          function chuLiuEdmonds(nodes, edges, root, direction) {
            const rootId = getNodeId(root);
            const nodeIds = new Set(nodes.map(getNodeId));
            if (!nodeIds.has(rootId)) return [];
            const workingEdges = edges.map((edge) => ({
              source: getNodeId(direction === "out" ? edge.target : edge.source),
              target: getNodeId(direction === "out" ? edge.source : edge.target),
              weight: +edge.weight,
              original: edge,
            })).filter((edge) =>
              !edge.original.disabled && Number.isFinite(edge.weight) && edge.weight > 0 &&
              edge.source !== edge.target && nodeIds.has(edge.source) && nodeIds.has(edge.target),
            );
            const outgoing = new Map(Array.from(nodeIds, (id) => [id, []]));
            workingEdges.forEach((edge) => outgoing.get(edge.source).push(edge.target));
            const reachable = new Set([rootId]);
            const queue = [rootId];
            for (let index = 0; index < queue.length; index++) {
              for (const target of outgoing.get(queue[index])) {
                if (reachable.has(target)) continue;
                reachable.add(target);
                queue.push(target);
              }
            }

            function maximumTree(ids, routes) {
              const incoming = new Map();
              routes.forEach((edge) => {
                if (edge.target === rootId) return;
                const chosen = incoming.get(edge.target);
                if (!chosen || edge.weight > chosen.weight) incoming.set(edge.target, edge);
              });

              let cycle = null;
              const visited = new Set();
              for (const id of ids) {
                const path = new Map();
                let current = id;
                while (current !== rootId && !visited.has(current)) {
                  if (path.has(current)) {
                    cycle = Array.from(path.keys()).slice(path.get(current));
                    break;
                  }
                  path.set(current, path.size);
                  current = incoming.get(current).source;
                }
                if (cycle) break;
                path.forEach((_, nodeId) => visited.add(nodeId));
              }
              if (!cycle) return Array.from(incoming.values());

              const cycleNodes = new Set(cycle);
              const contractedId = Symbol("cycle");
              const contractedIds = ids.filter((id) => !cycleNodes.has(id));
              contractedIds.push(contractedId);
              const contractedRoutes = [];
              routes.forEach((edge) => {
                const sourceInCycle = cycleNodes.has(edge.source);
                const targetInCycle = cycleNodes.has(edge.target);
                if (sourceInCycle && targetInCycle) return;
                contractedRoutes.push({
                  source: sourceInCycle ? contractedId : edge.source,
                  target: targetInCycle ? contractedId : edge.target,
                  weight: edge.weight - (targetInCycle ? incoming.get(edge.target).weight : 0),
                  original: edge,
                });
              });
              const contractedTree = maximumTree(contractedIds, contractedRoutes);
              const enteringEdge = contractedTree.find((edge) => edge.target === contractedId);
              if (!enteringEdge) throw new Error("Reachable tree cycle has no entering route");
              const tree = contractedTree.map((edge) => edge.original);
              cycle.forEach((id) => {
                if (id !== enteringEdge.original.target) tree.push(incoming.get(id));
              });
              return tree;
            }

            return maximumTree(
              Array.from(reachable),
              workingEdges.filter((edge) => reachable.has(edge.source) && reachable.has(edge.target)),
            ).map((edge) => edge.original);
          }
    
          /**
           * visualizeArborescence(treeEdges, containerSelector, rootId)
           *
           * Displays a directed arborescence in a top-down tree layout using d3.tree().
           * Empty trees have no outgoing route to another region.
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
                .append("div")
                .attr("class", "no-arbo")
                .text(isSimulationModeActive()
                  ? "No outgoing movement pressure."
                  : "No outgoing trade routes.");
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
                    else return theme.grid; // all others
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
              .attr("fill", theme.text)
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
    
          function getStronglyConnectedComponents(nodes, edges) {
            // 1) Build adjacency list from enabled edges
            const adj = buildAdjList(nodes, edges);
    
            // 2) Tarjan’s data structures
            let indexCounter = 0;
            const stack = [];
            const onStack = {};
            const index = {}; // index[nodeId]
            const lowLink = {}; // lowLink[nodeId]
            const sccList = []; // final array of SCCs
    
            nodes.forEach((n) => {
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
            nodes.forEach((n) => {
              if (index[n.id] === -1) {
                strongConnect(n.id);
              }
            });
    
            return sccList;
          }
    
          function computeSCCs() {
            newSCCs = getStronglyConnectedComponents(activeNodes, enabledLinks);
          }

          function computePerronPair(matrix, maxIter, tol) {
            const n = matrix.length;
            const scale = Math.max(...matrix.map((row) => row.reduce((sum, value) => sum + value, 0)));
            const normalized = matrix.map((row) => row.map((value) => value / scale));
            let vector = Array(n).fill(1);

            // Collatz–Wielandt bounds certify the relative error of the Perron root.
            // Noda iteration solves (upper I - A)y = x and converges for periodic blocks too.
            // https://arxiv.org/abs/1309.3926
            for (let iteration = 0; iteration < maxIter; iteration++) {
              const ratios = normalized.map((row, i) =>
                row.reduce((sum, value, j) => sum + value * vector[j], 0) / vector[i]);
              const lower = Math.min(...ratios);
              const upper = Math.max(...ratios);
              if (upper - lower <= tol * upper) {
                const norm = Math.hypot(...vector);
                return {
                  value: scale * (lower + upper) / 2,
                  lower: scale * lower, upper: scale * upper,
                  vector: vector.map((value) => value / norm),
                };
              }

              // Diagonal similarity makes the current vector one. The shifted matrix
              // is an M-matrix with nonnegative row gaps, so GTH elimination uses additions.
              const rates = normalized.map((row, i) => row.map((value, j) =>
                i === j ? 0 : value * vector[j] / vector[i]));
              const gaps = ratios.map((ratio) => upper - ratio);
              const rhs = Array(n).fill(1);
              const diagonal = Array(n);
              for (let col = 0; col < n; col++) {
                diagonal[col] = gaps[col];
                for (let j = col + 1; j < n; j++) diagonal[col] += rates[col][j];
                if (!(diagonal[col] > 0)) throw new Error("Singular Perron iteration system");
                for (let row = col + 1; row < n; row++) {
                  const factor = rates[row][col] / diagonal[col];
                  rates[row][col] = 0;
                  gaps[row] += factor * gaps[col];
                  rhs[row] += factor * rhs[col];
                  for (let j = col + 1; j < n; j++) {
                    if (j !== row) rates[row][j] += factor * rates[col][j];
                  }
                }
              }
              const solution = Array(n);
              for (let row = n - 1; row >= 0; row--) {
                let value = rhs[row];
                for (let col = row + 1; col < n; col++) value += rates[row][col] * solution[col];
                solution[row] = value / diagonal[row];
              }
              const next = vector.map((value, index) => value * solution[index]);
              if (next.some((value) => !Number.isFinite(value) || value <= 0)) {
                throw new Error("Perron iteration lost its positive vector");
              }
              const norm = Math.max(...next);
              vector = next.map((value) => value / norm);
            }
            throw new Error(`Spectral radius did not converge within ${maxIter} iterations`);
          }

          function computePerronRoot(matrix, maxIter, tol) {
            return computePerronPair(matrix, maxIter, tol).value;
          }

          function computeSpectralRadius(allNodes, enabledLinks, maxIter = 100, tol = 1e-6) {
            const ids = new Set(allNodes.map((node) => node.id));
            const links = enabledLinks.filter((link) => link.weight > 0 &&
              ids.has(getNodeId(link.source)) && ids.has(getNodeId(link.target)));
            const components = getStronglyConnectedComponents(allNodes, links);
            const positions = new Map();
            const matrices = components.map((component, componentIndex) => {
              component.forEach((id, index) => positions.set(id, { componentIndex, index }));
              return component.map(() => Array(component.length).fill(0));
            });
            for (const link of links) {
              const source = positions.get(getNodeId(link.source));
              const target = positions.get(getNodeId(link.target));
              if (source.componentIndex === target.componentIndex) {
                matrices[source.componentIndex][source.index][target.index] += link.weight;
              }
            }

            // The spectrum of a reducible graph is the union of its SCC spectra.
            let radius = 0;
            for (const matrix of matrices) {
              const value = matrix.length === 1 ? matrix[0][0] : computePerronRoot(matrix, maxIter, tol);
              radius = Math.max(radius, value);
            }
            return radius;
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
            return key === "NA" ? theme.muted : nodeColor(Number(key));
          }

          function buildCommunityFlowData(ids, partition, links) {
            const nodesById = new Map([...new Set(ids)].map((id) => [id, {
              id, key: partition[id] == null ? "NA" : String(partition[id]), incoming: 0, outgoing: 0, local: 0,
            }]));
            const groupsByKey = new Map();
            for (const node of nodesById.values()) {
              if (!groupsByKey.has(node.key)) groupsByKey.set(node.key, { key: node.key, members: [], nodeCount: 0 });
              const group = groupsByKey.get(node.key);
              group.members.push(node.id);
              group.nodeCount++;
            }
            const groups = [...groupsByKey.values()].sort((a, b) =>
              a.key === "NA" ? 1 : b.key === "NA" ? -1 : Number(a.key) - Number(b.key));
            for (const group of groups) group.members.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            const flows = new Map();
            let total = 0, local = 0;
            for (const link of links) {
              if (link.disabled || link.source == null || link.target == null) continue;
              const source = getNodeId(link.source), target = getNodeId(link.target), weight = +link.weight;
              if (!nodesById.has(source) || !nodesById.has(target) || !Number.isFinite(weight) || weight <= 0) continue;
              const key = JSON.stringify([source, target]);
              if (flows.has(key)) flows.get(key).weight += weight;
              else flows.set(key, { key, source, target, weight });
              nodesById.get(source).outgoing += weight;
              nodesById.get(target).incoming += weight;
              total += weight;
              if (source === target) {
                nodesById.get(source).local += weight;
                local += weight;
              }
            }
            return {
              total, local,
              activeCount: [...nodesById.values()].filter((node) => node.incoming > 0 || node.outgoing > 0).length,
              groups, nodes: groups.flatMap((group) => group.members.map((id) => nodesById.get(id))),
              flows: [...flows.values()].sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target)),
            };
          }

          function getCommunityFlowGeometry(groups, partition) {
            const rosterKey = groups.map((group) => `${group.key}:${group.members.join(",")}`).join(";");
            if (communityFlowGeometry?.partition === partition && communityFlowGeometry.rosterKey === rosterKey) {
              return communityFlowGeometry;
            }
            const root = d3.hierarchy({ children: groups.map((group) => ({
              key: group.key, children: group.members.map((id) => ({ id, key: group.key })),
            })) });
            d3.cluster().size([2 * Math.PI, 1])(root);
            communityFlowGeometry = {
              partition, rosterKey, root, nodesById: new Map(root.leaves().map((node) => [node.data.id, node])),
            };
            return communityFlowGeometry;
          }

          function renderCommunityFlowPanel() {
            const container = d3.select("#tradeClusters");
            const element = container.node();
            const simulation = isSimulationModeActive();
            const partition = tradeCommunityTimeline?.partition || {};
            const links = simulation
              ? Array.from(simulationState.currentFrame?.linkStates.values() || [], (link) => ({
                  source: link.source, target: link.target, weight: link.riskLoad,
                }))
              : enabledLinks;
            const data = buildCommunityFlowData(collectSimulationRegionIds(loadedCSVData), partition, links);
            const geometry = getCommunityFlowGeometry(data.groups, partition);
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            function animateFlow(selection) {
              return reducedMotion ? selection.interrupt() : transitionSelection(selection);
            }
            function exitFlow(selection) {
              if (reducedMotion) {
                selection.interrupt().selectAll("*").interrupt();
                selection.remove();
                return;
              }
              const departing = selection.filter(":not(.is-exiting)").classed("is-exiting", true);
              animateFlow(departing).attr("opacity", 0).style("--flow-fade", 0)
                .on("end", function () { d3.select(this).selectAll("*").interrupt(); }).remove();
            }
            container.select("div.simulation-partition-map").remove();
            container.classed("simulation-partition-map-expanded", false);
            const width = element.clientWidth, height = element.clientHeight;
            const top = 103, bottom = 35;
            const radius = Math.max(24, Math.min((width - 86) / 2, (height - top - bottom - 68) / 2));
            const cx = width / 2, cy = top + (height - top - bottom) / 2;
            let svg = container.select("svg.community-flow-chart");
            if (svg.empty()) {
              container.selectAll("svg.simulation-partition-chart, svg.trade-community-chart")
                .interrupt().call((charts) => charts.selectAll("*").interrupt()).remove();
              svg = container.append("svg").attr("class", "community-flow-chart");
            }
            svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
            svg.selectAll("title").data([null]).join("title")
              .text(simulation ? "Directed exposure flows between COROP regions" : "Directed trade flows between COROP regions");
            const plot = svg.selectAll("g.community-flow-plot")
              .data([geometry.rosterKey], (key) => key).join(
                (enter) => enter.append("g").attr("class", "community-flow-plot")
                  .attr("id", () => `community-flow-layout-${++communityFlowLayoutId}`).attr("opacity", 0),
                (update) => update,
                (exit) => {
                  exit.attr("aria-hidden", true).selectAll(".community-flow-node")
                    .attr("tabindex", -1).on("mouseenter focus mouseleave blur", null);
                  exitFlow(exit);
                },
              )
              .classed("is-exiting", false).attr("aria-hidden", null)
              .attr("transform", `translate(${cx},${cy})`);
            animateFlow(plot).attr("opacity", 1);
            plot.selectAll("circle.community-flow-orbit").data([0.48, 0.76, 1]).join("circle")
              .attr("class", "community-flow-orbit").attr("r", (scale) => radius * scale)
              .attr("stroke-dasharray", (scale) => scale < 1 ? "2 6" : null);
            const defs = plot.selectAll("defs").data([null]).join("defs");
            const markers = defs.selectAll("marker").data(data.groups, (group) => group.key).join("marker")
              .attr("id", (group) => `${plot.attr("id")}-arrow-${group.key}`)
              .attr("viewBox", "0 -3 6 6").attr("refX", 5).attr("refY", 0)
              .attr("markerWidth", 5).attr("markerHeight", 5).attr("markerUnits", "userSpaceOnUse").attr("orient", "auto");
            markers.selectAll("path").data((group) => [group]).join("path")
              .attr("d", "M0,-2.5 L5,0 L0,2.5").attr("fill", "none")
              .attr("stroke", (group) => getTradeCommunityColor(group.key)).attr("stroke-width", 1.2);
            const arc = d3.arc().innerRadius(radius + 24).outerRadius(radius + 27);
            const halfStep = Math.PI / (data.nodes.length + data.groups.length);
            plot.selectAll("path.community-flow-sector").data(geometry.root.children, (group) => group.data.key).join("path")
              .attr("class", "community-flow-sector")
              .attr("d", (group) => arc({ startAngle: group.leaves()[0].x - halfStep * 0.75,
                endAngle: group.leaves().at(-1).x + halfStep * 0.75 }))
              .attr("fill", (group) => getTradeCommunityColor(group.data.key));
            const point = (angle, r) => [Math.sin(angle) * r, -Math.cos(angle) * r];
            plot.selectAll("text.community-flow-community-label").data(geometry.root.children, (group) => group.data.key).join("text")
              .attr("class", "community-flow-community-label").attr("text-anchor", "middle").attr("dy", "0.32em")
              .attr("transform", (group) => `translate(${point(group.x, radius + 35)})`)
              .style("fill", (group) => getTradeCommunityColor(group.data.key)).text((group) => getTradeCommunityLabel(group.data.key));
            const line = d3.lineRadial().curve(d3.curveBundle.beta(0.82)).angle((node) => node.x).radius((node) => node.y * radius);
            const maxWeight = d3.max(data.flows, (flow) => flow.weight) || 1;
            const flowWidth = d3.scaleSqrt().domain([0, maxWeight]).range([0.35, 2.4]);
            const portAngle = Math.min(0.016, halfStep / 4);
            const paths = plot.selectAll("g.community-flow-links").data([null]).join("g").attr("class", "community-flow-links")
              .selectAll("path.community-flow-link").data(data.flows, (flow) => flow.key).join(
                (enter) => enter.append("path").attr("class", "community-flow-link")
                  .attr("opacity", 0).style("--flow-fade", 0),
                (update) => update,
                (exit) => exitFlow(exit),
              )
              .classed("is-exiting", false).attr("data-source", (flow) => flow.source).attr("data-target", (flow) => flow.target)
              .attr("d", (flow) => {
                const source = geometry.nodesById.get(flow.source), target = geometry.nodesById.get(flow.target);
                if (source === target) {
                  const start = point(source.x + portAngle, radius), end = point(source.x - portAngle, radius);
                  const c1 = point(source.x + 0.065, radius - 18), c2 = point(source.x - 0.065, radius - 18);
                  return `M${start}C${c1} ${c2} ${end}`;
                }
                const route = source.path(target).map((node) => ({ x: node.x, y: node.y }));
                route[0].x += portAngle;
                route[route.length - 1].x -= portAngle;
                return line(route);
              })
              .attr("stroke", (flow) => getTradeCommunityColor(geometry.nodesById.get(flow.source).data.key))
              .attr("marker-end", (flow) => `url(#${plot.attr("id")}-arrow-${geometry.nodesById.get(flow.source).data.key})`);
            animateFlow(paths)
              .attr("stroke-width", (flow) => flowWidth(flow.weight))
              .style("--flow-weight", (flow) => 0.12 + 0.46 * Math.sqrt(flow.weight / maxWeight))
              .style("--flow-fade", 1)
              .attr("opacity", 1);
            const nodes = plot.selectAll("g.community-flow-nodes").data([null]).join("g").attr("class", "community-flow-nodes")
              .selectAll("g.community-flow-node").data(data.nodes, (node) => node.id).join("g")
              .attr("class", "community-flow-node").attr("tabindex", 0).attr("role", "img").attr("data-region", (node) => node.id)
              .attr("transform", (node) => `rotate(${geometry.nodesById.get(node.id).x * 180 / Math.PI - 90}) translate(${radius},0)`)
              .style("color", (node) => getTradeCommunityColor(node.key))
              .attr("aria-label", (node) => `${node.id}, ${getStatnaam(node.id)}, ${getTradeCommunityLabel(node.key)}. Incoming ${formatSmall(node.incoming)}, outgoing ${formatSmall(node.outgoing)}, local ${formatSmall(node.local)} ${simulation ? "exposure" : "animals"}.`);
            nodes.selectAll("circle.community-flow-hit").data((node) => [node]).join("circle")
              .attr("class", "community-flow-hit").attr("r", 7).attr("fill", "transparent")
              .style("stroke", "none").style("filter", "none");
            const dots = nodes.selectAll("circle.community-flow-dot").data((node) => [node]).join("circle")
              .attr("class", "community-flow-dot")
              .attr("r", 3);
            animateFlow(dots)
              .attr("fill", (node) => node.incoming + node.outgoing > 0 ? getTradeCommunityColor(node.key) : theme.surface)
              .style("stroke", (node) => getTradeCommunityColor(node.key));
            nodes.selectAll("text").data((node) => [node]).join("text").attr("class", "community-flow-node-label")
              .attr("x", (node) => geometry.nodesById.get(node.id).x < Math.PI ? 6 : -6)
              .attr("dy", "0.32em").attr("text-anchor", (node) => geometry.nodesById.get(node.id).x < Math.PI ? "start" : "end")
              .attr("transform", (node) => geometry.nodesById.get(node.id).x < Math.PI ? null : "rotate(180)")
              .text((node) => node.id.slice(2));
            const caption = svg.selectAll("text.community-flow-summary").data([null]).join("text")
              .attr("class", "community-flow-summary community-flow-caption").attr("x", width / 2).attr("y", 80).attr("text-anchor", "middle");
            const detail = svg.selectAll("text.community-flow-detail").data([null]).join("text")
              .attr("class", "community-flow-detail community-flow-caption").attr("x", width / 2)
              .attr("y", height - 21).attr("text-anchor", "middle");
            const summary = `${formatSmall(data.total)} ${simulation ? "exposure" : "animals"} · ${data.activeCount}/${data.nodes.length} active · ${data.total > 0 ? `${(100 * data.local / data.total).toFixed(1)}%` : "—"} local`;
            function highlight(id) {
              const node = data.nodes.find((item) => item.id === id);
              svg.classed("has-highlight", !!node).attr("data-highlighted", node ? id : null);
              const partners = new Set([id]);
              for (const flow of data.flows) {
                if (flow.source === id) partners.add(flow.target);
                if (flow.target === id) partners.add(flow.source);
              }
              paths.classed("is-highlighted", (flow) => !!node && (flow.source === id || flow.target === id));
              nodes.classed("is-highlighted", (item) => !!node && partners.has(item.id));
              caption.text(node ? `${node.id} · ${getStatnaam(node.id)}` : `${data.nodes.length} COROP regions · ${data.flows.length} ${simulation ? "exposure" : "trade"} flows`);
              detail.text(node ? `In ${formatSmall(node.incoming)} · Out ${formatSmall(node.outgoing)} · Local ${formatSmall(node.local)}`
                : summary);
            }
            nodes.on("mouseenter", (event, node) => highlight(node.id)).on("focus", (event, node) => highlight(node.id))
              .on("mouseleave", () => highlight(document.activeElement?.closest(".community-flow-node")?.getAttribute("data-region")))
              .on("blur", () => highlight(null));
            highlight(svg.attr("data-highlighted"));
          }

          function setCommunityView(view) {
            if ((view !== "heatmap" && view !== "flow") || view === communityView) return false;
            communityView = view;
            document.getElementById("communityViewSwitch").setAttribute("aria-checked", String(view === "flow"));
            if (loadedCSVData && !window.isSwitchingCSV) updateSCCs();
            return true;
          }

          function getTradeCommunityStructureData() {
            const links = enabledLinks.filter((link) => link.weight > 0);
            const temporalStats =
              window.currentDate &&
              window.allTemporalStats?.[window.currentDate.toISOString()];
            const partition = tradeCommunityTimeline?.partition || {};
            const nodesById = new Map(allNodes.map((node) => [node.id, node]));
            allNodes.forEach((node) => {
              node.community = partition[node.id];
            });

            const communities = new Map();
            const nodeCommunity = new Map();
            collectSimulationRegionIds(loadedCSVData).forEach((id) => {
              const key = partition[id] == null ? "NA" : String(partition[id]);
              nodeCommunity.set(id, key);
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
              community.members.push(id);
              community.nodeCount += 1;
              community.nodeVolume += nodesById.get(id)?.tradeTotal || 0;
            });

            let total = 0;
            let within = 0;
            let interregionalTotal = 0;
            let interregionalWithin = 0;
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
              if (sourceId !== targetId) {
                interregionalTotal += weight;
                if (sourceKey === targetKey) interregionalWithin += weight;
              }
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
                Number(a.key) - Number(b.key) ||
                d3.ascending(a.key, b.key),
            );
            const modularity =
              temporalStats?.modularity ??
              evaluatePartitionModularity(links, partition, tradeCommunityTimeline?.resolution ?? 1);

            return {
              communities: communityList,
              matrix,
              total,
              within,
              between: total - within,
              interregionalTotal,
              interregionalWithin,
              interregionalBetween: interregionalTotal - interregionalWithin,
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
              top: 124,
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
              container.selectAll("svg.simulation-partition-chart, svg.trade-community-chart, svg.community-flow-chart")
                .interrupt().call((charts) => charts.selectAll("*").interrupt()).remove();
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
              .scaleSequential(d3.interpolateRgb(theme.surface, theme.accent))
              .domain([0, maxValue]);

            const summaryItems = [
              ["Interregional within", data.interregionalTotal ? formatPct(data.interregionalWithin / data.interregionalTotal) : "—"],
              ["Between", data.interregionalTotal ? formatPct(data.interregionalBetween / data.interregionalTotal) : "—"],
              [`Modularity γ=${tradeCommunityTimeline.resolution}`, d3.format(".3f")(data.modularity)],
            ];
            const summaryWidth = (containerNode.clientWidth - 32) / summaryItems.length;
            const summary = svg
              .selectAll("g.trade-community-summary")
              .data([null])
              .join("g")
              .attr("class", "trade-community-summary")
              .attr("text-anchor", "middle")
              .attr("transform", "translate(16,96)");
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
                    (item, index) => `translate(${(index + 0.5) * summaryWidth},0)`,
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
                    cell.value > 0 ? color(cell.value) : theme.surface,
                  )
                  .attr("stroke", (cell) =>
                    cell.source === cell.target
                      ? theme.muted
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
            if (communityView === "flow") {
              if (!selectedNodeData) renderCommunityFlowPanel();
              return;
            }
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
              .attr("stroke", theme.muted)
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
              .attr("stroke", theme.muted)
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
              .attr("fill", theme.elevated);
    
            // Append the text element inside the same group
            labelGroup
              .append("text")
              .attr("class", "ringNodeLabel")
              .attr("text-anchor", "middle")
              .attr("dy", "-0.5em")
              .style("font-size", "8px")
              .style("fill", theme.text)
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
              .style("fill", theme.text)
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
                .attr("fill", theme.elevated);
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
                  .attr("fill", theme.elevated)
                  .attr("fill-opacity", 0.8)
                  .attr("rx", 4)
                  .attr("ry", 4);
    
                g.select("g.cluster-annotation")
                  .selectAll(
                    "text.annotation-note-title, text.annotation-note-label",
                  )
                  .attr("fill", theme.text);
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
          let playInterval = null;
          let persistentUiHandlersBound = false;

          function setTimeReplayState(playing) {
            window.isPlaying = playing;
            const playButton = document.getElementById("playPauseBtn");
            if (playButton) {
              setControlTip(playButton, playing ? controlTips.pause : controlTips.play);
              playButton.innerHTML = playing
                ? '<i class="fa-solid fa-pause"></i>'
                : '<i class="fa-solid fa-play"></i>';
            }
            setSimulationInputsDisabled(playing || window.isSwitchingCSV || simulationState.status === "running");
            if (playing) {
              disableAllButtons();
              disableAllCheckboxes();
            } else {
              clearInterval(playInterval);
              playInterval = null;
              if (!window.isSwitchingCSV) {
                enableAllButtons(550);
                enableAllCheckboxes(550);
              }
            }
          }

          function handlesAppShortcut(event) {
            return !document.getElementById("mainContainer")?.closest("[inert]") &&
              !window.isComparisonOverlayOpen?.() &&
              !screenshotInProgress && !window.isIntroOverlayOpen?.() && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey &&
              !event.target?.closest("input, select, textarea, [contenteditable]:not([contenteditable='false'])") &&
              !(event.target?.closest("button, [role='button'], [role='switch']") && [" ", "Enter"].includes(event.key));
          }
    
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
            comparisonDataError = null;
            cancelSimulationRecompute();
            if (forceSim) forceSim.stop();
            mapLayers.unmount();
            // Clear any previous network visualization.
            if (svg && svg.node().hasChildNodes()) {
              svg.selectAll("*").remove();
            }
    
            window.isSwitchingCSV = true;
            window.herdlinkComparison?.refresh();
            setTimeReplayState(false);
            disableAllButtons();
            disableAllCheckboxes();
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
                  const disabledLinkKeys = getDisabledLinkKeys(window.currentDate);
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
                      ledgerWeight: weight,
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
                  const recordedLinks = new Set(links.map((link) => link.id));
    
                  // First, add missing self-loops.
                  nodeIds.forEach((id) => {
                    if (!recordedLinks.has(getLinkKey(id, id))) {
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
                      if (!recordedLinks.has(getLinkKey(sourceId, targetId))) {
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
                    link.disabled = disabledLinkKeys.has(
                      getLinkKey(link.source, link.target),
                    );
                    link.source = nodesMap[link.source];
                    link.target = nodesMap[link.target];
                  });
    
                  setTradeEdgeScales(links);
    
                  allNodes = nodes;
                  allLinks = links;
                  // Active routes have positive weight and a checked link control.
                  enabledLinks = links.filter((l) => !l.disabled && l.weight > 0);
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
    
                  // Store the loaded data for later use.
                  loadedCSVData = data;
                  if (presetDailyData && simulationIntroductionDate === null) ensurePresetDailyData();
                  computeTemporalNetworkStats();
                  computeMaxTemporalNetworkStats();
    
                  // Function to update the network for a given date.
                  function updateNetworkForDate(selectedDate, fullData) {
                    window.currentDate = selectedDate;
                    applySimulationMapPrevalence();
                    const filteredData = getTradeRecordsByDate(fullData).get(selectedDate.getTime()) || [];
                    initNodesAndLinks(filteredData);
                    applySimulationFrame(selectedDate);
    
                    if (!isSimulationModeActive()) updateNetworkStats();
    
                    computeSCCs();
                    if (!isSimulationModeActive()) updateSCCs();
    
                    updateTemporalNetwork();
                    updateHotspotMarks();
                    updateDonutCharts();
                    if (!isSimulationModeActive()) {
                      updateGlobalStatsChart(window.currentSelectedStat);
                      updateNodeStatsChart(window.currentSelectedNodeStat);
                      updateTradeDistribution();
                    }
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
                    if (!handlesAppShortcut(event)) return;
                    let currentValue = +slider.value;
                    if (
                      event.key === "ArrowLeft" &&
                      !window.isSwitchingCSV &&
                      !window.isSwitchingAppMode &&
                      !window.isDoingTemporalUpdate
                    ) {
                      event.preventDefault();
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
                      event.preventDefault();
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
                    if (!window.isPlaying) {
                      if (+slider.value >= +slider.max) return;
                      setTimeReplayState(true);
                      playInterval = setInterval(() => {
                        let currentIdx = +slider.value;
                        if (currentIdx < uniqueDates.length - 1) {
                          slider.value = currentIdx + 1;
                          updateNetworkForDate(uniqueDates[slider.value], data);
                          updateCurrentDateDisplay(uniqueDates[slider.value]);
                        }
                        if (+slider.value >= +slider.max) setTimeReplayState(false);
                      }, 1000);
                    } else {
                      setTimeReplayState(false);
                    }
                  });
    
                  // Shortcut for the play/pause button
                  playPauseKeyListener = function (event) {
                    if (!handlesAppShortcut(event) || event.repeat) return;
                    if (
                      event.key === " " &&
                      !window.isSwitchingCSV &&
                      !window.isSwitchingAppMode &&
                      !window.isDoingTemporalUpdate
                    ) {
                      // Space key pressed
                      const playPauseBtn = document.getElementById("playPauseBtn");
                      if (playPauseBtn && !playPauseBtn.disabled) {
                        event.preventDefault();
                        playPauseBtn.click();
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
                    if (!handlesAppShortcut(event) || event.repeat) return;
                    if (
                      event.key === "f" &&
                      !window.isSwitchingAppMode &&
                      !window.isSwitchingCSV &&
                      !window.isDoingTemporalUpdate
                    ) {
                      const fromStartBtn = document.getElementById("fromStartBtn");
                      if (fromStartBtn && !fromStartBtn.disabled) {
                        event.preventDefault();
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
                  initialData = getTradeRecordsByDate(data).get(firstDate.getTime()) || [];
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
                setTimeReplayState(false);
                window.herdlinkComparison?.refresh();

                if (isSimulationModeActive()) {
                  recomputeSimulationTrajectory("Preparing simulation trajectory");
                }
              })
              .catch(function (error) {
                console.error("Error loading trade data:", error);
                comparisonDataError = "The trade dataset could not be loaded. Reload the page to try again.";
                window.herdlinkComparison?.refresh();
              });

            if (!persistentUiHandlersBound) {
              window.addEventListener("resize", matchButtonWidths);

              document.getElementById("communityScaleSelect").addEventListener("change", function () {
                setTradeCommunityScale(this.value);
              });
              document.getElementById("communityViewSwitch").addEventListener("click", function () {
                setCommunityView(communityView === "heatmap" ? "flow" : "heatmap");
              });

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
    
          new ResizeObserver(resizeNetworkPanel).observe(containerCol2);

          // Intro overlay
    
          (() => {
            let kbd = null;
            let lines = [];
            let keyboardReadyObserver = null;
            let lineAnimationFrame = null;
            let returnFocus = null;
    
            const introOverlay = document.getElementById("introOverlay");
            const guidePage = document.getElementById("introGuidePage");
            const pages = document.getElementById("introPages");
            const connectorClip = document.getElementById("introConnectorClipRect");
            const okBtn = document.getElementById("introOkButton");
            const helpBtn = document.getElementById("helpOverlayButton");
    
            function overlayIsOpen() {
              if (!introOverlay) return false;
              if (introOverlay.closest("[inert]")) return false;
              if (introOverlay.style.display === "none") return false;
              if (introOverlay.classList.contains("hide")) return false;
              return true;
            }

            function guideIsVisible() {
              return overlayIsOpen() && !guidePage.hidden;
            }
    
            function cleanupLines() {
              lines.forEach((l) => {
                try {
                  l.remove();
                } catch (e) {}
              });
              lines = [];
            }
    
            function positionLines() {
              if (!guideIsVisible()) return;
              const bounds = pages.getBoundingClientRect();
              connectorClip.setAttribute("x", bounds.left + window.scrollX);
              connectorClip.setAttribute("y", bounds.top + window.scrollY);
              connectorClip.setAttribute("width", pages.clientWidth);
              connectorClip.setAttribute("height", pages.clientHeight);
              lines.forEach((line) => line.position());
            }

            function positionLinesDuringAnimation() {
              positionLines();
              lineAnimationFrame = requestAnimationFrame(positionLinesDuringAnimation);
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
                      "s e m h c q r f {space} {arrowleft} {arrowup} {arrowdown} {arrowright}",
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
                color: theme.muted,
                dash: { animation: false },
              });
    
              line.show("draw", { duration: 450 });
              return line;
            }
    
            function buildLines() {
              cleanupLines();
              if (!guideIsVisible()) return;
              if (!kbd) return;
              if (typeof LeaderLine === "undefined") return;
    
              const map = [
                ["s", "introDotS"],
                ["e", "introDotE", { start: "top", end: "right" }],
                ["m", "introDotM"],
                ["q", "introDotQ", { start: "left", end: "right" }],
                ["h", "introDotH"],
                ["r", "introDotR"],
                ["f", "introDotF"],
                ["c", "introDotC", { start: "left", end: "right" }],
                ["{space}", "introDotSpace", { start: "bottom", end: "right" }],
                ["{arrowleft}", "introDotArrows"],
                ["{arrowright}", "introDotArrows"],
                ["{arrowup}", "introDotArrows"],
                ["{arrowdown}", "introDotArrows"],
              ];
    
              map.forEach(([k, id, sockets]) => {
                const ln = connect(k, id, sockets);
                if (ln) lines.push(ln);
              });
    
              positionLines();
            }
    
            // Wait until simple-keyboard renders buttons, then draw connector lines.
            function ensureLinesWhenReady() {
              if (!guideIsVisible()) return;
    
              const qBtnMaybe = kbd?.getButtonElement("q");
              const qBtn = Array.isArray(qBtnMaybe) ? qBtnMaybe[0] : qBtnMaybe;
              if (qBtn) {
                buildLines();
                return;
              }
    
              // Watch keyboard DOM changes until buttons appear.
              const kbRoot = document.querySelector("#introKeyboard");
              if (!kbRoot || keyboardReadyObserver) return;
    
              keyboardReadyObserver = new MutationObserver(() => {
                if (!guideIsVisible()) return;
                const elMaybe = kbd?.getButtonElement("q");
                const el = Array.isArray(elMaybe) ? elMaybe[0] : elMaybe;
                if (el) {
                  keyboardReadyObserver.disconnect();
                  keyboardReadyObserver = null;
                  buildLines();
                }
              });
    
              keyboardReadyObserver.observe(kbRoot, {
                childList: true,
                subtree: true,
              });
            }

            function syncIntroPage() {
              cleanupLines();
              keyboardReadyObserver?.disconnect();
              keyboardReadyObserver = null;
              if (!guideIsVisible()) return;
              buildKeyboard();
              ensureLinesWhenReady();
            }

            function openIntro() {
              if (!introOverlay) return;

              if (!introOverlay.contains(document.activeElement)) {
                returnFocus = document.activeElement;
              }
    
              introOverlay.style.display = "flex";
              introOverlay.style.pointerEvents = "auto";
              introOverlay.classList.remove("hide");
              introOverlay.inert = false;
    
              syncIntroPage();
              document.getElementById("introPageSwitch").focus({ preventScroll: true });
            }
    
            function closeIntro() {
              if (!introOverlay) return;
    
              // Stop blocking clicks immediately.
              introOverlay.style.pointerEvents = "none";
    
              // Fade out overlay.
              introOverlay.classList.add("hide");
              introOverlay.inert = true;
    
              // Remove connector lines; they live outside the overlay.
              cleanupLines();
              keyboardReadyObserver?.disconnect();
              keyboardReadyObserver = null;
              cancelAnimationFrame(lineAnimationFrame);
              lineAnimationFrame = null;
              const focusTarget = returnFocus?.isConnected && returnFocus !== document.body
                ? returnFocus : helpBtn;
              focusTarget?.focus();
            }
    
            // After fade-out, remove overlay from layout to avoid blocking clicks.
            if (introOverlay) {
              introOverlay.addEventListener("animationstart", (event) => {
                if (event.animationName !== "contentSlideIn") return;
                cancelAnimationFrame(lineAnimationFrame);
                positionLinesDuringAnimation();
              });
              introOverlay.addEventListener("animationend", (e) => {
                if (e.animationName === "contentSlideIn") {
                  cancelAnimationFrame(lineAnimationFrame);
                  lineAnimationFrame = null;
                  positionLines();
                }
                if (e.animationName !== "overlayFadeOut") return;
                if (!introOverlay.classList.contains("hide")) return;
                introOverlay.style.display = "none";
              });
            }
    
            // Button bindings
            okBtn?.addEventListener("click", closeIntro);
            helpBtn?.addEventListener("click", openIntro);
    
            // Reposition lines when the window resizes.
            window.addEventListener("resize", positionLines);
            window.addEventListener("herdlink:intro-page-change", syncIntroPage);
            window.addEventListener("herdlink:screen-access-change", syncIntroPage);
            introOverlay.addEventListener("scroll", positionLines, true);
            new ResizeObserver(positionLines).observe(guidePage);
    
            openIntro();
    
            // Expose a minimal API for hotkeys and UI controls.
            window.isIntroOverlayOpen = overlayIsOpen;
            window.openIntroOverlay = openIntro;
            window.closeIntroOverlay = closeIntro;
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
            mapLayers.close();
            d3.selectAll(".csv-switcher, .mode-switcher-frame").classed(
              "disabled",
              true,
            );
            d3.select("#mapLayerButton").attr("disabled", true);
            d3.select("#toggleModeButton").attr("disabled", true);
            d3.select("#screenshotButton").attr("disabled", true);
            d3.select("#restoreButton").attr("disabled", true);
            d3.selectAll(".simulation-restriction-point").property("disabled", true);
          }
    
          function enableAllButtons(timeoutVal) {
            if (!window.isPlaying) {
              d3.timeout(() => {
                if (appModeSwitchLocked || window.isSwitchingCSV || window.isPlaying || simulationState.status === "running") return;
                d3.selectAll(".csv-switcher").classed("disabled", false);
                d3.selectAll(".mode-switcher-frame").classed("disabled", false);
                d3.select("#mapLayerButton").attr("disabled", currentMode === "map" ? null : true);
                d3.select("#toggleModeButton").attr("disabled", null);
                d3.select("#screenshotButton").attr("disabled", null);
                d3.select("#restoreButton").attr("disabled", null);
                d3.selectAll(".simulation-restriction-point").property("disabled", false);
                window.herdlinkComparison?.refresh();
              }, timeoutVal);
            }
          }
    
          function disableAllCheckboxes() {
            // Disable link checkboxes.
            d3.selectAll(".trade-checkbox").property("disabled", true);
            // Disable header checkboxes.
            d3.selectAll(".trade-header-checkbox").property("disabled", true);
            d3.selectAll(".simulation-node-permission").property("disabled", true);
          }
    
          function enableAllCheckboxes(timeoutVal) {
            if (!window.isPlaying) {
              d3.timeout(() => {
                if (appModeSwitchLocked || window.isSwitchingCSV || window.isPlaying || simulationState.status === "running") return;
                // Enable link checkboxes.
                d3.selectAll(".trade-checkbox").property("disabled", false);
                // Enable header checkboxes.
                d3.selectAll(".trade-header-checkbox").property("disabled", false);
                d3.selectAll(".simulation-node-permission").property("disabled", false);
              }, timeoutVal);
            }
          }
    
          let screenshotInProgress = false;

          async function downloadScreenshot() {
            if (screenshotInProgress) return;
            screenshotInProgress = true;
            const timestamp = new Date()
              .toISOString()
              .replace(/[-:]/g, "")
              .replace("T", "_")
              .split(".")[0];
            const filename = `herdlink_${timestamp}_${Math.random().toString(36).substring(7)}.png`;
    
            try {
              await mapLayers.ready();
              await window.downloadHerdLinkScreenshot(filename);
            } catch (error) {
              mapLayers.showError(error);
            } finally {
              screenshotInProgress = false;
            }
          }
    
          // Screenshot button handler.
          document
            .getElementById("screenshotButton")
            .addEventListener("click", downloadScreenshot);
    
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

          // Keyboard shortcuts
    
          // Shortcut: press "s" to take a screenshot.
          const screenshotButton = document.getElementById("screenshotButton");
          document.addEventListener("keydown", function (event) {
            if (!handlesAppShortcut(event)) return;
            if (
              event.key === "s" &&
              !event.repeat &&
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
            if (!handlesAppShortcut(event)) return;
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
            if (!handlesAppShortcut(event)) return;
            if (
              event.key.toLowerCase() !== "e" ||
              event.repeat ||
              event.metaKey ||
              event.ctrlKey ||
              event.altKey ||
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

          document.getElementById("exitFocusButton").addEventListener("click", exitNodeFocus);

          // Shortcut: press Q to return to the network view.
          document.addEventListener("keydown", function (event) {
            if (!handlesAppShortcut(event)) return;
            if (
              event.key.toLowerCase() === "q" && !event.repeat && !event.isComposing &&
              !window.isSwitchingCSV &&
              !window.isSwitchingAppMode &&
              !window.isDoingTemporalUpdate
            ) {
              event.preventDefault();
              exitNodeFocus();
            }
          });

          // Shortcut: press "r" to restore links.
          const restoreButton = document.getElementById("restoreButton");
          document.addEventListener("keydown", function (event) {
            if (!handlesAppShortcut(event)) return;
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
            if (!handlesAppShortcut(e)) return;
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
          function isIntroToggleShortcut(event) {
            return !document.getElementById("mainContainer")?.closest("[inert]") &&
              !window.isComparisonOverlayOpen?.() &&
              (event.key === "h" || event.key === "H") &&
              !event.altKey && !event.ctrlKey && !event.metaKey && !event.repeat &&
              !event.target?.closest("textarea, input:not([type='range']), [contenteditable]:not([contenteditable='false'])");
          }

          document.addEventListener("keydown", function (event) {
            if (screenshotInProgress || event.defaultPrevented || !isIntroToggleShortcut(event)) return;
            event.preventDefault();
            window.openIntroOverlay?.();
          });

          function handleIntroKeydown(event) {
            if (!window.isIntroOverlayOpen?.()) return;

            if (event.key === "Tab") {
              const overlay = document.getElementById("introOverlay");
              const controls = Array.from(overlay.querySelectorAll(
                "button, a[href], input, select, textarea, [tabindex]",
              )).filter((element) => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
              const first = controls[0];
              const last = controls[controls.length - 1];
              const active = document.activeElement;
              if (!controls.length) {
                event.preventDefault();
                overlay.focus();
              } else if (!controls.includes(active) || (event.shiftKey ? active === first : active === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
              }
              return;
            }

            if (event.key === "Escape" || isIntroToggleShortcut(event)) {
              event.preventDefault();
              event.stopImmediatePropagation();
              window.closeIntroOverlay?.();
            }
          }

          document.addEventListener(
            "keydown",
            handleIntroKeydown,
            true,
          );

          window.herdlinkComparison = {
            canOpen: () => !screenshotInProgress,
            read: () => ({
              ...getComparisonData(),
              datasetKey: currentTimeSpan,
              datasetLabel: currentTimeSpan ? `${currentTimeSpan[0].toUpperCase()}${currentTimeSpan.slice(1)} trade` : "Animal trade network",
              modeSwitchDisabled: !canSwitchAppDataMode(),
              scenarioContext: getScenarioContext(),
            }),
            loadPreset, captureScenario, loadScenario, setPresetSettings,
            getMode: () => appDataMode,
            setMode: setAppDataMode,
            prepare: () => {
              ensurePresetDailyData();
              if (window.isPlaying) setTimeReplayState(false);
            },
            refresh: () => {
              if (window.isComparisonOverlayOpen?.()) {
                window.dispatchEvent(new Event("herdlink:comparison-change"));
              }
            },
          };
          window.herdlinkComparison.refresh();

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
