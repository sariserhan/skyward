# Skyward

A browser flight observatory and flight simulator built with React, TypeScript,
Vite, CesiumJS and Node.js. Explore the globe, follow aircraft, inspect airports,
or fly an aircraft with Easy or Advanced controls. This repository also preserves
the Godot airport operations and boarding game.

## Quick start

Use **Node.js 24 or newer**. From the repository root:

```sh
npm --prefix web ci
npm --prefix web run build
npm --prefix web run start:dev
```

Open **http://localhost:8000/** and keep the server running. `/watch/` redirects
to the homepage. `start:dev` enables the development Premium override with local
test accounts; it does not enable paid aviation API access or real payments.
Use `npm --prefix web start` to run without the development Premium override.

For frontend hot reload, keep the Node server running and run
`npm --prefix web run dev` in a second terminal. Open the URL Vite prints; it
proxies `/api` requests to port 8000. After changing backend code or environment
settings, restart the Node server.

Optional local configuration belongs in **web/.env.local**, using
[web/.env.example](web/.env.example) as the field reference. Do not overwrite an
existing configuration or commit credentials. The startup scripts load `.env`
then `.env.local`; process environment variables take precedence.

When accessing a headless server, run this on **your own computer**, replacing
`USER@SERVER` with your SSH destination:

```sh
ssh -N -L 8000:127.0.0.1:8000 USER@SERVER
```

Then open `http://localhost:8000/` on that computer. Check
`http://localhost:8000/healthz` if the page does not load; this checks the app,
not aircraft-feed coverage.

## Current experience

- **Globe and airport exploration:** satellite/atlas views, camera-area traffic,
  a worldwide airport directory, mapped runways and facilities, tower views,
  airport traffic panels and trip following.
- **Aircraft viewing:** sourced aircraft models and liveries where available,
  family fallbacks, side/front/bird's-eye/cabin/cockpit cameras, animated gear,
  propellers, rotors, navigation lights and aircraft-specific sound.
- **Weather and lighting:** report-driven clouds, rain, snow, thunder and
  illustrative turbulence; sun-aware 3D cloud volumes, day/night lighting,
  aircraft paint highlights, and procedural building facades with night windows.
- **Smoother scene preparation:** gradual cloud transitions, bounded model
  preloading that prioritizes the selected aircraft, and retained recent weather
  during temporary refresh failures.
- **Simulation:** flyable aircraft with Easy/Advanced controls, training,
  fuel, simulated radio guidance and landing/taxi practice. The separate Godot
  airport game is at `/airport-simulation/` when its web export is available.
- **Accounts and Premium:** local test mode and a Neon PostgreSQL + Better Auth
  account path; Premium gates for simulators, recording, account libraries and
  configured paid flight details. Checkout remains test-only.

For richer scenery choose **Map tools → Layers → Performance preset → High
detail**. It enables satellite imagery, approximate terrain, structures, sharper
shadows and additional edge smoothing. Automatic quality reduction remains
available for slower devices.

Observed positions, estimated movement and fictional Skyward traffic are distinct.
Coverage is incomplete, and a Premium subscription does not guarantee worldwide
real-time coverage. Landing, taxi, weather volumes and building facades are
illustrative; this is an entertainment product, not navigation software. Actual
passenger manifests are unavailable. See the [visual realism notes](docs/visual-realism.md)
for implemented improvements and the remaining gap with detailed flight simulators.

## Development and validation

```sh
npm --prefix web test             # unit and server tests
npm --prefix web run build        # TypeScript checks and production bundle
npm --prefix web run test:browser # deterministic browser regression
npm --prefix web run test:weather # report-driven weather rendering
npm --prefix web run test:cockpit # cockpit loading and recovery
npm --prefix web run test:landing # watched landing and taxi regression
npm --prefix web run test:visual  # daylight/sunset/rain + night landing/taxi
npm --prefix web run test:scenery # building fades and airport detail
npm --prefix web run test:account-recovery # account recovery under failed requests
```

Browser checks require Python Playwright and its Chromium installation. Set
`SKYWARD_QA_PYTHON` to the interpreter containing Playwright when necessary.
They use isolated servers and save evidence outside the repository. Headless
Chromium checks do not establish real-device GPU performance or Safari/Firefox
compatibility. See [browser testing](web/tests/browser/README.md).

## Documentation

- [Web application guide](web/README.md): configuration, features, data sources,
  Premium, accounts and implementation history.
- [Visual realism](docs/visual-realism.md): clouds, aircraft materials, scenery
  and rendering limitations.
- [Deployment guide](deployment/README.md): the current persistent Node service
  and production setup. Deployment has not been performed; Cloudflare-specific
  hosting, R2 and D1 are not implied by the current implementation.
- [Game spec](spec.md), [airport architecture](docs/architecture.md),
  [game status](docs/status.md), and [design decisions](docs/DECISIONS.md).

## Layout

```
game/        Godot 4 project (GDScript)
  scripts/airport/ headless airport world, entities, clock and events
  scripts/sim/   preserved headless boarding engine (no Node dependencies)
  scripts/ui/    rendering and UI
  configs/       aircraft, scenarios, simulation constants (JSON)
  tests/         headless test harness
docs/        spec, simulation notes, roadmap, decisions
web/         Skyward observatory (React, Cesium, Node; free community data)
```

## Godot game requirements

Godot **4.7.2-stable** (pinned in `.godot-version`). Put the binary on your
PATH as `godot`.

## Godot airport operations game

A Godot airport operations simulator with a preserved aircraft boarding engine.
The default scene runs Riverdale International: manage gate conflicts while
fictional flights land, taxi, turn around and depart. Airport M0–M12 and M13 part 1 are
implemented. Arriving aircraft carry simulated passengers, who deboard row by row and
either leave the airport or connect: they walk to another gate and board
another flight, as the same person. Departing passengers clear
security and board through the preserved cabin simulation. Aircraft turnaround
is a visible task graph (deboarding, cleaning, catering, fueling, baggage
unload and load, boarding), and departures wait for it. Checked bags are real
objects: they are sorted, loaded, unloaded, transferred between flights and
collected at reclaim, and they can miss a connection their passenger makes.
Crews, fuel units and pushback tugs are limited: flights queue for them, and
the player chooses which flight gets served first. The four airlines judge the
airport from real outcomes, each with its own priorities and contract, and
explain their scores. Days are a tycoon loop: fees from real operations,
paid-for capacity, contract money, an end-of-day report, next-day planning,
and airline growth that actually flies. Between days the player builds: gates
on new pads, an east pier, security lanes, baggage modules and service
facilities, which change the next day's real routes and capacities. Aircraft
taxi on a real airside graph (runways, taxiways, stands), queue behind each
other and hold for opposing traffic; the player builds taxiways and runways,
whose length decides which aircraft they can serve. The game opens on a menu: a
new career starts small at Harbor Field Regional (three gates, one runway),
with chapters of objectives on real results, tips as situations arise,
autosaves, and a playtest bundle for testers; Riverdale International is the
sandbox.

Product direction from M3 onward: [airport_tycoon.md](airport_tycoon.md). M3 report:
[docs/m3-status.md](docs/m3-status.md).

Airport architecture: [docs/architecture.md](docs/architecture.md).
Current validation and limitations: [docs/status.md](docs/status.md).

Full product spec: [spec.md](spec.md). Design decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Dulles airport prototype

Choose **WASHINGTON DULLES · IAD → PLAY DULLES** from the menu for the geographic
airport sandbox: four FAA-positioned runways, mapped terminal footprints and
taxiways, and real airline names with explicitly illustrative traffic.
See [Dulles details and limitations](docs/dulles.md).

## Run the game

```sh
godot --path game
```

Airport controls: select an aircraft or flight row to inspect it. Select a gate
and click **Assign gate** to reassign an incoming flight. Overlap warnings allow
intentional waiting; incompatible gates are rejected. Space pauses/resumes;
1/2/4 set speed. Save/Load use `user://riverdale_airport.json`. In debug builds,
F3 reveals +10 minutes, force arrival and +10 minute operational hold controls.

While an aircraft deboards, **View deboarding** shows the cabin emptying. The
**Passengers** tab lists arrivals (IN), connectors (CX) and departures (OUT).
Select one to follow them from seat to exit, or from one aircraft onto another.
When connecting passengers are still on their way to a closing gate, the flight
details say how many there are, where they come from, and when they will arrive:
**HOLD +5 MIN** waits for them, at the cost of departure time.

The **Turnaround** tab lists the selected aircraft's tasks: progress, times,
and what each one is waiting for. The flight details say what is holding
departure. After takeoff, they split any delay into its causes.

Choose **Terminal** to watch passengers, **Security** to open/close lanes and
assign staff, or **Passengers** to inspect the selected flight's manifest.
Click a passenger on the terminal map to follow their route. Six staff members
are available across two checkpoints; every active lane needs one. Closing a
lane lets its current screening finish. Gate changes reroute the same passengers.

**Boarding.** Boarding opens about 30 minutes before departure. The gate closes
as soon as every booked passenger is aboard. Otherwise it closes automatically
10 minutes before departure unless you hold the flight. Flights run at 70–95%
load, varying by airline and flight.

- Pick a flight's boarding strategy before boarding opens.
- **HOLD +5 MIN** keeps the gate open for stragglers, at the cost of departure
  delay. You can hold for up to 15 minutes.
- **CLOSE GATE** closes it now.
- **View boarding** opens the live cabin for single-aisle flights. Esc closes it.

Anyone not aboard at close misses the flight. They still walk to the gate; no
one teleports. The 787 uses a temporary *widebody boarding abstraction* (no
cabin simulation yet). Saves use schema v3 and can be made during boarding.
Older saves are rejected explicitly.

Run the preserved boarding prototype separately:

```sh
godot --path game res://scenes/main.tscn
```

Boarding controls: click a passenger to inspect it. Space starts or pauses,
1/2/4/8 set speed, R restarts, F3 opens its debug panel.

On Linux the editor and game need the usual X11 client libraries. If Godot
reports it cannot load `libXcursor`, install `libxcursor1` (and `libxinerama1`).

## Run the tests

```sh
./run_tests.sh            # full suite, including 1000 deadlock scenarios
./run_tests.sh --quick    # 50 deadlock scenarios
```

Benchmarks (headless):

```sh
godot --headless --path game --script tests/airport_benchmark.gd    # airside, 24 and 100 flights
godot --headless --path game --script tests/passenger_benchmark.gd  # full morning baseline
godot --headless --path game --script tests/strategy_benchmark.gd   # each strategy on every flight
godot --headless --path game --script tests/connection_benchmark.gd # default and 40% connecting
```

Rendered UI smoke tests and the M3 demonstration run under a virtual display:

```sh
tools/ui_tests.sh                      # airport UI, terminal UI, M3–M6 demos
tools/ui_tests.sh tests/m3_demo.gd     # one script
```

This needs `xvfb-run` (package `xvfb`). Godot's X11 driver also needs libXcursor
and libXinerama. If they are missing, the script fetches the Ubuntu packages once
with `apt-get download` (no root) into the git-ignored `.cache/ui-test-libs`.
Installing `libxcursor1 libxinerama1` system-wide avoids that step. Screenshots
go to `/tmp/airport-*.png`, `/tmp/terminal-*.png` and `/tmp/m3-demo-*.png`. The
demo follows AW 228 from docking to takeoff, with one deliberately late
passenger, and prints a timeline. [docs/PLAYTEST.md](docs/PLAYTEST.md) has the
manual walkthrough.

## Playtest builds

Export presets for Linux, Windows and macOS are in `game/export_presets.cfg`.
Builds land in `dist/` (ignored by git). See [docs/PLAYTEST.md](docs/PLAYTEST.md)
for what to send testers and how to read the results. The game writes a local
event log that `tools/playtest_report.py` turns into the spec's metrics.

## Screenshots for review

`game/tests/screenshot.gd` drives the main screen through planning, boarding,
results and the editor and saves PNGs. Under a virtual framebuffer:

```sh
xvfb-run -a -s "-screen 0 1280x800x24" godot --path game --script tests/screenshot.gd -- /abs/output/dir
```

### Measure your own device

Open **Map tools → Performance → Record performance** for a local 30-second
capture. Close the monitor to explore, then reopen it to download the report.
Nothing is uploaded. **Sound mix** provides separate engine, cabin, weather and
radio levels. See [visual realism](docs/visual-realism.md) for the current scenery,
arrival preparation and supported aircraft-motion details, and
[customer readiness](docs/customer-readiness.md) for the device release matrix.

### Tower dialogue and captain announcements

In Flight view, open **Flight voices · Simulation** and enable **Tower dialogue**
and/or **Captain**. The controls also appear in the cockpit. Captain messages use
available route information, the displayed flight phase and nearby weather reports.
At the onset of the turbulence effect, the captain asks passengers to fasten their
seat belts and the crew to secure the cabin. Hysteresis and a three-minute cooldown
prevent repeated warnings. **Captain update** requests a fresh briefing.

These are scripted, simulated voices, not a real aircraft's radio or cabin audio.
No gate, landing clearance or arrival time is invented. Local English system
voices are used without a paid service; if none is installed, a transcript is shown.
Enable voices with a click each time you enter a flight. Volume follows **Radio**
and **Cabin** in Sound mix. Backgrounding or leaving the view stops its speech.
The flight simulator also offers captain announcements alongside its existing
simulated tower instructions.

### Atmosphere and Advanced handling

Weather now uses several illustrative cloud formations, with clearer gaps between
clouds, sun-aware shading and camera immersion tied to rendered volumes. Water
responds gradually to nearby wind reports and sunlight. In Advanced flight mode,
climbing trades airspeed for altitude and banked turns require more energy; Easy
assistance stays available.

**Map tools → Layers → Automatically balance detail and scene resolution** can
reduce scene resolution during sustained slow rendering, then restore it slowly.
Turn it off to hold your selected preset. The interface remains at its normal
resolution, and **Performance** shows the current scene scale. See
[visual realism](docs/visual-realism.md) for the approximations and current limits.

Flight voices now lower engine, cabin and weather ambience while speaking, then restore your saved levels. In **Sound mix**, choose **Balanced**, **Quiet cabin**, or **Weather immersion**, or tune each slider. Warning tones are not ducked. **Flight voices → Recent dialogue** keeps the last eight messages for the current flight in memory; clear it at any time. A captain follow-up plays after sustained calmer conditions following a turbulence announcement, provided nearby weather and altitude remain available. These are illustrative simulation announcements, not live crew communications.

The floating flight-view panel can be moved using **Move panel** (mouse or touch). Use **−** to minimize it and **＋** to restore; the flight keeps running. **↺** resets its position. With the drag handle focused, arrow keys move it (Shift moves faster), and Home resets it. Its position is remembered for the current page session and kept within the map when the window resizes.

Choose **Passenger window** in Flight view for a framed window-seat perspective. Switch between left/right windows, lower the adjustable shade, or select **Exit window view**. The floating controls minimize automatically and can be restored with **＋**. The cabin frame is illustrative; scenery, aircraft motion, weather and day/night lighting continue from the displayed flight.

Aurowall music is available in **Flight view → Music & sounds · Aurowall**, including the cockpit. Choose a track and press **Play music**; volume and looping are independent of cabin ambience. Music lowers during spoken announcements and pauses when the page is hidden or the view is suspended; press Play to resume. Leaving flight view releases the player. The selector links to [Aurowall](https://aurowall.com).

The Node server reads `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_URL` from `web/.env.local` when started with the existing npm start scripts. Restart the server after configuring them. These values must never use a `VITE_` prefix. Only public audio URLs and titles reach the browser. `AUROWALL_AUDIO_PREFIX` optionally restricts discovery to a folder. Catalog requests are coalesced and cached for one hour; temporary failures back off for one minute and retain the last good catalog. Discovery is capped at five listing pages. Playback streams the selected public audio object directly and does not write to the database or bucket.
