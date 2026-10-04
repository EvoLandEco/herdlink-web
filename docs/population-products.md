# Population references

HerdLink consumes a finished regional population product and runs its existing
daily simulation engine. Data acquisition, source processing, assumption
selection and population research take place outside the application.

The default population is synthetic. A local population file can supply a fixed
animal inventory reference. The control panel shows population selection and
scenario choices without exposing source methods or research checklists.

## Final product

A JSON product contains a schema version, a reference and one or more complete
regional vectors. The reference records its quantity, unit, time, geography,
access class, evidence status and assumptions. Each scenario has an identifier
and a value for every region. Fractions remain fractions. Missing values are
not zeros and cannot serve as numeric population inputs.

A reference may be an assumption based estimate. It need not claim source
qualification or disease validation. Source facts and modelling assumptions
must remain distinguishable in its accompanying methods document. A different
reference year is a separate scenario assumption, not an observed endpoint of a
daily demographic trajectory or a statistical uncertainty bound.

The source geography version and the movement endpoint definition have separate
fields. The bundled ledger's `COROP` label does not identify a boundary vintage.
Using mapped inventories with that ledger requires a documented compatibility
assumption. Displayed map boundaries do not establish historical attribution.

The file is the handoff between population preparation and analysis. HerdLink
checks file structure, finite nonnegative values, region coverage and internal
consistency. It does not certify source records or adjudicate the assumptions.

## Simulation

Each run retains its exact reference, scenario and population vector. The
existing engine holds regional populations fixed and treats recorded movements
as exposure pressure. It does not transport compartment members or infer
births, deaths, openings, closures or daily stocks. Each region conserves
S+E+I+R=N. The [engine contract](simulation-model.md) defines the daily recurrence.

Initialization is explicit: `prevalence-shares` seeds percentages of the selected
region; `absolute-counts` supplies the complete initial S/E/I/R vector. The two
conventions represent different experiments when populations change. Every
comparison uses the same population and initialization on both sides. Reference,
vector and convention contribute to run identity and public scenario storage.

An empty region has zero compartments and undefined prevalence. It stays visible.
Positive recorded movements incident to a zero stock region raise an input
conflict, including movements disabled by a restriction. Resolving that conflict
belongs to population preparation or a different model of establishment roles.

Changing a denominator does not calibrate disease parameters. Existing defaults
remain illustrative. Literature estimates retain their source unit, endpoint
and assumptions. Neither fixed reference populations nor annual administrative
extracts supply disease observations or an observation model for fitting.

## Private data

Private inputs and products stay outside the repository, application assets,
build output and examples. This includes source schemas, identifiers,
coordinates, exact diagnostics, regional values, paths and fingerprints.
Public tests use fabricated quantities.

A local file is read into browser memory. Private populations cannot be saved
to scenario slots or exported as screenshots. Comparisons can use them within
the page session; a reload discards them. Browser memory remains accessible to
the browser user and code running on the page. These controls prevent application
persistence and export; they are not a secure data enclave.

A product's access declaration must follow the source licence. Changing its
metadata cannot grant publication rights. Exact preparation methods and source
reconciliation belong alongside the private product, outside HerdLink.

## Research scope

The available inventory assessments support fixed exploratory references under
documented assumptions. Record additivity, selected count definitions, location
attribution, incomplete geographic coverage and reference periods need explicit
treatment during preparation. Source uncertainty must not be disguised as
observed precision. Complete alternatives can express different supported
assumptions; arbitrary regional noise does not constitute an uncertainty model.

Annual reference extracts do not establish daily population change. Production
groups, farm states or demographic turnover require suitable data and a defined
research endpoint before extending the engine. Disease calibration requires
compatible outcomes, an observation model, identifiable parameters and separate
validation observations. Those research activities sit outside HerdLink's
population loading and analysis controls.
