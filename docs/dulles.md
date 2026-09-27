# Washington Dulles prototype

Select **WASHINGTON DULLES · IAD → PLAY DULLES** from the main menu.
The airport runs as a sandbox, with finances, passengers, baggage, turnaround,
save/load, and next-day planning. The clock represents Dulles local time.

## Geographic model

The top-down airfield uses FAA runway endpoints and published dimensions:

| Runway | Length | Width |
| --- | --- | --- |
| 01L/19R | 9,400 ft | 150 ft |
| 01C/19C | 11,500 ft | 150 ft |
| 01R/19L | 11,500 ft | 150 ft |
| 12/30 | 10,501 ft | 150 ft |

Source: [FAA AIP](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/part3_ad_2.0_district_of_columbia.html).
The [airport overview](https://www.flydulles.com/airport-overview) rounds 12/30
to 10,500 ft; the importer retains the FAA value.

Terminal buildings (including the main terminal, A/B and C/D concourses,
International Arrivals and Z gates), aprons, taxiway centre lines and mapped
parking positions come from OpenStreetMap. North is up. Use the **Map** button to expand the view. Zoom and pan to inspect
the terminal area; all 130 source gate locations appear at 4× map zoom.
Sources, timestamp, projection, reproducible query and ODbL attribution are in
[the geodata README](../game/configs/geodata/README.md).

## Traffic and fidelity

This is a geographic prototype, not an exact digital twin. There are 12 active
operating gates and 14 illustrative rotations. United, American, Delta and
British Airways are listed by the [airport's airline directory](https://www.flydulles.com/flight-information/airlines-serving-dulles-international).
`SIM` in every flight number and the launch/header labels identify sample traffic.
No flight number, time, route/aircraft pairing, gate assignment, contract or airline
priority is represented as an actual service or policy. There is no live feed.

The operational graph uses the connected mapped taxiway network. Runway endpoint
access joins mapped runway/taxiway junctions. Parking paths use mapped positions
when available; missing stand links use an approximate apron connection.
Disconnected map paths remain visible but are not used for flight routing.

Unmodeled details: 3D building facades/roofs/interiors, aircraft-specific visual
models, runway crossings/ATC clearances, wake separation, weather-dependent runway
use, opposite-direction runway operations, international customs processing,
AeroTrain/mobile lounge vehicles, full gate compatibility and real gate allocations.
The terminal passenger diagram and transfer times remain schematic. The source
map can also lag physical construction. Generic construction controls remain
simulation tools; they do not represent approved Dulles expansion projects.

A verified daily schedule and live arrivals require a licensed flight-data source.
The raw geographic snapshot and local-metre projection can also support a later
3D scene without rebuilding the source data.

## Rebuild and validate

```sh
python3 tools/make_dulles.py
godot --headless --path game --import
godot --headless --path game --script tests/run_tests.gd -- test_dulles.gd
tools/ui_tests.sh tests/dulles_ui_smoke.gd
godot --headless --path game --export-release Web
```

Validation on 2026-09-26: three Dulles tests passed (all-runway routing,
mid-day JSON save/restore and continuation, complete day and next-day start,
curved taxi geometry). All 23 existing airside tests and the Dulles and original
airport rendered smoke checks passed. Godot reports existing ObjectDB/resource
cleanup warnings at test exit. The Web export was rebuilt.
