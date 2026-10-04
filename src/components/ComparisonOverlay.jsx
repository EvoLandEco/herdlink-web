import { Fragment, memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { faBook, faCalendarDays, faChartLine, faCodeCompare, faFlask, faLayerGroup, faLocationDot, faNetworkWired, faScaleBalanced } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ScenarioLibrary, ScenarioPresetSettings, ScenarioPresets } from "./ScenarioLibrary";
import { ComparisonChartControls, RecommendedComparisons, ScenarioComparison, useScenarioComparison } from "./ScenarioComparison";
import { ComparisonScenarioDetails } from "./ComparisonScenarioDetails";
import { comparisonConfigurations } from "../scenarioComparison";
import { useAnimatedComparisonSeries } from "../useAnimatedComparisonSeries";
import {
  buildComparisonChart,
  comparisonChartDomain,
  comparisonEventMarkerWidth,
  formatComparisonDelta,
  formatComparisonValue,
  getComparisonIntroduction,
  groupComparisonEvents,
  nearestComparisonDate,
  pairComparisonSeries,
  topComparisonRegions,
} from "../comparisonCharts";
import "../styles/comparison.css";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});
const axisFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumSignificantDigits: 3 });

function dateLabel(date) {
  return dateFormatter.format(new Date(date));
}

function useComparisonTipPosition(label, maxHeight = 420) {
  const infoRef = useRef(null);
  const tipRef = useRef(null);
  const [active, setActive] = useState(false);
  useLayoutEffect(() => {
    const info = infoRef.current;
    const body = info.closest(".comparison-body, .comparison-sidebar, .scenario-library, .scenario-comparison-body");
    if (!active || !body) return;
    const tip = tipRef.current;
    const place = () => {
      const bounds = body.getBoundingClientRect();
      const anchor = info.getBoundingClientRect();
      const contentTop = bounds.top + body.clientTop;
      const above = Math.max(0, anchor.top - contentTop - 10);
      const below = Math.max(0, contentTop + body.clientHeight - anchor.bottom - 10);
      const needed = Math.min(maxHeight, tip.scrollHeight + 2);
      const down = below >= needed || below >= above;
      info.dataset.placement = down ? "below" : "above";
      const height = Math.min(maxHeight, down ? below : above);
      tip.style.maxHeight = `${height}px`;
      if (body.classList.contains("comparison-sidebar")) {
        tip.style.left = `${anchor.left}px`;
        tip.style.right = "auto";
        tip.style.top = `${down ? anchor.bottom + 10 : anchor.top - 10 - Math.min(needed, height)}px`;
        tip.style.bottom = "auto";
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(body);
    observer.observe(tip);
    body.addEventListener("scroll", place);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      body.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [active, label, maxHeight]);
  return {
    active, infoRef, tipRef,
    onPointerEnter: () => setActive(true),
    onPointerLeave: (event) => { if (!event.currentTarget.contains(document.activeElement)) setActive(false); },
    onFocus: () => setActive(true),
    onBlur: (event) => { if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) setActive(false); },
  };
}

function ComparisonInfo({ label, children, icon = faChartLine, rows = [], footer, rich = false }) {
  const id = useId();
  const { active, infoRef, tipRef, ...tipEvents } = useComparisonTipPosition(label);
  return (
    <span ref={infoRef} className="comparison-info" {...tipEvents}>
      <button
        type="button"
        className="panel-info-button has-tip"
        data-tip={typeof children === "string" ? children : label}
        aria-label={`${label} explained`}
        aria-describedby={active ? id : undefined}
      >
        <span aria-hidden="true">i</span>
      </button>
      <span ref={tipRef} id={id} className="comparison-info__tip" role="tooltip" tabIndex={0}>
        {rich ? children : <span className="comparison-help">
          <span className="comparison-help__heading">
            <span className="comparison-help__icon"><FontAwesomeIcon icon={icon} aria-hidden="true" /></span>
            <span><small className="comparison-help__eyebrow">Comparison guide</small><strong>{label}</strong></span>
          </span>
          <span className="comparison-help__body">
            {children && <span className="comparison-help__summary">{children}</span>}
            {rows.length > 0 && <span className="comparison-help__rows">
              {rows.map(([heading, text]) => <span className="comparison-help__row" key={heading}><strong>{heading}</strong><span>{text}</span></span>)}
            </span>}
          </span>
          {footer && <span className="comparison-help__footer">{footer}</span>}
        </span>}
      </span>
    </span>
  );
}

function PairedChart({ points, compact = false, scalePoints, seriesLabel, metric, date, currentDate, interventionEvents, introduction, scope, animate, onInspect }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState(null);
  const domain = useMemo(() => comparisonChartDomain(scalePoints || points), [scalePoints, points]);
  const { points: animatedPoints, domain: animatedDomain } = useAnimatedComparisonSeries(points, domain, animate);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  const chart = useMemo(() => size?.width > 0 && size?.height > 0
    ? buildComparisonChart(animatedPoints, size.width, size.height, compact, scalePoints, animatedDomain) : null, [animatedPoints, size, compact, scalePoints, animatedDomain]);
  const dates = useMemo(() => points.map((point) => point.date), [points]);
  const chartStart = chart?.start;
  const chartEnd = chart?.end;
  const plotWidth = chart ? chart.plot.right - chart.plot.left : 0;
  const eventClusters = useMemo(() => compact ? [] : groupComparisonEvents(interventionEvents, dates, plotWidth,
    (eventDate) => chartStart === chartEnd ? 0.5 : (Date.parse(eventDate) - chartStart) / (chartEnd - chartStart),
  ), [chartStart, chartEnd, plotWidth, dates, interventionEvents, compact]);
  const introductionPosition = introduction && chart
    ? (chart.x(Date.parse(introduction.displayDate)) - chart.plot.left) / plotWidth : null;
  const selected = points.find((point) => point.date === date);
  const animatedSelected = animatedPoints.find((point) => point.date === date);
  const delta = formatComparisonDelta(selected?.original, selected?.intervention, metric.format);
  const formatAxis = (value) => metric.format === "percent" || Math.abs(value) < 1
    ? formatComparisonValue(value, metric.format)
    : axisFormatter.format(value);
  const inspect = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const pointerX = (event.clientX - box.left) / box.width * size.width;
    const fraction = Math.max(0, Math.min(1, (pointerX - chart.plot.left) / (chart.plot.right - chart.plot.left)));
    const timestamp = chart.start + fraction * (chart.end - chart.start);
    onInspect(dates[nearestComparisonDate(dates, timestamp)]);
  };
  const inspectWithKeyboard = (event) => {
    const index = Math.max(0, dates.indexOf(date));
    const next = {
      ArrowLeft: Math.max(0, index - 1),
      ArrowRight: Math.min(dates.length - 1, index + 1),
      Home: 0,
      End: dates.length - 1,
    }[event.key];
    if (next === undefined && event.key !== "Enter") return;
    event.preventDefault();
    onInspect(event.key === "Enter" ? null : dates[next]);
  };

  return (
    <div ref={containerRef} className="comparison-chart-container">
      {chart ? <>
        <svg
          className="comparison-chart"
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          tabIndex={0}
          aria-label={`${scope}: ${metric.label} over time. At ${dateLabel(date)}, ${seriesLabel ? `${seriesLabel} ${formatComparisonValue(selected?.intervention, metric.format)}` : `original ${formatComparisonValue(selected?.original, metric.format)}, intervention ${formatComparisonValue(selected?.intervention, metric.format)}, change ${delta}`}. Use left and right arrow keys to inspect dates; Enter follows the replay date.`}
          onKeyDown={inspectWithKeyboard}
          onPointerDown={inspect}
          onPointerMove={(event) => { if (event.pointerType === "mouse" || event.buttons) inspect(event); }}
        >
          {chart.ticks.map((tick, index) => (
            <g key={index}>
              <line className="comparison-gridline" x1={chart.plot.left} x2={chart.plot.right} y1={chart.y(tick)} y2={chart.y(tick)} />
              <text className="comparison-axis" x={chart.plot.left - 9} y={chart.y(tick) + 4} textAnchor="end">{formatAxis(tick)}</text>
            </g>
          ))}
          <g className="comparison-chart-interventions" aria-hidden="true">
            {eventClusters.filter((cluster) => cluster.steps.length === 1).map((cluster) => (
              <line key={cluster.steps[0].date} x1={chart.plot.left + cluster.position * plotWidth} x2={chart.plot.left + cluster.position * plotWidth} y1={chart.plot.top - 7} y2={chart.plot.bottom} />
            ))}
          </g>
          {!compact && introduction && <line className="comparison-introduction-line"
            x1={chart.x(Date.parse(introduction.displayDate))} x2={chart.x(Date.parse(introduction.displayDate))}
            y1={chart.plot.top - 27} y2={chart.plot.bottom} />}
          {!seriesLabel && <path className="comparison-line comparison-line--original" d={chart.original} />}
          <path className="comparison-line comparison-line--intervention" d={chart.intervention} />
          {date !== currentDate && points.some((point) => point.date === currentDate) && <line className="comparison-current-date" x1={chart.x(Date.parse(currentDate))} x2={chart.x(Date.parse(currentDate))} y1={chart.plot.top} y2={chart.plot.bottom} />}
          {["original", "intervention"].map((key) => animatedPoints.map((point, index) => (
            Number.isFinite(point[key]) && !Number.isFinite(animatedPoints[index - 1]?.[key]) && !Number.isFinite(animatedPoints[index + 1]?.[key])
              ? <circle key={`${key}-${point.date}`} className={`comparison-point comparison-point--${key}`} cx={chart.x(Date.parse(point.date))} cy={chart.y(point[key])} r="3" />
              : null
          )))}
          {animatedSelected && (
            <g>
              <line className="comparison-cursor" x1={chart.x(Date.parse(date))} x2={chart.x(Date.parse(date))} y1={chart.plot.top} y2={chart.plot.bottom} />
              {["original", "intervention"].map((key) => Number.isFinite(animatedSelected[key]) && (
                <circle key={key} className={`comparison-point comparison-point--${key}`} cx={chart.x(Date.parse(date))} cy={chart.y(animatedSelected[key])} r="4" />
              ))}
            </g>
          )}
          {!compact && !seriesLabel && <text className="comparison-delta" x={chart.plot.right - 5} y={chart.plot.top + 18} textAnchor="end">
            <title>Intervention minus original</title>Δ {delta}
          </text>}
          {!compact && <text className="comparison-axis" x={0} y={size.height - 7}>{dateLabel(points[0].date)}</text>}
          {!compact && points.length > 1 && <text className="comparison-axis" x={size.width} y={size.height - 7} textAnchor="end">{dateLabel(points.at(-1).date)}</text>}
        </svg>
        {!compact && (eventClusters.length > 0 || introduction) && <div className="comparison-chart-events" role="group" aria-label={`${scope} chart events`}
          style={{ left: chart.plot.left, top: chart.plot.top - 22, width: chart.plot.right - chart.plot.left,
            "--event-marker-width": `${comparisonEventMarkerWidth}px`, "--chart-event-space": `${chart.plot.bottom - chart.plot.top - 20}px`,
            "--chart-event-width": `${chart.plot.right - chart.plot.left}px` }}>
          <InterventionTrack clusters={eventClusters} onInspect={onInspect} />
          {introduction && <IntroductionMarker introduction={introduction} position={introductionPosition} onInspect={onInspect} />}
        </div>}
      </> : size?.width > 0 && <div className="comparison-chart-empty">No results for this metric.</div>}
    </div>
  );
}

function ComparisonScope({ title, description, helpRows, metrics, original, intervention, regions, onRegionSelect, dates, date, currentDate, interventionEvents, introduction, metricKey, animate, onMetricChange, onInspect, children }) {
  const selectId = useId();
  const metric = metrics.find((entry) => entry.key === metricKey) || metrics[0];
  const originalFrame = original.find((frame) => frame.date === date);
  const interventionFrame = intervention.find((frame) => frame.date === date);
  const points = useMemo(() => !regions && metric ? pairComparisonSeries(dates, original, intervention, metric.key) : [],
    [dates, original, intervention, regions, metric?.key]);
  if (!metric) return <section className="comparison-scope"><h3>{title}</h3><p>No metrics available.</p></section>;

  return (
    <section className={`comparison-scope${regions ? " comparison-scope--top-regions" : ""}`}>
      <div className="comparison-scope__heading">
        <div className="comparison-scope__title">
          <h3>{title}</h3>
          <ComparisonInfo label={title} icon={title === "Overall" ? faNetworkWired : faLocationDot} rows={helpRows}>{description}</ComparisonInfo>
        </div>
        {children && <div className="comparison-scope__context">{children}</div>}
        <div className="comparison-metric-select">
          <label htmlFor={selectId} className="visually-hidden">{title} metric</label>
          <select id={selectId} value={metric.key} title={metric.label} onChange={(event) => onMetricChange(event.target.value)}>
            {metrics.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
          </select>
          <ComparisonInfo label={metric.label} footer={metric.format === "percent" ? "Δ uses percentage points (pp)." : "Δ = Intervention − Original"}>{metric.description || metric.label}</ComparisonInfo>
        </div>
      </div>
      <div className={regions ? "comparison-ranked-regions" : "comparison-trajectories"} role="group"
        aria-label={regions ? "Top region trajectories" : `${title} trajectories`} tabIndex={regions ? 0 : undefined}>
        {(regions || [{ name: title, points }]).map((region, index) => {
          const point = region.points.find((point) => point.date === date);
          return <section key={index} className={regions ? "comparison-region-row" : "comparison-trajectory"} aria-label={regions ? `${region.name} (${region.id})` : title}>
            {regions && <button type="button" className="comparison-region-row__name" onClick={() => onRegionSelect(region.id)}
              aria-label={`Inspect ${region.name} (${region.id})`} title={region.name}>
              <span>{region.id}</span> {region.name}
            </button>}
            <div className={regions ? "comparison-region-row__values" : "comparison-pair"}>
              <div className="comparison-series-label--original"><span className={regions ? undefined : "comparison-series-label comparison-series-label--original"}>Original</span> <strong>{formatComparisonValue(point?.original, metric.format)}</strong></div>
              <div className="comparison-series-label--intervention"><span className={regions ? undefined : "comparison-series-label comparison-series-label--intervention"}>Intervention</span> <strong>{formatComparisonValue(point?.intervention, metric.format)}</strong></div>
              {regions && <span>Δ <strong>{formatComparisonDelta(point?.original, point?.intervention, metric.format)}</strong></span>}
            </div>
            <PairedChart compact={Boolean(regions)} points={region.points} metric={metric} date={date} currentDate={currentDate}
              interventionEvents={interventionEvents} introduction={introduction} scope={region.name}
              animate={animate} onInspect={onInspect} />
          </section>;
        })}
        {regions && !regions.length && <p className="comparison-region-empty">No regional results for this metric.</p>}
      </div>
      {title === "Region" && !regions && <details className="comparison-stats">
        <summary>All {title.toLowerCase()} stats <span>{metrics.length}</span></summary>
        <table>
          <caption className="visually-hidden">{title} comparison for {dateLabel(date)}</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">Original</th><th scope="col">Intervention</th><th scope="col">Change</th></tr></thead>
          <tbody>{metrics.map((entry) => (
            <tr key={entry.key}>
              <th scope="row">{entry.label}</th>
              <td>{formatComparisonValue(originalFrame?.[entry.key], entry.format)}</td>
              <td>{formatComparisonValue(interventionFrame?.[entry.key], entry.format)}</td>
              <td>{formatComparisonDelta(originalFrame?.[entry.key], interventionFrame?.[entry.key], entry.format)}</td>
            </tr>
          ))}</tbody>
        </table>
      </details>}
    </section>
  );
}

function InterventionTrack({ clusters, onInspect }) {
  return clusters.map((cluster) => <Fragment key={cluster.steps[0].date}>
    {cluster.steps.length > 1 && <span className="comparison-event-range" aria-hidden="true"
      style={{ left: `${cluster.startPosition * 100}%`, width: `${(cluster.endPosition - cluster.startPosition) * 100}%` }} />}
    <InterventionMarker cluster={cluster} onInspect={onInspect} />
  </Fragment>);
}

function IntroductionMarker({ introduction, position, onInspect }) {
  const cluster = useMemo(() => ({ position, steps: [{ date: introduction.displayDate, events: [{
    date: introduction.date, description: `Seed introduction in ${introduction.seedLabel}. Both scenarios share this introduction.`,
  }] }] }), [introduction, position]);
  return <InterventionMarker cluster={cluster} introduction onInspect={onInspect} />;
}

const InterventionMarker = memo(function InterventionMarker({ cluster, introduction = false, onInspect }) {
  const tooltipId = useId();
  const { position, steps } = cluster;
  const grouped = steps.length > 1;
  const eventCount = steps.reduce((count, step) => count + step.events.length, 0);
  const firstDate = steps[0].date;
  const [detailDate, setDetailDate] = useState(firstDate);
  const selectedDate = steps.some((step) => step.date === detailDate) ? detailDate : firstDate;
  const label = introduction
    ? `Inspect seed introduction on ${dateLabel(steps[0].events[0].date)}`
    : grouped
    ? `Choose among ${steps.length} intervention steps from ${dateLabel(firstDate)} to ${dateLabel(steps.at(-1).date)}`
    : `Inspect ${eventCount} intervention ${eventCount === 1 ? "event" : "events"} at ${dateLabel(firstDate)}`;
  const { active, infoRef, tipRef: tooltipRef, ...tipEvents } = useComparisonTipPosition(label, 280);
  return (
    <div ref={infoRef} className={`comparison-event${introduction ? " is-introduction" : grouped ? " is-range" : ""}`} style={{ left: `${position * 100}%`, "--event-position": position }} {...tipEvents}>
      <button
        type="button"
        className={`comparison-event__marker${grouped || eventCount > 1 || introduction ? " is-grouped" : ""}`}
        aria-label={label}
        aria-describedby={active ? tooltipId : undefined}
        onClick={() => grouped ? tooltipRef.current.focus() : onInspect(firstDate)}
      >
        <span aria-hidden="true">{introduction ? <><i />Intro</> : grouped ? `${axisFormatter.format(steps.length)} steps` : eventCount > 1 ? `${axisFormatter.format(eventCount)} events` : null}</span>
      </button>
      <div ref={tooltipRef} id={tooltipId} className="comparison-event__tip" role={grouped ? "group" : "tooltip"} aria-label={grouped ? "Intervention steps" : undefined} tabIndex="0">
        {active && <>
        <div className="comparison-event__heading">
          <strong><FontAwesomeIcon icon={introduction ? faLocationDot : faCalendarDays} aria-hidden="true" />{introduction ? "Seed introduction" : grouped ? `${steps.length} recorded steps` : dateLabel(firstDate)}</strong>
          <span>{introduction ? dateLabel(steps[0].events[0].date) : `${eventCount} ${eventCount === 1 ? "event" : "events"}`}</span>
        </div>
        {grouped && <p className="comparison-event__range-label">{dateLabel(firstDate)} — {dateLabel(steps.at(-1).date)}</p>}
        {introduction && steps[0].events[0].date !== firstDate && <p className="comparison-event__range-label">Display period: {dateLabel(firstDate)}</p>}
        {steps.map((step, stepIndex) => (
          <div key={step.date} className="comparison-event__step">
            {grouped && <button type="button" aria-expanded={selectedDate === step.date}
              aria-controls={selectedDate === step.date ? `${tooltipId}-${stepIndex}` : undefined}
              onClick={() => { setDetailDate(step.date); onInspect(step.date); }}>
              <time dateTime={step.date}>{dateLabel(step.date)}</time><span>{step.events.length} {step.events.length === 1 ? "event" : "events"}</span>
            </button>}
            {(!grouped || selectedDate === step.date) && <ul id={`${tooltipId}-${stepIndex}`}>{step.events.map((event, index) => (
              <li key={`${event.date}:${index}`}>
                {event.date !== step.date && <time dateTime={event.date}>{dateLabel(event.date)}</time>}
                {event.description}
              </li>
            ))}</ul>}
          </div>
        ))}
        </>}
      </div>
    </div>
  );
});

function ComparisonContent({ data, animate }) {
  const ready = data?.status === "ready" && data.dates?.length > 0;
  const dates = data?.dates || [];
  const regions = data?.regions || [];
  const nodeMetrics = data?.nodeMetrics || [];
  const [regionId, setRegionId] = useState("");
  const [globalMetricKey, setGlobalMetricKey] = useState(data?.mode === "simulation" ? "prevalence" : "totalTradeVolume");
  const [nodeMetricKey, setNodeMetricKey] = useState(data?.mode === "simulation" ? "prevalence" : "eigenvector");
  const [inspectedDate, setInspectedDate] = useState(null);
  const regionSelectId = useId();
  useEffect(() => {
    setGlobalMetricKey(data?.mode === "simulation" ? "prevalence" : "totalTradeVolume");
    setNodeMetricKey(data?.mode === "simulation" ? "prevalence" : "eigenvector");
    setInspectedDate(null);
    setRegionId("");
  }, [data?.mode, data?.scenarioContext?.datasetKey]);
  const selectedRegion = regions.find((region) => region.id === regionId);
  const selectedMetric = nodeMetrics.find((metric) => metric.key === nodeMetricKey) || nodeMetrics[0];
  const topRegions = useMemo(() => ready && selectedMetric ? topComparisonRegions(regions, data.original.nodes, selectedMetric.key, 3)
    .map((region) => ({ ...region,
      points: pairComparisonSeries(dates, data.original.nodes[region.id] || [], data.intervention.nodes[region.id] || [], selectedMetric.key),
    })) : [], [ready, regions, dates, data?.original?.nodes, data?.intervention?.nodes, selectedMetric?.key]);
  const dateIndex = Math.max(0, dates.indexOf(inspectedDate || data?.date));
  const date = dates[dateIndex];
  const interventionEvents = data?.interventionEvents || [];
  const introductionDate = data?.mode === "simulation" ? data.settings?.introductionDate
    : data?.scenarioContext?.presetSettings?.ready ? data.scenarioContext.settings?.introductionDate : null;
  const seedLabel = data?.scenarioContext?.seedLabel;
  const coverage = data?.scenarioContext?.provenance?.movementData;
  const introduction = useMemo(() => {
    const point = getComparisonIntroduction(introductionDate, dates, coverage);
    return point ? { ...point, seedLabel } : null;
  }, [introductionDate, dates, seedLabel, coverage]);
  return (
    <>
      <div className="comparison-body">
        {ready ? <div className="comparison-layout">
          <ComparisonScope
            title="Overall"
            animate={animate}
            description="Compare the whole system across both scenarios."
            helpRows={[
              ["Original", "All recorded routes and regional trade permissions are open."],
              ["Intervention", "Applies your route edits and restriction schedule."],
              ["Simulation", "Both scenarios share the same model settings and seed."],
              ["Reading the chart", "Both lines share a scale. The dashed line shows Original; gaps mark missing results."],
              ["Introduction", "The violet Intro marker shows the seed introduction shared by both scenarios."],
              ["Interventions", "Diamonds mark changes. Count badges and glowing rails gather nearby dates; open a badge to choose a step."],
            ]}
            metrics={data.globalMetrics}
            original={data.original.global}
            intervention={data.intervention.global}
            dates={data.dates} date={date} currentDate={data.date}
            interventionEvents={interventionEvents}
            introduction={introduction}
            metricKey={globalMetricKey} onMetricChange={setGlobalMetricKey} onInspect={setInspectedDate}
          />
          {regions.length ? (
            <ComparisonScope
              title="Region"
              animate={animate}
              description="Compare the leading regions or follow one region across both scenarios."
              helpRows={[
                ["Top regions", "Three regions ranked by the highest finite value of the selected metric in Original across the full displayed timeline. Ties use region ID; regions without results are omitted."],
                ["Compare curves", "Each row has its own scale shared by Original and Intervention. Original is dashed and Intervention is solid. Point at a chart to inspect the same date across all rows."],
                ["Choose a region", "Use the selector or select a regional row. Your main network selection stays fixed."],
                ["Read its trajectory", "Both lines share a scale. The dashed line shows Original; gaps mark missing results."],
                ["Introduction", "The violet Intro marker shows introduction in the scenario's seed region."],
                ["Interventions", "Markers show all scenario changes. Count badges gather nearby dates; hover for details or select a date."],
              ]}
              metrics={data.nodeMetrics}
              original={data.original.nodes[selectedRegion?.id] || []}
              intervention={data.intervention.nodes[selectedRegion?.id] || []}
              regions={selectedRegion ? undefined : topRegions} onRegionSelect={setRegionId}
              dates={data.dates} date={date} currentDate={data.date}
              interventionEvents={interventionEvents}
              introduction={introduction}
              metricKey={nodeMetricKey} onMetricChange={setNodeMetricKey} onInspect={setInspectedDate}
            >
              <div className="comparison-region-select">
                <label htmlFor={regionSelectId} className="visually-hidden">Region to compare</label>
                <select id={regionSelectId} value={selectedRegion?.id || "top-3"}
                  title={selectedRegion ? `${selectedRegion.name} · ${selectedRegion.id}` : "Top 3 regions"}
                  onChange={(event) => setRegionId(event.target.value === "top-3" ? "" : event.target.value)}>
                  <optgroup label="Top regions">
                    <option value="top-3">Top 3 regions</option>
                  </optgroup>
                  <optgroup label="Single region">
                    {data.regions.map((region) => <option key={region.id} value={region.id}>{region.name} · {region.id}</option>)}
                  </optgroup>
                </select>
              </div>
            </ComparisonScope>
          ) : <section className="comparison-scope"><h3>Region</h3><p>No regional results available.</p></section>}
        </div> : (
          <div className="comparison-state" role="status" aria-live="polite">
            <span className={`comparison-state__symbol${data?.status === "error" ? " is-error" : ""}`} aria-hidden="true">{data?.status === "error" ? "!" : "↔"}</span>
            <h3>{data?.status === "error" ? "Comparison unavailable" : ["ready", "empty"].includes(data?.status) ? "No comparable dates" : "Preparing both scenarios"}</h3>
            <p>{data?.error || data?.message || (data?.status === "error" ? "The paired results could not be computed." : ["ready", "empty"].includes(data?.status) ? "This dataset has no paired results to inspect." : "Results appear together when both scenarios are ready.")}</p>
          </div>
        )}
      </div>
    </>
  );
}

export function ComparisonOverlay({ open, data, recomputing = false, onClose, onModeChange, scenarioSlots = [null, null, null], activePresetId, activeScenarioSlot = null, scenarioError, scenarioNotice, onLoadPreset, onChangePresetSettings, onSaveScenario, onLoadScenario }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const scenariosToggleRef = useRef(null);
  const libraryRef = useRef(null);
  const completedData = useRef(null);
  const titleId = useId();
  const libraryId = useId();
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [threeScenarios, setThreeScenarios] = useState(false);
  const [selectedComparisonSet, setSelectedComparisonSet] = useState("strategies");
  const [comparisonColumns, setComparisonColumns] = useState(null);
  const [comparisonMetricKeys, setComparisonMetricKeys] = useState({ simulation: "prevalence", trade: "outDegree" });
  const [comparisonRegionView, setComparisonRegionView] = useState("top-3");
  const closeScenarios = () => {
    setScenariosOpen(false);
    scenariosToggleRef.current.focus({ preventScroll: true });
  };
  const busy = open && (recomputing || data?.status === "loading");
  const displayedData = busy && completedData.current ? completedData.current : data;
  const comparisonMetrics = displayedData?.globalMetrics?.filter((metric) => displayedData.nodeMetrics.some((nodeMetric) => nodeMetric.key === metric.key)) || [];
  const comparisonMetric = comparisonMetrics.find((metric) => metric.key === comparisonMetricKeys[displayedData?.mode]);
  const context = useMemo(() => busy && data?.scenarioContext
    ? { ...data.scenarioContext, disabled: true } : data?.scenarioContext, [busy, data?.scenarioContext]);
  const columns = comparisonColumns || (displayedData?.scenarioContext?.presetSettings
    ? comparisonConfigurations("strategies", displayedData.scenarioContext.presetSettings) : null);
  const comparisonEvaluation = useScenarioComparison({ data: displayedData, enabled: open && threeScenarios && !busy,
    slots: scenarioSlots, configurations: columns });
  const comparisonBusy = open && threeScenarios && comparisonEvaluation.status === "loading";
  useLayoutEffect(() => {
    if (!open || data?.status === "error" || data?.status === "empty") completedData.current = null;
    else if (data?.status === "ready") completedData.current = data;
  }, [open, data]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) {
      dialog.showModal();
      closeRef.current.focus({ preventScroll: true });
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) setScenariosOpen(false);
    else if (scenariosOpen) {
      libraryRef.current.scrollTo({ top: 0 });
      libraryRef.current.querySelector("input:not(:disabled)")?.focus({ preventScroll: true });
    }
  }, [open, scenariosOpen]);

  const customControl = (
    <button ref={scenariosToggleRef} type="button" className={`comparison-scenarios-toggle${activeScenarioSlot !== null ? " has-active-scenario" : ""}`} disabled={busy} aria-expanded={scenariosOpen} aria-controls={libraryId} onClick={() => setScenariosOpen((value) => !value)}>
      <FontAwesomeIcon icon={faLayerGroup} aria-hidden="true" />
      Custom{activeScenarioSlot !== null ? ` ${String(activeScenarioSlot + 1).padStart(2, "0")}` : ""}
      <span aria-hidden="true">{scenariosOpen ? "−" : "+"}</span>
    </button>
  );

  return (
    <dialog
      ref={dialogRef}
      id="comparisonOverlay"
      className="comparison-overlay"
      data-private-population={displayedData?.settings?.population?.reference?.accessClass === "private" ? "true" : undefined}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); if (scenariosOpen) closeScenarios(); else onClose(); }}
      onClickCapture={(event) => {
        if (scenariosOpen && !libraryRef.current.contains(event.target) && !scenariosToggleRef.current.contains(event.target) &&
          !event.target.closest(".comparison-custom-backdrop")) {
          const focused = document.activeElement;
          if (focused === document.body || focused === dialogRef.current || libraryRef.current.contains(focused)) closeScenarios();
          else setScenariosOpen(false);
        }
      }}
    >
      <header className="comparison-header">
        <h2 id={titleId} className="comparison-header__title"><FontAwesomeIcon icon={faCodeCompare} aria-hidden="true" />Compare Scenarios</h2>
        <div className="comparison-header__actions">
          <div className="comparison-mode" data-mode={data?.mode} role="group" aria-label="Comparison mode">
            <button type="button" aria-pressed={data?.mode === "trade"} disabled={busy || !data || data.modeSwitchDisabled} onClick={() => { if (data.mode !== "trade") onModeChange("trade"); }}>
              <FontAwesomeIcon icon={faBook} aria-hidden="true" />
              Ledger
            </button>
            <button type="button" aria-pressed={data?.mode === "simulation"} disabled={busy || !data || data.modeSwitchDisabled} onClick={() => { if (data.mode !== "simulation") onModeChange("simulation"); }}>
              <FontAwesomeIcon icon={faFlask} aria-hidden="true" />
              Simulation
            </button>
          </div>
          <button ref={closeRef} className="comparison-close" type="button" onClick={onClose} aria-label="Close comparison (C or Escape)">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M4 4 16 16M16 4 4 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>
      {scenarioError && <p className="comparison-scenario-message is-error" role="alert">{scenarioError}</p>}
      <p className="visually-hidden" role="status" aria-atomic="true">{busy || comparisonBusy ? threeScenarios ? "Recomputing scenarios" : "Recomputing scenario" : scenarioError ? "" : scenarioNotice}</p>
      <div className="comparison-results" aria-busy={busy || comparisonBusy}>
        <aside className="comparison-sidebar" aria-label="Presets and comparison settings">
          <div className="comparison-view-switch" data-view={threeScenarios ? "three" : "pair"} role="group" aria-label="Comparison view" inert={scenariosOpen ? "" : undefined}>
            <button type="button" aria-pressed={!threeScenarios} disabled={busy} title="Compare the current scenario with the unrestricted baseline" onClick={() => setThreeScenarios(false)}>
              <FontAwesomeIcon icon={faScaleBalanced} aria-hidden="true" />
              <span>Baseline</span>
            </button>
            <button type="button" aria-pressed={threeScenarios} disabled={busy} title="Compare three independently configured scenarios" onClick={() => {
              if (!threeScenarios) {
                setSelectedComparisonSet("strategies");
                setComparisonColumns(null);
                setComparisonMetricKeys({ simulation: "prevalence", trade: "outDegree" });
                setComparisonRegionView("top-3");
                setThreeScenarios(true);
              }
            }}>
              <FontAwesomeIcon icon={faLayerGroup} aria-hidden="true" />
              <span>Compare <strong>3</strong></span>
            </button>
          </div>
          {displayedData?.status === "ready" && <ComparisonScenarioDetails data={displayedData} threeScenarios={threeScenarios}
            evaluation={comparisonEvaluation} configurations={columns} slots={scenarioSlots} activePresetId={activePresetId}
            Info={ComparisonInfo} inert={scenariosOpen} />}
          {threeScenarios ? <RecommendedComparisons context={context} selectedSet={selectedComparisonSet}
            onChooseSet={(id) => {
              setSelectedComparisonSet(id);
              setComparisonColumns(comparisonConfigurations(id, context.presetSettings));
            }} Info={ComparisonInfo} inert={scenariosOpen} />
            : <ScenarioPresets context={context} activePresetId={activePresetId} onLoadPreset={onLoadPreset} Info={ComparisonInfo} inert={scenariosOpen}>{customControl}</ScenarioPresets>}
          {!threeScenarios && <ScenarioPresetSettings context={context} onChangePresetSettings={onChangePresetSettings} Info={ComparisonInfo} inert={scenariosOpen} />}
          {threeScenarios && displayedData?.status === "ready" && <ComparisonChartControls data={displayedData} metrics={comparisonMetrics}
            metric={comparisonMetric} regionView={comparisonRegionView} disabled={busy}
            onMetricChange={(key) => setComparisonMetricKeys((keys) => ({ ...keys, [displayedData.mode]: key }))}
            onRegionChange={setComparisonRegionView} inert={scenariosOpen} />}
        </aside>
        <div className="comparison-results__content" inert={busy || scenariosOpen ? "" : undefined}>
          {threeScenarios && displayedData?.status === "ready"
            ? <ScenarioComparison data={displayedData} enabled={open && !busy} slots={scenarioSlots}
              configurations={columns} evaluation={comparisonEvaluation}
              onChangeConfigurations={(columns) => { setSelectedComparisonSet(null); setComparisonColumns(columns); }}
              metric={comparisonMetric} regionView={comparisonRegionView}
              Chart={PairedChart} Info={ComparisonInfo} />
            : <ComparisonContent data={displayedData} animate={open && !busy} />}
        </div>
        {scenariosOpen && <button type="button" className="comparison-custom-backdrop" aria-label="Close custom scenarios" tabIndex={-1} onClick={closeScenarios} />}
        <ScenarioLibrary id={libraryId} panelRef={libraryRef} open={scenariosOpen} context={context} slots={scenarioSlots} activeSlot={activeScenarioSlot}
          onSaveScenario={onSaveScenario}
          onLoadScenario={(index) => { closeScenarios(); setThreeScenarios(false); onLoadScenario(index); }} Info={ComparisonInfo} />
        {(busy || comparisonBusy) && displayedData?.status === "ready" && <div className={`comparison-recomputing${comparisonBusy && !busy ? " comparison-recomputing--editable" : ""}`} aria-hidden="true">
          <span className="comparison-recomputing__ring" aria-hidden="true"><FontAwesomeIcon icon={faCodeCompare} /></span>
          <span>{threeScenarios ? "Recomputing scenarios" : "Recomputing scenario"}</span>
        </div>}
      </div>
    </dialog>
  );
}
