import { memo, useEffect, useId, useState } from "react";
import { faBridge, faBullseye, faCheck, faCircleInfo, faClock, faCircleNodes, faFlask, faHourglassHalf, faLayerGroup, faLocationDot, faLockOpen, faNetworkWired, faPause, faRankingStar, faShieldHalved, faSliders } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const presetIcons = {
  "open-trade": faLockOpen,
  "seed-containment": faShieldHalved,
  "partner-ring": faCircleNodes,
  "hub-controls": faNetworkWired,
  "temporary-standstill": faPause,
  "seed-community": faLayerGroup,
  "trade-bottlenecks": faBridge,
};
const presetLabels = {
  "open-trade": "Open",
  "seed-containment": "Seed",
  "partner-ring": "Trace Ring",
  "hub-controls": "Hubs",
  "temporary-standstill": "Standstill",
  "seed-community": "Cordon",
  "trade-bottlenecks": "Bridges",
};
const savedDateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const datasetLabel = (key) => `${key[0].toUpperCase()}${key.slice(1)} trade`;

function ScenarioSlot({ slot, index, context, active, onSave, onLoad }) {
  const [name, setName] = useState(slot?.name || "");
  const inputId = useId();
  const hintId = useId();
  useEffect(() => { setName(slot?.name || ""); }, [slot?.name, slot?.savedAt]);
  const disabled = !context || context.disabled;
  const differentDataset = slot && context && slot.scenario.datasetKey !== context.datasetKey;
  const label = `Scenario ${index + 1}`;

  return (
    <article className={`scenario-slot${slot ? " is-saved" : ""}${active ? " is-active" : ""}`}>
      <div className="scenario-slot__heading">
        <label htmlFor={inputId}><span>{String(index + 1).padStart(2, "0")}</span> {active && <FontAwesomeIcon icon={faCheck} aria-hidden="true" />} {slot ? active ? "Active scenario" : "Saved scenario" : "Empty slot"}</label>
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
    ["Selection", preset.detail, faRankingStar],
    ["Timing", preset.timing, faClock],
    ["Duration", preset.duration, faHourglassHalf],
    ["Availability", preset.disabledReason, faCircleInfo],
  ];
  const notes = (preset.notes || []).filter(Boolean);

  return (
    <span className="preset-help">
      <span className="preset-help__heading">
        <span className="preset-help__icon"><FontAwesomeIcon icon={presetIcons[preset.id]} aria-hidden="true" /></span>
        <span className="preset-help__title"><small className="preset-help__eyebrow">Intervention preset</small><strong>{preset.label}</strong></span>
        <span className="preset-help__delay">{preset.delayDays
          ? <><strong>{preset.delayDays}</strong><small>day delay</small></>
          : <strong>{preset.id === "open-trade" ? "Baseline" : "Immediate"}</strong>}</span>
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
      <span className="preset-help__footer">Replaces interventions · Keeps disease parameters and seed</span>
    </span>
  );
}

export const ScenarioPresets = memo(function ScenarioPresets({ context, activePresetId, onLoadPreset, Info }) {
  const disabled = !context || context.disabled;
  const presets = context?.presets || [];
  return (
    <div className="scenario-presets" role="group" aria-label="Intervention presets">
      <span className="scenario-presets__heading" aria-hidden="true">Presets</span>
      <div className="scenario-presets__buttons">
        {presets.map((preset) => (
          <div key={preset.id} className={`scenario-preset${preset.id === activePresetId ? " is-active" : ""}`}>
            <button type="button" disabled={disabled || Boolean(preset.disabledReason)} aria-pressed={preset.id === activePresetId} onClick={() => onLoadPreset(preset.id)} aria-label={`Load ${preset.label} preset`}>
              <span className="scenario-preset__icon"><FontAwesomeIcon icon={presetIcons[preset.id]} aria-hidden="true" /></span>
              <span className="scenario-preset__label">{presetLabels[preset.id]}</span>
              {preset.id === activePresetId && <FontAwesomeIcon className="scenario-preset__active" icon={faCheck} aria-hidden="true" />}
            </button>
            <Info label={preset.label} rich><PresetHelp preset={preset} context={context} /></Info>
          </div>
        ))}
      </div>
    </div>
  );
});

function PresetSetting({ name, label, shortLabel, inputLabel, value, min, max, unit, detail, icon, rows, disabled, onChange, Info }) {
  const id = useId();
  const [draft, setDraft] = useState(null);
  const step = (amount) => {
    setDraft(null);
    onChange({ [name]: value + amount });
  };
  return (
    <div className="scenario-preset-setting">
      <div className="scenario-preset-setting__label">
        <label htmlFor={id}>
          <span className="scenario-preset-setting__label-full">{label}</span>
          <span className="scenario-preset-setting__label-short" aria-hidden="true">{shortLabel}</span>
        </label>
        <Info label={label} icon={icon} rows={rows} footer="Applies the next time you load a preset.">{detail}</Info>
      </div>
      <div className="scenario-preset-setting__value">
        <div className="scenario-preset-stepper">
          <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} aria-controls={id}
            disabled={disabled || value <= min} onClick={() => step(-1)}><span aria-hidden="true">−</span></button>
          <input id={id} type="number" aria-label={inputLabel} aria-describedby={`${id}-help`}
            value={draft ?? value} min={min} max={max} step={1} disabled={disabled}
            onBlur={() => setDraft(null)} onChange={(event) => {
              setDraft(event.target.value);
              if (event.target.value && event.target.validity.valid) onChange({ [name]: event.target.valueAsNumber });
            }} />
          <button type="button" aria-label={`Increase ${label.toLowerCase()}`} aria-controls={id}
            disabled={disabled || value >= max} onClick={() => step(1)}><span aria-hidden="true">+</span></button>
        </div>
        {unit && <span>{unit}</span>}
      </div>
      <p id={`${id}-help`} className="visually-hidden">{detail}</p>
    </div>
  );
}

export const ScenarioLibrary = memo(function ScenarioLibrary({ id, panelRef, open, context, slots, activeSlot, onChangePresetSettings, onSaveScenario, onLoadScenario, Info }) {
  const headingId = useId();
  const settings = context?.presetSettings;
  const disabled = !context || context.disabled;
  return (
    <section ref={panelRef} id={id} className="scenario-library" hidden={!open} aria-labelledby={headingId}>
      <div className="scenario-library__heading">
        <h3 id={headingId}>Custom scenarios</h3>
        <Info label="Custom scenarios" icon={faLayerGroup} rows={[
          ["Preset settings", "Choose the target count and response timing, then load a preset from the buttons above."],
          ["Save", "Store the dataset, model settings, seed, and complete intervention schedule."],
          ["Overwrite", "Replace the scenario stored in that slot."],
          ["Load", "Replace current settings and interventions. Switch to the saved dataset before loading."],
        ]} footer="Three slots · Saved in this browser">Keep complete scenarios to revisit and compare.</Info>
      </div>
      {settings && <fieldset className="scenario-preset-settings" aria-describedby={`${headingId}-preset-help`}>
        <legend className="visually-hidden">Preset settings</legend>
        <p id={`${headingId}-preset-help`} className="visually-hidden">Choose settings for the next preset you load.</p>
        <div className="scenario-preset-settings__row">
          <PresetSetting name="targetBudget" label="Target regions" shortLabel="Targets" inputLabel="Target regions for Hubs and Bridges"
            value={settings.targetBudget} min={1} max={40} detail="Hubs and Bridges share this target count." icon={faRankingStar}
            rows={[
              ["Selection", "Ranked from the preceding year's trade."],
              ["Range", "1–40 regions with outgoing trade."],
            ]} disabled={disabled} onChange={onChangePresetSettings} Info={Info} />
          <PresetSetting name="responseDays" label="Response delay" shortLabel="Delay" inputLabel="Response delay in days"
            value={settings.responseDays} min={0} max={365} unit="days" detail="Days from introduction to intervention." icon={faClock}
            rows={[
              ["Scope", "All six intervention presets."],
              ["Range", "0–365; 0 starts at introduction."],
            ]} disabled={disabled} onChange={onChangePresetSettings} Info={Info} />
          <PresetSetting name="standstillDays" label="Standstill duration" shortLabel="Standstill" inputLabel="Standstill duration in days"
            value={settings.standstillDays} min={1} max={365} unit="days" detail="Duration of national export restrictions." icon={faHourglassHalf}
            rows={[
              ["Timing", "Starts at response; ends with reopening."],
              ["Range", "1–365 days."],
            ]} disabled={disabled} onChange={onChangePresetSettings} Info={Info} />
        </div>
      </fieldset>}
      <h4 className="scenario-library__saved-heading">Saved scenarios</h4>
      <div className="scenario-slot-grid">
        {Array.from({ length: 3 }, (_, index) => <ScenarioSlot key={index} slot={slots[index]} index={index} context={context} active={activeSlot === index} onSave={onSaveScenario} onLoad={onLoadScenario} />)}
      </div>
    </section>
  );
});
