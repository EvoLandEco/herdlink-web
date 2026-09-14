"""Compare established community objectives on the bundled unrestricted trade data.

Requires igraph 1.0.0 and leidenalg 0.12.0 in a separate analysis environment.
Run from any directory; results are written to stdout as JSON.
"""

import csv
import json
import math
import platform
import random
import statistics
import time
from collections import defaultdict
from pathlib import Path

import igraph as ig
import leidenalg as la


ROOT = Path(__file__).resolve().parents[1]
SEEDS = range(30)
GAMMAS = [1, 1.25, 1.5, 2, 3, 4]


def read_routes(resolution):
    routes = defaultdict(int)
    months = defaultdict(lambda: defaultdict(int))
    with (ROOT / f"src/assets/data/{resolution}_aggregation.csv").open() as handle:
        for row in csv.DictReader(handle):
            source, target = row["COROP_LEV"], row["COROP_AFN"]
            weight = int(row["AANTAL"])
            if not source or not target or source.upper() == "NA" or target.upper() == "NA" or weight <= 0:
                continue
            routes[source, target] += weight
            months[row["time"][:7]][source, target] += weight
    return dict(routes), months


ROUTES, MONTHS = read_routes("daily")
IDS = sorted({node for pair in ROUTES for node in pair})
POSITIONS = {node: index for index, node in enumerate(IDS)}
for resolution in ["weekly", "monthly", "yearly"]:
    assert read_routes(resolution)[0] == ROUTES, resolution


def graph(routes, directed=True, loops=True, normalize=False):
    weights = defaultdict(float)
    for (source, target), weight in routes.items():
        if source == target and not loops:
            continue
        pair = (POSITIONS[source], POSITIONS[target])
        weights[pair if directed else tuple(sorted(pair))] += weight
    edges = sorted(weights)
    total = sum(weights.values()) if normalize else 1
    result = ig.Graph(n=len(IDS), edges=edges, directed=directed)
    result.es["weight"] = [weights[pair] / total for pair in edges]
    return result


def canonical(membership):
    labels = {}
    return tuple(labels.setdefault(group, len(labels)) for group in membership)


def metrics(membership):
    groups = defaultdict(list)
    for node, group in zip(IDS, membership):
        groups[group].append(node)
    total = sum(ROUTES.values())
    external = sum(weight for (source, target), weight in ROUTES.items() if source != target)
    within = sum(weight for (source, target), weight in ROUTES.items()
                 if membership[POSITIONS[source]] == membership[POSITIONS[target]])
    local = total - external
    sizes = sorted(map(len, groups.values()), reverse=True)
    return {
        "groups": len(groups), "sizes": sizes, "singletons": sizes.count(1),
        "withinVolumeShare": within / total,
        "withinExternalVolumeShare": (within - local) / external,
        "members": sorted(groups.values(), key=lambda members: members[0]),
    }


def compare(name, fit, extra=None):
    samples = []
    partitions = []
    scores = []
    for seed in range(-3, len(SEEDS)):
        start = time.perf_counter()
        membership, score = fit(seed + 3 if seed < 0 else seed)
        elapsed = (time.perf_counter() - start) * 1000
        if seed >= 0:
            samples.append(elapsed)
            partitions.append(canonical(membership))
            scores.append(score)
    best = max(range(len(scores)), key=scores.__getitem__)
    agreements = [ig.compare_communities(a, b, method="adjusted_rand")
                  for index, a in enumerate(partitions) for b in partitions[index + 1:]]
    ordered = sorted(samples)
    return {
        "method": name, **(extra or {}), **metrics(partitions[best]),
        "bestObjective": scores[best], "bestPartitionSeedCount": partitions.count(partitions[best]),
        "groupCountsAcrossSeeds": sorted({len(set(p)) for p in partitions}),
        "distinctPartitions": len(set(partitions)),
        "meanAdjustedRand": statistics.mean(agreements) if all(map(math.isfinite, agreements)) else None,
        "medianMs": statistics.median(samples), "p95Ms": ordered[math.ceil(len(samples) * .95) - 1],
        "ensembleFitMs": sum(samples),
    }


results = []
for directed in [False, True]:
    g = graph(ROUTES, directed=directed)
    for gamma in GAMMAS:
        def fit(seed):
            partition = la.find_partition(g, la.RBConfigurationVertexPartition,
                                          weights="weight", resolution_parameter=gamma,
                                          seed=seed, n_iterations=-1)
            score = g.modularity(partition.membership, weights="weight", resolution=gamma, directed=directed)
            divisor = sum(g.es["weight"]) * (1 if directed else 2)
            assert math.isclose(partition.quality() / divisor, score, abs_tol=1e-12)
            return partition.membership, score
        results.append(compare("Leiden generalized modularity", fit, {"directed": directed, "gamma": gamma}))

for loops in [True, False]:
    g = graph(ROUTES, loops=loops)
    def fit(seed):
        ig.set_random_number_generator(random.Random(seed))
        partition = g.community_infomap(edge_weights="weight", trials=20)
        return partition.membership, -partition.codelength
    results.append(compare("Directed Infomap", fit, {"selfLoops": loops, "trialsPerSeed": 20}))

for equal_months in [False, True]:
    layers = [graph(routes, normalize=equal_months) for _, routes in sorted(MONTHS.items())]
    for gamma in [1, 1.5]:
        def fit(seed):
            membership, _ = la.find_partition_multiplex(
                layers, la.RBConfigurationVertexPartition, weights="weight",
                resolution_parameter=gamma, seed=seed, n_iterations=-1)
            volumes = [sum(layer.es["weight"]) for layer in layers]
            score = sum(layer.modularity(membership, weights="weight", resolution=gamma) * volume
                        for layer, volume in zip(layers, volumes)) / sum(volumes)
            return membership, score
        results.append(compare("Shared monthly membership, directed Leiden", fit,
                               {"equalMonthWeights": equal_months, "gamma": gamma, "layers": len(layers)}))

print(json.dumps({
    "python": platform.python_version(), "machine": platform.machine(),
    "igraph": ig.__version__, "leidenalg": la.__version__,
    "regions": len(IDS), "directedRoutes": len(ROUTES), "totalVolume": sum(ROUTES.values()),
    "allTemporalAggregatesIdentical": True, "seeds": len(SEEDS), "warmups": 3,
    "timingScope": "Per seeded reference C++ fit through Python. Ensemble time sums 30 measured fits. Excludes CSV parsing, aggregation, graph construction and browser rendering.",
    "selection": "Best objective among 30 seeds at each fixed method and resolution. Compare objective values within the same method and resolution.",
    "results": results,
}, indent=2, allow_nan=False))
