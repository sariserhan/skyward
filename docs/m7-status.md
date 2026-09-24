# M7 completion report: checked baggage

Implemented on 2026-09-24 from the M6 closeout (`355e5a0`), against
[m7-plan.md](m7-plan.md). Decisions D-035 to D-037. M8 has not started.

> **Your passenger made the connection. Their suitcase didn't.**

## Delivered

- **Bags are real objects (D-035).** Every checked bag is one `AirportBag`,
  `BAG_000123`, linked to its passenger (`checked_bag_ids`). Each bag has:
  - its legs and a leg index
  - its kind: originating, local or transfer
  - a state and a stage
  - timestamps (checked, unloaded, ready, loaded, at reclaim, collected)
  - missed or held details

  A transfer bag is the same object from the inbound hold to the outbound
  hold.
- **Generation.** A dedicated stream (`STREAM_BAGGAGE`) produces 0, 1 or
  occasionally 2 bags per passenger. The rate is per airline (NS 45%, AW 50%,
  SJ 30%, GA 60%; 12% of checkers bring a second bag). Turning bags off
  changes no passenger. The Riverdale morning has 3,684 bags, 0.49 per
  passenger.
- **Logical processing.** Three stages: outbound sortation, transfer sortation
  and reclaim delivery. Each has a transit time, servers, a FIFO queue and a
  fixed service time, all from airport config. One stable event heap drives
  them on the airport clock. There are no conveyors or vehicles.
- **Outbound lifecycle.** created → in transit → queued/sorting → ready for
  flight → loading → on aircraft → departed. Check-in sends the bags.
- **Turnaround.** The placeholder task is replaced by two real tasks:
  - `baggage_unload` (after arrival secured): the bags come off one by one and
    the task ends with the last bag.
  - `baggage_load` (after unload): bags are loaded as they become ready; the
    task completes once the gate has closed, the bag cutoff has passed and the
    loader is empty.

  The graph is arrival secured → deboarding, baggage unload, fueling;
  deboarding → cleaning, catering; baggage unload → baggage load. Pushback
  requires boarding, fueling and baggage load.
- **Reclaim.** A local arrival with checked bags walks Arrivals → **Reclaim**,
  waits for *their own* bags, collects them and leaves. Passengers without bags
  walk straight through.
- **Transfers.** A connector's bag goes from the inbound hold to transfer
  sortation to the outbound flight. Passenger and bag are independent:
  - **Case B:** the passenger boards, but the bag misses the D-15 bag cutoff →
    `missed_connection`.
  - **Case C:** the passenger misses → the bag is `held`, never flown alone. A
    loaded bag is offloaded first, which costs loader time.

  Connection eligibility is unchanged. Passenger and bag margins are tracked
  separately (`bag_transfer_margin`).
- **Cutoff and holds (D-036).** The bag cutoff is D-15 from the departure
  target. Holds do not move it. There is no wrong-flight misrouting.
- **Honest blame.** Baggage load lateness first passes any wait for the gate
  close to boarding's chain. What remains is a slow loader or backlog, then its
  late start, which passes to unload. A deep clean that delays boarding is
  still blamed on cleaning. A slow bag task off the critical path gets no
  blame.
- **UI.**
  - A flight **Baggage** block: *Loaded 63 / 84 · 5 sorting · 2 transfer
    inbound*, a *Bag cutoff in 12:30* countdown, missed and held counts,
    inbound bags off.
  - Turnaround rows: *Baggage load · Running · 75% · 63 / 84 loaded*.
  - *Holding departure: Baggage load*.
  - Passenger lines: *Checked bag: BAG_000275 · On the reclaim belt*.
  - Connectors: *Passenger: ON TRACK / Bag: AT RISK · ready ~06:43 vs bag
    cutoff 06:42*, later *Passenger: BOARDED / Bag: MISSED CONNECTION*.
  - A sortation backlog alert, and bag counts in the top bar.
- **787.** Real bag objects, with aggregate per-type unload and load rates
  (twice the narrowbody rate).
- **Metrics.** `baggage_metrics()` and `Baseline.measure().baggage`:
  - total bags and bags per passenger
  - loaded, transfer made and missed
  - held
  - at reclaim, mean and max reclaim wait
  - baggage-caused delay
- **Save schema v7 (D-037).** Adds bags, the heap, stage queues and servers,
  and loader state, with strict cross-validation. v6 is rejected.

## Demonstrations

Run `tools/ui_tests.sh tests/m7_demo.gd`. It writes `/tmp/m7-demo-01…07*.png`.

```
  05:15:00  A · P0098 arriving on NS 221 with BAG_000052
  06:13:46  A · P0098 at reclaim; BAG_000052 is Being unloaded from NS 221
  06:20:14  A · bag on the belt 06:19:18; collected after 5:37; left 06:20:14
  06:20:14  B · P0457 GA 242 → SJ 319 with BAG_000199
  06:20:22  B · walking to A7; bag To transfer sorting
  06:37:34  C · P0565 off NS 249, walking to A2; BAG_000275 Being unloaded from NS 249
  06:42:15  C · AW 228 bag cutoff 06:42:15: MISSED CONNECTION to AW 228 (still in processing)
  06:46:56  C · P0565 seated on AW 228 (connection made); the bag is not
  07:05:36  D · AW 256 gate closed 07:02:15; baggage still loading
  07:20:54  D · AW 256 departed 07:20:54 · Runway queue +1.0 min, Baggage load +7.6 min
  B · outcome: bag BAG_000199 loaded 07:23:51 (bag cutoff 07:52:15); P0457 seated 07:43:13
```

- **A:** P0098 waits 5.6 minutes at reclaim. They leave the moment their last
  bag reaches the belt.
- **B:** passenger and bag both make SJ 319. The bag is loaded 28 minutes
  before its bag cutoff.
- **C:** NS 249 lands 18 minutes late. P0565's bag comes off at 06:40:22 and
  is ready at 06:43:40, 85 seconds after AW 228's 06:42:15 bag cutoff. The
  passenger reaches A2 at 06:42 and boards. The details read *Passenger:
  BOARDED / Bag: MISSED CONNECTION · ready 06:43, bag cutoff was 06:42*. The
  explanation comes from recorded timestamps, not a random roll.
- **D:** AW 256 has a slow loader (scenario `baggage_overrides`, 30 s per bag).
  Boarding is done by 07:05, but at 07:05 the details read *Holding departure:
  Baggage load · 75% · 63 / 84 loaded*, estimated 07:20. It departs at 07:20,
  and the breakdown is *Runway queue +1.0, Baggage load +7.6*.

## Baseline (full morning, default config)

| | M6 closeout | M7 |
| --- | --- | --- |
| Booked / boarded load | 82.1 / 81.8% | 82.1 / 81.9% |
| Mean delay | 1.9 min | 2.2 min |
| Late departures (any / > 5 min) | 14 / 3 | 13 / 4 |
| Connections made / missed | 523 / 10 | 527 / 6 (same connectors; turnaround timing shifted slightly) |
| Checked bags | — | 3,684 (1,688 originating, 1,699 local, 297 transfer); 3,300 passengers with bags |
| Transfer bags made / missed / held | — | 290 / 3 / 4 |
| Reclaim wait, mean / max | — | 1.7 / 12.0 min; every local bag collected, none left on the belt |
| Flights delayed by baggage | — | 1 (AW 256, the demo: 7.6 min) |

More than 5 minutes late are the four demo flights:

- GA 242: deep clean
- NS 249: late inbound
- SJ 235: slow door
- AW 256: slow loader

The default morning mostly works. 98% of transfer bags make it, and every miss
is a tight connection whose passenger made it.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 129 tests, 0 failed (508 s). 1,000 standalone deadlock scenarios. The standalone golden baseline is identical |
| New `test_baggage.gd` | 21 tests; see below |
| Regression | All M3–M6 tests pass. Earlier fixtures opt out of the baggage model, as M6 did for connections. The placeholder task is renamed in the M4/M5 tests |
| `tools/ui_tests.sh` | Airport UI, terminal UI, and the M3, M4, M5, M6 and M7 demos: 0 failures |

The 21 baggage tests cover:

- **Identity and generation:** one owner per bag; 0, 1 or 2 bags; per-airline
  rates; the baggage stream is independent of passengers.
- **Originating lifecycle:** the same object from check-in to departure.
- **Unload and load:** unload time comes from the bags; load starts after
  unload; pushback requires the load.
- **Slow loader:** it holds pushback, with complete and honest blame.
- **No false baggage blame:** none when boarding is late, and none for a slow
  but non-critical bag task.
- **787 rates.**
- **Reclaim:** the passenger waits for their own bag; a passenger without bags
  goes straight out; two bags means waiting for both.
- **Transfers:**
  - the bag follows the connector as the same object
  - the passenger makes it while the bag misses (tight connection, unload
    order decides)
  - the passenger misses and the bag is held
  - a no-show's loaded bag is offloaded and held
- **Cutoff:** it does not move with a hold.
- **Congestion:** a sortation backlog forms queues and misses the cutoff.
- **Riverdale morning:** nothing stuck, transfers ≥ 90%, baggage blame only on
  the demo flight.
- **Save/load:** a save at 5 points mid-flow resumes identically; v6 and 6
  kinds of corrupted baggage state are rejected.
- **Determinism:** the same seed gives the same bags and timing.

## Performance

| Scenario | Mean tick | Worst tick | Simulation per 4× frame | Bags | Peak active bags | Peak queue | Baggage step |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Default morning | 179 µs | 3.3 ms | 7.2 ms | 3,684 | 1,046 | 27 | 1.8 µs/tick |
| Baggage-heavy (everyone checks, ⅓ two bags, half the sortation servers) | 231 µs | 4.0 ms | 9.2 ms | 9,889 | 5,984 | 2,775 | 3.4 µs/tick |
| Connection-heavy (40% of arrivals connect) | 176 µs | 3.8 ms | 7.1 ms | 3,204 | 987 | 87 | 1.6 µs/tick |
| 100-flight stress | 452 µs | 3.8 ms | 18.1 ms | 15,194 | 4,224 | 617 | 3.4 µs/tick |

The same machine and session ran M6 (`355e5a0`) at 165 µs for the default
morning and 327 µs for 100 flights; M7 runs at 174 µs and 352 µs
(`airport_benchmark`). Bag processing is under 4 µs per tick even with 10,000
bags. It is plain data plus one heap, with no nodes per bag.

**One bottleneck was measured and fixed.** The first M7 build ran at 264 µs
per tick. A profile showed departure estimates at 117 µs per tick: they walked
every bag of each loading flight. They now use the loader's backlog (queue
plus the bag in hand), which is O(1). Flight updates went from 156 µs to
56 µs per tick. Nothing else was optimized.

**Baggage-heavy is a deliberate overload.** Reclaim delivery gets one server
for 4,500+ local bags, so the reclaim wait averages 70 minutes and 169
transfer bags miss. Congestion is possible, visible and attributed.

## Found along the way

`airport_benchmark` restored the 100-flight run from the in-memory snapshot
instead of JSON. That path fails validation once a flight has a boarding
result, and it already failed at M6 (`355e5a0`, verified in a clean worktree).
The M6 report missed it. Real saves go through JSON and were never affected.
The benchmark now restores through JSON, like a save file.

## Product questions

1. **Can the player understand that passengers and their bags are separate
   things moving through the airport?** **Yes.**
   - Every passenger shows their own *Checked bag: BAG_… · status* lines.
   - A connector shows *Passenger: … / Bag: …* side by side, with separate
     outlooks.
   - The flight shows its own bag counts, separate from passengers at the gate.
   - The Terminal tab shows people at reclaim while the bag lines show the
     bags still being unloaded.
2. **Can a passenger successfully connect while their bag fails for an
   explainable reason?** **Yes.**
   - **Demo C:** P0565 boards AW 228 while BAG_000275 is ready 85 seconds
     after the D-15 bag cutoff, because NS 249 was 18 minutes late.
   - A unit test reproduces the same outcome from unload order alone.
3. **Can baggage congestion visibly delay an aircraft?** **Yes.**
   - **Demo D:** AW 256's gate is closed and everyone is seated, but
     *Holding departure: Baggage load · 75%* holds it 7.6 minutes, and the
     delay breakdown says so.
   - The congestion test shows a sortation backlog making bags miss.
4. **Does a local arriving passenger with checked baggage visibly wait for
   their actual bag before leaving?** **Yes.**
   - **Demo A:** P0098 stands at Reclaim for 5.6 minutes and leaves only when
     their last bag reaches the belt.
   - Unit tests check own-bag and both-bags waits, and that passengers without
     bags walk straight out.

## Limitations

- **Bags are processed logically.** No conveyors, carts or handlers (M8+). The
  unload and load rates are per aircraft type, not per crew.
- **Missed and held bags stop where they are.** No rush tags, rebooking,
  delivery or compensation.
- **Unload order is by bag id,** not by hold position or priority tags.
- **Transfer-bag ETAs before the inbound docks are schedule-based.**
- **The full test suite now takes about 8.5 minutes.**
