# Airport architecture — M0 / M1 / M2 / M3

The airport is now the default Godot scene. The existing boarding scene remains
available at `res://scenes/main.tscn`; its simulation algorithm is unchanged.

## Ownership

- `scripts/airport/airport_simulation.gd`: authoritative airport state transitions,
  runway arbitration, assignment commands, delay causes, snapshots and validation.
- `passenger_flow.gd`: canonical passenger generation, scheduled terminal movement,
  FIFO security service, lane/staff capacity and gate rerouting.
- `terminal_graph.gd`: shortest paths and integer walking durations, independent
  of rendered node positions.
- `security_checkpoint.gd`: lane/staff limits, active screenings, queue and metrics.
- `passenger_flow_validation.gd`: passenger/manifest/queue/scheduler save invariants.
- `flight_boarding.gd`: one flight's cabin boarding session. Adapter around the
  preserved `Simulation` engine; validates saved sessions (M3).
- `airport_clock.gd`: absolute integer simulation ticks and presentation pacing.
- `airport_events.gd`: ordered event history plus a signal delivering copied events.
- `airport_state.gd`: canonical entity registries, money, reputation and resources.
- `airport_entity.gd`: primitive-field serialization for lightweight RefCounted models.
- `airport_flight.gd`, `airport_aircraft.gd`, `airport_gate.gd`, `airport_bag.gd`,
  `airport_runway.gd`: domain data, independent of scene nodes.
- `scripts/ui/airport/airport_main.gd`: flight board, controls, inspector and alerts.
- `scripts/ui/airport/terminal_view.gd`: capped passenger samples, aggregate queue
  and gate counts, route highlighting and passenger hit-testing.
- `scripts/ui/airport/airport_map.gd`: immediate-mode airport and aircraft rendering.
- `scripts/ui/airport/boarding_overlay.gd`: full-screen live cabin inspection that
  embeds the standalone `AircraftView`, bound read-only to a flight's engine.
- `configs/airports/riverdale.json`: timetable, fictional airlines, eight gates,
  four aircraft categories and all operational durations.

`AirportSimulation` owns one `AirportClock`; there is no duplicate time in the
Airport model. M1 has one runway and one terminal. Rendering reads the canonical
objects and submits commands. Aircraft sprites are drawn together in one Control;
they never own simulation state. Interpolated route positions are visual only.

## Reuse and compatibility

`SimRng` is reused with the existing scenario stream, extended with lossless state
snapshot/restore. `JsonUtil` and the existing headless test harness are reused.
`Simulation`, `SimRunner`, boarding strategies, manifests, aircraft layout logic,
seat interference and the boarding scene retain their previous behavior.

`Passenger` remains the single passenger class. M2 generates canonical objects
into `AirportState.passengers` (string keys of integer IDs); flight manifests
reference those same IDs. `state` is the preserved boarding substate and
`airport_state` is the enclosing journey phase. `Passenger.to_dict()` retains its
boarding-record contract; `snapshot()` / `restore_snapshot()` cover every live
field, including both timing domains. Passengers are never recreated on rerouting.
Bags remain reserved data with no active flow.

`PassengerFlow` holds references to airport state and the event bus, not back to
the owning simulation. A min-heap schedules the next transition per passenger;
queues and finished journeys do not require per-tick scans. Its times come from
`AirportClock`. Derived state counts are reconstructed on load. Terminal rendering
uses immediate-mode dots and capped representative samples; all passengers remain
in canonical simulation state even when not drawn individually.

An `AirportAircraft` is a physical aircraft instance; `AircraftDef` remains a
reusable cabin layout definition. The reserved `seat_map` reference is not bound
until boarding integration. Do not invent a new boarding layout or passenger model.

## Scope boundaries

Turnaround is a configurable timer, not a task graph yet. Gate reassignments apply
before docking; a docked aircraft cannot teleport. Incompatible aircraft,
terminal mismatches and availability-window violations are rejected. Overlap and
buffer warnings are advisory: a player may intentionally accept a wait.

The local save is versioned (schema v2 for populated airports), checks the engine build, preserves clock and RNG,
and is written via temporary file + rename. Shape/reference checks reject damaged
snapshots before replacing the live simulation, including manifest ownership,
queue/active-service membership, heap ordering and pending transitions. Schema v1
saves are rejected; there is no automatic migration. This is local persistence, not
untrusted cloud import or backend verification. No Convex or Better Auth behavior
was added or replaced. Cloud sync waits for later persistence work.


## M3 boarding integration

**Tick domains (D-015).**

- The airport runs at 10 Hz and the boarding engine at 30 Hz.
- `FlightBoarding.step()` runs once per airport tick and advances its engine by
  exactly `boarding_ticks_per_airport_tick` (3) engine steps. So
  `engine.tick == 3 × (airport ticks since open, inclusive)` until completion;
  save validation checks this.
- Boarding-tick quantities (passenger cabin timers, `boarding_result`) are never
  shown raw. The UI converts them with `SimConfig.tick_rate`.

**Step order.**

```
clock → runway completion → flights (open / close / readiness) → runway start
→ passenger_flow → boarding sessions (flight_order) → conflicts
```

A passenger reaching the gate on tick *t* is admitted on tick *t*. A gate that
closes on tick *t* closes before that tick's arrivals.

**Engine.** `Simulation.setup_incremental()` resolves the strategy over the whole
manifest, with the same seeded groups and order as `setup()`, but starts with an
empty door queue:

- `admit(ids)` appends passengers who are physically present, in strategy order
  among themselves.
- `close()` ends admission. Completion requires `closed` and everyone admitted
  seated.
- `setup()` closes immediately, so standalone results are unchanged. A 48-run
  golden baseline guards this.

**Identity.** The flight's canonical `Passenger` objects are the engine's
manifest. `airport_state` (journey) and `state` (cabin) are separate layers on
that one object (D-016). Seats and boarding-tick durations are assigned at
generation from `SimRng.STREAM_CABIN` via `PassengerGenerator.apply_cabin_timing`.

**Modes.** An aircraft type with a `cabin` config boards in the engine. Other
types use the *widebody boarding abstraction*: the same window and gate-close
rules, and everyone present boards instantly at close.

**Persistence (schema v3).** Each open session saves its engine fields:

- queue, aisle, active list and seat occupancy
- counters, strategy and config
- the rank map

Passenger fields travel in `Passenger.snapshot()`. `FlightBoarding.valid_snapshot`
and `AirportSimulation._valid_boarding` reject inconsistent sessions before
anything is replaced. Engine state and passengers restore onto the same restored
objects.

## M3 boundary

- **Service before boarding** is a placeholder timer
  (`service_before_boarding_ticks`) until M4 turnaround tasks.
- **Cabin timings** in the airport come from `SimConfig` plus the scenario's
  `boarding.sim_config_overrides` (D-024). The standalone scenarios are
  untouched.
- **Cabins** have one front door.
- **Missed passengers** are not rebooked.
- **Airport speeds** remain 1×, 2× and 4×.

## M2 boundary

Two checkpoints have configurable service times, open-lane counts and assigned
staff from one finite security pool. Closing a lane does not interrupt its active
passenger; it stops starting new work. No wages or other operational resources
are simulated yet. Check-in is a timed abstraction. Walking edges model travel
time, not pedestrian capacity or collisions.

In M2, passengers stopped at `waiting_at_gate`, and departures ran independently
of them. M3 replaced that; see above.
