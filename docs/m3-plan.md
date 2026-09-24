# M3 implementation plan: airport ↔ boarding integration

**Status:** implemented 2026-09-24; see [m3-status.md](m3-status.md). Approved
with the Q1–Q5 answers in §10 (D-021, D-022).

Deviations found during implementation:

- **Timetable, start time and security defaults were retuned** (D-023), not
  only passenger arrival leads. The M2 block times could not fit the boarding
  window.
- **`last_seated_tick` was added** on the flight and in `Simulation.result()`.
  The engine completes only when the gate closes, so completion time alone
  does not show strategy performance.
- **The widebody abstraction also uses a service-before-boarding timer**
  (787: 20 min). Its departure therefore follows the same window as cabin
  flights.
- **Closeout (D-024):**
  - realistic data-driven loads
  - airport-only cabin timings
  - security resized
  - early gate close when the whole manifest is aboard
  - a pushback floor of the schedule plus hold used, replacing the shifted
    target
**Governing documents:** `airport_tycoon.md` §9–18 and §50–52; decisions D-013 to D-020.
**Baseline:** commit `026e978`. `./run_tests.sh --quick` gives 42 tests, 0 failed.

M3 connects `waiting_at_gate → boarding → on_aircraft → departed` using the
existing `Simulation` engine and the same `Passenger` objects. Departure then
depends on boarding.

---

## 1. Measured facts the plan relies on

These were measured on the current code (seeds 1–5, default `sim_config.json`,
headless):

| Cabin | Load 45% | Load 90%: WMA / Random / Back-to-front / Front-to-back |
| --- | --- | --- |
| 22 rows × 6 | 2.5–4.1 min | 5.0 / 6.4 / 7.5 / 9.3 min |
| 30 rows × 6 | 3.5–5.3 min | 6.2 / 8.2 / 9.9 / 11.5 min |
| 37 rows × 6 | 3.9–5.8 min | 7.2 / 9.3 / 11.4 / 12.7 min |

At 90% load, the choice of strategy nearly doubles boarding time, so the
strategy signal survives integration.

For the full Riverdale morning as it is today (2,172 passengers), gate arrival
relative to scheduled departure D is:

| Reached gate | Passengers |
| --- | --- |
| before D-30 | 402 (19%) |
| D-30 to D-10 | 736 (34%) |
| after D-10 | 384 (18%) |
| never, before the last departure | 650 (30%) |

The flight timeline shows that `turnaround_ticks` currently fills the whole gate
stay. For example, F001 docks at 06:06:00, its turnaround ends at 06:32:57 and it
pushes back at 06:33:00, while D-30 is 06:06:55.

---

## 2. Conflicts between the decisions and the code

Each of these needs either a plan element (marked **handled**) or a decision from
you (marked **Q**).

- **C1: the save block covers almost the whole scenario (Q1).** Single-aisle
  departures run every 3–18 minutes, and each boarding window lasts about 26
  minutes (D-30 to pushback). Some cabin boarding is therefore active from about
  06:18 to about 08:07, and D-018 would block saving for nearly all of play.
  Engine state is small (`queue`, `queue_index`, `aisle`, `active`,
  `seat_occupied`, `tick`, `seated_count`, `ticks_since_entry`, `completed`), and
  `Passenger.snapshot()` already serializes every cabin field. A cabin snapshot
  is roughly 60 lines plus validation.
- **C2: about half the passengers would miss their flight at D-10 (Q3).** M2
  tuned arrivals without any cutoff: `arrival_lead` is 15–45 minutes and
  `gate_target_buffer_ticks` equals D-10. Default security runs 3 of 8 lanes with
  3 of the 6 staff. Scenario start (06:00) is only 37 minutes before the first
  departure, so early flights cannot have realistic lead times. **Handled** by a
  config retune in step 8; the scenario start is Q3.
- **C3: the turnaround timer overlaps the boarding window (handled).** A single
  timer currently stands for deboarding, service and boarding. For cabin
  flights, M3 splits it: a placeholder pre-boarding service timer
  (`service_before_boarding_ticks`, to be replaced by M4 tasks), then real
  boarding. Boarding opens at
  `max(D − open_offset, service_ready_tick)`, so a late inbound aircraft opens
  boarding late. That is the correct causal chain.
- **C4: what happens at gate close if the player does nothing (Q2).** A modal
  prompt at every gate close would interrupt constantly: 18 single-aisle flights,
  most with someone missing. Proposal: the gate closes automatically at the
  close time unless a hold is active. An alert appears a configurable lead time
  beforehand (default 3 minutes) with **Hold +5 min** and **Close gate now**
  buttons.
- **C5: gate lock is already enforced (handled).** `assign_gate()`
  (`airport_simulation.gd:217`) rejects any status after `taxiing_in`, and
  boarding always happens after docking. D-019 needs no new rule, only a test.
- **C6: cabin mapping (handled, one caveat).**
  - A220: `AB|CDE` × 26 rows = 130 seats exactly (`AircraftDef` already supports
    unequal sides).
  - 737: the existing `narrowbody_30` (`ABC|DEF` × 30 = 180).
  - A321: `ABC|DEF` × 37 = 222 physical seats with 220 sold.
  - Caveat: every cabin uses one front door (D-005), including the A321.
- **C7: the engine assumes the whole manifest boards at setup (handled).**
  `Simulation.setup()` resolves the strategy into one fixed queue. Completion is
  `seated_count >= passengers.size()`. Neither fits passengers who trickle in or
  miss the flight. An additive incremental mode is described in §4.1. The
  standalone path stays byte-identical and `SIM_VERSION` stays `0.1.0`.
- **C8: airport passengers lack cabin attributes (handled).** `PassengerFlow`
  sets `walking_speed` (800–1200) and `carry_on_count` (uniform 0–2) but no seat,
  `walk_ticks_per_cell`, `luggage_stow_duration` or `seat_access_duration`.
  These are derived at generation from the passenger's existing speed and bags,
  using `PassengerGenerator`'s formulas. Draws come from a new RNG stream
  `SimRng.STREAM_CABIN` so that M2's passenger stream, and therefore M2
  outcomes, do not change. Result: one passenger, one walking speed across both
  layers.
- **C9: widebody passengers (Q4).** The 787 keeps the placeholder timer (D-014),
  but its about 124 passengers still need an outcome. Proposal: they use the
  same boarding window, gate close and hold rules. At gate close, everyone at
  the gate becomes `on_aircraft` with no cabin simulation, and the rest miss.
  The departure also waits for the turnaround timer.
- **C10: what D means (handled).** In this code, `scheduled_departure` is
  *takeoff*. Pushback is targeted at D − taxi-out − takeoff (D-3:55 with current
  config). So a D-10 gate close sits about 6 minutes before planned pushback.
  The plan keeps D = scheduled departure for all offsets.
- **C11: 8× airport speed (Q5).** `airport_tycoon.md` §36 says to "preserve" 8×,
  but the airport never had it. `AirportClock.set_speed` accepts 1, 2 and 4, and
  `test_clock_pause_speed_and_backlog` asserts that 8 is rejected. Proposal: out
  of scope for M3 (a one-line change plus a test update if you want it).

---

## 3. Data and schema changes

### `configs/airports/riverdale.json`

```jsonc
"aircraft_types": {
  "A220": { "class": "narrow", "seats": 130, "turnaround_ticks": 15000,
            "cabin": "a220_26", "service_before_boarding_ticks": 7200 },
  "737":  { ..., "cabin": "narrowbody_30", "service_before_boarding_ticks": 9000 },
  "A321": { ..., "cabin": "a321_37",       "service_before_boarding_ticks": 10200 },
  "787":  { ... no "cabin": placeholder timer path ... }
},
"boarding": {
  "open_before_departure_ticks": 18000,      // D-30, airport_ticks
  "gate_close_before_departure_ticks": 6000, // D-10
  "close_warning_ticks": 1800,               // alert 3 min before close
  "hold_increment_ticks": 3000,              // Hold +5 min
  "max_hold_ticks": 9000,                    // at most 15 min of holds per flight
  "default_strategy": "random",
  "boarding_ticks_per_airport_tick": 3       // D-015; validated against SimConfig.tick_rate
},
"flights": [ { ..., "boarding_strategy": "window_middle_aisle", "load_permille": 900 } ]
```

- `load_permille` and `boarding_strategy` on a flight are optional overrides.
- The service values (12, 15 and 17 minutes) are placeholders until M4.
- `passenger_flow` arrival leads and the gate target are retuned in step 8
  (target in §6).

### New cabin configs

- `configs/aircraft/a220_26.json`
- `configs/aircraft/a321_37.json`

### Save schema v3

`AirportSimulation.SAVE_VERSION` goes from 2 to 3. v2 saves are rejected
explicitly, following the v1 precedent in `architecture.md`; there is no
migration. New primitive fields ride the existing `AirportEntity.to_dict()` and
`Passenger.snapshot()` reflection.

- **`AirportFlight`:**
  - `boarding_mode` (`"cabin"` or `"placeholder"`)
  - `boarding_strategy_id`
  - `service_ready_tick`
  - `boarding_open_tick`
  - `gate_close_tick` (current, including holds)
  - `gate_closed_tick`
  - `boarding_complete_tick`
  - `hold_ticks`
  - `boarded_count`
  - `missed_count`
  - `boarding_result: Dictionary` (the engine's `result()`, in boarding_ticks)
- **`AirportAircraft`:** the reserved `seat_map` field now stores the cabin
  config ID.
- **`Passenger`:**
  - Existing seat and cabin-duration fields become populated.
  - New: `boarding_admit_tick` (airport_ticks), `seated_airport_tick`,
    `missed_flight_id`, `missed_reason`.
- **Journey states** (`PassengerFlow.JOURNEY_STATES`): add `boarding`,
  `on_aircraft`, `departed` and `missed_flight`.
- **Flight states** (`AirportSimulation.STATES`): add `boarding` between
  `turnaround` and `ready_for_pushback`.

Save validation (`_valid_snapshot`, `PassengerFlowValidation.valid`):

- Reject any snapshot with a cabin-mode flight in `boarding` or a passenger in
  `boarding` (D-018).
- Validate the new states: `on_aircraft` only for flights at `taxiing_out`;
  `departed` only for departed flights; `missed_flight` only for flights whose
  gate has closed.

---

## 4. Code changes by file

### 4.1 `scripts/sim/simulation.gd`: additive incremental mode

The standalone path through `setup()` keeps its exact behavior.

- New `setup_incremental(aircraft, manifest, strategy, config, seed)`:
  - Resets passengers exactly like `setup()`.
  - Calls `strategy.resolve()` over the whole manifest, so group labels and
    in-group order still come from `STREAM_STRATEGY`.
  - Records `_strategy_rank[id]`.
  - Starts with an empty `queue`.
  - Returns passengers to `WAITING`, because `resolve()` marks them all
    `QUEUED`.
  - Sets `closed = false`.
- New `admit(ids: Array[int])`: sorts by strategy rank, appends to `queue` and
  sets each passenger to `QUEUED`.
  - The adapter calls it once at boarding open with everyone at the gate.
  - After that, it calls it each airport tick with that tick's gate arrivals.
  - Latecomers join the back of the line. Airline boarding policy is not
    modelled further (D-014).
- New `close()`: sets `closed = true`.
- Completion becomes `closed and seated_count == queue.size()`. In standalone
  mode `setup()` sets `closed = true` with the full queue, so completion lands on
  the same tick as today.
- `result()` gains `"admitted": queue.size()`. Other totals are unaffected,
  because passengers who never board keep zeroed diagnostics.

### 4.2 `scripts/sim/sim_rng.gd`

- Add `STREAM_CABIN := 0x4004`.

### 4.3 `scripts/airport/passenger_flow.gd`

- `bind()` receives a cabin lookup (aircraft type → `AircraftDef`).
- `generate()` uses the per-flight `load_permille` override. For cabin flights it
  shuffles `aircraft.all_seats()` with a `STREAM_CABIN` generator in flight
  order and assigns seats. It then derives:
  - `walk_ticks_per_cell` from the existing `walking_speed`
  - `luggage_stow_duration` from the existing `carry_on_count`
  - `seat_access_duration`

  It uses `SimConfig` and the same formulas as
  `PassengerGenerator.generate()`. Those formulas move into a shared static
  helper so the two cannot drift apart.
- `_continue_walk()` for `walking_to_gate`, on arrival:
  - Unchanged behavior, plus appending the passenger ID to
    `gate_arrivals[flight_id]`, which the boarding adapter drains each tick.
  - If the passenger already carries `missed_flight_id`, they settle into
    `missed_flight` at the gate instead.
- `reroute()`: unchanged. The gate lock makes boarding-phase reroutes
  impossible.
- `rebuild_caches()` and `ready_by_flight` recognise the new states.

### 4.4 New `scripts/airport/flight_boarding.gd` (`class_name FlightBoarding`)

This is the adapter for one flight's boarding session. It is a `RefCounted`
with no Node dependencies.

- Holds the `Simulation` engine (cabin mode only), the flight ID and a reference
  to `AirportState`.
- `open(now)`:
  - Builds the manifest from `flight.passenger_ids` (the same objects).
  - Builds `BoardingStrategy.preset(flight.boarding_strategy_id, cabin)`.
  - Calls `setup_incremental`.
  - Admits every passenger in `waiting_at_gate` and sets their journey state to
    `boarding`.
- `step(now)`:
  - Admits the drained gate arrivals.
  - Runs `engine.step()` exactly `boarding_ticks_per_airport_tick` times.
  - Moves each newly seated passenger to `on_aircraft` and sets
    `seated_airport_tick`.
- `close(now)`:
  - Calls `engine.close()`.
  - Flags every passenger not yet admitted with `missed_flight_id` and
    `missed_reason` (their journey state at close).
  - Records `PASSENGER_MISSED_FLIGHT`.
  - People already at the gate cannot be missing, because they are admitted as
    they arrive.
- `finalize()`: copies `engine.result()` into `flight.boarding_result`, then the
  session is dropped.
- Placeholder mode, which has no engine: at close, everyone at the gate becomes
  `on_aircraft` and the rest are flagged as missed.

### 4.5 `scripts/airport/airport_simulation.gd`

- `setup()`:
  - Loads and caches `AircraftDef` per cabin ID.
  - Validates the 3:1 ratio against `SimConfig.tick_rate`.
  - Sets `flight.boarding_mode`, `boarding_strategy_id` and `aircraft.seat_map`.
  - Passes the cabin lookup to `passenger_flow.bind()`.
- `_update_flight()`:
  - `at_gate`: cabin flights use `service_before_boarding_ticks` (plus seeded
    variation); placeholder flights use `turnaround_ticks`.
  - `turnaround`: when done, set `service_ready_tick` and move to `boarding`.
  - New `boarding` branch:
    - Open when `now >= max(D − open, service_ready_tick)`.
    - Close at `gate_close_tick`, or immediately after the flight's
      `close_gate` command.
    - After close, once the cabin engine is complete (placeholder flights also
      need their turnaround timer done), move to `ready_for_pushback`.
  - `ready_for_pushback`: unchanged. It still waits for its scheduled pushback
    time, so boarding that finishes early costs nothing.
  - On pushback, finalize the session. On takeoff, set every `on_aircraft`
    passenger to `departed`.
- `step()` order:
  - `clock → _complete_runway → flights → _start_runway → passenger_flow.step → boarding sessions (flight_order) → conflicts`
  - A passenger who reaches the gate on tick *t* is admitted on tick *t*.
    Readiness is checked on *t+1*.
- New commands, recorded in `decisions` with events so they can be replayed:
  - `set_boarding_strategy(flight_id, strategy_id)`: only before boarding opens.
  - `hold_flight(flight_id)`: only while boarding, within
    `close_warning_ticks` of close or during a hold, and capped by
    `max_hold_ticks`.
  - `close_gate(flight_id)`: only while boarding.
- `_estimate_departure()`: new `boarding` case, based on the gate-close tick and
  engine progress, so estimates stay honest.
- `can_save() -> Dictionary`, and `save_file()` returns `ERR_BUSY` while any
  cabin session exists (D-018).
- `snapshot()` and `from_snapshot()`: version 3, plus the validation in §3.

### 4.6 Delay attribution

The attribution is additive and deterministic from recorded ticks. At pushback,
with `planned = D − taxi_out − takeoff`, lateness beyond `planned` is split into
consecutive segments by which readiness condition was still unmet:

| Segment | Cause key | Meaning |
| --- | --- | --- |
| `planned → service_ready` | existing causes | late inbound, gate wait, turnaround variation |
| portion of `… → gate_closed` covered by player holds | `passenger_hold` | the player's hold decision |
| remainder `… → boarding_complete` | `boarding` | cabin boarding still in progress |

`runway_takeoff_queue` is still added after pushback, as today. The flight
inspector shows `boarding_result` underneath: blocked, stow and seat-wait time
in seconds, plus the top three blockers by seat, carry-ons and blocked seconds.
That is the airport → flight → passenger → cause path from §31.

### 4.7 UI

`scripts/ui/airport/airport_main.gd`:

- **Flight inspector:** a boarding block showing:
  - strategy
  - open and close times
  - boarded / at gate / missing
  - holds used
  - the cause breakdown in minutes
- **Controls:**
  - a strategy picker, enabled until boarding opens
  - **Hold +5 min** and **Close gate now**, enabled per the command rules
  - a **View Boarding** button for cabin flights while boarding
- **Alerts:** "NS 221 · 7 missing · gate closes in 2 min", selectable like the
  existing conflict alerts.
- **Save:** shows `Cannot save while boarding is in progress.` when
  `can_save()` refuses.
- **Passenger details:** add seat, cabin state (`Passenger.state_name()`) and
  missed-flight reason.
- **Terminal view:** `terminal_view.gd` draws `missed_flight` passengers at the
  gate in a distinct colour, and stops drawing `boarding`, `on_aircraft` and
  `departed` passengers at the gate dot.

New `scripts/ui/airport/boarding_overlay.gd`:

- A full-rect modal panel that embeds the existing `AircraftView` bound to the
  session's live `engine`. It is read-only: it observes the authoritative
  simulation and never steps it. `AircraftView` already lays out from
  `aircraft.rows` and `sides`, so the 26- and 37-row and 2|3 cabins render
  without changes.
- A header shows the flight, strategy, and boarded / at gate / missing counts.
- Clicking a passenger shows their ID and seat, which links to passenger
  following.
- The airport keeps running at the selected speed underneath.
- At pushback the overlay shows "Boarding complete" and a summary.

### 4.8 Unchanged

- `scenes/main.tscn`, `main.gd`, `sim_runner.gd`, `strategy_editor.gd`,
  `records.gd` and `playtest_log.gd`.
- Standalone scenarios.
- The runway model.
- `terminal_graph.gd`.
- Security logic.

---

## 5. Work order

Each step ends with `./run_tests.sh --quick` green.

1. **Engine incremental mode.**
   - Before editing, capture golden standalone totals: all 4 presets × 4
     scenarios × 3 seeds.
   - Add §4.1 and the tests T12 and T13.
2. **Cabins and passenger cabin attributes.**
   - Add the two cabin configs, `STREAM_CABIN`, the shared duration helper and
     seat assignment (T15).
   - M2 test expectations must stay unchanged.
3. **Flight boarding state and `FlightBoarding` for cabin flights**, with the
   3:1 stepping (T1, T11).
4. **Gate close, holds, missed passengers and the placeholder path** (T4, T5,
   T6, T14).
5. **Delay attribution and flight metrics** (T2, T3).
6. **Schema v3, the save block and validation** (T10).
7. **UI:** inspector, controls, alerts, overlay, terminal-view states; extend
   the UI smoke tests.
8. **Config retune and demo scenario** (§6, §7). Update the benchmarks.
9. **Full suite, benchmarks, manual playtest, documentation** (§9). Then stop.

---

## 6. Tuning target (step 8)

Retune `passenger_flow` arrival leads, `gate_target_buffer_ticks` (move it to
boarding open) and, depending on Q3, `start_tick`, so that:

- With default security staffing, some flights lose passengers. That keeps the
  security lever meaningful.
- With all six staff sensibly placed, missed passengers are about 2% or fewer
  and most passengers are at the gate by D-30.

`test_passenger_flow.gd` pins these numbers.

---

## 7. Demonstration scenario (`airport_tycoon.md` §51)

The demo is a `configs/airports/riverdale.json` flight override. Proposal: F002,
a 737 at gate A2, with `load_permille: 900`.

- A new optional flight field, `late_passengers: 1`, gives one manifest
  passenger an airport arrival time after gate close. That passenger visibly
  walks to a closed gate and becomes `missed_flight`.
- Everything else is the ordinary live airport, so the reviewer can follow F002
  from docking through the terminal, gate, boarding overlay, pushback, taxi and
  takeoff.
- A scripted headless run of the same flight asserts the 12 steps from §51 in
  order.

---

## 8. Tests and acceptance checks

New suite: `tests/test_boarding_integration.gd`, added to `run_tests.gd`.

| # | Test | Covers |
| --- | --- | --- |
| T1 | One passenger goes terminal → security → gate → `boarding` → `SEATED`/`on_aircraft` → `departed`; `is_same()` holds throughout; event order is correct | §17.1–3, 9; §18 full lifecycle |
| T2 | Same flight with heavy vs no carry-ons: later `boarding_complete_tick`, later pushback, `delay_reasons.boarding > 0` | §17.6; §18 boarding delay |
| T3 | All passengers at the gate before open, 90% load: WMA < Random < Front-to-back boarding duration | §17.4 |
| T4 | A passenger held at a zero-lane checkpoint is never admitted, is flagged missed at close, and the flight departs; boarded + missed = manifest | §17.7–8; §18 missing passenger |
| T5 | A late arrival during a hold boards; a late arrival after close misses | D-017 |
| T6 | A hold moves gate close and pushback by the increment; `passenger_hold` recorded; `max_hold_ticks` enforced; the next flight at that gate records `gate_wait` | D-017 cascade |
| T7 | A gate change before docking reroutes passengers who then board the correct flight; `assign_gate` during boarding is rejected | §18 gate change ×2; D-019 |
| T8 | Two runs with the same seed and the same decisions (strategy change, security change, hold) give identical event histories and `boarding_result`s; different frame pacing gives the same result | §17.12; §18 repeatability |
| T9 | Every boarded ID appears exactly once across all flights and seats; no passenger is in two engines; the engine manifest ⊆ the flight's manifest | §18 no duplication |
| T10 | Save during cabin boarding → `ERR_BUSY`, file untouched. Save just before open → load → run gives the same result as an uninterrupted run. Save after pushback with `on_aircraft` passengers resumes identically. v2 and boarding-state snapshots are rejected | §17.11; §18 save/load |
| T11 | After N airport ticks of boarding, `engine.tick == 3N` | D-015 |
| T12 | Standalone golden totals are unchanged; `SIM_VERSION` is still `0.1.0`; all existing `test_simulation.gd` tests pass | §17.10 |
| T13 | The deadlock sweep is extended with random incremental admission schedules plus close: always terminates | §17.14 |
| T14 | 787 placeholder path: at-gate passengers are `on_aircraft` at close, the rest miss; the departure waits for the timer and the close | D-014; C9 |
| T15 | A220 2\|3 geometry and seat types; A321 222 seats with 220 sold; seats unique per flight | C6 |

Existing tests whose expectations change on purpose:

- `test_airport.gd` `test_flight_lifecycle_and_runway_separation`: the
  transition list gains `"boarding"`.
- Any M1 fixture timing that assumed a single turnaround timer.

These are updates, not deletions.

UI smoke tests (`airport_ui_smoke.gd`, `terminal_ui_smoke.gd`, under xvfb):

- open **View Boarding** and save `/tmp/airport-boarding.png`
- press **Hold +5 min**
- check that save is refused during boarding

Benchmarks (`airport_benchmark.gd`, `passenger_benchmark.gd`): the full morning
with cabins. Report the worst tick cost with the maximum number of concurrent
boarding engines and compare it with the M2 numbers in `docs/m2-status.md`.

---

## 9. Documentation at the end of M3

Update the following, then stop and report before M4:

- `docs/roadmap.md`
- a new `docs/m3-status.md` (the same shape as `m2-status.md`)
- `docs/status.md` pointer
- `docs/architecture.md` (the adapter and tick domains)
- `docs/simulation.md` (flight states, boarding window, delay attribution,
  schema v3)
- `README.md` controls
- `docs/PLAYTEST.md`, if behavior testers see has changed

The report answers `airport_tycoon.md` §52.

---

## 10. Resolved questions

All five recommendations were accepted (D-021, D-022). Q1 changes the plan:
active boarding **is** saved. §3 and §4.5 are amended as follows.

- **Save:** schema v3 serializes each active `FlightBoarding` session: the
  engine fields plus the strategy and cabin ID. Passengers are serialized
  through the existing full `Passenger.snapshot()`. `can_save()` no longer
  refuses during boarding. Validation checks that every passenger with journey
  state `boarding` sits in exactly one session's queue, aisle or seat, and that
  aisle, `active` and `seat_occupied` are consistent.
- **New acceptance criterion:** a run saved halfway through boarding and resumed
  produces the same final seating, boarding completion time, blame totals,
  missed-passenger outcome and flight departure state as uninterrupted play.
  This is test T10b.

The original questions are kept below for the record.

### Original questions

- **Q1, saves (C1).** Keep D-018 even though saving is effectively unavailable
  from about 06:18 to about 08:07? Or approve a minimal cabin snapshot in M3
  (engine fields plus the existing `Passenger.snapshot()`, round-trip tested)?
  *Recommendation:* the minimal snapshot. It is small, and without it save is
  practically unusable during play.
- **Q2, gate close with no player input (C4).** Auto-close at the close time
  unless held, with an alert and buttons beforehand? *Recommendation:* yes.
- **Q3, scenario start (C2).** Move `start_tick` earlier (for example 05:15), so
  that early flights' passengers have realistic lead times and the morning
  builds up? Or keep 06:00 and accept that the first wave is tight?
  *Recommendation:* start earlier.
- **Q4, widebody passengers (C9).** The placeholder path shares the gate-close
  and hold rules, with instant boarding at close? *Recommendation:* yes.
- **Q5, 8× airport speed (C11).** Leave out of M3? *Recommendation:* leave out.
  It is unrelated to integration.
