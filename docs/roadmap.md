# Airport roadmap

Product direction for M3 onward is [airport_tycoon.md](../airport_tycoon.md)
(D-013). The M0–M2 specification is [additional_spec.md](additional_spec.md);
it is kept as historical context. The original boarding roadmap remains at
[ROADMAP.md](ROADMAP.md).

- **M0 implemented:** lightweight domain models, shared passenger identity,
  seeded RNG reuse, integer clock, events, headless tests and local serialization.
- **M1 implemented:** Riverdale, eight gates, one runway/terminal, 24 fictional
  flights, aircraft movement, timed turnarounds, conflicts/reassignment, flight
  board/details, pause/speeds, alerts and debug controls.
- **M2 implemented:** canonical passengers, terminal graph movement, security
  queues, lane/staff controls, gate rerouting, inspectors and populated saves.
- **M3 implemented:** terminal passengers board through the existing cabin
  engine, departure depends on boarding, gate close and player holds, missed
  flights, widebody boarding abstraction, active-boarding saves (schema v3).
  Plan [m3-plan.md](m3-plan.md), report [m3-status.md](m3-status.md). Decisions
  D-014–D-024.
- **M4 implemented:** turnaround task graph (cleaning, catering, fueling,
  placeholder baggage, boarding, pushback readiness) with dependencies,
  exclusivity, blocking reasons, a Turnaround tab and an additive delay
  breakdown. Save schema v4. Plan [m4-plan.md](m4-plan.md), report
  [m4-status.md](m4-status.md). Decisions D-025–D-027.
- **M5 implemented:** inbound manifests of real passengers; a cabin deboarding
  engine (widebody deboarding abstraction for the 787); deboarding as a
  turnaround task gating cleaning and catering; arrivals walk to the airport
  exit; follow a passenger from seat to exit. Save schema v5. Plan
  [m5-plan.md](m5-plan.md), report [m5-status.md](m5-status.md). Decisions
  D-028–D-030.
- **M6 implemented:** two-leg itineraries on the same passenger, generated
  deterministically and only when ideally reachable; deplane → airside transfer
  → outbound boarding; missed connections stranded at the closed gate, with
  derived causes; connection context at gate close (the M3 hold is unchanged);
  connection metrics; save schema v6. Plan [m6-plan.md](m6-plan.md), report
  [m6-status.md](m6-status.md). Decisions D-031–D-033.
- **M7 implemented:** checked baggage. Persistent bags linked to passengers
  (0, 1 or 2, per-airline rates); logical sortation and reclaim stages with
  capacity, queues and service time; real baggage unload and load turnaround
  tasks replace M4's placeholder, and pushback requires baggage loading; local
  arrivals wait at reclaim for their own bags; transfer bags follow connectors
  through transfer sortation; a D-15 bag cutoff, with passengers and bags
  missing independently; save schema v7. Plan [m7-plan.md](m7-plan.md), report
  [m7-status.md](m7-status.md). Decisions D-035–D-037.
- **M8 implemented:** operational resources. Cleaning and catering crews, fuel
  units, baggage crews and pushback tugs are limited pools held by turnaround
  tasks. Tasks wait when none is free; a tug-backed pushback operation;
  deterministic, event-driven allocation; LOW / NORMAL / HIGH service priority
  that redistributes delay; resource waits in the critical-path delay
  breakdown; a Resources tab and shortage alerts; a shortage scenario; save
  schema v8. Plan [m8-plan.md](m8-plan.md), report
  [m8-status.md](m8-status.md). Decisions D-038–D-040.
- **M9 implemented:** airlines as customers. Each airline judges the day from
  real flight records with its own weights (punctuality, connections, baggage,
  turnaround, gates); an explained 0–100 relationship with bands;
  data-driven contracts (PASSING / AT RISK / FAILING, settled at day's end);
  flight requests earned by performance, committed to the next day; Airlines
  tab and detail; save schema v9. Plan [m9-plan.md](m9-plan.md), report
  [m9-status.md](m9-status.md). Decisions D-041–D-043.
- **M10 implemented:** economy and multi-day operation. An integer-cent ledger
  with stable transaction ids; revenue from real operations (aircraft and gate
  service, departed passengers, bag handling) and contract bonuses; costs from
  daily resource capacity, security staff and overhead; careers of fresh
  operating days with persistent cash, relationships and growth; accepted
  airline requests become real flights; between-day capacity planning,
  solvency; Finance tab and end-of-day report; save schema v10. Plan
  [m10-plan.md](m10-plan.md), report [m10-status.md](m10-status.md).
  Decisions D-044–D-047.
- **M11 implemented:** construction and persistent layout. The airport as
  built is career state on predefined sites (gate pads, terminal pieces,
  security lanes, baggage modules, service facilities); Riverdale is imported
  as the initial layout (unchanged day 1 = M10 to the cent); days are built
  from the layout (gates, terminal graph with revisioned routes, lanes,
  servers, resource maxima); validation blocks days that cannot run;
  construction and refunds are capital in the ledger; requests can require
  building; Build tab; save schema v11. Plan [m11-plan.md](m11-plan.md),
  report [m11-status.md](m11-status.md). Decisions D-048–D-051.
- **M12 next, not started:** airside construction (runways, taxiways).

The order after M3 follows D-020: the turnaround task framework comes before any
individual turnaround activity.

M11 stopped here for review. Do not begin M12 until requested.
