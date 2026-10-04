# Scientific assessment of the network simulation

HerdLink supports deterministic regional exposure scenarios conditional on a
movement ledger, a fixed population reference and declared model assumptions.
The available evidence does not establish a complete disease parameter preset
that can be entered directly into its controls. Numerical admissibility and
biological transferability are separate questions.

The main scientific constraints concern epidemiological units, population
definitions, regional aggregation, residence times and observation data.
Correct arithmetic and reproducible trajectories are necessary, but they do
not establish that a regional simulation represents a particular disease.

## Model and data scope

The network contains 40 Netherlands COROP regions. Its directed edges record
pig movement counts, including movements within regions. The bundled daily
ledger covers 1 January 2019 through 15 April 2022. The aggregate files do not
identify farms, batches, individual animals or shipment order within a day.

The engine uses one synchronous transition per calendar day. Weekly, monthly
and yearly views sample states at the end of their covered intervals and sum
daily infection entries. Display resolution does not set the simulation clock.
Coarse displays can miss a daily peak, and a partial final interval does not
extend beyond the available daily ledger.

Populations are supplied as explicit fixed vectors. The synthetic reference
uses available trade activity in the 365 days before introduction. Prepared
animal inventories retain their source period, geographic definition and
assumptions. Population preparation takes place outside HerdLink; the
application consumes the [final population product](population-products.md).

The engine represents SIR, SIS, SEIR and SEIRS compartments. It has no stochastic
infection draws, explicit farms, production groups, infection age structure,
demographic turnover or physical relocation of compartment members. The
[model contract](simulation-model.md) defines the recurrence and its units.

## Parameter transfer

Direct use of a published value requires agreement on the population unit,
pathway, normalization, time interval, measured endpoint and model structure.
A shared symbol or a value inside the control's numeric range does not
establish that agreement.

| Quantity | Engine meaning | Transfer requirement |
| --- | --- | --- |
| Contact coefficient | Daily integrated local hazard at unit infectious prevalence | Compatible mixing unit, incidence normalization and contact pathway |
| Movement coefficient | Exposure yield in population units per recorded animal | Compatible movement mechanism, population scale and evidence connecting movements to infection |
| Progression | Daily fraction of E entering I | Matching latent endpoint and residence time distribution |
| Recovery | Daily fraction leaving I | Matching infectious endpoint and residence time distribution |
| Waning | Daily fraction of R returning to S in SEIRS | Compatible immunity mechanism and definition of recovery |
| Initial state | Declared S/E/I/R counts or seed region shares at introduction | A compatible population denominator, endpoint and observation date |
| Model choice | Permitted compartment transitions | Disease processes compatible with the selected state structure |

The [literature evidence summary](simulation-model.md#evidence-required-for-disease-claims)
records four pig studies and the limits of their applicability. Individual
animal, within herd and farm outbreak estimates do not automatically describe
homogeneous regional compartments. Infection age effects and diagnostic
endpoints also need compatible state definitions. These studies provide
reference evidence; they do not supply fitted regional controls.

A daily exit fraction defines geometric residence on the time grid. Matching
the mean duration and matching survival under a continuous hazard preserve
different properties, as described in the model contract. Neither scalar
translation reproduces a different state structure or the joint evolution of
a coupled nonlinear system across a coarse interval. Counts already summed
over a movement interval must also remain distinct from movement rates.

## Fundamental modelling limits

| Issue | Scientific implication |
| --- | --- |
| Animal, farm and regional units | Animal prevalence cannot stand in for infected farm counts without a supported mapping or farm state model. |
| Synthetic population scale | Trade activity defines model units, not observed resident animals. Changing its label does not establish an animal inventory. |
| Inventory denominator | A better stock reference does not identify transmission coefficients or validate regional mixing. |
| Regional aggregation | Pooled totals conceal isolated farms, production roles, shipment selection and contact structure. Equal regional stocks can produce different farm dynamics. |
| Movement as exposure | The source population is not depleted and the recipient population is fixed. Outputs describe assumed exposure, not animal transport or infected consignments. |
| Fixed stock | Constant N omits entry and removal. A stationary open population can have constant stock while its compartment composition differs from a closed cohort. |
| Contact and local movement | The two terms are separate mathematical pathways. The ledger alone does not establish that their biological exposures are distinct. |
| Deterministic persistence | Fractional E or I can persist and transmit at arbitrarily small levels. This does not estimate invasion probability, stochastic extinction or eradication. |
| Compartment residence | One E and one I compartment impose a geometric duration structure; they do not describe every latent or infectious period distribution. |
| Immunity and removal | SIR, SIS and SEIRS encode different assumptions. Disease deaths, lifelong immunity or other processes may require different states. |
| Intervention interpretation | Conditional comparisons do not establish causal effects, compliance, rerouting or behavioural responses outside the recorded network. |

Pure count unit conversion and population shape changes have different
interpretations. A consistent uniform change of count units can preserve
prevalence when all dimensional quantities are converted together. Changing
regional population ratios alters exposure denominators and cannot generally
be repaired by one scalar coefficient. Fitting a replacement denominator to
an assumed trajectory would remain a scenario exercise.

## Numerical and reporting requirements

The implementation separates the introduction state from the first daily
transition. It retains fractional initial values without a minimum seed of
one. Initial exposed and recovered states must agree with the selected model,
and explicit compartment counts must conserve the population vector.

Every daily calculation uses the same start state. Newly exposed units cannot
progress and recover through several compartments during that transition.
The recurrence preserves nonnegative states and S+E+I+R=N for valid inputs;
post hoc clipping is not its population accounting rule.

Movement pressure and attributed infection entries have different meanings.
Pressure is evaluated from recorded movement and source infectious share.
Attributed entries allocate the destination's incident entries among the
assumed pathways. Link infection totals use the latter quantity consistently,
including local links. This allocation does not identify observed transmission
events.

Cumulative entries exclude the introduced seed and can include reinfection
episodes in SIS and SEIRS. They do not count unique infected animals. The
pressure per infectious unit index uses daily start state infectious burden;
over a displayed interval, its denominator is infectious unit days. It is
undefined when that denominator is zero and is not a reproduction number.
The trade matrix spectral radius is likewise a network statistic, not a disease
next generation calculation.

Zero population regions have zero compartments and undefined prevalence. A
positive movement incident to such a region is an input interpretation conflict.
An unknown inventory value cannot be converted to zero. Source definitions,
resident stock timing and transit roles must be treated during preparation.

## Verification evidence

The software tests examine the declared discrete recurrence and its interfaces.
They do not demonstrate biological validity or accuracy for a particular
pathogen. Each check addresses a specific implementation property:

| Check | Required result |
| --- | --- |
| Exact initial state | Fractional S/E/I/R counts are visible before the first transition. |
| Calendar consistency | Display aggregation preserves the daily trajectory and actual intervention dates. |
| Zero rates | States remain fixed when all applicable transmission and transition rates are zero. |
| Directed routes | Exposure follows permitted direction and the source's daily start state. |
| Conservation | Every region preserves S+E+I+R=N with nonnegative compartments. |
| Pathway accounting | Attributed entries sum to incidence while pressure remains a separate field. |
| Paired comparisons | Reference vector, initialization, coefficients and daily input agree within each pair. |
| Scenario identity | Reference metadata, exact values and initialization convention determine reproducibility. |
| Missing and empty regions | Missing values are rejected; empty region prevalence remains undefined. |
| Privacy | Private vectors remain outside assets and persistent browser scenarios. |

The shared engine is used by the browser and the headless scenario evaluator.
The reproducible checks are located in the [engine tests](../tests/simulation-engine.test.js),
[population tests](../tests/simulation-population.test.js),
[scenario tests](../tests/scenario-runtime.test.js),
[comparison tests](../tests/comparison-data.test.js) and
[evaluation harness test](../tests/evaluation-harness.test.js).

## Evidence needed for disease estimation

Disease estimation requires a defined epidemiological unit and endpoint, dated
outcomes, sampled denominators, and a description of diagnostic and reporting
processes. An observation model must connect those outcomes to the simulated
states. Animal infection, test positivity, reported cases and farm outbreaks
are not interchangeable observations.

Parameter estimation also requires identifiable quantities, separation of
source estimates from assumptions, treatment of population uncertainty and
validation against outcomes excluded from fitting. Population consistency
checks based on shared administrative inputs are not fully independent
validation. Movement records and census context alone cannot identify the
complete disease model.

Population preparation, structural research and disease estimation remain
outside HerdLink's control panel. The application provides analysis of the
supplied population and movement products. A disease calibrated claim would
need a named endpoint and a documented validation scope beyond these numerical
checks.

## Implementation references

The [simulation engine](../src/runtime/simulation-engine.js) defines the daily
recurrence, initialization, input checks and display aggregation. The
[population module](../src/runtime/simulation-population.js) defines the final
product interface. The [application runtime](../src/runtime/herdlink-runtime.js)
connects controls, trajectories and comparisons, while
[scenario storage](../src/scenarioStorage.js) preserves public scenario identity.

The [population strategy assessment](population-strategy-assessment.md)
describes source assumptions and research priorities. The
[population documentation](simulation-population.md) explains the synthetic
construction and census context. [Movement scenarios](network-scenarios.md)
describe restriction schedules independently of biological parameter evidence.
