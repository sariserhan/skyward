# Simulation

How the boarding simulation works. Code lives in `game/scripts/sim/` and has
no dependency on Nodes or rendering; it runs headless in the test harness.

## Pipeline

```
Scenario (JSON)  ──►  AircraftDef + SimConfig
                          │
PassengerGenerator (seeded) ──► Array[Passenger]
                          │
BoardingStrategy.resolve() ──► queue order, boarding groups
                          │
Simulation.step() × N  ──► passenger states, aisle, seats
                          │
Simulation.result()   ──► totals for the results screen / records
```

`SimRunner` (in `scripts/ui/`) is the only bridge to the frame loop. It steps
the simulation a whole number of ticks per frame according to playback speed,
so speed can never change the outcome.

## Time

Everything is integer ticks at `tick_rate` (30/s). Seconds only appear when
formatting for display. See D-003.

## Aircraft

Loaded from `configs/aircraft/*.json`. `seat_layout` is `"ABC|DEF"`: sides
split by `|`, letters left to right. Seat type is derived from distance to the
aisle (0 = aisle, max = window, else middle). `seats_between_aisle(letter)`
returns the seats a passenger must pass, which drives seat interference.

## Aisle

One cell per row plus an entrance cell (index 0). A cell holds at most one
passenger. Movement is forward only; nobody passes anybody. See D-002.

Each tick, passengers in the aisle are processed front-most first, so a cell
freed this tick can be entered this tick by the passenger directly behind.

## Passenger state machine

```
WAITING ─► QUEUED ─► ENTERING ─► WALKING ⇄ BLOCKED
                                    │ (reaches assigned row)
                                    ▼
                          STOWING (if bags > 0)
                                    ▼
                    WAITING_FOR_SEAT (if obstructed)
                                    ▼
                                 SEATING
                                    ▼
                                 SEATED
```

* **WALKING**: `progress` accumulates one tick at a time. When it reaches
  `walk_ticks_per_cell` the passenger tries to advance. If the next cell is
  occupied they become **BLOCKED** and stay blocked until it frees.
* **STOWING**: lasts `luggage_stow_duration` ticks. The passenger holds the
  row's aisle cell.
* **WAITING_FOR_SEAT**: entered when seats between the aisle and the
  assigned seat are occupied. Lasts `obstruction_count × seat_per_obstructer_ticks`.
  The passenger still holds the aisle cell (D-001).
* **SEATING**: lasts `seat_access_duration` ticks, still holding the cell.
* **SEATED**: cell released, seat marked occupied.

## Door

A passenger enters from the queue when both hold: at least
`entry_interval_ticks` have passed since the last entry, and the entrance
cell is empty (D-005).

## Passenger generation

`PassengerGenerator.generate(aircraft, count, seed, config)`:

1. Shuffle all seats with the seeded RNG and take the first `count`.
2. Sort by row then cabin position so ids read 1A, 1B, … (ids are stable).
3. Per passenger, in a fixed order of RNG draws: walking speed (permille in
   `[speed_min, speed_max]`), bag count (weighted by `bag_weights`), stow
   variation, seat variation. Every draw happens even when unused so the
   stream stays aligned.

`walk_ticks_per_cell = round(config.walk_ticks_per_cell × 1000 / speed)`.

## Strategies

A strategy is an ordered list of groups. Each group has a row range, a set of
seat types (empty = any), and an in-group order (random, back to front,
front to back). A passenger joins the first matching group. Unmatched
passengers go into a trailing `UNASSIGNED` group and a warning is raised.

Presets are expressed in the same format:

| Preset | Groups |
| --- | --- |
| Random | one group, all rows, random |
| Back to Front | rows 21–30, 11–20, 1–10; random within |
| Front to Back | rows 1–10, 11–20, 21–30; random within |
| Window / Middle / Aisle | window, middle, aisle; random within (see D-010) |

In-group ordering shuffles first, then stable-sorts by row when a row order
is requested, so ties within a row are deterministic-random.

## RNG streams

`SimRng` wraps Godot's `RandomNumberGenerator` and exposes integer-only
operations. The seed is mixed with a stream id so manifest generation,
strategy ordering and test fuzzing never share a sequence. `Array.shuffle()`
is banned in the simulation because it uses the global RNG.

## Reference numbers (sim 0.1.0, default config)

Full Flight, 180 passengers, seed 418923:

| Strategy | Time |
| --- | --- |
| Window / Middle / Aisle | 06:56 |
| Random | 08:57 |
| Back to Front | 11:32 |
| Front to Back | 13:07 |

These match the qualitative ordering reported in the boarding literature and
are locked by `test_strategies_produce_different_outcomes`.

## Known simplifications

* Only one passenger per row cell, so two passengers for the same row on
  opposite sides cannot stow at the same time.
* Obstructing seated passengers do not step into the aisle; their movement
  is pure time (D-001).
* No overhead bin capacity (D-004).
