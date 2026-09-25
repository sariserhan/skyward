# M11 plan: construction, physical expansion and persistent layout

**Status:** planned 2026-09-24 against M10 (`bdba07f`). No conflict needed
escalation. Two constraints are recorded as decisions: gates go on predefined
pads, and runway and taxiways stay fixed. Decisions: D-048 to D-051.

## What M10 left

- **Physical layout is plain scenario config:**
  - `gates` (8, with supported aircraft classes)
  - `passenger_flow.graph` (nodes with x/y and airside flags, edges with
    walking ticks)
  - `passenger_flow.checkpoints` (`max_lanes` 4 + 4)
  - `baggage.stages[].servers` (4 / 2 / 3)
  - `economy.resources[].max`
- **`AirportCareer.day_config()`** builds each day from the base scenario; the
  simulation reads config only at setup.
- **`TerminalGraph`** caches routes per instance. A day's graph is new each
  day, but nothing ties a cache to a layout version.
- **Views.** `AirportMap` spaces gates by index assuming 8. `TerminalView`
  scales x to 1000.

## Design

- **Layout (D-048).** A new `AirportLayout`
  (`scripts/airport/airport_layout.gd`) is career state. It holds build
  objects `{id, type, site, slot}` with stable ids, a revision, and the next
  id.
  - **Catalog** (`construction.catalog`): each item has a label, category,
    cost, footprint (its site kind) and effect.
  - **Sites** (`construction.sites`):
    - gate pads, each with pad class (narrow or wide), node, x/y and edges
    - terminal pieces: nodes and edges
    - security lane sites per checkpoint, with a maximum slot count
    - baggage module sites per stage
    - a service yard for operations facilities
  - **Import.** Riverdale's existing gates become pads A1–A8 with gates
    built: the node and edges are taken from the base graph, and the
    remaining graph is the core terminal. Its 4 + 4 lanes, 4 / 2 / 3 baggage
    modules and its service facilities become the initial objects.
  - **Normalized infrastructure.** `apply(config)` rebuilds from the layout:
    - gates: base gates still built, then new ones in pad order
    - graph: base edges whose endpoints exist, then expansion edges
    - checkpoint `max_lanes` = built lanes
    - stage servers = built modules
    - resource maxima = facility units
    - `layout_revision`

    An unchanged layout reproduces the base arrays exactly, so day 1 is the
    M10 morning.
- **Placement rules.** Only between days. A slot holds one object; a gate
  needs a pad (a widebody gate needs a wide pad); limits come from the sites.
  - **Commit model (D-049).** Placing commits and charges at once. Demolishing
    refunds 50%, or 100% for something built in the same planning session
    (undo). Both are explicit ledger transactions.
  - **Demolition** is refused if it would drop the core minimum (1 lane per
    checkpoint, 1 module per stage, facilities covering the current plan) or
    leave a committed flight without a compatible gate.
- **Validation.** Before START DAY, run on the applied config:
  - **Connectivity** (`TerminalGraph`):
    - entrance → check-in → each security checkpoint
    - each gate reachable airside from a security checkpoint
    - each gate → arrivals → reclaim → exit
  - **Schedule feasibility:** each flight keeps its gate if that gate is
    built, compatible and free in its window (with the buffer); otherwise it
    gets the first compatible free gate in gate order (deterministic). A
    flight left without a gate blocks the day: *GA 418 has no compatible
    available gate*.

  Validation reports and never repairs.
- **Navigation revision.** The layout revision increments on every change.
  `TerminalGraph` records the revision it was built for, and its route cache
  is valid only for that revision (explicitly cleared on setup or change).
  Routes are rebuilt once per day, never per tick.
- **Security.** Built lanes are the physical maximum. Staffing (M2) still
  chooses the open lanes within it and the staff pool.
- **Baggage.** More modules mean more parallel servers in the same stage.
  Service times are unchanged.
- **Operations (D-050).** Facilities set each resource's maximum units. The
  M10 plan chooses how many to pay for, from min up to that maximum. Capital
  and operating costs stay separate.
- **Money.** Construction is capital: ledger category `capital`, id
  `D{day}:BUILD:{id}` or `D{day}:DEMOLISH:{id}`, dated to the day being
  planned. It is shown apart from the operating result in the report and the
  Finance tab. A build requires cash ≥ its cost (no borrowing). Nothing built
  earns anything by itself.
- **Requests (D-051).** A tier may leave its flights' gates open (`""`). The
  career assigns them at day start, and START DAY is disabled when they don't
  fit. The airline detail and the planning screen show the tier's gate
  capacity as SUFFICIENT or INSUFFICIENT, and what is needed (for example a
  widebody gate). Accepting is conditional on building.
- **Scenario.** `riverdale_expansion.json`: GA's first tier asks for a 787
  and an A220 at midday, when every gate is busy. It needs the east pier and
  pads A9/A10.
- **Build UI.** A BUILD section in the planning screen:
  - categories and items with cost and effect
  - site slots with validity and a preview (for a gate: its walk from
    security and to arrivals over the real graph)
  - cash now, cost, and cash after
  - BUILD, and DEMOLISH with the refund shown
  - validation messages beside START DAY
- **Views.** The map spaces gates by count. The terminal view scales to the
  graph's extent. The top bar shows the gate count.
- **Save schema v11.** The career gains the layout and its revision, with
  construction transactions in the ledger. The day snapshot carries the day's
  applied config, including `layout_revision`.
  - Validation: unique build ids, valid sites and slots, no double-occupied
    slots, a plan within the built maxima, the ledger reconciling with capital
    included, and an operating day's revision equal to the layout's.
  - v10 is rejected.
- **Fixed:** runway, taxiways and the terminal core.

## Demos

- **A:** build a gate. Expansion scenario: accept GA's request, build the east
  pier and a widebody gate on A10, start day 2. GA's new 787 docks at A10,
  its passengers walk there, it boards and deboards, handles bags, turns
  around with resources, and earns revenue.
- **B:** a longer walk. The same connecting flight at A5 vs at the new A10:
  the same passenger, a different route, transfer time and margin.
- **C:** baggage capacity. A baggage-constrained day with and without two more
  transfer sortation modules: queues, misses, the capital line.
- **D:** overbuilding. Spare lanes, modules and a gate that no flight uses:
  operations unchanged, cash lower.
