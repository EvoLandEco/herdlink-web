# Simulation population and census data

HerdLink's default disease compartments measure **synthetic model population units**.
The ledger measures recorded animal movements. The CBS map layers show
published pig and pig-business counts. These quantities serve different roles:
compartments support a controlled spread experiment, movements connect regions,
and census observations describe agricultural activity.
A prepared animal inventory can supply a fixed reference through the
[population product contract](population-products.md). Its values retain their source
definition and do not calibrate disease parameters.

## Population construction

For each region, the model sums outgoing volume plus 0.7 times incoming volume.
Local records contribute to both sums. Let this activity be \(T_i\), and let
\(a\) and \(b\) be the smallest and largest positive values of
\(\log(1+T_i)\) across regions. The population is

\[
N_i=\operatorname{round}\left(450+9550\,
\frac{\log(1+T_i)-a}{b-a}\right).
\]

Regions with zero activity receive 450 units. When all positive activities are
equal, their scaled value is zero and every region receives 450 units. The
weight 0.7 and the range 450–10,000 are model assumptions. This transformation
defines an exploratory population scale. A transmission fit cannot turn these
units into observed animals or farms; that interpretation requires compatible
population measurements and model structure.

Simulation setup and introduction date edits with percentage initialization use
the available trade in the 365 calendar days before introduction. The shared introduction
defaults to the end of the first 365 days of daily history, within the loaded
timeline. The resulting vector is stored in the scenario's `holdings` field.
Every engine call requires an explicit population snapshot and initialization
convention and uses them exactly. Records on or after introduction do not contribute to its
construction. Each run holds its regional populations fixed, and both sides
of a policy comparison share the same vector. Restriction presets retain the
current population snapshot and its provenance. Moving the introduction of an
explicit S/E/I/R vector also retains that vector's population and reference date.
Hubs, Bridges and Community
Cordon choose targets from historical movement structure independently of this
population calculation.

The model conserves \(S_i+E_i+I_i+R_i=N_i\) at each region. Trade contributes
infection pressure to recipients. Population accounting represents fixed
regional compartments, with demographic turnover and physical relocation of
animals outside this model's scope. Contact, progression, recovery and waning
use one transition per calendar day from the canonical daily ledger. Display
aggregation samples states at the end of each covered bin and sums daily
infection entries. It does not change the simulation clock. The
[simulation model](simulation-model.md) defines the recurrence, parameter units,
initial state and limits of interpretation.

## CBS data and geographic alignment

The bundled extract covers all 40 COROP regions in 2018–2022. Table
[80781ned](https://www.cbs.nl/nl-nl/cijfers/detail/80781ned) supplies pig counts
and businesses keeping pigs; table
[70072ned](https://www.cbs.nl/nl-nl/cijfers/detail/70072ned) supplies land area
and an independent published pig-total field for cross-checking. The fetcher
preserves published zeros and missing values and verifies each region-year.

CBS attributes agricultural activities, including animal counts, to the
business's main establishment address. Animals can reside at other sites.
The census date is 1 April. Regional figures follow the reference year's
geography, while the app displays 2024 boundaries. A model population based on
this table therefore needs an explicit match between business geography,
movement geography and the locations where transmission occurs.

The public series is a current revised extract. CBS describes provisional
publication in November and definitive publication in March of the following
year. A prospective experiment needs the population information available by
its decision date, with publication vintages recorded alongside survey dates.

Regions can have positive movements during a year and zero published pigs on
the census date. Stock and flow have different time references; trading sites
can also have little resident stock. Such cases guide investigation of node
types, coverage and geography. Preserving zero and missing values makes that
investigation reproducible.

## Inventory-based simulation

A geographic animal-population model needs pig inventories located at animal
sites, aggregated to the same COROP definition as the movement data, plus a
documented reference date and release date. Business counts would instead
require a model whose infectious units are businesses, with matching
business-contact data and rates.

Prepared inventories retain fractional occupied stock estimates and explicit
source assumptions. Each final vector contains finite nonnegative values for
every region; an unknown count cannot be substituted with zero. Capacity is a
different quantity from occupied stock. Source preparation and reconciliation
take place outside HerdLink. Import selects a fixed reference
for the run; trade edits and display resolution do not recalculate it. Private
inventories remain in browser memory and cannot be saved to scenario slots or
exported as screenshots.

[Wageningen's GIAB documentation](https://research.wur.nl/en/publications/geografische-informatie-agrarische-bedrijven-2019-documentatie-va/) describes
location-based agricultural data relevant to this purpose. Private GIAB source
assessment covers count definitions, record grain, geographic assignment and
reference periods. Source records, schemas and numerical results are kept
outside the repository. The [KRD and GIAB assessment](krd-population-assessment.md)
describes the general findings and a public permit export. KRD records permitted
capacity; selected spatial matches and different reference periods do not
establish an occupancy correction or a daily stock series. Regional assignment
of private inventory estimates is feasible, but diagnostic record sums require
source validation before they can define a simulation population.

CBS also explains that pig I&R registration is unsuitable for
measuring pig stock in its
[pig-population survey description](https://www.cbs.nl/nl-nl/deelnemers-enquetes/bedrijven/overzicht-bedrijven/varkensstapel).

An inventory-based scientific model would need disease observations at the
same epidemiological unit, a compatible observation model and independent
validation. Population sensitivity, turnover assumptions and geographic
allocation need assessment alongside parameter uncertainty. The application
does not supply such a calibrated model. A paired exploratory comparison keeps
the population vector and its provenance fixed to isolate its declared
restriction schedule.

Refresh, validate and inspect the public census extract with Python 3:

```sh
python3 scripts/fetch-pig-census.py
python3 scripts/fetch-pig-census.py --check
python3 scripts/audit-pig-census.py
```

The audit reports each zero or missing census count alongside incident ledger
records in the same year and across the full timeline. Each local record
contributes once to its region's incident volume. Data fetching and auditing
run outside the browser; replay uses the bundled census file.
