# Intervention presets

Seven presets compare movement-control strategies in the comparison panel.
Choose an introduction date, seed region, model settings, and preset parameters
before loading a preset. Loading a preset replaces the intervention schedule and
keeps the selected simulation parameters. These presets specify movement
restrictions. They do not supply disease parameter values or establish
real-world intervention effects.

Set Introduction date beside Seed region in Simulation Controls. Changing it
sets infection timing. Synthetic populations with share initialization use
the history preceding that date; imported populations and count initialization
retain their population reference. Existing
restrictions retain their calendar dates. Loading a preset selects its targets
and builds its response schedule from that date. An edited scenario's preset
marker clears when its settings differ from the loaded preset.

Baseline view compares Original and Intervention and lists presets followed by
three preset parameters. Compare 3 lists comparison presets followed by a shared
Metric selector and Regions control in the side panel. The selected metric
applies to overall and regional charts across all three columns. Each column
provides independent scenario controls. The view switch sits above Presets in
the side panel. Custom sits inside Presets and opens three saved scenario slots.

| Parameter | Default | Range | Applies to |
| --- | --- | --- | --- |
| Target regions | 3 | 1–40 regions | Hubs and Bridges selection count. |
| Response delay | 7 days | 0–365 calendar days | Start of all six intervention presets. |
| Standstill duration | 14 days | 1–365 calendar days | Time from the start of Standstill to reopening. |

These parameters reapply the selected preset after a 600 ms pause and rerun
the comparison with its new schedule. Without a selected preset, choose one to
apply the settings. Hubs
and Bridges share the target count, supporting comparison at the same number of
controlled regions; trade disruption depends on those regions' movements.

Seed, Trace Ring, Community Cordon, Hubs, and Bridges continue from response
through the evaluation timeline. Standstill reopens cross-region movement after
its selected duration. Open trade provides the unrestricted reference with the
same introduction and model population. A zero response delay starts controls
on the introduction date.

## Selection and action

| Preset | Target selection | Movement control |
| --- | --- | --- |
| Open trade | Full network reference. | All movements remain open. |
| Seed containment | The seed region. | Close its cross-region exports. |
| Trace Ring | Seed and its direct outgoing recipients observed between introduction and response. | Close exports from every selected region. |
| Community Cordon | Seed's historical trade community at the selected Broad or Finer scale. | Close outward boundary routes; internal and incoming trade continue. |
| Hubs | Up to \(k\) regions ranked by outgoing trading-partner count, outgoing volume, then region ID. | Close exports from selected regions. |
| Bridges | Up to \(k\) regions ranked by directed hop-count betweenness, outgoing partner count, then region ID. | Close exports from selected regions. |
| Standstill | Every region. | Pause cross-region movement for the selected duration. |

Local movements and local contact transmission continue under each preset.
Hubs and Bridges share the same eligible set: regions with at least one positive
outgoing historical route. Their target count is \(\min(k,|V_{eligible}|)\).
Regions with zero betweenness participate through the stated tie order.
Community scale controls Cordon membership; the independent target count
controls Hubs and Bridges.

Targets stay fixed for the applied scenario. Target count, response delay,
Standstill duration, and community scale take effect when a preset is loaded.
Loading a preset after an introduction date change rebuilds its targets and
response schedule. Identical complete schedules reuse their calculated results.
A singleton seed community can give Seed containment and Community Cordon the
same restrictions.

## Observation windows

Let \(t_0\) be the introduction date, \(\Delta\) the selected response delay,
and \(t_d=t_0+\Delta\) the response date. Standstill applies during
\([t_d,t_d+L)\), where \(L\) is its selected duration. Delay and duration use
calendar days. Community Cordon, Hubs, and Bridges use the preceding 365
calendar days:

\[
H=[t_0-365\text{ days},t_0),\qquad
W^H_{ij}=\sum_{t\in H}v_{ij}(t),\quad i\ne j.
\]

The application loads the bundled daily ledger for historical selection and
tracing. This canonical ledger preserves the same observation windows when the
display shows daily, weekly, monthly, or yearly trade. Positive cross-region
volumes form the historical graph. Community Cordon, Hubs, and Bridges become
available when the introduction date has 365 preceding recorded days. Their
selectors use movement history and seed identity independently of disease
parameters and subsequent simulated outcomes.

Trace Ring observes positive outgoing movements from the seed during
\([t_0,t_d)\):

\[
R_s=\{s\}\cup\left\{j:\sum_{t_0\le t<t_d}v_{sj}(t)>0\right\}.
\]

These recipients represent direct exposure opportunities before response.
Incoming-only partners retain their usual permissions. The response date closes
the tracing window, and the selected set persists through the scenario. With a
zero response delay, the observation window is empty and Trace Ring selects
only the seed region. Longer delays include more days of seed movements while
also postponing the response. The historical graph remains anchored to the
introduction date for every response delay.

## Community Cordon

The historical partition uses the application's Louvain implementation.
Reciprocal cross-region volumes are combined into undirected weights. Broad uses
resolution \(\gamma_C=1\); Finer uses \(\gamma_C=1.5\). Local movement volume
belongs to the disease and trade ledgers; community selection uses relationships
between regions.

For the seed community \(C_s\), the cordon closes a directed route exactly when

\[
i\in C_s,\qquad j\notin C_s.
\]

The rule covers recorded routes that first appear after response. Within-group
routes and imports across the boundary continue. A seed outside the historical
graph forms a singleton group.

The targeting partition describes the historical observation window. The
[community panels](trade-communities.md) describe the displayed trade period and
active restrictions. Each answers a different question: historical membership
defines the cordon; the panels show trade structure under the scenario.
Comparing directed modularity and Leiden is a separate community-method
experiment. Those choices can change memberships and the interpretation of
resolution values.

## Hubs and Bridges

Hubs measures direct downstream connections:

\[
H_i=\left|\{j:W^H_{ij}>0\}\right|.
\]

Repeated shipments contribute to volume while each destination counts once.
Outgoing volume resolves equal partner counts, followed by region ID.

Bridges uses the directed, unweighted historical graph
\(A_{ij}=\mathbf1(W^H_{ij}>0)\). Its node betweenness is

\[
B_i=\sum_{\substack{a\ne i,\ b\ne i\\a\ne b}}
\frac{\sigma_{ab}(i)}{\sigma_{ab}},
\]

where \(\sigma_{ab}\) counts shortest directed paths in hops and
\(\sigma_{ab}(i)\) counts those passing through \(i\). Unreachable pairs
contribute zero. Brandes' algorithm shares credit across equal shortest paths.
Outgoing partner count resolves equal scores, followed by region ID.

The two rankings describe direct connectivity and structural brokerage.
Chronological epidemic experiments assess their benefits under matched timing,
action, and target count. Historical centrality and movement chronology have
both supported livestock-network research.
[Brandes (2001)](https://doi.org/10.1080/0022250X.2001.9990249),
[Lentz et al. (2016)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0155196),
[Slovenian cattle trade study](https://pmc.ncbi.nlm.nih.gov/articles/PMC6971048/).

## Simulation timing and population

The selected introduction date is stored with the scenario. The seed receives
its exact initial S/E/I/R state at the start of that calendar day. An
`initialFrame` stores this state before its first transition. Earlier days show
susceptible compartments. The default synthetic population uses trade activity
in the available portion of the preceding 365-day window. A prepared inventory
supplies its own fixed regional vector. Both unrestricted and restricted
trajectories use the same population reference, initial state, parameters and
canonical daily input. The
[population model and CBS data](simulation-population.md) documentation describes
the trade scaling, census geography and requirements for an inventory-based
simulation.

Node restrictions retain their exact calendar start and reopening dates. The
simulation applies them at daily boundaries. A Standstill beginning on 8
January and ending on 22 January governs \([8\text{ January},22\text{ January})\),
including when a displayed bin spans the entire closure. Cordon route schedules
use the canonical daily ledger. Stored route restrictions each apply for one
UTC day; editing a route in a coarse display applies it across the days covered
by that bin. A response beyond ledger coverage has no effect within the run.

The engine advances once per calendar day independently of display aggregation.
Daily exit fractions govern progression, recovery and SEIRS waning; contact beta
is a daily integrated hazard, and movement beta is exposure yield per recorded
animal. The [model contract](simulation-model.md) gives their definitions.
Weekly, monthly and yearly displays sample compartments at the actual bin end
and sum daily infection entries. The bin's start date labels the display.
Initial seeds remain distinct from incident entries. These conventions preserve
the daily trajectory across display resolutions.

Ledger mode evaluates the selected trade aggregation at its record dates.
Coarse ledger totals can therefore miss a closure inside a displayed bin or
apply its start-date permissions to the entire aggregate. Use the daily ledger
or the headless evaluation script for exact retained-trade accounting. Display
communities inherit the selected ledger aggregation; historical preset targets
use the canonical daily history.

## Comparing policies

Complete-policy comparisons describe each strategy's disease burden and trade
disruption. Their scope varies: Seed controls one region, Trace Ring follows
observed recipients, Cordon controls a community boundary, and Standstill covers
the country temporarily. Hubs and Bridges support a matched target-selection
comparison through their shared \(k\), export action, historical window, response
date, and persistent duration.

Use paired seeds and introduction dates, a common evaluation horizon, and
several community scales for Cordon. Hold response delay fixed when comparing
targeting strategies, and vary delay in a separate timing comparison. Compare
Standstill durations at the same response date. Include retained cross-region
trade, post-response trade loss, external infection-entry burden, and peak
infectious burden. Seed-location quartiles describe variation across starting regions.
Cumulative infection entries include reinfections in SIS and SEIRS. Interpreting
population or policy benefits biologically requires compatible population and
disease observations, a suitable model and independent validation. The generic
simulation uses a fixed population reference and uncalibrated parameters.

Measure peaks and their dates on the daily state path, including the exact
initial boundary. Sampling only the states shown in a coarse chart can miss
the daily maximum.

## Calculation profile

Run the historical-selector tests and performance profile:

```sh
node --test tests/intervention-presets.test.js tests/network-presets.test.js
node scripts/profile-network-presets.js
```

The profile uses canonical daily records, four introduction dates, and a
seven-day response delay. It measures historical aggregation, first Hubs and
Bridges selections, both community resolutions, tracing, and repeated cached
selections. Parsing, population preparation, schedule application, rendering,
and epidemic calculations sit outside these measurements.

Each immutable dataset retains its active historical aggregate. Hubs and Bridges
rankings are cached independently of \(k\), and community partitions are cached
by graph, detector, and resolution. Trace Ring scans the daily ledger for a
positive response delay; an immediate response selects the seed directly.
Route-detail content is created when its timeline card is opened.
