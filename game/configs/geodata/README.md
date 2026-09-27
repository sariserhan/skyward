# Dulles geographic data

`dulles-osm.json` is an OpenStreetMap Overpass snapshot retrieved on 2026-09-26.
Its internal `osm3s.timestamp_osm_base` records the source database timestamp.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
The snapshot and the derived geographic database in `../airports/dulles.json`
are distributed under ODbL. This does not change the license of the game code.
Attribution is displayed in the airport map and the Dulles launch page.

Source endpoint: https://overpass-api.de/api/interpreter
Query:

```overpass
[out:json][timeout:60];
(
  way["aeroway"~"^(runway|taxiway|taxilane|terminal|apron|hangar|parking_position)$"](38.91,-77.50,38.98,-77.42);
  relation["aeroway"="terminal"](38.91,-77.50,38.98,-77.42);
  way["building"](38.939,-77.466,38.953,-77.437);
  node["aeroway"="gate"](38.93,-77.48,38.96,-77.43);
);
out body geom;
```

Runway thresholds, lengths, and widths use the
[FAA AIP Dulles entry](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/part3_ad_2.0_district_of_columbia.html),
accessed 2026-09-26. These override inconsistent OSM length tags. Published
thresholds are used as geometry anchors; displaced thresholds, runway extensions,
and declared landing distances are not modeled separately.

The local equirectangular projection uses origin 38.94° N, 77.46° W, metres
with east positive X and south positive Y. It is suitable for the airport map,
not a surveyed engineering drawing or navigation product.

Rebuild offline with `python3 tools/make_dulles.py` from the repository root.
