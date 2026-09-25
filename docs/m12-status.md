# M12 completion report: airside construction, taxiways, runways and aircraft routing

Implemented on 2026-09-25 from M11 (`ff52498`), against
[m12-plan.md](m12-plan.md). Decisions D-052 to D-056. Nothing beyond M12
(retail, parking, hotels, multiple terminals, maintenance, weather, detailed
ATC) has started.

> BUILD A TAXIWAY → AIRCRAFT TAKE IT → CONGESTION CHANGES → DELAYS,
> CONNECTIONS, AIRLINES AND MONEY CHANGE

## Delivered

- **One airside graph (D-052).** `config.airside` holds nodes (taxi, hold,
  exit, runway end, stand) in metres, edges (length, one-way, aircraft
  classes, kind) and runways (ends, length, status). `AirsideNetwork` is
  built from it once per day and is the only thing aircraft move on:
  - **Landing:** land on the chosen runway (end A → B), then taxi B → stand.
  - **Departure:** push back (M8 tug), then taxi stand → end A, then the
    runway queue and takeoff.
  - **Drawing:** the map draws from the graph, and positions come from the
    current edge and progress.
- **Riverdale is imported, and unchanged it is M11.** Its airside is a
  schematic network:
  - runway R1 "09/27" (3,000 m)
  - an exit and a hold-short
  - one-way inbound and outbound apron lanes, gate stubs
  - a recirculation taxiway

  Lane lengths are calibrated so every gate is exactly 180 s in and out.
  Unchanged day 1 keeps every flight's landing, docking, pushback and
  takeoff, and the money to the cent (+$18,415.50, 3,974 passengers, 6
  missed connections). One accounting change: 14.8 s of one flight's delay
  moves from *runway queue* to *taxi congestion* (D-055). Everything the
  player builds is geometric.
- **Routing.** Deterministic Dijkstra over free-flow time at 10 m/s, with
  one-way edges, aircraft class and lexical tie-breaks. Stands are ends,
  never a way through. Routes are computed at events only (landing,
  pushback, a gate reassignment) and cached per `layout_revision`.
- **Occupancy (D-053).**
  - 15 s headway on each edge, and no passing
  - 5 s intersection reservations
  - two-way edges locked for the whole route before moving (opposing traffic
    holds where it is)
  - two-way arrivals start only with their gate free

  Deadlock sweeps check it. Reassigning a taxiing aircraft reroutes it
  physically from where it is, or is refused with the reason.
- **Runways (D-054).**
  - **Several independent runways,** each its own FIFO with separation, busy
    time, movements and peak queue.
  - **Length decides compatibility:** A220 1,500 m, 737 1,800, A321 2,000,
    787 2,800.
  - **Deterministic selection:** open, long enough, reachable, lowest taxi +
    queue estimate, then id.
  - **Access:** taxiways touch runways only at their ends.
- **Causality (D-055).** Taxi time beyond the free-flow plan is
  `taxi_congestion`: after the runway queue on departures, and split out of
  `late_inbound` on arrivals. Every breakdown still sums exactly to the
  delay. Airlines count it as airside, not turnaround.
- **Construction (D-056).**
  - **Imported pieces:** Riverdale's 38 taxiway pieces and R1 become layout
    objects.
  - **New pieces:** the player adds taxiways (network node or 300 m grid
    anchor to node, $30/m) and runways (anchor, heading, 2,000–3,200 m,
    $60/m).
  - **Free changes between days:** a taxiway's direction, or a runway
    open/closed.
  - **Rules:**
    - no crossings or pass-throughs without a junction
    - nothing through the terminal
    - runways only at their ends, and 300 m apart
    - inside the airside zones
  - **Validation:**
    - every gate to and from an open runway
    - open runways connected
    - every flight type has a long-enough reachable runway

    It blocks the day. Demolitions and changes that break it are refused and
    undone.
  - **Requests:** a request's capacity check includes runway capability.
- **UI.**
  - **Airfield from the graph:** runways, taxiways with one-way arrows,
    stands, aircraft on their edges, and holding aircraft beside their stand.
  - **O** toggles the Airside overlay: occupied edges amber, locked edges
    green, runway queues.
  - **F3** shows node and edge ids and reserved nodes.
  - **The selected flight's remaining route** is highlighted.
  - **The flight detail** says *TAXIING TO GATE A3 · via R1 exit → Taxiway P
    → A3*, *WAITING FOR TAXIWAY · GA 242 ahead*, *WAITING AT INTERSECTION*,
    *HOLDING · opposing traffic on CONNECTOR* or *HOLDING · gate A1
    occupied*.
  - **Build → Airside:** a mini map with every node and free grid point; the
    preview shows length, taxi time, classes or types served, cost, cash
    after, and the next day's verdict. Built pieces can toggle direction or
    open/close.
- **Metrics.** Per flight: taxi-in and taxi-out time and waits. Per runway:
  movements, utilization and peak queue. Also route count and peak taxiing
  aircraft (benchmark).
- **Save schema v12.** Airside layout objects, the runways dict, each
  flight's taxi state, edge occupancy and node reservations. Validation
  cross-checks the routes, locks and occupants against the network and the
  flights. v11 is rejected.
- **Scenarios.**
  - `riverdale_single_taxiway.json`: one parallel taxiway, one connector, a
    two-way apron lane. It replaces the airside with the new overlay
    `replace` key.
  - `riverdale_short_runway.json`: R1 is 2,400 m, no 787s, and a GA 787
    request.

## Demonstrations

`tools/ui_tests.sh tests/m12_demo.gd` (rendered A, headless B–E) writes
`/tmp/m12-demo-*.png`:

- **01:** holding for opposing traffic, with the overlay
- **02:** the Build tab preview
- **03:** the built list
- **04:** day 2's one-way flow
- **05:** debug ids
- **06:** the day 2 report

**A. A new taxiway reduces congestion** (one-lane airport, same day 1 and
seed). At 07:07 SJ 291 reads *TAXIING TO GATE A3 · via R1 exit → Taxiway P →
A3 · HOLDING · opposing traffic on CONNECTOR*. Between days the player builds
*R1_EXIT → AP_8* (618 m) and *AP_1 → R1_HOLD* (335 m), both one-way, in the
Build tab ($28,590), and turns the apron lane one-way west.

| | taxi in / out | taxi waits | runway queues | mean delay | missed connections | operating result |
| --- | --- | --- | --- | --- | --- | --- |
| one lane | 7.0 / 6.0 min | 107.2 min | 15.3 min | 5.6 min | 31 | −$15,942 |
| + connectors, one-way | 5.8 / 2.8 min | 61.1 min | 9.6 min | 3.6 min | 10 | +$330 (capital −$28,590) |

**B. A second runway reduces queues** (Riverdale, R2 3,200 m north of R1,
two one-way taxiways around R1's ends, $230,280).

| | R1 / R2 movements | runway queue delay | peak queue | mean delay | operating result |
| --- | --- | --- | --- | --- | --- |
| Riverdale | 48 / – | 15.0 min | 2 | 2.5 min | +$18,415.50 |
| + R2 | 39 / 9 | 6.3 min | 1 / 1 | 2.6 min | +$18,430 |

GA 242, SJ 263, GA 298, AW 312, SJ 319, GA 354 and GA 382 were chosen onto R2
when R1 was busy. Their longer taxi shows as taxi time, not queue. The queue
more than halves, but one day's operating result barely moves: a runway is a
long-horizon investment, not a one-day fix.

**C. Runway length unlocks a 787** (`riverdale_short_runway.json`).

1. **Day 1:** GA offers GA 901 (787). The capacity check reads *GA 901 (787)
   has no open runway long enough (needs 2800 m) that it can reach*; the
   player accepts.
2. **Planning day 2:** the same message blocks the start.
3. **Build:** R2 at 2,800 m plus two connectors ($208,080).
4. **Day 2:** GA 901 lands on R2 at 07:14, taxis to A7, deplanes 222,
   boards 219, departs 08:10 and earns $6,885.50.

**D. A valid but poor design** (Riverdale, the runway exit replaced by a
1 km detour, $30,690 net of the refund): every arrival taxis 4.5 min instead
of 3.0. Mean delay goes 2.5 → 2.8 min and missed connections 6 → 16. The
operating result falls from +$18,415.50 to +$7,205.50. It is valid, and
simply worse.

**E. Taxi design to money** (one-lane airport against Riverdale, same
schedule and seed):

1. **The flight.** AW 312 lands at 07:08 in both. On one lane its taxi-in is
   15.0 min, including 11.3 min held (3.0 in Riverdale).
2. **The passenger.** P2036 is off the aircraft at 07:26:21 instead of
   07:22:36, and misses NS 277 (made in Riverdale).
3. **The day.** Missed connections go 6 → 31, missed bags 6 → 8, mean delay
   2.5 → 5.6 min.
4. **The airlines.** Relationships fall: AW 75 → 62, GA 90 → 53, NS 80 → 57,
   SJ 85 → 52. GA's Connection Hub, NS's Premium Reliability and SJ's Fast
   Turnaround contracts go PASSED → FAILED.
5. **The money.** The operating result goes +$18,415.50 → −$15,942.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 219 tests, 0 failed (1,744 s, 50 deadlock runs). The standalone golden baseline is identical |
| New `test_airside.gd` | 23 tests; see below |
| Regression | All M1–M11 tests pass. The M1 fixture with scaled timers opts out of the airside (`config.erase("airside")`); M11's save-version test now expects v12 and rejects v11 |
| `tools/ui_tests.sh` | Airport UI, terminal UI, and the M3–M12 demos: 0 failures |

The 23 airside tests cover:

- **Import:** the unchanged Riverdale airside is the scenario's, and every
  gate is exactly the old 180 s in and out.
- **Routing:**
  - deterministic shortest routes with stable ties
  - one-way and class restrictions
  - the route cache per revision
  - stands never passed through
- **Occupancy:** headway and no passing, two-way direction locks,
  intersection reservations.
- **Runways:**
  - length decides service, and a closed runway serves nothing
  - a second runway shares traffic deterministically and shortens queues
  - a closed R1 carries no traffic
  - a short runway blocks a 787 request until a 2,800 m runway is built, then
    the 787 flies from it
- **Movement:**
  - positions move at most 1 m per tick (no teleport)
  - the one-lane day completes, with exact breakdowns on every flight
  - status text for moving, waiting behind another aircraft (with who), and
    holding
  - reassigning a taxiing aircraft reroutes it around the loop without a
    jump, and refuses a gate already passed
- **Deadlock:** a sweep of randomized compressed mornings on two-way
  taxiways (8 by default, 50 in the full run). Every aircraft departs and
  every lock and occupant is released.
- **Construction:**
  - taxiway rules (network, grid, zones, terminal, crossings,
    pass-throughs, runways, duplicates, stands)
  - runway rules (offered lengths, spacing, zones, heading)
  - costs by length in the ledger, with full undo refunds
  - demolition and change safety
- **Saves:**
  - a mid-taxi save resumes identically
  - corrupt airside saves are rejected (v11, occupant on the wrong edge, lock
    count, missing edge, unknown runway, missing edge state, leg out of range)
  - the career keeps the airside layout, and corrupt runway or imported
    objects are rejected

## Performance

`tests/airside_benchmark.gd`, measured on a shared machine (load average
14–15 from other processes). Comparisons are within one run.

| | Result |
| --- | --- |
| Routing, Riverdale (31 nodes, 38 edges) | full route table 961 pairs in 54 ms = 56 µs/route · cached lookup 1 µs · network setup 0.2 ms |
| Routing, Riverdale + R2 / one taxilane | 58 / 57 µs/route |
| Routing, synthetic 20 × 20 grid (400 nodes, 760 two-way edges) | 5.0 ms/route · setup 5.7 ms |
| `validate_airside` | 1.6 ms (Riverdale) · 2.8 ms (+ R2) |
| Operations only, Riverdale with M11 timers → with the airside | 81.1 → 92.5 µs/tick (+R2 94.7; one taxilane 96.0) · worst 1.2–1.7 ms |
| Stress: 72 flights in one morning on the one-lane airport | 295 µs/tick · worst 2.5 ms · 4× frame 11.8 ms · peak 53 aircraft taxiing · every flight departs |
| Full day (passengers, bags, crews), M11 timers → airside | 270 → 283 µs/tick · worst 5.9 / 5.6 ms · 4× frame 10.8 → 11.3 ms |
| Full day, one taxilane | 363 µs/tick · worst 7.4 ms · 4× frame 14.5 ms |
| Mid-taxi save (full day, 4 aircraft taxiing) | 14.85 MB · airside state 2.4 KB · serialize 2.5 s · parse + validate + restore 3.4 s |

- **Movement is cheap.** Airside movement adds about 11–13 µs per tick
  (under 5% of a full day), because routes are computed only at landing,
  pushback or reassignment (16–32 distinct routes a day), and each taxiing
  aircraft does O(1) work per tick.
- **A stressed one-lane day stays within frame budget** at 4×, with 53
  aircraft queued on the airside at once.
- **Routing uses a simple sorted-list Dijkstra.** It is fast at Riverdale's
  size (tens of nodes) but 5 ms per route on a 400-node grid. The
  construction grid cannot produce such a network (at most about 85 anchors
  plus Riverdale's nodes), and routes are event-driven, so it is not a
  measured bottleneck. A heap is the fix if networks grow.
- **The airside adds 2.4 KB to a mid-day save.** The size is still the event
  history, as in M11.

Nothing was optimized.

## Product questions

1. **Can the player physically build and modify airside infrastructure?**
   **Yes.**
   - **Building:** taxiways between nodes and grid points, and runways by
     anchor, heading and length, with costs from length.
   - **Changing:** one-way either way or two-way, runways open or closed.
   - **Demolishing:** imported and new pieces alike, within validation.
2. **Do aircraft actually use the built taxiways and runways?** **Yes.**
   - Routes are computed on the built graph at landing and pushback.
   - In A, day 2's arrivals come straight down the new connector.
   - In B, seven flights use R2.
   - In C, the 787 can only use R2.
3. **Can taxi design create real congestion and delay?** **Yes.**
   - **One lane:** taxi waits total 107 minutes and mean delay doubles to
     5.6 min.
   - **Causes:** the flight detail names the blocker (opposing traffic, the
     aircraft ahead, the intersection or the gate).
   - **Attribution:** `taxi_congestion` is a separate cause, and the
     breakdown stays exact.
4. **Can runway investment unlock new aircraft or reduce runway congestion?**
   **Yes.** A 2,800 m runway lets GA's 787 fly (C). A second runway cuts
   runway queue delay from 15.0 to 6.3 minutes (B).
5. **Does airside construction create meaningful tradeoffs with the rest of
   the airport?** **Yes.**
   - **Positive:** the $28,590 of taxiways in A turns −$15.9k into +$0.3k and
     saves 21 connections.
   - **Negative:** a poor detour costs $11k a day in operations (D).
   - **Long horizon:** B's $230k runway halves queues but earns little on one
     day.
   - **Chain:** E follows one design choice through a held taxi, a late
     deplaning, a missed connection, three failed contracts and $34k.

## Limitations

- **Riverdale's imported airside is schematic.** Its lengths are calibrated
  to the old 180 s taxi, not drawn to scale; long gate stubs stand in for
  apron distance. New construction is geometric.
- **Simplified taxi physics:**
  - constant 10 m/s, no acceleration
  - separation is a per-edge headway and a node reservation, not distances
  - aircraft waiting at a hold or a runway end are not a physical queue
    others must pass
  - no pushback path of its own (the tug time then the stand edge)
- **Runways:**
  - independent, with no crossing runways or runway crossings
  - operations run in one fixed direction per runway
  - no wind or active-runway configuration
  - no intersection departures
- **Taxiway rules:** no angle or turn radius limits, and no wingspan
  separation beyond the narrow/wide class tag. Taxiways are built both-class.
- **Reroutes** are refused while opposing traffic owns the new route.
  Reassigning before landing avoids that.
- **Mid-day saves stay large** (the within-day event history, unchanged from
  M11).
- **The full test suite takes about 30 minutes** with 50 deadlock runs.
