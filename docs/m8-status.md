# M8 completion report: operational resources

Implemented on 2026-09-24 from M7 (`639a3bd`), against
[m8-plan.md](m8-plan.md). Decisions D-038 to D-040. M9 has not started.

> **"GA 270 is not fueling because both fuel units are busy."** Press HIGH,
> and SJ 263 waits instead.

## Delivered

- **Resource pools (D-038).** Cleaning crews, catering crews, fuel units,
  baggage crews and pushback tugs, from airport config. Each unit is explicit
  (`fuel_unit#2`) and records the task holding it; a unit never serves two
  tasks. There is no movement or travel time.
- **Task requirements.**

  | Task | Resource |
  | --- | --- |
  | Cleaning | cleaning crew |
  | Catering | catering crew |
  | Fueling | fuel unit |
  | Baggage unload and baggage load | baggage crew (shared, so arriving and departing flights compete) |
  | Pushback | tug |

  Deboarding and boarding need none.
- **Waiting.** A new `WAITING` task status. The task does not progress, and
  the UI shows *WAITING FOR FUEL UNIT · next in line · 2 / 2 busy · waited
  1:56*. A flight waiting for fuel doesn't start boarding (M4's exclusivity).
- **Pushback operation.** A tug-backed task after readiness:

  > ready → waiting for tug → tug assigned → pushback (gate released, taxi-out
  > begins) → tug released after 2 minutes

  *Holding departure: Pushback · WAITING FOR PUSHBACK TUG* is a real state.
- **Deterministic, event-driven allocation (D-039).** Requests, releases,
  priority changes and restores mark a pool dirty. Pools are dispatched once
  per tick, after all flights, in this order:
  1. service priority
  2. scheduled departure
  3. readiness tick
  4. scenario order
  5. task order

  Nothing depends on dictionary or frame order: pools go in name order, so a
  save round trip can't reorder them.
- **Service priority.** LOW / NORMAL / HIGH buttons in the flight details. A
  change is a recorded decision that reorders the flight's waiting tasks. It
  never creates capacity.
- **Baggage loading window.** Loading opens at D-35, so crews are held for
  the load itself rather than the whole turnaround.
- **Resources tab.** Per type: busy/total and waiting, expanding to the queue
  in allocation order (priority, departure, time waiting) and who holds each
  unit. Pools nobody waits for stay folded. Selecting a row selects the
  flight.
- **Blame (D-040).**
  - A task's late start is split. Its resource wait is blamed first as
    *Waiting for fuel unit*; the rest passes upstream.
  - Execution overrun stays with the task. For example, *Waiting for fuel unit
    +20.1, Fueling +2.6* keeps the 20 minutes waiting apart from the fueling's
    own 2.6-minute overrun.
  - The tug wait comes off pushback lateness first.
  - Waits off the critical path get nothing.
- **Metrics.** `resource_metrics()`, per pool:
  - utilization, requests, tasks that waited
  - mean and max wait
  - peak queue and allocations
  - departure delay blamed on it

  Plus flights delayed by shortage and the total.
- **Alerts and events.**
  - Alerts: *Fuel units · 3 flights waiting* (2 or more), *Pushback · AW 228
    waiting 4 min for tug* (2 minutes or more). They are counted in the top
    bar and open the Resources tab.
  - Events (`RESOURCE_SHORTAGE`, `RESOURCE_SHORTAGE_CLEARED`) fire only on
    transitions, plus assignment and release events.
- **Scenarios.** `extends` overlays. `riverdale_shortage.json` is the
  deliberate shortage (2 fuel units, 4 baggage crews, 1 tug). The scene takes
  `--scenario=`.
- **Save schema v8.** Covers pools, queues, holders, the new task fields and
  flight priority, with cross-validation. v7 is rejected.
- **Security staff** is unchanged: it assigns staff to lanes, a different
  model. A shared staffing architecture is noted for later.

## Demonstrations

Run `tools/ui_tests.sh tests/m8_demo.gd` (shortage morning). It writes
`/tmp/m8-demo-01…05*.png`.

```
  06:16:08  A · fuel units 2/2 busy · waiting: GA 242, SJ 235
  06:18:05  A · a fuel unit freed: GA 242 starts fueling after 1:56 (next in line, as shown)
  06:28:13  B · fuel queue: SJ 263, GA 270
  06:28:13  B · player sets GA 270 HIGH · queue now: GA 270, SJ 263
  07:02:25  C · SJ 291 lands; gate A3 still held by SJ 235 (boarding)
  07:14:10  C · SJ 235 departed 07:14:10: Runway queue +0.4, Waiting for pushback tug +0.6, Waiting for fuel unit +7.7, Fueling +2.2
  07:14:10  C · SJ 291 reached gate 07:09:49 after waiting 7:24 for it

  B · who fuels next when a unit frees:
    Default order (SJ 263 first): SJ 263 +10.1 min · GA 270 +17.2 min
      SJ 263: Waiting for pushback tug +1.8, Waiting for fuel unit +5.7, Fueling +2.6
      GA 270: Waiting for fuel unit +14.8, Fueling +2.4
    GA 270 HIGH:                  SJ 263 +22.7 min · GA 270 +2.8 min
      SJ 263: Waiting for fuel unit +20.1, Fueling +2.6
      GA 270: Waiting for fuel unit +0.4, Fueling +2.4
```

- **A:** both fuel units are busy and two flights are queued. The flight
  details say *WAITING FOR FUEL UNIT*, and the Resources tab shows *2 / 2 ·
  ALL BUSY*. When a unit frees, the head of the queue starts.
- **B:** the default replay comes from a save of the same moment. HIGH moves
  14.4 minutes off GA 270 and puts 12.6 on SJ 263. It redistributes the delay
  (27.3 → 25.5 minutes combined), because SJ 263 also stops waiting for the
  single tug.
- **C:** a fuel shortage delays SJ 235's turnaround. It holds gate A3, so the
  next arrival, SJ 291, waits 7.4 minutes to dock. This is existing gate logic,
  not a scripted penalty. The shortage morning also shows:
  - late boarding windows
  - lost runway slots
  - transfer bags missing their cutoff (209 made / 66 missed, against 287 / 6
    in the default morning), because baggage crews unload late

## Baseline (full morning)

| | M7 | M8 default | M8 shortage scenario |
| --- | --- | --- | --- |
| Mean delay | 2.2 min | 2.5 min | 18.5 min |
| Late (any / > 5 min) | 13 / 4 | 14 / 4 | 23 / 20 |
| Flights delayed by resource shortage | — | 2 (4.5 min) | 20 (316 min) |
| Tasks that waited: cleaning / fuel / baggage / tug | — | 4 of 24 / 6 of 24 / 5 of 48 / 0 of 24 | 3 of 24 / 22 of 24 / 22 of 48 / 4 of 24 |
| Mean / longest wait | — | fuel 1.5 / 4.8 min, baggage 1.4 / 3.5 min | fuel 18 / 30 min, baggage crew 22 / 40 min |
| Utilization over the morning (fuel, baggage) | — | 33%, 42% | 65%, 67% |
| Transfer bags made / missed | 290 / 3 | 287 / 6 | 209 / 66 |
| Connections made / missed | 527 / 6 | 527 / 6 | — |

The default morning is **busy, not broken**:

- The waves produce short queues for cleaning crews, fuel units and baggage
  crews.
- 2 flights lose a few minutes to them.
- Only the four M3–M7 demo flights are more than 5 minutes late, as in M7.
- Capacity was set by measurement: peak concurrent demand is cleaning 4,
  catering 3, fuel 5, baggage 8 and tugs 2, and Riverdale has 3 / 3 / 4 / 7 / 2.

**Differences from M7 with capacity to spare:**

- The D-35 loading window makes M7's demo D (AW 256's slow loader) start with
  a backlog. That flight now leaves +10.9 minutes rather than +7.6 (walkthrough
  updated).
- The later timing at A6 shifts AW 312's turnaround slightly, which costs 3
  transfer bags onto it.
- The pushback gate release happens after the flight loop, so a following
  arrival can take the gate one tick later.

Nothing else from M3–M7 was retuned.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 145 tests, 0 failed (723 s). 1,000 standalone deadlock scenarios. The standalone golden baseline is identical |
| New `test_resources.gd` | 16 tests; see below |
| Regression | All M3–M7 tests pass. Earlier fixtures opt out of resource limits (like baggage and connections). The M7 baggage tests follow the D-35 loading window and v8 |
| `tools/ui_tests.sh` | Airport UI, terminal UI, and the M3, M4, M5, M6, M7 and M8 demos: 0 failures |

The 16 resource tests cover:

- **Acquisition:** a ready task takes a free unit on the tick it is ready.
- **Blocking:** no progress without a unit, and no boarding while waiting for
  fuel.
- **Exclusivity:** a unit never serves two tasks (checked every tick, with 3
  flights).
- **Release and queue:** the next in line starts on the tick the unit frees.
- **Deterministic ties:** the same order whichever request came first.
- **Priority and opportunity cost:** HIGH goes first; the other flight's
  start and departure get worse; the allocation count is unchanged.
- **Live reordering:** a priority change reorders the queue, and an invalid
  level is rejected.
- **Pushback tug:** a ready aircraft stays at the gate until the tug frees,
  and the wait is blamed on the tug.
- **Shared baggage crews:** unload and load compete for the same crews.
- **Critical-path resource delay:** the breakdown is complete, and the
  execution overrun is separate.
- **Off the critical path:** a wait with slack gets no blame.
- **Connection consequence:** a baggage-crew shortage makes a transfer bag
  miss while its passenger connects.
- **Save/load:** a save at 4 points mid-contention (queue, HIGH priority, tug
  assigned) resumes identically; v7 and 6 corruptions are rejected.
- **Determinism:** same seed and decisions give the same allocation.
- **Riverdale balance:** the default is busy, not broken; the shortage
  scenario cascades.

## Performance

| Scenario | Mean tick | Worst tick | Simulation per 4× frame | Resource dispatch | Allocations | Peak queues | Flights delayed by shortage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Default morning | 152 µs | 3.2 ms | 6.1 ms | 0.15 µs/tick | 144 | 1 per type | 2 (4.5 min) |
| 100 flights | 353 µs | 3.7 ms | 14.1 ms | 0.26 µs/tick | 364 | baggage 2, fuel 2 | 26 (89 min) |
| Shortage | 165 µs | 7.0 ms | 6.6 ms | 0.17 µs/tick | 144 | baggage 5, fuel 4 | 20 (316 min) |
| Baggage-heavy | 185 µs | 8.1 ms | 7.4 ms | 0.36 µs/tick | 144 | baggage 2 | 1 (0.9 min) |
| Connection-heavy | 213 µs | 16.9 ms | 8.5 ms | 0.24 µs/tick | 144 | fuel 2, baggage 2 | 1 (0.9 min) |

- **Dispatch is event-driven** and costs under 0.4 µs per tick in every
  scenario. It only runs when something changed; there is no steady-state
  scan.
- **Against M7:** `airport_benchmark` gives 175 µs (M7: 174 µs) for the
  default morning and 355 µs (M7: 352 µs) for 100 flights.
- **100-flight frame cost:** 14.1–19.3 ms per 4× frame across runs
  (`resource_benchmark` 14.1, `baggage_benchmark` 19.3), against M7's 18.1 ms.
  The spread is run-to-run noise; M8 adds nothing measurable.
- **The 16.9 ms worst tick** in connection-heavy is a single outlier. The same
  scenario peaked at 5.5 ms in `baggage_benchmark` and 6.5 ms in
  `connection_benchmark` in the same session.

Nothing was optimized.

## Product questions

1. **Can the player immediately understand when a flight is waiting because
   the airport lacks an available resource?** **Yes.**
   - The flight details list *Fueling: WAITING FOR FUEL UNIT · next in line ·
     2 / 2 busy · waited 1:56* with *Priority NORMAL · position 1 in the fuel
     unit queue*. The headline reads *Holding departure: … · waiting for …*
     when that wait is what holds the flight.
   - The Resources tab shows *Fuel units 2 / 2 · 2 waiting · ALL BUSY* with
     the queue.
   - An alert reads *Fuel units · 2 flights waiting*.
2. **Can limited resources create real contention between flights?**
   **Yes.**
   - **Default morning:** short queues in each wave.
   - **Shortage morning:** fuel waits of up to 30 minutes and baggage-crew
     waits of up to 40. Unloads and loads compete for the same crews.
3. **Can the player change which flight gets delayed by changing operational
   priority?** **Yes.** Demo B: HIGH on GA 270 turns +17.2 / +10.1 (GA 270 /
   SJ 263) into +2.8 / +22.7. The same number of allocations happen, so it is
   the same capacity, differently shared.
4. **Do the consequences propagate naturally through the systems built in
   M3–M7?** **Yes.**
   - Fuel waits push boarding windows (M3/M4).
   - A delayed turnaround holds the gate against the next arrival (M1). In
     demo C, SJ 291 waits 7.4 minutes.
   - Baggage-crew waits make transfer bags miss while their passengers
     connect (M6/M7; a unit test, and 66 bag misses in the shortage morning).
   - Lost runway slots follow.

   None of it is special-cased.

## Limitations

- **Resources are abstract:** no vehicles, walking crews, parking, travel
  time or shifts. Units are identical.
- **Priority is per flight** (all its tasks), not per task.
- **Estimates for waiting tasks are approximate:** they use in-use units'
  planned ends and the queue position.
- **Security staff remains a separate model.**
- **No purchase or hiring of capacity yet** (M10/M11).
- **The full test suite takes about 12 minutes.**
