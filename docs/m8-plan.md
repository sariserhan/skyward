# M8 plan: operational resources and contention

**Status:** planned 2026-09-24 against M7 (`639a3bd`). No conflict needed
escalation. Decisions: D-038 to D-040.

## What M7 left

- **Turnaround.** `Turnaround.update()` (`scripts/airport/turnaround.gd`)
  starts a task the tick its prerequisites are complete and no exclusive
  partner is active:
  - timed tasks run on their own
  - boarding, deboarding and baggage tasks are driven by `AirportSimulation`
    through `starters` and `complete_task()`
  - wake-skipping means an idle flight costs nothing
- **Pushback.** `AirportSimulation._try_pushback()` releases the gate as soon
  as the `pushback_ready` milestone is complete and the pushback floor
  (D + hold − taxi-out − takeoff) has passed.
- **Blame.** `Turnaround.attribute()` / `_blame()` walk the critical path
  back from the milestone. Each task takes its own overrun, then passes its
  late start to whatever released it.
- **Security staff** (`SecurityCheckpoint.staff`, `set_security()`) is a
  separate pool with its own lane rules. It is left alone (see below).

## Design

- **Resource pools (D-038).** A new `AirportResources`
  (`scripts/airport/airport_resources.gd`) is configured from `resources`:
  `{type: {label, units}}`. Riverdale has cleaning crews, catering crews,
  fuel units, baggage crews and pushback tugs.
  - Each unit is explicit (`fuel_unit#2`), with a state (`available` or
    `in_use`), its holder task and a since-tick.
  - Each pool has one ordered queue of waiting task ids.
  - With no dispatch travel in M8, "assigned" and "in use" happen on the same
    tick; the lifecycle is AVAILABLE → IN USE (assigned) → released →
    AVAILABLE.
- **Task requirements.** A turnaround task spec may declare
  `"resource": "fuel_unit"`, and `TurnaroundTask.resource` records it.
  - Riverdale: cleaning → cleaning crew, catering → catering crew, fueling →
    fuel unit, baggage unload and load → baggage crew (shared), pushback →
    tug.
  - Deboarding and boarding need nothing.
  - A resource type with no configured pool needs nothing, so earlier
    fixtures are unaffected.
- **Waiting.** New task status `WAITING`. When a resource task's blockers
  clear, it records `ready_tick`, joins its pool's queue and shows *waiting
  for fuel unit*. It starts only when granted a unit, recording
  `resource_wait_ticks`.
  - A waiting task counts as active for exclusivity, so a flight still waiting
    for fuel doesn't start boarding, as M4 intended.
- **Event-driven dispatch.** A dirty flag is set on a request, a release, a
  priority change or a restore. Once per tick, after all flights have updated
  (so same-tick requests compete fairly), a dirty pool assigns free units in
  queue order. The granted task starts that same tick. There is no per-tick
  scan otherwise.
- **Deterministic order (D-039).** The queue key is:
  1. service priority (HIGH, NORMAL, LOW)
  2. scheduled departure (urgency)
  3. the tick the task became ready
  4. the flight's scenario order
  5. the task's graph order

  There is no dictionary- or frame-order dependence.
- **Pushback operation.** A new task kind `pushback` (type `pushback`, after
  `pushback_ready`, needs a tug, duration = tug time).
  - The aircraft requests a tug when the milestone is complete and the
    pushback floor has passed. It waits (*Ready · waiting for pushback tug*) if
    none is free.
  - On grant it pushes back (the gate is released and taxi-out starts). The
    tug is released when the tug time ends, during taxi-out.
  - With tugs free, timing equals M7 except that the gate frees after the
    flight loop, one tick later.
- **Baggage loading window.** With loading starting right after unload, a
  baggage crew would be held for the whole turnaround.
  - A task spec may set `opens_before_departure_ticks`: the task cannot start
    before D minus that, and its planned start moves with it.
  - Riverdale opens baggage loading at D-35. Bags sorted earlier wait ready,
    then load in a burst; the M7 flow, cutoff and finalization are unchanged.
  - Unload and load share baggage crews, so they compete.
- **Service priority.** `AirportFlight.service_priority` is `low`, `normal`
  (default) or `high`. `set_service_priority()` is a recorded decision: it
  reorders that flight's waiting tasks and marks their pools dirty. It never
  adds capacity.
- **Blame (D-040).** In `_blame()`, a task's late start is split:
  - its resource wait is blamed first, as `wait:<type>` (for example *Waiting
    for fuel unit*)
  - the rest passes on as before

  The pushback tug wait comes off the pushback lateness before the hold and
  milestone. Execution overrun (start to finish) stays with the task. A wait
  off the critical path receives nothing.
- **Estimates.** A waiting task's start is estimated from the in-use units'
  expected release times and its queue position (1 Hz, as before).
- **Metrics.** Per pool:
  - utilization (busy unit-ticks ÷ capacity)
  - requests, tasks that had to wait, mean and max wait
  - peak queue and allocation count

  Plus flights delayed by shortage and the departure minutes blamed on it.
- **Events and alerts.** `RESOURCE_SHORTAGE` and `RESOURCE_SHORTAGE_CLEARED`
  events fire when a pool's queue becomes non-empty and when it empties.
  Aggregate alerts: *Fuel units · 3 flights waiting* (2 or more waiting), and
  *Pushback · AW 228 waiting 4 min for tug*.
- **UI.**
  - A compact **Service priority** LOW / NORMAL / HIGH row.
  - Turnaround rows: *WAITING · waiting for fuel unit · 2nd in queue · 2/2
    busy*.
  - *Holding departure: Fueling · waiting for fuel unit*.
  - A **Resources** tab: per type busy/total and waiting, expandable to the
    waiting and served flights, with a click to select.
- **Scenarios.** Config overlays: a scenario JSON may `extends` another and
  override keys. `riverdale_shortage.json` has scarce fuel, baggage crews and
  tugs, for the demos. The airport scene accepts `--scenario=<path>`.
- **Save schema v8.** Adds the resource pools (units, queues, dirty flag,
  statistics), the new task fields (`resource`, `ready_tick`,
  `resource_wait_ticks`, `unit_id`, `earliest_start_tick`) and flight
  `service_priority`. Validation cross-checks every unit ↔ holder task, queue
  membership, queue order and status consistency. v7 is rejected.
- **Security staff** stays on its own model. Its pool-of-staff-assigned-to-
  lanes rule differs from task-held units. A shared staffing architecture is
  noted for later.

## Demos

- **A:** automatic contention. In the shortage scenario, flights queue for
  fuel units, the Resources tab shows 2/2 busy and 3 waiting, and the next
  flight in the deterministic order starts when a unit frees.
- **B:** player agency. Two flights compete for the same unit. The default
  run is compared with a replay (same seed) where the losing flight is HIGH.
  The priority flight improves and the other gets worse.
- **C:** cascade. A resource shortage delays a turnaround, then a downstream
  consequence follows through existing systems: gate occupancy for the next
  arrival, a transfer bag or connection at risk, the runway slot.
