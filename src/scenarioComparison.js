export const comparisonSets = [
  { id: "strategies", label: "Strategies", detail: "Open · Seed · Trace Ring", presets: ["open-trade", "seed-containment", "partner-ring"] },
  { id: "targets", label: "Target counts", detail: "1 · 3 · 5 hubs", presets: ["hub-controls", "hub-controls", "hub-controls"], field: "targetBudget", values: [1, 3, 5] },
  { id: "delays", label: "Response delays", detail: "1 · 7 · 14 days", presets: ["seed-containment", "seed-containment", "seed-containment"], field: "responseDays", values: [1, 7, 14] },
  { id: "durations", label: "Pause duration", detail: "7 · 14 · 28 days", presets: ["temporary-standstill", "temporary-standstill", "temporary-standstill"], field: "standstillDays", values: [7, 14, 28] },
];

export function comparisonConfigurations(id, settings) {
  const set = comparisonSets.find((entry) => entry.id === id);
  if (!set) throw new Error("Choose a comparison set.");
  return set.presets.map((presetId, index) => ({
    presetId, targetBudget: settings.targetBudget, responseDays: settings.responseDays, standstillDays: settings.standstillDays,
    ...(set.field ? { [set.field]: set.values[index] } : {}),
  }));
}
