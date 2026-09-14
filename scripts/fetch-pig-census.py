#!/usr/bin/env python3
"""Build COROP pig census densities from public CBS StatLine tables.

Run with Python 3. The default command downloads the source records and writes
src/assets/data/pig-census.json. Use --check to validate the bundled file.
The script uses published COROP totals and preserves missing values as null.
"""

import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/assets/data/pig-census.json"
YEARS = range(2018, 2023)
REGIONS = {f"CR{index:02}" for index in range(1, 41)}
API = "https://opendata.cbs.nl/ODataApi/OData"
PERIOD_FILTER = " or ".join(f"Perioden eq '{year}JJ00'" for year in YEARS)


def fetch(table, resource, **query):
    url = f"{API}/{table}/{resource}?{urlencode(query)}"
    rows = []
    while url:
        with urlopen(url, timeout=60) as response:
            page = json.load(response)
        rows.extend(page["value"])
        url = page.get("odata.nextLink")
    return rows


def density(count, area):
    return None if count is None or area is None else round(count / area, 6)


def index_rows(rows):
    records = {}
    for row in rows:
        key = (row["Perioden"][:4], row["RegioS"].strip())
        if key in records:
            raise ValueError(f"Duplicate CBS record: {key}")
        records[key] = row
    expected = {(str(year), region) for year in YEARS for region in REGIONS}
    if set(records) != expected:
        raise ValueError("CBS records must cover all 40 COROP regions in each year")
    return records


def validate(data):
    assert density(0, 10) == 0
    assert density(None, 10) is None
    assert density(10, None) is None
    assert density(25, 10) == 2.5
    assert set(data["years"]) == {str(year) for year in YEARS}
    for regions in data["years"].values():
        assert set(regions) == REGIONS
        for row in regions.values():
            for key in ("pigs", "holdings", "landAreaKm2"):
                value = row[key]
                assert value is None or (
                    isinstance(value, (int, float))
                    and not isinstance(value, bool)
                    and math.isfinite(value)
                    and value >= 0
                ), (key, value)
            assert row["landAreaKm2"] is None or row["landAreaKm2"] > 0
            for key in ("pigs", "holdings"):
                assert row[key] is None or int(row[key]) == row[key]
                assert row[f"{key}PerKm2"] == density(row[key], row["landAreaKm2"])


def build():
    census = index_rows(fetch("80781ned", "TypedDataSet", **{
        "$filter": f"startswith(RegioS,'CR') and ({PERIOD_FILTER})",
        "$select": "RegioS,Perioden,VarkensTotaal_121,VarkensTotaal_136",
    }))
    areas = index_rows(fetch("70072ned", "TypedDataSet", **{
        "$filter": f"startswith(RegioS,'CR') and ({PERIOD_FILTER})",
        "$select": "RegioS,Perioden,Land_219,Varkens_151",
    }))
    years = {str(year): {} for year in YEARS}
    for year, region in sorted(census):
        pigs = census[year, region]["VarkensTotaal_121"]
        holdings = census[year, region]["VarkensTotaal_136"]
        area = areas[year, region]["Land_219"]
        if pigs != areas[year, region]["Varkens_151"]:
            raise ValueError(f"CBS pig totals disagree for {region}, {year}")
        years[year][region] = {
            "pigs": pigs,
            "holdings": holdings,
            "landAreaKm2": area,
            "pigsPerKm2": density(pigs, area),
            "holdingsPerKm2": density(holdings, area),
        }
    return {
        "metadata": {
            "title": "Pig census by COROP region, 2018–2022",
            "publisher": "Statistics Netherlands (CBS)",
            "license": "CC BY 4.0",
            "licenseUrl": "https://www.cbs.nl/en-gb/about-us/website/copyright",
            "retrievedAt": datetime.now(timezone.utc).date().isoformat(),
            "referenceDate": "1 April of each census year",
            "method": "Published COROP pig and pig-holding totals divided by the same year's published land area in square kilometres. Densities use land area and are rounded to six decimal places.",
            "missingValues": "Null marks an unavailable CBS value or a density whose count or land area is unavailable. Published zeros retain their value.",
            "geography": "Census values retain the COROP classification of their reference year. The map displays 2024 COROP boundaries.",
            "landAreaSurveyYears": {"2018": 2015, "2019": 2015, "2020": 2015, "2021": 2015, "2022": 2017},
            "caveats": [
                "Holdings count businesses with pigs at their main establishment address. A business can keep animals at other sites.",
                "From 2018, CBS adjusts fattening-pig counts for temporary empty housing using the prior year's declaration. Agricultural census totals can therefore differ from livestock population tables.",
                "Land areas use the CBS land-use survey listed for each year. Changes in densities can reflect land-area measurement and regional boundary changes as well as animal and holding counts.",
                "Annual census observations describe the region's agricultural population. They provide map context alongside trade records; the simulation uses its own population estimates.",
            ],
            "sources": [
                {
                    "table": "80781ned",
                    "title": "Landbouw; gewassen, dieren en grondgebruik naar gemeente",
                    "url": "https://www.cbs.nl/nl-nl/cijfers/detail/80781ned",
                    "api": f"{API}/80781ned",
                    "fields": {"pigs": "VarkensTotaal_121", "holdings": "VarkensTotaal_136"},
                },
                {
                    "table": "70072ned",
                    "title": "Regionale kerncijfers Nederland",
                    "url": "https://www.cbs.nl/nl-nl/cijfers/detail/70072ned",
                    "api": f"{API}/70072ned",
                    "fields": {"landAreaKm2": "Land_219", "pigTotalCrossCheck": "Varkens_151"},
                },
            ],
        },
        "years": years,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate the bundled file without downloading data")
    args = parser.parse_args()
    data = json.loads(OUTPUT.read_text()) if args.check else build()
    validate(data)
    if not args.check:
        OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"Validated {len(YEARS) * len(REGIONS)} COROP census records: {OUTPUT}")
