#!/usr/bin/env python3
"""Describe a KRD Gelderland/Twente animal overview without exporting site records.

This audit accepts the 14-column CP1252, tab-separated export with integer
animal counts. It reports permit records, not occupied stocks. Identical rows
are counted and retained because this export has no stable or animal-group key.
"""

import argparse
import csv
import hashlib
import io
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path


COLUMNS = (
    "Bronhouder", "VTHobject ID", "Adres", "Gemeente", "RAV-versie-vergund",
    "RAV-code vergund", "RAV-code actueel", "Aantal dieren", "Besluitdatum",
    "NH3 emissie (kg/j)", "Geur emissie (ouE/s)", "Fijnstof emissie (g/j)",
    "Diercategroei omschrijving", "Omschrijving RAV",
)
PIG_CATEGORIES = (
    "biggenopfok (gespeende biggen)",
    "kraamzeugen (incl. biggen tot spenen)",
    "guste en dragende zeugen",
    "dekberen, 7 maanden en ouder",
    "vleesvarkens, opfokberen van circa 25 kg tot 7 maanden, "
    "opfokzeugen van circa 25 kg tot eerste dekking",
)
LEDGER_END = date(2022, 4, 15)


def iso_date(value):
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Dates must use YYYY-MM-DD")
    return parsed


def read_rows(raw):
    reader = csv.reader(io.StringIO(raw.decode("cp1252")), delimiter="\t", strict=True)
    if tuple(next(reader, ())) != COLUMNS:
        raise ValueError("Expected the 14-column KRD animal overview; inspect the source schema")
    rows = []
    for line, fields in enumerate(reader, 2):
        if len(fields) != len(COLUMNS):
            raise ValueError(f"Row {line}: unexpected column count")
        row = dict(zip(COLUMNS, fields))
        if not row["Bronhouder"].strip() or not row["VTHobject ID"].strip():
            raise ValueError(f"Row {line}: missing authority or object ID")
        if not re.fullmatch(r"[0-9]+", row["Aantal dieren"]):
            raise ValueError(f"Row {line}: expected an integer count; inspect numeric formatting")
        value = row["Besluitdatum"]
        if value not in ("", "1900-01-01"):
            try:
                iso_date(value)
            except ValueError as error:
                raise ValueError(f"Row {line}: invalid decision date") from error
        rows.append(row)
    if not rows:
        raise ValueError("The export has no records")
    return rows


def summarize(rows):
    dates = [iso_date(row["Besluitdatum"]) for row in rows
             if row["Besluitdatum"] not in ("", "1900-01-01")]
    positive = [row for row in rows if int(row["Aantal dieren"]) > 0]
    return {
        "rows": len(rows),
        "positiveCountRows": len(positive),
        "zeroCountRows": len(rows) - len(positive),
        "authorityObjectKeys": len({(r["Bronhouder"], r["VTHobject ID"]) for r in rows}),
        "positiveCountKeys": len({(r["Bronhouder"], r["VTHobject ID"]) for r in positive}),
        "repeatedIdenticalExportRows": len(rows) - len({tuple(r.values()) for r in rows}),
        "unknownDecisionDateRows": len(rows) - len(dates),
        "earliestDecisionDate": min(dates).isoformat() if dates else None,
        "latestDecisionDate": max(dates).isoformat() if dates else None,
        "decisionRowsAfter2018": sum(day > date(2018, 12, 31) for day in dates),
        "decisionRowsAfterLedgerEnd": sum(day > LEDGER_END for day in dates),
    }


def audit(raw, filename, retrieved_on):
    rows = read_rows(raw)
    pigs = [row for row in rows if row["Diercategroei omschrijving"] in PIG_CATEGORIES]
    return {
        "source": {
            "url": "https://krd.igoview.nl/Gelderland/main",
            "view": "Totaaloverzicht dieren / Export csv Format",
            "scope": "Gelderland/Twente public export",
            "filename": filename,
            "retrievedOn": iso_date(retrieved_on).isoformat(),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw),
            "encoding": "cp1252",
            "delimiter": "tab",
            "quantity": "permitted-or-notified-animal-count",
        },
        "columns": list(COLUMNS),
        "ledgerEnd": LEDGER_END.isoformat(),
        "allAnimalRows": summarize(rows),
        "pigCategoryRows": summarize(pigs),
        "pigCategorySelection": list(PIG_CATEGORIES),
        "authorityRowCounts": dict(sorted(Counter(r["Bronhouder"] for r in rows).items())),
        "notes": [
            "Pig selection uses five exact category labels, not a substring or a capacity multiplier.",
            "Counts and dates describe export rows; positive keys are not verified active establishments.",
            "Identical export rows remain separate; stable and animal-group identifiers are absent.",
            "Missing dates and 1900-01-01 mean unknown; decision dates are not stock observation dates.",
            "The export alone supplies neither occupied stock nor a historical population series.",
        ],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("--retrieved-on", required=True, help="Download date, YYYY-MM-DD")
    args = parser.parse_args()
    try:
        result = audit(args.input.read_bytes(), args.input.name, args.retrieved_on)
    except (OSError, UnicodeError, ValueError, csv.Error) as error:
        parser.exit(1, f"KRD audit failed: {error}\n")
    print(json.dumps(result, indent=2, ensure_ascii=False))
