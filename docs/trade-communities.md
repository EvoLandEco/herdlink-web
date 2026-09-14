# Trade communities

The community map describes allowed interregional animal volume across the full loaded
period. Broad (γ = 1) and Finer (γ = 1.5) provide two scales for comparing dates,
with Finer selected by default. Each allowed record contributes its volume to
an undirected edge between distinct regions; reciprocal
routes and repeated records are added together. Local trade remains in the
heatmap, flow view, and simulation ledgers.
Louvain optimizes generalized modularity on this aggregate graph at each scale,
using a fixed node and edge order. Community IDs follow the first region in each
group in sorted region order. Regions with zero allowed interregional volume across the
period remain unassigned.

The grouping question concerns connections between regions. Heavy original
self-loops strengthen a region's own community in Louvain and can keep it
separate despite its external ties. Using cross-region trade focuses the
partition on those external relationships. The
[Louvain documentation](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.community.louvain.louvain_communities.html)
explains this effect and distinguishes input loops from the internal loops
created when communities are aggregated during optimization.

The date slider reuses the selected partition. Map colors, community membership,
and matrix order stay fixed. Each scale fits its own groups, independently of
the display time resolution. Matrix cells and side bars show all allowed trade
on the displayed date, including local trade. Within and between shares describe
interregional volume. Community sizes and singleton counts refer to the whole
period, including communities that are inactive on that date.

The Heatmap/Flow switch selects a community matrix or a circular flowtree.
The circle includes all 40 COROP regions, with inactive regions shown as hollow
nodes and unassigned regions placed in their own sector. Numeric node labels
use the number in each COROP code: 01 is CR01. Hover or focus a node to see its
full name, incoming and outgoing totals, and local volume.

The circular layout uses a root, community branches, and region leaves with
[D3's radial cluster layout](https://d3js.org/d3-hierarchy/cluster) and
[hierarchical edge bundling](https://d3js.org/d3-shape/curve#curveBundle).
Positions depend on membership and remain fixed during date replay. Changing
the partition can rearrange the sectors. Date changes blend flow widths and
visibility over 300 ms; community changes crossfade the layouts. Reduced motion
uses immediate updates. Each curve represents a direct route
between its recorded source and destination; community branches guide its shape.
Source colors and arrowheads show direction. Separate incoming and outgoing
endpoints distinguish reciprocal routes, and small loops
show local flows. Width follows the square root of volume, scaled within each
displayed date. In simulation mode, flows show modeled exposure, including
local exposure, using the same quantities as the heatmap. The footer shows
total volume, active regions out of the full roster, and the
percentage of volume staying within its source region. Local flows count once
in the total. Dates with zero flows show zero active regions and a dash for
local share.

Node export and import permissions persist from their scheduled date until
another permission event. A route restriction applies on its recorded date.
Both use the same rules as the ledger and simulation, including permission for
local trades when exports or imports are blocked. Changing the dataset or
restriction schedule rebuilds the aggregate. A future restriction can therefore
change reference groups on earlier dates. The map describes the whole scenario
retrospectively.

## Modularity at each date

For a date with total allowed interregional volume \(m\), within community volume
\(w_{\mathrm{within}}\), and community strengths \(s_c\), the displayed score is

\[
Q_\gamma = \frac{w_{\mathrm{within}}}{m}
    - \gamma \sum_c \left(\frac{s_c}{2m}\right)^2.
\]

Each cross-region route adds its volume to both endpoint strengths. Local
movement contributes to the displayed trade totals while this score uses the
connections between regions. This is the
weighted undirected generalized modularity used by the Louvain algorithm,
evaluated at each date against the fixed partition and selected γ. Negative
values indicate less within community volume than the γ-scaled null expectation
from the same node strengths. Scores at the same community scale share an
objective and can be compared. Dates with zero allowed interregional trade display zero
by convention.

## Reading the groups

Gorsich et al. tested annual cattle shipment communities against monthly trade,
providing a close precedent for this reference map. Summing animal volume gives
busy periods more influence. Splitting identical records into smaller time bins
preserves the aggregate when the allowed volumes are unchanged. Equal weighting
of dates would answer a different question and depend on the selected bin size.

Within community share and modularity show how well the reference groups
describe each date, helping reveal seasonal differences hidden by aggregation.
Modularity's resolution limit can merge smaller groups, and several partitions
can share an objective value. Finer provides another scale to explore those
patterns. On the unrestricted bundled data, Broad gives groups of 30 and
10 regions; Finer gives 16, 11, 7, 3, and 3. Group sizes and interregional
mixing shares help assess that division. Changing local shipment volumes alone
preserves these memberships and modularity scores.

Colors identify trade groups within one scenario. Compare region membership
when matching groups across separately fitted scenarios. Assessing communities
as disease control zones requires evidence from spread and intervention outcomes.
The simulation follows directed routes in chronological order; the aggregate
serves as a grouping for display. A path through the aggregate may combine
movements that occurred in the reverse temporal order.

## Computation

One pass over the indexed records applies scheduled controls and sums the
aggregate weights. Louvain runs twice, once per scale. The allowed date graphs
score both fixed partitions. Temporary date graphs are discarded; the stored
result contains the two partitions and their modularity values by date. A scale
change selects cached community statistics and redraws the current frame,
reusing centralities and disease trajectories. Schedule edits refresh community
values across every date. Other network statistics are recalculated for the
dates affected by the controls.
Unrestricted comparisons keep their own cached partitions at both scales.

The browser optimizer uses γ in both its objective and its move calculation.
Each move compares rejoining the source community with other neighboring
communities and a singleton community. Coarsening retains the internal edge
weights of aggregated communities as loops in the Louvain quotient graph.
The browser runs Louvain, whose communities can be disconnected. Connectivity,
optimizer stability, and alternative objectives can be assessed separately.
See the
[method comparison](community-method-comparison.md) for the experiments and
alternative objectives.

Run `node scripts/profile-trade-communities.js` for community calculation
timings on all bundled datasets: both scales, schedule edits, and cached scale
selection. Date changes reuse the selected partition. A schedule edit rebuilds
the whole period, even when one date's route changes. CSV parsing, other network
metrics, simulation, and rendering sit outside the timed sections. Tests cover
aggregation, scheduled controls, negative modularity, inactive regions, and
comparison isolation.

On an Apple M4 Max with Node 25.2.1, 25 measured runs after five warmups gave
the following times in milliseconds. Rebuild timings include both fits and
their date scores. Cached selection includes copying community fields and
updating the modularity maximum, with rendering excluded.

| Dataset | Records / dates | Both scales, median / p95 | Cached selection, median / p95 |
| --- | ---: | ---: | ---: |
| Daily | 143,373 / 1,201 | 70.544 / 77.413 | 0.486 / 0.584 |
| Weekly | 54,504 / 172 | 29.205 / 36.403 | 0.082 / 0.092 |
| Monthly | 17,683 / 40 | 10.116 / 11.646 | 0.018 / 0.045 |
| Yearly | 2,698 / 4 | 3.147 / 3.770 | 0.003 / 0.007 |

A single route edit rebuilds both daily partitions in a median 70.012 ms;
a persistent export restriction takes 77.934 ms. Scale selection preserves
node positions and the fitted distance curve while recoloring its dots.

Circular flow geometry is cached by partition and region roster. Replay refreshes
dated weights, paths, and labels. On the same machine,
data assembly and path generation took a median 0.917 ms for the busiest weekly
frame (340 routes) and 1.889 ms for the busiest yearly frame (725 routes), with
p95 values of 1.157 ms and 2.616 ms. These measurements use D3 6.7.0, 100 warmups,
and 1,000 measured samples, and exclude SVG insertion, styling, layout, and paint.
The check also verifies finite paths, distinct endpoints for reciprocal routes,
and stable region positions. Reproduce it with the app's D3 version:

```sh
curl -fsSL https://cdn.jsdelivr.net/npm/d3@6.7.0/dist/d3.min.js -o /tmp/herdlink-flow-d3.min.js
node scripts/profile-community-flow.js /tmp/herdlink-flow-d3.min.js
```

## References

- Gorsich et al. (2016). [Mapping U.S. cattle shipment networks: Spatial and temporal patterns of trade communities from 2009 to 2011](https://doi.org/10.1016/j.prevetmed.2016.09.023).
- Blondel et al. (2008). [Fast unfolding of communities in large networks](https://arxiv.org/abs/0803.0476).
- Reichardt and Bornholdt (2006). [Statistical mechanics of community detection](https://doi.org/10.1103/PhysRevE.74.016110).
- Traag et al. (2019). [From Louvain to Leiden: guaranteeing well-connected communities](https://pmc.ncbi.nlm.nih.gov/articles/PMC6435756/).
- Fortunato and Barthélemy (2007). [Resolution limit in community detection](https://arxiv.org/abs/physics/0607100).
- Lentz et al. (2016). [Disease spread through animal movements: a static and temporal network analysis of pig trade in Germany](https://doi.org/10.1371/journal.pone.0155196).
