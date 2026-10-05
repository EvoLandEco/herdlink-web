# Ledger data correction

The bundled ledger uses **1,486 animal movements** for
**20 December 2021, CR35 → CR15** (Noordoost-Noord-Brabant → Arnhem/Nijmegen).
The supplied daily aggregate is **451,120**, about 91 times the next-largest
daily value on this route, 4,981. A regional daily aggregate can contain several
records; it does not identify a single shipment.

The replacement is the rounded arithmetic mean of the same route's recorded
December Mondays in 2019 and 2020. Matching the route, month and weekday accounts
for differences in route volume and the weekly trading pattern. Dates without
a supplied route record are excluded from the reference sample for a recorded day's
volume.

| Reference date | Animal movements |
| --- | ---: |
| 2019-12-09 | 4 |
| 2019-12-16 | 2,420 |
| 2019-12-23 | 1,649 |
| 2019-12-30 | 361 |
| 2020-12-14 | 1,650 |
| 2020-12-21 | 2,834 |

The six values sum to 8,918; their mean is 1,486.33. Rounding gives 1,486,
which is distinct from every reference value. This calculation supplies the
replacement; the supplied aggregate remains recorded below for traceability.

| File | Period label | Supplied aggregate | Corrected aggregate |
| --- | --- | ---: | ---: |
| `daily_aggregation.csv` | 2021-12-20 | 451,120 | 1,486 |
| `weekly_aggregation.csv` | 2021-12-19 | 451,406 | 1,772 |
| `monthly_aggregation.csv` | 2021-12-01 | 458,223 | 8,589 |
| `yearly_aggregation.csv` | 2021-01-01 | 536,060 | 86,426 |

Each file differs from its supplied total by 449,634 and sums to 215,083,918.
Bundled weeks start on Sunday. All other route and date values retain their
supplied counts. The source records and the broader accounting questions in
[Regional pig movement summaries](trade-preparation.md) remain separate from
this correction.

Check the replacement and every time aggregate with:

```bash
python3 -m unittest discover -s tests -p test_trade_aggregation.py
```
