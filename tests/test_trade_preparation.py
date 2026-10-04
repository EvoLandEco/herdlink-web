"""Check movement accounting, international endpoints and time boundaries."""

import csv
from datetime import date
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location(
    "trade", Path(__file__).resolve().parents[1] / "scripts/prepare-trade-ledger.py"
)
trade = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trade)


class TradePreparationTest(unittest.TestCase):
    def test_accounting_and_validation(self):
        header = "TRANSPORT_DATUM,TYPE_MELDING,AANTAL_DIEREN,COROP_LEV,COROP_AFN\n"
        rows = [
            "2020-12-31,AAN,10,CR35,CR36", "2020-12-31,AAN,5,CR35,CR36",
            "2021-01-01,AAN,8,CR35,CR35", "2021-01-01,IMP,7,NA,CR35",
            "2021-01-02,EXP,20,CR36,NA", "2021-01-03,AAN,3,NA,CR35",
            "2021-01-03,IMP,2,NA,NA", "2021-01-03,EXP,4,NA,NA",
            "2021-01-01,AFV,10,CR35,CR36", "2021-01-01,SLA,10,CR35,CR36",
            "2021-01-01,DOO,2,CR35,NA", "2021-01-04,EXP,100,CR36,NA",
        ]
        contents = header + "\n".join(rows) + "\n"
        start, end = date(2020, 12, 31), date(2021, 1, 3)
        daily, audit = trade.aggregate(io.StringIO(contents), start, end)
        self.assertEqual(sum(v["animals"] for v in daily.values()), 59)
        self.assertEqual(sum(v["source_rows"] for v in daily.values()), 8)
        self.assertEqual(daily[(start, "CR35", "CR36", "AAN")]["animals"], 15)
        self.assertEqual(daily[(date(2021, 1, 1), "ABROAD", "CR35", "IMP")]["animals"], 7)
        self.assertEqual(daily[(date(2021, 1, 2), "CR36", "ABROAD", "EXP")]["animals"], 20)
        self.assertEqual(audit["unmapped_domestic_endpoints"]["AAN"]["animals"], 3)
        weekly = trade.group_period(daily, "weekly")
        self.assertEqual({key[0] for key in weekly}, {date(2020, 12, 28)})
        self.assertEqual(sum(v["animals"] for v in weekly.values()), 59)
        with tempfile.TemporaryDirectory() as tmp:
            source, output = Path(tmp) / "input.csv", Path(tmp) / "result"
            source.write_text(contents)
            trade.prepare(source, output, start, end)
            manifest = json.loads((output / "manifest.json").read_text())
            for filename in manifest["files"]:
                with (output / filename).open() as stream:
                    records = list(csv.DictReader(stream))
                self.assertEqual(sum(int(row["animals"]) for row in records), 59)
                self.assertEqual(sum(int(row["source_rows"]) for row in records), 8)
            with self.assertRaises(FileExistsError):
                trade.prepare(source, output, start, end)
        for bad in ["2021-01-01,WHAT,1,CR35,CR36", "2021-01-01,AAN,-1,CR35,CR36",
                    "2021-01-01,AAN,1.5,CR35,CR36", "2021-01-01,AAN,NA,CR35,CR36",
                    "2021-01-01,AAN,1,CR41,CR36", "2021-01-01,IMP,1,CR35,CR36",
                    "2021-02-30,AAN,1,CR35,CR36", "2021-01-01,AAN,1,CR35"]:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                trade.aggregate(io.StringIO(header + bad), start, end)
        with self.assertRaises(ValueError):
            trade.aggregate(io.StringIO(contents), end, start)


if __name__ == "__main__":
    unittest.main()
