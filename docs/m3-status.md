# M3 completion report: airport ↔ boarding integration

Implemented on 2026-09-24 against [m3-plan.md](m3-plan.md), with decisions
D-013 to D-024; D-024 covers the closeout pass. M4 has not started.

## Delivered

Terminal passengers now board aircraft through the preserved boarding engine.
The same `Passenger` object goes terminal → security → gate → door queue →
aisle → seat → departed. Its journey state (`airport_state`) and cabin state
(`state`) stay separate (D-016). Departure depends on boarding: a flight pushes
back only after its gate has closed and every admitted passenger is seated, and
never before its scheduled pushback plus any hold used.

- **Real cabin boarding** for the three single-aisle types (D-014):
  - A220: `a220_26`, 26 rows of 2+3 seats, 130 seats
  - 737: `narrowbody_30`, 180 seats
  - A321: `a321_37`, 222 physical seats with 220 sold
- **Widebody boarding abstraction** for the 787 (D-022). Passengers still walk to
  the gate and follow the same window, gate-close and hold rules. At close,
  everyone present boards and the rest miss. It is labelled as an abstraction
  in code, UI and docs.
- **Boarding window:**
  - Opens at D-30.
  - The gate closes as soon as the whole manifest is aboard. Otherwise it
    closes at D-10, automatically unless held.
  - Efficient boarding pays off: a late aircraft that boards quickly departs
    without waiting out its shifted window.
  - A late aircraft shifts the window: the departure target becomes
    service-ready + 30 min.
  - Only passengers physically at the gate are admitted. Latecomers join the
    back of the line while the gate is open.
- **Player levers:**
  - A boarding strategy per flight, selectable until boarding opens.
  - **HOLD +5 MIN**, repeatable up to 15 min, moving both the close time and
    the departure target.
  - **CLOSE GATE**, which cancels any unused hold.
  - An alert 3 minutes before close when passengers are missing. There is no
    modal.
- **Missed flights:**
  - Anyone not boarded at final close gets `missed_flight_id` and
    `missed_reason` (their journey state at close), and a
    `PASSENGER_MISSED_FLIGHT` event is recorded.
  - They keep moving: they finish security and walk to the closed gate, where
    their state becomes `missed_flight`. Nobody teleports. There is no
    rebooking yet.
- **Delay attribution:** pushback lateness beyond the scheduled pushback splits
  additively into `passenger_hold` (hold time used) and then `boarding` (cabin
  still boarding after close). The inspector
  shows the result in seconds and minutes: the last-seated time, total aisle
  blocking, stow and seat-access time, and the top three blocking seats.
- **Inspection:** a full-screen **View boarding** overlay embeds the standalone
  cabin renderer bound to the live airport engine. The airport keeps running
  underneath. Passenger details show seat, bags, cabin state, and the time they
  blocked others.
- **Saving during boarding** (D-021): schema v3 serializes active cabin engines.
  A run saved mid-boarding and resumed reproduces uninterrupted play exactly.
  Tampered sessions are rejected.

## Architecture

- **`Simulation`** (boarding engine) gained an additive incremental mode:
  - `setup_incremental`, `admit` and `close`
  - `snapshot` and `restore`
  - a `last_seated_tick` field in `result()`

  The standalone path is unchanged. A golden baseline of 48 runs (4 scenarios ×
  4 presets × 3 seeds, including a per-passenger seating hash) was captured
  before the change and still matches. `SIM_VERSION` stays `0.1.0`.
- **`FlightBoarding`** (new, `scripts/airport/flight_boarding.gd`) is the
  per-flight adapter. It owns one engine and steps it exactly 3 boarding ticks
  per airport tick (D-015). It also validates saved sessions: queue, aisle and
  seat consistency, the 3:1 tick invariant, and agreement between journey and
  cabin states.
- **`AirportSimulation`:**
  - flight state `boarding` between `turnaround` and `ready_for_pushback`
  - boarding phases `scheduled → open → closed → complete`
  - commands `set_boarding_strategy`, `hold_flight` and `close_gate`, recorded
    as decisions
  - schema v3
- **`PassengerFlow`:**
  - Assigns seats and boarding-tick durations at generation from a separate
    `STREAM_CABIN` RNG stream, so terminal-flow draws are unchanged.
  - Hands gate arrivals to boarding on the same tick.
  - Settles missed passengers at the gate.
- **`PassengerGenerator.apply_cabin_timing`** is the single formula for cabin
  durations, shared by standalone and airport passengers.
- **Loads (D-024)** come from explicit per-flight values, per-airline ranges or
  a scenario range. Draws use `SimRng.STREAM_LOAD`, and the resolved value is
  stored on the flight.
- **Airport cabin timings** use `boarding.sim_config_overrides`. The standalone
  game keeps its own constants.

## Scenario changes (D-023, D-024)

**Timetable (D-023).** At M2 block times, 23 of 24 flights left late (19.6 min
average) whatever the passengers did.

- Waves are now 50 minutes apart.
- Block times are A220 48, 737 51, A321 54 and 787 56 min.
- The morning runs 05:15–09:00.

**Loads (D-024).** The previous flat 45% load meant boarding never touched
punctuality.

- Scenario range 700–900‰, varied by airline: Northstar 720–880, Atlantic
  Wings 700–900, SunJet 820–950, Global Airways 680–860.
- Final per-flight loads range from 694 to 940‰, with a median of about 850.
- 3,981 passengers, up from 2,253.
- Demo flight AW 228 is set explicitly to 900‰ with one late passenger.

**Airport cabin timings (D-024).** These are realistic rather than puzzle-speed:

- 3.3 s between door entries
- 1.8 s per row walked
- 8 s + 10 s per bag to stow
- 11 s per seated passenger who must move

With everyone at the gate when boarding opens, an 85% load boards as follows
(minutes):

| Cabin | Window/Middle/Aisle | Random | Front to Back |
| --- | --- | --- | --- |
| 737 | 17.3 | 21.8 | 30.4 |
| A321 | 19.8 | 24.3 | 33.7 |
| A220 | 13.5 | 15.6 | 21.5 |

**Security, resized for the larger population:**

- 8 staff in the pool; the default is 3 staffed lanes per checkpoint.
- 15-second screening.
- Passengers arrive 45–100 min before D.
- The gate-arrival target is D-30.

## Baseline (full morning, default config, no player action)

Numbers come from `tests/passenger_benchmark.gd`, `tests/baseline.gd` and
`tests/strategy_benchmark.gd`.

| Metric | Default staffing (3+3) | All 8 staff (4+4) | Bad decision: east cut to 1 lane |
| --- | --- | --- | --- |
| At gate by D-30 | 88.4% | 100.0% | 49.6% |
| At gate by D-10 | 99.2% | 100.0% | 51.3% |
| Missed flight | 0.8% (5 flights) | 0.0% (1 = demo passenger) | 48.7% (13 flights) |
| Security wait p50 / p90 / p99 / max | 4.4 / 30.9 / 33.4 / 33.8 min | 0.1 / 1.2 / 2.9 / 3.3 min | 1.0 / 134.2 / 180.1 / 185.3 min |
| Late departures (any / > 5 min) | 12 / 0 | 12 / 0 | 12 / 0 |
| Mean delay | 0.5 min | 0.5 min | 0.5 min |
| Flights delayed by boarding | 2 | 2 | 2 |

Most "late" departures are seconds to about 2 minutes of runway queue or
turnaround variation.

Flights do not wait for missing passengers unless the player holds them
(D-017). Security failures therefore cost passengers, not punctuality. A hold
trades one for the other. On AW 228, holding for its late passenger used
4.6 min and cost 6.4 min of departure, because the flight also lost its runway
slot.

## Does efficient boarding pay off?

**Yes.** `tests/strategy_benchmark.gd` applies each strategy to every cabin
flight over the full morning:

| Strategy on every flight | Late (any) | Mean delay | Flights delayed by boarding | Boarding delay total | Last seated p50 / max |
| --- | --- | --- | --- | --- | --- |
| Window / Middle / Aisle | 10 | 0.4 min | 0 | 0.0 min | 18.6 / 22.7 min |
| Random (default) | 12 | 0.5 min | 2 | 2.7 min | 21.2 / 28.2 min |
| Back to front | 12 | 1.0 min | 4 | 13.7 min | 24.9 / 33.7 min |
| Front to back | 17 | 2.8 min | 9 | 55.4 min | 27.5 / 38.5 min |

- Default play sees boarding delay an occasional flight by a few minutes.
- A good strategy removes that delay.
- A bad strategy makes 9 of 18 cabin flights late.
- Early close adds recovery: a late aircraft that boards fast leaves as soon as
  it is ready (`test_efficient_boarding_recovers_late_aircraft_delay`).

## Early completion

- **Whole manifest aboard:** the gate closes on the tick the last passenger sits
  down (`GATE_CLOSED` with `by: all_aboard`) and boarding completes
  immediately. An on-time flight still pushes back at its scheduled time, never
  earlier. A late flight goes as soon as it is ready. An unused hold is
  cancelled; only the hold time actually used delays departure.
- **Anyone missing:** D-10, the alert and HOLD/CLOSE behave as before.
- **Widebody abstraction:** it closes as soon as everyone booked is at the
  gate.

Regression tests:

- `test_everyone_aboard_closes_gate_early`
- `test_missing_passenger_keeps_scheduled_close_and_hold_decision`
- `test_efficient_boarding_recovers_late_aircraft_delay`
- `test_widebody_closes_when_everyone_is_at_gate`
- the updated hold tests

## Demonstration (airport_tycoon.md §51)

Run `tools/ui_tests.sh tests/m3_demo.gd`. It drives the real airport scene,
asserts the steps in order from the authoritative event history, and saves
`/tmp/m3-demo-01…07*.png`. The manual walkthrough is in
[PLAYTEST.md](PLAYTEST.md).

```
M3 demonstration · AW 228 · 737 · 162 passengers · strategy random
  1  Aircraft arrives at gate              06:09:00
  2  Passengers pass security              05:19:45
  3  Passengers walk to gate               05:21:08
  4  Boarding opens                        06:27:15
  5  Passengers queue at the door          06:27:15
  6  Cabin simulation seats passengers     06:27:36
  8  Last passenger seated                 06:50:04
     Gate closes (late passenger missing)  06:47:15
     Late passenger missed                 06:47:15
  9  Boarding complete                     06:50:04
  10 Pushback                              06:53:20
  11 Taxi                                  06:53:20
  12 Takeoff / departed                    06:57:35
     Late passenger reaches closed gate    06:50:39
  7  Carry-ons / seat interference: aisle blocked 6354 s, stowing 2365 s, seat-access waits 715 s
     seat 12E (2 bags, 1 obstructing) held up the aisle 397 s
     seat 13A (2 bags, 0 obstructing) held up the aisle 326 s
     seat 7B (2 bags, 1 obstructing) held up the aisle 271 s
  Late passenger P0274: reached airport 06:47:15, missed (not arrived at close), stands at gate A2
```

With Window/Middle/Aisle, AW 228's last passenger sits down at 06:48:04 instead
of 06:50:04.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 67 tests, 0 failed, 153 s; 1,000 standalone deadlock scenarios plus 300 incremental-admission scenarios |
| Standalone golden baseline | 48 runs identical to the pre-M3 capture; `SIM_VERSION` 0.1.0 |
| `tools/ui_tests.sh` | airport UI smoke, terminal UI smoke and M3 demo: 0 failures. Ran from a clean state, fetching libXcursor and libXinerama into `.cache/` |
| `tests/passenger_benchmark.gd` | Both staffing runs: every passenger departed or missed; up to 6 concurrent cabin engines; JSON restore valid |
| `tests/strategy_benchmark.gd` | Table above |
| `tests/airport_benchmark.gd` | 24 flights: all departed. 100-flight stress: 55 departed; snapshot valid |
| Linux release export | Builds and launches the airport. Scene override is rejected by release builds, as documented in PLAYTEST.md |

M3 acceptance criteria (`airport_tycoon.md` §17 and D-021) map to tests in
`test_boarding_integration.gd`:

| Criterion | Test |
| --- | --- |
| Lifecycle, same object and stable ID | `test_full_lifecycle_same_passenger_object` |
| Strategy affects boarding | `test_boarding_strategy_changes_boarding_time` |
| Slow boarding causes a real departure delay | `test_slow_boarding_delays_departure` |
| Efficient boarding recovers delay; early close | `test_efficient_boarding_recovers_late_aircraft_delay`, `test_everyone_aboard_closes_gate_early` |
| No teleporting; late passengers can miss | `test_passenger_in_security_never_boards`, `test_hold_lets_late_passengers_board_and_costs_delay`, `test_missing_passenger_keeps_scheduled_close_and_hold_decision` |
| Holds: limit, early close, cascade to the next flight at the gate | `test_hold_limit_and_early_close`, `test_hold_cascades_to_next_flight_at_gate` |
| Gate change before boarding; lock during boarding | `test_gate_change_before_boarding_and_lock_during_boarding` |
| Determinism, including frame pacing | `test_same_seed_and_decisions_reproduce_everything` |
| No duplication across a full morning | `test_full_morning_no_duplicate_or_lost_passengers` |
| Mid-boarding save reproduces the uninterrupted outcome | `test_save_mid_boarding_resumes_identically` |
| Saving during boarding; rejects v2 and tampered saves | `test_save_file_during_boarding_and_rejections` |
| 3:1 tick relationship, including late aircraft | `test_three_boarding_ticks_per_airport_tick`, `test_late_aircraft_opens_boarding_on_service_tick` |
| Widebody abstraction | `test_widebody_boarding_abstraction`, `test_widebody_closes_when_everyone_is_at_gate` |
| Cabin geometry and seat assignment | `test_cabin_definitions_and_seat_assignment` |
| No new deadlock path | `test_incremental_admission_terminates` |

## Performance

These are the final numbers with 3,981 passengers. They are deliberately not
optimized; the next profile comes after M4/M5.

| Run | Mean tick | Worst tick | Events |
| --- | --- | --- | --- |
| Default morning | 85–94 µs | 2.5–3.2 ms | 27 k |
| 100-flight stress | 260 µs | 2.8 ms | — |

- Up to 6 concurrent cabin engines.
- At 4×, a mean tick is about 3.4–3.8 ms of simulation per frame, well inside a
  16 ms frame.
- The worst tick fits even at 1×.
- For comparison, M2 averaged 26 µs with 2,172 passengers.

## Limitations

- **One front door on every cabin, including the A321** (D-005). Latecomers
  join the back of the line; no airline boarding-policy model (D-014).
- **Service before boarding is a placeholder timer.** Deboarding, cleaning and
  the rest arrive as M4 turnaround tasks.
- **Missed passengers are not rebooked.** They still use security capacity on
  their way to the closed gate.
- **Airport saves have no report tool yet**; PLAYTEST.md explains reading them.
  The standalone prototype runs from source only, because release exports
  can't switch scenes.
- **The 100-flight stress schedule can't finish in 6 hours** (55 of 100
  depart). That is expected for its synthetic overlap.
- **Airport speeds stay 1×, 2× and 4×** (D-022).

## Product question (§52)

> Does connecting the detailed boarding engine to the live airport make the
> airport feel more alive and make delays more understandable?

**Yes.**

- Every narrowbody visibly boards. **View boarding** shows the same people who
  cleared security jammed behind a passenger stowing two bags. The late
  passenger walking up to a closed gate is the clearest single moment in the
  game so far.
- A late departure reads as a chain in the flight inspector: held → boarding
  still in progress → seat 12E, 2 bags, held the aisle for 397 s.
- After the closeout, boarding also matters to operations. Loads are realistic,
  cabins are paced realistically, and fast boarding releases the aircraft:
  - Default play: boarding delays an occasional flight.
  - Window/Middle/Aisle: no boarding delays.
  - Front-to-Back: half the cabin flights are late.
