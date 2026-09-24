# M6 plan: connecting passengers

**Status:** implemented 2026-09-24; see [m6-status.md](m6-status.md). No
decision needed escalation, so the plan was recorded and implemented.
Decisions: D-031 to D-033.

## What M5 left

- `Passenger.journey_direction` is `departing` or `arriving`. The outbound
  manifest is `AirportFlight.passenger_ids` and the inbound manifest is
  `inbound_passenger_ids`. `connection_flight_id` exists but is unused.
- `current_flight_id` drives gate routing (`PassengerFlow._continue_walk`),
  admission to boarding (`gate_arrivals`), and flight manifests.

## Conflicts found in the code, and the fix for each

1. **Boarding would reset a connector who is still deboarding.**
   `Simulation.setup_incremental()` calls `setup()`, which resets every
   manifest passenger's cabin fields, and `resolve()` marks them all `QUEUED`.
   A connector can still be in the inbound deboarding cabin when outbound
   boarding opens.
   - **Fix:** `setup_incremental()` resolves ranks and groups but leaves cabin
     state alone. A passenger's cabin fields are reset when they are
     **admitted**.
   - Standalone `setup()` is untouched (golden baseline). Airport boarding of
     local passengers is identical, because fresh passengers already have the
     reset values.
2. **Leg-blind checks.** Several places treat `on_aircraft` in a flight's
   manifest as aboard *that* flight:
   - `_close_gate` (boarded or missed)
   - `missing_passengers()`
   - the departed transition at takeoff
   - `FlightBoarding.valid_snapshot`
   - `_valid_boarding`

   A connector still seated on the inbound aircraft is in the outbound manifest.
   - **Fix:** every such check requires `current_flight_id == f.id`.
3. **One seat per passenger.** The deboarding engine reads `seat_row`,
   `seat_letter` and `side` for the inbound seat; boarding needs the outbound
   seat.
   - **Fix:** `itinerary_seats` stores one seat per leg, and the passenger's seat
     fields switch at the leg change (on leaving the inbound aircraft).
   - The deboarding engine records each passenger's seat key and exit tallies
     at exit, so its result stays correct after the passenger moves on.

## Design

- **Itinerary (D-031).** A connector has `journey_direction = "connecting"`,
  `itinerary_legs = [A, B]`, `leg_index` (0, then 1), `itinerary_seats`,
  `connection_status` (`pending`, `made` or `missed`), and
  `connection_flight_id = B`. `current_flight_id = itinerary_legs[leg_index]`.
  More legs later means a longer array.
- **Manifests.** A connector is in A's `inbound_passenger_ids` and in B's
  `passenger_ids` from generation onward, so B's gate close knows they're
  missing.
- **Generation.** A new stream, `SimRng.STREAM_CONNECTION`, runs after inbound
  generation, so nothing else reshuffles. Per inbound passenger, the connection
  probability comes from the arriving airline (`connections.airline_permille`)
  or the scenario default. Candidate B:
  - not A, and B's destination isn't A's origin
  - departs within `max_connection_ticks`
  - has a free seat (a free cabin seat, or placeholder capacity)
  - is *ideally* reachable: A's planned deboarding start + this passenger's
    row share of the planned deboarding + the ideal gate-to-gate walk ≤ B's
    scheduled D-10 close

  B is picked uniformly from the candidates. A scenario `demo_bank` names exact
  inbound seats to connect for the demonstration.
- **Journey.** Leg 0: `on_aircraft` → `deboarding`. On leaving the aircraft,
  `PassengerFlow.transfer_to_connection()` advances the leg: outbound seat, then
  `walking_to_gate` toward B's gate, airside. From there M3 takes over:
  `waiting_at_gate` → `boarding` → `on_aircraft` → `departed`. If B's gate
  closed first, they keep walking and end as `missed_connection` at that gate,
  stranded (temporary endpoint; no rebooking).
- **Causality.** `connection_report(p)` is derived from recorded ticks:
  - A's gate-arrival lateness
  - the passenger's time from doors open to off the aircraft
  - transfer walk
  - arrival at gate vs gate close
  - hold used vs the limit

  It names the decisive factor.
- **Metrics.** `connection_metrics()`: connecting, made, missed, pending,
  success rate, mean transfer time, minimum margin. Per-flight
  `connections_made` and `connections_missed` are stored for M9.
- **UI.**
  - The boarding block shows booked, at gate, connecting inbound and missing,
    plus up to three missing connectors with status and ETA.
  - The alert reads "N connecting" per outbound flight.
  - Following a connector shows a CONNECTING TO header with the gate close
    countdown, walk estimate, and ON TRACK / AT RISK / MISSED CONNECTION.
  - The Passengers tab marks connectors CX.
  - The metrics bar shows connections.
- **Save schema v6 (D-033).** New passenger itinerary fields and the new
  deboarding-engine records. Validation is direction- and leg-aware.
