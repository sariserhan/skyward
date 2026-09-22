# RIVERDALE / BOARDING

A Godot airport operations simulator with a preserved aircraft boarding engine.
The default scene runs Riverdale International: manage gate conflicts while
fictional flights land, taxi, turn around and depart. Airport M0–M2 are
implemented: passengers now enter the terminal, clear security and walk to their
assigned gates. Boarding integration is the next milestone.

Airport architecture: [docs/architecture.md](docs/architecture.md).
Current validation and limitations: [docs/status.md](docs/status.md).

Full product spec: [spec.md](spec.md). Design decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Layout

```
game/        Godot 4 project (GDScript)
  scripts/airport/ headless airport world, entities, clock and events
  scripts/sim/   preserved headless boarding engine (no Node dependencies)
  scripts/ui/    rendering and UI
  configs/       aircraft, scenarios, simulation constants (JSON)
  tests/         headless test harness
docs/        spec, simulation notes, roadmap, decisions
web/         reserved for the future Next.js site
```

## Requirements

Godot **4.7.2-stable** (pinned in `.godot-version`). Put the binary on your
PATH as `godot`.

## Run the game

```sh
godot --path game
```

Airport controls: select an aircraft or flight row to inspect it. Select a gate
and click **Assign gate** to reassign an incoming flight. Overlap warnings allow
intentional waiting; incompatible gates are rejected. Space pauses/resumes;
1/2/4 set speed. Save/Load use `user://riverdale_airport.json`. In debug builds,
F3 reveals +10 minutes, force arrival and +10 minute operational hold controls.

Choose **Terminal** to watch passengers, **Security** to open/close lanes and
assign staff, or **Passengers** to inspect the selected flight's manifest.
Click a passenger on the terminal map to follow their route. Six staff members
are available across two checkpoints; every active lane needs one. Closing a
lane lets its current screening finish. Gate changes reroute the same passengers.

Passenger flow ends at gate waiting in M2. Aircraft still use placeholder
turnarounds and do not wait for passengers; boarding and cutoff consequences
arrive in M3. Saves now use schema v2; v1 airport saves are rejected explicitly.

Run the preserved boarding prototype separately:

```sh
godot --path game res://scenes/main.tscn
```

Boarding controls: click a passenger to inspect it. Space starts or pauses,
1/2/4/8 set speed, R restarts, F3 opens its debug panel.

On Linux the editor and game need the usual X11 client libraries. If Godot
reports it cannot load `libXcursor`, install `libxcursor1`.

## Run the tests

```sh
./run_tests.sh            # full suite, including 1000 deadlock scenarios
./run_tests.sh --quick    # 50 deadlock scenarios
```

Airport benchmark and rendered interaction smoke test:

```sh
godot --headless --path game --script tests/airport_benchmark.gd
xvfb-run -a -s "-screen 0 1280x800x24" godot --path game --audio-driver Dummy --script tests/airport_ui_smoke.gd
```

M2 population benchmark and terminal interaction test:

```sh
godot --headless --path game --script tests/passenger_benchmark.gd
xvfb-run -a -s "-screen 0 1280x800x24" godot --path game --audio-driver Dummy --script tests/terminal_ui_smoke.gd
```

The terminal smoke test writes `/tmp/terminal-security.png` and
`/tmp/terminal-passenger.png`. Both UI tests use isolated test saves.

The airport UI smoke test writes screenshots to `/tmp/airport-operations.png` and
`/tmp/airport-debug.png` and exercises selection, reassignment, pause and save/load.

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
