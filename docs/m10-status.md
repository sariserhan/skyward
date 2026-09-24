# M10 completion report: economy, daily planning and multi-day operation

Implemented on 2026-09-24 from M9 (`954cd69`), against
[m10-plan.md](m10-plan.md). Decisions D-044 to D-047. M11 has not started.

> OPERATE DAY → EARN → PAY → SETTLE CONTRACTS → REVIEW → ACCEPT GROWTH →
> PLAN CAPACITY → OPERATE THE NEXT DAY

## Delivered

- **Integer-cent ledger (D-044).** Every movement is a transaction:
  - stable id (`D2:GA418:passengers`), day, tick, amount in cents, category
  - airline, flight, reference, and a readable reason

  Posting an existing id is refused. Cash = starting cash + Σ ledger (+ today
  while operating), and a save one cent off does not load.
- **Revenue from real operations only**, charged once at takeoff:
  - aircraft and gate service by type (A220 $1,300 to 787 $3,600)
  - $12 per passenger who actually departed (missed passengers pay nothing)
  - $2.50 per bag handling operation (flown out, and unloaded from the
    inbound)

  There are no delay fines. Late or failed operations cost money only
  through lost fees and contract terms.
- **Committed costs**, charged when the day starts:

  | Item | Daily cost |
  | --- | --- |
  | Cleaning crew | $1,800 each |
  | Catering crew | $1,800 each |
  | Fuel unit | $4,000 each |
  | Baggage crew | $2,400 each |
  | Pushback tug | $1,500 each |
  | Security staff (8) | $900 each |
  | Airport overhead | $55,000 |

  Capacity is paid for whether it is busy or not.
- **Contract money.** Bonus and penalty by template, shown in the airline
  detail before the day: Hub +$6k / −$8k, Premium +$5k / −$6k, Fast
  Turnaround +$4k / −$5k, Basic +$3k / −$4k. Paid once when M9 settles the
  contract. M9 scoring is unchanged.
- **Careers (D-045).**
  - Days 1, 2, 3, … each run as a fresh simulation: no passengers, bags,
    tasks or assignments carry over.
  - Cash, the ledger, relationships (day N+1 starts where day N ended),
    request decisions, growth, the plan, contract history and reports all
    persist.
  - Day 1 uses the scenario seed, so it is the M9 morning; later days use a
    fixed mix of seed and day.
  - Settlement happens exactly once.
- **Growth that flies (D-046).** Request tiers have stable ids and full flight
  definitions.
  - An accepted tier is activated the next morning, and its flights run every
    day after, as ordinary flights: aircraft, passengers, bags, connections,
    gates, turnaround, resources.
  - Tiers are never offered twice; a declined tier ends that airline's
    growth.
  - Riverdale: GA +2 (GA 401, GA 418), GA +1 (tier 2), SJ +2, NS +1, all
    arriving 08:35–09:10 into the third wave.
- **Planning and solvency (D-047).**
  - Between days, each resource can be set within its min/max, with the
    committed cost shown live.
  - START DAY needs cash ≥ committed cost. If even the minimum plan is
    unaffordable, the screen shows INSOLVENT.
  - During the day, M8 priority is the only resource lever.
- **UI.**
  - The top bar shows **DAY n · cash**.
  - A **Finance** tab shows cash now, opening cash, each category (expand
    for its transactions: flights, resources, contracts), revenue vs costs and
    net, and revenue by airline (shared costs stay shared).
  - An **end-of-day screen** shows the report (revenue, costs, net, ending
    cash, operations, airlines) beside the **next-day plan**.
- **Save schema v10.** A career file, with the operating day's simulation
  (also v10) when mid-day. Mid-day and between-days saves both work. v9 is
  rejected.

## Demonstrations

Run `tools/ui_tests.sh tests/m10_demo.gd`. It writes `/tmp/m10-demo-01…04*.png`.

```
A · DAY 1
    starting cash             $400,000
    Aircraft and gate service  +$51,600
    Passenger service         +$47,688
    Baggage handling        +$9,927.50
    Contract bonuses          +$18,000
    Turnaround resources       −$46,600
    Security staff             −$7,200
    Airport operations        −$55,000
    Contract penalties              $0
    net                    +$18,415.50
    ending cash            $418,415.50   (starting cash + 83 ledger transactions, to the cent)
    24 flights · 3974 passengers · mean delay 2.5 min · 6 missed connections · 6 missed bags
    AW Basic Service PASSED · GA Connection Hub PASSED · NS Premium Reliability PASSED · SJ Fast Turnaround PASSED
C · 08:10:15 Global Airways asks for GA 401 and GA 418; accepted
C · day 2 09:03:00 GA 418 (787) at A7: 188 inbound, 205 booked out (30 connecting), 146 bags so far, turnaround 0/10
C · day 1: 24 flights, 3974 passengers, revenue $127,215.50 · day 2: 26 flights, 4200 passengers, revenue $135,875
C · GA 401 + GA 418 earned $9,530.50 on day 2 (service, passengers, bags)
B · the same day 1 under three capacity plans:
    lean      resources    $35,100 ·  44 tasks waited ·  8 flights delayed by shortage · mean delay 4.7 · contracts passed 2/4 · revenue $119,126.50 · net +$11,826.50
    default   resources    $46,600 ·  15 tasks waited ·  2 flights delayed by shortage · mean delay 2.5 · contracts passed 4/4 · revenue $127,215.50 · net +$18,415.50
    generous  resources    $70,500 ·   0 tasks waited ·  0 flights delayed by shortage · mean delay 2.2 · contracts passed 4/4 · revenue $127,215.50 · net −$5,484.50
D · fuel units 4 → 2, nothing else changed:
    Atlantic Wings: AW 368 +37.3 min, waiting for fuel unit +21.6 · On-time departures 17% (target ≥ 60%); Mean departure delay 18.3 min (target ≤ 6.0 min) → Basic Service Agreement FAILED → penalty −$4,000 and bonus $3,000 not earned (−$7,000 swing)
    Global Airways: GA 382 +41.6 min, waiting for fuel unit +25.0 · Connection success 94% (target ≥ 95%); Mean departure delay 21.0 min (target ≤ 8.0 min) → Connection Hub Agreement FAILED → penalty −$8,000 and bonus $6,000 not earned (−$14,000 swing)
    Northstar Air: NS 361 +25.1 min, waiting for fuel unit +23.4 · … → Premium Reliability Agreement FAILED → −$11,000 swing
    SunJet: SJ 347 +36.2 min, waiting for fuel unit +19.0 · … → Fast Turnaround Agreement FAILED → −$9,000 swing
    net: +$18,415.50 → −$14,811.50 (fuel cost saved $8,000)
```

- **A:** every category is visible. The ending cash is starting cash plus 83
  transactions, to the cent, and opening + net = closing.
- **B:** a real trade-off.
  - The lean plan saves $11,500 of capacity. It loses $8,089 of revenue
    (missed passengers, bags and two contract bonuses) and nets $6,589 less.
  - The generous plan buys no service the default doesn't already give, and
    turns a profit into a loss.
  - The best plan depends on the day; neither extreme is free.
- **C:** GA 401 and GA 418 are real flights on day 2: 188 passengers arrive on
  the 787 and 205 are booked out, 30 of them connecting. They earn $9,530.50
  and add load.
- **D:** the full chain for each airline, from `wait:fuel_unit` to the late
  flight, the failed term, FAILED, the penalty and the lost bonus. Saving
  $8,000 of fuel units costs $41,000 in contract swings and lost fees. No
  arbitrary fine is involved.

## Baseline and balance

| | Day 1 (default) | Day 2 (all requests accepted) | Day 3 |
| --- | --- | --- | --- |
| Flights | 24 | 28 | 30 |
| Net | +$18,415.50 | +$36,493.50 | +$33,822.50 |
| Committed cost | $108,800 | $108,800 | $108,800 (+$6,000 penalty) |

- **Runway:** $400,000 starting cash covers 3.7 days of committed cost with
  no revenue. One bad day (the day D plan) loses about $15k: painful, not
  fatal.
- **Margins:** competent operation earns about 14% of revenue on day 1.
  Growth improves it, and brings new contract risk: Northstar failed on day 3
  of the benchmark career.
- **Operations are unchanged.** M3–M9 behavior was not touched; only the
  `economy` config was tuned. Day 1's operational figures (mean delay 2.5
  min, 14 late, transfer bags 287 / 6, airline scores) are identical to M9.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 180 tests, 0 failed (1,337 s). 1,000 standalone deadlock scenarios. The standalone golden baseline is identical |
| New `test_economy.gd` | 18 tests; see below |
| Regression | All M3–M9 tests pass unchanged |
| `tools/ui_tests.sh` | Airport UI, terminal UI, and the M3–M10 demos: 0 failures |

The 18 economy tests cover:

- **Accounting:** integer cents; reconciliation (including a one-cent tamper
  that is rejected); opening + net = closing; categories sum to the net.
- **Revenue:** each flight's service fee exactly once, by type; only departed
  passengers pay (AW 228's missed passenger doesn't); bag handling equals
  real operations × fee.
- **Costs:** they follow the plan; the plan is locked during the day and
  bounded by min/max.
- **Contracts:** money paid once per day at the configured amounts; a failure
  costs its listed penalty.
- **Settlement:** exactly once (a second call, a reload before settling, a
  reload between days).
- **Saves:** a mid-day save gives the identical ledger and relationships;
  v9, duplicate ids, reopened days and out-of-range plans are rejected.
- **Days:** day 2 starts clean, with yesterday's relationships and cash, on a
  day seed.
- **Growth:** accepted requests become real, paid, resourced flights; growth
  persists without repeating; a declined request adds nothing; growth brings
  more revenue and more work for the same crews.
- **Capacity:** the resource plan changes both cost and contention.
- **Determinism:** the same seed and decisions give identical two-day
  careers.
- **Solvency:** an unaffordable plan can't start; the minimum plan is
  affordable until it isn't (insolvent).

## Performance

| | Result |
| --- | --- |
| Economy cost (posting revenue at takeoff) | 8–11 ms per day in total, **0.06 µs per tick** |
| Airline evaluation (M9, unchanged) | 0.12–0.26 µs per tick |
| Day generation (`start_day`) | 234 ms (24 flights) · 273 ms (28) · 284 ms (30) |
| Settlement (`settle_day`, including remaining flows) | 14–20 ms |
| Mean / worst tick, career days 1–3 | 224 / 185 / 195 µs; worst 4.6–6.7 ms; 7.4–9.0 ms per 4× frame |
| Default morning / 100 flights (`resource_benchmark`) | 157 µs / 367 µs mean; 6.3 / 14.7 ms per 4× frame |
| Between-days save | 0.1 MB; 4 ms to serialize, 3 ms to load |
| Mid-day save | 14.5 MB; 2.1 s to serialize, 2.8 s to parse, validate and restore |

- **Mid-day saves** are dominated by the operating day's full simulation
  state (7,453 passengers, their bags and the 40k-event history), as in M9.
  M10 adds only the ledger and the career (under 0.1 MB).
- **The expanded schedule** (28–30 flights) costs no more per tick than the
  base day.

Nothing was optimized.

## Product questions

1. **Can every meaningful cash movement be explained by a real operational or
   contractual event?** **Yes.**
   - Every transaction names its flight, resource, airline or contract and
     why. Revenue exists only for real takeoffs, departed passengers and
     handled bags.
   - Costs are the planned capacity and the listed overhead; contract money
     is the listed terms.
   - The Finance tab drills from a category to its flights.
2. **Does paying for more operational capacity create a genuine
   cost-versus-reliability trade-off?** **Yes.** On the same day, the lean
   plan nets $6,589 less because of lost contracts and fees. The generous
   plan buys nothing and loses $23,900 of margin.
3. **Do airline flight requests now create actual future growth rather than
   being only a UI promise?** **Yes.** GA 401 and GA 418 fly on day 2 and
   every day after, with 188 passengers in and 205 booked out on the 787
   alone. They earn $9,530.50 and take crews, gates and runway slots.
4. **Can operational mistakes reduce financial performance through systems
   the player understands?** **Yes.** Demo D follows fuel wait → late flight
   → failed term → FAILED → penalty and lost bonus for each airline, with the
   exact dollars and no invented fine.
5. **Does finishing one day create a clear reason to play the next one?**
   **Yes.** The report ends on the next day's plan:
   - requests accepted today fly tomorrow
   - relationships carry over
   - cash decides what capacity can be afforded
   - growth raises both revenue and contract risk

## Limitations

- **No calendar, weekly patterns, events or demand changes:** each day is the
  same schedule plus growth, on a new seed.
- **Security staff and overhead are fixed per scenario** (security staffing
  stays the M2 model).
- **Growth tiers are hand-authored.** Accepted flights use their configured
  gates; there is no new infrastructure (M11).
- **No loans, compensation or ticket economics.**
- **Mid-day saves are large** (about 14 MB) and take a few seconds; the
  within-day event history is the main contributor.
- **The full test suite now takes about 22 minutes.**
