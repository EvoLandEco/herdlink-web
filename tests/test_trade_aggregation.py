import csv
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
import hashlib
import json
import unittest


DATA = Path(__file__).resolve().parents[1] / "src/assets/data"


def read_ledger(resolution):
    with (DATA / f"{resolution}_aggregation.csv").open(newline="") as source:
        return [
            (date.fromisoformat(row["time"]), row["COROP_LEV"], row["COROP_AFN"], int(row["AANTAL"]))
            for row in csv.DictReader(source)
        ]


class TradeAggregationTest(unittest.TestCase):
    def test_source_accounting_and_time_aggregates(self):
        daily = read_ledger("daily")
        bundle = json.loads((DATA / "international_flows.json").read_text())
        expected_totals = [33570217, 33391131, 33036716, 32861746, 32570225, 31091800]
        self.assertEqual([annual["year"] for annual in bundle["years"]], list(range(2018, 2024)))
        for annual, expected in zip(bundle["years"], expected_totals):
            mapped = sum(count for day, _, _, count in daily if day.year == annual["year"])
            unmapped = sum(day["unmappedDomestic"] for day in annual["days"])
            self.assertEqual(mapped + unmapped, expected)
        for filename, digest in bundle["source"]["assets"].items():
            self.assertEqual(hashlib.sha256((DATA / filename).read_bytes()).hexdigest(), digest)
        self.assertEqual(min(day for day, *_ in daily), date(2018, 1, 1))
        self.assertEqual(max(day for day, *_ in daily), date(2023, 12, 31))
        self.assertEqual(sum(count for day, _, _, count in daily if day.year == 2018), 33562395)
        self.assertEqual(sum(day["unmappedDomestic"] for day in bundle["years"][0]["days"]), 7822)

        for resolution in ("daily", "weekly", "monthly", "yearly"):
            with self.subTest(resolution=resolution):
                expected = Counter()
                for day, sender, receiver, count in daily:
                    if resolution == "weekly":
                        day -= timedelta(days=day.weekday())
                    elif resolution == "monthly":
                        day = day.replace(day=1)
                    elif resolution == "yearly":
                        day = day.replace(month=1, day=1)
                    expected[(day, sender, receiver)] += count
                records = read_ledger(resolution)
                actual = {(day, sender, receiver): count for day, sender, receiver, count in records}
                self.assertEqual(len(actual), len(records))
                self.assertEqual(dict(expected), actual)


if __name__ == "__main__":
    unittest.main()
