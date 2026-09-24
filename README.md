# RIVERDALE / BOARDING

A Godot airport operations simulator with a preserved aircraft boarding engine.
The default scene runs Riverdale International: manage gate conflicts while
fictional flights land, taxi, turn around and depart. Airport M0–M4 are
implemented: passengers enter the terminal, clear security, walk to their gates
and board through the preserved cabin simulation. Aircraft turnaround is a
visible task graph (cleaning, catering, fueling, baggage, boarding), and
departures wait for it. Deboarding (M5) is next.

Product direction from M3 onward: [airport_tycoon.md](airport_tycoon.md). M3 report:
[docs/m3-status.md](docs/m3-status.md).

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
```

Rendered UI smoke tests and the M3 demonstration run under a virtual display:

```sh
tools/ui_tests.sh                      # airport UI, terminal UI, M3 and M4 demos
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
