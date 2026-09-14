#!/usr/bin/env python3
"""Compare published annual pig stocks with recorded movements by COROP.

Run from any directory. Output lists zero or missing census regions and their
positive movement records in the same year and across the full daily ledger.
A stock observation and movement records describe different quantities and dates.
"""

import csv
import json
import math
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
census = json.loads((ROOT / "src/assets/data/pig-census.json").read_text())
flows = defaultdict(lambda: {"records": 0, "movements": 0})
with (ROOT / "src/assets/data/daily_aggregation.csv").open() as source:
    for row in csv.DictReader(source):
        weight = float(row["AANTAL"])
        if not math.isfinite(weight) or weight <= 0:
            continue
        for region in {row["COROP_LEV"], row["COROP_AFN"]}:
            for year in {row["time"][:4], "all"}:
                flow = flows[year, region]
                flow["records"] += 1
                flow["movements"] += weight

results = []
for year, regions in census["years"].items():
    results.append({
        "censusYear": year,
        "referenceDate": f"{year}-04-01",
        "publishedPigTotal": sum(row["pigs"] for row in regions.values() if row["pigs"] is not None),
        "regions": [{
            "region": region,
            "pigs": row["pigs"],
            "holdings": row["holdings"],
            "sameYearFlows": flows[year, region],
            "fullLedgerFlows": flows["all", region],
        } for region, row in regions.items() if row["pigs"] is None or row["pigs"] == 0],
    })

print(json.dumps({
    "method": "Each positive ledger row contributes once per incident region, including local movements once. Full-ledger totals repeat for each census year in which the region has zero or unavailable pig stock.",
    "source": census["metadata"]["sources"][0]["url"],
    "results": results,
}, indent=2))
