# M10 plan: economy, daily planning and multi-day operation

**Status:** planned 2026-09-24 against M9 (`954cd69`). No conflict needed
escalation. Decisions: D-044 to D-047.

## What M9 left

- **One operating day** is one `AirportSimulation`, built by `setup(config)`
  from a scenario dictionary. Passengers, bags and connections are generated
  once from streams seeded by `config.seed`.
- **`AirlineRelations`** records each departure. It evaluates relationships
  from `profiles[].starting_relationship` and settles contracts when the day's
  last flight departs. It offers one `profile.request` per airline;
  `answer_request()` records accepted or declined.
- **Resources** are sized from `config.resources[].units`.
- **Security** has a fixed staff pool (`passenger_flow.staff_pool`, 8).
- **UI saves** are `AirportSimulation` snapshots (v9).

## Design

- **Integer ledger (D-044).** A new `AirportEconomy`
  (`scripts/airport/airport_economy.gd`) belongs to each day's simulation:
  - an append-only list of transactions
    `{id, day, tick, amount_cents, category, airline, flight_id, ref, reason}`
  - stable ids (`D2:F014:passengers`, `D2:COST:fuel_unit`, `D2:CONTRACT:GA`);
    posting an id twice is refused, so every movement happens exactly once
  - integer cents only
  - `cash = opening cash + Σ transactions`, derived, never stored separately
    for the day

  The career keeps all settled days' transactions. A career's cash always
  equals starting cash + the whole ledger, and validation checks this on load.
- **Revenue:** one authoritative event, the flight's takeoff. Config
  `economy.fees`:
  - an aircraft and gate service fee by aircraft type
  - a passenger service fee per passenger who actually departed on it (booked
    passengers who missed pay nothing)
  - a baggage handling fee per handling operation: each bag loaded and flown
    out on this departure, and each bag unloaded from this aircraft's inbound
    flight. A transfer bag is handled twice (unloaded, then loaded) and
    charged twice, once per operation.
- **Costs:** posted when the day starts, as the day's committed cost:
  - each resource unit's daily cost × planned units
  - security staff × daily cost (the M2 pool, unchanged)
  - one fixed airport operating cost

  There are no delay fines.
- **Contract money.** Contract templates gain `bonus_cents` and
  `penalty_cents`, shown in the airline detail from the start. When
  `AirlineRelations` settles a contract at the day's end, it calls back into
  the economy for one transaction per airline per day. M9 scoring and
  relationship effects are unchanged.
- **Career (D-045).** A new `AirportCareer` (`scripts/airport/career.gd`)
  holds persistent state:
  - scenario path, career seed and day number
  - starting cash, the ledger, and cash
  - relationships
  - request decisions (by request id) and activated requests
  - the resource plan
  - contract history and day reports
  - the current day's simulation, while operating

  Its phases are `operating` and `planning`.
  - **`start_day()`:** checks solvency, marks accepted requests activated,
    builds the day's config, sets up the simulation with the day seed, and
    posts the day's committed costs.
  - **`settle_day()`:** once all flights have departed, finishes the
    remaining flows, merges the day's transactions into the ledger (skipping
    known ids), stores relationships, request decisions, contract results and
    the report, and drops the day's simulation. It is idempotent: a settled
    day number is never settled again.
- **Day config.** The base scenario plus:
  - activated request flights
  - the resource plan
  - `starting_relationship` = yesterday's settled relationship
  - each airline's next undecided request tier
  - `economy.day` and opening cash
  - day seed = mix(career seed, day)

  Old passengers, bags, tasks and assignments never carry over.
- **Requests become flights (D-046).** Profiles list request tiers
  (`requests: [{id, min_relationship, min_flights_operated, flights: [full
  flight definitions with gates]}]`).
  - The day offers the first tier with no decision. A tier is decided once
    and never re-offered.
  - Accepted tiers are activated at the next `start_day()`. Their flights are
    added to every later day's schedule and go through the normal
    generation: passengers, bags, connections, turnaround and resources.
  - Riverdale's expansion flights overlap the third wave (arrivals 08:35 to
    09:00), so they add real runway, gate, resource and security load.
- **Planning.** Resource counts are adjustable only between days, within
  `economy.resources[type].min` / `max`. During the day, M8 priority is the
  lever.
- **Solvency (D-047).** START DAY requires cash ≥ the plan's committed cost.
  If even the minimum plan is unaffordable, the career is insolvent. There are
  no loans.
- **UI.**
  - The top bar shows the day and cash.
  - A **Finance** tab shows cash, today's revenue and costs by category, net,
    and revenue by airline. Categories expand to their transactions (flights,
    resources, contracts).
  - At the day's end, an end-of-day report replaces the view: revenue, costs,
    net, ending cash, plus flights, passengers boarded, mean delay, missed
    connections, missed bags and contract results. Below it is the next-day
    plan, with +/- per resource, costs, committed total, expected flights,
    and START DAY (disabled when unaffordable) or INSOLVENT.
- **Save schema v10.** The career file holds the career state, plus the
  day's simulation snapshot when mid-day, whose version also becomes 10.
  - Mid-day and between-days saves are both supported.
  - Validation reconciles the ledger to cash, keeps ids unique, and checks
    that settled days are not reopened.
  - v9 is rejected.
- **Unchanged:** M3–M9 operational behavior. Economy values are tuned only in
  the `economy` config.

## Demos

- **A:** a full financial day. Starting cash, each revenue and cost category,
  contract settlement, net, ending cash, and ledger reconciliation to the
  cent.
- **B:** capacity vs cost. The same day with a lean plan and a generous plan:
  cost, contention, contracts and net compared.
- **C:** growth. Day 1, GA's request accepted; day 2, GA's new flights exist
  with gates, passengers, bags, connections and resources. The day's revenue
  and load are compared with day 1.
- **D:** an indirect loss. A lean fuel plan leads to late flights, a failed
  contract, a penalty and a lost bonus, shown as a chain.
