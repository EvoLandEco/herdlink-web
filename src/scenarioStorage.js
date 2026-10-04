import { isPrivatePopulation } from "./runtime/simulation-population.js";

export const scenarioStorageKey = "herdlink.scenarios.v1";

export function scenarioSignature(scenario) {
  if (!scenario?.datasetKey || !Array.isArray(scenario.dates) || !scenario.settings ||
    !Array.isArray(scenario.nodeInterventions) || !Array.isArray(scenario.linkInterventions)) return null;
  const objectEntries = (value) => Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  const pair = (entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new Error("Invalid scenario entry.");
    return entry;
  };
  const schedule = (entries, nodes) => entries.map((entry) => {
    const [time, changes] = pair(entry);
    return [time, changes.map((change) => {
      const [id, value] = pair(change);
      return [id, nodes ? objectEntries(value) : value];
    }).sort(([a], [b]) => a.localeCompare(b))];
  }).sort(([a], [b]) => a - b);
  try {
    const settings = scenario.schemaVersion >= 3 ? scenario.settings : { introductionDate: scenario.dates[0]?.slice(0, 10), ...scenario.settings };
    const canonical = (value) => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === "object" ? objectEntries(value).map(([key, item]) => [key, canonical(item)]) : value;
    return JSON.stringify([
      scenario.schemaVersion ?? 1,
      ...(scenario.schemaVersion >= 2 ? [canonical(scenario.provenance)] : [scenario.datasetKey, scenario.dates]),
      canonical(settings),
      schedule(scenario.nodeInterventions, true), schedule(scenario.linkInterventions, false),
    ]);
  } catch {
    return null;
  }
}

export function readScenarioSlots(storage) {
  const stored = storage.getItem(scenarioStorageKey);
  if (stored === null) return [null, null, null];
  const data = JSON.parse(stored);
  if (data?.version !== 1 || !Array.isArray(data.slots) || data.slots.length !== 3 ||
    data.slots.some((slot) => slot !== null && (
      typeof slot?.name !== "string" || !slot.name.trim() || slot.name.length > 48 ||
      typeof slot.savedAt !== "string" || !Number.isFinite(Date.parse(slot.savedAt)) ||
      ![1, 2, 3].includes(slot.scenario?.schemaVersion) || !["daily", "weekly", "monthly", "yearly"].includes(slot.scenario.datasetKey) ||
      !Array.isArray(slot.scenario.dates) || !["SIR", "SIS", "SEIR", "SEIRS"].includes(slot.scenario.settings?.model) ||
      typeof slot.scenario.settings.seedRegion !== "string" || !slot.scenario.settings.seedRegion ||
      !Array.isArray(slot.scenario.nodeInterventions) || !Array.isArray(slot.scenario.linkInterventions)
    ))) {
    throw new Error("Saved scenarios could not be read. Browser storage has an invalid scenario record.");
  }
  return data.slots;
}

export function saveScenarioSlot(storage, index, name, scenario) {
  if (!Number.isInteger(index) || index < 0 || index > 2) throw new Error("Choose one of the three scenario slots.");
  if (isPrivatePopulation(scenario?.settings?.population)) throw new Error("Private populations stay in memory and cannot be saved or exported.");
  if (scenario?.schemaVersion !== 3 || !scenario.settings?.population?.reference ||
    !["absolute-counts", "prevalence-shares"].includes(scenario.settings?.initializationConvention)) throw new Error("Choose a population before saving a scenario.");
  const slots = readScenarioSlots(storage);
  slots[index] = {
    name: String(name || "").trim().slice(0, 48) || `Scenario ${index + 1}`,
    savedAt: new Date().toISOString(),
    scenario,
  };
  if (slots.some((slot) => isPrivatePopulation(slot?.scenario?.settings?.population))) throw new Error("Private populations stay in memory and cannot be saved or exported.");
  storage.setItem(scenarioStorageKey, JSON.stringify({ version: 1, slots }));
  return slots;
}
