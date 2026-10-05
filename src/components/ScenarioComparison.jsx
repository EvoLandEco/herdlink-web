import { useEffect, useMemo, useRef, useState } from "react";
import { faChartLine, faCheck, faCircleInfo, faLayerGroup, faLink, faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { comparisonSets } from "../scenarioComparison";
import { presetIcons, presetLabels } from "./ScenarioLibrary";
import { formatComparisonValue, getComparisonIntroduction, pairComparisonSeries, topComparisonRegions } from "../comparisonCharts";

export const comparisonColors = ["var(--color-accent)", "var(--color-chart-purple)", "var(--color-chart-coral)"];
const comparisonHelp = {
  strategies: {
    summary: "Compare unrestricted trade with seed containment and forward tracing.",
    fixed: "Seed and Trace Ring share the response delay.",
    read: "Open is the reference. Compare each intervention on the same chart scales.",
  },
  targets: {
    summary: "Compare how many historically ranked hubs receive export controls.",
    fixed: "Same response delay and hub ranking from the preceding year's trade.",
    read: "Check outcomes alongside retained movements as more hubs are controlled.",
  },
  delays: {
    summary: "Compare when export controls start in the seed region.",
    fixed: "Same seed export restriction; delays count calendar days from introduction.",
    read: "Compare responses after 1, 7 and 14 days. Later responses allow more movements before controls begin.",
  },
  durations: {
    summary: "Compare the length of a national pause in interregional trade.",
    fixed: "Same response delay; local movements and contact transmission continue.",
    read: "Cross-region movements reopen when each pause ends.",
  },
};

function ComparisonPresetIcons({ set }) {
  return [...new Set(set.presets)].map((id) => <FontAwesomeIcon key={id} icon={presetIcons[id]} aria-hidden="true" />);
}

function ComparisonPresetHelp({ set, context, reason }) {
  const copy = comparisonHelp[set.id];
  const responseDays = context?.presetSettings?.responseDays;
  const rows = [
    ["Fixed", <>{copy.fixed}{set.field !== "responseDays" && responseDays !== undefined && <> Response: {responseDays} days.</>}</>, faLink],
    ["Reading", copy.read, faChartLine],
    ["Availability", reason, faCircleInfo],
  ];
  return <span className="preset-help comparison-preset-help">
    <span className="preset-help__heading">
      <span className="preset-help__icon"><ComparisonPresetIcons set={set} /></span>
      <span className="preset-help__title"><small className="preset-help__eyebrow">Comparison preset</small><strong>{set.label}</strong></span>
      <span className="preset-help__delay"><strong>3</strong><small>scenarios</small></span>
    </span>
    <span className="preset-help__rows">
      <span className="comparison-preset-help__summary">{copy.summary}</span>
      <span className="comparison-preset-help__columns">
        {set.presets.map((id, index) => {
          const value = set.values?.[index];
          const detail = set.field === "targetBudget" ? `${value} target ${value === 1 ? "region" : "regions"}`
            : set.field === "responseDays" ? `${value} ${value === 1 ? "day" : "days"} after introduction`
            : set.field === "standstillDays" ? `${value} days of standstill`
            : ["All movements open", "Seed exports closed", "Seed + traced recipients"][index];
          return <span key={index} className="comparison-preset-help__column" style={{ "--scenario-color": comparisonColors[index] }}>
            <small>{String(index + 1).padStart(2, "0")}</small>
            <FontAwesomeIcon icon={presetIcons[id]} aria-hidden="true" />
            <strong>{presetLabels[id]}</strong><span>{detail}</span>
          </span>;
        })}
      </span>
      {rows.filter(([, text]) => text).map(([label, text, icon]) => <span className="preset-help__row" key={label}>
        <FontAwesomeIcon icon={icon} aria-hidden="true" /><span><strong>{label}</strong><span>{text}</span></span>
      </span>)}
    </span>
    <span className="preset-help__footer">Shared model, population, seed and introduction · Shared chart scales</span>
  </span>;
}

const settingFields = (presetId) => [
  ["targetBudget", "Targets", 1, 40, ["hub-controls", "trade-bottlenecks"].includes(presetId)],
  ["responseDays", "Delay (days)", 0, 365, presetId !== "open-trade"],
  ["standstillDays", "Pause (days)", 1, 365, presetId === "temporary-standstill"],
];

export function RecommendedComparisons({ context, selectedSet, onChooseSet, Info, inert }) {
  const disabled = !context || context.disabled || !context.controlsValid;
  return <div className="scenario-presets scenario-presets--comparisons" role="group" aria-label="Comparison presets">
    <span className="scenario-presets__heading" aria-hidden="true">Presets</span>
    <div className="scenario-presets__buttons">
      {comparisonSets.map((set) => {
        const reason = set.presets.map((id) => context?.presets.find((preset) => preset.id === id)?.disabledReason).find(Boolean);
        return <div key={set.id} className={`scenario-preset${selectedSet === set.id ? " is-active" : ""}`} inert={inert ? "" : undefined}>
          <button type="button" aria-label={`Load ${set.label} comparison`} aria-pressed={selectedSet === set.id}
            disabled={disabled || Boolean(reason)} title={reason || set.detail} onClick={() => onChooseSet(set.id)}>
            <span className="scenario-preset__icon"><ComparisonPresetIcons set={set} /></span>
            <span className="scenario-preset__label">{set.label}</span>
            {selectedSet === set.id && <FontAwesomeIcon className="scenario-preset__active" icon={faCheck} aria-hidden="true" />}
          </button>
          <Info label={set.label} rich><ComparisonPresetHelp set={set} context={context} reason={reason} /></Info>
        </div>;
      })}
    </div>
  </div>;
}

export function ComparisonChartControls({ data, metrics, nodeMetrics, metric, nodeMetric, regionView, metricsLocked, onMetricsLockedChange, onMetricChange, onNodeMetricChange, onRegionChange, disabled, inert }) {
  const canLock = nodeMetrics.some((entry) => entry.key === metric.key);
  const lockHelp = metricsLocked ? "Metrics move together. Unlock to choose them separately."
    : canLock ? "Lock both selectors to the overall metric." : "Choose an overall metric available in both views to lock them.";
  return <fieldset className="scenario-comparison-controls scenario-settings-group" inert={inert ? "" : undefined}>
    <legend>Chart settings</legend>
    <div className="comparison-metric-pair" data-locked={metricsLocked}>
      <div className="comparison-metric-link">
        <label className="comparison-metric-lock" title={lockHelp}>
          <input type="checkbox" aria-label="Lock overall and regional metrics" checked={metricsLocked}
            disabled={disabled || !canLock} onChange={(event) => onMetricsLockedChange(event.target.checked)} />
          <span><FontAwesomeIcon icon={metricsLocked ? faLock : faLockOpen} aria-hidden="true" /></span>
        </label>
      </div>
      <label>Overall <select aria-label="Shared overall metric" title={metric.description} value={metric.key} disabled={disabled} onChange={(event) => onMetricChange(event.target.value)}>
        {metrics.map((entry) => {
          const locked = metricsLocked && !nodeMetrics.some((node) => node.key === entry.key);
          return <option key={entry.key} value={entry.key} disabled={locked}>{entry.label}{locked ? " (unlock)" : ""}</option>;
        })}
      </select></label>
      <label>Regional <select aria-label="Shared region metric" title={nodeMetric.description} value={nodeMetric.key} disabled={disabled} onChange={(event) => onNodeMetricChange(event.target.value)}>
        {nodeMetrics.map((entry) => {
          const locked = metricsLocked && !metrics.some((overall) => overall.key === entry.key);
          return <option key={entry.key} value={entry.key} disabled={locked}>{entry.label}{locked ? " (unlock)" : ""}</option>;
        })}
      </select></label>
    </div>
    <label>Regions <select aria-label="Shared regions" value={regionView} disabled={disabled} onChange={(event) => onRegionChange(event.target.value)}>
      <optgroup label="Top regions"><option value="top-3">Top 3</option></optgroup>
      <optgroup label="Single region">{data.regions.map((region) => <option key={region.id} value={region.id}>{region.name} · {region.id}</option>)}</optgroup>
    </select></label>
  </fieldset>;
}

export function useScenarioComparison({ data, enabled, slots, configurations }) {
  const context = data?.scenarioContext;
  const [evaluation, setEvaluation] = useState(null);
  const completed = useRef(null);
  const inputKey = JSON.stringify([data?.mode, data?.dates, context?.settings, context?.communityScale, context?.provenance]);
  const runKey = JSON.stringify([inputKey, configurations, configurations?.map((config) =>
    config.presetId.startsWith("saved-") ? slots[Number(config.presetId.slice(6))] : null)]);
  const available = enabled && data?.status === "ready" && context.controlsValid && !context.disabled;

  useEffect(() => {
    if (!available) return;
    let frame;
    const results = [];
    setEvaluation({ key: runKey, status: "loading", completed: 0 });
    const run = () => {
      try {
        const config = configurations[results.length];
        let request;
        if (config.presetId.startsWith("saved-")) {
          const slot = slots[Number(config.presetId.slice(6))];
          if (!slot) throw new Error("Choose a populated scenario slot.");
          request = { scenario: slot.scenario, label: slot.name };
        } else {
          request = { presetId: config.presetId };
          for (const [field, , , , applicable] of settingFields(config.presetId)) {
            if (!applicable) continue;
            if (config[field] === "") throw new Error("Complete the scenario settings to run the comparison.");
            request[field] = Number(config[field]);
          }
        }
        results.push(window.herdlinkComparison.evaluateComparisonScenario(request));
        if (results.length === 3) {
          completed.current = { inputKey, results };
          setEvaluation({ key: runKey, status: "ready", results });
        }
        else {
          setEvaluation({ key: runKey, status: "loading", completed: results.length });
          frame = requestAnimationFrame(run);
        }
      } catch (error) {
        setEvaluation({ key: runKey, status: "error", error: error.message });
      }
    };
    const timer = setTimeout(() => { frame = requestAnimationFrame(run); }, 600);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  }, [runKey, available]);

  const current = available && evaluation?.key === runKey ? evaluation : { status: available ? "loading" : "idle", completed: 0 };
  return { ...current, results: current.status === "ready" ? current.results
    : current.status !== "error" && completed.current?.inputKey === inputKey ? completed.current.results : null };
}

export function ScenarioComparison({ data, enabled, slots, configurations, onChangeConfigurations, evaluation, metric, nodeMetric, regionView, Chart }) {
  const context = data.scenarioContext;
  const [inspectedDate, setInspectedDate] = useState(null);
  const available = enabled && context.controlsValid && !context.disabled;
  const ready = evaluation.status === "ready";
  const results = evaluation.results;
  const dateIndex = Math.max(0, data.dates.indexOf(inspectedDate || data.date));
  const date = data.dates[dateIndex];
  const regions = useMemo(() => regionView === "top-3"
    ? topComparisonRegions(data.regions, data.original.nodes, nodeMetric.key, 3)
    : data.regions.filter((region) => region.id === regionView), [regionView, data.regions, data.original, nodeMetric.key]);
  const charts = useMemo(() => {
    if (!results) return null;
    const network = results.map((result) => pairComparisonSeries(data.dates, [], result.series.global, metric.key));
    return { network, networkScale: network.flat(), regions: regions.map((region) => {
      const points = results.map((result) => pairComparisonSeries(data.dates, [], result.series.nodes[region.id] || [], nodeMetric.key));
      return { points, scale: points.flat() };
    }) };
  }, [results, data.dates, metric.key, nodeMetric.key, regions]);
  const edit = (index, patch) => {
    onChangeConfigurations(configurations.map((config, column) => column === index ? { ...config, ...patch } : config));
  };

  return <>
    <div className="scenario-comparison-body" aria-busy={!ready && evaluation.status !== "error"}>
      <div className="scenario-comparison-columns">
        {configurations.map((config, column) => {
          const result = results?.[column];
          const saved = config.presetId.startsWith("saved-");
          const introduction = result && getComparisonIntroduction(result.settings.introductionDate, data.dates, context.provenance?.movementData);
          const current = result?.series.global[dateIndex]?.[metric.key];
          const peak = result?.series.global.reduce((value, point) => Number.isFinite(point[metric.key]) ? Math.max(value, point[metric.key]) : value, -Infinity);
          return <section key={column} className="scenario-comparison-column" aria-label={`Scenario ${column + 1}`}
            style={{ "--comparison-intervention": comparisonColors[column], "--scenario-color": comparisonColors[column] }}>
            <div className="scenario-comparison-column__heading">
              <span>{String(column + 1).padStart(2, "0")}</span>
              <div className="scenario-comparison-strategy">
                <select aria-label={`Scenario ${column + 1} strategy`} value={config.presetId} disabled={!available} onChange={(event) => edit(column, { presetId: event.target.value })}>
                  <optgroup label="Strategies">{context.presets.map((preset) => <option key={preset.id} value={preset.id} disabled={Boolean(preset.disabledReason)}>{preset.label}</option>)}</optgroup>
                  <optgroup label="Saved scenarios">{slots.map((slot, index) => slot && <option key={index} value={`saved-${index}`} disabled={slot.scenario.schemaVersion !== 3}>{slot.name}</option>)}</optgroup>
                </select>
                <FontAwesomeIcon className="scenario-comparison-strategy__icon" icon={saved ? faLayerGroup : presetIcons[config.presetId]} aria-hidden="true" />
              </div>
            </div>
            <div className="scenario-comparison-settings">
              {settingFields(config.presetId).map(([field, label, min, max, applicable]) =>
                <label key={field}>{label}{!saved && applicable
                  ? <input type="number" min={min} max={max} step="1" aria-label={`Scenario ${column + 1} ${label.toLowerCase()}`} value={config[field]}
                    disabled={!available} onChange={(event) => edit(column, { [field]: event.target.value })} /> : <span>—</span>}</label>)}
            </div>
            {result ? <>
              <div className="scenario-comparison-network" inert={!ready ? "" : undefined}>
                <div className="scenario-comparison-values"><span>Overall · {metric.label}<strong>{formatComparisonValue(current, metric.format)}</strong></span>
                  <span>Timeline peak<strong>{formatComparisonValue(peak, metric.format)}</strong></span></div>
                <Chart points={charts.network[column]} scalePoints={charts.networkScale} seriesLabel={result.label} metric={metric}
                  date={date} currentDate={data.date} interventionEvents={result.interventionEvents}
                  introduction={introduction && { ...introduction, seedLabel: result.settings.seedRegion }}
                  scope={`Scenario ${column + 1} overall`} animate={enabled && ready} onInspect={setInspectedDate} />
              </div>
              <div className="scenario-comparison-regions" inert={!ready ? "" : undefined} role="group" aria-label={`Scenario ${column + 1} regional trajectories`} tabIndex={0}>
                <h3 className="scenario-comparison-region-heading">Regional · {nodeMetric.label}</h3>
                {regions.map((region, index) => <section key={index} className="comparison-region-row" aria-label={`${region.name} (${region.id})`}>
                  <div className="scenario-comparison-region-value"><span>{region.id} · {region.name}</span><strong>{formatComparisonValue(result.series.nodes[region.id]?.[dateIndex]?.[nodeMetric.key], nodeMetric.format)}</strong></div>
                  <Chart compact points={charts.regions[index].points[column]} scalePoints={charts.regions[index].scale} seriesLabel={result.label} metric={nodeMetric}
                    date={date} currentDate={data.date} interventionEvents={[]} scope={`Scenario ${column + 1} ${region.name}`}
                    animate={enabled && ready} onInspect={setInspectedDate} />
                </section>)}
              </div>
            </> : <div className="scenario-comparison-pending" role={column === 0 ? evaluation.status === "error" ? "alert" : "status" : undefined}>
              {evaluation.status === "error" ? evaluation.error : "Calculating scenario…"}
            </div>}
          </section>;
        })}
      </div>
    </div>
  </>;
}
