# Regional pig movement summaries

`scripts/prepare-trade-ledger.py` reads the prepared pig transport CSV produced
by HandelR's `workflow/prepare_pigs.R`. It retains domestic arrivals (`AAN`),
international imports (`IMP`) and international exports (`EXP`). The input must
contain event types, ISO dates, animal counts and the two COROP columns.

```bash
python3 scripts/prepare-trade-ledger.py /path/to/prepared_pigs.csv \
  --start 2019-01-01 --end 2022-04-15 \
  --output /private/tmp/herdlink-trade-review
```

The output directory must not exist. It receives daily, weekly, monthly and
yearly movement CSVs and a manifest with the source checksum and accounting
totals. Weeks start on Monday. Bins at the edges of the requested period can be
partial; 2022 ends on 15 April in this example. An absent row means no supplied
record for that route and date, not proof that no movement occurred.

The CSV columns are `time`, `source`, `target`, `movement_type`, `animals` and
`source_rows`. Animal movements can count the same pig at different stages of
its life. They do not measure unique pigs or animals present on a farm.
`source_rows` counts prepared records: the upstream preparation groups records
by day, holding pair and event type, so it is not a shipment count.

## Event accounting

| Event | Treatment |
| --- | --- |
| AAN | Dutch source region to Dutch destination region; retained once |
| IMP | ABROAD to Dutch destination region |
| EXP | Dutch source region to ABROAD |
| AFV | Excluded because departure reports can describe the same domestic movements as arrivals |
| DOO | Excluded because deaths are not live animal movements |
| SLA | Excluded because these rows are slaughter estimates derived from AAN arrivals in the prepared file |

Within-region movements remain in the output. `ABROAD` pools foreign partners;
the supplied prepared file has no country field. A missing foreign holding ID
or coordinate does not remove an import or export. Missing Dutch COROP codes
become `NL_UNMAPPED`, with their volume recorded in the manifest. They are never
classified as international movements. Invalid region codes, event types,
dates and animal counts stop the run.

The HandelR function `aggregate_by_time_unit` requires both holding IDs before
aggregation and does not retain event type. That condition excludes international
records with a missing foreign ID. The prepared pig file preserves `IMP` and
`EXP`, so it supplies the event information needed here. A regional CSV that
lacks event type cannot recover those records or distinguish an unmapped Dutch
endpoint from a foreign endpoint.

These research summaries contain no holding IDs or coordinates. They are kept
outside the app assets for review. Their schema differs from the bundled
HerdLink ledger. `ABROAD` and `NL_UNMAPPED` have no defined population, geography
or disease state in the simulation. Including international trade in the
simulation requires those model choices; the summary script does not make them.

## Workshop evidence

The prepared file inspected on 30 September 2026 contains these volumes for the
complete years 2019–2021:

| Year | Domestic arrivals | Recorded imports | Recorded exports |
| --- | ---: | ---: | ---: |
| 2019 | 33,391,131 | 77,941 | 8,980,302 |
| 2020 | 33,036,716 | 102,050 | 8,865,527 |
| 2021 | 32,861,746 | 94,484 | 7,554,092 |

These are counts in the supplied records. Complete national coverage, especially
for imports, is not established. The source country and pig production stage
cannot be recovered from this file.

Among domestic arrivals with both endpoints mapped in 2019–2021, 50.4% of volume
leaves Noordoost-Noord-Brabant, Zuidoost-Noord-Brabant or Noord-Limburg. The
denominator is 99,289,576 animal movements and includes within-region trade.
Within-region trade accounts for 33.6% of that denominator. Utrecht ranks third
in incoming volume but outside the six largest sending regions. These findings
support a discussion of concentration, local movement and direction. A receiving
region cannot be labelled as a slaughter region from trade totals alone.

The geographic concentration agrees with the sector description in
[Wageningen Economic Research's State of Agriculture and Food 2021, section 2.3.6](https://www.cbs.nl/-/media/_pdf/2022/03/staat-van-landbouw-en-voedsel.pdf).
That account describes specialised sow and finishing businesses, combined
production, concentrated slaughter activity and trade across national borders.
Use that published context to explain the production chain. The regional
records do not identify the role of each farm. Live animal trade and meat trade
must be shown as separate parts of the chain.

For 1 January 2019 through 15 April 2022, the supplied daily ledger sums to
215,533,552 animal movements; prepared `AAN` rows sum to 108,811,978. Of 143,373
bundled date/route rows, 88,517 are exactly twice the matching prepared `AAN`
volume. This is consistent with repeated reporting, but does not establish its
cause. Other route totals differ by amounts other than a factor of two. The bundled ledger
needs source reconciliation before its absolute volumes are presented as
counts of physical movements. Do not divide all weights by two: the discrepancy
is not uniform. Workshop planning can use the broad regional patterns while
that check remains open. The application assets use a documented
[correction for 20 December 2021](trade-data-corrections.md) and sum to
215,083,918; that correction does not resolve the source accounting differences.

Research on the full farm network is ongoing. Those data are not yet permitted
for public display.

## Check

```bash
python3 -m unittest discover -s tests -p test_trade_preparation.py
```

The check covers event selection, missing foreign IDs, unmapped Dutch endpoints,
within-region movements, summed records, year boundaries, conservation across
time resolutions, invalid input and protection against overwriting an output.
