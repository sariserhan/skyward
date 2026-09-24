# M5 plan: passenger deboarding

**Status:** implemented 2026-09-24; see [m5-status.md](m5-status.md). No major
architectural conflict was found, so the plan was recorded and implemented.
Decisions: D-028 to D-030.

## Current model (from M4 `5ca4b07`)

- A flight is one turnaround with a single id: it arrives as flight X and
  departs as flight X. `AirportFlight.passenger_ids` holds its outbound
  manifest.
- `Passenger` separates the journey layer (`airport_state`) from the cabin
  layer (`state`, the `Passenger.State` enum).
- The boarding engine `Simulation` moves passengers aft (toward higher aisle
  cells). `FlightBoarding` adapts it at 3 boarding ticks per airport tick.
- `AircraftView` draws any engine that exposes `aircraft`, `aisle`,
  `seat_occupied`, `passenger_by_id()`, `queued_passengers()` and `tick`. Its
  `sim` variable is typed as `Simulation`.
- The terminal graph supports one-way edges. Departing routes after security
  are airside-only.
- The turnaround is `Turnaround` plus `TurnaroundTask`, and the boarding task is
  driven by `AirportSimulation`.

## Design

- **Inbound manifests.** New `AirportFlight.inbound_passenger_ids` and
  `inbound_load_permille`. `PassengerFlow.generate()` appends inbound
  passengers after all outbound ones, so outbound ids and draws are unchanged.
  Inbound passengers use their own stream, `SimRng.STREAM_INBOUND`: load draw
  (airline ranges), seats, speed, bags and deboarding timings.
  - Each inbound passenger is marked `journey_direction = "arriving"`, with
    `current_flight_id` set to its arriving flight.
  - All are local arrivals in M5. `connection_flight_id` already exists, so M6
    can mark some as connecting without changing deboarding.
- **Journey states for arrivals:**
  - `on_aircraft`: seated, before doors open
  - `deboarding`: in the cabin engine
  - `walking_to_exit`: in the terminal (IN_TERMINAL / EXITING_AIRPORT)
  - `left_airport`

  The cabin layer adds `Passenger.State` values at the end of the enum, so
  existing ints are unchanged: `LEAVING_SEAT`, `RETRIEVING_BAGS`, `EXITED`.
- **Engine.** New `scripts/sim/deboarding_simulation.gd`
  (`DeboardingSimulation`): pure logic on integer ticks, reusing `AircraftDef`
  and the one-cell-per-row aisle (D-002), moving toward the door at cell 0.
  Per tick:
  1. **Seat leavers.** For each row and side, only the seated passenger nearest
     the aisle may stand. They wait `seat_exit` ticks, then step into their
     row's aisle cell when it is empty. Aisle entry plus carry-on retrieval
     occupy the cell.
  2. **Walkers**, front-most first, move one cell forward when it is free.
     Nobody passes. Rows ahead empty first: seat leavers get courtesy over
     walkers from behind.
  3. **The door** lets one passenger out every `door_interval` ticks.

  Blocked ticks are charged to the head of the jam, as in boarding. Timings are
  airport config (`deboarding`): seat exit, aisle entry, retrieval base and per
  bag, walk per row, door interval. Seeded variation applies only to seat exit
  and retrieval. The standalone `Simulation` is untouched.
- **Adapter.** `FlightDeboarding` (`scripts/airport/flight_deboarding.gd`), like
  `FlightBoarding`: 3 engine steps per airport tick, a snapshot, and
  validation.
- **Turnaround.**
  - A new task kind, `deboarding`, driven by `AirportSimulation`.
  - Graph: `arrival_secured → deboarding, fueling, placeholder_baggage_service`;
    then `deboarding → cleaning, catering → boarding` (boarding exclusive with
    fueling); and `pushback_ready ← boarding, fueling, baggage`.
  - Cleaning and catering shorten, because deboarding now precedes them.
- **Widebody deboarding abstraction (787).** The deboarding task runs for its
  configured duration, then moves every inbound passenger into the terminal.
  It is labelled everywhere.
- **Terminal.** New landside nodes, `arrivals_hall` and `airport_exit`, with
  one-way edges from both concourses. `PassengerFlow.arrive_from_aircraft()`
  starts the walk at the gate. There is no reclaim, customs or ground
  transport.
- **Causality.** Deboarding is a task with a planned duration per aircraft
  type, so the M4 critical-path walk blames its overrun only when it is on the
  path.
- **UI.**
  - `AircraftView.sim` becomes duck-typed; engines expose `aisle_direction`,
    and deboarding shows EXITED n / total.
  - The overlay has a boarding or deboarding mode, and its button reads
    "View deboarding" while doors are open.
  - The Passengers tab lists inbound passengers too.
  - The follow-passenger inspector shows seat and cabin state for arrivals.
  - The turnaround headline reads "Holding turnaround" before boarding starts.
- **Save schema v5.** It adds inbound manifests, arrival passenger fields,
  deboarding sessions and flight deboarding fields. v4 is rejected. Validation
  covers session consistency, the 3:1 tick invariant, and exited ↔ terminal
  states.

## Demos

- **A.** AW 228 (F002): follow one inbound passenger from seat to airport exit.
- **B.** SJ 235 (F003) gets a `deboarding_overrides` door restriction that makes
  deboarding slow. The delay should run through cleaning and catering to
  boarding and pushback, and be blamed on deboarding.
