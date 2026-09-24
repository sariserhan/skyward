# M9 completion report: airlines, expectations and contracts

Implemented on 2026-09-24 from M8 (`222c9d1`), against
[m9-plan.md](m9-plan.md). Decisions D-041 to D-043. M10 has not started.

> **"Do I prioritize Global Airways because its connecting network is
> valuable, even if SunJet gets fewer resources?"** In the conflict morning
> it's a real choice: favoring GA leaves SunJet CRITICAL; favoring SunJet
> leaves GA POOR.

## Delivered

- **Airline profiles (D-041).** A config block, `airline_relations`, gives
  each existing airline:
  - a starting relationship
  - weights over five dimensions
  - preferred gates
  - a contract and an optional flight request

  The scoring code has no airline-specific paths (tested: swapping two
  profiles swaps their scores).

  | Airline | Emphasis | Contract |
  | --- | --- | --- |
  | Global Airways | connections 35, baggage 25, punctuality 20 | Connection Hub |
  | SunJet | punctuality 45, turnaround 40; indifferent to gates | Fast Turnaround |
  | Atlantic Wings | balanced | Basic Service |
  | Northstar | punctuality 35, baggage 30 | Premium Reliability |
- **Records from real operations.** At each takeoff, one record of the
  flight's outcome:
  - lateness
  - turnaround-caused, resource-wait and baggage delay (from the critical-path
    breakdown), and the hold used
  - connections and transfer bags, credited to every airline on the
    itinerary
  - reclaim waits and gate
  - its largest cause and, for a resource wait, who was served meanwhile and
    at what priority

  There are no random or arbitrary changes.
- **Scores (D-042).**
  - Five documented dimensions (punctuality, connections, baggage,
    turnaround, gates), weighted per airline, give the day score.
  - The relationship is `(start × 3 + day × flights) / (3 + flights)`, so one
    flight moves it but can't swing it, plus listed adjustments: contract
    ±5/−10, request declined −3.
  - Bands run from Excellent to Critical.
- **Contracts.** Four data-driven templates of threshold terms.
  - Live status is PASSING / AT RISK / FAILING, term by term.
  - Contracts settle as PASSED or FAILED when the day's last flight departs
    (settling earlier would miss connections credited by later flights).
  - Failure costs −10 and stops requests; success earns +5. No money.
- **Requests (D-043).**
  - GA and SJ ask for +2 daily flights, and NS for +1, when their
    relationship, flights operated and contract allow and a compatible gate
    is free for each slot.
  - ACCEPT commits the flights to the next operating day. They are not
    inserted into the running morning, because passenger, bag and connection
    generation is one-shot and deterministic.
  - DECLINE costs 3 points.
- **Airlines tab and detail.** Relationship and band, contract status and
  request. The detail shows:
  - WHY: each dimension with its real inputs and weight, + or −
  - CONTRACT: each term with its target and current value
  - PROBLEM FLIGHTS: each with its largest cause; a resource wait also lists
    who was served meanwhile, for example *… · Waiting for fuel unit +… ·
    served first: GA … (HIGH)* in the conflict morning
  - REQUEST: with ACCEPT / DECLINE, or why it isn't offered
- **Alerts.** A contract AT RISK or FAILING, or an open request.
- **Save schema v9.** Records and per-airline state, validated; v8 is
  rejected.
- **Scenario overlays** gain `flight_overrides`, `include_flights` and
  `task_overrides`:
  - `riverdale_airline_conflict.json`: GA and SJ only, one fuel unit,
    fueling at 80%
  - `riverdale_ga_hold.json`: NS 305 25 minutes late, four connectors into GA
    298
- **Scene fix.** The airport scene no longer assumes flight F001 exists.
  Variants without it crashed at launch.

## Demonstrations

Run `tools/ui_tests.sh tests/m9_demo.gd`. It writes `/tmp/m9-demo-01…04*.png`.

```
A · default morning:
    Atlantic Wings  75 GOOD · Basic Service Agreement PASSED
    Global Airways  90 EXCELLENT · Connection Hub Agreement PASSED
    Northstar Air   80 GOOD · Premium Reliability Agreement PASSED
    SunJet          85 GOOD · Fast Turnaround Agreement PASSED
A · one set of outcomes (Global Airways' day), read by each airline's weights:
    weights of        as run  +3 missed connections  +10 min on one flight
    Atlantic Wings      89.2                   -2.0                   -3.8
    Global Airways      92.0                   -3.5                   -3.0
    Northstar Air       89.0                   -1.0                   -5.2
    SunJet              83.7                   -0.5                   -6.8
B · one fuel unit, Global Airways vs SunJet (same start, different priority):
    Global Airways HIGH:
      Global Airways  65 ACCEPTABLE · Connection Hub Agreement FAILED · mean delay 1.7 min · resource-wait delay 0.0 min/flight
      SunJet          21 CRITICAL · Fast Turnaround Agreement FAILED · mean delay 13.5 min · resource-wait delay 10.4 min/flight
    SunJet HIGH:
      Global Airways  53 POOR · Connection Hub Agreement FAILED · mean delay 9.6 min · resource-wait delay 7.0 min/flight
      SunJet          76 GOOD · Fast Turnaround Agreement PASSED · mean delay 3.6 min · resource-wait delay 0.9 min/flight
C · NS 305 +25 min feeding GA 298 at A4:
    No hold      GA 298 +0.8 min · NS 305 connectors 1 made / 7 missed · GA punctuality 83 · connections 63 · GA day 77.4 (read with SunJet's weights: 81.0)
    HOLD +5 MIN  GA 298 +6.9 min · NS 305 connectors 6 made / 2 missed · GA punctuality 70 · connections 80 · GA day 79.3 (read with SunJet's weights: 75.6)
```

- **A:** the same outcome changes land differently. Three more missed
  connections cost Global Airways 3.5 and SunJet 0.5. Ten more minutes on one
  flight costs SunJet 6.8 and GA 3.0. The difference comes only from the
  configured weights.
- **B:** the priority decision creates the winner.
  - SunJet goes from 21 CRITICAL / FAILED to 76 GOOD / PASSED.
  - GA goes from 65 to 53.
  - GA's hub contract fails either way. Its connection terms also depend on
    SunJet's flights (connections are credited to both airlines), and one fuel
    unit cannot serve both networks. That is an emergent result, not a scripted
    one.
- **C:** the hold saves 5 connectors and costs 6.1 minutes. Global Airways'
  weights score that as better (77.4 → 79.3). SunJet's weights score the same
  outcomes as worse (81.0 → 75.6).

A related effect, found while tuning: with fueling at 75%, making GA HIGH hurt
GA's own connection score. GA departures left on time and stranded connectors
arriving on late SunJet flights. Priorities have second-order effects through
connections.

## Baseline (default morning)

| Airline | Relationship | Dimensions (punctuality / connections / baggage / turnaround) | Contract |
| --- | --- | --- | --- |
| Global Airways | **90 EXCELLENT** | 81 / 93 / 100 / 81 | Connection Hub PASSED; requests +2 flights |
| SunJet | 85 GOOD | 84 / 100 / 91 / 83 | Fast Turnaround PASSED; requests +2 flights |
| Northstar | 80 GOOD | 81 / 81 / **55** / 96 | Premium Reliability: three terms AT RISK at day end; passes |
| Atlantic Wings | 75 GOOD | 72 / 83 / **50** / 74 | Basic Service: on-time AT RISK (4 of 6); passes |

The default has a clear leader (GA) and two meaningful weaknesses:

- **Atlantic Wings' baggage:** AW 256's slow loader and 5 missed transfer
  bags.
- **Northstar's reliability margins:** three terms at risk.

Nobody fails without player intervention. The M3–M8 operation is unchanged:
M9 only reads outcomes. The baseline figures (mean delay 2.5 min, 14 late,
transfer bags 287 / 6) are identical to M8.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 162 tests, 0 failed (959 s). 1,000 standalone deadlock scenarios. The standalone golden baseline is identical |
| New `test_airlines.gd` | 17 tests; see below |
| Regression | All M3–M8 tests pass unchanged |
| `tools/ui_tests.sh` | Airport UI, terminal UI, and the M3–M9 demos: 0 failures |

The 17 airline tests cover:

- **Weighting:** different weights give different verdicts on identical
  inputs.
- **Punctuality:** the formula as documented.
- **Connections:** a missed connection hurts the hub airline, not the fast
  one.
- **Baggage:** a missed transfer bag lowers the baggage dimension.
- **Credibility:** the blend as documented.
- **Contracts:** PASSING / AT RISK / FAILING by term; settlement at the day's
  end with explained adjustments.
- **Requests:** a request is unlocked by performance and denied by weakness
  or when no gate is free; declining costs 3.
- **Config-driven:** swapping two profiles swaps their scores, and the source
  contains no airline ids.
- **Real operations:**
  - fuel shortage → resource delay → SunJet's relationship
  - hold → connections up, punctuality down
- **Save and determinism:**
  - a mid-day save at 2 points reaches identical final records, contracts,
    requests and scores
  - v8 and 4 corruptions are rejected
  - same seed and decisions give identical relationships
- **Riverdale balance:** a strong airline, a weakness, contracts mostly
  achievable.

## Performance

Airline evaluation runs only at takeoff. It was measured directly (`airline_usec`):

| Scenario | Evaluation total | Per departure | Averaged per tick | Mean tick | Simulation per 4× frame |
| --- | --- | --- | --- | --- | --- |
| Default morning | 19.6 ms | 0.8 ms | 0.12 µs | 162 µs | 6.5 ms |
| 100 flights | 46.4 ms | 0.9 ms | 0.20 µs | 363 µs | 14.5 ms |
| Shortage | 55.7 ms | 2.3 ms | 0.34 µs | 181 µs | 7.2 ms |
| Connection-heavy | 31.9 ms | 1.3 ms | 0.19 µs | 212 µs | 8.5 ms |

- **Steady-state cost is zero:** nothing runs between departures, and the UI
  reads cached evaluations.
- **A departure tick spends 1–2 ms** building its record (walking the
  manifests and bags, and a binary search of the event history).
- **Run to run,** whole-morning timings vary by more than M9's cost; with and
  without airlines were within noise.

Nothing was optimized.

## Product questions

1. **Do the airlines now feel operationally different?** **Yes.**
   - They weigh the same outcomes differently (demo A): SunJet minds a late
     flight twice as much as GA; GA minds missed connections seven times as
     much as SunJet.
   - Each has its own contract.
   - GA's hub identity comes from the real M6/M7 connection data (289
     connections credited to it in the default morning).
2. **Can the same airport decision please one airline and hurt another?**
   **Yes.**
   - One fuel unit's priority decides whether SunJet ends CRITICAL or GOOD,
     and GA ACCEPTABLE or POOR (demo B).
   - The same hold is better for GA's weights and worse for SunJet's
     (demo C).
3. **Can the player understand exactly why an airline relationship is strong
   or weak?** **Yes.** The detail shows:
   - the start, the day score, the number of flights and each adjustment
   - every dimension with its inputs and weight
   - every contract term with its target and value
   - the worst flights with their largest cause, down to which flights (and
     at what priority) were served first during a resource wait
4. **Do contracts give the player operational goals without introducing fake
   arbitrary objectives?** **Yes.**
   - Every term is a measured outcome of M3–M8 (on-time rate, mean delay,
     connection and transfer-bag success, turnaround-caused and resource-wait
     delay).
   - Thresholds were set against the real default morning.
   - The consequences are relationship points and requests, not scripted
     events.

## Limitations

- **One operating day.** No multi-day history; accepted requests are
  commitments for a next day that the scenario doesn't simulate yet.
- **No money** (M10).
- **Gate preferences are simple lists** (no terminal classes or lounges).
- **Connections and transfer bags count for both airlines** of an itinerary.
  That is deliberate, and it couples their contracts.
- **The full test suite now takes about 16 minutes.**
