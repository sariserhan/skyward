# Current status — M0 through M8 implemented

M8 operational resources are complete. Cleaning and catering crews, fuel
units, baggage crews and pushback tugs are limited. Turnaround tasks wait for
them, flights compete, and the player's LOW / NORMAL / HIGH service priority
decides who goes first, which redistributes delay rather than removing it.
Resource waits appear in the departure-delay breakdown only when they are on
the critical path. Save schema v8. See the [M8 completion report](m8-status.md).
M9 airlines and contracts has not started.

Earlier reports: [M7](m7-status.md), [M6](m6-status.md), [M5](m5-status.md), [M4](m4-status.md), [M3](m3-status.md), [M2](m2-status.md), and the M0/M1 report below. Their
limitations and timings are historical; M3 changed the timetable, scenario start,
security defaults, loads, cabin timings and save schema (D-021, D-023, D-024).

---

# M0 + M1 completion report

Implemented on 2026-09-22. M2 has not started.

## Delivered

Riverdale International is the default scene: one terminal, eight gates, one
runway and 24 flights operated by four fictional airlines. Aircraft approach,
land, taxi in, acquire gates, complete timed turnaround, push back, taxi out and
take off. Shared runway capacity and gate occupancy produce cascading delays.
Players can inspect flights, reassign compatible gates, respond to conflicts,
pause, select 1×/2×/4×, and save/load locally.

## Files changed

- `game/scripts/airport/`: ten new scripts covering entity serialization,
  Airport, Flight, Aircraft, Gate, Bag, Runway, clock, event history and simulation.
- `game/configs/airports/riverdale.json`: fictional airport, schedule, aircraft
  categories and configurable gameplay durations.
- `game/scripts/ui/airport/airport_main.gd`, `airport_map.gd` and
  `game/scenes/airport.tscn`: map, board, inspector, reassignment, alerts, controls.
- `game/project.godot`: airport becomes the launch scene.
- `game/scripts/sim/sim_rng.gd`: lossless RNG snapshot/restore methods.
- `game/scripts/sim/passenger.gd`: shared airport identity and journey fields.
- `game/tests/test_airport.gd`, `airport_ui_smoke.gd`, `airport_benchmark.gd`:
  simulation tests, rendered interaction checks and performance harness.
- `game/tests/run_tests.gd`: includes the airport suite.
- `README.md`, `docs/DECISIONS.md`, `docs/architecture.md`, `docs/simulation.md`,
  `docs/roadmap.md`, `docs/status.md`: controls, contracts, scope and handoff.
- Godot-generated `.gd.uid` companions accompany the new scripts.

The supplied `docs/additional_spec.md` was read and left unchanged.

## Existing boarding architecture reused

Preserved the `Simulation` engine, layout definitions, passenger generation,
strategies, seat interference, rendering and standalone boarding scene. Reused
`SimRng`, `JsonUtil`, the canonical `Passenger` class and the headless test harness.
No boarding engine rewrite or duplicate airport passenger model was introduced.

## Architecture and behavior

Canonical lightweight RefCounted models run without a scene tree. One airport
clock advances integer 0.1-second ticks. The existing scenario RNG stream samples
turnaround variation; exact RNG state is saved as strings. Ordered structured
events drive diagnostics and support later replay/analytics. Player decisions are
recorded with ticks. Scenario-array order breaks ties and survives JSON save/load.

Gate assignments reject incompatible classes/terminals/availability windows,
warn on overlap and insufficient buffers, and lock after docking. Blocked incoming
flights wait; active conflicts resolve when occupancy or assignment changes.
The runway arbitrates arrivals/departures in FIFO order with configurable
operation and separation times. Delay reasons distinguish gate waiting, runway
queues, turnaround variation and operational holds.

The map draws aircraft along taxi paths from canonical state. Flight details show
schedule, current phase, turnaround progress and causal durations. Alerts select
the incoming flight and highlight its gate. F3 debug controls expose time, seed,
flight count, runway queue size, event count, FPS and last simulation tick cost;
the flight board/map show individual states and assignments. Debug-only buttons
skip ten minutes, force an arrival, or add a ten-minute hold.

## Validation and commands

All commands ran with `/home/ssari/.local/bin/godot` (4.7.2-stable). `run_tests.sh`
adds that directory to PATH automatically.

| Check | Result |
| --- | --- |
| `godot --headless --path game --import` | Passed |
| `./run_tests.sh --quick` | 31 tests, 0 failures; 50 boarding fuzz scenarios |
| `./run_tests.sh` | 31 tests, 0 failures; 1,000 boarding fuzz scenarios; 91.9 seconds |
| `godot --headless --path game --quit-after 3` | Airport scene loads without script errors |
| `godot --headless --path game res://scenes/main.tscn --quit-after 3` | Preserved boarding scene loads without script errors |
| `godot --headless --path game --script tests/airport_benchmark.gd` | Both benchmark scenarios passed state validation |
| `xvfb-run -a -s '-screen 0 1280x800x24' godot --path game --audio-driver Dummy --script tests/airport_ui_smoke.gd` | 0 failures; screenshots inspected at 1280×800 |

The virtual-display command used `LD_LIBRARY_PATH` pointing to the existing local
X11 library bundle because the base image lacks libXcursor. The final run used
Dummy audio; only the software renderer's unsupported VSync warning remained.
No system packages were installed. The UI smoke test uses a separate test save
and removes it after checking restoration.

Airport tests cover clock pause/speed/backlog, RNG continuation, complete flight
transitions, runway separation, exclusive gate occupancy, waiting/conflicts and
resolution, gate incompatibility/terminal/buffer warnings, departure delay,
deterministic decisions/events, JSON continuation during live operations,
unsorted flight-ID ordering, malformed/version-incompatible saves, debug commands
and frame-speed-independent outcomes. UI checks exercise flight selection,
aircraft hit-testing, gate assignment, pause/resume and save/load. Screenshots:
`/tmp/airport-operations.png` and `/tmp/airport-debug.png`.

## Performance observations

Measured headlessly on this development host while the full regression suite
was also running; timings are observations, not universal budgets.

| Scenario | Simulated time | Wall time | Mean tick | Outcome |
| --- | --- | --- | --- | --- |
| 24 default flights | 4 hours / 144,000 ticks | 3.825 s | 26.56 µs | All 24 departed; 433 events |
| 100 stress flights | 6 hours / 216,000 ticks | 31.533 s | 145.99 µs | 69 departed; 31 pending; 1,860 events |

The stress schedule intentionally overloads gates. Pending flights are capacity
backlog, not a claim that every flight should finish within six hours. At 4×,
40 ticks/second at the measured mean cost is about 5.8 ms of simulation work per
wall-clock second. This excludes rendering and does not establish thousands-of-
passengers performance. The initial three-hour default benchmark had 22/24
completed; allowing four hours accounted for three successive widebody turns.

## Known limitations and technical debt

- Turnarounds are timers; no passengers, boarding integration, baggage flow,
  deboarding, security, resources, economy, scoring or airport construction yet.
- Passenger and bag registries are unused. Full passenger live-state serialization
  must be added in M2; populated passenger saves are explicitly rejected for M1.
- Departure forecasts are stage-based, not a full future runway/gate optimizer.
  Delay-cause durations can consume slack and do not sum to departure lateness.
- Single terminal/runway, fixed map, abstract taxi movement. No taxiway collision
  model, cancellation/diversion handling or docked-aircraft relocation.
- Events and decisions grow without compaction. Saves are local and engine/schema
  pinned; no migration, cloud sync, backend verification or replay UI yet.
- Save checks protect the local restore path; this is not a hardened untrusted
  scenario importer. Scenario files are developer-authored configuration.
- Aircraft cabin layout references are reserved until M3; no inaccurate widebody
  boarding layouts were fabricated.
- Rendering was checked at 1280×800; smaller-screen layouts and exported native
  packages were not validated. Existing dist builds were not regenerated.
- Convex and Better Auth remain deferred; this repository currently has only a
  reserved web directory and this change does not claim backend/auth delivery.

## Recommended M2 plan

Use the same Passenger instances for deterministic entrance → security queue →
processing → graph walk → gate waiting. Add lane controls and rerouting on gate
changes, extend snapshot coverage, test capacity-driven arrival delays, then
profile queue rendering. Detailed sequencing is in [roadmap.md](roadmap.md).
Do not start boarding integration before terminal flow is stable.
