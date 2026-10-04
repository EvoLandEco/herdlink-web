# Simulation model

HerdLink provides a **generic deterministic exposure scenario with fixed
regional populations and daily discrete steps**. Populations can be synthetic
or prepared animal inventory references. Its disease parameters are
exploratory assumptions. The model is uncalibrated and supplies no disease
parameter presets. Literature profiles retain source links and compatibility
notes in the source module and documentation.
The [movement-control presets](network-scenarios.md)
specify restrictions, not biological parameter sets.

## Population, calendar and initial state

Each region has a fixed, nonnegative population \(N_i\). The synthetic
[population construction](simulation-population.md) uses available trade in the
365 calendar days before introduction. The [population product contract](population-products.md)
accepts prepared occupied stock references with documented time, geography and assumptions.
Every engine call requires the exact population snapshot and initialization
convention. The unrestricted and restricted
members of a comparison share that snapshot, the initial state, the parameters
and the daily movement input.

The daily ledger supplies calendar forcing independently of the selected display
resolution. A daily transition covers \([t,t+1\text{ day})\). Its state is
observed at the end of that interval. Weekly, monthly and yearly displays take
the state at the actual end of their covered interval and sum the daily
infection entries inside it. They do not sum compartment counts or extend a
partial final interval beyond ledger coverage. Daily totals describe the order
of days; they do not establish shipment order within a day. Coarse state samples
can miss daily peaks. Peak values and timing require the daily trajectory,
including the initial boundary.

Introduction occurs at the start of its exact calendar day. The engine stores
an `initialFrame` with every region's S/E/I/R counts before its first transition.
Initial infectious, exposed and recovered percentages specify shares of the
seed region, with the remaining share susceptible. Fractions below one model
unit are retained. Exposed initialization requires SEIR or SEIRS; SIS does not
have a recovered compartment. With percentage controls, other regions begin
susceptible. Programmatic scenarios can instead supply explicit S/E/I/R counts
for every region, with all initial percentages set to zero. These counts must
conserve each region's declared population. Initial shares and counts are
scenario assumptions, not prevalence estimates inferred from movements.
The convention is stored as `prevalence-shares` or `absolute-counts` and forms
part of the run identity alongside the reference and vector.

An empty region has zero compartments and undefined prevalence and compartment
shares. Positive movements incident to a zero stock region raise a domain
conflict, including movements disabled by a restriction. Missing or unresolved
inventories cannot enter the engine as zero. These rules prevent restrictions
or numeric denominators from concealing a source interpretation problem.

The canonical ledger's dates delimit its coverage. Treating an empty day as
zero movement assumes that the ledger covers that day. The application has no
independent observation-completeness model. It requires consecutive recorded
dates; a gap is an input error.
Missing source observations need to be resolved before drawing conclusions
about movement absence.

## Daily recurrence

Let \(x_{ij,t}\) be allowed recorded animals from source \(i\) to destination
\(j\) during day \(t\), and let \(S,E,I,R\) denote counts at the start of that
day. Every region's calculation uses this same start state. Recorded movements
supply exposure pressure; they do not transfer compartment members or change
regional populations.

For destination \(j\), define local contact hazard and movement pressure as
follows for positive populations:

\[
h^{c}_{j,t}=\beta\frac{I_{j,t}}{N_j},\qquad
L_{ij,t}=\kappa x_{ij,t}\frac{I_{i,t}}{N_i},\qquad
h_{j,t}=h^{c}_{j,t}+\frac{\sum_i L_{ij,t}}{N_j}.
\]

The fraction entering infection during the day is evaluated as
`-Math.expm1(-h)`. The entry count is

\[
D_{j,t}=S_{j,t}\left(1-e^{-h_{j,t}}\right).
\]

For SEIR and SEIRS, daily progression is \(P=\sigma E\) and recovery is
\(G=\gamma I\). SEIRS has waning \(W=\omega R\); SEIR has \(W=0\).
Their recurrence is

\[
S'=S-D+W,\quad E'=E+D-P,\quad I'=I+P-G,\quad R'=R+G-W.
\]

SIR has \(E=0\), \(S'=S-D\), \(I'=I+D-G\) and \(R'=R+G\).
SIS has \(E=R=0\), \(S'=S-D+G\) and \(I'=I+D-G\).
New entries cannot progress through another compartment in the same daily
transition. These equations define the discrete model; they are not an exact
one-day solution of a coupled continuous-time model.

All transmission coefficients must be finite and nonnegative. Daily exit
fractions must lie in \([0,1]\). Initial shares must be finite, nonnegative,
compatible with the selected compartments and sum to at most 100%. The engine
rejects invalid dates, regions, populations, controls and nonfinite results.
For valid inputs, the recurrence preserves nonnegative compartments and
\(S+E+I+R=N\) without correcting states after a transition.

## Controls and units

| Control | Meaning | Default |
| --- | --- | --- |
| Contact beta, \(\beta\) | Local integrated contact hazard per day at unit infectious prevalence. | 0.10 |
| Movement beta, \(\kappa\) | Exposure yield in model population units per recorded animal. It is not a probability. | 0.04 |
| Progression, \(\sigma\) | Fraction of the exposed compartment entering I each day in SEIR/SEIRS. | 0.22 |
| Recovery, \(\gamma\) | Fraction of I leaving infectiousness each day. SIS sends it to S; other models send it to R. | 0.15 |
| Waning, \(\omega\) | Fraction of R returning to S each day in SEIRS. | 0.02 |

These values define a mathematical example. They have no disease-specific
interpretation. Zero exit fraction retains a cohort in its compartment; a
fraction of one moves the entire start-of-day cohort on the next transition.
With an exit fraction \(q>0\), the isolated cohort follows \((1-q)^k\) after
\(k\) days and has mean occupied grid time \(1/q\) days. This is a geometric
residence-time assumption.

The default SEIR example starts CR35 with 1% infectious and no exposed or
recovered units. Contact transmission alone has an early growth threshold at
\(\beta=\gamma\); the default ratio is \(0.10/0.15\). Continuing movements,
including recorded movements within a region, can support growth even when
contact alone cannot. This makes the example useful for comparing movement
restrictions without assuming that every small introduction grows locally.

The shipment calendar still matters. For introduction on 1 January 2020, CR35
has no outgoing movements to other regions that day and reaches ten regions
on 2 January. A one-day export response blocks that first shipment day; a
two-day response allows it. With the default synthetic population and Seed
containment, daily network prevalence peaks at approximately 0.0428%, 0.0496%,
0.0555% and 0.0680% for response delays of 1, 2, 3 and 7 days. These are model
examples, not disease estimates. Weekly samples can miss daily peaks.
Trace Ring also changes its target set with the tracing window, and a
temporary standstill allows movement to resume. Neither policy guarantees a
smooth or monotone relationship between response delay and the final peak.

Local route availability governs recorded movements within a region. It does
not switch off the independent contact term. Imports and exports govern routes
between regions, with each permission continuing until its next dated change.
A dated route restriction governs the corresponding daily interval. Calendar
restrictions operate on their actual dates even when those dates are inside a
coarse display bin. Editing a route in a coarse display applies that setting to
the daily intervals covered by the displayed bin, clipped to ledger coverage.

Ledger mode uses the selected aggregated trade file and evaluates its records
at their date labels. Its coarse trade totals and community summaries therefore
do not account for restrictions on each day inside a bin. Exact calendar
accounting of retained movements requires the daily ledger or the headless
evaluation script. This distinction affects trade summaries and displayed
community membership; the underlying simulation always uses daily movements.

## Metrics

Daily infection entries count transitions out of S. Introduced E/I seeds and
initial recovered history are stored separately from these entries. Summed
entries in SIS and SEIRS can exceed N because they include repeated infection
episodes; they do not count unique individuals.

Each pathway receives \(D_k=D h_k/h\) when total hazard \(h>0\), and zero
otherwise. The self-link combines local contact entries and entries attributed
to recorded local movements. All link `riskLoad` values use these attributed
entries. Their incoming sum equals the region's incident entries. Movement
pressure is stored separately from attribution and is not an infection count.
The allocation is a model calculation, not evidence of observed transmission
links.

Incoming exposure and outgoing pressure sum daily movement pressure on allowed
routes between regions across the displayed bin. The pressure-per-infectious-unit
index divides summed outgoing pressure by summed daily start-of-day I. Its
denominator is infectious model unit-days, stored as `infectiousUnitDays`. The
index is undefined when this denominator is zero. For a daily view it reduces
to outgoing pressure divided by that day's start I. It describes movement
intensity under the assumed coefficient; it is not a reproduction number.
Compartment shares shown for a bin describe its end state. Daily link prevalence
records the source and destination's start-of-day shares. Links spanning multiple
days have null prevalence fields because their pressure calculation uses a
separate start state for each day. Route bars use the partner's compartment share
at the bin end.

## Saved scenarios and claim scope

Saved scenarios use schema version 3 and model identity `daily-contact-v1`. They
include daily model settings, initial shares or explicit counts, introduction
date, population snapshot and restriction schedule. Provenance records the
exploratory claim scope, recurrence method, population source and units, and
the daily ledger's content hash, units and coverage.
A stored scenario from a model with one transition per displayed record cannot
be loaded as this daily model. The application preserves such records and
requires an explicitly configured daily scenario.

This scenario can illustrate consequences conditional on the supplied movement
ledger and chosen assumptions. Deterministic fractional persistence is not an
outbreak probability, actual arrival, stochastic extinction or eradication.
Regional compartments do not identify farms, animal residence, production
stages, infection ages, or infected shipments. Fixed populations omit births,
slaughter, other removals and animal relocation. Restriction comparisons do not
identify causal real-world effects, rerouting, compliance or behavioural
responses. Separate contact and movement terms define assumed pathways; the
ledger cannot establish that these represent distinct biological exposures.

## Evidence required for disease claims

The literature evidence records cover four pig studies:

| Profile | Study unit | Compatibility with this model |
| --- | --- | --- |
| [HEV herd field study, Backer et al. (2012)](https://pubmed.ncbi.nlm.nih.gov/22664067/) | Pigs within age groups or herds | The source mixing unit differs from a synthetic regional population. |
| [HEV exposure and excretion, Bouwknegt et al. (2008)](https://pubmed.ncbi.nlm.nih.gov/18367077/) | Individual pigs | Exposure to excretion is not the infection-to-infectiousness interval required for latency. |
| [PRRS infection-age model, Charpin et al. (2012)](https://link.springer.com/article/10.1186/1297-9716-43-69) | Individual piglets | Infectiousness varies with infection age; a constant coefficient does not reproduce that structure. |
| [PRRS farm network model, Galvis et al. (2022)](https://pubmed.ncbi.nlm.nih.gov/35188711/) | Farms and production types | The model uses farm outbreak observations and contact pathways absent from regional compartment fractions. |

These are evidence records, not runnable disease presets. Their compatibility
notes compare the studies with HerdLink's declared model. The first, second and
fourth profiles are based on the published abstracts; the third uses the full
article. Source records were checked on 16 September 2026.

Published parameters can be entered directly only when their population unit,
pathway, interval, normalization, endpoint and model structure match this
model. Matching a parameter name is insufficient. A duration estimate needs a
specified residence-time distribution and an explicit translation to the daily
recurrence. A constant continuous exit hazard \(r\) has survival-matching daily
fraction \(1-e^{-r}\); matching a geometric mean duration \(D\) uses \(1/D\)
when \(D\ge1\) day. These conversions preserve different properties. Neither
repairs incompatible mixing units or missing mechanisms.

The application has no empirical calibration or disease observation model.
Supporting disease claims requires population counts located at the study
unit, dated infection observations, sampling denominators, diagnostic endpoints
and reporting information. Literature evidence must record study population,
units, uncertainty, source location and transfer assumptions. Movement records
alone do not identify contact transmission, movement transmission, initial
prevalence, progression, recovery or waning.

A scientific extension needs a declared observation model, an identifiable
parameterization, uncertainty assessment and independent validation using
withheld outcomes. Numerical correctness, a chosen target curve and biological
validation answer different questions. Adding a fitted curve without these
elements does not establish a disease preset.
