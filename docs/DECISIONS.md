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
