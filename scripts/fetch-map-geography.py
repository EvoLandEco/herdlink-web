#!/usr/bin/env python3
"""Build national map layers from Kadaster TOP250NL using Python's standard library.

Run with --archive PATH to use a downloaded TOP250NL GML archive, or without
arguments to download it from PDOK. Run with --check to validate the saved layers.
Coordinates retain the source precision and RD New (EPSG:28992) reference system.
"""

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from urllib.request import urlretrieve
import xml.etree.ElementTree as ET
from zipfile import ZipFile


SOURCE_URL = "https://service.pdok.nl/kadaster/brt-topnl/atom/downloads/top250nl-gml-nl-nohist.zip"
SOURCE_FEED = "https://service.pdok.nl/kadaster/brt-topnl/atom/top250nl.xml"
OUTPUT = Path(__file__).resolve().parents[1] / "public/assets/files/herdlink/layers"
GML = "{http://www.opengis.net/gml/3.2}"
ROAD_CLASSES = {"autosnelweg": "motorway", "hoofdweg": "main"}
WATER_WIDTHS = {"12 - 50 meter", "50 - 125 meter", "> 125 m"}
LAND_CLASSES = {"bos": "woodland", "zand": "sand"}


def coordinates(element):
    values = [float(value) for value in element.text.split()]
    assert len(values) % 2 == 0, "Coordinate sequence must contain x/y pairs"
    return [values[index:index + 2] for index in range(0, len(values), 2)]


def geometry(feature):
    geometries = [element for element in feature.iter() if "srsName" in element.attrib]
    assert len(geometries) == 1, "Expected one source geometry"
    element = geometries[0]
    assert element.attrib["srsName"] == "28992", "Source geometry must use RD New"
    kind = element.tag.removeprefix(GML)
    if kind == "Point":
        coords = coordinates(element.find(GML + "pos"))[0]
    elif kind == "LineString":
        coords = coordinates(element.find(GML + "posList"))
    elif kind == "Polygon":
        coords = [coordinates(ring.find(".//" + GML + "posList")) for ring in element]
        assert all(len(ring) >= 4 and ring[0] == ring[-1] for ring in coords)
    else:
        raise ValueError(f"Unsupported source geometry: {kind}")
    return {"type": kind, "coordinates": coords}


def feature(geom, properties):
    return {"type": "Feature", "properties": properties, "geometry": geom}


def grouped_features(groups):
    return [feature({"type": kind, "coordinates": coords}, {"class": classification})
            for (classification, kind), coords in sorted(groups.items())]


def validate(collection):
    assert collection["type"] == "FeatureCollection" and collection["features"]
    assert collection["crs"]["properties"]["name"] == "EPSG:28992"

    def points(coords):
        if isinstance(coords[0], (int, float)):
            assert len(coords) == 2
            assert -20000 < coords[0] < 300000 and 280000 < coords[1] < 650000
        else:
            for part in coords:
                points(part)

    for item in collection["features"]:
        assert item["type"] == "Feature"
        points(item["geometry"]["coordinates"])


def build(archive_path):
    roads, water, land = defaultdict(list), defaultdict(list), defaultdict(list)
    towns, provinces = {}, []
    counts, dates = {}, set()
    with ZipFile(archive_path) as archive:
        for name in ("wegdeel", "waterdeel", "terrein", "plaats", "registratiefgebied"):
            count = 0
            with archive.open(f"top250nl_{name}.gml") as stream:
                for _, member in ET.iterparse(stream, events=("end",)):
                    if not member.tag.endswith("}FeatureMember"):
                        continue
                    source = member[0]
                    props = {child.tag.split("}")[-1]: child.text for child in source if len(child) == 0}
                    geom = geometry(source)
                    kind, coords = geom["type"], geom["coordinates"]
                    dates.add(props["bronactualiteit"])
                    count += 1
                    if name == "wegdeel" and props.get("status") == "in gebruik" and kind == "LineString":
                        road_class = ROAD_CLASSES.get(props["typeWeg"])
                        if road_class:
                            roads[(road_class, "MultiLineString")].append(coords)
                    elif name == "waterdeel":
                        if kind == "Polygon" and props["typeWater"] in ("waterloop", "meer, plas"):
                            water[("water", "MultiPolygon")].append(coords)
                        elif kind == "LineString" and props.get("breedteklasse") in WATER_WIDTHS:
                            water[("waterway", "MultiLineString")].append(coords)
                    elif name == "terrein" and props["typeLandgebruik"] in LAND_CLASSES:
                        land[(LAND_CLASSES[props["typeLandgebruik"]], "MultiPolygon")].append(coords)
                    elif name == "registratiefgebied" and props["typeRegistratiefGebied"] == "provincie":
                        provinces.append(feature(geom, {"name": props["naamOfficieel"]}))
                    elif name == "plaats":
                        if kind == "Polygon":
                            land[("urban", "MultiPolygon")].append(coords)
                        population = int(props["aantalinwoners"])
                        if population >= 50000:
                            label = props["naamNL"]
                            town = towns.setdefault(label, {"population": population, "geometries": []})
                            assert town["population"] == population
                            town["geometries"].append(geom)
                    member.clear()
            counts[name] = count

    places = []
    for name, town in sorted(towns.items()):
        parts = town["geometries"]
        if len(parts) == 1:
            geom = parts[0]
        else:
            assert all(part["type"] == "Polygon" for part in parts)
            geom = {"type": "MultiPolygon", "coordinates": [part["coordinates"] for part in parts]}
        places.append(feature(geom, {"name": name, "population": town["population"]}))

    assert len(provinces) == 12, "Expected all twelve Dutch provinces"
    layers = {"roads": grouped_features(roads), "water": grouped_features(water),
              "land-cover": grouped_features(land), "provinces": provinces, "places": places}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, features in layers.items():
        collection = {"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": "EPSG:28992"}},
                      "features": features}
        validate(collection)
        (OUTPUT / f"{name}.geojson").write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")) + "\n")
        print(f"{name}: {len(features)} features")

    metadata = {
        "dataset": "Kadaster TOP250NL",
        "sourceUrl": SOURCE_URL,
        "sourceFeed": SOURCE_FEED,
        "sourceDates": sorted(dates),
        "generatedAt": datetime.now(timezone.utc).date().isoformat(),
        "sourceArchiveSha256": hashlib.sha256(Path(archive_path).read_bytes()).hexdigest(),
        "sourceFeatureCounts": counts,
        "license": "CC BY 4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Contains Kadaster TOP250NL data, provided by PDOK (CC BY 4.0).",
        "crs": "EPSG:28992",
        "scale": "1:250,000",
        "processing": "Source coordinates are retained without simplification. Geometry parts are grouped by display class; place polygons sharing a name are grouped for label placement.",
        "layers": {
            "roads": {"selection": "Line features in use, with typeWeg autosnelweg or hoofdweg.",
                      "classes": {"motorway": "autosnelweg", "main": "hoofdweg"}},
            "water": {"selection": "All waterloop and meer, plas polygons; watercourse lines in width classes 12–50 m, 50–125 m and greater than 125 m. Sea and tidal flats are excluded.",
                      "classes": {"water": "Water areas", "waterway": "Watercourses at least 12 m wide"}},
            "land-cover": {"selection": "All bos and zand terrain polygons, plus all woonkern settlement polygons. Other terrain is unclassified; this layer does not map agricultural land.",
                           "classes": {"woodland": "Woodland", "urban": "Settlements", "sand": "Sand"}},
            "provinces": {"selection": "All twelve features with typeRegistratiefGebied provincie."},
            "places": {"selection": "All places with source aantalinwoners at least 50,000. Names and population attributes are retained from TOP250NL; polygon label positions are computed by the map renderer."}
        }
    }
    (OUTPUT / "geography-sources.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Path to a TOP250NL GML ZIP archive")
    parser.add_argument("--check", action="store_true", help="Validate the saved layer files")
    args = parser.parse_args()
    if args.check:
        for name in ("roads", "water", "land-cover", "provinces", "places"):
            validate(json.loads((OUTPUT / f"{name}.geojson").read_text()))
        print("Geography layer checks passed")
    elif args.archive:
        build(args.archive)
    else:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "top250nl.zip"
            urlretrieve(SOURCE_URL, path)
            build(path)


if __name__ == "__main__":
    main()
