# Airport roadmap

The airport expansion specification is [additional_spec.md](additional_spec.md).
The original boarding roadmap remains at [ROADMAP.md](ROADMAP.md).

- **M0 implemented:** lightweight domain models, shared passenger identity,
  seeded RNG reuse, integer clock, events, headless tests and local serialization.
- **M1 implemented:** Riverdale, eight gates, one runway/terminal, 24 fictional
  flights, aircraft movement, timed turnarounds, conflicts/reassignment, flight
  board/details, pause/speeds, alerts and debug controls.
- **M2 implemented:** canonical passengers, terminal graph movement, security
  queues, lane/staff controls, gate rerouting, inspectors and populated saves.
- **M3 next, not started:** adapter into the preserved boarding engine.
- M4–M7: deboarding, turnaround tasks, connections and independent baggage flow.
- M8–M11: operational resources, airline relationships, economy/expansion,
  scenario objectives/scoring and challenges.

## Recommended M3 slice

1. Bind each flight's aircraft instance to a supported existing cabin definition;
   limit first integration to a compatible narrowbody configuration.
2. Assign seats and boarding timing fields on existing Passenger instances.
   Preserve airport identity, itinerary, location and security history.
3. Add a BoardingScenarioAdapter around the existing Simulation engine; keep
   its algorithm and test suite intact.
4. Drive boarding ticks from the authoritative airport clock, accounting for
   the boarding engine's configured tick rate.
5. Admit passengers that actually reached the gate, including later arrivals;
   define cutoff behavior and departure readiness explicitly.
6. Apply BoardingResult timing and structured causes back to AirportFlight.
7. Extend save/resume coverage to active boarding and test cascading departure
   delays, late arrivals, deterministic strategy comparisons and passenger identity.

Do not begin M3 until requested. M2 stops at gate waiting; placeholder aircraft
turnarounds still operate independently of passenger arrivals.
