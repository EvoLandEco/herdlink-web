# Ledger source rules

The bundled 2018–2023 ledger follows the NetForge annual preparation rules in
[international flows](international-flows.md). Domestic AAN arrivals are counted
once. Derived SLA rows and movements with identical holding endpoints are
excluded. Imports and exports retain their recorded event type.

The source declares an exclusion of one 209,562-animal AAN record in 2018 as a
sensitivity choice, not a verified counting error. Counts are not replaced with
means, interpolated values or volume caps. Regional time aggregates reconcile
with the source totals after records without COROP assignments are accounted for.

Source digests and the checksums of all four bundled ledgers are stored in
`src/assets/data/international_flows.json`.

## Arrival ledger assessment and coverage

The raw SAS reports reproduce every observed group in the NetForge prepared
file with exact integer equality. Raw report IDs and full rows are unique.
HerdLink's national counts and mapped regional cells agree with that source
under the declared selection and geographic assignment rules. No unexplained processing loss or extra
counting is present. AAN and AFV are not added together, and derived slaughter
rows do not enter movement counts.

| Year | Raw AAN animals | Missing holding endpoints | Declared outlier exclusion | Missing COROP assignment | HerdLink regional animals |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2018 | 33,779,987 | 208 | 209,562 | 7,822 | 33,562,395 |
| 2019 | 33,391,300 | 169 | 0 | 8 | 33,391,123 |
| 2020 | 33,036,850 | 134 | 0 | 9 | 33,036,707 |
| 2021 | 32,861,839 | 93 | 0 | 0 | 32,861,746 |
| 2022 | 32,570,321 | 96 | 0 | 3,149 | 32,567,076 |
| 2023 | 31,091,855 | 55 | 0 | 4,364 | 31,087,436 |

Each row subtracts the three exclusion columns from raw AAN to obtain the
regional total. NetForge's national ledger retains the missing-COROP volume.
The remaining 2018 geographic gap is 7,822 movements, or 0.0233% of the
national arrival ledger after the declared outlier exclusion.
Missing regional assignments in each later year account for less than 0.015%
of its national arrival total. These checks support use as arrival-side ledgers;
they do not establish a census of distinct physical shipments or exclude
errors shared by both reporting channels.

The supplied extracts support all twelve months of 2023, consistent with the
preparation script's declared core years, 2018–2023. The 2023 arrivals, imports
and exports pass the same raw-to-prepared and regional accounting checks.
The application contains 2,191 days, ending on 31 December 2023. All national
animal counts and daily contact counts for 2018–2022 match the retained
validation baseline. The 2019–2022 regional records also match exactly.
The source NetForge studies retain their declared study years and input files.

The raw files contain only 1 January for 2024 and no transport dates in 2025.
Those years cannot support a complete annual ledger. Their absence is not
represented as zero movement.

The reproducible audit and its exact executed source are retained under
`output/private/ledger-reconciliation-20261018/extension-2023`, with input hashes,
raw monthly coverage, a baseline comparison and `run-01/receipt.json`.

### Geographic evidence from GIAB

Under the consolidated source metadata, 4,573 domestic arrival groups in 2018
carry 560,796 animals without a complete regional assignment. The missing
endpoints involve 571 holdings. Their metadata have no coordinates; the 2022
I&R registry supplies no usable coordinates for them either. These arrivals
are present in the national ledger even though they cannot form regional links.

GIAB 2018 (`OHV19check18v3.xlsx`, sheet `OHV19check18`) records holding locations.
Matching UBN identifiers and joining those coordinates to the application's
CBS 2024 COROP polygons supports 552,974 domestic movements across 4,213 groups.
The same evidence assigns all 79,315 geographically unresolved 2018 exports.
There are 393 supported holding assignments across these channels. Every
available coordinate candidate for a holding must identify one consistent
region; a holding with candidates in different regions stays unresolved.

The target geography is 2024, as declared by the map's `jrstatcode` fields and
the metadata preparation. Three recovered holdings have different region codes
under the 2018 boundaries. Using their coordinates with the map's boundaries
keeps the regional definition consistent across displayed years. This is a
spatial assignment, not a change to a movement's date or quantity.

GIAB 2023 (`GIAB23vh.xlsx`, sheet `Giab23`) is also checked directly. It contains
no usable coordinates for any missing domestic or international endpoint in the
2018–2023 source ledger. Its usable coordinates are already included in the
consolidated metadata. GIAB herd counts cannot fill missing shipment records.

The evidence generator is `scripts/prepare-region-evidence.R`. Private evidence,
source hashes and supported assignments are retained in
`output/private/ledger-reconciliation-20261018/region-coverage/run-02`.
The end-to-end count audit is `region-coverage/audit-01/receipt.json`.

## Source reconciliation, 18 October 2026

The large difference between the HandelR export and the NetForge domestic ledger
comes from notification selection. The HandelR export adds domestic arrivals
(`AAN`) and domestic departures (`AFV`). These are reports from the two ends of
a movement. NetForge uses arrivals as its domestic counting convention.

### Provenance

The HandelR export is reproduced from these inputs:

- `A&R_WUR_DTM_IR_VARKEN_20220414.csv`, the transport extract;
- `A&R_WUR_UBN_IR_BEDRIJVEN_VARKEN_20220414.csv`, the holding metadata;
- `public/hex_grid.RDS`, the regional lookup;
- `R/data-preparation.R` at HandelR commit `5a62e1d`.

The aggregation function requires both holding identifiers, then sums counts
without selecting a notification type. In this extract, every retained row is
either AAN or AFV. Imports, exports and deaths lack an endpoint and are excluded.
The extract contains no SLA rows, so derived slaughter records do not explain
the difference between these two ledgers.

All four HandelR exports are byte identical to HerdLink commit `9428ed5`.
The files at commits `abcc0c5` and `1b7356e` have those same bytes. Rebuilding
from the transport extract, metadata, grid and pinned function reproduces every
regional cell: 143,373 daily, 54,504 weekly, 17,683 monthly and 2,698 yearly cells.
Each resolution sums to 215,533,552 animal movements.

The prepared NetForge source comes from HandelR's `workflow/prepare_pigs.R`:

- `varken_aanvoer_19feb.sas7bdat` supplies arrivals and imports;
- `varken_afvoer_plus_doo_11mar.sas7bdat` supplies exports and deaths;
- `prepared_meta.csv` supplies coordinates and COROP assignments.

The separate `varken_afvoer_19feb.sas7bdat` agrees with the departure and export
counts in the March file for every daily holding pair in 2018–2022. The March
file also contains deaths. Across the full extract, its only extra daily
departure group is a two-animal record in 2023.

### Exact count reconciliation

The common period is 1 January 2019 through 15 April 2022. Each row follows:
HandelR total minus AFV, plus the change in AAN between extracts, minus AAN
without a COROP assignment, equals the bundled domestic total.

| Period | HandelR AAN + AFV | Subtract AFV | AAN source revision | Subtract unmapped AAN | Bundled domestic |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2019 | 66,409,911 | 33,107,907 | +89,127 | 8 | 33,391,123 |
| 2020 | 65,558,920 | 32,655,041 | +132,837 | 9 | 33,036,707 |
| 2021 | 65,561,528 | 32,847,277 | +147,495 | 0 | 32,861,746 |
| 2022 through 15 April | 18,003,193 | 8,945,690 | +464,882 | 16 | 9,522,369 |
| Total | 215,533,552 | 107,555,915 | +834,341 | 33 | 108,811,945 |

The AAN source revisions also reconcile at daily holding-pair level:

| Period | Changed groups: count / net animals | Added groups: count / animals | Removed groups: count / animals |
| --- | ---: | ---: | ---: |
| 2019 | 510 / +89,126 | 1 / 3 | 1 / 2 |
| 2020 | 616 / +132,685 | 4 / 152 | 0 / 0 |
| 2021 | 649 / +144,547 | 13 / 2,950 | 1 / 2 |
| 2022 through 15 April | 203 / +39,285 | 2,311 / 427,756 | 20 / 2,159 |

These are differences in the supplied extracts. The files do not document the
administrative reason for each revision. A group is a date and directed holding
pair, not a uniquely identified shipment.

The bundled full-year 2022 domestic total is 32,567,076. Its 23,044,707 movements
after 15 April have no counterpart in the 2022 CSV extract. The bundled 2018
total using only the source metadata is 33,009,421; that year is also absent from the CSV extract. Comparisons
across all available years therefore mix count definitions and calendar coverage.

### The 2021 spike

On 20 December 2021, the transport CSV contains an AFV notification of 450,440
animals. The SAS extracts contain an AAN of 440 and an AFV of 440 for the same
date and directed holding pair. The departure quantity differs by exactly
450,000 animals between the extracts.

The CSV regional aggregate for CR35 to CR15 that day is 451,120. HerdLink commit
`0cc4fb0` replaces it with a reference-Monday mean of 1,486, subtracting 449,634
from each time resolution. This gives a 2021 total of 65,111,894 and an overall
total of 215,083,918 in that commit. To use the reconciliation table above with
that version, first add back the 449,634 adjustment.

The SAS arrival records support 736 animals on that regional route and day,
across three daily holding pairs. That is the count in the bundled AAN ledger.
The value 1,486 is a statistical substitution, not a source observation.

### What the validation establishes

An independent rebuild from the supplied SAS files matches all 2,009,391
observed date, holding-pair and event-type groups in `prepared_pigs.csv`, with
zero missing groups, extra groups or count differences. This check covers the
full supplied extract, including 2023 and its few records dated 1 January 2024.
The three SAS files each have unique record IDs and no duplicate full rows.

All 627,512 SLA groups can be reproduced from the preparation script's terminal
recipient rule and its one-day date shift. They are derived from AAN and must
not be counted as additional observed trade. There are no same-holding AAN
records to remove in the bundled 2018–2023 period.

For the 2018–2022 baseline using NetForge's supplied regions, the audit reproduces
218,953 daily, 83,535 weekly, 26,655 monthly and 3,526 yearly application cells.
All 23,928 regional international groups and all 5,478 daily channel checks
also match. No source or application data are modified by the audit.

The evidence supports the arithmetic of an AAN ledger. It does not establish
that arrivals and departures are interchangeable in every record. In the 2022
CSV extract, 97.70%, 97.68% and 96.44% of AFV volume in 2019, 2020 and 2021 can
be matched to AAN volume on the same date and directed holding pair, using the
smaller count when the two disagree. The rest is not proven to represent
additional movements; date and quantity discrepancies remain possible.

The SAS files retain this disagreement. For example, their 2019 departure
total is 33,419,263, compared with 33,391,131 complete arrivals. Departure-only
daily pairs carry 657,586 animals; arrival-only daily pairs carry 633,847.
Summing the two channels double counts their large overlap. Combining their
unmatched portions would require a documented shipment identity or a source
reconciliation rule. Neither is supplied by these extracts.

The 2018 excluded AAN record of 209,562 is present in the raw SAS. Its same-day
departure counterpart reports 20. Both have status DG. The disagreement is
evidence of a source inconsistency, but does not establish which quantity is
correct. Excluding the arrival remains a sensitivity choice. Restoring it
would add 209,562 to the mapped 2018 domestic total. It remains excluded from
both the national ledger and the regional projection with GIAB evidence.

These checks verify counts and the use of the supplied regional assignments.
They do not independently establish the accuracy of every holding's location,
the true quantity of every shipment, or complete national reporting coverage.

### Reproduction and source retention

`scripts/reconcile-trade-sources.R` reads a private JSON configuration containing
source paths and the exact declared exclusion. It uses R packages data.table,
haven, jsonlite, dplyr, lubridate and sf, plus the system SHA256 utility. Its
assertions check duplicate keys, missing endpoints, count conservation and
equality of every compared cell. It refuses an existing output directory.

The audit configuration, input digests, Git lineage, detailed differences and
runtime receipt are retained under the ignored directory
`output/private/ledger-reconciliation-20261018`. Holding identifiers stay there.
The source-only baseline validation is `run-02/receipt.json`; validation with
the 2018 geographic evidence is `region-coverage/audit-01/receipt.json`.

```bash
Rscript scripts/reconcile-trade-sources.R \
  output/private/ledger-reconciliation-20261018/region-coverage/audit-config.json \
  /private/tmp/herdlink-source-audit
```

The three supplied SAS files have a private archive outside the repository at
the shared `data-private/rvo/pigs` source location. Each archived file matches
its Downloads source by SHA256 and size and is read only. The Downloads files
are retained. The data owner confirms that recovery copies are secured; this
audit does not create or test another recovery copy.

## Arrival and departure disagreements

The unmatched-report audit covers 2018–2022 and uses all supplied records through
1 January 2024 as comparison context. Both directions retain their raw report
multiplicity. Equal quantities reported twice within one channel are not silently
collapsed into a single load. The declared 2018 outlier and its 20-animal
departure counterpart are kept outside candidate recovery counts.

### What the source fields identify

The SAS column label defines `ID` as a unique message identifier. There are no
shared IDs between the arrival and departure channels. The files contain
transport dates, report receipt dates, holding pairs, quantities and pig
categories. They contain no shared journey identifier or vehicle registration.
`DG` means final registration and `VG` means provisional registration; neither
label establishes that a quantity or holding identifier is free of error.

The source distinguishes event dates from receipt dates. Receipt dates cannot
be substituted for transport dates to force agreement. Pig categories are
available in the SAS files even though the prepared movement CSV omits them.

The [2019 government description of I&R](https://zoek.officielebekendmakingen.nl/kst-28286-1058.html)
states that both parties report a domestic movement and that missing or
inconsistent counter-reports trigger checks. RVO's
[reporting guidance](https://www.rvo.nl/onderwerpen/varkens-melden) includes
vehicle registration among the reported fields and describes corrections to
missing or inconsistent reports. Those vehicle details and correction links
are absent from these SAS extracts.

### Departure evidence without an arrival on the same day

| Year | Departure animals without a same-day arrival | Unique adjacent-day candidate, identical categories and quantities | Final departure animals on routes absent from all arrivals |
| --- | ---: | ---: | ---: |
| 2018 | 697,384 | 599,479 | 83 |
| 2019 | 657,586 | 558,998 | 260 |
| 2020 | 661,818 | 556,863 | 257 |
| 2021 | 620,864 | 525,129 | 281 |
| 2022 | 545,556 | 470,133 | 7 |
| Total | 3,183,208 | 2,710,602 | 888 |

Of the 3,183,208 departure animals in the first column, 3,181,473 (99.945%) have
an arrival on the same directed holding pair one day away. This statistic does
not require equal quantities and does not establish shipment identity.

The middle column applies a stronger diagnostic: the daily totals and the
multiset of pig categories and report quantities agree, and each group has
exactly one counterpart among candidates one day away. These 24,383 candidate
pairs account for 85.15% of the departure-only volume. No arrival or departure
group is reused within this candidate set. Other identical loads on more distant
dates may still exist. The one-day interval is a diagnostic comparison, not an
adopted matching rule.

Some candidates place arrival before departure. The extracts do not establish
whether overnight transport, date entry, or another reporting convention causes
each disagreement. The 2022 CSV has departure timestamps for only part of its
records. Among the adjacent-day candidates, 48 pairs with unchanged quantities
also have identical complete timestamp multisets in that CSV; only two have a
shared time other than midnight. Those partial fields cannot resolve the full
2018–2022 dataset.

The final column identifies a much smaller set: 888 animals in 147 final
departure reports, grouped into 146 directed holding-pair days, whose routes
have no arrival report anywhere in the supplied extract. Both endpoints have
COROP assignments. None is a same-holding movement. Their recipients have no
arrival reports at all in the extract, and there is no exact reversed-route
arrival with the same date, category and quantity.

There are another 275 animals in 18 provisional reports on routes absent from
arrivals, all dated in 2022. These are kept separate from the 888 final-report
animals. The 888 are credible candidates for omitted movement evidence, not
verified additional shipments. A mistaken endpoint or notification is still
possible. They are also not an upper bound on omissions: other unresolved
groups on established routes can contain missing reports.

A review supplement contains the 888 final-report animals once, grouped into
regional daily rows. Its directed holding pairs do not overlap any complete AAN
holding pair in the supplied extract, so it cannot duplicate an arrival with
the same recorded endpoints. This is a check on recorded fields, not proof that
all underlying reports describe distinct, correctly recorded transports. The
supplement remains separate from the application ledger.

### Quantity conflicts and reconciliation scope

Excluding the declared 2018 outlier, 18,927 daily holding pairs have both arrival
and departure reports but different totals. Departure totals exceed arrivals
by 347,917 animals across the groups where departures are larger. Arrival
totals exceed departures by 355,821 across the other groups. Selecting the
larger value would add unverified volume; selecting the smaller value would
discard unverified volume. Neither operation resolves the source disagreement.

A reconciliation record can retain both report sets without counting both:

- Matching same-day totals share one movement total, with both sources retained.
  The audit also distinguishes identical report multisets from equal totals
  reported using different quantities or categories.
- Adjacent-date candidates retain both dates and a candidate link. The arrival
  count remains counted once; the departure does not become additional volume.
- Conflicting quantities retain both observations and an unresolved status.
  They receive no invented combined quantity.
- Departure-only evidence remains separately identifiable. Routes absent from
  arrivals are a review subset, not a general ingestion rule: that rule would
  overlook missing movements on established routes.

The AAN ledger therefore omits some departure evidence, but adding every
departure without a same-day counterpart would likely count many movements
twice. A complete combined shipment ledger needs source linkage or corroborating
transport records for unresolved cases. A final registration status alone does
not provide that linkage. The audit does not promote candidate links or
departure-only counts into application assets.

### Checks and retained evidence

`scripts/audit-unmatched-trade.R` classifies every eligible notification and
conserves every source count. Its fixtures cover repeated equal-sized reports,
split quantities, conflicting totals, shifted dates, absent routes and missing
endpoints. A separate Python check reproduces all 32,533 nearest-arrival date
comparisons and the adjacent candidate selection without reusing groups.

Private records are retained under
`output/private/ledger-reconciliation-20261018/unmatched`. The source labels,
aggregate tables, detailed candidates, exact executed scripts and receipts are
included. `run-02/receipt.json` and `independent-check.json` record the checks.
Holding identifiers and notification IDs remain outside tracked documents.
`departure-review-supplement.csv` and its JSON manifest retain the 888-animal
review subset and the checks establishing its scope.

```bash
Rscript scripts/audit-unmatched-trade.R \
  output/private/ledger-reconciliation-20261018/unmatched/config.json \
  /private/tmp/herdlink-unmatched-audit
```
