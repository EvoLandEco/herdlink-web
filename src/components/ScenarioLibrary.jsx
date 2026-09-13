import { memo, useEffect, useId, useState } from "react";
import { faClock, faCircleNodes, faLockOpen, faNetworkWired, faPause, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const presetIcons = {
  "open-trade": faLockOpen,
  "seed-containment": faShieldHalved,
  "delayed-response": faClock,
  "partner-ring": faCircleNodes,
  "hub-controls": faNetworkWired,
  "temporary-standstill": faPause,
};
const savedDateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const datasetLabel = (key) => `${key[0].toUpperCase()}${key.slice(1)} trade`;

function ScenarioSlot({ slot, index, context, onSave, onLoad }) {
  const [name, setName] = useState(slot?.name || "");
  const inputId = useId();
  const hintId = useId();
  useEffect(() => { setName(slot?.name || ""); }, [slot?.name, slot?.savedAt]);
  const disabled = !context || context.disabled;
  const differentDataset = slot && context && slot.scenario.datasetKey !== context.datasetKey;
  const label = `Scenario ${index + 1}`;

  return (
    <article className={`scenario-slot${slot ? " is-saved" : ""}`}>
      <div className="scenario-slot__heading">
        <label htmlFor={inputId}><span>{String(index + 1).padStart(2, "0")}</span> {slot ? "Saved scenario" : "Empty slot"}</label>
        {slot && <time dateTime={slot.savedAt}>{savedDateFormatter.format(new Date(slot.savedAt))}</time>}
      </div>
      <input id={inputId} type="text" maxLength={48} value={name} placeholder={label} aria-label={`${label} name`} disabled={disabled} onChange={(event) => setName(event.target.value)} />
      <div className="scenario-slot__footer">
        <p id={hintId}>{differentDataset
          ? `Switch to ${datasetLabel(slot.scenario.datasetKey).toLowerCase()} to load.`
          : slot ? `${datasetLabel(slot.scenario.datasetKey)} · ${slot.scenario.settings.model} · ${slot.scenario.settings.seedRegion}` : "Save the current settings and schedule."}</p>
        <div className="scenario-slot__actions">
          <button type="button" disabled={disabled} onClick={() => onSave(index, name.trim() || label)} aria-label={`${slot ? "Overwrite" : "Save"} ${label.toLowerCase()}`}>{slot ? "Overwrite" : "Save"}</button>
          <button type="button" disabled={disabled || !slot || differentDataset} aria-describedby={hintId} onClick={() => onLoad(index)} aria-label={`Load ${slot?.name || label}`}>Load</button>
        </div>
      </div>
    </article>
  );
}

export const ScenarioLibrary = memo(function ScenarioLibrary({ id, open, context, slots, error, notice, onLoadPreset, onSaveScenario, onLoadScenario, Info }) {
  const headingId = useId();
  const disabled = !context || context.disabled;
  return (
    <section id={id} className="scenario-library" hidden={!open} aria-labelledby={headingId}>
      <div className="scenario-library__heading">
        <div><h3 id={headingId}>Scenario library</h3><p>Try a preset or keep your own comparison.</p></div>
        <Info label="Scenario library">Presets replace every intervention and keep the current model settings and seed. Broader restrictions can block more trade without reducing disease further when seed exports are already contained. Custom slots save the dataset, model settings, seed, and complete intervention schedule in this browser. Loading a slot replaces the current settings and schedule.</Info>
      </div>
      <div className="scenario-library__context">
        <span>{context ? `${context.datasetLabel} · ${context.settings.model}` : "Waiting for dataset"}</span>
        {context && <span>Seed · {context.seedLabel}</span>}
        <span>Presets replace all interventions</span>
      </div>
      <div className="scenario-preset-grid">
        {(context?.presets || []).map((preset) => (
          <article key={preset.id} className="scenario-preset">
            <button type="button" disabled={disabled} onClick={() => onLoadPreset(preset.id)} aria-label={`Load ${preset.label} preset`}>
              <span className="scenario-preset__icon"><FontAwesomeIcon icon={presetIcons[preset.id]} aria-hidden="true" /></span>
              <span className="scenario-preset__copy"><strong>{preset.label}</strong><span>{preset.summary}</span></span>
            </button>
            <Info label={preset.label}>{[preset.description, preset.detail].filter(Boolean).join(" ")}</Info>
          </article>
        ))}
      </div>
      <div className="scenario-library__saved-heading"><h4>Saved in this browser</h4><span>3 slots · complete scenarios</span></div>
      <div className="scenario-slot-grid">
        {Array.from({ length: 3 }, (_, index) => <ScenarioSlot key={index} slot={slots[index]} index={index} context={context} onSave={onSaveScenario} onLoad={onLoadScenario} />)}
      </div>
      {error && <p className="scenario-library__message is-error" role="alert">{error}</p>}
      {!error && notice && <p className="scenario-library__message" role="status">{notice}</p>}
    </section>
  );
});
