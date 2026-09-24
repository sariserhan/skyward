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
- **M8 next, not started:** operational resources.
- M9: airlines and contracts.
- M10: economy.
- M11: construction and expansion.

The order after M3 follows D-020: the turnaround task framework comes before any
individual turnaround activity.

M7 stopped here for review. Do not begin M8 until requested.
