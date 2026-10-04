# Population strategy assessment for HerdLink

## Scope and recommendation

HerdLink supports exploratory research on livestock disease prevention and
control at COROP regional scale in the Netherlands. A fixed regional animal
inventory, with documented assumptions and complete alternative vectors where
supported, is the most direct population refinement supported by the available
material. A more detailed population model requires evidence about the process
that its additional states or flows represent.

HerdLink consumes a finished population product and applies its daily simulation
engine. Data acquisition, source interpretation, geographic assignment,
reconciliation and population estimation take place outside the application.
The product records its quantity, reference period, geography, evidence status
and assumptions. The application checks the structure and numerical consistency
of that product; it does not certify its source data. An assumption based
reference can support a defined sensitivity study without claiming an observed
daily stock or an empirically validated disease model.

Three distinct research tasks determine the strength of the resulting claims:

1. Reconcile population inventories and their geographic attribution.
2. Describe recorded movements and the contact structure they represent.
3. Estimate disease parameters from compatible epidemiological observations.

Success in population reconciliation and movement description does not establish
disease parameter validity. The immediate scientific question is how regional
exposure results depend on the population reference under a common model and
initialization convention.

This assessment contains qualitative findings about confidential GIAB material.
Source records, private schemas, identifiers, coordinates, exact inventory
counts, regional sums, paths and linkage results belong outside the repository.
The [population product contract](population-products.md) describes the boundary
between private preparation and application use.

## Model definition

HerdLink represents 40 COROP regions using deterministic SIR, SIS, SEIR or SEIRS
compartments. A canonical daily movement ledger covers 1 January 2019 through
15 April 2022. Daily transitions are independent of weekly, monthly or yearly
display aggregation.

Each run uses an explicit, fixed population vector and a separate initial state.
Compartment values may be fractional. The engine checks finite nonnegative
states and regional conservation. A zero population has zero compartments and
undefined prevalence. Positive recorded movements involving a zero stock region
are an input conflict that requires resolution outside the fixed resident model.

Paired scenario comparisons share their population, initialization convention
and disease parameters. Initialization by prevalence shares and initialization
by absolute counts answer different questions when populations differ. Both
conventions must therefore be retained in experiment records.

### Synthetic reference

The synthetic population uses available movement history in the 365 days before
introduction. For region i, define

\[
T_i=\text{outgoing animals}_i+0.7\,\text{incoming animals}_i,
\qquad z_i=\log(1+T_i).
\]

For positive activity with a nonzero range of positive scores,

\[
N_i=\operatorname{round}\left(450+9550\,
\frac{z_i-z_{\min}}{z_{\max}-z_{\min}}\right).
\]

Regions with no activity receive 450 units. If positive scores have no range,
every region receives 450 units. Local movement records contribute to both
incoming and outgoing activity. These are synthetic model units. The weighting,
logarithm and positive floor have no empirical inventory interpretation.

Movement activity consequently determines both the denominator and part of the
exposure process. The scaling compresses regional differences and depends on the
regional score range. It cannot be interpreted as an estimate of resident stock,
farm count or carrying capacity. The 365 day lookback window and the actual
coverage of the ledger must be distinguished. Changing introduction dates can
also change the synthetic denominator, which matters when comparing calendar
periods.

### Exposure and compartment semantics

For an allowed daily movement count x from region i to region j, the generic
exposure recurrence uses the state at the start of the day:

\[
h_j=\beta\frac{I_j}{N_j}+
\frac{1}{N_j}\sum_i\kappa x_{ij}\frac{I_i}{N_i},
\qquad D_j=S_j(1-e^{-h_j}).
\]

Movements provide exposure pressure. They do not physically transfer animals or
compartment members. Local recorded movements contribute to the movement term,
while a separate local contact term remains active. Interpretation of these two
paths requires care where recorded local shipments overlap with the contacts
represented by the local coefficient.

In SEIR and SEIRS, progression is sigma times E and recovery is gamma times I.
SEIRS also moves omega times R to S. Newly entered individuals do not progress
through another compartment within the same daily step. Regional S+E+I+R equals
the fixed N. This is a discrete recurrence; constant daily exit fractions imply
geometric residence times.

The numerical controls are illustrative. Numerical checks address the daily
clock, initialization, conservation, attribution and scenario handling. They do
not establish biological validity. The engine does not represent demographic
turnover, production stage transitions, physical animal relocation, infection
age structure, stochastic extinction or a disease observation process. Regional
compartments do not identify infected farms or shipments.

A more accurate denominator improves the definition of regional stock but does
not resolve homogeneous mixing. The same regional S/E/I/R totals can arise from
farms with very different contact patterns and shipment composition. The
importance of that aggregation error depends on the intended endpoint and
requires separate investigation.

## Evidence available

| Material | Contribution | Limits |
| --- | --- | --- |
| Regional daily movement ledger | Directed recorded animal volumes, including local records, over a defined calendar | Does not identify standing stock, births, all removals, farm contacts, infected shipments or complete observation coverage |
| Public CBS extract, 2018–2022 | Annual pig and pig business counts for COROP regions, retaining published zero and missing values | Business main address attribution and an April census date can differ from animal site inventories |
| Public KRD documentation and an inspected Gelderland/Twente export | Permitted and notified capacity by animal category, administrative dates and source metadata | Does not establish occupied stock, national completeness or a complete historical capacity archive |
| Private GIAB2018 inventory and documentation | Location related inventory estimates, count source information and candidate geographic identifiers | Does not directly observe the opening population on an arbitrary simulation date or daily stock history |
| Private GIAB2023 inventory and documentation | A separate reference extract with locations, animal categories and source methods | Does not establish a comparable longitudinal panel or dated demographic events |
| KRD–GIAB research comparison | Evidence about source differences, spatial matching and selection limits | Does not verify universal site links, occupancy rates or a population conversion factor |
| Private extraction and geographic diagnostics | Record retention, polygon assignment, unresolved locations, repeated record checks and arithmetic reconciliation | Does not certify population completeness or disease validity |
| Pig disease literature profiles | Study context, primary links and model compatibility considerations | Does not supply directly transferable numerical presets for regional compartments |

The application polygons use COROP 2024 and EPSG:28992. Geographic diagnostics
treat candidate source coordinates as RD New under an explicit assumption.
Source CRS confirmation and compatibility with movement endpoints remain
separate questions. Assignment to a display polygon does not establish the
historical geography used to aggregate movements. The ledger's COROP label alone
does not identify its boundary vintage.

CBS and GIAB also differ in spatial attribution and potentially in population
scope and reference time. A regional zero in one source can coexist with recorded
movements because timing, coverage, geography or establishment roles differ.
That discrepancy requires interpretation; an arbitrary positive floor would
conceal it.

## Inventory findings and assumptions

Private inventory material provides a basis for reference estimates that is
independent of the synthetic trade scaling. Its scientific interpretation still
depends on source definitions and assumptions.

- **Count definitions:** GIAB2018 distinguishes reported counts from selected
  corrected estimates. Annual inventory information is combined with other
  administrative evidence. Fractional estimates are meaningful source values
  and must not be rounded solely to create integer populations.
- **Source methods and time:** GIAB2023 includes reported and imputed
  information. A source code and its description disagree about the reference
  year. Reference time therefore requires an explicit interpretation in the
  private methods record.
- **Record grain:** repeated category rows can include indistinguishable
  exported records. Their housing and category interpretation determines
  whether they are additive. Identical rows alone do not establish duplication,
  and distinct rows do not prove that quantities are mutually exclusive.
- **Eligibility:** establishment roles and source methods use different
  encodings. A single literal type filter can exclude an entire source rather
  than a scientifically defined part of the animal population.
- **Geography:** COROP assignment is technically feasible. Some positive
  estimates lack usable coordinates, and some identifiers have multiple
  locations, including regional conflicts. Distinct sites sharing coordinates
  are not necessarily duplicates. Successful assignments do not establish
  complete source coverage.
- **Between years:** shared identifiers provide candidate links, alongside
  unmatched identifiers and location differences. Appearance or disappearance
  in annual extracts does not establish a dated opening, closure, relocation or
  demographic event.
- **Arithmetic reconciliation:** assigned and unresolved quantities reconcile
  to source row sums in the diagnostic analysis. This checks extraction and
  classification. It does not establish the true occupied population or
  independent agreement with another inventory.

Source interpretation belongs in the methods document accompanying each private
product. It must distinguish documentary facts, selected definitions,
assumptions and unresolved quantities. Decisions about additivity, eligibility,
reference year and geography should be traceable without placing private records
in HerdLink.

An annual mean inventory is a time average, not a measured stock on the
introduction date. Holding it fixed over a simulation is a modelling assumption.
Two annual references do not identify the path between them or bound intermediate
stocks. Complete alternative vectors can represent supported source or
assignment assumptions. Without a defensible probability model, their results
form a sensitivity envelope rather than a confidence or credible interval.

Geographic alternatives should preserve the quantity assigned to each resolved
physical site. A location choice cannot create simultaneous copies of the same
stock in multiple regions. Missing quantities remain unknown; they do not become
zero because they cannot be located. Decisions needed to produce a complete
simulation vector must be documented during external preparation.

## KRD and literature interpretation

[KRD](https://krd.igoview.nl/) describes permits and notifications. Its
[official field dictionary](https://www.igoview.nl/kaartlaag-veehouderijen/)
defines the pig field as permitted capacity. Geographic omissions, registration
gaps and administrative backlogs prevent missing records from representing zero
stock. Publication refresh frequency is not animal observation frequency.

The KRD–GIAB comparison uses selective spatial correspondences and different
reference periods, with category dependent differences. Its pooled ratios do
not establish a universal occupancy correction. Such a relationship would need
compatible occupied stock and capacity measurements, verified site and category
links, known selection and coverage, and evaluation on observations separate
from those used to estimate it. Capacity remains a different quantity from
occupied stock.

The pig disease reference material highlights distinct transferability issues:

- [Backer et al., HEV herd study (2012)](https://pubmed.ncbi.nlm.nih.gov/22664067/)
  concerns pigs within herds or age groups. Its population structure differs
  from homogeneous regional compartments.
- [Bouwknegt et al., HEV exposure/excretion study (2008)](https://pubmed.ncbi.nlm.nih.gov/18367077/)
  uses exposure and excretion endpoints that require comparison with the
  simulation's latent and infectious states.
- [Charpin et al., PRRS infection age study (2012)](https://link.springer.com/article/10.1186/1297-9716-43-69)
  describes infectiousness that depends on infection age, a distinction absent
  from a single constant coefficient.
- [Galvis et al., PRRS farm model (2022)](https://pubmed.ncbi.nlm.nih.gov/35188711/)
  uses farms, production types and observed farm outbreaks, which differ from
  regional animal fractions.

The compatibility summaries for Backer, Bouwknegt and Galvis are based on their
abstracts; the Charpin summary uses the full article. These sources provide
study context, not numerical control settings. Full methods and endpoint
compatibility are necessary before using any published quantity in a different
model.

## Missing evidence and research priorities

The available material does not establish daily occupied stock throughout the
movement period, a complete demographic balance or a verified longitudinal
establishment panel. It also does not supply compatible disease incidence,
infection prevalence, surveillance sampling denominators, diagnostic performance
or reporting processes.

Public RVO releases identify candidate inventory benchmarks within the movement
period. Their schemas, attribution, category completeness and comparability
require assessment before analytical use:

- [National combined declarations](https://www.rijksoverheid.nl/documenten/2025/10/07/openbaargemaakte-documenten-bij-besluit-woo-verzoek-over-gecombineerde-opgaven-van-alle-agrarische-ondernemingen-in-nederland),
  including April observations in 2020, 2021 and 2022.
- [Basiskaart Agrarische Bedrijfssituatie 2021](https://www.rijksoverheid.nl/documenten/2025/10/07/openbaargemaakt-document-bij-besluit-woo-verzoek-over-basiskaart-agrarische-bedrijfssituatie-2021).
- [Gelderland livestock information for 2020–2022](https://www.rijksoverheid.nl/documenten/2025/10/07/openbaargemaakt-document-bij-besluit-op-woo-verzoek-over-overzicht-alle-agrarische-ondernemingen-in-provincie-gelderland-waar-oa-rundvee-en-kippen-worden-gehouden).

Observation dates and publication dates have different meanings, especially for
claims about information available to an analyst at a historical date. Inventory
agreement also requires attention to shared administrative inputs: consistency
with a source used in construction is not independent validation.

| Research component | Supported use | Further evidence needed |
| --- | --- | --- |
| Fixed regional inventory | Exploratory population reference under stated definitions and assumptions | Comparable stock observations, source coverage and geographic interpretation |
| Inventory alternatives | Sensitivity to supported complete vectors | Evidence for the alternatives and any assigned probabilities |
| Local and movement coefficients | Illustrative controls in the declared recurrence | Compatible disease observations, distinguishable exposure pathways and an observation model |
| Natural history quantities | Literature context with explicit unit and endpoint distinctions | Comparable population, state definitions, time scales and study methods |
| Initial conditions | Declared prevalence shares or absolute counts | Evidence about infection, immunity, detection timing and sampled denominators |
| Production groups or farm states | Research designs tied to a defined endpoint | Group or farm inventories, relevant movements, contact structure and outcomes |
| Demographic turnover or changing stock | Explicit process hypotheses outside the fixed population engine | Entries, removals, residence times, external flows and repeated comparable stock observations |

A constant stock does not imply a closed cohort. Balanced entries and removals
can change age, susceptibility and immunity while preserving total N. Recorded
movement volume divided by inventory is a flow to stock diagnostic; it is not a
count of unique animals replaced and cannot recover absent demographic events.

The research agenda is to assess denominator sensitivity, regional aggregation
and source comparability before adding unsupported structure. Replacing the
population vector must not silently retune coefficients to reproduce a preferred
curve. A change in count units and a change in regional population shape are
different operations. Population agreement alone cannot identify transmission
coefficients or resolve disease parameter confounding.

Disease parameter estimation requires a defined observation process, compatible
outcomes, an assessment of parameter identifiability and validation observations
separate from those used for estimation. Literature informed assumptions,
empirically estimated parameters and illustrative values must remain
identifiable in the scientific record. These research activities belong outside
the application controls.

## Implementation and methods references

- [Population product contract](population-products.md): final file structure,
  interpretation, simulation use and privacy boundary.
- [Simulation model](simulation-model.md): units, compartments, daily recurrence,
  output measures and claim scope.
- [Population sources](simulation-population.md): synthetic references and
  public census interpretation.
- [KRD assessment](krd-population-assessment.md): public source definitions and
  qualitative comparison findings.
- `src/runtime/simulation-population.js`: synthetic references and final product
  loading.
- `src/runtime/simulation-engine.js`: numerical validation and daily recurrence.
- `src/runtime/herdlink-runtime.js`: controls, scenario identity and integration.
- `src/runtime/literature-profiles.js`: study context and source references.
