# Airport architecture — M0 / M1 / M2

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


## M2 boundary

Two checkpoints have configurable service times, open-lane counts and assigned
staff from one finite security pool. Closing a lane does not interrupt its active
passenger; it stops starting new work. No wages or other operational resources
are simulated yet. Check-in is a timed abstraction. Walking edges model travel
time, not pedestrian capacity or collisions.

Passengers progress to `waiting_at_gate`. A configured gate-arrival target is
used to measure timeliness; it is not an implemented boarding cutoff. Placeholder
aircraft departures still operate independently of passengers. M3 will connect
the same passenger objects to the existing boarding engine, reconcile timing and
seat assignments, and make flight departures depend on boarding results.
