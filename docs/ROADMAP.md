# Roadmap

## Prototype milestones (spec §31)

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Static aircraft | Done |
| 2 | One passenger walks to seat | Done |
| 3 | Congestion | Done |
| 4 | Luggage | Done |
| 5 | Seat interference | Done |
| 6 | 180 passengers without deadlock | Done (1000-scenario sweep passes) |
| 7 | Strategies: random, B2F, F2B, WMA, custom | Done |
| 8 | Game loop: choose → start → watch → results → retry | Done |

## Prototype completion gate (spec §32)

* 180 passengers reliably simulate: yes
* Different strategies produce different outcomes: yes
* Custom strategy works: yes
* Simulation is deterministic: yes, tested
* Results explain major delays: blocked / luggage / seat interference totals,
  per-passenger inspection
* Retry loop works: yes
* No blocking bugs remain: needs human playtesting

## Next: playtest gate (spec §33)

Give the build to 10–20 people and track voluntary retries, attempts per
session, strategy edits.

## Balancing levers worth revisiting after playtest

* `entry_interval_ticks` sets the floor on total time (180 × 1.5 s = 4:30).
* Two passengers per row cell (one per side) would let both sides stow at
  once and change strategy rankings.
* Overhead bin capacity (D-004) is the obvious next mechanic.
* A "Steffen" preset (alternating rows, window first) as a stretch target.

## After the prototype passes

See spec §35 onward and [../future_enhancement.md](../future_enhancement.md):
online architecture (Next.js + Convex + Better Auth), daily challenge,
leaderboards with server-side replay verification, deboarding, baggage,
real-flight and same-flight social modes. None of this starts before the
playtest gate.
