# International flows

HerdLink bundles daily records for 1 January 2018 through 31 December 2023.
The existing time controls select daily, weekly, monthly and yearly views.
Import is a pooled source and Export is a pooled sink in the network and map.
Their positions are schematic. They do not identify physical ports, countries
or foreign holdings.

The ports, global metric chart, regional hover cards and focus panel show Imports
and Exports as observed facts. Each port shows animal movements and the number
of connected Dutch regions. Hovering a port highlights its routes; hovering a
route shows its volume and share. Export totals include only records with a known
Dutch sender region. This scope applies to ports, charts, route shares and
analysis. Import totals include records without a Dutch recipient region.
Dashed connections show the recorded Dutch regions, and their weights remain
observed counts.

Scenario comparisons measure movements retained under regional import and export
permissions. Restrictions apply on each movement day before counts are summed
into display periods. These comparison measures cover mapped records, whose
Dutch endpoint is known. No location or restriction status is inferred for an
unassigned record. Blocked movements are not rerouted.

Import and Export remain outside regional counts, communities, centrality
measures and population compartments. Both community scales and their modularity
scores use Dutch interregional movements only. Sharing a pooled foreign endpoint
does not establish a connection between Dutch regions. International totals can
describe a region's external trade without determining its community.

The simulation view retains the observed
port totals as context. Its edges represent attributed infections and use
domestic routes only. International movement lines are absent because the model
does not attribute infections to the pooled boundary. External prevalence,
foreign populations and infection states are not supplied by the movement
ledger and are not inferred from volume.

## Accounting

Domestic volume counts mapped domestic movements once, including movements
between distinct holdings within the same region. International imports and
exports are separate measures. The source package retains records without a
Dutch COROP assignment for accounting and reproduction. The application excludes
exports without a Dutch sender region when constructing its flow ledger.
Their locations are not inferred, and they do not become extra geographic nodes.

A contact is one directed holding pair on one day, or one holding linked to a
pooled port on one day. Summed contacts are contact days, not unique routes or
shipments. Animal movements do not measure unique animals or herd size. A zero
count means no supplied record, without establishing complete national coverage.

The source accounting totals below include records without regional assignments.

| Year | Domestic animals | Import animals | Export animals |
| --- | ---: | ---: | ---: |
| 2018 | 33,570,217 | 316,778 | 9,549,629 |
| 2019 | 33,391,131 | 77,941 | 8,980,302 |
| 2020 | 33,036,716 | 102,050 | 8,865,527 |
| 2021 | 32,861,746 | 94,484 | 7,554,092 |
| 2022 | 32,570,225 | 61,417 | 7,034,848 |
| 2023 | 31,091,800 | 81,121 | 7,100,797 |

The regional export total used by the application is 7,032,334 for 2022.
Export totals for 2018–2021 and 2023 match the source totals.
GIAB 2018 coordinates supply missing regions for 552,974 domestic movements
and 79,315 exports. The 2018 regional domestic total is 33,562,395; 7,822 remain
unassigned. National counts are unchanged by these geographic assignments.
The 2023 regional domestic ledger contains 31,087,436 animal movements;
4,364 arrivals have no complete COROP assignment. Of the recorded 2023 imports,
four lack a recipient region and remain in national accounting only.
Weeks run from Monday through Sunday and use ISO week numbers and week years.
The calendar contains 313 complete weeks, from 1–7 January 2018 through
25–31 December 2023. It includes leap day 2020 and days with no recorded movement.
Simulation history uses this declared calendar, including 1 January 2023,
which has no domestic arrival records. Empty movement days still advance the
model by one day.

The raw SAS extracts and preparation script support the complete years
2018–2023. Raw records dated 1 January 2024 form a partial year, and the files
contain no 2025 transport dates. Neither year is included in the calendar.
The map's separate census layer covers 2018–2022; it marks 2023 census values
as missing instead of carrying another year's values forward.

## Reproduction

Prepare private regional evidence with R packages data.table, readxl, sf and
jsonlite, then use a Python environment containing pandas, NumPy and holidays:

```bash
Rscript scripts/prepare-region-evidence.R /path/to/private/region-config.json \
  /path/to/private/region-evidence
python scripts/prepare-pooled-flows.py /path/to/NetForge \
  --years 2018 2019 2020 2021 2022 2023 \
  --regional-evidence /path/to/private/region-evidence/region-evidence.json \
  --output src/assets/data
```

This command writes the four regional ledgers and `international_flows.json`.
The source is `processed_data/raw_data/prepared_pigs.csv`. The adapter checks its
SHA256 and the preparation modules against the NetForge annual source manifest,
then calls `ledger_year` from `analysis/nl_country_network_20261015/build.py`.
Only regional aggregates, national daily counts and source digests enter the
application assets. Holding identifiers and coordinates remain in private
source and preparation records.

The regional configuration contains `paths` and `sha256` objects with the keys
`prepared`, `giab2018` and `corop2024`. They bind the prepared ledger,
`OHV19check18v3.xlsx` and the CBS 2024 geographic package. The evidence builder
uses recorded 2018 coordinates and the same 2024 COROP boundaries as the map
and consolidated metadata. Every coordinate candidate for a holding must fall
in the same single region. Missing or conflicting locations stay unassigned.
Only missing 2018 region fields are filled; observed counts and existing region
assignments are retained. The adapter checks the evidence's ledger digest and
records its source digests in the bundle. Without regional evidence, it uses
the COROP assignments supplied by NetForge alone.

GIAB 2023 is already a source of the consolidated metadata. A direct check of
the workbook found no usable coordinates for the remaining unmapped endpoints
in 2018–2023. Its herd counts are not movement observations and do not extend
the transport calendar.

Domestic counts use AAN notifications. Derived SLA rows and movements with
identical holding endpoints are excluded. DOO contributes holding membership,
not movement counts. The declared 2018 exclusion of a 209,562-animal AAN record
is retained as a source sensitivity choice, not a verified counting error.
No count is replaced with a statistical estimate.

Daily animal counts, daily contact counts and annual active holdings for 2018,
2020 and 2022 must match the sealed pooled study exactly. The holding rosters
for those years retain the study's registry evidence. The 2019, 2021 and 2023 rosters
use annual ledger membership. No registry snapshot is assigned to another year.
The JSON source section binds the regional CSVs by SHA256.

```bash
python3 -m unittest discover -s tests -p test_pooled_flows.py
python3 -m unittest discover -s tests -p test_trade_aggregation.py
node --test tests/pooled-flows.test.js
npm run build
```
