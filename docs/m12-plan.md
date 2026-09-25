# M12 plan: airside construction, taxiways, runways and aircraft routing

**Status:** planned and implemented 2026-09-25 against M11 (`ff52498`); see
[m12-status.md](m12-status.md). One conflict is
resolved here rather than escalated: exact M11 reproduction (spec §4) vs
geometry-derived taxi time (§45). Decisions: D-052 to D-056.

## What M11 left

- **Runway.** One runway (`AirportState.runway`: FIFO `queue`,
  `active_operation`, `occupied_until`) serves landings and takeoffs.
  `_request_runway()`, `_start_runway()` and `_complete_runway()` run it with
  `landing_ticks`, `takeoff_ticks` and `separation_ticks`.
- **Taxi is a timer:** `landed` → `taxiing_in` (`taxi_in_ticks`, 180 s) →
  gate; pushback → `taxiing_out` (`taxi_out_ticks`) → runway request. The
  same constants feed planning: `_scheduled_pushback`, `_pushback_floor`,
  estimates, turnaround planning, M6 connection estimates and M11 gate
  windows.
- **The map draws an abstract taxi line;** gates are spaced by index.
- **The M11 layout** holds gate pads, terminal pieces and rows; runway and
  taxiways are fixed scenario data.

## Design

- **One airside graph (D-052).** `config.airside` defines:
  - nodes `{x, y, kind}` in metres: taxi, stand, hold, exit, runway end
  - edges `{id, from, to, length_m, oneway, classes, kind}`, where kind is
    taxiway, stand, runway entry or runway exit
  - runways `{id, label, a, b, length_m, status}`

  A new `AirsideNetwork` (`scripts/airport/airside_network.gd`) is built once
  per day from it. It is the only source of aircraft movement; the map draws
  its geometry, and aircraft positions are interpolated along their current
  edge.
- **Riverdale import (the resolved conflict).**
  - The existing airside becomes a schematic network: runway R1 "09/27"
    (3,000 m), an exit link at the east end, a west hold-short, an inbound
    apron lane, gate stubs, and a rear outbound lane back to the hold.
  - Lanes are one-way and never cross.
  - Edge lengths are calibrated so every legacy gate route is exactly the old
    180 s in and out at 10 m/s. The unchanged Riverdale therefore reproduces
    M11. This is the mandatory regression test.
  - Everything the player builds (taxiways, connectors, the A9/A10 stand
    links, runways) takes its length from geometry, so a far gate really
    taxis longer.
  - Imported pieces are persistent layout objects (`AT-*`, `AR-R1`) and can
    be demolished or closed within the rules.
- **Routing.** Deterministic Dijkstra over free-flow time (length ÷ taxi
  speed), respecting one-way edges, aircraft class and runway endpoints. Ties
  are broken by node id.
  - Routes are computed at events only: after landing (exit → gate), and at
    pushback (stand → hold-short).
  - Free-flow times per gate and runway are cached per day and tied to the
    layout revision. They replace `taxi_in_ticks` and `taxi_out_ticks` in
    planning. Without `airside`, the old constants remain (older fixtures).
- **Occupancy and deadlock safety (D-053).** Lightweight, deterministic:
  - **Same direction:** FIFO. An aircraft may enter an edge only
    `headway_ticks` after the previous entry. Its exit is never earlier than
    the leader's exit plus the headway: no passing, followers queue.
  - **Intersections:** entering from a node reserves it for `node_ticks`, so
    others wait.
  - **Opposing traffic on two-way edges:** before an aircraft starts, it
    locks the direction of every two-way edge on its whole route (free, or
    already locked the same way). Otherwise it waits at its start: the gate,
    or the runway exit holding point, which is off the runway.
  - **Why this can't deadlock:**
    - once moving, an aircraft only waits for same-direction leaders or a
      node crossing, both of which clear
    - its end waits (a gate, the runway queue) never depend on followers
    - an arrival whose route uses two-way edges starts only when its gate is
      free

    Deadlock sweeps test this.
- **Runways (D-054).** `AirportState.runways` holds one resource per runway:
  queue, active operation, occupancy, busy time, length, status, entry/exit
  nodes. Operations run in the runway's heading: land from end A and exit at
  end B; take off from the hold at end A.
  - **Compatibility** is by configured minimum length per aircraft type (A220
    1,500 m, 737 1,800, A321 2,000, 787 2,800).
  - **Selection** is deterministic among compatible, open, reachable
    runways: lowest estimated time (free-flow taxi + queue length × operation
    time), then runway id. Arrivals choose when requesting landing;
    departures at pushback.
  - **Independence.** Runways are independent unless they share a conflict
    point; M12 has no crossing runways (simplified).
  - **Crossings.** Taxiways may not cross a runway; access is only at its end
    nodes (the simpler safe rule).
- **Movement.**
  - **Arrival:** landing on the chosen runway → taxi route from its exit to
    the gate → the M1 gate check at the end.
  - **Departure:** the M8 tug pushback releases the gate → taxi route to the
    hold → the runway queue → takeoff.

  Positions come from the edge and progress. Nothing teleports.
- **Causality (D-055).**
  - Taxi-out waits beyond free flow become `taxi_congestion`, between the
    runway queue and the pushback chain.
  - Taxi-in waits become `taxi_congestion` at the inbound root, before
    `late_inbound`.
  - The runway queue keeps its own cause. The breakdown stays additive and
    exact.
  - M9 records count taxi congestion as airside, not turnaround.
- **Construction (D-056).** New layout object kinds:
  - **taxiway** `{from, to, oneway}`: both ends are network nodes or grid
    anchors in `airside.zones`. It may not cross any edge or runway except at
    shared nodes, may not enter the terminal zone, and may touch a runway only
    at its end nodes. Cost scales with length.
  - **runway** `{start anchor, heading E/W/N/S, length}`: inside the runway
    zones, clear of other runways (≥ 300 m) and taxiways. A major cost; it
    needs taxiway connectors to its end nodes.
  - **one-way toggle** on a built taxiway (free, between days), and **runway
    open/closed** (free, between days).
  - M11 gate pads A9/A10 gain stand nodes and geometric stand connectors to
    the apron lanes.
  - Ledger categories stay `capital`, with ids `D{day}:BUILD:{id}` and
    `DEMOLISH`.
- **Validation (extends M11).**
  - every built gate has a taxi route from some compatible runway exit and to
    some compatible hold
  - every open runway connects both ends
  - every scheduled flight's aircraft type has a compatible, reachable runway
  - a request tier reports taxi or runway capability, alongside gate capacity

  It never repairs; demolition that breaks these is refused.
- **UI.**
  - The airfield map is drawn from the graph: runways, taxiways, stands,
    aircraft along their routes, hold queues.
  - An **Airside** overlay colours occupied and locked edges and shows queue
    counts. F3 debug shows node and edge ids and reservations.
  - The flight detail shows *TAXIING TO R1 · route …*, *WAITING FOR TAXIWAY ·
    GA 242 ahead*, or *WAITING AT INTERSECTION*.
  - The Build tab gains an **Airside** tool: a mini map with anchors.
    - Taxiway: click two points; the preview shows length, cost, validity
      and routes created.
    - Runway: pick a start, heading and length; the preview shows the classes
      served.
    - Select an edge to toggle one-way or demolish; select a runway to close
      or open it.
- **Metrics.** Per flight: taxi time and taxi wait. Per runway: movements,
  utilization and peak queue. Also route count, peak taxiing aircraft, and
  mean gate-to-runway time.
- **Save schema v12.**
  - **Layout:** airside objects.
  - **Day:** flight taxi state (route, leg, enter/exit ticks, wait,
    assigned runway), edge state (last entry/exit, lock direction and
    count), node busy times, and the runways dict.
  - **Validation:** edges reference nodes, routes reference edges, lock
    counts equal locking aircraft, no aircraft on a nonexistent edge, runway
    assignments compatible, a single active operation per runway.
  - v11 is rejected.
- **Scenarios.**
  - `riverdale_single_taxiway.json`: one two-way taxilane for everything, the
    congestion case.
  - `riverdale_short_runway.json`: R1 is 2,400 m, no 787s, and a GA 787
    request.

## Demos

- **A:** the single-taxilane morning, then with a parallel lane built and
  both made one-way. Taxi waits and delay fall.
- **B:** the default traffic, with R2 built north with end-around taxiways.
  Some flights use R2 and runway queues fall; the capital is shown.
- **C:** the short runway. GA's 787 request is blocked until R2 (3,000 m) is
  built; then the 787 lands on R2, taxis to the widebody gate, turns, departs
  and earns.
- **D:** a valid but poor design (a long one-lane detour): longer taxis and
  queues.
- **E:** a bad taxi design → a late inbound → a late deboarding → a missed
  connection or bag → the airline's relationship and contract → the money.
