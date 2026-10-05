import csv
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from statistics import mean
import unittest


DATA = Path(__file__).resolve().parents[1] / "src/assets/data"


def read_ledger(resolution):
    with (DATA / f"{resolution}_aggregation.csv").open(newline="") as source:
        return [
            (date.fromisoformat(row["time"]), row["COROP_LEV"], row["COROP_AFN"], int(row["AANTAL"]))
            for row in csv.DictReader(source)
        ]


class TradeAggregationTest(unittest.TestCase):
    def test_corrected_entry_and_time_aggregates(self):
        daily = read_ledger("daily")
        reference = [
            count for day, sender, receiver, count in daily
            if (sender, receiver) == ("CR35", "CR15")
            and day.year in (2019, 2020) and day.month == 12 and day.weekday() == 0
        ]
        self.assertEqual(len(reference), 6)
        self.assertEqual(sum(reference), 8918)
        replacement = round(mean(reference))
        self.assertEqual(replacement, 1486)
        self.assertNotIn(replacement, reference)
        self.assertEqual([
            count for day, sender, receiver, count in daily
            if (day, sender, receiver) == (date(2021, 12, 20), "CR35", "CR15")
        ], [replacement])
        self.assertEqual(sum(count for _, _, _, count in daily), 215083918)

        for resolution in ("daily", "weekly", "monthly", "yearly"):
            with self.subTest(resolution=resolution):
                expected = Counter()
                for day, sender, receiver, count in daily:
                    if resolution == "weekly":
                        day -= timedelta(days=(day.weekday() + 1) % 7)
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
