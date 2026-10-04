# KRD, GIAB and regional pig populations

Assessment date: 16 September 2026.

KRD can describe permitted pig housing capacity in the areas it covers. The
available evidence does not establish occupied pig populations over HerdLink's
2019–2022 movement history. Private assessment of GIAB2018 and GIAB2023 supports
the feasibility of regional inventory estimates, subject to source and
geographic validation. Neither these inventories nor the KRD comparison
supplies disease observations for preset calibration.

## What the sources measure

| Source | Quantity and time reference | Role in HerdLink |
| --- | --- | --- |
| KRD | Permitted or notified animal counts, with administrative decision dates | Capacity context after resolving record status, geography and coverage |
| GIAB comparison | Estimated annual animal inventories at selected establishments | Evidence about candidate site inventories and their differences from permits |
| Private GIAB workbooks | Site-level inventory estimates for the supplied reference years | Private assessment of count definitions, record grain and regional assignment |
| Bundled CBS extract | Annual 1 April pig counts attributed to business main addresses, 2018–2022 | Published regional context with an attribution caveat |
| Daily movement ledger | Recorded movements, 1 January 2019 through 15 April 2022 | Flows between regions; it does not measure standing stock |

The [KRD service](https://krd.igoview.nl/) states that counts come from permits
and notifications, rather than actual animal counts. Coverage is Gelderland,
Limburg, Noord-Brabant and Twente. It also describes incomplete registration,
notifications that do not reach the register and processing backlogs. An absent
record or uncovered area must not become a zero population.

The [official layer dictionary](https://www.igoview.nl/kaartlaag-veehouderijen/)
defines its pig field as the maximum number permitted to be present. It lists
RD coordinates and a refresh frequency of monthly for ODA and daily for ODDV
and other authorities. Refresh frequency describes publication of administrative
data; it does not establish daily stock measurements.

The [KRD manual](https://veehouderijen.igoview.nl/Handleiding/Handleiding_IGOVeehouderijen.pdf)
describes establishment, stable and animal-group information and exports. The
reviewed documentation does not establish a complete archive with the validity
intervals needed to reconstruct each site's permit at a historical date.

## Export inspection

The inspected download is the Gelderland/Twente **Totaaloverzicht dieren** CSV,
retrieved through the public interface on 16 September 2026. It contains all
animal categories in that view. The [machine-readable audit](krd-export-audit.json)
records its headers, selection rules and checksum:

```text
filename: dieren.csv
bytes: 9699682
SHA-256: 31ea7839a3f984f0b2529e06433a2528e93a3161c1560fd2441e518fad024f01
encoding: CP1252
separator: tab
```

| Diagnostic | All animal rows | Five named pig categories |
| --- | ---: | ---: |
| Export rows | 41,096 | 6,452 |
| Authority/object keys with a positive count | 10,768 | 1,724 |
| Rows reporting zero animals | 342 | 81 |
| Repeated identical export rows beyond their first occurrence | 888 | 109 |
| Rows with an unknown decision date | 6,202 | 389 |
| Decision rows after the ledger's final day | 13,936 | 3,124 |

The pig selection uses the export's exact labels for weaned piglets, farrowing
sows, dry/pregnant sows, breeding boars and fattening/rearing pigs. Farrowing sow
labels include unweaned piglets; category definitions therefore matter when
comparing counts with an inventory. Blank decision dates and `1900-01-01`
represent unknown dates. The latest known decision is 15 September 2026.

These are **row diagnostics**, not verified active-site or capacity totals.
The animal overview has no stable identifier, animal-group identifier,
termination field, validity end date, stock observation date or coordinates.
Identical rows could describe distinct groups omitted from the export schema;
deleting them or assuming they are additive would require the companion records.
No animal-count total is used as a regional population.

The export audit describes the public KRD download only. It does not reproduce
the private GIAB comparison or disclose its matches. Raw site records and all
GIAB analysis are kept outside the repository; the committed audit contains
public KRD aggregate diagnostics.

Reproduce the export audit from a downloaded file:

```sh
python3 scripts/audit-krd-population.py /path/to/dieren.csv --retrieved-on 2026-09-16
python3 -B -m unittest discover -s tests -p test_krd_audit.py
```

Use the file's actual retrieval date. The audit accepts this 14-column export
and its integer count format. It stops on a different schema, missing keys,
invalid counts or invalid dates so those differences receive inspection.

## What the GIAB comparison establishes

The supplied KRD–GIAB research comparison provides evidence about differences
between annual inventory estimates and administrative capacity. GIAB source
files, schemas, records, matching outputs and numerical results are private and
are kept outside the HerdLink repository.

The comparison treats annual inventory estimates as a possible starting
population. An annual average is not an observed opening stock. Spatial
correspondence supplies candidate links, but proximity alone does not establish
that two records identify the same establishment.

The matched sample is selective, category definitions differ, and permit dates
do not align consistently with the inventory reference period. These conditions
prevent a pooled inventory-to-permit ratio from serving as a general occupancy
correction. An earlier permit decision also does not establish which permission
was valid during a later observation period.

The comparison therefore does not establish occupancy, permit compliance, a
national population correction or changes in stock over time. Its role is to
identify source compatibility questions for private analysis, rather than to
supply a conversion from public KRD capacity to occupied populations.

## Feasibility and implementation requirements

**COROP permit-capacity context is feasible in scope**, subject to a suitable
joined extract. Keep establishment and detail keys, resolve record status and
category units, and assign animal sites to a named COROP boundary edition.
HerdLink's map polygons use 2024 boundaries in EPSG:28992. A capacity aggregate
must retain its retrieval date, administrative reference and coverage; a partial
COROP must remain visibly partial. A municipality-only join requires a compatible
dated municipality-to-COROP crosswalk. The inspected animal CSV alone cannot
complete these checks.

**Regional aggregation of the private GIAB records is technically feasible.**
The source assessment includes count validation, polygon assignment, location
conflicts and reconciliation of assigned and unresolved quantities. Diagnostic
record sums do not certify a complete stock baseline. Count definitions,
additive record grain, establishment/site relationships and geographic coverage
must support the intended population unit. These checks and their exact results
remain outside the repository. No private observations or regional sums are
bundled with the application.

A qualified baseline must retain its reference-year interpretation. The
selected KRD matches should not restrict a national GIAB population to matched
sites or supply missing GIAB locations. Annual inventories alone do not establish
daily populations during the ledger period. Apparent differences between
extracts do not establish dated openings, closures or demographic events.

**Dynamic occupied populations are not established by these inputs.** Dated
stocks and compatible births, deaths, removals and movement accounting are
needed to explain changes between observations. Permit decision dates do not
supply those events. Interpolating later permits, scaling them by a pooled
ratio or adding a population floor would conceal the missing measurements.

The [engine contract](simulation-model.md) conserves each regional population
and treats movements as exposure rather than physical relocation. A qualified
inventory snapshot could support an explicitly fixed-population approximation.
Representing dynamic occupied stocks requires a demographic model and consistent
compartment accounting, followed by conservation checks against observed stocks.
Changing only the population vector or its units would not implement that
dynamic accounting.

**The literature profiles remain uncalibrated references.** Population estimates
can improve a denominator; they cannot identify disease parameters. Compatible
epidemiological observations, endpoint definitions and independent validation
would still be required. This assessment supplies neither fitted disease
parameters nor a runnable disease-specific preset.

## Other dated stock candidates

Official RVO releases provide leads that are closer to inventory measurement:

- [National combined declarations](https://www.rijksoverheid.nl/documenten/2025/10/07/openbaargemaakte-documenten-bij-besluit-woo-verzoek-over-gecombineerde-opgaven-van-alle-agrarische-ondernemingen-in-nederland)
  list a ZIP covering 1 April 2010, 2015, 2020, 2021 and 2022. The final three
  reference dates fall within the ledger period.
- [Basiskaart Agrarische Bedrijfssituatie 2021](https://www.rijksoverheid.nl/documenten/2025/10/07/openbaargemaakt-document-bij-besluit-woo-verzoek-over-basiskaart-agrarische-bedrijfssituatie-2021)
  provides a downloadable spreadsheet with stable information.
- [Gelderland livestock data, 2020–2022](https://www.rijksoverheid.nl/documenten/2025/10/07/openbaargemaakt-document-bij-besluit-op-woo-verzoek-over-overzicht-alle-agrarische-ondernemingen-in-provincie-gelderland-waar-oa-rundvee-en-kippen-worden-gehouden)
  provide a provincial spreadsheet candidate.

Their public metadata establish download availability, not a validated HerdLink
population input. The archive schemas, pig categories, averaging intervals,
site versus business attribution and joins have not been inspected. These are
potential stock benchmarks, not evidence of a complete daily series. Their
October 2025 publication also needs to be distinguished from the measurement
dates in any retrospective or prospective analysis.
