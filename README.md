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
  configured paid flight details. Checkout defaults to test mode; the Neon backend supports explicit live billing configuration.

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

## Real-airport controller scenarios

Select **Istanbul (IST)**, **London Heathrow (LHR)**, **Amsterdam Schiphol (AMS)**,
or **Dulles** in `/airport-simulation/`, then choose **Start scenario**. The game
menu also offers these airports. Each new airport has 12 active mapped stands
and 14 fictional flights. IST has six active runways, LHR two, and AMS four;
Schiphol's other saved runways are excluded from operations until their access
connections can be validated. All three reuse the globe's saved terminal,
apron and taxiway geometry. Facility coverage is partial.

`python3 tools/make_mapped_airports.py` rebuilds the three added scenarios offline.
The importer retains the connected taxi network, selects parking-path endpoints,
and rejects building-conflicting segments using 34 m clearance. Runway access
links are approximate, bounded to 450 m and checked for building clearance.
This is game routing, not certified airport operating data. The passenger-flow
view is a schematic. Source counts and import decisions are recorded in
[the import report](docs/mapped-airports-import.json).

## Dulles airport prototype

Dulles is the first scenario choice in `/airport-simulation/`. Choose **Start scenario**,
or **WASHINGTON DULLES · REAL AIRPORT → PLAY DULLES** in the game menu, for the geographic
airport sandbox: four FAA-positioned runways, mapped terminal footprints and
taxiways, and real airline names with explicitly illustrative traffic.
The 3D view opens at the mapped concourses; **Concourse** returns to that camera.
Right-drag to orbit, middle-drag (or Shift+right-drag) to pan, and scroll to zoom.
Leaving a preset camera preserves the current target; **Orbit** restores the full-airport view.
Aprons use concrete slab shading and become darker and less rough in rain.
**Selected gate** focuses the selected flight's assigned stand. Boarding bridges
anchor to nearby mapped terminal walls; docking and stand clearance markings are
illustrative. Bridges retract outside the at-gate phases.
Aircraft and service vehicles use swept clearance against mapped building footprints,
including their size. Unsafe movement holds outside the wall rather than cutting through it.
This is a visual fail-safe; it does not repair the underlying taxi graph or certify clearance
against unmapped structures. Pushback tugs connect near the nose gear during the initial
outbound leg. High-visibility marshallers and parked police/ambulance vehicles are illustrative.
Bridges pivot at terminal anchors and extend toward the model's approximate front-left door;
737/A321 door coordinates come from the model's named door meshes; other types use scaled estimates.
Static scenery is batched by material and local area to reduce scene overhead;
aircraft, service vehicles, bridges, and sequenced lights stay independently animated.
Use **Hide setup** above the game for more viewport space. Progress sync and local
backup controls are under **Save & backups**.
Terminal roofs have weathered panel materials and bounded illustrative service
equipment. Non-repeating landscape shading replaces the tiled grass texture.
Apron masts provide a budget of six actual nighttime floodlights; window bands gain
subtle nighttime illumination. These additions are generic scenery, not surveyed
architectural details. The lower Concourse camera emphasizes terminal scale.
Building footprints come from OSM, with tagged heights/levels where available and
fallback heights otherwise. Facades are illustrative: these are not photogrammetry
or detailed architectural models. Other globe airports are not yet playable controller scenarios.
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
voices are preferred without a paid service; browser English voices or the browser
default are also supported. Browser voices may use an online speech service.
A transcript remains available if speech cannot play.
Enable voices with a click each time you enter a flight. Volume follows **Radio**
and **Cabin** in Sound mix. Backgrounding or leaving the view stops its speech.
The flight simulator also offers captain announcements alongside its existing
simulated tower instructions.

In the globe’s **Tower view**, enable **Tower radio** to hear simulated tower calls
and pilot readbacks for nearby aircraft, or use **Test radio** to check playback.
The landing/taxi/takeoff demonstration has phase-matched dialogue too. **Radio
volume** shares the Sound mix setting; engine ambience softens during speech.
Demonstration pauses, mute, hidden tabs and leaving the tower stop its radio.

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

Choose **Passenger window** in Flight view for a framed window-seat perspective. Switch between left/right windows and seats ahead of, over, or behind the wing. **Look** pans gently outward; **Center look** resets it. Lower the adjustable shade or select **Exit window view**. The floating controls minimize automatically and can be restored with **＋**. The cabin frame is illustrative; scenery, aircraft motion, weather and day/night lighting continue from the displayed flight.

Aurowall music is available from the **Music** button in the top navigation, including while viewing the globe or cockpit. Choose a track and press **Play music**; volume and looping are independent of cabin ambience. Music lowers during spoken announcements and pauses when the page is hidden; press Play to resume. Music continues when closing the music dialog or changing flight views, and stops when leaving the observatory. Favorite tracks with **☆ Favorite** and filter with **Favorites only**. Track selection, favorites, volume, and looping stay on this device; reopening never autoplays. While music plays, a small pause control appears beside **Music**. The selector links to [Aurowall](https://aurowall.com).

The Node server reads `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_URL` from `web/.env.local` when started with the existing npm start scripts. Restart the server after configuring them. These values must never use a `VITE_` prefix. Only public audio URLs and titles reach the browser. `AUROWALL_AUDIO_PREFIX` optionally restricts discovery to a folder. Catalog requests are coalesced and cached for one hour; temporary failures back off for one minute and retain the last good catalog. Discovery is capped at five listing pages. Playback streams the selected public audio object directly and does not write to the database or bucket.

**Spin globe** is beside **Reset view** above the map (labeled **Spin** on narrow screens). Click or drag the globe to stop. Reduced motion disables spinning. Flight controls keep the same **Sound → Camera → Flight details** order across desktop and mobile.

**Flight voices → Test voice** plays a short sample using the selected **Announcement voice**. The choice is remembered locally; voice availability and playback status are shown. Speech requires an installed local English voice and a nonzero Cabin level. The voice sample and flight dialogue are simulated, not live crew communications.

Open terrain is enabled for new preferences; explicitly saved off settings remain off. A failed child elevation tile retries twice and uses Cesium's coarser parent terrain instead of flattening the whole globe. If the root tile fails, a flat root allows the rest of the globe to keep loading. **Retry elevation** reloads the terrain provider. Detail is capped at level 14 with a bounded 128-tile decoded cache. While following a flight, best-effort elevation warming covers its current position and 30/90 seconds along its displayed track, plus the arrival airport. Visible requests take priority; warming pauses when hidden, obscured, or in battery saver. This reduces pop-in but cannot guarantee all remote scenery arrives before the camera does.

Additional deterministic browser checks (after `npm --prefix web run build`, using Python with Playwright installed): `web/tests/browser/experience_controls.py` covers music persistence/playback, voices, window seats, and mobile controls; `web/tests/browser/terrain_recovery.py` verifies default elevation and local tile-failure recovery. Existing landing checks render deployed wheels and taxi; the watched-arrival unit scenarios cover approach through parking with contradictory late fixes. These validate presentation behavior, not the real aircraft's unobserved touchdown or gate assignment.


The airport simulator now opens on **3D Tower**. Use **Next arrival** to skip quiet startup time, **3D focus** to expand the airfield, and **Orbit / Tower / Follow / Top** to change cameras. Enable **Manual tower** to issue landing/takeoff clearances; taxi holds stop at the next node without bypassing traffic reservations. Day/night lighting, community aircraft models, mapped taxi geometry and illustrative terminal/bridge details share the existing simulation. See [the airport-control milestone](docs/airport-control.md) for controls, verification and the remaining gap to a high-fidelity ATC simulator. Existing saves and the 2D Airfield/Terminal views remain supported.

The **Tower desk** adds simulated surface radar, draggable flight strips, taxi-route previews and application, gate/runway assignments, wind guidance, local weather presets, coached training and a controller score. Enable **Radio speech** for browser tower/pilot readbacks or **Airport sound** for synthesized ambience. Scenery now includes surface details, terminal windows and approach lighting; actual turnaround tasks drive service vehicles, while aircraft have display gear/flap/fan animation. High/Balanced/Low detail and frame-time diagnostics are in the desk. [Controller instructions and fidelity limits](docs/airport-control.md#controller-expansion).

Premium journey tools now include family flight groups, a personal flight passport,
observation-based spotter rules, private watch-together rooms, and cinematic replay
highlights with local video export. Open **Account → Premium tools**; recordings
remain under **Explore tools → Sessions**. See [Premium experience](docs/premium-experience.md)
for usage, limits and availability. Live flight-status monitoring remains disabled by default
until an authorized status source is connected; private rooms currently require a
single server instance and expire after two hours.


Premium now opens on **Account → Home**, with the next journey, family flights,
guided setup, a personalized observation feed and usage counters. **Travel** imports
reviewed `.ics` events and exports saved departure dates. **Sessions → Cinematic
highlights** trims a replay, sequences side/bird cameras, adds a title and exports
portrait or landscape video locally. Try `/?premiumPreview=1` for a fictional 3D
sample without signup. The paywall and public Premium page list these tools.

See [Premium live service setup](docs/premium-live-service.md) before enabling
paid data: development access never authorizes a paid provider request.


**Account → Boarding passes** adds camera/photo/PDF barcode import and manual
name/display-name, flight and seat entry. Scanned names become initials, and the
user reviews the flight date before saving. Raw files and booking references stay
out of account storage. Supported installed browsers can use Share to Skyward;
manual import is the fallback. Private trips can be linked to matching saved
journeys, with no guessed aircraft assignment or access to airline manifests.

Jet-engine fans now animate on 26 sourced model families and compatible liveries,
including the 737/MAX, A320 family, 777 and A350. Fan-only node rigs preserve the
engine casings, use illustrative spool-up/taxi speeds, and respect known engine-off
and reduced-motion settings. Models without separate audited fan meshes remain
static. Regenerate metadata with `python3 web/scripts/prepare-jet-fan-rigs.py`.

**Travel together** (`/travelers/`) lists voluntary, self-reported traveler posts.
Premium members can publish from **Account → Boarding passes → Share my journey**
after saving a trip with its confirmed tracking callsign. A separate public alias, flight/route/date and
chosen approximate window position are shared for 1 or 24 hours (three active
posts per account). Exact seat numbers, barcode files, account emails and booking
references remain private. Sharing can be withdrawn even after Premium expires;
expired posts are removed by the existing background cleanup.

Anyone can browse the directory or open a shared trip without signing in. The
window button finds a recent same-callsign observation on the trip's UTC date;
unmatched, stale and fictional aircraft do not open as the traveler's flight.
This is a simulated window viewpoint, not an exact airline seat map, live camera,
verified boarding status or airline passenger manifest. Directory reads use
bounded existing account storage and cached traffic; public viewing never invokes
the paid details API. Premium marketing includes a direct **Start with my trip**
entry point at `/account/?trips=1`.

Travel sharing now includes the following:

- **One-save setup:** a reviewed trip with a confirmed tracking callsign creates
  and links its tracking journey during Save. Ticket numbers are never silently
  treated as ICAO callsigns. Trips without a callsign still save privately.
- **Visibility:** Private (authenticated owner window), Anyone with the invitation
  link (unlisted), or Public directory. All modes expire and can be removed.
  An invitation is a bearer link: anyone it is forwarded to can view it.
- **Seat preview:** choose side and approximate cabin position visually. An
  explicitly confirmed [British Airways A320neo representative seat map](https://www.britishairways.com/content/information/seating/seat-maps)
  supports window columns A/F, rows 1–30. Its position buckets remain approximate;
  no tail-specific seat layout or actual seat camera is claimed. Other aircraft
  use the manual preview and available official cabin references.
- **Arrival companion:** straight-line route progress only for a matching nearby
  route observation, destination local time, cached station weather, and available
  server-verified arrival details no older than 15 minutes. Public guests never
  trigger paid flight-detail calls. Notification permission is requested only by
  the user; arrival notifications require the page to remain open and active.
- **Recaps:** consecutive observed ground/air transitions near the relevant
  airport and fresh reported arrivals are distinguished. Long gaps never imply
  takeoff or landing. Users can download scenery/sunset images they mark in the
  simulated view and export a JSON recap. At most 24 recap events stay in the
  current browser tab session; images are downloaded, not uploaded.
- **Reactions:** waves/hearts have cooldowns, bounded in-memory history, traveler
  mute and per-guest-browser blocking. A 24-hour HttpOnly guest cookie identifies
  the browser for interaction controls. Clearing cookies can evade a browser
  block; this is not verified-person blocking. Reaction/milestone memory resets
  on server restart. Owner controls can stop interactions after downgrading.
- **Directory:** filter by callsign, route or UTC date; hide/restore trips locally;
  report privacy, impersonation, inappropriate content or spam. Reports contain
  reason counts only, expire with the post, and do not automatically remove posts.

Operator moderation uses `GET /api/travelers/moderation`, protected by the
existing `SKYWARD_METRICS_TOKEN` bearer token. `POST` with `{"key":"<post-id>",
"action":"hide"}` hides a reported post; `"dismiss"` clears its reports. Keep
that token server-side and use an operator client; it is never sent to browser UI.
Configure it before opening public traveler posting to external users so reports
can be reviewed. Normal users can always hide trips locally and withdraw their
own sharing.

Anonymous travel-funnel events (`premium_view`, `trip_start`, `trip_saved`,
`sharing_created`, `guest_watch`) contain only the event name. The browser emits
at most one of each per page session and honors Do Not Track. Aggregate daily
counts are bounded to 30 days **in process memory**, reset on restart, and can be
read at `GET /api/travel-metrics` with the same operator bearer token. They are
activity totals, not unique-user conversion rates. No names, route/seat data,
boarding contents, account IDs or durable analytics rows are collected. Request
rate limiting uses bounded transient connection-address state, as other APIs do.
