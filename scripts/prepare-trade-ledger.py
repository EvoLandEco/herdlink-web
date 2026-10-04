#!/usr/bin/env python3
"""Aggregate prepared pig records to COROP regions, including international trade."""

import argparse
from collections import Counter, defaultdict
import csv
from datetime import date, timedelta
import hashlib
import json
from pathlib import Path
import re


REGIONS = {f"CR{i:02d}" for i in range(1, 41)}
MOVEMENTS = {"AAN", "IMP", "EXP"}
EXCLUDED = {"AFV", "DOO", "SLA"}
REQUIRED = {"TRANSPORT_DATUM", "TYPE_MELDING", "AANTAL_DIEREN", "COROP_LEV", "COROP_AFN"}
FIELDS = ["time", "source", "target", "movement_type", "animals", "source_rows"]


def read_date(value):
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Dates must use YYYY-MM-DD")
    return parsed


def domestic_region(value):
    value = value.strip()
    if value in ("", "NA"):
        return "NL_UNMAPPED"
    if value not in REGIONS:
        raise ValueError("Domestic endpoint must be CR01 through CR40, blank, or NA")
    return value


def aggregate(source, start, end):
    if start > end:
        raise ValueError("Start date must not follow end date")
    daily = defaultdict(Counter)
    event_totals = defaultdict(Counter)
    unmapped = defaultdict(Counter)
    read_rows = outside_rows = 0
    reader = csv.DictReader(source)
    if not REQUIRED.issubset(reader.fieldnames or []):
        raise ValueError("Missing columns: " + ", ".join(sorted(REQUIRED - set(reader.fieldnames or []))))
    for line, row in enumerate(reader, 2):
        read_rows += 1
        try:
            if None in row or any(row[key] is None for key in REQUIRED):
                raise ValueError("Malformed CSV row")
            day = read_date(row["TRANSPORT_DATUM"].strip())
            if not start <= day <= end:
                outside_rows += 1
                continue
            kind = row["TYPE_MELDING"].strip()
            if kind not in MOVEMENTS | EXCLUDED:
                raise ValueError("Unrecognised TYPE_MELDING")
            count = row["AANTAL_DIEREN"].strip()
            if not re.fullmatch(r"[0-9]+", count):
                raise ValueError("AANTAL_DIEREN must be a nonnegative integer")
            animals = int(count)
            event_totals[kind].update(animals=animals, source_rows=1)
            if kind in EXCLUDED:
                continue
            sender = domestic_region(row["COROP_LEV"]) if kind != "IMP" else "ABROAD"
            receiver = domestic_region(row["COROP_AFN"]) if kind != "EXP" else "ABROAD"
            foreign_column = {"IMP": "COROP_LEV", "EXP": "COROP_AFN"}.get(kind)
            if foreign_column and row[foreign_column].strip() not in ("", "NA"):
                raise ValueError("Foreign endpoint has a COROP value; check event classification")
            daily[(day, sender, receiver, kind)].update(animals=animals, source_rows=1)
            if "NL_UNMAPPED" in (sender, receiver):
                unmapped[kind].update(animals=animals, source_rows=1)
        except ValueError as error:
            raise ValueError(f"CSV line {line}: {error}") from error
    if not daily:
        raise ValueError("No AAN, IMP or EXP records in the requested period")
    audit = {
        "input_rows": read_rows,
        "rows_outside_window": outside_rows,
        "events_in_window": dict(sorted(event_totals.items())),
        "unmapped_domestic_endpoints": dict(sorted(unmapped.items())),
        "first_movement_date": min(key[0] for key in daily).isoformat(),
        "last_movement_date": max(key[0] for key in daily).isoformat(),
        "movement_days": len({key[0] for key in daily}),
    }
    return daily, audit


def group_period(daily, resolution):
    totals = defaultdict(Counter)
    for (day, sender, receiver, kind), counts in daily.items():
        if resolution == "weekly":
            day -= timedelta(days=day.weekday())
        elif resolution == "monthly":
            day = day.replace(day=1)
        elif resolution == "yearly":
            day = day.replace(month=1, day=1)
        elif resolution != "daily":
            raise ValueError("Unknown time resolution")
        totals[(day, sender, receiver, kind)].update(counts)
    return totals


def prepare(input_path, output, start, end):
    with input_path.open(encoding="utf-8-sig", newline="") as source:
        daily, audit = aggregate(source, start, end)
    with input_path.open("rb") as source:
        digest = hashlib.sha256()
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    kept = {field: sum(value[field] for value in daily.values()) for field in ("animals", "source_rows")}
    for field in kept:
        expected = sum(counts.get(field, 0) for kind, counts in audit["events_in_window"].items() if kind in MOVEMENTS)
        if kept[field] != expected:
            raise ValueError("Movement totals do not reconcile with selected source events")
    # A separate directory keeps research outputs out of the public app assets.
    if output.resolve().is_relative_to(Path(__file__).resolve().parents[1] / "src/assets"):
        raise ValueError("Write research outputs outside src/assets")
    output.mkdir(parents=True, exist_ok=False)
    files = {}
    for resolution in ("daily", "weekly", "monthly", "yearly"):
        grouped = group_period(daily, resolution)
        if any(sum(v[field] for v in grouped.values()) != kept[field] for field in kept):
            raise ValueError("Time aggregation changed movement totals")
        filename = f"{resolution}_movements.csv"
        with (output / filename).open("w", encoding="utf-8", newline="") as target:
            writer = csv.writer(target)
            writer.writerow(FIELDS)
            for (day, sender, receiver, kind), counts in sorted(grouped.items()):
                writer.writerow([day.isoformat(), sender, receiver, kind, counts["animals"], counts["source_rows"]])
        files[filename] = {"rows": len(grouped), **kept}
    manifest = {
        "format": "herdlink_regional_movement_summary_v1",
        "source_sha256": digest.hexdigest(),
        "requested_start": start.isoformat(),
        "requested_end": end.isoformat(),
        "unit": "animal movements, not unique animals or herd size",
        "source_rows": "prepared records, not a count of shipments",
        "event_rules": {
            "AAN": "Domestic arrivals counted once; within-region movements retained",
            "IMP": "ABROAD to the recorded Dutch destination region",
            "EXP": "Recorded Dutch origin region to ABROAD",
            "AFV": "Excluded: domestic departure reports can duplicate AAN arrivals",
            "DOO": "Excluded: deaths are not live animal movements",
            "SLA": "Excluded: slaughter estimates in prepared_pigs.csv derive from AAN arrivals",
        },
        "special_nodes": {
            "ABROAD": "All foreign partners pooled; this input has no partner-country field",
            "NL_UNMAPPED": "Dutch endpoint without a COROP assignment; never classified as foreign",
        },
        "time_bins": "Weeks start Monday; all bins include only the requested dates; edge bins can be partial",
        "coverage": "Counts describe the supplied records; complete national coverage is not established",
        "use": "Research summaries for review; external nodes have no simulation population or disease state",
        "audit": audit,
        "files": files,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="Prepared pig CSV containing COROP codes and event types")
    parser.add_argument("--output", type=Path, required=True, help="New directory for research summaries")
    parser.add_argument("--start", type=read_date, required=True)
    parser.add_argument("--end", type=read_date, required=True)
    args = parser.parse_args()
    result = prepare(args.input, args.output, args.start, args.end)
    print(json.dumps(result["audit"], indent=2))
