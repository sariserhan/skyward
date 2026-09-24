# Decisions

Architecture and design decisions for BOARDING. Each entry records what was
decided, why, and what it constrains. Newest at the bottom. Do not delete
entries; supersede them with a new entry that references the old one.

Decisions here refine `spec.md`. Where they conflict, this file wins.

---

## D-001 — Seat interference blocks the aisle

**Date:** 2026-09-18
**Status:** Accepted

A passenger who reaches their assigned row keeps occupying that row's aisle
cell until they transition to `SEATED`. This covers luggage stowing, waiting
for obstructing seated passengers, and the seating action itself.

State flow at the assigned row:

```text
WALKING
  ↓ reaches assigned row
STOWING              (only if carry_on_count > 0)
  ↓
WAITING_FOR_SEAT     (only if seated passengers obstruct access)
  ↓
SEATING
  ↓
SEATED
```

The aisle cell is held for the whole of `STOWING`, `WAITING_FOR_SEAT`, and
`SEATING`. Everyone behind is blocked for that duration.

Obstructing passengers are not modelled as standing up into the aisle. Their
"moving out of the way" is represented purely as time added to the arriving
passenger's delay, in a single aisle cell.

**Why:** This is what makes boarding order matter. Bad order causes more seat
interference, which causes longer aisle blockage, which propagates the queue
backward and lengthens total boarding time. Without it, Window/Middle/Aisle
would lose most of its advantage and seat ordering would be cosmetic.

---

## D-002 — One aisle cell per row

**Date:** 2026-09-18
**Status:** Accepted

The aisle is an ordered list of cells: one entrance cell followed by one cell
per row. A cell holds at most one passenger. Passengers only move forward and
cannot pass through an occupied cell.

Walking speed is expressed as the number of ticks needed to cross one cell.

**Why:** Simplest model that produces deterministic congestion. Sub-row
resolution adds complexity without changing strategy outcomes. Wide-body
aircraft will need a graph model later and will replace this, not extend it.

---

## D-003 — Integer ticks for all simulation time

**Date:** 2026-09-18
**Status:** Accepted

Every simulation duration (walk time per cell, stow time, seat-access delay,
door entry interval, timers, totals) is an integer tick count. Seconds are a
presentation concern derived from the tick rate at render time. No float
arithmetic in the simulation core.

**Why:** The spec requires server-side replay verification later. Integer
arithmetic is bit-identical across platforms and Godot versions, so a replay
on a server will match the client without special handling. Retrofitting this
after float timing is in place would be painful.

---

## D-004 — No overhead bin capacity in V1

**Date:** 2026-09-18
**Status:** Accepted

Overhead bins have unlimited capacity. "Carry-On Chaos" is expressed only
through bag probability and stow times.

Aircraft and simulation config must leave room to add per-row or per-section
bin capacity later without a schema break.

**Why:** Bin capacity is the most obvious lever after the prototype gate, but
it adds a second congestion mechanism that would muddy the first playtest.

---

## D-005 — Door entry is rate-limited and gated on the entrance cell

**Date:** 2026-09-18
**Status:** Accepted

Two rules govern entry from the boarding queue:

1. A configurable minimum number of ticks must pass between consecutive
   entries.
2. No passenger enters while the entrance cell is occupied.

Both are config values, not code constants.

**Why:** The spec requires the door to be a constrained resource. Two explicit
rules are easier to balance and test than an implicit one.

---

## D-006 — Headless simulation core first, rendering second

**Date:** 2026-09-18
**Status:** Accepted

Implementation order is: simulation core and test harness, then all five
strategies passing tests with 180 passengers, then rendering and UI on top.
Milestone 1 (static aircraft render) may proceed in parallel since it is
small and independent.

**Why:** The spec's architecture rule already requires the simulation to run
without graphics. Building it first guarantees the rule holds and means the
results screen numbers are trustworthy from day one.

---

## D-007 — Personal bests are keyed on simulation version

**Date:** 2026-09-18
**Status:** Accepted

Saved records store the simulation/config version alongside `best_time`,
`strategy`, and `attempt_count`. A record from an older version is shown as
historical and does not count as the current best.

**Why:** Balancing changes alter outcomes. Without versioning, old records
become unbeatable and the retry loop breaks.

---

## D-008 — Plain Godot headless test runner

**Date:** 2026-09-18
**Status:** Accepted

Tests run as a plain GDScript entry point under `godot --headless`. No test
framework addon initially. Revisit if reporting or test discovery becomes
painful.

**Why:** Zero dependencies to keep in sync with the Godot version, and the
test list in the spec is small enough to manage by hand.

---

## D-009 — Godot version is pinned in the repo

**Date:** 2026-09-18
**Status:** Accepted

Target the latest stable Godot 4.x at the time implementation starts. Once
installed, pin the exact version in the repo (a `.godot-version` file and the
`config/features` entry in `project.godot`) so development and CI use the
same build.

**Why:** Determinism guarantees only hold across identical engine builds.

---

## D-010 — Window/Middle/Aisle preset orders randomly within groups

**Date:** 2026-09-18
**Status:** Accepted

The Window / Middle / Aisle preset boards the window group, then middle,
then aisle, with random order inside each group. Strict back-to-front
ordering inside the groups is available in the custom editor but is not the
preset default.

Measured on Full Flight across five seeds (sim 0.1.0):

| In-group order | Avg time (ticks) |
| --- | --- |
| Random | 12,667 |
| Back to front | 18,153 |
| Front to back | 26,158 |
| (Random boarding, for reference) | 17,056 |

**Why:** Strict back-to-front inside a group sends consecutive passengers to
adjacent rows, so each one stops directly behind the previous one's stowing
and the whole group serialises. Random spreads stops along the aisle. This
matches the boarding literature, where interleaved orders beat contiguous
ones. With back-to-front inside groups the preset was slower than random
boarding, which would have hidden the strategy signal the prototype exists
to test.


## D-011 — Airport M0/M1 around the preserved boarding core

**Date:** 2026-09-22
**Status:** Accepted

`docs/additional_spec.md` expands the product into airport operations. The default
scene is now Riverdale; `scenes/main.tscn` remains the boarding prototype.
Simulation/render separation, integer ticks, seeded streams and boarding behavior
are retained. The canonical Passenger class gains enclosing airport journey
fields; there is no second passenger class. M1 uses timed turnarounds and reserves
passenger/bag registries. Integration into boarding is M3, after M2 terminal flow.
See `architecture.md`, `simulation.md`, `roadmap.md` and `status.md` for the airport
contract and current scope. Earlier boarding-specific decisions still apply to
the boarding engine, not to the new aircraft/runway time scale.


## D-012 — Event-scheduled terminal flow on canonical passengers

**Date:** 2026-09-22
**Status:** Accepted

M2 reuses Passenger identity and adds full live-state snapshot/restore separately
from its compact boarding-record serialization. A stable min-heap schedules
terminal transitions on the airport clock. Weighted graph routing is independent
of rendering, and gate changes preserve the current walking edge. Checkpoints
use FIFO queues and non-interrupting lane closure, with a finite six-person staff
pool. Schema v2 persists active journeys and rejects old/inconsistent snapshots.
Gate-arrival targets measure security consequences; M3 will make boarding and
departure readiness consume these same passengers.


## D-013 — `airport_tycoon.md` supersedes the roadmap from M3 onward

**Date:** 2026-09-24
**Status:** Accepted

`airport_tycoon.md` is the product direction and roadmap for M3 and later.
`docs/additional_spec.md` stays as historical implementation context for M0–M2.
Where the two conflict for M3+, `airport_tycoon.md` wins. Decisions in this file
still refine both. Both files carry a precedence note at the top.

**Why:** Two overlapping specs would pull later work in different directions.


## D-014 — M3 real boarding covers single-aisle aircraft only

**Date:** 2026-09-24
**Status:** Accepted

The boarding engine runs real cabin boarding only for aircraft types that map to
a single-aisle cabin definition: the 130-, 180- and 220-seat classes. The
276-seat widebody keeps a placeholder timer. Twin-aisle boarding is not built in
M3. The mapping is data: an aircraft type with a cabin reference boards in the
cabin engine; one without uses the placeholder.

M3 does not try to model airline boarding policy precisely. Its goal is to prove
that real terminal passengers enter the existing cabin simulation and that the
resulting boarding performance changes airport operations.

**Why:** The engine models one aisle and one door (D-002, D-005). Extending it to
twin aisles is a separate piece of work that M3's proof does not need.


## D-015 — Two tick domains with a fixed 3:1 relationship

**Date:** 2026-09-24
**Status:** Accepted

- Airport simulation: 10 Hz (`AirportClock.TICKS_PER_SECOND`).
- Boarding simulation: 30 Hz (`SimConfig.tick_rate`).
- Every airport tick advances each active boarding simulation by exactly three
  boarding ticks.

Code distinguishes `airport_ticks` and `boarding_ticks` wherever both can appear.
Player-facing diagnostics never show a bare "ticks"; the UI normally converts
both to seconds or minutes. The airport refuses a boarding configuration whose
tick rate is not an integer multiple of the airport rate.

**Why:** An integer ratio keeps both simulations deterministic with no rounding
drift. Blame numbers are only comparable once their unit is explicit.


## D-016 — Journey state and cabin state stay separate on one passenger

**Date:** 2026-09-24
**Status:** Accepted

`Passenger.airport_state` is the journey layer (`waiting_at_gate`, `boarding`,
`on_aircraft`, `departed`, `missed_flight`, …). `Passenger.state` is the cabin
layer (`QUEUED`, `WALKING`, `STOWING`, `WAITING_FOR_SEAT`, `SEATED`, …). They
are not merged. The same object and ID moves through both; no second passenger
class is introduced (extends D-011, D-012).


## D-017 — Boarding window, gate close and player holds

**Date:** 2026-09-24
**Status:** Accepted

Boarding opens about D-30 and the gate normally closes about D-10, where D is the
flight's scheduled departure. Both offsets are configuration values, not
constants in UI code. Passengers board only after they are physically at the
gate. Late arrivals may board while the gate is open.

At gate close, if passengers are missing, the player chooses to **close the
gate** or **hold the flight**. A hold is a fixed increment (for example
`Hold +5 min`) up to a configured maximum. The system never waits indefinitely.
A hold has a direct cost: departure delay keeps accumulating, and the aircraft
keeps its gate and its runway slot moves later. Missing passengers who arrive
during an active hold can board. Anyone not boarded when the gate finally closes
becomes `missed_flight` and a `PASSENGER_MISSED_FLIGHT` event is recorded. They
never teleport. Rebooking is not part of M3.

Normal load factors stay data-driven. Demonstration and test flights run at
roughly 85–95% load so that carry-ons, aisle congestion, seat interference and
strategy produce visible differences. Every flight is not forced to 95%.


## D-018 — No saving while a cabin boarding is in progress (M3)

**Date:** 2026-09-24
**Status:** Superseded by D-021

In M3, saving is refused while any flight is actively boarding, with the message
`Cannot save while boarding is in progress.` Cabin snapshots are not implemented
in M3. Loading still rejects any snapshot that claims an active boarding.


## D-019 — Gate locked once boarding opens

**Date:** 2026-09-24
**Status:** Accepted

Once boarding opens, the flight's gate is locked; gate reassignment during
boarding is not supported in M3.


## D-020 — Post-M3 milestone order

**Date:** 2026-09-24
**Status:** Accepted

M3 boarding integration → M4 turnaround task framework → M5 deboarding plugged
into that framework → M6 connecting passengers → M7 baggage → M8 operational
resources → M9 airlines/contracts → M10 economy → M11 construction/expansion.

**Why:** Deboarding, cleaning, catering, fueling and baggage loading are all
turnaround tasks. Building the task framework first avoids implementing those
activities and then restructuring them immediately afterward.


## D-021 — Active boarding is saved and restored (schema v3)

**Date:** 2026-09-24
**Status:** Accepted (supersedes D-018)

Saving is not blocked during boarding. Schema v3 serializes each active cabin
engine (queue, aisle, seat occupancy, counters, strategy) next to the existing
full `Passenger.snapshot()`. Restoring mid-boarding must reproduce the outcome of
uninterrupted play: final seating, boarding completion time, blame totals,
missed passengers and flight departure state. Save determinism is an M3
acceptance criterion with its own regression test.

**Why:** Boarding windows overlap almost continuously from about 06:18 to 08:07,
so a save block would make saving unusable during play. Engine state is small,
and cabin fields on `Passenger` were already serialized.


## D-022 — Gate close defaults, scenario start, widebody abstraction, speeds

**Date:** 2026-09-24
**Status:** Accepted

- **Gate close:** at D-10 the gate closes automatically unless the player has
  explicitly held the flight. There is no modal. An alert appears several
  minutes before close, and the flight UI offers `CLOSE` and `HOLD +5 MIN`.
  Holds add measurable departure delay and repeat only up to a configurable
  maximum.
- **Scenario start:** the Riverdale morning starts at about 05:15. Passenger
  arrivals are retuned around real boarding cutoffs. The target is that most
  passengers arrive in reasonable time, congestion and bad decisions can still
  make passengers late or cause missed flights, and the baseline does not
  produce mass missed flights before the player has acted. The final baseline
  (at gate by D-30 and by D-10, missed, security wait distribution) is measured
  and documented.
- **Widebody boarding abstraction:** 787 passengers still walk to the gate and
  follow the D-30, D-10 and hold rules. At final close, passengers present
  become `on_aircraft` and absent ones `missed_flight`. The aircraft still
  respects service, boarding and departure dependencies. This is labelled
  *widebody boarding abstraction* in code and docs, and is not the final
  simulation.
- **Speeds:** airport speeds stay 1×, 2× and 4×, and the existing rejection test
  for 8× is kept. The standalone boarding game keeps its own 8×.


## D-023 — Riverdale retimed around the boarding window

**Date:** 2026-09-24
**Status:** Accepted

M3 tuning showed that the M2 timetable could not fit dock, service and a
30-minute boarding window. 23 of 24 flights left late (19.6 min average) whatever
the passengers did.

- Waves are now 50 minutes apart.
- Arrival-to-takeoff block times are A220 48, 737 51, A321 54 and 787 56 min.
- The morning starts at 05:15.
- Placeholder service before boarding is A220 12, 737 15, A321 17 and 787 20 min,
  until the M4 turnaround tasks replace it.
- Security defaults to two staffed lanes per checkpoint (4 of 6 staff) with an
  18-second screening.
- Passengers arrive 45–100 minutes before departure, and the gate-arrival target
  is D-30.

Demo flight F002 runs at 90% load with one late passenger. Measured baselines
are in `m3-status.md`.

**Why:** Designed around the real cutoffs, as D-022 asks. The baseline misses
0.5% of passengers without player action. Bad staffing decisions miss around 40%.
Full staffing misses none. Flights stay punctual unless the player holds them.


## D-024 — M3 closeout: realistic loads, airport cabin timings, early gate close

**Date:** 2026-09-24
**Status:** Accepted

- **Loads.** Airport load factors are data-driven: an explicit per-flight
  `load_permille`, else a deterministic draw from the airline's range, else the
  scenario range. Riverdale uses 700–900‰ overall, with Northstar 720–880,
  Atlantic Wings 700–900, SunJet 820–950 and Global Airways 680–860.
  Low-load scenarios remain possible through the same keys.
- **Airport cabin timings.** Riverdale applies realistic cabin timings through
  `boarding.sim_config_overrides`:
  - door entry every 100 boarding ticks
  - 54 ticks per row walked
  - stow 240 + 300 per bag (±90)
  - 330 ticks per seated passenger who must move

  With everyone at the gate when boarding opens, an 85% 737 takes 21.8 min with
  Random, 17.3 with Window/Middle/Aisle and 30.4 with Front-to-Back; an A321
  takes 24.3 with Random. The standalone puzzle keeps its faster
  `sim_config.json` and golden baseline.
- **Security.** Capacity is resized for the larger population: staff pool 8,
  default 3 staffed lanes per checkpoint, 15-second screening.
- **Early gate close.** When the whole manifest is aboard, the gate closes
  immediately. Pushback then follows once `D + hold used − exit` is reached, so
  a late aircraft that boards quickly departs as soon as it is ready. With
  passengers missing, the D-10 close and the HOLD/CLOSE decision are unchanged.
  An unused hold is cancelled on early close; only the hold used delays the
  departure.

**Why:** At 45% load and puzzle-speed cabins, boarding never affected
punctuality, and strategy differences had no operational effect. With these
settings, default play sees boarding delay an occasional flight. Window/Middle/
Aisle removes that delay; Front-to-Back produces widespread lateness.
Measurements are in `m3-status.md`.


## D-025 — Turnaround is a small task graph, not a timer

**Date:** 2026-09-24
**Status:** Accepted

The service-before-boarding timer (`turnaround_ticks`,
`service_before_boarding_ticks`, `turnaround_variation_ticks`) is removed.

**Model.**

- Each flight owns `TurnaroundTask` entities built from the scenario's
  `turnaround.tasks` list, which must be in topological order.
- Statuses: `PENDING` (not at the gate) → `BLOCKED` (with a reason) → `READY`
  (boarding only, waiting for its window) → `RUNNING` → `COMPLETE`. No failed or
  cancelled states yet.
- Three kinds:
  - `timed`: a seeded duration, with 0–15% variation per task and optional
    per-flight `turnaround_overrides`.
  - `boarding`: the M3 window, unchanged, driven by `AirportSimulation`.
  - `milestone`: `pushback_ready`.
- Two relations: `after` (prerequisite) and `exclusive_with` (the two tasks
  may not overlap; recorded on both). There is nothing else; this is not a
  workflow engine.

**Riverdale graph.**

```
arrival_secured → cleaning, catering, fueling, placeholder_baggage_service
                  (concurrent)
boarding: after cleaning + catering; exclusive with fueling
pushback_ready: after boarding, fueling, placeholder_baggage_service
```

Task durations reproduce the M3 service timings on the boarding path.

**Status meaning.** `turnaround` means the boarding task hasn't started;
`boarding` means it has; `ready_for_pushback` means the milestone is complete.
Pushback also still waits for scheduled pushback plus any hold used (D-024).

**Why:** The player must be able to see what work is happening, what is
waiting, and what is preventing departure. Deboarding, baggage and resources
(M5–M8) plug in as tasks.


## D-026 — Additive departure-delay breakdown along the critical path

**Date:** 2026-09-24
**Status:** Accepted

At takeoff, `AirportFlight.departure_delay_breakdown` splits takeoff lateness
into causes that sum exactly to it. It is built in order:

1. Runway queue before the takeoff roll.
2. The hold used.
3. A walk back from `pushback_ready` along what released each task
   (`started_after`). Each task is blamed first for its own overrun beyond its
   planned duration; the rest, up to its own late start, passes to its releaser.
   Lateness that reaches the gate is `late_inbound`.

Off-critical-path overruns are never blamed. M1's `delay_reasons` stay as they
were: overlapping causal durations that are not additive. They are not
repurposed.


## D-027 — Save schema v4

**Date:** 2026-09-24
**Status:** Accepted

v4 adds `AirportState.turnaround_tasks` and flight fields:

- `task_ids`
- `turnaround_overrides`
- `takeoff_wait_ticks`
- `departure_delay_breakdown`

It removes `AirportFlight.turnaround_ticks`. v3 saves are rejected explicitly.
Loading validates:

- task shape, ownership and graph order
- statuses against flight state and boarding phase
- timing (nothing finishes in the future; a running task is not overdue)
- that prerequisites are complete before a dependent runs

A save made mid-turnaround resumes to the identical outcome.

Derived caches (per-flight task lists, pre-docking estimate offsets, next-wake
ticks) are rebuilt after loading, not saved.


## D-028 — Arriving passengers are the same canonical passengers

**Date:** 2026-09-24
**Status:** Accepted

**Inbound manifests.** Each flight has an inbound manifest
(`inbound_passenger_ids`) of real `Passenger` objects, generated after every
outbound passenger from their own stream (`SimRng.STREAM_INBOUND`):

- load: the airline's range, drawn per flight
- seats
- speed, carry-ons, and deboarding timings

Outbound ids and draws are unchanged. Arrivals are marked
`journey_direction = "arriving"`.

**Journey.** `on_aircraft` → `deboarding` → `walking_to_exit` → `left_airport`,
entering the terminal at the gate. Cabin states stay separate: new
`Passenger.State` values `LEAVING_SEAT`, `RETRIEVING_BAGS` and `EXITED` are
appended to the enum. Passengers are never despawned at the gate or respawned in
the terminal.

**Scope.** All arrivals are local in M5. `connection_flight_id` already exists,
so M6 can route some arrivals onward without replacing deboarding.

**Why:** Continuity: the person who leaves seat 15F is the person who walks out
of Riverdale, and later the person who makes or misses a connection.


## D-029 — Deboarding engine and turnaround task

**Date:** 2026-09-24
**Status:** Accepted

**Engine.** `DeboardingSimulation` is a new pure-logic engine. It is separate
from the preserved boarding `Simulation` and uses the same cabins and aisle
model (D-002), moving toward the door.

- Per row side, only the seated passenger nearest the aisle gets up.
- Seat leavers take a free aisle cell before walkers from behind, so rows ahead
  empty first. Retrieving bags occupies the cell.
- Walkers never pass. The door releases one passenger per interval.

**Timings** are airport config (`deboarding`), in boarding ticks:

| Setting | Value |
| --- | --- |
| Get up | 2 s + 0–2 s |
| Step into the aisle | 1 s |
| Retrieve bags | 4 s + 5 s per bag + 0–2 s |
| Walk per row | 1.3 s |
| Door interval | 1.5 s |

Seeded variation applies only to getting up and to bags. `FlightDeboarding`
steps it 3:1 like boarding. A flight can override timings with
`deboarding_overrides`; demo SJ 235 has a 6-second jet-bridge door.

**Widebody deboarding abstraction.** For the 787, the task runs its configured
duration (12 min), then every inbound passenger enters the terminal together.

**Turnaround graph.**

```
arrival_secured → deboarding, fueling, placeholder_baggage_service
deboarding → cleaning, catering → boarding (exclusive with fueling)
pushback_ready ← boarding, fueling, baggage
```

Deboarding is planned at A220 6, 737 8, A321 9.5 and 787 12 min. Cleaning and
catering shrink to fit the D-30 window:

| Task | A220 | 737 | A321 | 787 |
| --- | --- | --- | --- | --- |
| Cleaning (min) | 5 | 6 | 7 | 8 |
| Catering (min) | 4 | 5 | 6 | 7 |

The M4 critical-path attribution blames deboarding only when it is on the
path.

**Terminal.** New landside nodes, `arrivals_hall` and `airport_exit`, with
one-way walkways from both concourses. There is no reclaim, customs or ground
transport.


## D-030 — Save schema v5

**Date:** 2026-09-24
**Status:** Accepted

v5 adds:

- inbound manifests and arrival passenger fields
- flight deboarding fields
- active deboarding cabins (engine seat queues, aisle, exits, counters)

v4 is rejected. Validation checks:

- every inbound passenger is in exactly one of seat, aisle or terminal
- aisle positions agree between engine and passenger
- the 3:1 tick relationship from the deboarding task's start
- journey states agree with the flight's deboarding progress

A save made mid-deboarding resumes to the identical outcome.


## D-031 — Connecting passengers: one passenger, two legs

**Date:** 2026-09-24
**Status:** Accepted

A connector is an arriving `Passenger` with:

- `journey_direction = "connecting"`
- `itinerary_legs = [inbound, outbound]` and `leg_index`
- `itinerary_seats` (one seat per leg)
- `connection_status` (`pending`, `made` or `missed`)

`current_flight_id` is always the current leg. The connector belongs to the
inbound flight's `inbound_passenger_ids` and, **from generation onward**, the
outbound flight's `passenger_ids`, so the outbound gate close knows they are
missing.

**Leg change.** On leaving the inbound aircraft
(`PassengerFlow.transfer_to_connection`), the leg advances and the seat
switches to the outbound seat. The passenger then walks airside, with no
re-screening, to the outbound gate. From there M3 applies unchanged. There is
no despawn and no copy. More legs later means longer arrays.

**Generation.**

- A dedicated stream, `SimRng.STREAM_CONNECTION`, runs after all manifests, so
  nothing else reshuffles.
- Rates are set per arriving airline: GA 22% (hub), NS 15%, AW 12%, SJ 10%.
- A connection is valid only if:
  - it isn't the same flight, and the outbound destination isn't the inbound
    origin
  - the outbound departs after the inbound arrives, within 150 minutes
  - there is a free outbound seat
  - it is ideally reachable: planned deboarding start + the passenger's row
    share of the planned deboarding + the ideal gate-to-gate walk ≤ the
    outbound's scheduled D-10 close
- A scenario `demo_bank` names exact inbound seats.

**Boarding-engine consequence.** `Simulation.setup_incremental()` no longer
resets cabin state for the whole manifest; admission does. A connector may
still be in the inbound deboarding cabin when outbound boarding opens.
Standalone `setup()` is unchanged, and the golden baseline is identical.


## D-032 — Missed connections, holds and causality

**Date:** 2026-09-24
**Status:** Accepted

**Missed connections.**

- At outbound gate close, a missing connector is marked `missed`, with the
  reason (`inbound_on_aircraft`, `inbound_deboarding`, `walking_to_gate`, and
  so on), and `CONNECTION_MISSED` is recorded.
- They still leave the inbound aircraft, walk to the closed gate, and remain
  there as `missed_connection`. This is a temporary endpoint; there is no
  rebooking.
- Holds are M3's unchanged: HOLD +5 MIN, a 15-minute maximum, and CLOSE GATE.

**Causality.** `connection_report()` derives, from recorded ticks:

- how late the inbound flight reached its gate
- time from doors open to this passenger off
- transfer walk
- arrival at the gate vs gate close
- hold used vs the limit

The decisive factor is the largest overrun against plan (inbound lateness,
deboarding beyond the passenger's row share, walk beyond ideal), plus what the
gate did: closed without a hold, hold limit reached, or closed after a hold.

**Metrics.** `connection_metrics()` returns:

- connecting, made, missed, pending
- success rate
- mean transfer time
- minimum margin, measured against the scheduled close, holds included

Per-flight `connections_made` and `connections_missed` are kept for M9.

**Scenario aid.** A flight's `inbound_delay_ticks` makes the aircraft late from
its origin. The demo bank: NS 249 is 18 minutes late, and its seats 1A, 28C,
19D and 26E connect to AW 228.


## D-033 — Save schema v6

**Date:** 2026-09-24
**Status:** Accepted

v6 adds:

- passenger itinerary fields
- flight connection counts and `inbound_delay_ticks`
- deboarding-engine `exit_records` (seat and tallies at exit)

v5 is rejected. Validation is direction- and leg-aware:

- ownership: a connector is in exactly `legs[0]`'s inbound manifest and
  `legs[1]`'s outbound one
- per-leg journey states
- terminal location only once off the inbound aircraft
- boarding and deboarding sessions judged only for passengers on that flight's
  leg

A save while a connector is seated inbound, deboarding, walking, waiting or
boarding resumes to the identical outcome.


## D-034 — A flight's load means total bookings

**Date:** 2026-09-24
**Status:** Accepted (M6 closeout; supersedes M6's "connectors on top of
local bookings")

A flight's configured load factor is how full it is intended to be **in
total**, originating and connecting passengers together.

**Generation order.**

1. Each flight gets `target_bookings = capacity × load` and an outbound seat
   order.
2. Inbound passengers are generated. They now take the lowest ids.
3. Connectors are allocated from each flight's booked-seat pool, never beyond
   its target.
4. Local (originating) passengers fill exactly the seats that remain.

Flights record `target_bookings`, `originating_bookings` and
`connecting_bookings`. `boarded_count` stays separate: missed connections and
missed passengers let an aircraft leave below its bookings.

**Scope.** Connection eligibility, deterministic streams, identity, seat
uniqueness and hold behavior are unchanged. Normal connection assignment never
pushes a flight above its target. Overbooking, standby or excess demand will be
explicit future systems. Save validation checks that every manifest equals its
target and its split.

**Why:** Treating connectors as extra demand made an 82% flight behave like a
93–100% one. It silently changed boarding, delays, security demand, and (from
M7) baggage volume. Connections should create difficulty through timing and
coordination, not hidden passenger inflation.

**Result:** the booked load averages 82.1% (configured 82.4%, rounded down per
flight). The morning's mean delay drops from 3.0 to 1.9 minutes. Only the three
demo flights are more than 5 minutes late.
