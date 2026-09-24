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
- **M4 next, not started:** turnaround task framework (replaces the placeholder
  service-before-boarding timer).
- M5: deboarding, plugged into the turnaround framework.
- M6: connecting passengers.
- M7: baggage.
- M8: operational resources.
- M9: airlines and contracts.
- M10: economy.
- M11: construction and expansion.

The order after M3 follows D-020: the turnaround task framework comes before any
individual turnaround activity.

M3 stopped here for review. Do not begin M4 until requested.
