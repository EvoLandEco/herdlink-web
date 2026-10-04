import { validatePopulationSnapshot } from "./simulation-population.js";

const DAY = 86400000;
const MODELS = new Set(["SIR", "SIS", "SEIR", "SEIRS"]);
const METRICS = ["inDegree", "outDegree", "betweenness", "pageRank", "eigenvector"];
const FIELDS = ["engine", "model", "seedRegion", "introductionDate", "holdings", "population", "initializationConvention", "initialStates", "initialPct", "initialExposedPct", "initialRecoveredPct", "beta", "movementBeta", "sigma", "gamma", "omega"];
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Map) && !(value instanceof Date);
const linkKey = (source, target) => `${source}-${target}`;

function finite(value, name, min = 0, max = Infinity) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a finite number between ${min} and ${max}.`);
  }
  return value;
}

function dayTime(value, name) {
  const time = value instanceof Date ? value.getTime() : value;
  if (!Number.isSafeInteger(time) || Math.abs(time) > 8640000000000000 || time % DAY !== 0) {
    throw new Error(`${name} must be a valid UTC midnight.`);
  }
  return time;
}

function exactKeys(value, keys, name) {
  if (!object(value) || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))) {
    throw new Error(`${name} must contain exactly ${keys.join(", ")}.`);
  }
}

function validateState(state, N, name) {
  for (const key of ["S", "E", "I", "R"]) finite(state[key], `${name}.${key}`);
  if (!Number.isFinite(state.S + state.E + state.I + state.R) ||
      Math.abs(state.S + state.E + state.I + state.R - N) > 1e-10 * N) {
    throw new Error(`${name} must conserve its declared population.`);
  }
}

export function validateSimulationSettings(settings, ids, { requirePopulation = true } = {}) {
  if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== "string" || !id || id.includes("-") || id.toUpperCase() === "NA")) {
    throw new Error("Simulation regions must be distinct nonempty identifiers without hyphens.");
  }
  if (!object(settings) || Object.keys(settings).some((key) => !FIELDS.includes(key))) {
    throw new Error("Simulation settings contain unsupported fields.");
  }
  if (!MODELS.has(settings.model) || !ids.includes(settings.seedRegion)) {
    throw new Error("The simulation model or seed region is invalid.");
  }
  if (settings.engine !== undefined && settings.engine !== "daily-contact-v1") {
    throw new Error("The simulation engine must be daily-contact-v1.");
  }
  if (!["absolute-counts", "prevalence-shares"].includes(settings.initializationConvention)) {
    throw new Error("Declare initialization as absolute-counts or prevalence-shares.");
  }
  const introduction = settings.introductionDate;
  if (typeof introduction !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(introduction) ||
      !Number.isFinite(Date.parse(introduction)) || new Date(introduction).toISOString().slice(0, 10) !== introduction) {
    throw new Error("The introduction date must be an ISO calendar day.");
  }
  const normalized = { ...settings, engine: "daily-contact-v1",
    initialExposedPct: settings.initialExposedPct === undefined ? 0 : settings.initialExposedPct,
    initialRecoveredPct: settings.initialRecoveredPct === undefined ? 0 : settings.initialRecoveredPct,
    omega: settings.omega === undefined ? 0.02 : settings.omega };
  for (const key of ["beta", "movementBeta"]) finite(normalized[key], key);
  for (const key of ["sigma", "gamma", "omega"]) finite(normalized[key], key, 0, 1);
  for (const key of ["initialPct", "initialExposedPct", "initialRecoveredPct"]) finite(normalized[key], key, 0, 100);
  if (normalized.initialPct + normalized.initialExposedPct + normalized.initialRecoveredPct > 100) {
    throw new Error("Initial compartment percentages must sum to at most 100.");
  }
  const exposed = settings.model === "SEIR" || settings.model === "SEIRS";
  if ((!exposed && normalized.initialExposedPct !== 0) ||
      (settings.model === "SIS" && normalized.initialRecoveredPct !== 0)) {
    throw new Error("Initial compartments must match the selected model.");
  }
  if (requirePopulation || settings.holdings !== undefined || settings.population !== undefined) {
    exactKeys(settings.holdings, ids, "Model population");
    normalized.holdings = Object.fromEntries(ids.map((id) => {
      const value = finite(settings.holdings[id], `Model population for ${id}`);
      return [id, value];
    }));
    normalized.population = validatePopulationSnapshot(settings.population, ids, { values: normalized.holdings });
  }
  if ((settings.initializationConvention === "absolute-counts") !== (settings.initialStates !== undefined)) {
    throw new Error("Absolute-counts initialization requires explicit initial states; prevalence-shares uses percentages.");
  }
  if (settings.initialStates !== undefined) {
    if (!normalized.holdings) throw new Error("Explicit initial states require a model population.");
    if (normalized.initialPct + normalized.initialExposedPct + normalized.initialRecoveredPct !== 0) {
      throw new Error("Use explicit initial states or initial percentages, not both.");
    }
    exactKeys(settings.initialStates, ids, "Initial states");
    normalized.initialStates = Object.fromEntries(ids.map((id) => {
      const state = settings.initialStates[id];
      exactKeys(state, ["S", "E", "I", "R"], `Initial state for ${id}`);
      validateState(state, normalized.holdings[id], `Initial state for ${id}`);
      if ((!exposed && state.E !== 0) || (settings.model === "SIS" && state.R !== 0)) {
        throw new Error(`Initial compartments for ${id} must match the selected model.`);
      }
      return [id, { ...state }];
    }));
  }
  return normalized;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function validateSimulationSchedules({ ids, dates, nodeInterventions = new Map(), linkInterventions = new Map() }) {
  if (!Array.isArray(dates) || !dates.length) throw new Error("Restriction validation requires a daily observation calendar.");
  const times = dates.map((date) => dayTime(date, "Observation date"));
  if (times.some((time, index) => index > 0 && time !== times[index - 1] + DAY)) {
    throw new Error("Restriction dates require a complete daily observation calendar.");
  }
  const start = times[0], end = times.at(-1) + DAY, roster = new Set(ids);
  const routeKeys = new Set(ids.flatMap((source) => ids.map((target) => linkKey(source, target))));
  for (const [name, schedule] of [["Node", nodeInterventions], ["Route", linkInterventions]]) {
    if (!(schedule instanceof Map)) throw new Error(`${name} restrictions must be a Map.`);
    for (const [time, changes] of schedule) {
      dayTime(time, `${name} restriction date`);
      if (!(changes instanceof Map) || !changes.size) throw new Error(`${name} restrictions must contain changes.`);
      if (name === "Route" && (time < start || time >= end)) {
        throw new Error("One-day route restrictions must fall within daily observation coverage.");
      }
      for (const [id, value] of changes) {
        if (name === "Route") {
          if (!routeKeys.has(id) || value !== true) throw new Error("A route restriction is invalid.");
        } else if (!roster.has(id) || !object(value) || !Object.keys(value).length ||
          Object.keys(value).some((key) => !["imports", "exports"].includes(key) || typeof value[key] !== "boolean")) {
          throw new Error("A regional movement permission is invalid.");
        }
      }
    }
  }
  return { nodeInterventions, linkInterventions };
}

function prepareInputs({ settings, data, dates, ids, movementGeography, nodeInterventions = new Map(), linkInterventions = new Map() }) {
  settings = validateSimulationSettings(settings, ids);
  if (movementGeography === undefined) movementGeography = settings.population.reference.movementGeography || settings.population.reference.geographyVersion;
  if (typeof movementGeography !== "string" || !movementGeography.trim()) {
    throw new Error("The movement ledger must declare its geography version.");
  }
  validatePopulationSnapshot(settings.population, ids, { values: settings.holdings, movementGeography });
  ids = [...ids].sort();
  if (!Array.isArray(dates) || !dates.length) throw new Error("A complete daily observation calendar is required.");
  const times = dates.map((date) => dayTime(date, "Observation date"));
  if (times.some((time, index) => index > 0 && time !== times[index - 1] + DAY)) {
    throw new Error("Daily observation dates must be consecutive; missing days cannot be assumed to have zero movement.");
  }
  const start = times[0], end = times.at(-1) + DAY;
  dayTime(end, "Observation coverage end");
  if (Date.parse(settings.introductionDate) < start || Date.parse(settings.introductionDate) >= end) {
    throw new Error("The introduction date must fall within daily observation coverage.");
  }
  if (!Array.isArray(data)) throw new Error("The daily movement ledger must be an array.");
  const roster = new Set(ids);
  const ledger = new Map(times.map((time) => [time, []]));
  for (const row of data) {
    const source = row.COROP_LEV, target = row.COROP_AFN;
    if (!source || !target || String(source).toUpperCase() === "NA" || String(target).toUpperCase() === "NA") continue;
    const time = dayTime(row.time, "Movement date");
    if (time < start || time >= end) continue;
    if (!roster.has(source) || !roster.has(target)) throw new Error("A movement endpoint is missing from the model population.");
    const weight = typeof row.AANTAL === "string" && row.AANTAL.trim() ? Number(row.AANTAL) : row.AANTAL;
    finite(weight, "Movement weight");
    if (weight === 0) throw new Error("Movement weights must be positive.");
    if (settings.holdings[source] === 0 || settings.holdings[target] === 0) {
      throw new Error("A positive movement involves a zero-stock region. Reconcile its resident or transit role before simulation.");
    }
    ledger.get(time).push({ source, target, weight });
  }
  for (const [time, rows] of ledger) {
    rows.sort((a, b) => a.source.localeCompare(b.source) || a.target.localeCompare(b.target) || a.weight - b.weight);
    const routes = new Map();
    for (const row of rows) {
      const key = linkKey(row.source, row.target);
      const existing = routes.get(key);
      if (existing) existing.weight = finite(existing.weight + row.weight, "Daily route weight");
      else routes.set(key, { ...row });
    }
    ledger.set(time, [...routes.values()]);
  }
  validateSimulationSchedules({ ids, dates: times, nodeInterventions, linkInterventions });
  const sortedSchedule = (schedule) => [...schedule].sort(([a], [b]) => a - b)
    .map(([time, changes]) => [time, [...changes].sort(([a], [b]) => a.localeCompare(b))]);
  const identity = JSON.stringify(canonical({ settings, movementGeography, ids: [...ids].sort(), times, ledger: [...ledger],
    nodeInterventions: sortedSchedule(nodeInterventions), linkInterventions: sortedSchedule(linkInterventions) }));
  return { settings, ids, times, ledger, start, end, movementGeography, nodeInterventions, linkInterventions, identity };
}

export function simulationInputKey(inputs) {
  return prepareInputs(inputs).identity;
}

function decorateState(state, { incoming = 0, outgoing = 0, newInfections = 0, cumulativeInfections = 0, startI = state.I, contactInfections = 0, movementInfections = 0 } = {}) {
  const rtProxy = startI > 0 ? outgoing / startI : null;
  const result = { ...state, prevalence: state.N > 0 ? state.I / state.N : null, exposedShare: state.N > 0 ? state.E / state.N : null,
    recoveredShare: state.N > 0 ? state.R / state.N : null, incomingExposure: incoming, outgoingPressure: outgoing,
    newInfections, cumulativeInfections, contactInfections, movementInfections, startI, rtProxy };
  for (const [key, value] of Object.entries(result)) {
    if (value !== null) finite(value, `Simulation output ${key}`);
  }
  return result;
}

function makeFrame(time, intervalEnd, nodeStates, linkStates, seedIds) {
  const summary = { S: 0, E: 0, I: 0, R: 0, N: 0, newInfections: 0, cumulativeInfections: 0, contactInfections: 0, movementInfections: 0 };
  const nodeMetrics = {};
  for (const [id, state] of Object.entries(nodeStates)) {
    for (const key of Object.keys(summary)) summary[key] += state[key];
    nodeMetrics[id] = { inDegree: state.incomingExposure, outDegree: state.outgoingPressure,
      betweenness: state.prevalence, pageRank: state.I, eigenvector: state.rtProxy };
  }
  for (const [key, value] of Object.entries(summary)) finite(value, `Simulation total ${key}`);
  summary.prevalence = summary.N > 0 ? summary.I / summary.N : null;
  summary.exposedShare = summary.N > 0 ? summary.E / summary.N : null;
  summary.recoveredShare = summary.N > 0 ? summary.R / summary.N : null;
  return { date: new Date(time), key: new Date(time).toISOString(), intervalEnd: new Date(intervalEnd),
    nodeStates, linkStates, nodeMetrics, summary, seedIds };
}

function trajectoryFields(frames) {
  const metricMax = Object.fromEntries(METRICS.map((metric) => {
    let max = 0;
    for (const frame of frames) for (const node of Object.values(frame.nodeMetrics)) {
      if (node[metric] !== null) max = Math.max(max, node[metric]);
    }
    return [metric, max || 1];
  }));
  return { frames, frameByKey: Object.fromEntries(frames.map((frame) => [frame.key, frame])), metricMax };
}

export function simulateDaily(inputs) {
  const prepared = prepareInputs(inputs);
  const { settings, ids, times, ledger, start, end, movementGeography, nodeInterventions, linkInterventions, identity } = prepared;
  const holdings = new Map(ids.map((id) => [id, settings.holdings[id]]));
  const seedIds = settings.initialStates ? ids.filter((id) => settings.initialStates[id].E + settings.initialStates[id].I > 0) :
    settings.holdings[settings.seedRegion] > 0 && settings.initialPct + settings.initialExposedPct > 0 ? [settings.seedRegion] : [];
  let current = new Map(ids.map((id) => [id, { S: holdings.get(id), E: 0, I: 0, R: 0, N: holdings.get(id) }]));
  const cumulative = new Map(ids.map((id) => [id, 0]));
  const permissions = new Map();
  const events = [...nodeInterventions].sort(([a], [b]) => a - b);
  const frames = [], boundaryIndices = [];
  let eventIndex = 0, initialFrame, previousRestrictions;
  const exposed = settings.model === "SEIR" || settings.model === "SEIRS";
  for (const [frameIndex, time] of times.entries()) {
    if (time === Date.parse(settings.introductionDate)) {
      for (const id of ids) {
        const state = current.get(id);
        if (settings.initialStates) Object.assign(state, settings.initialStates[id]);
        else if (id === settings.seedRegion) {
          state.I = state.N * (settings.initialPct / 100);
          state.E = state.N * (settings.initialExposedPct / 100);
          state.R = state.N * (settings.initialRecoveredPct / 100);
          state.S = state.N * ((100 - (settings.initialPct + settings.initialExposedPct + settings.initialRecoveredPct)) / 100);
        }
        validateState(state, state.N, `Initial state for ${id}`);
      }
      initialFrame = makeFrame(time, time, Object.fromEntries(ids.map((id) => [id, decorateState(current.get(id))])), new Map(), seedIds);
    }
    while (eventIndex < events.length && events[eventIndex][0] <= time) {
      for (const [id, changes] of events[eventIndex++][1]) {
        permissions.set(id, { ...permissions.get(id), ...changes });
      }
    }
    const disabled = linkInterventions.get(time);
    const disabledRoutes = new Set(disabled?.keys());
    for (const source of ids) for (const target of ids) {
      if (source !== target && (permissions.get(source)?.exports === false || permissions.get(target)?.imports === false)) {
        disabledRoutes.add(linkKey(source, target));
      }
    }
    const restrictionKey = JSON.stringify([...disabledRoutes].sort());
    if (frameIndex > 0 && restrictionKey !== previousRestrictions) boundaryIndices.push(frameIndex);
    previousRestrictions = restrictionKey;
    const linkStates = new Map();
    const incoming = new Map(ids.map((id) => [id, 0])), outgoing = new Map(ids.map((id) => [id, 0]));
    const movement = new Map(ids.map((id) => [id, 0]));
    for (const row of ledger.get(time)) {
      const key = linkKey(row.source, row.target), local = row.source === row.target;
      if (disabled?.has(key) || (!local && (permissions.get(row.source)?.exports === false || permissions.get(row.target)?.imports === false))) continue;
      const source = current.get(row.source), target = current.get(row.target);
      const pressure = finite(row.weight * (source.I / source.N) * settings.movementBeta, "Movement pressure");
      const hazard = finite(pressure / target.N, "Movement hazard");
      linkStates.set(key, { source: row.source, target: row.target, local, ledgerWeight: row.weight,
        movementPressure: pressure, movementHazard: hazard, contactHazard: 0,
        movementAttributedInfections: 0, contactAttributedInfections: 0, attributedInfections: 0, riskLoad: 0,
        sourcePrevalence: source.I / source.N, targetPrevalence: target.I / target.N });
      movement.set(row.target, finite(movement.get(row.target) + pressure, "Incoming movement pressure"));
      if (!local) {
        incoming.set(row.target, finite(incoming.get(row.target) + pressure, "External incoming movement pressure"));
        outgoing.set(row.source, finite(outgoing.get(row.source) + pressure, "External outgoing movement pressure"));
      }
    }
    const next = new Map(), nodeStates = {}, incidenceByNode = new Map(), hazardByNode = new Map();
    for (const id of ids) {
      const state = current.get(id);
      if (state.N === 0) {
        nodeStates[id] = decorateState(state);
        incidenceByNode.set(id, 0);
        hazardByNode.set(id, 0);
        next.set(id, { ...state });
        continue;
      }
      const localHazard = finite(settings.beta * (state.I / state.N), "Contact hazard");
      const hazard = finite(localHazard + movement.get(id) / state.N, "Total infection hazard");
      const entering = finite(state.S * -Math.expm1(-hazard), "Incident infection entries");
      const toInfectious = exposed ? state.E * settings.sigma : entering;
      const recovered = state.I * settings.gamma;
      const waning = settings.model === "SIS" ? recovered : settings.model === "SEIRS" ? state.R * settings.omega : 0;
      const result = { S: state.S - entering + waning, E: exposed ? state.E * (1 - settings.sigma) + entering : 0,
        I: state.I * (1 - settings.gamma) + toInfectious,
        R: settings.model === "SIS" ? 0 : state.R * (settings.model === "SEIRS" ? 1 - settings.omega : 1) + recovered, N: state.N };
      validateState(result, state.N, `State for ${id} on ${new Date(time).toISOString()}`);
      const contactInfections = hazard > 0 ? entering * (localHazard / hazard) : 0;
      const movementInfections = hazard > 0 ? entering * ((movement.get(id) / state.N) / hazard) : 0;
      cumulative.set(id, finite(cumulative.get(id) + entering, "Cumulative incident entries"));
      nodeStates[id] = decorateState(result, { incoming: incoming.get(id), outgoing: outgoing.get(id),
        newInfections: entering, cumulativeInfections: cumulative.get(id), startI: state.I, contactInfections, movementInfections });
      incidenceByNode.set(id, entering);
      hazardByNode.set(id, hazard);
      next.set(id, result);
      if (localHazard > 0) {
        const key = linkKey(id, id);
        const local = linkStates.get(key) || { source: id, target: id, local: true, ledgerWeight: 0,
          movementPressure: 0, movementHazard: 0, movementAttributedInfections: 0,
          sourcePrevalence: state.I / state.N, targetPrevalence: state.I / state.N };
        Object.assign(local, { contactHazard: localHazard, contactAttributedInfections: contactInfections });
        linkStates.set(key, local);
      }
    }
    for (const link of linkStates.values()) {
      const hazard = hazardByNode.get(link.target);
      link.movementAttributedInfections = hazard > 0 ? incidenceByNode.get(link.target) * (link.movementHazard / hazard) : 0;
      link.attributedInfections = finite(link.movementAttributedInfections + link.contactAttributedInfections, "Attributed infection entries");
      link.riskLoad = link.attributedInfections;
    }
    current = next;
    frames.push(makeFrame(time, time + DAY, nodeStates, linkStates, seedIds));
  }
  return { settings, ids: [...ids], holdings, movementGeography, seedIds, ...trajectoryFields(frames), boundaryIndices, initialFrame,
    coverage: { start: new Date(start), end: new Date(end), intervalConvention: "[start,end)", verifiedDailyCalendar: true }, identity };
}

export function aggregateDailyTrajectory(trajectory, displayDates) {
  const daily = trajectory.dailyTrajectory || trajectory;
  if (!Array.isArray(displayDates) || !displayDates.length) throw new Error("Display dates are required.");
  const times = displayDates.map((date) => dayTime(date, "Display date"));
  if (times.some((time, index) => index > 0 && time <= times[index - 1])) throw new Error("Display dates must be strictly increasing.");
  const coverageStart = daily.coverage.start.getTime(), coverageEnd = daily.coverage.end.getTime();
  if (times.at(-1) >= coverageEnd || (times.length > 1 && times[1] <= coverageStart)) {
    throw new Error("Display bins must cover the daily trajectory without empty bins.");
  }
  let index = daily.frames.findIndex((frame) => frame.date.getTime() >= Math.max(times[0], coverageStart));
  const boundaryIndices = [], frames = [];
  for (const [bin, time] of times.entries()) {
    const end = Math.min(times[bin + 1] ?? coverageEnd, coverageEnd), start = Math.max(time, coverageStart);
    const entries = [];
    while (index < daily.frames.length && daily.frames[index].date.getTime() < end) entries.push(daily.frames[index++]);
    if (!entries.length) throw new Error("Display bins must contain observed days.");
    const last = entries.at(-1), first = entries[0];
    const nodeStates = Object.fromEntries(daily.ids.map((id) => {
      const state = { ...last.nodeStates[id], startI: first.nodeStates[id].startI };
      for (const key of ["newInfections", "contactInfections", "movementInfections", "incomingExposure", "outgoingPressure"]) {
        state[key] = entries.reduce((sum, frame) => sum + frame.nodeStates[id][key], 0);
        finite(state[key], `Aggregated ${key}`);
      }
      const infectiousUnitDays = entries.reduce((sum, frame) => sum + frame.nodeStates[id].startI, 0);
      state.infectiousUnitDays = finite(infectiousUnitDays, "Infectious unit days");
      state.rtProxy = infectiousUnitDays > 0 ? state.outgoingPressure / infectiousUnitDays : null;
      return [id, state];
    }));
    const linkStates = new Map();
    for (const entry of entries) for (const [key, link] of entry.linkStates) {
      const total = linkStates.get(key);
      if (!total) linkStates.set(key, { ...link });
      else for (const field of ["ledgerWeight", "movementPressure", "movementHazard", "contactHazard", "movementAttributedInfections", "contactAttributedInfections", "attributedInfections", "riskLoad"]) {
        total[field] = finite(total[field] + link[field], `Aggregated ${field}`);
      }
    }
    if (entries.length > 1) for (const link of linkStates.values()) {
      link.sourcePrevalence = null;
      link.targetPrevalence = null;
    }
    const frame = makeFrame(time, end, nodeStates, linkStates, daily.seedIds);
    frame.intervalStart = new Date(start);
    frame.dayCount = entries.length;
    if (bin > 0 && daily.boundaryIndices.some((boundary) => {
      const boundaryTime = daily.frames[boundary].date.getTime();
      return boundaryTime >= start && boundaryTime < end;
    })) boundaryIndices.push(bin);
    frames.push(frame);
  }
  return { ...daily, ...trajectoryFields(frames), boundaryIndices, dailyTrajectory: daily, dailyFrames: daily.frames };
}
