# M5 completion report: passenger deboarding

Implemented on 2026-09-24 from M4 `5ca4b07`, against [m5-plan.md](m5-plan.md).
Decisions D-028 to D-030. M6 has not started.

## Delivered

- **Arriving aircraft carry real passengers.** Every flight has an inbound
  manifest of canonical `Passenger` objects: 4,005 arrivals in the Riverdale
  morning. Load, seats, speed, bags and deboarding timings come from their own
  seeded stream, so outbound passengers are unchanged. The journey runs
  `on_aircraft` → `deboarding` → `walking_to_exit` → `left_airport`, on the same
  object and id throughout. Cabin states (`LEAVING_SEAT`, `RETRIEVING_BAGS`,
  `EXITED`) stay a separate layer. All arrivals are local in M5; the model has
  `connection_flight_id` ready for M6.
- **Deboarding engine** (`DeboardingSimulation`). It uses the M3 cabins and the
  one-cell-per-row aisle, moving toward the door:
  - Per row side, the passenger nearest the aisle gets up first.
  - Seat leavers take a free aisle cell before walkers from behind, so rows
    ahead empty first.
  - Bags are retrieved in the aisle, blocking those behind. Nobody passes.
  - The door releases one passenger per interval.

  Timings are airport configuration, with seeded variation only on getting up
  and on bags. An 85% cabin empties in 6.0 min (A220), 8.0 min (737) and
  9.5 min (A321). The standalone boarding engine is untouched: its golden
  baseline is identical.
- **Widebody deboarding abstraction (787).** A 12-minute task; then every inbound
  passenger enters the terminal together. It is labelled in events, the
  inspector and the cabin view.
- **Turnaround task.**

  ```
  arrival_secured → deboarding, fueling, placeholder baggage
  deboarding → cleaning, catering → boarding (exclusive with fueling)
  pushback_ready ← boarding, fueling, baggage
  ```

  Cleaning and catering shrank so the D-30 window is still reachable. Slow
  deboarding delays cleaning, catering, boarding, pushback and the next gate
  user. The M4 critical-path attribution blames it only when it is on the path.
- **Terminal.** New landside Arrivals hall and airport exit, with one-way
  walkways from both concourses. Passengers enter at the gate on the tick they
  leave the aircraft.
- **Follow a passenger.** The Passengers tab lists IN and OUT passengers.
  Selecting an arrival follows them:
  - Seated: the inspector shows their seat.
  - In the cabin: **View deboarding** opens the cabin with them circled.
  - In the terminal: their route to the exit is highlighted.
  - Finally: *Left the airport HH:MM*.
- **UI.**
  - The cabin view draws deboarding: movement toward the door, bags coming down
    from the bins, "N / M off the aircraft".
  - The Turnaround tab shows *Deboarding · 28% · 57 / 197 off* and *Cleaning ·
    waiting for deboarding*.
  - The headline reads *Holding turnaround: Deboarding …* while boarding has not
    started.
- **Save schema v5.** Deboarding cabins are saved and validated. A save made
  mid-deboarding resumes to the identical outcome. v4 is rejected.

## Demonstrations

Run `tools/ui_tests.sh tests/m5_demo.gd`. It writes `/tmp/m5-demo-01…06*.png`.

**A. Normal turnaround.** AW 228, following P4086 in seat 15F:

```
  06:09:00  1  AW 228 docks at A2; P4086 seated in 15F
  06:11:27  3  Deboarding under way: 15 off
  06:16:36  4  P4086 steps into the aisle at row 15 (Retrieving bags)
  06:17:08  6-7  P4086 leaves the aircraft and enters the terminal at A2
  06:17:38  8  P4086 walking to the exit, now at A2
  06:18:52  9  Deboarding complete: 156 passengers off
  06:18:52  10 Cleaning and catering start
  06:23:02     P4086 leaves the airport
  06:57:35  11 AW 228 departs (Runway queue +0.3 min)
```

**B. Slow deboarding.** SJ 235 (A321) has a scenario override restricting its
jet-bridge door to one passenger every 6 seconds:

```
  Deboarding          06:13:02 → 06:33:02  (20.0 min, plan 9.5)
  Cleaning            06:33:03 → 06:40:40  after deboarding
  Boarding opened     06:40:40  (D-30 was 06:33:15)
  Pushback            07:07:16  (scheduled 06:59:20)
  Departed            07:14:10, +10.9 min: Runway queue +3.0 min, Deboarding +6.8 min, Cleaning +0.6 min, Boarding +0.5 min
```

The delay chains through the whole turnaround, and the breakdown adds up to the
lateness. Cleaning and boarding each ran slightly over their own plan, and
those small overruns are theirs.

## Baseline (full morning, default config, no player action)

| | M4 | M5 |
| --- | --- | --- |
| Passengers | 3,981 | 7,986 (3,981 departing + 4,005 arriving) |
| Late departures (any / > 5 min) | 13 / 1 | 14 / 2 (the two demo flights) |
| Mean delay | 0.9 min | 1.6 min |
| Delay by cause | runway 9.5, cleaning 9.4, boarding 2.7 | runway 16.1 (13 flights), cleaning 11.2 (2), deboarding 6.8 (1, SJ 235), boarding 2.7 (2), fueling 0.6 (1) |
| Security, missed flights | unchanged | unchanged |

At default loads and timings, ordinary deboarding finishes within the slack
before D-30 and is never blamed. Only the restricted door on SJ 235 puts it on
the critical path. The runway queue grew because more departures now cluster
just after the shifted turnarounds.

Strategy benchmark (every cabin flight on one strategy): Window/Middle/Aisle 0
flights delayed by boarding, Random 2 (2.7 min), Back-to-front 4 (13.7), and
Front-to-back 9 (49.0). Unchanged from M4.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 95 tests, 0 failed. Sweeps: 1,000 standalone deadlock scenarios, 300 incremental admission, 300 deboarding (random cabins, loads and timings) |
| New `test_deboarding.gd` (15 tests) | engine: everyone exits, no passing, one per cell; deterministic and resumable; front rows first, bags block. Airport: identity from seat to exit; never in cabin and terminal at once; cleaning and catering wait; fueling and baggage run alongside; slow deboarding delays cleaning, boarding, pushback and departure, and is blamed; slow but off-path deboarding is not blamed; a late inbound shifts everything; a mid-deboarding save resumes identically; tampered v5 saves rejected; widebody abstraction; the full morning (every arrival leaves, breakdowns exact, SJ 235 blamed on deboarding) |
| Regression | all M3 boarding and M4 turnaround tests pass. The M4 tests were updated for the new graph shape and task count; the M2 flow fixture has no inbound passengers. Standalone golden baseline identical |
| `tools/ui_tests.sh` | airport UI, terminal UI, M3, M4 and M5 demos: 0 failures |

## Performance

| | M4 | M5 |
| --- | --- | --- |
| Mean airport tick (default morning) | 80–88 µs | 138–163 µs |
| Worst tick | 2.6–2.9 ms | 2.9–3.2 ms (11 ms before the route cache) |
| 100-flight stress: mean / worst tick | 202 µs / 2.9 ms | 318 µs / 3.7 ms |
| Simulation per frame at 4× | about 3.5 ms | about 5.5–6.5 ms |
| Peak active passengers (terminal plus cabins at gates) | — | 2,246 |
| Concurrent cabins | 6 boarding | 6 boarding + 4 deboarding |

Profile (µs per tick, mean over the morning): flight updates 33, passenger
flow 8, boarding cabins 30, deboarding cabins 56.

Two measured bottlenecks were fixed, and nothing else:

- **Deboarding engine (102 → 56 µs).** String-keyed seat queues and per-step
  array copies were replaced with indexed arrays and in-place iteration. It now
  costs about the same per cabin as boarding.
- **Pathfinding spike (worst tick 11 ms → 2.9 ms).** The widebody abstraction
  puts about 220 passengers into the terminal on a single tick, each running
  Dijkstra. The terminal graph is fixed, so routes are now cached by start,
  goal and airside flag. It returns the same routes; the event counts are
  identical.

Pathfinding's steady cost is inside the 8 µs passenger-flow step.

## Limitations

- **The widebody deboarding abstraction releases everyone at once.** There is
  no twin-aisle cabin.
- **No baggage reclaim, customs, immigration or ground transport.** Arrivals
  walk straight out.
- **No connecting passengers yet (M6).** Every arrival is local.
- **Deboarding timings are uniform across airlines.** Per-flight overrides exist
  only as a scenario tool.
- **The rendered suite takes about 4 minutes.** The full test suite takes
  6.5 minutes with the sweeps, and 3 minutes quick.

## Product questions

> Does an arriving aircraft now feel like it actually contains people, and can
> the player see those people physically become part of the airport?

**Yes.**

- Before the doors open, the Passengers tab lists everyone on board with their
  seats.
- **View deboarding** shows the cabin emptying from the front: rows standing,
  people pulling bags from the bins while the aisle jams behind them.
- The followed passenger is the same id in 15F, in the aisle at row 15, at gate
  A2, on the concourse to Arrivals, and at the exit.
- On the Terminal tab, blue arrivals stream the other way from departures.

> Can slow deboarding produce a visible, explainable operational consequence?

**Yes.** SJ 235's restricted door keeps passengers aboard for 20 minutes:

- The headline reads *Holding turnaround: Deboarding · 28% · 57 / 197 off*.
- Cleaning and catering read *waiting for deboarding*.
- Boarding opens 7 minutes past D-30.
- The departure reads *+10.9 min: Deboarding 6.8, Runway queue 3.0, Cleaning
  0.6, Boarding 0.5*.

Ordinary deboarding that stays inside the slack is correctly never blamed.
