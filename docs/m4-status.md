# M4 completion report: aircraft turnaround task framework

Implemented on 2026-09-24 from M3 `56d5d5f`, against [m4-plan.md](m4-plan.md).
Decisions D-025 to D-027. M5 has not started.

## Delivered

- **The opaque timer is gone.** `turnaround_ticks`, `service_before_boarding_ticks`
  and `turnaround_variation_ticks` are removed. Readiness is the completion of
  `TurnaroundTask`s.
- **Generic task model.** Each task has:
  - a stable id (`<flight>:<type>`), flight and type, label and kind
  - `after` and `exclusive_with` relations, and a `required` flag
  - status `PENDING → BLOCKED → READY → RUNNING → COMPLETE`, with a
    `blocked_reason`
  - nominal and actual durations
  - planned and actual start and finish times
  - `started_after`, recording what released it

  `Turnaround` (`scripts/airport/turnaround.gd`) holds the rules. It is not a
  workflow engine: three kinds and two relations are all it has.
- **Data-driven graph** (`riverdale.json` → `turnaround`):
  - `arrival_secured` releases cleaning, catering, fueling and the placeholder
    baggage service, which run concurrently.
  - `boarding` comes after cleaning and catering and is exclusive with fueling.
  - `pushback_ready` comes after boarding, fueling and baggage.
  - Durations are set per aircraft type, with 0–15% seeded variation and
    per-flight `turnaround_overrides`.
- **Boarding is a task.** `flight_boarding.gd` is untouched. Releasing the task
  schedules the M3 window; it is `READY` until D-30, `RUNNING` while open,
  and `COMPLETE` at boarding completion. D-30 open, D-10 close, holds, missed
  passengers, early completion and strategy timing all behave as in M3: the
  whole M3 suite still passes.
- **Late aircraft.** Tasks start at actual docking, so a late arrival shifts
  the entire graph, boarding, gate release and the next gate user.
- **UI.**
  - A "Holding departure" headline, for example *Holding departure: Cleaning ·
    28% · 26 min left*. It follows the pushback milestone's blocked chain down
    to the running work.
  - A one-line turnaround summary.
  - A **Turnaround** tab with all seven tasks: status, start, done, and
    progress or what each is waiting for. ◀ marks the holding task.
  - After takeoff, the additive delay breakdown, for example *Departed
    +10.3 min: Runway queue 0.9 · Cleaning 9.4*.
- **Causality (D-026).** `departure_delay_breakdown` sums exactly to takeoff
  lateness:
  - runway queue
  - hold used
  - a critical-path walk: each task takes its own overrun first and passes the
    rest, up to its own late start, to whatever released it
  - late inbound

  Off-path overruns are never blamed.
- **Save schema v4 (D-027).** Tasks are saved and validated. A save made
  mid-turnaround resumes identically. v3 saves are rejected explicitly.

## Demonstration

Run `tools/ui_tests.sh tests/m4_demo.gd`. It drives the real scene, asserts all
ten steps, and writes `/tmp/m4-demo-01…05*.png`.

```
M4 demonstration · GA 242 · A220 · gate A4 · scheduled 07:00:15
  1  Aircraft docks                         06:15:00
     Arrival secured              06:15:00 → 06:16:00  after gate
     Cleaning                     06:16:00 → 06:51:11  after arrival_secured        (+25.2 min over plan)
     Catering                     06:16:00 → 06:24:51  after arrival_secured        (+0.9 min over plan)
     Fueling                      06:16:00 → 06:26:08  after arrival_secured        (+0.1 min over plan)
     Baggage (placeholder)        06:16:00 → 06:36:25  after arrival_secured        (+0.4 min over plan)
     Boarding                     06:51:11 → 07:05:46  after cleaning
     Pushback readiness           07:05:46 → 07:05:46  after boarding
  9  Departed 07:10:35, +10.3 min
  10 Explanation: Runway queue +0.9 min, Cleaning +9.4 min

  Second flight AW 228: service tasks all done by 06:35:23, boarding opened 06:27:15 (D-30), departed 06:57:35 (Runway queue +0.3 min)
```

Catering, fueling and baggage also ran a little over plan on GA 242, but none
of them was on the critical path, so none is blamed.

## Baseline (full morning, default config, no player action)

| | M3 closeout | M4 |
| --- | --- | --- |
| Late departures (any / > 5 min) | 12 / 0 | 13 / 1 (GA 242 deep clean) |
| Mean delay | 0.5 min | 0.9 min |
| Delay by cause | — | runway queue 9.5 min (11 flights), cleaning 9.4 (1), boarding 2.7 (2) |
| At gate by D-30 / D-10, missed | 88.4% / 99.2%, 0.8% | unchanged |

No placeholder service task delays a flight on its own; the durations fit the
timetable. The only task delay is GA 242's deliberate deep clean.

Strategy benchmark (every cabin flight on one strategy, additive attribution):

| Strategy | Late | Mean delay | Flights delayed by boarding | Boarding delay |
| --- | --- | --- | --- | --- |
| Window / Middle / Aisle | 10 | 0.7 min | 0 | 0.0 min |
| Random | 13 | 0.9 min | 2 | 2.7 min |
| Back to front | 13 | 1.6 min | 4 | 13.7 min |
| Front to back | 16 | 3.8 min | 9 | 49.0 min |

Front to Back's boarding total dropped from 55.4 min in M3 because the
breakdown is now additive: runway minutes are attributed to the runway.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 80 tests, 0 failed; 1,000 standalone deadlock scenarios plus 300 incremental-admission scenarios |
| New `test_turnaround.gd` (13 tests) | dependency ordering; concurrency; fueling/boarding exclusivity; late aircraft shift; boarding waits for prerequisites and completes through the framework; no pushback with a required task incomplete; critical task delay measured; deep clean blamed on cleaning, not boarding; non-critical overlap adds no delay; mid-turnaround save resumes identically; identical task timestamps for the same seed; exact breakdowns for every flight in the full morning; tampered v4 saves rejected |
| M3 regression | all 20 boarding-integration tests pass; their fixture changed only the renamed variation key. Standalone golden baseline (48 runs) identical |
| `tools/ui_tests.sh` | airport UI, terminal UI, M3 demo, M4 demo: 0 failures |
| Benchmarks | see Performance |

## Performance

| Run | M3 closeout | M4 |
| --- | --- | --- |
| Default morning, mean tick | 85–94 µs | 80–88 µs |
| Default morning, worst tick | 2.5–3.2 ms | 2.6–2.9 ms |
| 100-flight stress, mean tick | 260 µs | 202 µs |

The first M4 build cost 327 µs per tick. Every flight's departure estimate
walked the task graph every tick. Three fixes brought it below M3:

- Estimates refresh once per simulated second, alongside the conflict check.
- Flights that haven't docked estimate from two cached offsets, which give the
  same result as the walk.
- Each flight skips task updates until its next possible change.

The cached offsets and wake-tick skipping give exactly the results of the
unoptimized code, by construction. The 1 Hz refresh means an estimate can be up
to one simulated second old between refreshes. Conflict checks read estimates
on the same once-per-second cadence, so they see the same values; only a gate
reassignment made between two refreshes sees an estimate up to one second
stale. There is no further optimization.

## Limitations

- **All service durations are placeholders.** There are no workers,
  vehicles or resources (M8), and no deboarding (M5); the placeholder baggage
  service stands in for unload and load (M7).
- **No failed or cancelled task states.** Nothing needs them yet.
- **Estimates before docking use each task's full duration.** They don't
  foresee exclusivity conflicts.
- **The debug ramp hold is coarse.** It extends the first task if it's
  unfinished, else every running timed task.

## Product question (§13)

> Can the player now look at an aircraft at the gate and immediately understand
> what work is happening, what is waiting, and what is preventing departure?

**Yes.**

- Selecting a docked flight shows a headline naming what is holding departure
  and how long it has left.
- The Turnaround tab shows every task at once: what is running and how far
  along it is, what is done and when, and what each waiting task is waiting
  for (*waiting for cleaning*, *fueling in progress*, *opens 06:27*).
- After takeoff, the delay splits into causes that add up.

GA 242 reads as a complete story without the debug panel. The deep clean held
boarding past D-30, boarding opened the moment cleaning finished, and the
departure was 9.4 minutes late because of cleaning plus 0.9 minutes of runway
queue.

The first build didn't pass this test. The task table sat below the fold of the
details column. It moved into its own tab, with a one-line headline above the
fold.
