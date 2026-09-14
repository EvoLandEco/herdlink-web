# Simulation population and census data

HerdLink's disease compartments measure **synthetic model population units**.
The ledger measures recorded animal movements. The CBS map layers show
published pig and pig-business counts. These quantities serve different roles:
compartments support a controlled spread experiment, movements connect regions,
and census observations describe agricultural activity.

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
defines an exploratory population scale; epidemiological calibration would
give the compartments an animal-inventory interpretation.

Simulation setup, introduction-date edits and preset loads use the available
trade in the 365 calendar days before introduction. The shared introduction
defaults to the end of the first 365 days of daily history, within the loaded
timeline. The resulting vector is stored in the scenario's `holdings` field. Runs with
a stored vector use it exactly; runs without one derive their vector from the
loaded ledger. Each run holds its regional populations fixed, and both sides
of a policy comparison share the same vector. Hubs, Bridges and Community
Cordon choose targets from historical movement structure independently of this
population calculation.

The model conserves \(S_i+E_i+I_i+R_i=N_i\) at each region. Trade contributes
infection pressure to recipients. Population accounting represents fixed
regional compartments, with demographic turnover and physical relocation of
animals outside this model's scope. Contact, latency, recovery and waning
updates occur once per displayed record, so the chosen temporal resolution is
part of the experiment definition.

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

[Wageningen's GIAB documentation](https://research.wur.nl/en/publications/geografische-informatie-agrarische-bedrijven-2019-documentatie-va/) describes
location-based agricultural data that merit investigation for this purpose.
Access conditions and a matching downloadable inventory extract need to be
established. CBS also explains that pig I&R registration is unsuitable for
measuring pig stock in its
[pig-population survey description](https://www.cbs.nl/nl-nl/deelnemers-enquetes/bedrijven/overzicht-bedrijven/varkensstapel).

With aligned inventories, evaluate population sensitivity using paired seeds,
introduction dates and policies. Fit transmission and progression parameters
against disease observations, check turnover assumptions, and evaluate on a
common calendar clock. Keep the census vector and its provenance fixed for
each paired run. That design separates the effect of population assumptions
from the effect of intervention targets.

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
