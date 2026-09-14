const graphsByDataset = new WeakMap();
const selectionsByGraph = new WeakMap();
const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const validRegion = (id) => typeof id === "string" && id.trim() !== "" && id.toUpperCase() !== "NA";

export function presetSettingsKey(id, settings = {}) {
  return JSON.stringify([
    settings.introductionDate,
    id === "open-trade" ? null : settings.responseDays,
    ["hub-controls", "trade-bottlenecks"].includes(id) ? settings.targetBudget : null,
    id === "temporary-standstill" ? settings.standstillDays : null,
  ]);
}

function checkWindow(start, end) {
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || +start >= +end) {
    throw new RangeError("The movement window needs a finite start before its end.");
  }
}

function selectionCache(graph) {
  if (!selectionsByGraph.has(graph)) selectionsByGraph.set(graph, { partitions: new Map() });
  return selectionsByGraph.get(graph);
}

function takeTargets(ranking, k) {
  if (!Number.isInteger(k) || k < 0) throw new RangeError("The target budget must be a nonnegative integer.");
  return ranking.slice(0, k);
}

// Dataset rows remain immutable while their historical aggregates are cached.
export function getHistoricalPresetGraph(data, historyStart, historyEnd) {
  checkWindow(historyStart, historyEnd);
  const start = +historyStart;
  const end = +historyEnd;
  const cached = graphsByDataset.get(data);
  if (cached?.start === start && cached.end === end) return cached.graph;

  const edges = new Map();
  for (const row of data) {
    const time = +row.time;
    const source = row.COROP_LEV;
    const target = row.COROP_AFN;
    const weight = +row.AANTAL;
    if (!(time >= start && time < end) || !validRegion(source) || !validRegion(target) ||
        source === target || !(weight > 0) || !Number.isFinite(weight)) continue;
    const edgeKey = JSON.stringify([source, target]);
    const edge = edges.get(edgeKey);
    if (edge) edge.weight += weight;
    else edges.set(edgeKey, { source, target, weight });
  }
  const links = [...edges.values()].sort((a, b) => compareIds(a.source, b.source) || compareIds(a.target, b.target));
  const ids = [...new Set(links.flatMap(({ source, target }) => [source, target]))].sort(compareIds);
  const outDegree = Object.fromEntries(ids.map((id) => [id, 0]));
  const outVolume = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const { source, weight } of links) {
    outDegree[source]++;
    outVolume[source] += weight;
    if (!Number.isFinite(outVolume[source])) throw new RangeError("Historical trade volume exceeds the numeric range.");
  }
  const graph = { ids, nodes: ids.map((id) => ({ id })), links, outDegree, outVolume };
  graphsByDataset.set(data, { start, end, graph });
  return graph;
}

export function selectHubTargets(graph, k) {
  const cache = selectionCache(graph);
  cache.hubs ??= graph.ids.filter((id) => graph.outDegree[id] > 0).sort((a, b) =>
    graph.outDegree[b] - graph.outDegree[a] || graph.outVolume[b] - graph.outVolume[a] || compareIds(a, b));
  return takeTargets(cache.hubs, k);
}

export function selectBridgeTargets(graph, k) {
  const cache = selectionCache(graph);
  if (!cache.bridges) {
    const count = graph.ids.length;
    const positions = new Map(graph.ids.map((id, index) => [id, index]));
    const adjacency = Array.from({ length: count }, () => []);
    for (const { source, target } of graph.links) adjacency[positions.get(source)].push(positions.get(target));
    const scores = new Float64Array(count);

    // Directed, unweighted Brandes: breadth-first paths share dependency credit.
    for (let source = 0; source < count; source++) {
      const predecessors = Array.from({ length: count }, () => []);
      const distance = new Int32Array(count).fill(-1);
      const paths = new Float64Array(count);
      const dependency = new Float64Array(count);
      const queue = [source];
      distance[source] = 0;
      paths[source] = 1;
      for (let head = 0; head < queue.length; head++) {
        const node = queue[head];
        for (const next of adjacency[node]) {
          if (distance[next] < 0) {
            distance[next] = distance[node] + 1;
            queue.push(next);
          }
          if (distance[next] === distance[node] + 1) {
            paths[next] += paths[node];
            predecessors[next].push(node);
          }
        }
      }
      for (let index = queue.length - 1; index >= 0; index--) {
        const node = queue[index];
        for (const previous of predecessors[node]) {
          dependency[previous] += paths[previous] / paths[node] * (1 + dependency[node]);
        }
        if (node !== source) scores[node] += dependency[node];
      }
    }
    cache.bridges = graph.ids.filter((id) => graph.outDegree[id] > 0).sort((a, b) =>
      scores[positions.get(b)] - scores[positions.get(a)] || graph.outDegree[b] - graph.outDegree[a] || compareIds(a, b));
  }
  return takeTargets(cache.bridges, k);
}

export function selectTraceRingTargets(data, seed, introduction, response) {
  if (+introduction !== +response) checkWindow(introduction, response);
  else if (!Number.isFinite(+introduction)) throw new RangeError("The tracing dates must be finite.");
  const start = +introduction;
  const end = +response;
  if (start === end) return [seed];
  const targets = new Set([seed]);
  for (const row of data) {
    if (+row.time >= start && +row.time < end && row.COROP_LEV === seed &&
        validRegion(row.COROP_AFN) && +row.AANTAL > 0 && Number.isFinite(+row.AANTAL)) targets.add(row.COROP_AFN);
  }
  return [...targets].sort(compareIds);
}

export function getSeedCommunityMembers(graph, seed, resolution, computeModularity) {
  if (!Number.isFinite(resolution) || resolution <= 0) throw new RangeError("Community resolution must be positive.");
  const cache = selectionCache(graph).partitions;
  if (cache.get(resolution)?.detector !== computeModularity) {
    const { partition } = computeModularity(graph.nodes, graph.links, resolution);
    cache.set(resolution, { detector: computeModularity, partition });
  }
  const partition = cache.get(resolution).partition;
  const group = partition[seed];
  return new Set(group === undefined ? [seed] : graph.ids.filter((id) => partition[id] === group));
}

export function isCommunityCordonRoute(members, source, target) {
  return members.has(source) && !members.has(target);
}
