import { memo, useEffect, useId, useState } from "react";
import { faBullseye, faCircleInfo, faClock, faCircleNodes, faFlask, faHourglassHalf, faLayerGroup, faLocationDot, faLockOpen, faNetworkWired, faPause, faShieldHalved, faSliders } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const presetIcons = {
  "open-trade": faLockOpen,
  "seed-containment": faShieldHalved,
  "delayed-response": faClock,
  "partner-ring": faCircleNodes,
  "hub-controls": faNetworkWired,
  "temporary-standstill": faPause,
};
const presetLabels = {
  "open-trade": "Open",
  "seed-containment": "Seed",
  "delayed-response": "Delayed",
  "partner-ring": "Ring",
  "hub-controls": "Hubs",
  "temporary-standstill": "Pause",
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

function PresetHelp({ preset, context }) {
  const rows = [
    ["Action", preset.description, faSliders],
    ["Scope", preset.scope, faBullseye],
    ["Timing", preset.timing, faClock],
    ["Duration", preset.duration, faHourglassHalf],
  ];
  const notes = preset.id === "open-trade" ? [] : [
    context.timingNote,
    context.contactNote,
    ["partner-ring", "hub-controls"].includes(preset.id) ? context.note : null,
  ].filter(Boolean);

  return (
    <span className="preset-help">
      <span className="preset-help__heading">
        <span className="preset-help__icon"><FontAwesomeIcon icon={presetIcons[preset.id]} aria-hidden="true" /></span>
        <span className="preset-help__title"><small className="preset-help__eyebrow">Intervention preset</small><strong>{preset.label}</strong></span>
        <span className="preset-help__delay">{preset.delayDays
          ? <><strong>{preset.delayDays}</strong><small>day delay</small></>
          : <strong>Baseline</strong>}</span>
      </span>
      <span className="preset-help__rows">
        {rows.filter(([, text]) => text).map(([label, text, icon]) => (
          <span className="preset-help__row" key={label}>
            <FontAwesomeIcon icon={icon} aria-hidden="true" />
            <span><strong>{label}</strong><span>{text}</span></span>
          </span>
        ))}
      </span>
      <span className="preset-help__context">
        <span><FontAwesomeIcon icon={faFlask} aria-hidden="true" />{context.settings.model}</span>
        <span><FontAwesomeIcon icon={faLocationDot} aria-hidden="true" />{context.seedLabel}</span>
      </span>
      {notes.length > 0 && <span className="preset-help__notes">
        {notes.map((note) => <span key={note}><FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" /><span>{note}</span></span>)}
      </span>}
      <span className="preset-help__footer">Replaces all interventions · Keeps model settings and seed</span>
    </span>
  );
}

export const ScenarioPresets = memo(function ScenarioPresets({ context, onLoadPreset, Info }) {
  const disabled = !context || context.disabled;
  return (
    <div className="scenario-presets" role="group" aria-label="Intervention presets">
      <span className="scenario-presets__heading" aria-hidden="true">Presets</span>
      {(context?.presets || []).map((preset) => (
        <div key={preset.id} className="scenario-preset">
          <button type="button" disabled={disabled} onClick={() => onLoadPreset(preset.id)} aria-label={`Load ${preset.label} preset`}>
            <span className="scenario-preset__icon"><FontAwesomeIcon icon={presetIcons[preset.id]} aria-hidden="true" /></span>
            <span className="scenario-preset__label">{presetLabels[preset.id]}</span>
          </button>
          <Info label={preset.label} rich><PresetHelp preset={preset} context={context} /></Info>
        </div>
      ))}
    </div>
  );
});

export const ScenarioLibrary = memo(function ScenarioLibrary({ id, open, context, slots, onSaveScenario, onLoadScenario, Info }) {
  const headingId = useId();
  return (
    <section id={id} className="scenario-library" hidden={!open} aria-labelledby={headingId}>
      <div className="scenario-library__heading">
        <div><h3 id={headingId}>Custom scenarios</h3><p>Keep your settings and intervention schedule.</p></div>
        <Info label="Custom scenarios" icon={faLayerGroup} rows={[
          ["Save", "Store the dataset, model settings, seed, and complete intervention schedule."],
          ["Overwrite", "Replace the scenario stored in that slot."],
          ["Load", "Replace current settings and interventions. Switch to the saved dataset before loading."],
        ]} footer="Three slots · Saved in this browser">Keep complete scenarios to revisit and compare.</Info>
      </div>
      <div className="scenario-slot-grid">
        {Array.from({ length: 3 }, (_, index) => <ScenarioSlot key={index} slot={slots[index]} index={index} context={context} onSave={onSaveScenario} onLoad={onLoadScenario} />)}
      </div>
    </section>
  );
});
