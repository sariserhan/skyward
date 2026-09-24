# M9 plan: airlines, expectations and contracts

**Status:** planned 2026-09-24 against M8 (`222c9d1`). One design point is
recorded below instead of escalated: runtime flight insertion. Decisions:
D-041 to D-043.

## What M8 left

- **Airlines** are `config.airlines`, a map from id to display name, stored
  in `AirportState.airlines` and shown as names by the UI. Riverdale has four
  airlines, each with 6 flights on its own home gates. GA is the hub (22% of
  its arrivals connect).
- **Outcomes already recorded per flight:**
  - scheduled vs actual departure and `departure_delay_breakdown` (tasks,
    `wait:<resource>`, runway, hold, late inbound)
  - `hold_ticks`, `connections_made` / `connections_missed`
  - bags via `BaggageSystem.bags_for()`, bag states and passenger reclaim
    ticks
  - turnaround task `resource_wait_ticks` and the assigned gate
- **Decisions** (`AirportSimulation.decisions`): gate assignment, holds, gate
  close, service priority, security staffing.

## Design

- **Config (D-041).** A new `airline_relations` block, leaving `airlines`
  untouched. It contains:
  - `scoring`: the on-time grace, the credibility (in flights) of the day's
    results, band thresholds and contract bonuses
  - `contracts`: data-driven templates
  - `profiles` per airline: starting relationship, weights over five
    dimensions, preferred gates, the contract template, and a flight request

  No airline-specific code paths exist.
- **Flight records.** At each takeoff, `AirportSimulation` builds a small
  record from the flight's real outcome, and `AirlineRelations`
  (`scripts/airport/airline_relations.gd`) stores it. A record holds:
  - lateness and on-time status
  - turnaround-caused delay (the breakdown minus runway, hold and late
    inbound), resource-wait delay (`wait:*`), baggage delay and hold used
  - connections and transfer bags, credited to every airline on the
    itinerary
  - bags checked, and reclaim waits of the flight's inbound locals
  - whether it used a preferred gate
  - its largest cause, and for a resource wait, who was served during it
    (from `RESOURCE_ASSIGNED` events) and their priority

  Records are evaluated only when a flight departs (event-driven), then
  cached. The UI reads the cache.
- **Scores (D-042).** Five dimensions, each 0–100 from a documented linear
  formula:
  - **punctuality:** the mean of the on-time rate and 100 − 4 × mean delay in
    minutes
  - **connections:** 100 − 5 × missed %
  - **baggage:** 100 − 5 × missed transfer-bag % − 4 × mean baggage delay
    (minutes per flight) − 2 × mean reclaim wait above 5 minutes
  - **turnaround:** 100 − 6 × mean turnaround-caused delay (minutes)
  - **gates:** % of flights at a preferred gate

  The day score is the weighted mean over the dimensions that have data. The
  relationship moves from the starting value toward the day score by
  credibility: `(start × k + day × n) / (k + n)` with n flights operated, plus
  explicit adjustments (contract result, a declined request).

  The bands are Excellent (90+), Good (75+), Acceptable (55+), Poor (35+) and
  Critical. Every term is shown in the airline detail, so a 63 can be traced.
- **Evaluation window.** The current operating day (this scenario). Career
  history comes later.
- **Contracts.** Templates of terms `{metric, min|max, risk}`, where the risk
  band makes a term AT RISK near its threshold:
  - Basic Service
  - Fast Turnaround
  - Connection Hub
  - Premium Reliability

  Live status is PASSING / AT RISK / FAILING. When the airline's last flight
  departs, the contract becomes PASSED (bonus) or FAILED (penalty; no more
  requests). Nothing is removed and no money is involved.
- **Requests (D-043).** A profile may request +N daily flights, defined in
  data. The request is offered when:
  - the relationship is at least its minimum
  - enough flights have been operated
  - the contract is not failing
  - a compatible gate is free for each proposed slot (checked against the
    schedule)

  The player can accept or decline:
  - **Accept:** the flights become a schedule commitment for the next operating
    day. They are not inserted into the running morning: passengers, bags and
    connections are generated once at setup from fixed streams, and inserting
    flights mid-run would break that. This is recorded, not hidden.
  - **Decline:** a small, explicit relationship cost.
- **Levers.** Nothing new: service priority (M8), gate assignment (M1), hold or
  close (M3), and security staffing (M2) move real outcomes, and the records
  follow.
- **Explainability.** Problem flights come from the airline's records, sorted
  by lateness, with their main cause. A resource-wait cause names who was
  served meanwhile, with their priority. The chain is: SJ 263 +22.7 →
  *Waiting for fuel unit* +20.1 → GA 270 (HIGH) was served first.
- **UI.**
  - An **Airlines** tab: score, band, contract status, request.
  - Selecting an airline shows its detail in the details panel: why (each
    dimension with its inputs and weight), contract terms with current values,
    problem flights, and the request with ACCEPT / DECLINE links.
  - Alerts: a contract AT RISK or FAILING, and a request waiting for an
    answer.
- **Save schema v9.** Adds records, contract state, adjustments and request
  state. Validation checks that records exist only for departed flights and
  that every state is known. v8 is rejected.
- **Scenarios.** Overlays gain `flight_overrides` (merge by flight id), for
  demo variants.

## Demos

- **A:** the same operations with different reactions. One morning's results
  are scored under each airline's weights, and the sensitivity is shown: +3
  missed connections and +10 minutes of delay change each airline's score
  differently.
- **B:** a winner and a loser. The fuel-shortage morning is run from the same
  save, once with GA 270 HIGH and once with SJ 263 HIGH. The flights,
  contracts and relationships differ.
- **C:** the hold. A tight GA connection (a late NS inbound into a GA
  departure) is run with no hold and with HOLD +5. The punctuality and
  connection results differ, and Global Airways weighs them.
