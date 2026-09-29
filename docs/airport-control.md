# Airport control and 3D simulation

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

This is not yet a hyper-realistic airport product. The controller expansion below adds surface detail, service vehicles, route editing, weather guidance and synthesized readbacks. Bespoke terminal architecture, high-resolution authored materials, correct per-airport tower locations, verified gate/jet-bridge fits, full aircraft rigs, independent ground/tower/approach sectors, explicit line-up/go-around commands, SID/STAR procedures and wake categories remain further work. Holding patterns, approach joins and aircraft performance are presentation approximations; operational timing still comes from the existing game engine. Desktop is the primary control surface; the existing canvas UI needs further work for comfortable phone use.

## Verification

`tests/test_tower_control.gd` covers queue/occupancy/separation enforcement, holds and resumption, new-field persistence, legacy-save migration and invalid field rejection. `tests/airport_3d_smoke.gd` renders day/night views, issues a clearance through the actual UI button, and verifies its runway effect and log. Export with `godot --headless --path game --export-release Web ../dist/web/index.html`. The deployed artifact is a generated build under ignored `dist/web/`, not a committed binary.

Validation on 2026-09-29: the full regression run (`BOARDING_DEADLOCK_RUNS=8 godot --headless --path game --script tests/run_tests.gd`) passed 246 tests. After the final validation/route-conflict cases were added, all 11 focused controller tests passed. Starter and Dulles rendered controller flows passed, including real UI clearance/resume controls, route preview, rain, service vehicles and drag/minimize. The completed full run and final rendered checks exited without the previous resource-leak warnings.

The exported Web game passed Chromium checks through the Premium development wrapper at 1440×1000 and 900×900: scenario launch, cameras, desk, and home navigation worked without reported JavaScript/Godot errors. A browser speech-synthesis stub verified that the radio toggle and accepted runway assignment dispatch tower speech and pilot readback; actual audible output and voice quality require a speaker-equipped browser. Software rendering is not a hardware-GPU benchmark. Phone usability remains limited by the game's desktop-oriented canvas.

## Controller expansion

The **Tower desk** button opens a draggable, minimizable controller panel. Drag its header to move it; the panel stays within the viewport. Flight strips can be dragged into a preferred display order; **this does not reorder the runway's safety queue**. Radar aircraft selection updates the 3D selection. The radar shows simulation state, not a real surveillance feed.

### Taxi planning and runway decisions

1. Select a taxiing aircraft and issue **Hold at next node**.
2. Open **Tower desk → Draw route**. Click mapped taxi nodes on the radar or in the 3D view, in order. The preview includes the existing destination and follows curved source geometry.
3. Review the preview's travel time and opposing-traffic warning. **Apply** preserves the occupied leg and acquires reservations for the replacement route; a conflict retains the original route.
4. **Resume taxi** when ready. **Clear** discards the preview only.

Gate assignment uses the existing compatibility and availability checks. Runway assignment is available before a runway request/taxi locks the operation. Wind components help choose a runway, and automatic choice penalizes tailwind/crosswind. Scenario runways currently operate in their mapped `a → b` direction and use their mapped exit; arbitrary runway reversal or new physical exits are not fabricated. Route editing uses legal graph paths between selected waypoints, not unrestricted painting across the airfield.

### Weather, training and sound

Clear, Rain and Low visibility are **local simulation presets**. Wet conditions change pavement roughness, sky/fog and rain particles. They lengthen subsequent runway operations and separation intervals. Changing weather does not retime an operation already in progress. Weather and controller selections survive full saved-game backups.

**Begin guided session** enables manual control and skips initial quiet time. Training coaches a clearance, taxi hold, custom route and completed departure. Standard mode removes coaching; Challenge adds low visibility. The desk scores completed departures and delays, with deductions for rejected commands. Existing career days, construction, airline progression and scenario challenges remain available through the original game controls. The new score is a game measure, not an ATC qualification.

**Radio speech** uses the browser's installed speech-synthesis voices for a tower instruction and pilot readback after an accepted command. Captions remain visible, volume is adjustable, and a new instruction cancels stale queued speech. Native/headless builds retain captions; speech is enabled in the browser build. **Airport sound** separately enables locally synthesized ambience and touchdown rumble, with a rain mix in wet weather. No paid audio/API service or recorded ATC was introduced.

### Scenery, movement and performance

- Procedural pavement texture, touchdown rubber deposits, hold markings, terminal windows/skylights, a hangar and tower at fictional airports; existing mapped Dulles footprints remain intact.
- Green/red threshold/end lights and sequenced night approach strobes; animated aircraft beacons/navigation lights.
- Smooth display acceleration/deceleration at the first/last taxi leg; tug-backed orientation during the actual pushback task; continued visible climb after a departure.
- Generic steering bogies, gradual gear retraction, display flaps, centered spinning fan meshes and brief touchdown smoke. These are presentation rigs, not certified aircraft systems or per-type full mechanical rigs.
- Bridges extend toward a parked aircraft's door position. Fuel/catering/baggage/tug vehicle proxies follow actual running turnaround tasks; the desk shows service progress. Vehicle driveways and collision avoidance are still illustrative rather than a separately dispatched road network.
- Shared surface materials, instanced airfield lights, distance-based aircraft models, High/Balanced/Low detail controls and a rolling frame-time p95 display. Hidden airport tabs suspend scene work.

The passenger-flow/baggage ownership cycle was removed, and cabin event handlers no longer capture their owning session in closures. A regression test verifies the simulation releases both systems. Rendering checks also exercise cleanup after audio and vehicles have been active.

This covers an initial playable implementation across the ten improvement areas. It does not establish hyper-realistic scenery or Airport Control 27 feature parity: bespoke airport assets, verified bridge/tower locations, ground-vehicle road traffic, procedural IFR/SID/STAR control, advanced aircraft performance and real recorded multi-speaker radio remain further work.

Additional checks: `tests/airport_controller_smoke.gd` exercises clearance → arrival → held route → resume, weather controls, service vehicles, panel drag/minimize and audio cleanup. `tests/test_tower_control.gd` now also covers route editing, weather timing/persistence, runway preferences, score events, invalid controller settings and reference release.

## Detailed ground equipment and surfaces

Baggage tasks now display imported, textured luggage tractors towing two open carts, plus a separate belt loader. Pushback uses a detailed tow tractor, and fueling uses a modeled tanker with cab and curved tank. These are static meshes from the FlightGear scenery collection, converted using `tools/import_ground_services.py`; editable originals, license, attribution and pinned provenance are retained in `game/assets/ground-services/`. Vehicle wheels and trailer steering are not separately rigged yet. Emergency and catering vehicles still use the older illustrative geometry.

Aprons now show filtered aggregate grain, slab joints, mottling and patchy wet roughness. Buildings have metal-panel seams and subtle streaking; moving bridges have glazing ribs and docking-bellows detail. Active stands receive illustrative service-bay markings and drainage grates where building clearance permits. These details are not surveyed airport infrastructure. The terminal footprints remain mapped extrusions, not photogrammetry.
