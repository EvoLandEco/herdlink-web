#!/usr/bin/env python3
"""Prepare national daily flow totals from the observed NetForge pooled study."""

import argparse
from collections import Counter
import csv
from datetime import date, timedelta
import hashlib
import io
import json
from pathlib import Path
import re
import sys


CHANNELS = {(0, 0): "domestic", (1, 0): "imports", (0, 2): "exports"}
MAX_INTEGER = 2**53 - 1


def integer(value):
    if not isinstance(value, str) or not value.isascii() or not value.isdigit():
        raise ValueError("Counts and node keys must be nonnegative integers")
    result = int(value)
    if result > MAX_INTEGER:
        raise ValueError("Integer exceeds browser precision")
    return result


def checked_csv(root, relative, manifest, columns):
    content = (root / relative).read_bytes()
    digest = hashlib.sha256(content).hexdigest()
    if manifest.get(relative) != digest:
        raise ValueError(f"Source checksum mismatch: {relative}")
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    if reader.fieldnames != columns:
        raise ValueError(f"Unexpected columns: {relative}")
    rows = list(reader)
    if any(None in row or any(value is None for value in row.values()) for row in rows):
        raise ValueError(f"Malformed CSV: {relative}")
    return rows, digest


def prepare(root, years):
    manifest_bytes = (root / "DATA_MANIFEST.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    provenance = json.loads((root / "input_provenance.json").read_bytes())
    if provenance["status"] != "PASS" or provenance["output_sha256"] != manifest:
        raise ValueError("The source provenance must bind the complete input manifest")
    if not years or len(set(years)) != len(years):
        raise ValueError("Choose distinct source years")
    result = {
        "format": "herdlink-pooled-flows-v1",
        "source": {
            "kind": "observed",
            "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
            "files": {},
            "exclusion2018": provenance["exclusion_2018"],
        },
        "years": [],
    }
    for year in sorted(years):
        start, end = date(year, 1, 1), date(year + 1, 1, 1)
        evidence = next(row for row in provenance["years"] if row["year"] == year)
        if evidence["calendar_days"] != (end - start).days:
            raise ValueError("Source coverage must declare the full annual calendar")
        nodes, node_hash = checked_csv(root, f"data/{year}/nodes.csv", manifest, ["node_id", "type"])
        roles = {}
        for row in nodes:
            key, role = integer(row["node_id"]), integer(row["type"])
            if key in roles or role not in (0, 1, 2):
                raise ValueError("Node keys must be unique and roles must be 0, 1 or 2")
            roles[key] = role
        if list(roles.values()).count(1) != 1 or list(roles.values()).count(2) != 1 or 0 not in roles.values():
            raise ValueError("Declare holdings, one Import port and one Export port")
        edges, edge_hash = checked_csv(root, f"data/{year}/observed_edges.csv", manifest,
                                      ["u", "i", "ts", "snapshot", "trade"])
        daily = {}
        for offset in range((end - start).days):
            day = start + timedelta(days=offset)
            daily[day.toordinal()] = {"date": day.isoformat(), **{
                channel: {"animals": 0, "contacts": 0} for channel in CHANNELS.values()}}
        seen, active = set(), set()
        for row in edges:
            sender, receiver, ordinal, snapshot, weight = (integer(row[key]) for key in ["u", "i", "ts", "snapshot", "trade"])
            if sender not in roles or receiver not in roles or sender == receiver:
                raise ValueError("Movement endpoints must be distinct members of the node roster")
            channel = CHANNELS.get((roles[sender], roles[receiver]))
            if channel is None or weight == 0:
                raise ValueError("Movement violates the port roles or has zero weight")
            if ordinal not in daily or snapshot != ordinal - start.toordinal():
                raise ValueError("Movement date and snapshot must agree with the annual calendar")
            key = sender, receiver, ordinal
            if key in seen:
                raise ValueError("Duplicate daily directed contact")
            seen.add(key)
            active.update(node for node in (sender, receiver) if roles[node] == 0)
            counts = daily[ordinal][channel]
            counts["animals"] += weight
            counts["contacts"] += 1
        totals = {channel: sum(day[channel]["animals"] for day in daily.values()) for channel in CHANNELS.values()}
        contacts = {channel: sum(day[channel]["contacts"] for day in daily.values()) for channel in CHANNELS.values()}
        if sum(totals.values()) > MAX_INTEGER:
            raise ValueError("Annual volume exceeds browser precision")
        if (totals["domestic"] != evidence["domestic_animals"] or
                totals["imports"] != evidence["boundary_animals"]["import"] or
                totals["exports"] != evidence["boundary_animals"]["export"] or
                sum(totals.values()) != evidence["combined_animals"] or
                contacts["domestic"] != evidence["domestic_contacts"] or
                contacts["imports"] != evidence["import_contacts"] or
                contacts["exports"] != evidence["export_contacts"] or
                list(roles.values()).count(0) != evidence["holdings"] or
                len(seen) != evidence["combined_contacts"] or len(active) != evidence["combined_active_holdings"]):
            raise ValueError("Annual accounting differs from the source provenance")
        result["source"]["files"].update({f"{year}/nodes.csv": node_hash, f"{year}/observed_edges.csv": edge_hash})
        result["years"].append({"year": year, "holdings": list(roles.values()).count(0),
                                "activeHoldings": len(active), "days": list(daily.values())})
    return result


def read_regional_evidence(path, ledger_hash):
    content = path.read_bytes()
    value = json.loads(content)
    if (set(value) != {"format", "year", "geography", "ledgerSha256", "sourceSha256", "assignments"} or
            value["format"] != "herdlink-region-evidence-v1" or value["year"] != 2018 or
            value["geography"] != "CBS COROP 2024" or value["ledgerSha256"] != ledger_hash):
        raise ValueError("Regional evidence must bind the source ledger, year and geography")
    sources = value["sourceSha256"]
    if (set(sources) != {"giab2018", "corop2024", "script"} or
            any(not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest) for digest in sources.values())):
        raise ValueError("Regional evidence requires source and preparation checksums")
    assignments = {}
    if not isinstance(value["assignments"], list) or not value["assignments"]:
        raise ValueError("Regional evidence must contain holding assignments")
    for row in value["assignments"]:
        if not isinstance(row, list) or len(row) != 2:
            raise ValueError("Invalid regional assignment")
        holding, region = row
        if (type(holding) is not int or holding <= 0 or holding > MAX_INTEGER or holding in assignments or
                not isinstance(region, str) or not re.fullmatch(r"CR(0[1-9]|[1-3][0-9]|40)", region)):
            raise ValueError("Regional assignments require unique holding keys and valid COROP codes")
        assignments[holding] = region
    return assignments, {"regional_evidence.json": hashlib.sha256(content).hexdigest(),
        "giab2018.xlsx": sources["giab2018"], "corop2024.gpkg": sources["corop2024"],
        "regional_preparation.R": sources["script"]}


def prepare_from_ledger(root, years, regional_evidence=None):
    last_year = max(years, default=0)
    if last_year not in (2022, 2023) or sorted(years) != list(range(2018, last_year + 1)):
        raise ValueError("This source contract covers complete calendars from 2018 through 2022 or 2023")
    study = root / "analysis/pooled_hybrid_study_20261016"
    package = prepare(study, [2018, 2020, 2022])
    reference = {entry["year"]: entry for entry in package["years"]}
    origin = root / "analysis/nl_country_network_20261015"
    source_manifest = json.loads((origin / "data/2020/dataset_manifest.json").read_bytes())["source_sha256"]
    paths = {"ledger": root / "processed_data/raw_data/prepared_pigs.csv",
             "builder": origin / "build.py",
             "cleaning_helper": root / "analysis/hybrid_weight_handoff_20261014/prepare.py"}
    hashes = {}
    for key, path in paths.items():
        with path.open("rb") as stream:
            hashes[key] = hashlib.file_digest(stream, "sha256").hexdigest()
        if hashes[key] != source_manifest[key]["sha256"]:
            raise ValueError(f"Upstream source checksum mismatch: {key}")
    sys.path.insert(0, str(root))
    from analysis.nl_country_network_20261015.build import ledger_year
    import pandas as pd

    raw = pd.read_csv(paths["ledger"], usecols=["TRANSPORT_DATUM", "TYPE_MELDING", "UBN_LEV", "UBN_AFN", "AANTAL_DIEREN", "COROP_LEV", "COROP_AFN"], low_memory=False)
    regions = {f"CR{i:02d}" for i in range(1, 41)}
    for column in ["COROP_LEV", "COROP_AFN"]:
        if not raw[column].dropna().isin(regions).all():
            raise ValueError("Unexpected COROP code in source")
    dates = pd.to_datetime(raw.TRANSPORT_DATUM, format="%Y-%m-%d", errors="raise")
    if regional_evidence is not None:
        assignments, evidence_hashes = read_regional_evidence(regional_evidence, hashes["ledger"])
        mask = dates.dt.year.eq(2018)
        for suffix in ["LEV", "AFN"]:
            supplied = raw.loc[mask, "UBN_" + suffix].map(assignments)
            existing = raw.loc[mask, "COROP_" + suffix]
            if (supplied.notna() & existing.notna() & supplied.ne(existing)).any():
                raise ValueError("Regional evidence conflicts with an existing assignment")
            raw.loc[mask, "COROP_" + suffix] = existing.fillna(supplied)
        package["source"]["files"].update(evidence_hashes)
    observed_dates = dates.loc[raw.TYPE_MELDING.ne("SLA")]
    if observed_dates.min().date() > date(2018, 1, 1) or observed_dates.max().date() < date(last_year, 12, 31):
        raise ValueError("The supplied ledger does not span the requested calendar")
    annuals, domestic_rows, boundary_rows = [], [], []
    for year in years:
        domestic, boundary, holdings, self_moves, audit = ledger_year(raw.loc[dates.dt.year.eq(year)], year)
        first, end = date(year, 1, 1), date(year + 1, 1, 1)
        days = {ordinal: {"date": date.fromordinal(ordinal).isoformat(), **{
            channel: {"animals": 0, "contacts": 0} for channel in CHANNELS.values()}}
            for ordinal in range(first.toordinal(), end.toordinal())}
        active = set(domestic.UBN_LEV.astype(int)) | set(domestic.UBN_AFN.astype(int)) | set(boundary.ubn.astype(int))
        for (ordinal, _, _), animals in domestic.groupby(["ts", "UBN_LEV", "UBN_AFN"]).AANTAL_DIEREN.sum().items():
            days[ordinal]["domestic"]["animals"] += int(animals)
            days[ordinal]["domestic"]["contacts"] += 1
        for (ordinal, direction, _), animals in boundary.groupby(["ts", "direction", "ubn"]).observed_heads.sum().items():
            days[ordinal][direction + "s"]["animals"] += int(animals)
            days[ordinal][direction + "s"]["contacts"] += 1
        annual = {"year": year, "holdings": len(holdings), "activeHoldings": len(active), "days": list(days.values())}
        if year in reference:
            if annual["days"] != reference[year]["days"] or annual["activeHoldings"] != reference[year]["activeHoldings"]:
                raise ValueError(f"Rebuilt daily counts differ from the sealed study for {year}")
            if annual["holdings"] > reference[year]["holdings"]:
                raise ValueError("The source holding roster exceeds the sealed study roster")
            annual["holdings"] = reference[year]["holdings"]
        mapped = domestic.COROP_LEV.notna() & domestic.COROP_AFN.notna()
        for ordinal, animals in domestic.loc[~mapped].groupby("ts").AANTAL_DIEREN.sum().items():
            days[ordinal]["unmappedDomestic"] = int(animals)
        for day in days.values():
            day.setdefault("unmappedDomestic", 0)
        for (ordinal, sender, receiver), animals in domestic.loc[mapped].groupby(["ts", "COROP_LEV", "COROP_AFN"]).AANTAL_DIEREN.sum().items():
            domestic_rows.append([date.fromordinal(ordinal).isoformat(), sender, receiver, int(animals)])
        source_rows = raw.loc[boundary.source_row.to_numpy() - 2]
        boundary["region"] = source_rows.COROP_AFN.where(source_rows.TYPE_MELDING.eq("IMP"), source_rows.COROP_LEV).fillna("NL_UNMAPPED").to_numpy()
        for (ordinal, direction, region), animals in boundary.groupby(["ts", "direction", "region"]).observed_heads.sum().items():
            boundary_rows.append([date.fromordinal(ordinal).isoformat(), direction + "s", region, int(animals)])
        annuals.append(annual)
    for key, path in paths.items():
        with path.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != hashes[key]:
                raise ValueError("An upstream source changed during preparation")
    if regional_evidence is not None and hashlib.sha256(regional_evidence.read_bytes()).hexdigest() != evidence_hashes["regional_evidence.json"]:
        raise ValueError("Regional evidence changed during preparation")
    package["years"] = annuals
    package["boundaryRows"] = boundary_rows
    package["domesticRows"] = domestic_rows
    package["source"]["files"].update({"prepared_pigs.csv": hashes["ledger"],
                                      "annual_builder.py": hashes["builder"], "cleaning.py": hashes["cleaning_helper"]})
    return package


def write_bundle(package, output):
    domestic_rows = package.pop("domesticRows")
    output.mkdir(parents=True, exist_ok=True)
    files = {}
    for resolution in ("daily", "weekly", "monthly", "yearly"):
        counts = Counter()
        for day, sender, receiver, animals in domestic_rows:
            day = date.fromisoformat(day)
            if resolution == "weekly":
                day -= timedelta(days=day.weekday())
            elif resolution == "monthly":
                day = day.replace(day=1)
            elif resolution == "yearly":
                day = day.replace(month=1, day=1)
            counts[day.isoformat(), sender, receiver] += animals
        path = output / f"{resolution}_aggregation.csv"
        with path.open("w", newline="") as stream:
            stream.write('"","time","COROP_LEV","COROP_AFN","AANTAL"\n')
            for index, ((day, sender, receiver), animals) in enumerate(sorted(counts.items()), 1):
                stream.write(f'"{index}",{day},"{sender}","{receiver}",{animals}\n')
        files[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
    package["source"]["assets"] = files
    (output / "international_flows.json").write_text(json.dumps(package, separators=(",", ":"), allow_nan=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("netforge", type=Path)
    parser.add_argument("--years", type=int, nargs="+", required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--regional-evidence", type=Path)
    args = parser.parse_args()
    package = prepare_from_ledger(args.netforge.resolve(), args.years, args.regional_evidence)
    write_bundle(package, args.output)
    print(f"Prepared {len(package['years'])} annual calendars: {args.output}")
