# BOARDING

A minimalist 2D passenger-aircraft boarding optimization game. Plan a boarding
strategy, press START BOARDING, watch congestion emerge, then change the
strategy and beat your time.

Full product spec: [spec.md](spec.md). Design decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Layout

```
game/        Godot 4 project (GDScript)
  scripts/sim/   headless simulation core (no Node dependencies)
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

Controls: click a passenger to inspect it. Space starts or pauses, 1/2/4/8
set speed, R restarts, F3 opens the debug panel.

On Linux the editor and game need the usual X11 client libraries. If Godot
reports it cannot load `libXcursor`, install `libxcursor1`.

## Run the tests

```sh
./run_tests.sh            # full suite, including 1000 deadlock scenarios
./run_tests.sh --quick    # 50 deadlock scenarios
```

## Screenshots for review

`game/tests/screenshot.gd` drives the main screen through planning, boarding,
results and the editor and saves PNGs. Under a virtual framebuffer:

```sh
xvfb-run -a -s "-screen 0 1280x800x24" godot --path game --script tests/screenshot.gd -- /abs/output/dir
```
