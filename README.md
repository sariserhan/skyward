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

## Run the tests

```sh
./run_tests.sh            # full suite, including 1000 deadlock scenarios
./run_tests.sh --quick    # 50 deadlock scenarios
```
