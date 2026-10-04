import { faBook, faCalendarDays, faFlask, faLayerGroup, faLocationDot, faSliders } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { comparisonColors } from "./ScenarioComparison";
import { presetIcons, presetLabels } from "./ScenarioLibrary";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const numberFormatter = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const dateLabel = (date) => dateFormatter.format(new Date(date));
const commonValue = (values) => values.every((value) => value === values[0]) ? values[0] : "Varies by column";
const countLabel = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const populationLabel = (settings) => `${numberFormatter.format(Object.values(settings.population.values).reduce((sum, value) => sum + value, 0))} ${settings.population.kind === "synthetic" ? "units" : "animals"}`;

function modelRows(settings, regions) {
  const seed = regions.find((region) => region.id === settings.seedRegion);
  return [
    ["Model", settings.model],
    ["Seed region", `${settings.seedRegion} · ${seed?.name || settings.seedRegion}`],
    ["Introduction", dateLabel(settings.introductionDate)],
    ["Population", populationLabel(settings)],
    ["Population source", settings.population.reference.label || settings.population.reference.id],
    ["Initial infectious", settings.initializationConvention === "absolute-counts"
      ? `${numberFormatter.format(Object.values(settings.initialStates).reduce((sum, state) => sum + state.I, 0))} units`
      : `${settings.initialPct}% of the seed region`],
    ["Contact / movement", `${settings.beta} / ${settings.movementBeta}`],
    ["Recovery", `${settings.gamma} per day`],
    ...(["SEIR", "SEIRS"].includes(settings.model) ? [["Progression", `${settings.sigma} per day`]] : []),
    ...(settings.model === "SEIRS" ? [["Waning", `${settings.omega} per day`]] : []),
  ];
}

export function ComparisonScenarioDetails({ data, threeScenarios, evaluation, configurations, slots, activePresetId, Info, inert }) {
  const context = data.scenarioContext;
  const simulation = data.mode === "simulation";
  const results = threeScenarios && evaluation.status === "ready" ? evaluation.results : null;
  const settings = threeScenarios ? results?.map((result) => result.settings) : [data.settings || context.settings];
  const regionalControls = new Set(context.nodeInterventions.flatMap(([, changes]) => changes.map(([id]) => id))).size;
  const routeControls = new Set(context.linkInterventions.flatMap(([, changes]) => changes.map(([id]) => id))).size;
  const activePreset = context.presets.find((preset) => preset.id === activePresetId);
  const model = simulation && settings ? commonValue(settings.map((entry) => entry.model)) : null;
  const seed = simulation && settings ? commonValue(settings.map((entry) => entry.seedRegion)) : null;
  const introduction = simulation && settings ? commonValue(settings.map((entry) => dateLabel(entry.introductionDate))) : null;
  const population = simulation && settings ? commonValue(settings.map(populationLabel)) : null;
  const rows = simulation && settings?.length === 1 ? modelRows(settings[0], data.regions) : [
    ["Trade data", context.datasetLabel],
    ["Timeline", `${dateLabel(data.dates[0])} to ${dateLabel(data.dates.at(-1))}`],
    ["Comparison", threeScenarios ? "Three independent restriction schedules on the same trade data." : "Original keeps all routes open. Scenario applies the active restriction schedule."],
    ...(simulation ? [["Model settings", "Each column's information button lists its model, population, seed and disease parameters."]] : [["Ledger mode", "Charts show recorded movements after restrictions. Disease parameters do not affect these results."]]),
  ];

  return <fieldset className={`comparison-details scenario-settings-group${threeScenarios ? " comparison-details--three" : ""}`} inert={inert ? "" : undefined}>
    <legend>Scenario details</legend>
    <div className="comparison-details__heading">
      <span className="comparison-details__icon"><FontAwesomeIcon icon={simulation ? faFlask : faBook} aria-hidden="true" /></span>
      <span><strong>{simulation ? model || "Calculating…" : "Trade ledger"}</strong></span>
      <Info label="Scenario details" icon={simulation ? faFlask : faBook} rows={rows} />
    </div>
    {simulation ? settings && <dl className="comparison-details__facts">
      <div title={data.regions.find((region) => region.id === seed)?.name}><dt><FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />Seed</dt><dd>{seed}</dd></div>
      <div><dt><FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" />Introduction</dt><dd>{introduction}</dd></div>
      <div className="comparison-details__population"><dt><FontAwesomeIcon icon={faLayerGroup} aria-hidden="true" />Population</dt><dd>{population}</dd></div>
    </dl> : <dl className="comparison-details__facts">
      <div className="comparison-details__population"><dt><FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" />Trade data</dt><dd>{context.datasetLabel}</dd></div>
    </dl>}
    <div className="comparison-details__scenarios">
      {threeScenarios ? configurations.map((config, index) => {
        const result = results?.[index];
        const saved = config.presetId.startsWith("saved-");
        const label = saved ? slots[Number(config.presetId.slice(6))]?.name : presetLabels[config.presetId];
        const targets = result?.targets;
        return <div key={index} className="comparison-details__scenario" style={{ "--scenario-color": comparisonColors[index] }}>
          <span className="comparison-details__number">{String(index + 1).padStart(2, "0")}</span>
          <FontAwesomeIcon icon={saved ? faLayerGroup : presetIcons[config.presetId]} aria-hidden="true" />
          <span className="comparison-details__scenario-name"><strong title={label}>{label}</strong><small>{result
            ? targets ? `${countLabel(targets.length, "region")} targeted` : "Saved schedule"
            : evaluation.status === "error" ? "Results unavailable" : "Calculating…"}</small></span>
          {result && <Info label={`Scenario ${index + 1} settings`} icon={saved ? faLayerGroup : presetIcons[config.presetId]}
            rows={[
              ...(simulation ? modelRows(result.settings, data.regions) : [["Trade data", context.datasetLabel]]),
              ...(targets ? [["Target regions", targets.length ? targets.join(", ") : "None · all movements open"]] : []),
            ]}>{result.detail}</Info>}
        </div>;
      }) : <>
        <div className="comparison-details__scenario" style={{ "--scenario-color": "var(--comparison-original)" }}>
          <FontAwesomeIcon icon={presetIcons["open-trade"]} aria-hidden="true" /><span className="comparison-details__scenario-name"><strong>Original</strong><small>All movements open</small></span>
        </div>
        <div className="comparison-details__scenario" style={{ "--scenario-color": "var(--comparison-intervention)" }}>
          <FontAwesomeIcon icon={presetIcons[activePresetId] || faSliders} aria-hidden="true" /><span className="comparison-details__scenario-name"><strong title={activePreset?.label || "Custom"}>Scenario · {activePreset?.label || "Custom"}</strong><small>{countLabel(regionalControls, "region")} · {countLabel(routeControls, "route")} with controls</small></span>
          <Info label="Active restriction schedule" icon={faSliders} rows={[
            ["Regional controls", `${regionalControls} distinct regions with permission changes in the schedule.`],
            ["Route controls", `${routeControls} distinct routes with availability changes in the schedule.`],
          ]}>{activePreset?.description || "The active regional and route restrictions apply throughout their scheduled dates."}</Info>
        </div>
      </>}
    </div>
  </fieldset>;
}
