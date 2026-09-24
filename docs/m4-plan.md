# M4 plan: aircraft turnaround task framework

**Status:** implemented 2026-09-24; see [m4-status.md](m4-status.md). The request
asked for the plan to be presented first only if a major architectural conflict
appeared. None did, so it was recorded here and implemented. Decisions: D-025
to D-027.

## What M3 left

- One authoritative timer: `AirportFlight.turnaround_ticks` (placeholder
  service before boarding, from `service_before_boarding_ticks` plus a seeded
  0–2 min variation) with `due_tick`. It gates `turnaround → boarding` in
  `AirportSimulation._update_flight()`.
- The same field feeds `_estimate_departure()`, `assignment_warnings()` and
  `force_delay()`.
- Boarding (`FlightBoarding`, `boarding_phase`) is already event-driven and
  stays as is.

## Design

- **`TurnaroundTask`** (new `AirportEntity`, `scripts/airport/turnaround_task.gd`)
  is stored in a new registry `AirportState.turnaround_tasks`, keyed
  `"<flight>:<type>"`. Its fields:
  - identity: id, flight, type, label
  - kind: `timed`, `boarding` or `milestone`
  - dependencies: `after`, `exclusive_with`, `required`
  - status: `PENDING → BLOCKED → READY → RUNNING → COMPLETE`, plus
    `blocked_reason`
  - durations: `nominal_ticks` and `duration_ticks`
  - planned and actual start/finish
  - `started_after`, the task or constraint that released it

  No `FAILED` or `CANCELLED` states; nothing needs them yet.
- **`Turnaround`** (new, `scripts/airport/turnaround.gd`) is the only rule
  engine for the task graph. It handles:
  - creating tasks from config at setup, with seeded variation drawn in flight
    order
  - updating task statuses once per airport tick, in configured (topological)
    order
  - blocking reasons
  - estimates
  - additive delay attribution

  It is not a general workflow engine. It has only three task kinds and two
  relation types: `after` (prerequisite) and `exclusive_with` (the two tasks
  cannot overlap).
- **The task graph is data** (`riverdale.json` → `turnaround.tasks`), with
  durations per aircraft type:

  ```
  arrival_secured → cleaning ─┐
                  → catering ─┴→ boarding ─┐
                  → fueling (exclusive with boarding) ─┤→ pushback_ready
                  → placeholder_baggage_service ──────┘
  ```

- **Boarding task.** It is `BLOCKED` until its prerequisites are complete and
  no exclusive partner is running. At that tick
  `AirportSimulation._schedule_boarding()` runs exactly as in M3: the window
  shifts if late. The task is then `READY` while waiting for D-30, `RUNNING`
  from open, and `COMPLETE` when `boarding_phase == complete`.
  `flight_boarding.gd` is untouched.
- **Flight statuses keep their meaning:**
  - `turnaround`: tasks running, boarding not started
  - `boarding`: the boarding task has started
  - `ready_for_pushback`: the `pushback_ready` milestone is complete (all
    required tasks done)

  Pushback floor and holds are unchanged from M3.
- **The timer is removed.**
  - `turnaround_ticks` is dropped from `AirportFlight` and the config, along
    with `service_before_boarding_ticks`.
  - Estimates and warnings use the task graph. They use `plan_*` fields
    computed from nominal durations.
  - `force_delay` (debug) extends `arrival_secured` before docking, and the
    running timed tasks after.
- **Causality (additive, no double counting).** The new flight field
  `departure_delay_breakdown` sums exactly to takeoff lateness:
  - `runway_takeoff_queue` + `passenger_hold` (hold used)
  - then a critical-path walk back from `pushback_ready`: each task on the
    binding chain is blamed first for its own overrun beyond its planned
    duration. The remainder passes to whatever released it (its
    `started_after`).
  - Whatever reaches the gate is `late_inbound`.

  M1's `delay_reasons` (overlapping causal durations) are kept unchanged.
- **Save schema v4.** It adds the task registry and new flight fields and
  removes `turnaround_ticks`. v3 is rejected explicitly. Validation checks:
  - task shape and ownership
  - graph references
  - status consistency with flight state and boarding phase
  - timing invariants

## Tests

Every item in the M4 request §11, plus the M3 suite unchanged and the
standalone golden baseline.

## Demonstration

- **F004 (GA, A220, gate A4):** `turnaround_overrides` gives it a long deep
  clean, so boarding is visibly blocked and the flight departs late with
  "cleaning" in its breakdown.
- **F002 (AW 228):** every service task finishes early; zero task delay.
