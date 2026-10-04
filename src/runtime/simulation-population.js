const dayMs = 86400000;

export async function hashSimulationContent(text) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function estimateSyntheticHoldings(ids, totals) {
  const scores = ids.map((id) => {
    const value = totals.has(id) ? totals.get(id) : 0;
    if (!Number.isFinite(value) || value < 0) throw new Error("Population activity must be finite and nonnegative.");
    return Math.log1p(value);
  });
  const positive = scores.filter((score) => score > 0);
  const min = positive.length ? Math.min(...positive) : 0;
  const span = positive.length ? Math.max(...positive) - min : 0;
  return new Map(ids.map((id, index) => [id,
    Math.round(450 + (scores[index] > 0 && span > 0 ? (scores[index] - min) / span : 0) * 9550),
  ]));
}

export function estimateSyntheticPopulation({ ids, data, introductionDate }) {
  const end = Date.parse(introductionDate);
  if (typeof introductionDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(introductionDate) ||
    !Number.isFinite(end) || new Date(end).toISOString().slice(0, 10) !== introductionDate) {
    throw new Error("Population reference date must be a valid calendar date.");
  }
  const totals = new Map(ids.map((id) => [id, 0]));
  for (const row of data) {
    const time = row.time?.getTime();
    if (!Number.isFinite(time)) throw new Error("Population history contains an invalid date.");
    if (time < end - 365 * dayMs || time >= end) continue;
    const { COROP_LEV: source, COROP_AFN: target } = row;
    if (!source || !target || source.toUpperCase() === "NA" || target.toUpperCase() === "NA") continue;
    if (typeof row.AANTAL !== "number" && (typeof row.AANTAL !== "string" || !row.AANTAL.trim())) {
      throw new Error("Population history contains an invalid movement count.");
    }
    const weight = Number(row.AANTAL);
    if (!Number.isFinite(weight) || weight < 0) throw new Error("Population history contains an invalid movement count.");
    if (!totals.has(source) || !totals.has(target)) throw new Error("Population history contains an unknown region.");
    totals.set(source, totals.get(source) + weight);
    totals.set(target, totals.get(target) + 0.7 * weight);
  }
  return Object.fromEntries(estimateSyntheticHoldings(ids, totals));
}

export function createSyntheticPopulationSnapshot(input) {
  const reference = syntheticReference(input.id || "historical-trade-log-scale-v1", input.introductionDate, input.geographyVersion || "COROP");
  return {
    kind: "synthetic",
    scenarioId: "reference",
    unit: "synthetic-model-units",
    sourceId: "historical-trade-log-scale-v1",
    referenceTime: input.introductionDate,
    historyStart: new Date(Date.parse(input.introductionDate) - 365 * dayMs).toISOString().slice(0, 10),
    geography: "COROP",
    values: estimateSyntheticPopulation(input),
    reference,
    historyCoverage: input.historyCoverage || null,
  };
}

const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function date(value) {
  if (!nonempty(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error("Population dates must be valid calendar dates.");
  }
  return value;
}

function regionIds(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => !nonempty(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Population regions must be distinct nonempty identifiers.");
  }
  return [...ids].sort();
}

function validateValues(values, ids) {
  const expected = regionIds(ids);
  if (!plain(values) || JSON.stringify(Object.keys(values).sort()) !== JSON.stringify(expected)) {
    throw new Error("Population values must cover every region exactly once.");
  }
  if (Object.values(values).some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0) ||
      !Number.isFinite(Object.values(values).reduce((sum, value) => sum + value, 0))) {
    throw new Error("Population values must be finite and nonnegative.");
  }
  return Object.fromEntries(expected.map((id) => [id, values[id]]));
}

function syntheticReference(id, referenceTime, geographyVersion) {
  return {
    id, measure: "synthetic-model-units", countUnit: "model-unit",
    timeReference: { kind: "instant", date: date(referenceTime) },
    geographicAttribution: "synthetic-region", geographyVersion,
    eligibilityDefinitionId: "synthetic-regions", sourceDefinitionId: id,
    publicationDate: null, availableFrom: null, uncertaintyBasis: "none-quantified", accessClass: "public",
  };
}

export function createDeclaredSyntheticPopulationSnapshot({ ids, values, id = "declared-synthetic", referenceTime = "2000-01-01", geographyVersion = "COROP" }) {
  if (!nonempty(id) || !nonempty(geographyVersion)) throw new Error("Synthetic population references require identifiers.");
  return {
    kind: "synthetic", scenarioId: "reference", unit: "synthetic-model-units", sourceId: id,
    referenceTime, geography: "COROP", values: validateValues(values, ids),
    reference: syntheticReference(id, referenceTime, geographyVersion),
  };
}

function validateReference(reference, inventory) {
  if (!plain(reference) || !nonempty(reference.id) || !nonempty(reference.geographyVersion)) {
    throw new Error("Population reference identifiers are required.");
  }
  if (!["public", "private"].includes(reference.accessClass)) throw new Error("Population access class is required.");
  const time = reference.timeReference;
  if (!plain(time)) throw new Error("Population reference time is required.");
  if (time.kind === "instant") date(time.date);
  else if (time.kind === "period") {
    if (date(time.start) >= date(time.endExclusive)) throw new Error("Population reference period must have positive duration.");
  } else throw new Error("Population reference time has an unsupported kind.");
  if (reference.movementGeography !== undefined && !nonempty(reference.movementGeography)) throw new Error("Population movement geography must be a nonempty identifier.");
  for (const key of ["sourceDefinitionId", "eligibilityDefinitionId", "uncertaintyBasis"]) {
    if (reference[key] !== undefined && !nonempty(reference[key])) throw new Error("Population reference metadata must use nonempty identifiers.");
  }
  for (const key of ["publicationDate", "availableFrom"]) {
    if (reference[key] !== undefined && reference[key] !== null) date(reference[key]);
  }
  if (reference.assumptionPeriod !== undefined) {
    const period = reference.assumptionPeriod;
    if (!plain(period) || !nonempty(period.reason) || date(period.start) >= date(period.endExclusive)) {
      throw new Error("Population assumption periods require dates and a reason.");
    }
  }
  if (inventory) {
    if (!["point-occupied-stock", "period-mean-occupied-stock"].includes(reference.measure) || reference.countUnit !== "animal") {
      throw new Error("Animal population products must describe occupied stock.");
    }
    if ((reference.measure === "point-occupied-stock") !== (time.kind === "instant")) throw new Error("Population measure and reference time do not agree.");
    if (!["animal-site", "business-main-address"].includes(reference.geographicAttribution) ||
      !["assumption-based-reference", "qualified-source"].includes(reference.evidence) || !Array.isArray(reference.assumptions) ||
      reference.assumptions.some((assumption) => !nonempty(assumption)) ||
      (reference.evidence === "assumption-based-reference" && !reference.assumptions.length)) {
      throw new Error("Animal population products require attribution and documented assumptions.");
    }
  } else if (reference.measure !== "synthetic-model-units" || reference.countUnit !== "model-unit" ||
      reference.geographicAttribution !== "synthetic-region" || reference.accessClass !== "public") {
    throw new Error("Synthetic populations must retain synthetic units and attribution.");
  }
}

function projectReference(reference, inventory) {
  validateReference(reference, inventory);
  const fields = ["id", "measure", "countUnit", "publicationDate", "availableFrom", "geographicAttribution", "geographyVersion", "movementGeography", "eligibilityDefinitionId", "sourceDefinitionId", "uncertaintyBasis", "accessClass"];
  if (inventory) fields.push("evidence", "assumptions");
  const result = Object.fromEntries(fields.filter((key) => reference[key] !== undefined).map((key) => [key, reference[key]]));
  const time = reference.timeReference;
  result.timeReference = time.kind === "instant" ? { kind: "instant", date: time.date } : { kind: "period", start: time.start, endExclusive: time.endExclusive };
  if (reference.assumptionPeriod) {
    const { start, endExclusive, reason } = reference.assumptionPeriod;
    result.assumptionPeriod = { start, endExclusive, reason };
  }
  return result;
}

export function isPrivatePopulation(snapshot) {
  return snapshot?.reference?.accessClass === "private";
}

export function validatePopulationSnapshot(snapshot, ids, { values, movementGeography } = {}) {
  if (!plain(snapshot) || !["synthetic", "fixed-animal-inventory"].includes(snapshot.kind) || !nonempty(snapshot.scenarioId)) {
    throw new Error("A population snapshot and scenario identifier are required.");
  }
  const inventory = snapshot.kind === "fixed-animal-inventory";
  const reference = projectReference(snapshot.reference, inventory);
  const normalizedValues = validateValues(snapshot.values, ids);
  if (values !== undefined && JSON.stringify(validateValues(values, ids)) !== JSON.stringify(normalizedValues)) {
    throw new Error("Population snapshot does not match the run population values.");
  }
  if (movementGeography !== undefined && (snapshot.reference.movementGeography || snapshot.reference.geographyVersion) !== movementGeography) {
    throw new Error("Population and movement geography definitions do not match.");
  }
  if (snapshot.sourceId !== snapshot.reference.id || snapshot.unit !== (inventory ? "animals" : "synthetic-model-units")) {
    throw new Error("Population source and unit must match its reference.");
  }
  if (snapshot.referenceTime !== (snapshot.reference.timeReference.date || snapshot.reference.timeReference.start)) {
    throw new Error("Population reference date does not match its source definition.");
  }
  if (snapshot.admission !== undefined) throw new Error("Population snapshots contain the final product, without preparation records.");
  const result = {
    kind: snapshot.kind, scenarioId: snapshot.scenarioId, unit: snapshot.unit, sourceId: snapshot.sourceId,
    referenceTime: snapshot.referenceTime, geography: snapshot.geography, values: normalizedValues, reference,
  };
  if (snapshot.geography !== undefined && !nonempty(snapshot.geography)) throw new Error("Population geography must be a nonempty identifier.");
  if (snapshot.sourceHash !== undefined) {
    if (!nonempty(snapshot.sourceHash)) throw new Error("Population source hash must be a nonempty identifier.");
    result.sourceHash = snapshot.sourceHash;
  }
  if (!inventory) {
    if (snapshot.historyStart !== undefined) result.historyStart = date(snapshot.historyStart);
    if (snapshot.historyCoverage === null) result.historyCoverage = null;
    else if (snapshot.historyCoverage !== undefined) {
      const coverage = snapshot.historyCoverage;
      if (!plain(coverage) || date(coverage.start) >= date(coverage.endExclusive)) throw new Error("Population history coverage must have positive duration.");
      result.historyCoverage = { start: coverage.start, endExclusive: coverage.endExclusive };
    }
  }
  return structuredClone(result);
}

export function selectPopulationScenario(product, id) {
  if (!plain(product) || product.schemaVersion !== 1 || product.kind !== "population-product" || !Array.isArray(product.scenarios) || !product.scenarios.length ||
      product.scenarios.some((scenario) => !plain(scenario) || !plain(scenario.values))) {
    throw new Error("Select a valid population product.");
  }
  const reference = projectReference(product.reference, true);
  const ids = regionIds(product.regionIds || Object.keys(product.scenarios[0].values || {}));
  if (new Set(product.scenarios.map((scenario) => scenario.id)).size !== product.scenarios.length) {
    throw new Error("Population scenarios require distinct identifiers.");
  }
  const snapshots = product.scenarios.map((scenario) => validatePopulationSnapshot({
    kind: "fixed-animal-inventory", scenarioId: scenario.id, unit: "animals", sourceId: reference.id,
    referenceTime: reference.timeReference.date || reference.timeReference.start,
    geography: "COROP", values: scenario.values, reference,
  }, ids));
  const selected = snapshots.find((snapshot) => snapshot.scenarioId === id);
  if (!selected) throw new Error("Select an available population scenario.");
  return selected;
}

export const selectInventoryScenario = selectPopulationScenario;
