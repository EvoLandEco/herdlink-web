export const flowChannels = ["domestic", "imports", "exports"];
const DAY = 86400000;

function keys(value, expected, name) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== expected.length || !expected.every((key) => Object.hasOwn(value, key))) {
    throw new Error(`${name} has an invalid structure.`);
  }
}

function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a nonnegative safe integer.`);
  return value;
}

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error("Choose a valid calendar date.");
  }
  return Date.parse(value);
}

export function validatePooledFlows(value) {
  keys(value, ["format", "source", "years", "boundaryRows"], "Flow package");
  if (value.format !== "herdlink-pooled-flows-v1") throw new Error("Unsupported flow package format.");
  keys(value.source, ["kind", "manifestSha256", "files", "assets", "exclusion2018"], "Source");
  if (value.source.kind !== "observed" || typeof value.source.exclusion2018 !== "string" || !value.source.exclusion2018.trim()) {
    throw new Error("Declare the observed source and its 2018 exclusion.");
  }
  if (!Array.isArray(value.years) || !value.years.length) throw new Error("Annual flow data are required.");
  const years = new Set();
  let packageTotal = 0;
  for (const annual of value.years) {
    keys(annual, ["year", "holdings", "activeHoldings", "days"], "Annual data");
    if (!Number.isInteger(annual.year) || annual.year < 2018 || annual.year > 2023 || years.has(annual.year)) {
      throw new Error("Annual data must use distinct calendar years.");
    }
    years.add(annual.year);
    count(annual.holdings, "Holding roster");
    count(annual.activeHoldings, "Active holdings");
    if (!annual.holdings || annual.activeHoldings > annual.holdings) throw new Error("Active holdings exceed the holding roster.");
    const start = Date.parse(`${annual.year}-01-01`), end = Date.parse(`${annual.year + 1}-01-01`);
    if (!Array.isArray(annual.days) || annual.days.length !== (end - start) / DAY) throw new Error("Supply the complete annual calendar.");
    for (const [index, day] of annual.days.entries()) {
      keys(day, ["date", "unmappedDomestic", ...flowChannels], "Daily data");
      if (calendarDate(day.date) !== start + index * DAY) throw new Error("Daily dates must be consecutive and ordered.");
      count(day.unmappedDomestic, "Unmapped domestic movements");
      if (day.unmappedDomestic > day.domestic.animals) throw new Error("Unmapped volume exceeds domestic volume.");
      for (const channel of flowChannels) {
        keys(day[channel], ["animals", "contacts"], "Flow counts");
        const { animals, contacts } = day[channel];
        count(animals, "Animal movements");
        count(contacts, "Daily contacts");
        const maxContacts = channel === "domestic" ? annual.activeHoldings * (annual.activeHoldings - 1) : annual.activeHoldings;
        if (contacts > maxContacts || contacts > animals || (animals > 0 && contacts === 0)) throw new Error("Animal and contact counts disagree.");
        packageTotal = count(packageTotal + animals, "Package volume");
      }
    }
  }
  keys(value.source.files, ["prepared_pigs.csv", "annual_builder.py", "cleaning.py",
    ...[2018, 2020, 2022].flatMap((year) => [`${year}/nodes.csv`, `${year}/observed_edges.csv`]),
    ...(Object.hasOwn(value.source.files, "regional_evidence.json")
      ? ["regional_evidence.json", "giab2018.xlsx", "corop2024.gpkg", "regional_preparation.R"] : [])], "Source files");
  for (const digest of [value.source.manifestSha256, ...Object.values(value.source.files)]) {
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Source checksums must be SHA256 values.");
  }
  keys(value.source.assets, ["daily_aggregation.csv", "weekly_aggregation.csv", "monthly_aggregation.csv", "yearly_aggregation.csv"], "Bundled ledgers");
  for (const digest of Object.values(value.source.assets)) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid bundled ledger checksum.");
  }
  const daily = new Map(value.years.flatMap((annual) => annual.days).map((day) => [day.date, day]));
  const totals = new Map(), seen = new Set();
  for (const row of value.boundaryRows) {
    if (!Array.isArray(row) || row.length !== 4) throw new Error("Invalid boundary row.");
    const [date, channel, region, animals] = row;
    const key = `${date}/${channel}/${region}`;
    if (!daily.has(date) || !["imports", "exports"].includes(channel) ||
        !/^(CR(0[1-9]|[1-3][0-9]|40)|NL_UNMAPPED)$/.test(region) || seen.has(key) || !count(animals, "Boundary movements")) {
      throw new Error("Invalid boundary date, direction, region or count.");
    }
    seen.add(key);
    const dayKey = `${date}/${channel}`;
    totals.set(dayKey, count((totals.get(dayKey) || 0) + animals, "Daily boundary movements"));
  }
  for (const day of daily.values()) {
    for (const channel of ["imports", "exports"]) {
      if ((totals.get(`${day.date}/${channel}`) || 0) !== day[channel].animals) throw new Error("Regional boundary totals disagree with national counts.");
    }
  }
  return value;
}

export function periodStart(value, resolution) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  if (resolution === "weekly") date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  else if (resolution === "monthly") date.setUTCDate(1);
  else if (resolution === "yearly") date.setUTCMonth(0, 1);
  else if (resolution !== "daily") throw new Error("Unknown flow resolution.");
  return date.getTime();
}

export function createPooledFlows(data) {
  validatePooledFlows(data);
  const days = data.years.flatMap((annual) => annual.days);
  const rows = new Map(days.map((day) => [Date.parse(day.date), []]));
  for (const [date, channel, region, animals] of data.boundaryRows) {
    if (channel === "exports" && region === "NL_UNMAPPED") continue;
    rows.get(Date.parse(date)).push({ channel, region, animals });
  }
  const calendars = new Map();
  const bins = new Map();
  for (const resolution of ["daily", "weekly", "monthly", "yearly"]) {
    const grouped = new Map();
    for (const day of days) {
      const time = periodStart(day.date, resolution);
      if (!grouped.has(time)) grouped.set(time, []);
      grouped.get(time).push(day);
    }
    bins.set(resolution, grouped);
    calendars.set(resolution, [...grouped.keys()].map((time) => new Date(time)));
  }
  const counts = () => ({ observed: 0, permitted: 0, blocked: 0, unassigned: 0 });
  function summarize(date, resolution, schedule = new Map()) {
    const events = [...schedule].sort(([a], [b]) => a - b);
    const permissions = new Map();
    let eventIndex = 0;
    const result = { imports: counts(), exports: counts(), regions: {}, unmappedDomestic: 0 };
    const period = bins.get(resolution)?.get(periodStart(date, resolution));
    if (!period) throw new Error("Flow date is outside the supplied calendar.");
    for (const day of period) {
      const time = Date.parse(day.date);
      while (eventIndex < events.length && events[eventIndex][0] <= time) {
        for (const [id, changes] of events[eventIndex++][1]) {
          permissions.set(id, { ...permissions.get(id), ...changes });
        }
      }
      result.unmappedDomestic += day.unmappedDomestic;
      for (const { channel, region, animals } of rows.get(time)) {
        const status = region === "NL_UNMAPPED" ? "unassigned" : permissions.get(region)?.[channel] === false ? "blocked" : "permitted";
        result[channel].observed += animals;
        result[channel][status] += animals;
        if (region !== "NL_UNMAPPED") {
          result.regions[region] ||= { imports: counts(), exports: counts() };
          result.regions[region][channel].observed += animals;
          result.regions[region][channel][status] += animals;
        }
      }
    }
    return result;
  }
  return { calendars, summarize };
}

export function flowMetrics(summary) {
  return {
    internationalImports: summary.imports.observed,
    internationalExports: summary.exports.observed,
    retainedImports: summary.imports.permitted,
    retainedExports: summary.exports.permitted,
  };
}
