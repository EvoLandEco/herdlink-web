# Finer community structure

Community granularity and display time resolution are different choices.
The bundled daily, weekly, monthly, and yearly tables contain exactly the same
aggregate weights for every valid directed route: 40 regions, 920 directed
routes, and 215,533,481 animals, including local shipments. Their cross-region
weights also agree, giving the same display partition across four temporal
representations of one graph.

## What the data support

With original local-trade loops included, both the runtime Louvain implementation and
the reference Leiden implementation find groups of 30, 6, and 4 regions.
Leiden recovered that same partition in all 30 random seeds tested. This
establishes agreement among the tested fits under the trade modularity objective.

Local trade is 33.80% of the volume. The display partition fits interregional
trade, yielding Broad groups of 30 and 10 regions and Finer groups of 16, 11, 7,
3, and 3. Local shipments remain visible in the heatmap and circular flows.

Direction contains information lost by combining reciprocal routes. Of 534
region pairs with interregional trade, 185 have volume in only one direction.
The sum of absolute differences between reciprocal volumes is 48.37% of all
interregional volume. This supports testing a directed community objective.

## Reference implementation comparison

The analysis uses Python 3.14, igraph 1.0.0, and leidenalg 0.12.0 on an Apple
M4 Max. Every method uses the whole unrestricted dataset. Original local-trade
loops are included except where the table specifies their removal. Each method and
resolution has three warmups and 30 measured random seeds; the table describes
the partition with the best objective among those seeds. Louvain experiments
with 101 node orders independently reproduced the undirected counts below.

Times are median milliseconds for one seeded fit and its objective evaluation.
CSV parsing, aggregation, graph construction, and browser rendering sit outside
the timed sections. Selecting the best of 30 fits costs roughly 30 times one
fit. Infomap performs 20 internal trials per seed. The table measures these
native reference implementations; browser timings appear in
[Trade communities](trade-communities.md#computation).

| Method | Resolution γ | Groups | Largest group | Singletons | Interregional volume within groups | Median ms per seed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Undirected Leiden modularity | 1 | 3 | 30 | 0 | 45.1% | 2.52 |
| Undirected Leiden modularity | 1.25 | 8 | 17 | 1 | 17.6% | 3.31 |
| Undirected Leiden modularity | 1.5 | 8 | 17 | 2 | 14.0% | 2.56 |
| Undirected Leiden modularity | 2 | 11 | 14 | 3 | 8.4% | 2.83 |
| Directed Leiden modularity | 1 | 4 | 30 | 0 | 41.1% | 3.65 |
| Directed Leiden modularity | 1.5 | 8 | 16 | 2 | 12.2% | 3.59 |
| Directed Infomap, with local trades | — | 1 | 40 | 0 | 100% | 2.17 |
| Directed Infomap, without local trades | — | 1 | 40 | 0 | 100% | 1.77 |
| Shared monthly membership, directed modularity | 1 | 4 | 30 | 0 | 41.1% | 74.70 |
| Shared monthly membership, directed modularity | 1.5 | 8 | 16 | 2 | 12.2% | 82.94 |

The within volume column measures trade between distinct regions. This keeps
the measure sensitive to interregional connections as groups become smaller.
At γ = 1.5 the undirected group sizes are 17, 8, 5, 3, 3, 2, 1, and 1. The
identical solution across 30 seeds measures optimizer stability on one dataset.
At γ = 1.25, seeds found either seven or eight groups
and four different partitions. Comparing memberships reveals this variation
more fully than group counts.

The monthly comparison enforces one label per region across all 40 month
layers. It preserves each month's own incoming and outgoing strength baseline.
Both volume weighting and equal weighting of months returned the same best
memberships as their corresponding aggregate directed models, at greater
computational cost. Standard directed Infomap returned one group. The Infomap
experiment covers its standard setting; Markov-time and hierarchical variants
remain research candidates.

## Suitable methods

**Generalized modularity is the first choice for interactive scale exploration.**
[Reichardt and Bornholdt](https://doi.org/10.1103/PhysRevE.74.016110) introduce a
resolution parameter γ that controls the penalty for putting nodes in the same
group. γ = 1 gives ordinary modularity; larger values generally favor smaller
groups. The optimizer finds groups at the chosen scale. Each resolution uses
the existing trade data to fit its own partition, so groups can rearrange
across scales. Compare scores within the same γ, where they share an objective.

[Leiden](https://pmc.ncbi.nlm.nih.gov/articles/PMC6435756/) improves community
connectivity guarantees over Louvain. Modularity's resolution limit belongs to
the objective. Leiden can also optimize the Constant Potts Model, which avoids
that global limit by using a chosen density threshold. The threshold depends
on edge weight units and requires a scientific interpretation for animal volumes.

**Directed modularity is the strongest immediate use of extra information.**
It uses separate incoming and outgoing strengths in the null model. Here it
finds four groups at γ = 1, splitting one small undirected group while retaining
the large 30-region group. Directed Infomap is an established flow alternative,
including in an [Austrian pig movement study](https://www.nature.com/articles/s41598-023-36596-1).
Its standard setting favors one group on this aggregate network.

**Temporal layers are justified when recurring patterns are the target.**
The [multilayer framework](https://arxiv.org/abs/0911.1824) and
[shared-membership implementation](https://leidenalg.readthedocs.io/en/stable/reference.html#leidenalg.find_partition_multiplex)
allow a fixed map while retaining period-specific network baselines. Choose
analysis periods and weights independently of the display resolution. In the
monthly experiment, shared membership recovered the aggregate model's groups
at greater cost; its value here is the period-specific baseline.

**Geography and census attributes need a defined scientific role.**
The repository contains regional coordinates and polygons, plus annual pig
counts, holdings, land area, and densities. A
[spatial null model](https://arxiv.org/abs/1012.3409) can find trading ties stronger
than proximity predicts. It answers a different question from ordinary trade
communities. An expected adjacency model needs to account for absent routes
and regional strengths. The plot's distance curve describes volume conditional
on observed positive routes. Inverse-distance weighting directly favors nearby
groups, so its use requires that preference as an explicit analysis choice.

[Annotated block models](https://arxiv.org/abs/1507.04001) can learn whether
metadata help explain network structure. Candidate attributes include production
stages, breeding/fattening roles, markets, and slaughter destinations; these
require data beyond the trade CSVs. Census holdings describe
regional business totals assigned by main establishment address, with geography
varying by reference year. Identifying individual farms requires farm-level
records. Each CSV row represents an aggregated route-period observation;
individual shipment counts require shipment records.

For automatic model selection or a true hierarchy, a
[nested degree-corrected stochastic block model](https://arxiv.org/abs/1310.4377)
is an established research approach. It can describe supply-chain roles as well
as dense communities. It requires a suitable model of volume weights and a
larger inference implementation; treating every animal as an independent
shipment would exaggerate the evidence. Benchmarking this approach remains
further work.

## Interactive community scales

The Broad/Finer control selects generalized modularity at γ = 1 or γ = 1.5.
The browser uses Louvain with γ in its objective and move calculation; each
move considers rejoining the source group, neighboring groups, and a singleton
group. Display communities use cross-region weights at both scales. The native
reference table describes the separate objective that includes local-trade
loops; mathematical tests preserve that reference alongside tests for the
interregional display graph.

Across 101 node orders on the graph including local trade, Louvain reached the
table's best result 94 times for Broad and 99 times for Finer. The browser uses
one canonical order. Louvain communities
can be disconnected, and these finite experiments leave global optimality and
uniqueness open. Directed modularity remains a useful alternative for
studying the information in trade direction.

Finer is an exploratory scale. Group sizes, singleton count, and interregional
within/between shares help assess its partition. The matrix shows all allowed
volume, including self loops; the shares describe trade between distinct
regions. Each scale fits its groups independently. Date modularity uses the
selected γ, so scores within a scale share an objective.

Both partitions stay fixed during replay. Dataset or schedule changes build
one aggregate, fit both scales, and cache each partition with its date scores.
Changing scale selects the cached statistics and redraws the current frame,
reusing community fits, centralities, and disease trajectories. Unrestricted
comparisons retain their own partitions at both scales. Measure the browser's
JavaScript calculation with `scripts/profile-trade-communities.js`.

To assess these groups for intervention zoning, evaluate their stability on
held-out periods and their performance in intervention scenarios.

## Reproduce

The native comparison runs in a separate analysis environment:

```sh
python3 -m venv /tmp/herdlink-community-methods-venv
/tmp/herdlink-community-methods-venv/bin/pip install igraph==1.0.0 leidenalg==0.12.0
/tmp/herdlink-community-methods-venv/bin/python scripts/compare-community-methods.py > /tmp/herdlink-community-methods.json
```

The script checks exact aggregate equality across all four CSVs and independently
checks Leiden's objective against igraph's modularity calculation. Results
include membership lists, variation between seeds, single-fit timing, and
ensemble timing. Adjusted Rand agreement is reported as null when it is
undefined for a trivial partition. The script writes an independent research
report; the live map uses the browser calculation described above.
