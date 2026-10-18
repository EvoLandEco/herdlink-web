"""Check source bindings, pooled port roles and national daily accounting."""

from datetime import date
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("pooled", Path(__file__).resolve().parents[1] / "scripts/prepare-pooled-flows.py")
pooled = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pooled)


class PooledFlowsTest(unittest.TestCase):
    def test_regional_evidence_binds_source_and_rejects_ambiguous_keys(self):
        evidence = {"format": "herdlink-region-evidence-v1", "year": 2018, "geography": "CBS COROP 2024",
                    "ledgerSha256": "a" * 64, "sourceSha256": {k: "b" * 64 for k in ["giab2018", "corop2024", "script"]},
                    "assignments": [[1, "CR01"], [2, "CR40"]]}
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "evidence.json"
            path.write_text(json.dumps(evidence))
            assignments, sources = pooled.read_regional_evidence(path, "a" * 64)
            self.assertEqual(assignments, {1: "CR01", 2: "CR40"})
            self.assertEqual(sources["regional_evidence.json"], hashlib.sha256(path.read_bytes()).hexdigest())
            cases = [{"ledgerSha256": "c" * 64}, {"year": 2023}, {"geography": "CBS COROP 2018"},
                     {"sourceSha256": {}}, {"assignments": [[1, "CR01"], [1, "CR02"]]},
                     {"assignments": [[0, "CR01"]]}, {"assignments": [[True, "CR01"]]},
                     {"assignments": [[1, "CR41"]]}, {"assignments": []}]
            for patch in cases:
                with self.subTest(patch=patch):
                    path.write_text(json.dumps({**evidence, **patch}))
                    with self.assertRaises(ValueError):
                        pooled.read_regional_evidence(path, "a" * 64)

    def test_ledger_contract_rejects_partial_years_and_calendar_gaps(self):
        with tempfile.TemporaryDirectory() as temp:
            for years in [[], list(range(2018, 2025)), list(range(2018, 2026)),
                          [2018, 2020, 2022, 2023], list(range(2018, 2024)) + [2023]]:
                with self.subTest(years=years), self.assertRaisesRegex(ValueError, "complete calendars"):
                    pooled.prepare_from_ledger(Path(temp), years)

    def write_source(self, root, rows=None, nodes="0,0\n1,0\n2,1\n3,2\n"):
        folder = root / "data/2020"
        folder.mkdir(parents=True, exist_ok=True)
        ordinal = date(2020, 1, 1).toordinal()
        if rows is None:
            rows = f"2,0,{ordinal},0,12\n0,1,{ordinal},0,8\n1,3,{ordinal + 59},59,7\n"
        (folder / "nodes.csv").write_text("node_id,type\n" + nodes)
        (folder / "observed_edges.csv").write_text("u,i,ts,snapshot,trade\n" + rows)
        manifest = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.iterdir()}
        (root / "DATA_MANIFEST.json").write_text(json.dumps(manifest))
        (root / "input_provenance.json").write_text(json.dumps({
            "status": "PASS", "output_sha256": manifest, "exclusion_2018": "Declared exclusion.",
            "years": [{"year": 2020, "holdings": 2, "calendar_days": 366, "combined_active_holdings": 2,
                       "combined_contacts": 3, "domestic_contacts": 1, "import_contacts": 1, "export_contacts": 1,
                       "combined_animals": 27, "domestic_animals": 8, "boundary_animals": {"import": 12, "export": 7}}],
        }))

    def test_annual_totals_full_calendar_and_no_holding_keys(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.write_source(root)
            result = pooled.prepare(root, [2020])
            annual = result["years"][0]
            self.assertEqual((annual["holdings"], annual["activeHoldings"]), (2, 2))
            self.assertEqual(len(annual["days"]), 366)
            self.assertEqual(annual["days"][59]["date"], "2020-02-29")
            self.assertEqual(annual["days"][59]["exports"], {"animals": 7, "contacts": 1})
            self.assertEqual(annual["days"][1]["imports"], {"animals": 0, "contacts": 0})
            self.assertNotIn("node_id", json.dumps(result))
            self.assertNotIn(temp, json.dumps(result))
            with (root / "data/2020/observed_edges.csv").open("a") as stream:
                stream.write("\n")
            with self.assertRaisesRegex(ValueError, "checksum mismatch"):
                pooled.prepare(root, [2020])

    def test_invalid_roles_dates_counts_duplicates_and_provenance(self):
        ordinal = date(2020, 1, 1).toordinal()
        cases = [
            f"0,2,{ordinal},0,1\n", f"3,0,{ordinal},0,1\n", f"2,3,{ordinal},0,1\n",
            f"0,0,{ordinal},0,1\n", f"0,9,{ordinal},0,1\n", f"2,0,{ordinal},1,1\n",
            f"2,0,{ordinal-1},0,1\n", f"2,0,{ordinal},0,0\n", f"2,0,{ordinal},0,1.5\n",
            f"2,0,{ordinal},0,-1\n", f"2,0,{ordinal},0,{2**53}\n",
            f"2,0,{ordinal},0,1\n" * 2, f"2,0,{ordinal},0,1\n",
            f"2,0,{ordinal},0\n", f"2,0,{ordinal},0,1,extra\n",
        ]
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for rows in cases:
                with self.subTest(rows=rows):
                    self.write_source(root, rows=rows)
                    with self.assertRaises(ValueError):
                        pooled.prepare(root, [2020])
            self.write_source(root, nodes="0,0\n1,0\n2,1\n3,1\n")
            with self.assertRaisesRegex(ValueError, "one Import port"):
                pooled.prepare(root, [2020])
            self.write_source(root)
            with self.assertRaisesRegex(ValueError, "distinct"):
                pooled.prepare(root, [2020, 2020])


if __name__ == "__main__":
    unittest.main()
