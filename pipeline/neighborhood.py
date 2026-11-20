"""Extract named motor roads and bus platforms from an OSM API map response."""
import json
import math
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
frame = json.loads((ROOT / "world.json").read_text())["frame"]
root = ET.parse(sys.argv[1])
nodes = {n.get("id"): n for n in root.iter("node")}


def tags(element):
    return {t.get("k"): t.get("v") for t in element.findall("tag")}


def project(node):
    east = (float(node.get("lon")) - frame["lon"]) * 111320 * math.cos(math.radians(frame["lat"]))
    north = (float(node.get("lat")) - frame["lat"]) * 110950
    return [round(east * frame["rE"] + north * frame["rN"], 2),
            round(-east * frame["nE"] - north * frame["nN"], 2)]


roads = []
other_ways = []
for way in root.iter("way"):
    t = tags(way)
    if not t.get("highway"):
        continue
    points = [project(nodes[n.get("ref")]) for n in way.findall("nd")]
    if min(math.hypot(*p) for p in points) > 550:
        continue
    motor = t["highway"] in {"primary", "secondary", "tertiary", "residential", "unclassified", "trunk", "service"}
    group = roads if motor and t.get("name") else other_ways
    group.append(dict(id=way.get("id"), p=points, **{k: v for k, v in t.items()
                      if k in {"name", "highway", "lanes", "oneway", "tunnel", "maxspeed", "width",
                               "layer", "surface", "bridge", "sidewalk", "foot", "bicycle", "incline",
                               "segregated", "smoothness", "wheelchair", "lane_markings", "service"}
                      or k.startswith(("cycleway", "lanes:", "sidewalk:"))}))

stops = []
fixtures = []
for node in nodes.values():
    t = tags(node)
    if t.get("highway") not in {"bus_stop", "street_lamp", "crossing", "traffic_signals"}:
        continue
    p = project(node)
    if math.hypot(*p) > 550:
        continue
    if t["highway"] != "bus_stop":
        fixtures.append(dict(id=node.get("id"), p=p, **{k:v for k,v in t.items()
                             if k in {"highway", "lamp_mount", "lamp_type", "support", "check_date", "crossing"}
                             or k.startswith("crossing:")}))
    else:
        stops.append(dict(id=node.get("id"), p=p, **{k: t[k] for k in
                          ("name", "ref", "shelter", "bench", "lit") if k in t}))

out = {"roads": roads, "otherWays": other_ways, "stops": stops, "fixtures": fixtures}
(ROOT / "data/neighborhood.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
