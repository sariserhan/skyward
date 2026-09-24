# Airport architecture — M0 to M9

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
- `turnaround.gd` / `turnaround_task.gd`: the turnaround task graph (M4).
  Rules: creation, per-tick status updates, blocking reasons, "holding
  departure", and additive delay attribution. The tasks themselves are
  canonical entities in `AirportState.turnaround_tasks`.
- `flight_deboarding.gd`: one arriving flight's cabin deboarding session (M5).
  Adapter around `scripts/sim/deboarding_simulation.gd`, the deboarding engine.
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

## M4 turnaround

`_update_flight()` calls `_update_turnaround()` for docked flights:

1. The task pass runs first. Releasing the boarding task runs M3's
   `_schedule_boarding()`.
2. `_update_boarding()` runs next, unchanged.
3. A second task pass lets boarding completion release `pushback_ready` on the
   same tick.

`Turnaround.update()` skips a flight until its next possible change: a running
task's finish, or a wake when boarding opens, boarding completes or durations
change. An update with nothing due is a no-op, so skipping keeps results
identical.

Departure estimates walk the graph for docked flights. Flights that haven't
docked use two cached offsets. Estimates refresh once per simulated second,
alongside the conflict check.

**UI.**

- The flight details get a "Holding departure" headline: the pushback
  milestone's blocked chain, followed to the running work.
- A compact turnaround summary sits under it.
- A **Turnaround** tab holds the full task table.
- After takeoff, the additive delay breakdown is shown.

## M9 airlines

**Ownership.** `airline_relations.gd` (`AirlineRelations`) owns:

- per-flight outcome records
- per-airline state: contract status, the settled flag, adjustments, request
  state
- the cached evaluations

It never reads simulation internals: `AirportSimulation._airline_record()`
builds each record at takeoff, from the breakdown, manifests, bags, tasks and
events.

**Evaluation** is a pure function of the records and the state (`evaluate()`,
`metrics()`, `_dimension()`, `contract_status()`). It runs when a flight
departs or a request is answered.

**Commands and helpers.**

- `answer_airline_request()` is a recorded decision.
- `_request_slot_free()` checks the next day's slot against gate occupancy.
- `_served_while_waiting()` binary-searches the event history for the
  resource assignments made during a wait.

**UI.**

- The **Airlines** tab lists each airline.
- An airline detail (`_airline_text()`) shows why the score is what it is, the
  contract, problem flights and the request, with ACCEPT / DECLINE as
  RichText links.
- Alerts cover contracts at risk or failing, and offered requests.

**Scenario overlays** gain `flight_overrides`, `include_flights` and
`task_overrides` (used by `riverdale_airline_conflict.json` and
`riverdale_ga_hold.json`).

## M8 operational resources

**Ownership.** `airport_resources.gd` (`AirportResources`) owns the pools:

- explicit units and their holder tasks
- one ordered queue per type
- statistics and dirty flags

`Turnaround` holds a reference to it:

- `update()` calls `request()` instead of starting a task that needs a unit
- `_complete()` calls `release()`
- `grant()` starts a task handed a unit

**Each tick** `AirportSimulation.step()` calls `resources.dispatch()` once,
after the flight loop and only when a pool is dirty. It calls `_grant()`,
which either starts the task through `Turnaround.grant()` or, for the
pushback operation, `_push_back()`, which releases the gate.

**Pushback.**

- `_try_pushback()` requests a tug once the milestone is complete and the
  floor has passed.
- `_finish_pushback()` releases the tug during taxi-out.

**Blame.** `Turnaround._blame()` splits a task's late start into its resource
wait (`wait:<type>`) and inherited lateness. `attribute()` takes the tug wait
first.

**Commands and reporting.** `set_service_priority()` is recorded as a
decision. `resource_metrics()`, `resource_queue()`, `resource_holders()` and
`AirportResources.expected_start()` (used by estimates) feed the UI:

- the Resources tab
- turnaround WAITING rows and the flight's waiting lines
- the service priority row
- shortage and tug alerts

**Scenarios.** `AirportSimulation.load_config()` resolves `extends` overlays.
The airport scene takes `--scenario=<path>`.

## M7 baggage

**Ownership.** `baggage_system.gd` (`BaggageSystem`) owns bag processing:

- the logical stages (queue, busy servers)
- one stable event heap (transit arrivals, service completions, unloads,
  loads, offloads)
- per-flight loader operations (`bag_load_queue`, `bag_loader_current`)

Bags are `AirportBag` entities in `AirportState.bags`. Passengers hold
`checked_bag_ids`.

**Each tick** `AirportSimulation.step()` runs `baggage.step()` after
passengers, boarding and deboarding. Flights drive the two driven turnaround
tasks through `Turnaround.update(f, now, schedule_boarding, starters)`, which
now takes a starter per driven kind (`deboarding`, `baggage_unload`,
`baggage_load`). `_update_baggage_tasks()` then:

- completes unload at its due tick
- applies the bag cutoff
- finalizes loading once the gate is closed
- completes loading when the loader is idle and empty

**Passenger side.** `PassengerFlow` calls `baggage.check_in()` at check-in.
`arrive_from_aircraft()` routes passengers with bags to the reclaim node.
`bag_at_reclaim()` releases a waiting passenger once all their bags are on
the belt.

**Reporting.** `flight_baggage()`, `baggage_metrics()`,
`bag_ready_estimate()`, `bag_connection_status()` and `bag_transfer_margin()`
feed the UI (flight baggage block, task progress, passenger bag lines,
Passenger / Bag outlook for connectors, backlog alerts, top bar).

**Without baggage config** (earlier fixtures), the two tasks run on their
nominal durations and nobody stops at reclaim.

## M6 connections

**Legs.** A connector's `current_flight_id` follows `itinerary_legs[leg_index]`,
so every existing system keys on the current leg:

- gate routing
- `gate_arrivals` admission
- manifests
- reroutes on a gate change

Checks that mean "aboard *this* flight" (gate close, missing passengers, the
departed transition, session validators) test `current_flight_id == f.id`
(`_aboard()`).

**Leaving the inbound aircraft.** `_deplane()` sends local arrivals to
`arrive_from_aircraft()` and connectors to `transfer_to_connection()`.

**Reporting.** `connection_report()`, `connection_metrics()`,
`missing_connectors()` and `connector_eta()` feed the UI from recorded state.

## M5 arrivals

**Inbound manifests.** Each flight carries inbound passengers
(`inbound_passenger_ids`), generated after all outbound ones from
`STREAM_INBOUND`.

**Doors open.** When the deboarding task is released, `_start_deboarding()`
runs:

- For cabin flights, a `FlightDeboarding` session starts.
  `_step_deboarding()` runs after `_step_boarding()` each tick, at three engine
  steps per airport tick. Every passenger who reaches the door enters the
  terminal at the gate on that same tick, through
  `PassengerFlow.arrive_from_aircraft()`.
- Widebodies use the widebody deboarding abstraction:
  `_update_abstract_deboarding()` moves everyone into the terminal at the
  task's end.

**Completion.** Completion reports to
`Turnaround.deboarding_complete()`, which releases cleaning and catering.

**Cabin view.** `AircraftView` is duck-typed over both engines and draws either
direction using `aisle_direction`. The overlay has boarding and deboarding
modes.

## M3 boundary

- **Service before boarding** is the M4 task graph; see above.
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
