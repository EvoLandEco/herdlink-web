"""Check that permit diagnostics preserve zero counts, unknown dates and repeated rows."""

import csv
import importlib.util
import io
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "krd_audit", Path(__file__).resolve().parents[1] / "scripts/audit-krd-population.py"
)
krd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(krd)


class KrdAuditTest(unittest.TestCase):
    def test_record_semantics_and_rejected_formats(self):
        def export(count="12", decision="2023-01-01", authority="OD", object_id="1"):
            output = io.StringIO(newline="")
            writer = csv.DictWriter(output, fieldnames=krd.COLUMNS, delimiter="\t")
            writer.writeheader()
            pig = {"Bronhouder": authority, "VTHobject ID": object_id, "Aantal dieren": count,
                   "Besluitdatum": decision, "Diercategroei omschrijving": krd.PIG_CATEGORIES[0]}
            writer.writerows([pig, pig, {**pig, "VTHobject ID": "2", "Aantal dieren": "0",
                                        "Besluitdatum": "1900-01-01"},
                              {**pig, "VTHobject ID": "3", "Aantal dieren": "8",
                               "Besluitdatum": "", "Diercategroei omschrijving": "Paarden"}])
            return output.getvalue().encode("cp1252")

        report = krd.audit(export(), "dieren.csv", "2026-09-16")
        pigs = report["pigCategoryRows"]
        self.assertEqual(pigs["rows"], 3)
        self.assertEqual(pigs["zeroCountRows"], 1)
        self.assertEqual(pigs["positiveCountKeys"], 1)
        self.assertEqual(pigs["repeatedIdenticalExportRows"], 1)
        self.assertEqual(pigs["unknownDecisionDateRows"], 1)
        self.assertEqual(pigs["decisionRowsAfterLedgerEnd"], 2)
        self.assertEqual(report["allAnimalRows"]["unknownDecisionDateRows"], 2)
        self.assertEqual(krd.audit(export(), "dieren.csv", "2026-09-16"), report)
        for count, decision in [("", "2023-01-01"), ("1.000", "2023-01-01"),
                                ("-1", "2023-01-01"), ("12", "20230229"),
                                ("12", "2023-02-29")]:
            with self.subTest(count=count, decision=decision), self.assertRaises(ValueError):
                krd.read_rows(export(count, decision))
        for key in ("authority", "object_id"):
            with self.subTest(key=key), self.assertRaises(ValueError):
                krd.read_rows(export(**{key: " "}))


if __name__ == "__main__":
    unittest.main()
