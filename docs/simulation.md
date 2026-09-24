# Airport simulation contract

See [SIMULATION.md](SIMULATION.md) for the preserved boarding-engine contract.

## Clock and replay

One integer tick is 0.1 simulation seconds. Time is absolute from midnight;
Riverdale starts at 06:00. The renderer converts wall time into tick counts at
1×, 2× or 4×. Pausing does not accumulate wall time. A slow frame retains its
backlog rather than discarding simulation time. Explicit headless/debug advances
bypass playback pause. Exact transitions can include a one-tick stage boundary.

Every `step()` increments the clock, completes an active runway operation,
updates flights in scenario order, starts the next eligible runway operation,
and refreshes active gate conflicts once per simulation second. Scenario order
is reconstructed from the scenario array after load; sorted JSON dictionary keys
cannot change tie-breaking. Frame speed never enters domain transitions.

The existing seeded `SimRng` scenario stream generates turnaround variation once
at setup. No global RNG is used. RNG seed/state serialize as decimal strings to
avoid JSON losing 64-bit precision. Integer-valued JSON numbers are normalized
on load. Reproduction requires identical scenario, seed, decisions, simulation
code and pinned engine version. Cross-engine determinism is not claimed.

Accepted gate assignments and debug perturbations record tick-stamped decisions.
A caller can reproduce them at the recorded tick; a replay player UI is deferred.

## Flight transitions

`scheduled → approaching → landed → taxiing_in → at_gate → turnaround →
boarding → ready_for_pushback → taxiing_out → departed`

Since M4, `turnaround` means the task graph is running and the boarding task
has not started. See **Turnaround tasks** below. `boarding` runs its own phases,
`scheduled → open → closed → complete`:

- When service finishes at tick *s*, the departure target becomes
  `max(D, s + 30 min)`, where D is the scheduled takeoff.
- Boarding opens at target − 30 min and the gate closes at target − 10 min
  (config `boarding.*`). An on-time aircraft therefore opens at D-30 and closes
  at D-10. A late one shifts the whole window and opens on the tick service
  ends.
- The gate closes early as soon as the whole manifest is aboard: seated for
  cabin flights, or at the gate for the widebody abstraction. Otherwise it
  closes at the scheduled time and the hold decision stays with the player.
- At close:
  - Cabin flights stop admitting and complete once everyone admitted is seated.
  - Widebody flights (boarding abstraction) board everyone at the gate
    instantly.
  - Every other manifest passenger is flagged missed.
- Pushback happens once boarding is complete, but never before
  `D + hold used − taxi-out − takeoff`. An on-time flight never leaves early. A
  late aircraft that boards quickly does not wait out its shifted window, so
  efficient boarding recovers delay.

**Holds.** `hold_flight` adds `hold_increment_ticks` (5 min) to both the close
time and the target, up to `max_hold_ticks` (15 min). It is only available while
the gate is open and never automatic. `close_gate` closes now and cancels unused
hold time.

**Boarding delay attribution.** At pushback *P*, lateness beyond the scheduled
pushback `D − exit` is split additively:

- first `passenger_hold`: the hold time actually used
- then `boarding`: the cabin still boarding after both the pushback floor and
  gate close

A gate kept open for missing passengers in a late aircraft's shifted window is
explained by the upstream causes: gate wait, landing queue and turnaround
variation.

**Deboarding (D-028, D-029).**

- Inbound passengers sit in their seats until doors open (deboarding task
  released, after arrival secured).
- Per row side, the passenger nearest the aisle gets up first, then steps into
  their row's aisle cell when it is free. Seat leavers go ahead of walkers from
  behind.
- They retrieve bags in the aisle, which blocks those behind, then walk toward
  the door. Nobody passes.
- The door lets one passenger out per interval. Each one enters the terminal at
  the gate and walks to the airport exit.
- Deboarding completes when the last passenger is off, which releases cleaning
  and catering.
- Widebodies (abstraction): after the configured duration, everyone enters the
  terminal together.

**Connections (D-031, D-032).**

- About 12% of arrivals connect. At generation, each connector is placed on an
  outbound flight they could make under ideal conditions, and is on its
  manifest from the start.
- On leaving the inbound aircraft they switch to the outbound leg and seat,
  then walk airside to the outbound gate. The normal boarding rules apply:
  admitted once at the gate, D-10 close unless held, early close once everyone
  is aboard.
- If the gate closes first, they are marked missed, keep walking, and end
  stranded at the closed gate as `missed_connection`.
- Holds cost exactly what M3 holds cost: the departure target moves, the gate
  is kept, and the runway slot is lost.

**Turnaround tasks (D-025).**

- Tasks start when the aircraft reaches the gate. Their order and durations
  come from `turnaround.tasks` (per aircraft type), plus 0–15% seeded
  variation drawn at setup, plus optional per-flight `turnaround_overrides`.
- A task starts on the first tick its prerequisites are complete and no
  exclusive partner is active. A task finishing on a tick releases its
  dependents on that same tick.
- The boarding task is released when cleaning and catering are done and
  fueling isn't running. On that tick the M3 window is scheduled: target
  `max(D, release + 30 min)`.
- `pushback_ready` completes when boarding, fueling and baggage are complete.
  Pushback follows once the scheduled pushback plus hold used has passed.
- A debug ramp hold extends the first task if it's unfinished, else every
  running timed task.

Riverdale placeholder durations (minutes):

| Task | A220 | 737 | A321 | 787 |
| --- | --- | --- | --- | --- |
| Arrival secured | 1 | 1 | 1 | 1 |
| Deboarding (planned; actual from the cabin engine) | 6 | 8 | 9.5 | 12 |
| Cleaning (after deboarding) | 5 | 6 | 7 | 8 |
| Catering (after deboarding) | 4 | 5 | 6 | 7 |
| Fueling | 10 | 14 | 16 | 18 |
| Baggage (placeholder) | 20 | 24 | 26 | 35 |

Demo flight F004 (GA 242) has a 25-minute deep-clean override.

**Departure delay breakdown (D-026).** At takeoff, the lateness is split into:

- runway queue
- hold used
- a critical-path walk from `pushback_ready`: each task takes its own overrun
  first, and passes the rest (up to its own late start) to the task that
  released it
- `late_inbound` for whatever reaches the gate

The parts sum exactly to the lateness.

**Loads and cabin calibration (D-024).** Each flight's load is an explicit
`load_permille`, or else drawn once from `SimRng.STREAM_LOAD` within its
airline's `airline_load_permille_ranges`, or else within the scenario's
`load_permille_range`. The resolved value is stored on the flight. Riverdale
boards with airport-only cabin timings (`boarding.sim_config_overrides`):

- 3.3 s between door entries
- 1.8 s per row walked
- 8 s + 10 s per bag to stow
- 11 s per seated passenger who must get up

The standalone game keeps `sim_config.json`.

A flight requests landing to target its scheduled arrival. Actual arrival means
landing completion. Taxi-in follows. An occupied gate leaves the incoming flight
waiting in taxi-in; it cannot start turnaround until it acquires the gate.
Required turnaround time must elapse before pushback. A ready flight waits until
its scheduled departure minus taxi-out and takeoff time. Departure means takeoff
completion, not pushback. Gate ownership clears at pushback.

## Runway

One FIFO queue serves both landing and takeoff. Only one operation is active.
After completion, the configured separation interval blocks the next operation.
Requests at the same tick use stable scenario order. Scheduled arrivals can be
late because landing shares the runway with takeoff.

Default game durations: landing 70 seconds, takeoff 55 seconds, separation 40
seconds, taxi-in/out 180 seconds. These are gameplay settings, not real-world
operating procedure. Service before boarding is A220 12, 737 15, A321 17 and
787 20 minutes, with 0–2 minutes of seeded variation. The morning starts at
05:15. Three waves arrive 50 minutes apart, with arrival-to-takeoff block times
of 48–56 minutes (D-023). Gate reuse stays tight, so late aircraft and holds
still cascade.

## Gates, estimates and delay causes

Assignment warnings inspect aircraft class, terminal, availability window,
interval overlap and turnaround buffer. Occupancy is exclusive. Incoming flights
wait if no gate is available; the player can assign another compatible gate.

A conflict alert appears within ten minutes of planned gate arrival when the
current occupant's estimated release overlaps it. One event opens the conflict;
a resolution event closes it. Critical waiting conflicts sort ahead of warnings.
Selecting an alert selects its incoming flight and highlights the assigned gate.
All gates fit on the M1 map, so a camera pan is unnecessary.

Estimated departure reflects the current stage and turnaround completion; it is
not an optimized forecast of future runway queues or all future gate conflicts.
It updates as actual blocking becomes known. Structured `delay_reasons` preserve
turnaround variation, gate waiting, landing/takeoff queue waiting and debug holds.
These are causal durations and can consume schedule slack; they are not additive
shares of final departure lateness. Final lateness is actual minus scheduled
departure, floored at zero. On-time uses zero lateness, without an airline-style
grace period. Money/reputation are reserved state, not an operating economy yet.

## Events and invariants

Events carry sequence, tick, type, flight ID and structured details. History owns
copies, and subscribers receive copies. Events include state changes, runway
queue/start/completion, gate arrival, pushback, departure, assignments, delays,
conflicts and resolutions. Event consumers must submit decisions between ticks,
not recursively mutate the simulation during an emitted event.

Invariants checked in tests and save validation:

- Flight IDs and references resolve; scenario order includes every flight once.
- Gate occupancy and docked flight assignments agree in both directions.
- A flight cannot occupy incompatible gates or teleport after docking.
- Runway requests are unique, and queued/active requests match flight states.
- Runway operations obey configured separation.
- Required turnaround finishes before pushback/departure.
- Equal inputs/decisions yield equal ordered events and state at equal ticks.
- JSON save/resume, including active runway work, matches uninterrupted execution.

Airport snapshots include scenario/config, engine/schema version, seed/RNG, clock and
pacing, entities, runway work, event history, decisions and open conflicts, full passengers, security queues/active screenings and the
passenger event heap. Real
profiling time is excluded. Event history is currently unbounded; compact it or
checkpoint it before indefinite sandbox play.


## M2 terminal passenger flow

Riverdale creates 2,172 passengers at 45% of the configured aircraft capacities.
Each is the canonical `Passenger` class, with an itinerary reference, destination,
seeded walking speed/carry-ons and a scheduled terminal-arrival tick. Seat layout
assignment is deferred to the M3 boarding adapter. Generation uses the independent
passenger RNG stream, so adding passengers does not change aircraft turnaround
randomness. Arrival times range from 15–45 minutes before scheduled departure,
clamped to the scenario start when necessary. The gate target is ten minutes
before scheduled departure. These are configurable gameplay assumptions.

Journey phases:

`not_arrived → walking_to_check_in → check_in → walking_to_security →
security_queue → security_processing → walking_to_gate → waiting_at_gate`

Terminal entry emits an event. Check-in is a timed abstraction. Passengers walk
graph edges using integer, speed-adjusted durations. Dijkstra routing uses edge
walking ticks and lexical node-ID tie-breaking. After security, routes cannot
cross back into landside nodes. An unreachable goal results in `route_blocked`
and an explicit event. The configured graph is developer-authored; construction
and graph editing are not runtime features.

Each passenger chooses the shortest entrance/check-in/security/gate route at
generation; checkpoint choice does not dynamically optimize queue length. Once
assigned, the checkpoint stays fixed. Gate reassignment updates the destination:
passengers on an edge complete that edge and reroute at the next node; passengers
already waiting at the old gate walk from there. Their gate-arrival time resets
until they reach the new gate. No duplication, teleportation or re-screening.

A stable binary min-heap holds the next transition per moving/future/processing
passenger. Entries order by absolute tick then monotonic sequence. The airport
steps passengers after its flight/runway transitions on each tick. Idle queues
and gate-waiting passengers need no scheduled updates. The full heap and sequence
counter are persisted, preserving ties even when JSON sorts dictionary keys.

## Security control and metrics

West starts with two open/staffed lanes; East starts with one. Each checkpoint
supports four lanes; six staff members are available in total. Service takes
120 ticks (12 seconds) per passenger. Effective capacity is the smaller of open
lanes and assigned staff. A closed/unassigned lane finishes its current screening
but accepts no new work. Queues are FIFO. Capacity changes dispatch eligible
waiting passengers immediately at the decision tick and are recorded for replay.

Per-checkpoint metrics include queue size, active screenings, oldest current wait,
processed count, cumulative wait and maximum wait. Average wait is computed over
completed screenings. Security alerts appear for a waiting queue with no effective
capacity, or when its oldest wait reaches ten minutes. Selecting one opens the
Terminal and Security tabs.

New structured events include `PASSENGER_TERMINAL_ENTER`,
`PASSENGER_SECURITY_ENTER/START/EXIT`, `PASSENGER_GATE_ARRIVE`,
`PASSENGER_REROUTED`, `PASSENGER_ROUTE_BLOCKED` and `SECURITY_CAPACITY_CHANGED`.
Gate-arrival events retain late ticks relative to the target. Late arrival is
currently a measured outcome; no missed-flight or departure-delay consequences
are imposed until M3 integrates boarding.

## Passenger save invariants

Schema v2 stores every Passenger field independently of the compact boarding
record format. Integer IDs use string registry keys so JSON round-trips preserve
lookups. Manifests own each passenger exactly once. A queued passenger must occur
once in its checkpoint queue; a screened passenger must own exactly one active
lane; walking/future/processing passengers must have exactly one matching heap
entry. Gate-waiting passengers must have cleared security and reached the assigned
gate. Closed lanes may retain draining screenings. Staff allocations cannot exceed
the shared pool. Invalid references, duplicate ownership, missing scheduled work
or broken heap order reject the save before replacing the live airport.

Derived aggregate counts are rebuilt. Live boarding substate fields also survive
airport save/load, without changing `Passenger.to_dict()` for existing boarding
records. M1/schema-v1 saves are explicitly incompatible; migration is deferred.
