# Airport control: first 3D milestone

Reference reviewed: [Airport Control 27, official Steam demo page](https://store.steampowered.com/app/4459730/_27_Demo/?l=english), 2026-09-29. Its advertised strengths include detailed airfield scenery, command-linked radio readbacks, taxi routing, runway clearances and published arrival/departure procedures. These establish a direction, not a claim of equivalent fidelity. No assets or code from that game were copied.

## Play now

Open `/airport-simulation/`, start a scenario, and select **3D Tower** (the default airport tab). Existing Premium access checks and development access remain in effect. The scene starts expanded. **3D focus** toggles the flight board and operations panels. The compact aircraft selector remains available in the 3D toolbar. The original Airfield and Terminal tabs remain available.

- **Next arrival** skips empty time only while all flights are still scheduled. It advances the existing simulation, including passenger and service activity.
- **Orbit**: right-drag to rotate, wheel to zoom; touch drag also rotates.
- **Tower**, **Follow**, **Top**: different perspectives on the same airport. Select a flight from the board or by clicking its aircraft. Follow uses the selected aircraft.
- **Day / night** and **Labels** change presentation only.
- **Manual tower** stops new runway operations until the first queued aircraft receives **Clear landing / takeoff**. Occupancy, runway closure, queue order and separation still apply. An operation already in progress continues.
- **Hold at next node** lets a taxiing aircraft finish its current edge, then retains its reservation and waits. **Resume taxi** releases that controller hold, not traffic conflicts. Returning to automatic mode releases controller holds.
- The on-screen tower log records accepted instructions and an illustrative pilot acknowledgement. It is not live radio or a certified training system.

## Delivered

A Godot SubViewport renders the existing deterministic airport simulation. No second traffic engine, tracking API, database stream, or paid service was added. The viewport stops rendering when its tab is hidden. Runway/taxi lighting is instanced; community aircraft scenes are shared.

Runways and curved taxi geometry come from each scenario. Dulles uses the existing mapped footprint dataset; building heights and bridges are illustrative. The fictional airports use procedural terminal/apron geometry. Four existing licensed airframes cover the scenarios: 737-800, A321, A220-300 and 787-9, with generic scenario variants represented by family models. Editable glTF sources, GPL license and upstream credits are in `game/assets/aircraft/`; original upstream sources are also published with the observatory's model assets.

Aircraft follow simulation positions with display interpolation, an illustrative curved landing transition, landing-gear overlays and animated bridge extension. Ground commands and clearances are recorded in simulation events/decisions. Controller fields persist with saves; older version-13 saves receive off/false defaults before normal strict validation.

## Remaining gap to the reference

This is not yet a hyper-realistic airport product. Bespoke terminal architecture, high-resolution surface materials, correct per-airport tower locations, verified gate/jet-bridge fits, full aircraft rigs, ground-service vehicles, independent ground/tower/approach sectors, route editing, explicit pushback/line-up/go-around commands, SID/STAR procedures, wake categories, weather-dependent runway planning and richer spoken readbacks remain to be implemented. Holding patterns, approach joins and aircraft performance are presentation approximations; operational timing still comes from the existing game engine. Desktop is the primary control surface; the existing canvas UI needs further work for comfortable phone use.

## Verification

`tests/test_tower_control.gd` covers queue/occupancy/separation enforcement, holds and resumption, new-field persistence, legacy-save migration and invalid field rejection. `tests/airport_3d_smoke.gd` renders day/night views, issues a clearance through the actual UI button, and verifies its runway effect and log. Export with `godot --headless --path game --export-release Web ../dist/web/index.html`. The deployed artifact is a generated build under ignored `dist/web/`, not a committed binary.

Validation on 2026-09-29: the full `./run_tests.sh --quick` run passed 241 tests. The focused controller suite passed all four tests after adding the legacy-save migration case. Rendered Riverdale and Dulles checks passed, including an actual clearance-button action. The exported Web game was checked in headless Chromium through the Premium development wrapper: scenario launch, overview/follow/top cameras, and return-home navigation worked without reported JavaScript or Godot script errors. Native test processes still report ObjectDB/resource leaks at shutdown; these results do not establish leak-free operation. No real-browser GPU performance or phone usability guarantee is implied by the software-rendered checks.
