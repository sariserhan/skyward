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


## D-035 — Checked bags are persistent objects on logical stages

**Date:** 2026-09-24
**Status:** Accepted (M7)

Every checked bag is one `AirportBag`, id `BAG_000123`, from generation to its
end state. It carries:

- its passenger, its legs and a leg index
- its kind: originating, local or transfer
- a state and the stage it is in or heading for
- timestamps and missed or held details

A transfer bag stays the same object from the inbound aircraft through
transfer sortation onto the outbound aircraft.

**Generation.** Bags come from their own stream (`SimRng.STREAM_BAGGAGE`) after
all passengers and connections, so turning bags off changes no passenger. Two
draws are made per passenger whatever the result. The checked-bag probability
is set per airline (the first leg's airline): Riverdale uses NS 45%, AW 50%,
SJ 30% and GA 60%, with a 12% chance of a second bag.

**Processing.** It is logical, not physical. Each stage (outbound sortation,
transfer sortation, reclaim delivery) has, from airport config:

- a transit time into it
- a number of servers
- a FIFO queue
- a fixed service time

Aircraft unload and load bags one at a time at configured rates, per aircraft
type (the 787 twice as fast). Scenario per-flight `baggage_overrides` can
change the rates. One stable event heap runs everything on the airport clock.

There are no belts, vehicles or handlers yet. The logical stages are where
those will plug in.

**Turnaround.** `placeholder_baggage_service` is gone. There are two driven
tasks:

- `baggage_unload` (after arrival secured): ends with the last bag off
- `baggage_load` (after unload): pushback requires it

Loading cannot finalize before the passenger gate closes. That wait is passed
to boarding's chain in the critical-path attribution, so a deep clean that
delays boarding is still blamed on cleaning, not baggage.

**Why:** real objects keep the "follow one thing" promise that passengers
already have. Logical stages give congestion (queues, capacity and service
time) without committing to a physical baggage hall before the resource
milestones.


## D-036 — Bag cutoff, passenger precedence, holds

**Date:** 2026-09-24
**Status:** Accepted (M7)

**Bag cutoff.** Departure target − `bag_cutoff_before_departure_ticks` (D-15 at
Riverdale), fixed when boarding is scheduled. Holds do not move it. A bag not
sorted and ready by then misses the flight:

- `missed_flight` (originating)
- `missed_connection` (transfer)

It is never flown on the wrong flight.

**Load finalization.** When the gate has closed and the cutoff has passed, the
bags of passengers who are not aboard are not flown:

- queued or ready bags are held
- loaded bags are offloaded, which costs loader time, then held

**Passenger precedence (V1).** If a passenger didn't fly, their bag is `held`,
even if it had also missed the cutoff. "Missed baggage connection" therefore
counts only the case the player cares about: the passenger made it, the bag
didn't.

**Connections.** Eligibility is unchanged (passenger reachability only). The
passenger's margin and the bag's margin are tracked separately.

**Why:** the rule is simple and explainable, and it keeps passenger and bag
outcomes independent. Rebooking, rush tags and delivery are later systems.


## D-037 — Save schema v7

**Date:** 2026-09-24
**Status:** Accepted (M7)

v7 adds:

- bags
- baggage-system state: event heap, sequence, stage queues and busy servers
- flight loader state (queue, current operation), bag cutoff and finalization
  flags, bag counters
- passenger reclaim ticks

v6 is rejected. Validation cross-checks:

- every bag has exactly one owner and a consistent leg
- each state has exactly the bookkeeping it needs (a sorting bag has a
  `sorted` event and a server; a queued bag is in its stage queue; a loading
  bag is its flight's current loader operation)
- server slots are in range
- the heap is ordered, unique and in the future
- no bag is loaded twice

A save taken mid-flow (bags in transit, sorting, loading, unloading or at
reclaim) resumes identically.


## D-038 — Operational resources are abstract pools held by turnaround tasks

**Date:** 2026-09-24
**Status:** Accepted (M8)

Cleaning crews, catering crews, fuel units, baggage crews and pushback tugs
are pools of abstract units, configured per airport (`resources`: label and
unit count). Each unit is explicit (`fuel_unit#2`) and records the task that
holds it. There is no movement, travel or parking. A granted unit is in use on
the tick it is granted: AVAILABLE → IN USE → released → AVAILABLE.

**Requirements.** A turnaround task spec may name a `resource`. Riverdale:

| Task | Resource |
| --- | --- |
| Cleaning | cleaning crew |
| Catering | catering crew |
| Fueling | fuel unit |
| Baggage unload and baggage load | baggage crew (shared, so arrivals and departures compete) |
| Pushback | tug |

Deboarding and boarding need none. A resource type with no pool is free,
which keeps earlier fixtures unchanged.

**Waiting.** A task whose prerequisites are met but whose unit is not
available is `WAITING` and does not progress. A waiting task counts as active
for exclusivity, so a flight still waiting for fuel does not start boarding.

**Pushback** becomes a small task (kind `pushback`) after `pushback_ready`.
Once the aircraft may leave, it requests a tug. It pushes back (the gate is
released and taxi-out starts) when the tug is granted, and the tug is freed
after the tug time, during taxi-out.

**Baggage loading window.** A task may declare
`opens_before_departure_ticks`; Riverdale opens baggage loading at D-35.
Without this, a baggage crew would be held from unload to pushback and
contention would be all-or-nothing. Bags sorted earlier wait `ready`. The M7
cutoff and finalization are unchanged.

**Riverdale capacity** (by measurement): 3 cleaning, 3 catering, 4 fuel,
7 baggage crews, 2 tugs. The waves produce short queues, and only 2 flights
lose a few minutes to shortages. `riverdale_shortage.json` (2 fuel units,
4 baggage crews, 1 tug) is the deliberate shortage.

**Security staff** keeps its own allocation model: staff are assigned to lanes
rather than held by tasks. A shared staffing architecture may unify them
later.


## D-039 — Deterministic, event-driven allocation with player service priority

**Date:** 2026-09-24
**Status:** Accepted (M8)

Each pool has one queue ordered by:

1. flight service priority (HIGH, NORMAL, LOW)
2. scheduled departure
3. the tick the task became ready
4. the flight's scenario order
5. the task's graph order

Pools are dispatched in type-name order. Saves sort object keys, so config
order is not used.

**Event-driven dispatch.** Requests, releases, priority changes and restores
mark a pool dirty. Once per tick, after every flight has updated (so
same-tick requests compete by the order above, not by flight iteration), dirty
pools hand free units to the head of their queue. A granted task starts on
that tick. There is no per-tick scan.

**Priority.** `set_service_priority(flight, low|normal|high)` is a recorded
player decision. It reorders that flight's waiting tasks and never adds
capacity: raising one flight makes another wait.


## D-040 — Resource waits in the critical path; save schema v8

**Date:** 2026-09-24
**Status:** Accepted (M8)

**Attribution.** A task's late start is split. Its resource wait is blamed
first, as `wait:<type>` (for example *Waiting for fuel unit*); the rest passes
upstream as before. Execution overrun (start to finish) stays with the task,
so waiting time and working time are never mixed. A wait off the critical path
receives no blame. The pushback tug wait comes off the pushback lateness
before the hold and the milestone.

**Save schema v8** adds:

- pools (units with holders, queues, statistics, dirty flags)
- task `resource`, `ready_tick`, `resource_wait_ticks`, `unit_id` and
  `earliest_start_tick`
- flight `service_priority`

v7 is rejected. Validation checks:

- every held unit's task is running and names that unit
- every waiting task is in exactly its pool's queue
- running resource work holds a unit
- units and pools match the scenario
- queues are in deterministic order (after restore)


## D-041 — Airlines judge the airport from real flight records

**Date:** 2026-09-24
**Status:** Accepted (M9)

**Config.** A new `airline_relations` block holds:

- scoring constants
- contract templates
- profiles per airline: starting relationship, weights, preferred gates,
  contract, request

`airlines` (id → name) is unchanged. Scoring code has no airline-specific
paths; a test swaps two profiles and checks that the scores swap.

**Records.** At each takeoff the simulation builds one record from the
flight's actual outcome:

- lateness
- turnaround-caused delay (the critical-path breakdown minus runway, hold and
  late inbound), resource-wait delay (`wait:*`), baggage delay, hold used
- connections and transfer bags carried, credited to every airline on the
  itinerary
- bags checked and the inbound locals' reclaim waits
- whether it used a preferred gate
- its largest cause, and for a resource wait, who was served meanwhile and at
  what priority (from `RESOURCE_ASSIGNED` events)

Evaluation runs only at departures and request answers. There is no per-tick
work and no randomness.

**Evaluation window.** The current operating day. The day ends with its last
departure, when every contract is settled together; settling earlier would
miss connections and bags credited by later flights. Career history comes
later.


## D-042 — Weighted dimensions, credibility blend, contracts

**Date:** 2026-09-24
**Status:** Accepted (M9)

Five dimensions, each scored 0–100:

| Dimension | Score |
| --- | --- |
| Punctuality | mean of the on-time rate (3-minute grace) and 100 − 8 × mean delay (minutes) |
| Connections | 100 − 10 × missed % |
| Baggage | 100 − 10 × missed transfer-bag % − 5 × mean baggage delay (minutes per flight) − 2 × mean reclaim wait beyond 5 minutes |
| Turnaround | 100 − 10 × mean turnaround-caused delay (minutes per flight) |
| Gates | % of flights at a preferred gate |

**Day score** is the weighted mean over the dimensions that have data.

**Relationship** is `(start × 3 + day × n) / (3 + n)` for n flights operated,
plus listed adjustments:

- contract passed: +5
- contract failed: −10
- request declined: −3

It is then clamped to 0–100.

**Bands:** Excellent 90+, Good 75+, Acceptable 55+, Poor 35+, Critical below.

**Riverdale weights** (the rest of the 100 goes to the gates dimension; SunJet
gives it none):

| Airline | Emphasis |
| --- | --- |
| Global Airways | connections 35, baggage 25, punctuality 20 |
| SunJet | punctuality 45, turnaround 40 |
| Atlantic Wings | balanced |
| Northstar | punctuality 35, baggage 30 |

**Contracts** are templates of `{metric, min|max, risk}` terms. Live status is
FAILING if any term is breached, AT RISK within a term's risk band, and
PASSING otherwise. At the day's end they become PASSED or FAILED.

| Airline | Contract |
| --- | --- |
| Global Airways | Connection Hub |
| SunJet | Fast Turnaround |
| Atlantic Wings | Basic Service |
| Northstar | Premium Reliability |

Thresholds were tuned on the default morning: GA is excellent, AW and NS are
at risk, and nobody fails without player mistakes.


## D-043 — Flight requests are commitments for the next operating day; save schema v9

**Date:** 2026-09-24
**Status:** Accepted (M9)

An airline with a request profile offers +N flights (defined in data) when all
of these hold:

- its relationship reaches the minimum
- enough of its flights have operated
- its contract is not failing
- a compatible gate is free for each proposed slot in the schedule

The player accepts or declines (a recorded decision). Declining costs −3.

**Accepted flights are commitments for the next operating day,** not inserted
into the running morning. Passengers, bags and connections come from one-shot
generation on fixed streams; inserting flights mid-run would need passenger,
bag and connection generation for them and would break determinism. Career
mode or M10 will consume the commitments.

**Save schema v9** adds records and per-airline state: contract status, the
settled flag, adjustments and request state. Records may exist only for
departed flights; states and airlines must be known. v8 is rejected.


## D-044 — An integer-cent ledger with stable transaction ids

**Date:** 2026-09-24
**Status:** Accepted (M10)

Money is integer cents. Each day's simulation owns an `AirportEconomy`: an
append-only list of transactions:

```
{id, day, tick, amount_cents, category, airline, flight_id, ref, reason}
```

**Ids are stable** (`D2:F014:passengers`, `D2:COST:fuel_unit`,
`D2:CONTRACT:GA`), and posting an existing id is refused. The career keeps
every settled transaction. Cash is always `starting cash + Σ ledger` (+
today's transactions while operating), and a save whose stored cash differs by
a cent does not load. This is an operating ledger, not accounting: no
double entry, taxes or depreciation.

**Revenue** comes only from real operations, charged once at the flight's
takeoff:

- an aircraft and gate service fee by aircraft type
- a passenger service fee per passenger who actually departed on it
- a bag handling fee per handling operation: each bag flown out on this
  departure, and each bag unloaded from its inbound flight

A transfer bag is handled twice and charged twice. There are no delay fines;
operational failures cost money only through lost fees and contracts.

**Costs** are the day's committed capacity, charged when the day starts:

- each resource unit's daily cost × planned units (available, not busy, time)
- the M2 security staff pool × a daily cost (the within-day model is
  unchanged)
- one airport operating overhead

**Contracts** gain `bonus_cents` / `penalty_cents`, shown in the airline
detail before the day. They are paid or charged once, when M9 settles the
contract at the day's end. M9 scoring is unchanged.


## D-045 — Careers: persistent state, fresh operating days

**Date:** 2026-09-24
**Status:** Accepted (M10)

`AirportCareer` holds:

- scenario and seed, day number, phase (`planning` / `operating`)
- starting cash and the ledger
- relationships, request decisions and activated growth
- the resource plan, contract history, settled days and reports

**Each day** is a fresh `AirportSimulation`, built from the base scenario
plus:

- activated growth flights
- the plan
- yesterday's settled relationships (as each airline's starting value; M9's
  evaluation stays authoritative)
- the next undecided request tier per airline
- the economy's day and opening cash

**Seeds.** Day 1 uses the scenario seed, so an unchanged career's first day is
the M9 morning. Later days use a fixed mix of the career seed and the day
number, never the wall clock. Nothing operational carries over.

**Settling a day** happens once, when every flight has departed. Remaining
arrivals and bags finish first, then:

- transactions move to the ledger (known ids skipped)
- relationships, request decisions, contract history and the report are kept
- the day's entities are dropped

A settled day is never settled again, even from a reload.


## D-046 — Accepted requests become scheduled flights

**Date:** 2026-09-24
**Status:** Accepted (M10; completes D-043)

Airline profiles list request tiers with stable ids (`GA_EXPANSION_01`, …),
each holding full flight definitions: ids, numbers, types, times and gates.

- **Offer:** a day offers an airline's first undecided tier, provided the
  earlier ones were accepted. A declined tier ends that airline's growth; no
  tier is ever offered twice.
- **Activation:** an accepted tier is activated at the next day's start, and
  its flights join every later day's schedule. Passengers, bags, connections,
  gates, turnaround tasks and resources come from the normal generation, like
  any flight.

Riverdale's tiers:

| Tier | Flights |
| --- | --- |
| GA_EXPANSION_01 | GA 401 (A220, A1) and GA 418 (787, A7) |
| GA_EXPANSION_02 | GA 426 (A220, A5) |
| SJ_EXPANSION_01 | SJ 403 and SJ 411 (A321, A2/A3) |
| NS_EXPANSION_01 | NS 417 (737, A4) |

They arrive between 08:35 and 09:10, as the third wave departs, so growth
brings real runway, resource, security and connection load.


## D-047 — Daily capacity planning and solvency; save schema v10

**Date:** 2026-09-24
**Status:** Accepted (M10)

**Planning.** Resource counts change only between days, within
`economy.resources[].min/max`. During the day, M8 priority is the lever. A day
starts only if cash covers its committed cost. If not even the minimum plan
fits, the career is insolvent; there are no loans in M10.

**Riverdale economy:**

- **Starting cash:** $400,000
- **Aircraft and gate service:** A220 $1,300; 737 $1,700; A321 $2,000;
  787 $3,600
- **Passengers:** $12 each
- **Bag handling:** $2.50 per operation
- **Units per day:** cleaning $1,800; catering $1,800; fuel $4,000; baggage
  $2,400; tug $1,500
- **Security:** $900 per staff member
- **Overhead:** $55,000
- **Contracts (bonus / penalty):**

  | Contract | Bonus | Penalty |
  | --- | --- | --- |
  | Basic | $3,000 | $4,000 |
  | Fast Turnaround | $4,000 | $5,000 |
  | Hub | $6,000 | $8,000 |
  | Premium | $5,000 | $6,000 |

**Save schema v10.** A career file is `{version, kind: "career", career,
day}`, where `day` is the operating day's simulation snapshot (also v10, now
with its economy) or null between days. Validation checks that:

- settled days are exactly 1..day−1
- transaction ids are unique and no day runs ahead
- cash reconciles
- plans are within range
- request states are known
- an operating day's opening cash equals the settled cash and repeats no
  settled transaction

v9 is rejected.


## D-048 — The airport as built is persistent career state on predefined sites

**Date:** 2026-09-25
**Status:** Accepted (M11)

`AirportLayout` holds build objects `{id, type, site, slot}` with stable ids
(imported objects `G-A1`, `L-west-1`, … and new builds `B0001`, …), a revision,
and the id counter.

- **Catalog.** `construction.catalog` lists label, category, cost, site kind
  and effect.
- **Sites.** `construction.sites` lists gate pads, terminal pieces, security
  lane rows, baggage module rows and the service yard. One object per slot.
- **Placement is on predefined sites, not free.** The fixed apron and taxi
  system can only reach known positions. Riverdale adds two expansion pads
  (A9 narrowbody, A10 widebody) on an east pier that must itself be built,
  and a central connector walkway.
- **Fixed until M12:** runway, taxiways and the terminal core.

**Import.** Riverdale's existing infrastructure is imported as the initial
objects:

- its 8 gates become pads with gates (their node and edges come from the base
  graph)
- 4 + 4 security lanes
- 4 / 2 / 3 baggage modules
- service facilities

**Normalized infrastructure.** Each day's config is rebuilt from the layout:

- gates: built base gates in scenario order, then new ones
- terminal graph: base edges whose ends exist, then expansion edges
- checkpoint `max_lanes`
- stage servers
- `layout_revision`

Values are written only when they change, so an unexpanded airport produces
the scenario's own arrays. Day 1 is the M10 day to the cent (tested).

The simulation never reads build objects, only the normalized config at
setup: zero per-tick cost.


## D-049 — Construction commits at once; capital is not operating cost

**Date:** 2026-09-25
**Status:** Accepted (M11)

- **When.** Construction happens only in planning, between days.
- **Building** charges the item's cost at once: a ledger transaction in
  category `capital`, id `D{day}:BUILD:{id}`, dated to the day being planned.
  Cash after the build must stay at or above zero; there is no borrowing.
- **Demolishing** posts `D{day}:DEMOLISH:{id}`: a full refund for something
  built in the same planning session (undo), otherwise
  `construction.refund_permille` (50%).
- **Refused demolitions:** any that would add a validation error (for
  example, a gate whose committed flights have nowhere else to go), or leave
  the resource plan above what remains built.
- **Reporting.** Capital appears apart from the operating result (the day
  report and the Finance tab). Nothing built earns anything by itself.

**Validation** runs before START DAY and never repairs anything:

- the entrance reaches check-in
- each checkpoint has lanes and is reachable
- each baggage stage has capacity
- each gate is reachable airside from security, and reaches reclaim and the
  exit
- the schedule fits the gates

**Gate assignment.** A flight keeps its configured gate when that gate is
built and compatible; the scenario's tight turns are operational (M1). A
flight without one gets the first compatible gate, in gate order, whose
scheduled use (with buffer) is clear. Otherwise the day cannot start: *GA 431
has no compatible available gate (widebody).*


## D-050 — Built capacity bounds operated capacity

**Date:** 2026-09-25
**Status:** Accepted (M11)

| Built | Bounds |
| --- | --- |
| Security lanes | the lanes that can be opened; M2 staffing still chooses within them and the staff pool |
| Baggage modules | the parallel servers of their stage; service times unchanged |
| Service facilities (cleaning or catering base: 2 crews; fuel bay: 2 units; baggage equipment: 5 crews; tug bay: 1 tug) | each resource's maximum in the M10 plan |

The plan still chooses how many units to pay for (min up to the built
maximum): build capacity, then decide whether to operate it.

**Navigation.** `TerminalGraph` carries the layout revision. A route cached
for one revision is never served for another. Each day builds its graph once
from its layout; there is no per-tick rebuilding.


## D-051 — Requests can require construction; save schema v11

**Date:** 2026-09-25
**Status:** Accepted (M11)

- **Open gates.** A request tier may leave its flights' gates open and skip
  the in-day gate check (`check_gates: false`). The airline detail shows the
  tier's gate capacity (SUFFICIENT, or INSUFFICIENT with the missing gate
  type).
- **Conditional accept.** Accepting is conditional: the accepted flights
  enter the next day's schedule, and START DAY stays disabled until they have
  compatible gates.
- **`riverdale_expansion.json`:** Global Airways' midday 787 and A220 need
  the east pier, A9 and A10.

**Save schema v11.** The career gains `layout` (objects, revision, next id,
session ids). Capital transactions may belong to the day being planned or run.
Validation checks:

- unique ids
- known items on compatible sites and free slots
- the id counter
- the plan within built maxima
- the ledger (capital included) reconciling to cash
- an operating day's `layout_revision` equal to the layout's

v10 is rejected.


## D-052 — One airside graph; Riverdale's airside imported as a calibrated schematic

**Date:** 2026-09-25
**Status:** Accepted (M12)

- **One graph.** `config.airside` defines the airside:
  - nodes `{x, y, kind, label}` in metres
  - edges `{id, from, to, length_m, oneway, classes, kind}`
  - runways `{id, label, a, b, length_m, status}`
  - a stand node per gate

  `AirsideNetwork` is built from it once per day. It is the only thing
  aircraft move on. The map draws its geometry and interpolates aircraft
  along their current edge, so the animation follows the simulation.
- **The conflict, and how it is resolved.** An unchanged Riverdale must
  reproduce M11 exactly (spec §4), but taxi time should come from geometry
  (§45).
  - Riverdale's existing airside is imported as a schematic network: one-way
    inbound and outbound apron lanes, gate stubs, a runway exit and a hold.
  - Its edge lengths are calibrated so every gate route is exactly the old
    1,800 m = 180 s in and out.
  - A recirculation taxiway (hold → exit, one-way east, 3,000 m) lets an
    aircraft get from any stand back to the in-lane. No shortest runway route
    can use it, so it changes nothing unless a gate is reassigned.
  - Everything the player builds takes its length from geometry: A9/A10 stand
    links, taxiways and runways.
  - Unchanged day 1 therefore keeps the M11 timeline and money to the cent
    (+$18,415.50). New construction is geometric.
- **Overlays can replace.** A scenario overlay may list top-level keys under
  `replace`, to swap a whole section instead of merging it.
  `riverdale_single_taxiway.json` uses this for its own airside.


## D-053 — Taxiway occupancy that cannot deadlock

**Date:** 2026-09-25
**Status:** Accepted (M12)

Routes are deterministic Dijkstra over free-flow ticks
(`ceil(length ÷ taxi speed × 10)`), with one-way edges, aircraft class and
lexical node tie-breaks. They are computed only at events: after landing
(runway exit → stand) and at pushback (stand → runway entry). They are cached
per `layout_revision`.

- **Same direction.** An aircraft enters an edge no sooner than
  `headway_ticks` (15 s) after the previous entry. Its exit is never before
  the leader's exit + headway. Only the aircraft at the front of an edge may
  leave it, so nobody passes.
- **Intersections.** Entering an edge from a node reserves that node for
  `node_ticks` (5 s).
- **Opposing traffic.** Before moving, an aircraft locks the direction of
  every two-way edge on its whole route; otherwise it waits where it is. An
  arrival whose route uses two-way edges starts only when its gate is free.
  A departure has already released its gate at pushback, and waits on the
  pushback position.
- **Why it cannot deadlock.** Once moving, an aircraft waits only for
  same-direction leaders or a node crossing, and both always clear. Waits at
  the ends (the gate, the runway queue) never depend on followers.

Deadlock sweeps (randomized compressed mornings on the one-lane airport)
check this. Occupancy is saved: per-edge last entry and exit, lock direction
and count, occupants and last entrant, plus node busy times.

**Stands are ends, never a way through.** An arrival whose gate is still
occupied finishes its route at the stand and holds there, holding no taxiway
or locks. That keeps the M11 gate wait, and the flight detail says *HOLDING ·
gate A3 occupied*.

**Reassigning a taxiing aircraft reroutes it from where it is:** its route
start, the end of its current edge, or the stand it holds at. It is refused,
with the reason, if no route exists (a gate already passed on a one-way lane)
or opposing traffic owns the new route. Waits across parts add up; nothing
teleports.


## D-054 — Runways as resources: length, selection, ends-only access

**Date:** 2026-09-25
**Status:** Accepted (M12)

- **Runways.** `AirportState.runways` holds one `AirportRunway` per runway,
  each with its own FIFO queue, active operation, separation, busy time,
  movements and peak queue. Operations run in the runway's heading: land from
  end A and exit at B; take off at A.
- **Compatibility.** An aircraft type needs a minimum length (A220 1,500 m,
  737 1,800 m, A321 2,000 m, 787 2,800 m) and an open runway.
- **Selection** is deterministic among compatible, open runways with a route:
  the lowest free-flow taxi ticks plus queue length × (operation +
  separation), then runway id. Arrivals choose when requesting landing;
  departures at pushback.
- **Independence.** Runways are independent: M12 has no crossing runways.
- **Ends only.** Taxiways may touch a runway only at its end nodes and may
  not cross it (the simpler safe rule).
- **Planning** uses the best free-flow taxi time per gate and aircraft type
  in place of the fixed `taxi_in_ticks` / `taxi_out_ticks`. Scenarios
  without an airside keep the timers.


## D-055 — Taxi delay is its own cause, exactly attributed

**Date:** 2026-09-25
**Status:** Accepted (M12)

- **Taxi-out.** Time beyond the planned (best free-flow) taxi-out becomes
  `taxi_congestion` in the departure breakdown, between the runway queue and
  the pushback chain. That time is waits, or a longer route to a less busy
  runway.
- **Taxi-in.** Waits are split out of `late_inbound` into `taxi_congestion`,
  and the inbound root keeps the rest.
- **Exactness.** The breakdown still sums to the delay exactly (tested on
  every flight of congested days).
- **Airlines.** M9 airline records count taxi congestion as airside, not
  turnaround.
- **Riverdale's out-lanes.** Merging departures on Riverdale's out-lanes now
  show 15 s of taxi congestion (148 ticks on the default day) that M11 called
  runway queue. The takeoff times are identical.


## D-056 — Airside construction; save schema v12

**Date:** 2026-09-25
**Status:** Accepted (M12)

**Imported pieces.** Riverdale's airside becomes 38 `legacy_taxiway` objects
(`AT-<edge>`) and one `legacy_runway` (`AR-R1`), so it can be changed within
the rules.

**New objects.**

- **Taxiway** `{from, to, direction}`, where each end is a network node or a
  free grid anchor `G_x_y` (300 m grid inside `airside.zones`). It is
  refused if it:
  - does not touch the network
  - crosses an edge or passes through a node without a junction
  - enters the terminal zone
  - crosses a runway (it may touch a runway only at its ends)
  - duplicates a link

  Cost: $30 per metre.
- **Runway** `{start anchor, heading E/W/N/S, length 2,000/2,400/2,800/3,200 m}`.
  It must stay inside the zones, at least 300 m from other runways, and clear
  of taxiways and nodes. Cost: $60 per metre, so a 2,800 m runway is $168,000.
  It needs taxiways to its ends before a day can start.
- **Changes** between days are free: a taxiway's direction (two-way, one-way
  either way) and a runway's status (open/closed).
- **Pads A9/A10** gain stand nodes and geometric one-way links to the apron
  lanes.

**Validation.** Every gate must have a route from and to an open runway,
every open runway must be connected, and every flight's aircraft type must
have a long-enough reachable runway. Demolition and changes that break this
are refused and undone. A request tier's capacity check includes runway
capability, so a 787 request on a 2,400 m runway reads INSUFFICIENT until a
longer runway exists.

**Save schema v12.**

- **Career:** airside layout objects are validated (known imported edges and
  runways, direction values, offered lengths, headings, anchors), and the
  applied airside must be a well-formed network.
- **Day:** the runways dict, flight taxi state (route, leg, enter/exit ticks,
  waits, runway), edge occupancy and node reservations.
- **Validation:** edges reference nodes, routes reference edges, lock counts
  match the aircraft holding them, occupants are on the edge of their current
  leg, and runway ids exist.

v11 is rejected.
