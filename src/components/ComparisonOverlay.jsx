import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import { faBook, faFlask } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  buildComparisonChart,
  comparisonEventMarkerWidth,
  formatComparisonDelta,
  formatComparisonValue,
  groupComparisonEvents,
  nearestComparisonDate,
  pairComparisonSeries,
} from "../comparisonCharts";
import "../styles/comparison.css";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});
const axisFormatter = new Intl.NumberFormat("en", { notation: "compact", maximumSignificantDigits: 3 });

function dateLabel(date) {
  return dateFormatter.format(new Date(date));
}

function ComparisonInfo({ label, children }) {
  const id = useId();
  return (
    <span className="comparison-info">
      <button
        type="button"
        className="panel-info-button has-tip"
        data-tip={children}
        aria-label={`${label} explained`}
        aria-describedby={id}
      >
        <span aria-hidden="true">i</span>
      </button>
      <span id={id} className="comparison-info__tip" role="tooltip">{children}</span>
    </span>
  );
}

function PairedChart({ points, metric, date, currentDate, onInspect }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState(null);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  const chart = useMemo(() => size?.width > 0 && size?.height > 0
    ? buildComparisonChart(points, size.width, size.height) : null, [points, size]);
  const dates = useMemo(() => points.map((point) => point.date), [points]);
  const selected = points.find((point) => point.date === date);
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

  return (
    <div ref={containerRef} className="comparison-chart-container">
      {chart ? (
        <svg
          className="comparison-chart"
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={`${metric.label} over time. At ${dateLabel(date)}, original ${formatComparisonValue(selected?.original, metric.format)}, intervention ${formatComparisonValue(selected?.intervention, metric.format)}. Use the date slider to inspect other dates.`}
          onPointerDown={inspect}
          onPointerMove={(event) => { if (event.pointerType === "mouse" || event.buttons) inspect(event); }}
        >
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line className="comparison-gridline" x1={chart.plot.left} x2={chart.plot.right} y1={chart.y(tick)} y2={chart.y(tick)} />
              <text className="comparison-axis" x={chart.plot.left - 9} y={chart.y(tick) + 4} textAnchor="end">{formatAxis(tick)}</text>
            </g>
          ))}
          <path className="comparison-line comparison-line--original" d={chart.original} />
          <path className="comparison-line comparison-line--intervention" d={chart.intervention} />
          {date !== currentDate && points.some((point) => point.date === currentDate) && <line className="comparison-current-date" x1={chart.x(Date.parse(currentDate))} x2={chart.x(Date.parse(currentDate))} y1={chart.plot.top} y2={chart.plot.bottom} />}
          {["original", "intervention"].map((key) => points.map((point, index) => (
            Number.isFinite(point[key]) && !Number.isFinite(points[index - 1]?.[key]) && !Number.isFinite(points[index + 1]?.[key])
              ? <circle key={`${key}-${point.date}`} className={`comparison-point comparison-point--${key}`} cx={chart.x(Date.parse(point.date))} cy={chart.y(point[key])} r="3" />
              : null
          )))}
          {selected && (
            <g>
              <line className="comparison-cursor" x1={chart.x(Date.parse(date))} x2={chart.x(Date.parse(date))} y1={chart.plot.top} y2={chart.plot.bottom} />
              {["original", "intervention"].map((key) => Number.isFinite(selected[key]) && (
                <circle key={key} className={`comparison-point comparison-point--${key}`} cx={chart.x(Date.parse(date))} cy={chart.y(selected[key])} r="4" />
              ))}
            </g>
          )}
          <text className="comparison-axis" x={chart.plot.left} y={size.height - 7}>{dateLabel(points[0].date)}</text>
          {points.length > 1 && <text className="comparison-axis" x={chart.plot.right} y={size.height - 7} textAnchor="end">{dateLabel(points.at(-1).date)}</text>}
        </svg>
      ) : size?.width > 0 && <div className="comparison-chart-empty">No results for this metric.</div>}
    </div>
  );
}

function ComparisonScope({ title, description, metrics, original, intervention, dates, date, currentDate, metricKey, onMetricChange, onInspect, children }) {
  const selectId = useId();
  const metric = metrics.find((entry) => entry.key === metricKey) || metrics[0];
  const originalFrame = original.find((frame) => frame.date === date);
  const interventionFrame = intervention.find((frame) => frame.date === date);
  const points = useMemo(() => metric ? pairComparisonSeries(dates, original, intervention, metric.key) : [],
    [dates, original, intervention, metric?.key]);
  if (!metric) return <section className="comparison-scope"><h3>{title}</h3><p>No metrics available.</p></section>;

  return (
    <section className="comparison-scope">
      <div className="comparison-scope__heading">
        <h3>{title}</h3>
        <ComparisonInfo label={title}>{description}</ComparisonInfo>
      </div>
      <div className="comparison-scope__context">{children || <span>Across all regions</span>}</div>
      <div className="comparison-metric-select">
        <label htmlFor={selectId}>Metric</label>
        <select id={selectId} value={metric.key} onChange={(event) => onMetricChange(event.target.value)}>
          {metrics.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}
        </select>
        <ComparisonInfo label={metric.label}>{metric.description || metric.label}</ComparisonInfo>
      </div>
      <div className="comparison-pair">
        <div><span className="comparison-series-label comparison-series-label--original">Original</span><strong>{formatComparisonValue(originalFrame?.[metric.key], metric.format)}</strong></div>
        <div><span className="comparison-series-label comparison-series-label--intervention">Intervention</span><strong>{formatComparisonValue(interventionFrame?.[metric.key], metric.format)}</strong></div>
        <span className="comparison-delta" title="Intervention minus original">Δ {formatComparisonDelta(originalFrame?.[metric.key], interventionFrame?.[metric.key], metric.format)}</span>
      </div>
      <PairedChart points={points} metric={metric} date={date} currentDate={currentDate} onInspect={onInspect} />
      <details className="comparison-stats">
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
      </details>
    </section>
  );
}

const InterventionMarker = memo(function InterventionMarker({ cluster, onInspect }) {
  const tooltipId = useId();
  const tooltipRef = useRef(null);
  const { position, steps } = cluster;
  const grouped = steps.length > 1;
  const eventCount = steps.reduce((count, step) => count + step.events.length, 0);
  const firstDate = steps[0].date;
  const label = grouped
    ? `Choose among ${steps.length} intervention steps from ${dateLabel(firstDate)} to ${dateLabel(steps.at(-1).date)}`
    : `Inspect ${eventCount} intervention ${eventCount === 1 ? "event" : "events"} at ${dateLabel(firstDate)}`;
  return (
    <div className="comparison-event" style={{ left: `${position * 100}%`, "--event-position": position }}>
      <button
        type="button"
        className={`comparison-event__marker${grouped ? " is-grouped" : ""}`}
        aria-label={label}
        aria-describedby={tooltipId}
        onClick={() => grouped ? tooltipRef.current.focus() : onInspect(firstDate)}
      >
        <span aria-hidden="true">{grouped ? "+" : null}</span>
      </button>
      <div ref={tooltipRef} id={tooltipId} className="comparison-event__tip" role={grouped ? "group" : "tooltip"} aria-label={grouped ? "Intervention steps" : undefined} tabIndex="0">
        <div className="comparison-event__heading">
          <strong>{grouped ? `${steps.length} recorded steps` : dateLabel(firstDate)}</strong>
          <span>{eventCount} {eventCount === 1 ? "event" : "events"}</span>
        </div>
        {steps.map((step) => (
          <div key={step.date} className="comparison-event__step">
            {grouped && <button type="button" onClick={() => onInspect(step.date)}>
              <time dateTime={step.date}>{dateLabel(step.date)}</time><span>Inspect</span>
            </button>}
            <ul>{step.events.map((event, index) => (
              <li key={`${event.date}:${index}`}>
                {event.date !== step.date && <time dateTime={event.date}>{dateLabel(event.date)}</time>}
                {event.description}
              </li>
            ))}</ul>
          </div>
        ))}
      </div>
    </div>
  );
});

function ReadyComparison({ data }) {
  const [regionId, setRegionId] = useState(data.selectedRegionId || data.regions[0]?.id || "");
  const [globalMetricKey, setGlobalMetricKey] = useState(data.mode === "simulation" ? "prevalence" : "totalTradeVolume");
  const [nodeMetricKey, setNodeMetricKey] = useState(data.mode === "simulation" ? "prevalence" : "eigenvector");
  const [inspectedDate, setInspectedDate] = useState(null);
  const [eventTrackWidth, setEventTrackWidth] = useState(0);
  const eventTrackRef = useRef(null);
  const rangeId = useId();
  const regionSelectId = useId();
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setEventTrackWidth(entry.contentRect.width));
    observer.observe(eventTrackRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (data.selectedRegionId) setRegionId(data.selectedRegionId);
  }, [data.selectedRegionId]);
  const selectedRegion = data.regions.find((region) => region.id === regionId) || data.regions[0];
  const selectedMetric = data.nodeMetrics.find((metric) => metric.key === nodeMetricKey) || data.nodeMetrics[0];
  const dateIndex = Math.max(0, data.dates.indexOf(inspectedDate || data.date));
  const date = data.dates[dateIndex];
  const timelineProgress = data.dates.length > 1 ? dateIndex / (data.dates.length - 1) : 0;
  const interventionEvents = data.interventionEvents || [];
  const eventClusters = useMemo(() => groupComparisonEvents(interventionEvents, data.dates, eventTrackWidth),
    [interventionEvents, data.dates, eventTrackWidth]);
  const changes = selectedMetric ? data.regions.map((region) => {
    const original = data.original.nodes[region.id]?.[dateIndex]?.[selectedMetric.key];
    const intervention = data.intervention.nodes[region.id]?.[dateIndex]?.[selectedMetric.key];
    return { ...region, original, intervention, delta: intervention - original };
  }).filter((region) => Number.isFinite(region.original) && Number.isFinite(region.intervention))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.id.localeCompare(b.id)) : [];
  const changedRegions = changes.filter((region) => region.delta !== 0);
  const largestChange = Math.abs(changedRegions[0]?.delta || 0);

  return (
    <>
      <div className="comparison-body">
        <div className="comparison-layout">
          <ComparisonScope
            title="Network"
            description="Original includes all routes and regional trade permissions. Intervention applies your link edits and restriction schedule. Simulation scenarios share model settings and seed. Both lines share a scale; gaps and dashes mark missing results."
            metrics={data.globalMetrics}
            original={data.original.global}
            intervention={data.intervention.global}
            dates={data.dates} date={date} currentDate={data.date}
            metricKey={globalMetricKey} onMetricChange={setGlobalMetricKey} onInspect={setInspectedDate}
          />
          {selectedRegion ? (
            <ComparisonScope
              title="Region"
              description="Compare one region across both scenarios. Selecting a region here leaves your main network selection unchanged."
              metrics={data.nodeMetrics}
              original={data.original.nodes[selectedRegion.id] || []}
              intervention={data.intervention.nodes[selectedRegion.id] || []}
              dates={data.dates} date={date} currentDate={data.date}
              metricKey={nodeMetricKey} onMetricChange={setNodeMetricKey} onInspect={setInspectedDate}
            >
              <div className="comparison-region-select">
                <label htmlFor={regionSelectId} className="visually-hidden">Region to compare</label>
                <select id={regionSelectId} value={selectedRegion.id} onChange={(event) => setRegionId(event.target.value)}>
                  {data.regions.map((region) => <option key={region.id} value={region.id}>{region.name} · {region.id}</option>)}
                </select>
              </div>
            </ComparisonScope>
          ) : <section className="comparison-scope"><h3>Region</h3><p>No regional results available.</p></section>}
          <aside className="comparison-changes">
            <div className="comparison-scope__heading">
              <h3>Largest changes</h3>
              <ComparisonInfo label="Largest changes">Regions ranked by the absolute difference between intervention and original for the selected region metric and inspected date. The sign shows direction, not whether a change is beneficial.</ComparisonInfo>
            </div>
            <p className="comparison-changes__metric">{selectedMetric?.label || "Region metric"}</p>
            {changedRegions.length ? (
              <ol className="comparison-change-list" tabIndex={0} aria-label="Largest regional changes">
                {changedRegions.slice(0, 6).map((region, index) => (
                  <li key={region.id}>
                    <button type="button" aria-pressed={region.id === selectedRegion?.id} onClick={() => setRegionId(region.id)}>
                      <span className="comparison-change-rank">{String(index + 1).padStart(2, "0")}</span>
                      <span className="comparison-change-copy">
                        <span className="comparison-change-name">{region.name}<small>{region.id}</small></span>
                        <span className="comparison-change-values">{formatComparisonValue(region.original, selectedMetric.format)} → {formatComparisonValue(region.intervention, selectedMetric.format)}</span>
                        <span className="comparison-change-bar" aria-hidden="true"><i style={{ width: `${Math.abs(region.delta) / largestChange * 100}%` }} /></span>
                      </span>
                      <span className="comparison-change-delta">{formatComparisonDelta(region.original, region.intervention, selectedMetric.format)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p className="comparison-changes__empty">{changes.length ? "No regional change at this date." : "No paired regional results at this date."}</p>}
            <p className="comparison-changes__hint">Select a region to inspect its trajectory.</p>
          </aside>
        </div>
      </div>
      <footer className="comparison-timeline">
        <div className="comparison-timeline__heading">
          <label htmlFor={rangeId}>Inspect date <time dateTime={date}>{dateLabel(date)}</time></label>
          <span className="comparison-timeline__actions">
            {date !== data.date && <button type="button" onClick={() => setInspectedDate(null)}>Current date</button>}
            <ComparisonInfo label="Date inspector">Drag the ring or point at either chart to inspect a date. Hover or focus a diamond for intervention details; select it to inspect that step. A + groups nearby steps; open it to choose a date. Events between recorded dates appear at the next step, with their actual dates in the details. The main replay date stays fixed. Percent differences use percentage points (pp).</ComparisonInfo>
          </span>
        </div>
        <div className={`comparison-timeline-slider${interventionEvents.length ? " has-events" : ""}`} style={{ "--timeline-progress": `${timelineProgress * 100}%` }}>
          <div className="comparison-timeline-track" aria-hidden="true"><span /></div>
          <input id={rangeId} type="range" min="0" max={data.dates.length - 1} step="1" value={dateIndex} disabled={data.dates.length < 2} aria-valuetext={dateLabel(date)} onChange={(event) => setInspectedDate(data.dates[Number(event.target.value)])} />
          <div ref={eventTrackRef} className="comparison-timeline-events" style={{ "--event-marker-width": `${comparisonEventMarkerWidth}px` }}>
            {eventClusters.map((cluster) => (
              <InterventionMarker
                key={cluster.steps[0].date}
                cluster={cluster}
                onInspect={setInspectedDate}
              />
            ))}
          </div>
        </div>
        <div className="comparison-timeline__ends"><span>{dateLabel(data.dates[0])}</span><span>{dateLabel(data.dates.at(-1))}</span></div>
      </footer>
    </>
  );
}

export function ComparisonOverlay({ open, data, onClose, onModeChange }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();
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
  const ready = data?.status === "ready" && data.dates?.length > 0;

  return (
    <dialog
      ref={dialogRef}
      id="comparisonOverlay"
      className="comparison-overlay"
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <header className="comparison-header">
        <div className="comparison-header__title">
          <span className="comparison-eyebrow">Scenario comparison</span>
          <h2 id={titleId}>Original <span>/</span> Intervention</h2>
          <p>{data?.datasetLabel || "Animal trade network"}{data?.settings?.model ? ` · ${data.settings.model}` : ""}</p>
        </div>
        <div className="comparison-header__actions">
          <div className="comparison-mode" data-mode={data?.mode} role="group" aria-label="Comparison mode">
            <button type="button" aria-pressed={data?.mode === "trade"} disabled={!data || data.modeSwitchDisabled} onClick={() => { if (data.mode !== "trade") onModeChange("trade"); }}>
              <FontAwesomeIcon icon={faBook} aria-hidden="true" />
              Ledger
            </button>
            <button type="button" aria-pressed={data?.mode === "simulation"} disabled={!data || data.modeSwitchDisabled} onClick={() => { if (data.mode !== "simulation") onModeChange("simulation"); }}>
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
      {ready ? <ReadyComparison key={`${data.datasetKey || ""}:${data.mode}`} data={data} /> : (
        <div className="comparison-state" role="status" aria-live="polite">
          <span className={`comparison-state__symbol${data?.status === "error" ? " is-error" : ""}`} aria-hidden="true">{data?.status === "error" ? "!" : "↔"}</span>
          <h3>{data?.status === "error" ? "Comparison unavailable" : ["ready", "empty"].includes(data?.status) ? "No comparable dates" : "Preparing both scenarios"}</h3>
          <p>{data?.error || data?.message || (data?.status === "error" ? "The paired results could not be computed." : ["ready", "empty"].includes(data?.status) ? "This dataset has no paired results to inspect." : "Results appear together when both scenarios are ready.")}</p>
        </div>
      )}
    </dialog>
  );
}
