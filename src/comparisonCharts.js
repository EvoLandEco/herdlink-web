const countFormatter = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("en", { maximumSignificantDigits: 4 });
const scientificFormatter = new Intl.NumberFormat("en", { notation: "scientific", maximumSignificantDigits: 4 });
const percentFormatter = new Intl.NumberFormat("en", { style: "percent", maximumSignificantDigits: 4 });
const smallPercentFormatter = new Intl.NumberFormat("en", { notation: "scientific", maximumSignificantDigits: 3 });

export function pairComparisonSeries(dates, original, intervention, metric) {
  const before = new Map(original.map((frame) => [frame.date, frame[metric]]));
  const after = new Map(intervention.map((frame) => [frame.date, frame[metric]]));
  return dates.map((date) => ({
    date,
    original: Number.isFinite(before.get(date)) ? before.get(date) : null,
    intervention: Number.isFinite(after.get(date)) ? after.get(date) : null,
  }));
}

export function formatComparisonValue(value, format = "decimal") {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (format === "percent") {
    return magnitude > 0 && magnitude < 0.00001
      ? `${smallPercentFormatter.format(value * 100)}%`
      : percentFormatter.format(value);
  }
  if (format === "count" && (magnitude === 0 || magnitude >= 1)) {
    return countFormatter.format(value);
  }
  return (magnitude > 0 && magnitude < 0.001 ? scientificFormatter : decimalFormatter).format(value);
}

export function formatComparisonDelta(original, intervention, format) {
  if (!Number.isFinite(original) || !Number.isFinite(intervention)) return "—";
  const difference = intervention - original;
  const magnitude = format === "percent"
    ? `${formatComparisonValue(Math.abs(difference) * 100)} pp`
    : formatComparisonValue(Math.abs(difference), format);
  return `${difference > 0 ? "+" : difference < 0 ? "−" : ""}${magnitude}`;
}

export function nearestComparisonDate(dates, timestamp) {
  return dates.reduce((nearest, date, index) =>
    Math.abs(Date.parse(date) - timestamp) < Math.abs(Date.parse(dates[nearest]) - timestamp)
      ? index : nearest, 0);
}

export const comparisonEventMarkerWidth = 14;

export function groupComparisonEvents(groups, dates, trackWidth) {
  if (trackWidth <= 0 || !dates.length) return [];
  const positions = new Map(dates.map((date, index) =>
    [date, dates.length > 1 ? index / (dates.length - 1) : 0]));
  const ordered = groups.filter((group) => positions.has(group.date))
    .sort((a, b) => positions.get(a.date) - positions.get(b.date));
  const clusters = [];
  for (const group of ordered) {
    const center = positions.get(group.date) * trackWidth;
    const left = center - comparisonEventMarkerWidth / 2;
    const right = center + comparisonEventMarkerWidth / 2;
    const previous = clusters.at(-1);
    if (previous && left <= previous.right) {
      previous.right = right;
      previous.steps.push(group);
    } else {
      clusters.push({ left, right, steps: [group] });
    }
  }
  return clusters.map(({ left, right, steps }) => ({
    position: (left + right) / (2 * trackWidth), steps,
  }));
}

export function buildComparisonChart(points, width = 640, height = 198) {
  const values = points.flatMap((point) => [point.original, point.intervention]).filter(Number.isFinite);
  if (!points.length || !values.length) return null;

  const plot = { left: 64, right: width - 16, top: 12, bottom: height - 28 };
  const dates = points.map((point) => Date.parse(point.date));
  const start = Math.min(...dates);
  const end = Math.max(...dates);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const ceiling = maximum === minimum ? 1 : maximum;
  const x = (timestamp) => end === start
    ? (plot.left + plot.right) / 2
    : plot.left + (timestamp - start) / (end - start) * (plot.right - plot.left);
  const y = (value) => plot.bottom - (value - minimum) / (ceiling - minimum) * (plot.bottom - plot.top);
  const path = (key) => {
    let connected = false;
    return points.map((point, index) => {
      if (!Number.isFinite(point[key])) {
        connected = false;
        return "";
      }
      const command = `${connected ? "L" : "M"}${x(dates[index])},${y(point[key])}`;
      connected = true;
      return command;
    }).join(" ");
  };

  return {
    plot, start, end, x, y,
    ticks: [minimum, (minimum + ceiling) / 2, ceiling],
    original: path("original"),
    intervention: path("intervention"),
  };
}
