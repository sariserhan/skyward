# M2 completion report — terminal passenger flow

Implemented on 2026-09-22. M3 boarding integration has not started.

## Delivered

Riverdale now generates 2,172 canonical Passenger objects for its 24-flight
schedule. They enter the terminal, walk to check-in, complete a timed check-in
abstraction, join a FIFO security queue, pass screening and walk to their assigned
gates. Security capacity changes gate-arrival times. Gate changes reroute the
same passengers, including those already walking or waiting at the previous gate.

Players can open/close security lanes, allocate six staff members between two
checkpoints, inspect queue waits, view the terminal map and follow individual
passengers. Flights have inspectable passenger manifests and gate-ready counts.
Security alerts open the relevant controls. The full journey survives save/load,
including active screenings, queues, walking legs and future arrivals.

## Files changed for M2

New simulation files in `game/scripts/airport/`:

- `terminal_graph.gd`: weighted navigation and deterministic shortest paths.
- `security_checkpoint.gd`: capacity, FIFO queue, active lanes and wait metrics.
- `passenger_flow.gd`: generation, stable event heap, movement, service and rerouting.
- `passenger_flow_validation.gd`: populated-save ownership and scheduler checks.

Updated simulation files:

- `game/scripts/sim/passenger.gd`: journey fields and full live snapshot/restore;
  the existing compact boarding record format remains unchanged.
- `airport_state.gd`: canonical passenger and security checkpoint serialization.
- `airport_simulation.gd`: passenger stepping, gate rerouting, recorded capacity
  decisions and schema-v2 persistence.
- `game/configs/airports/riverdale.json`: terminal graph, population, arrival timing,
  service duration and staffing configuration.

UI and verification:

- `game/scripts/ui/airport/terminal_view.gd`: graph, moving passengers, aggregate
  queue/gate counts, route highlighting and passenger hit-testing.
- `airport_main.gd`: Terminal/Security/Passengers tabs, lane/staff controls,
  passenger inspector, manifests, gate-ready counts and security alerts.
- `game/tests/test_passenger_flow.gd`: eleven new domain tests.
- `game/tests/terminal_ui_smoke.gd`: rendered interaction and populated-save checks.
- `game/tests/passenger_benchmark.gd`: baseline/upgraded staffing comparison.
- `test_airport.gd`: aircraft-only fixtures explicitly disable passenger generation.
- `run_tests.gd`: includes the new passenger suite.
- `README.md`, architecture/simulation/roadmap/status docs and `DECISIONS.md` updated.

Godot `.gd.uid` files accompany new scripts. Existing boarding algorithms,
strategies and the standalone boarding scene remain unchanged.

## Verification

| Command/check | Result |
| --- | --- |
| `./run_tests.sh --quick` | 42 tests, 0 failed; 50 boarding fuzz scenarios |
| `./run_tests.sh` | 42 tests, 0 failed; 1,000 boarding fuzz scenarios; 93.3 s |
| `godot --headless --path game --quit-after 3` | Airport scene loads without script errors |
| `godot --headless --path game res://scenes/main.tscn --quit-after 3` | Preserved boarding scene loads without script errors |
| `godot --headless --path game --script tests/passenger_benchmark.gd` | Both population runs completed and JSON restores passed |
| `godot --headless --path game --script tests/airport_benchmark.gd` | 24- and 100-flight cases passed state/save validation with passengers enabled |
| Rendered `tests/airport_ui_smoke.gd` | 0 failures |
| Rendered `tests/terminal_ui_smoke.gd` | 0 failures, including final labels/layout |
| `git diff --check` | Passed |

Runtime: `/home/ssari/.local/bin/godot`, pinned 4.7.2-stable. Rendered checks used
`xvfb-run -a -s '-screen 0 1280x800x24'`, `--audio-driver Dummy` and the existing
local X11 library bundle via `LD_LIBRARY_PATH`. No packages were installed.
The software renderer reported unsupported VSync, with no script errors.

Tests cover canonical identity, complete journeys, weighted routing, airside
boundaries, lane capacity versus gate arrival, staff limits, closure/draining,
FIFO reopening, rerouting during a walking edge and from an old gate, same-seed
reproduction, pause/speed independence, populated save continuation at six
journey stages, and rejection of broken ownership/queue/scheduler references.
The original airport and boarding suites remain in the full run.

Rendered checks exercise staff/lane buttons, closing and draining a checkpoint,
clicking passengers, manifest selection, gate reassignment and exact save/load
comparison. Screenshots inspected at 1280×800:
`/tmp/terminal-security.png` and `/tmp/terminal-passenger.png`.

## Observed capacity and performance

Same scenario/seed, all 2,172 passengers, six simulated hours:

| Security configuration | Average completed queue wait | Late to gate target | At assigned gate | Runtime |
| --- | --- | --- | --- | --- |
| Default: West 2 + East 1 staffed lanes | 41.07 min | 1,034 | 2,172 | 5.456 s |
| Upgraded: West 3 + East 3 staffed lanes | 0.16 min | 0 | 2,172 | 5.485 s |

Mean passenger-enabled airport tick cost was 25.3 µs in those runs. Security
waits and gate lateness are gameplay results, not real-world operational claims.
The gate target is ten minutes before scheduled departure; it is not a boarding
cutoff or a missed-flight result.

The separate 100-flight stress schedule ran six simulated hours in 33.068 seconds,
153.09 µs/tick, while the full boarding suite was running. It ended with 69 flights
departed and 35,464 events, and passed populated-save validation. Its remaining
flights/passengers reflect intentional capacity overload. These are host-specific
headless observations, not a rendered frame-rate or mobile performance guarantee.

Simulation work scales with scheduled passenger transitions: idle gate passengers
and security queues require no per-tick passenger scan. Rendering draws at most
300 moving samples plus bounded stationary samples, with exact aggregate counts.
The inspector can follow a selected passenger even outside the normal sample.

## Boundaries and limitations

- M2 ends at gate waiting. Placeholder aircraft turnarounds still depart
  independently of passengers; boarding, cutoffs, seat assignment and passenger-
  caused departure delays are M3 work.
- Save schema is v2. Existing M1/v1 saves are rejected explicitly; migration is
  not implemented. New saves preserve all Passenger live fields, including the
  existing boarding substate.
- Check-in is timed rather than capacity-limited. Graph edges have travel times
  but no pedestrian congestion/collisions. No dynamic construction or routing
  optimization around queue lengths.
- Checkpoint choice stays fixed after generation. Gate changes alter walking
  routes, not checkpoint assignment. Screening already underway finishes when
  its lane loses capacity; staffing changes model capacity rather than physical
  staff movement between checkpoints.
- No travel-party behavior, checked-bag movement, deboarding or connections yet.
- No economy costs for staffing, cloud sync, replay UI or save migration.
- Event history still grows without compaction; extended sandbox play needs
  checkpoints/retention before shipping indefinite sessions.
- Rendered validation covers 1280×800. Native release exports and smaller-screen
  layouts were not tested; existing dist binaries were not regenerated.

## Next milestone

M3 should adapt existing Passenger objects and a supported cabin definition into
the preserved boarding engine, then use actual gate arrival and boarding results
to control departure readiness. See [roadmap.md](roadmap.md). M3 was not started.
