export const scenarioStorageKey = "herdlink.scenarios.v1";

export function readScenarioSlots(storage) {
  const stored = storage.getItem(scenarioStorageKey);
  if (stored === null) return [null, null, null];
  const data = JSON.parse(stored);
  if (data?.version !== 1 || !Array.isArray(data.slots) || data.slots.length !== 3 ||
    data.slots.some((slot) => slot !== null && (
      typeof slot?.name !== "string" || !slot.name.trim() || slot.name.length > 48 ||
      typeof slot.savedAt !== "string" || !Number.isFinite(Date.parse(slot.savedAt)) ||
      slot.scenario?.schemaVersion !== 1 || !["daily", "weekly", "monthly", "yearly"].includes(slot.scenario.datasetKey) ||
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
  const slots = readScenarioSlots(storage);
  slots[index] = {
    name: String(name || "").trim().slice(0, 48) || `Scenario ${index + 1}`,
    savedAt: new Date().toISOString(),
    scenario,
  };
  storage.setItem(scenarioStorageKey, JSON.stringify({ version: 1, slots }));
  return slots;
}
