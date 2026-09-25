# M11 completion report: construction, physical expansion and persistent layout

Implemented on 2026-09-25 from M10 (`bdba07f`), against
[m11-plan.md](m11-plan.md). Decisions D-048 to D-051. M12 airside construction
has not started.

> OPERATE → EARN → IDENTIFY THE BOTTLENECK → BUILD → START THE NEXT DAY →
> OBSERVE

## Delivered

- **Persistent layout (D-048).** `AirportLayout` is career state: build
  objects `{id, type, site, slot}` with stable ids, a revision, and the id
  counter.
  - **Riverdale is imported, not rewritten.** Its 8 gates become pads with
    gates (node and edges taken from the base graph), with 4 + 4 security
    lanes, 4 / 2 / 3 baggage modules and its service facilities: 39 initial
    objects.
  - **Applying an unchanged layout reproduces the scenario's own arrays.**
    Day 1 is M10's day to the cent: +$18,415.50, 3,974 passengers, 6 missed
    connections (tested).
- **Catalog** (data-driven, `construction.catalog`):

  | Category | Items |
  | --- | --- |
  | Gates | narrowbody gate $45,000; widebody gate $70,000 (wide pads only) |
  | Terminal | east pier $35,000 (reaches pads A9/A10 and arrivals); central connector $25,000 (a shorter west–east walk) |
  | Security | lane $12,000 (up to 6 per hall) |
  | Baggage | outbound or transfer sortation module $9,000; reclaim belt $8,000 |
  | Operations | cleaning or catering base $6,000 (+2 crews); fuel bay $15,000 (+2 units); baggage equipment $12,000 (+5 crews); tug bay $5,000 (+1 tug) |

  Placement is on predefined sites: 2 expansion pads, 2 terminal pieces,
  lane rows, module rows and a 20-slot service yard. Free placement is not
  offered, because the fixed apron and taxi system can only reach known
  positions. Runway and taxiways are fixed until M12.
- **Everything built changes the real simulation**, through normalized
  config at day start:
  - **Gates:** real gates in assignment, compatibility, occupancy and
    conflicts, routing, boarding and deboarding, turnaround, baggage,
    connections and requests.
  - **Terminal:** the east pier and connector add nodes and edges to the M2
    graph, so passengers walk the real new routes.
  - **Security:** built lanes are the physical maximum; M2 staffing still
    chooses open lanes within the staff pool.
  - **Baggage:** modules are extra parallel servers in their M7 stage;
    service times are unchanged.
  - **Operations:** facilities set each resource's maximum; the M10 plan
    still chooses what to pay for.
- **Navigation revision.** `layout_revision` flows into the day's graph.
  `TerminalGraph` serves cached routes only for the revision they were
  computed on. Each day builds its graph once; there is no per-tick
  rebuilding.
- **Validation (D-049)** blocks START DAY and never repairs:
  - entrance → check-in → each checkpoint (with lanes)
  - each baggage stage has capacity
  - each gate reachable airside from security, and to reclaim and the exit
  - the plan within built maxima
  - the schedule fits the gates

  Messages read like *Gate A9 has no passenger path from security*, or *GA
  431 has no compatible available gate (widebody)*.
- **Gate assignment.** A flight keeps its configured gate when that gate is
  built and compatible; Riverdale's tight turns stay operational (M1
  conflicts). Open or orphaned flights take the first compatible gate whose
  scheduled use (with buffer) is clear.
- **Money (D-049, D-050).**
  - Building commits and charges at once: capital transactions
    `D{day}:BUILD:{id}`, cash after ≥ 0, no borrowing.
  - Demolition refunds 50%, or 100% as an undo in the same session. It is
    refused if it would break validation (for example, A1's flights have
    nowhere else to go) or strand the plan.
  - Capital is shown apart from the operating result in the report and the
    Finance tab.
  - Nothing built earns anything by itself.
- **Requests that need building (D-051).** A tier can leave its gates open.
  The airline detail shows *Gate capacity: INSUFFICIENT* and what is missing.
  Accepting is conditional: START DAY waits for the capacity.
  `riverdale_expansion.json` makes Global Airways' midday bank require the
  pier, A9 and A10.
- **Build mode.** The planning screen has **Plan** and **Build** tabs. Build
  offers:
  - categories and items with cost and effect
  - sites with a live validity reason
  - a real-graph preview for gates (walk from security, walk to reclaim, or
    *no passenger path yet*)
  - cash, cost and cash after; BUILD
  - the built list with DEMOLISH and its refund

  Plan shows *used/max* per resource, capital spent, and blocking errors.
  The map and terminal view scale to the built gates, the top bar shows
  *Gates n / total*, and a new day rebuilds the gate dropdown and board.
- **Save schema v11.** The career gains the layout. Capital transactions may
  belong to the day being planned or run. Validation checks:
  - unique ids, known items on compatible sites, one object per slot
  - the id counter
  - the plan within built maxima
  - the ledger reconciling
  - a running day's `layout_revision` equal to the layout's

  v10 is rejected. A mid-day save of an expanded airport resumes
  identically.
- **Scenarios.** `riverdale_expansion.json` (the growth bottleneck) and
  `riverdale_baggage_crunch.json` (a transfer sortation bottleneck).

## Demonstrations

Run `tools/ui_tests.sh tests/m11_demo.gd`. It writes `/tmp/m11-demo-01…05*.png`.

```
A · 08:10:15 Global Airways asks for GA 431 (787) and GA 439 (A220) at midday; gate capacity INSUFFICIENT; accepted
A · planning day 2: GA 431 has no compatible available gate (widebody). GA 439 has no compatible available gate (narrowbody).
A · built East pier, A9 (narrowbody), A10 (widebody): capital −$150,000 · cash $268,415.50
A · GA 431 at A10: 192 deplaned, 199 boarded, 152 bags, turnaround 10/10, departed 08:05:35, earned $6,658
A · GA 439 at A9: 105 deplaned, 92 boarded, 77 bags, turnaround 10/10, departed 08:10:00, earned $2,764
B · the same connecting passenger (P0042), NS 900 at A5 → AW 900:
    A6              route A5 → east_hall → A6 · walk 2.0 min · at gate 00:45:06 · gate closed 00:45:58 · margin +0.9 min → MADE
    A10 (new pier)  route A5 → east_hall → east_pier → A10 · walk 4.2 min · at gate 00:47:19 · gate closed 00:46:12 · margin -1.1 min → MISSED
C · transfer-baggage crunch, with and without 4 more transfer sortation modules:
    +0 modules (2 servers): peak queue 124 · transfer bags 320 made / 120 missed · contracts passed 2/4 · operating result −$6,993 · capital $0 · ending cash $393,007
    +4 modules (6 servers): peak queue   8 · transfer bags 455 made / 10 missed · contracts passed 4/4 · operating result +$18,344.50 · capital −$36,000 · ending cash $382,344.50
D · overbuilding (nothing new to fly):
    as imported   gates 8 · 3974 passengers · mean delay 2.5 min · operating result +$18,415.50 · capital $0 · ending cash $418,415.50
    overbuilt     gates 10 · 3974 passengers · mean delay 2.5 min · operating result +$18,415.50 · capital −$183,000 · ending cash $235,415.50
```

(Demo B's times run from the fixture's tick 0.)

- **A:** a gate is built and used.
  - Day 2 cannot start until the capacity exists. The pier, A9 and A10 are
    built through the Build tab.
  - GA 431 docks at the new A10 and GA 439 at A9. Their passengers walk the
    pier; both deboard, board, handle bags, turn around with the shared crews
    and fuel units, depart and earn their fees.
  - No flight behaves specially. The new bank loads East security (415
    waiting at 07:26 on day 2), so the next build is obvious.
  - Day 2's operating result is +$15,766 after a $6,000 Northstar penalty.
- **B:** the same passenger, the same inbound, the outbound gate moved. The
  pathfinder's route via the pier adds 2.2 minutes of walk, which turns +0.9
  min into −1.1 min: made becomes missed.
- **C:** four transfer sorters ($36,000) cut the peak queue from 124 to 8 and
  missed transfer bags from 120 to 10. They turn two failed contracts into
  passes, and the operating result from −$7.0k to +$18.3k. The capital is
  recovered in about a day and a half.
- **D:** $183,000 of pier, gates, lanes and a sorter change nothing on a day
  that doesn't need them. Operations are identical to the cent; cash is
  $183,000 lower.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 196 tests, 0 failed (1,160 s). 1,000 standalone deadlock scenarios. The standalone golden baseline is identical |
| New `test_construction.gd` | 16 tests; see below |
| Regression | All M3–M10 tests pass. The M10 plan maximum now comes from built facilities: fuel units 6, which covers the M10 tests and demos |
| `tools/ui_tests.sh` | Airport UI, terminal UI, and the M3–M11 demos: 0 failures |

The 16 construction tests cover:

- **Import:** an unexpanded Riverdale is the M10 day, with the same arrays
  and the same money to the cent.
- **Placement and money:** placement charges exact integer cents once and
  persists through a reload; overlaps and wrong sites are rejected; an
  unaffordable build is refused.
- **Demolition:** a full undo refund, a 50% later refund, capacity restored,
  and A1 protected.
- **Validation:** a disconnected gate blocks the day until the pier is
  built.
- **Navigation:** the route cache belongs to one revision, and the connector
  shortens the real west–east walk.
- **Gates:**
  - new gates carry real accepted flights at A9/A10 (boarded, deboarded,
    bags, fuel, fees)
  - a 787 is rejected by a narrowbody gate
  - the gate location changes a real connection walk
- **Security:** built lanes bound open lanes.
- **Baggage:** more modules mean a shorter queue at the same service time,
  and no more misses.
- **Operations:** facilities bound the plan; build ≠ operate; a bay in use
  can't be demolished.
- **Economics:** unused construction earns nothing (the same revenue and
  operating result, cash lower by the capital).
- **Saves:** a mid-day save of an expanded airport resumes identically, and a
  revision mismatch is rejected; corrupt layouts (duplicate id, shared slot,
  gate on a security site, plan above capacity, v10) are rejected.
- **Determinism:** the same construction gives the same next day.

## Performance

Measured on a shared machine (load average 7–14 from other processes);
comparisons are within one run.

| | Result |
| --- | --- |
| Original / moderate / maximum layout (39 / 44 / 64 objects) | mean 209 / 197 / 200 µs per tick · 4× frame 8.3 / 7.9 / 8.0 ms · worst 5.7 / 4.6 / 5.4 ms |
| Assemble day config + apply layout + validate | 2.3–3.0 ms |
| Validation alone | 1.9–3.1 ms |
| Full route-table rebuild (17 / 19 / 21 nodes) | 8.2 / 12.8 / 20.5 ms (routes are built lazily in play) |
| Day generation | 257–263 ms (24 flights) · 306–312 ms (28 flights, expanded career) |
| Three-day expansion career | mean 197 / 236 / 203 µs per tick; operating +$18.4k / +$36.3k / +$29.0k; capital $150k on day 2, $24k (two lanes) on day 3 |
| Layout in the save | 3.2–3.4 KB |
| Mid-day save | 16.4 MB expanded day 2 (more flights and passengers) vs 14.6 MB unexpanded day 1 · 2.7 s to serialize, 3.4 s to load |
| Between-days save | 0.08 MB · 5 ms / 7 ms |

- **Steady-state cost is unchanged** (the M10 career day 1 in the same
  session: 197–242 µs per tick). The simulation only sees normalized config;
  construction costs time only when editing, validating and generating a
  day.
- **The layout adds a few kilobytes to saves.** The larger expanded mid-day
  save comes from the day's extra flights and passengers (the event history,
  as recorded in M10), not from construction. Event-history compaction
  remains technical debt.

Nothing was optimized.

## Product questions

1. **Can the player spend money to physically change the airport?** **Yes.**
   Gates on new pads, a pier, a connector, lanes, modules and facilities, each
   a capital transaction with a stable id. There are refunds, and demolition
   within the rules.
2. **Do those changes alter the actual passenger, baggage, flight and
   resource simulations rather than abstract stats?** **Yes.**
   - New gates host real flights.
   - Passengers walk the pier's real edges; a connection moved to A10 misses
     by the extra walk.
   - Sortation modules cut a real M7 queue from 124 to 8.
   - Lanes and facilities raise the M2 and M8 maxima.
3. **Can physical expansion enable airline growth that could not fit
   before?** **Yes.** Global Airways' midday 787 and A220 cannot start
   without the pier, A9 and A10. With them they fly and earn $9,422 on day 2.
4. **Can poor expansion choices waste money?** **Yes.** $183,000 of unused
   capacity leaves operations identical to the cent and cash $183,000 lower.
   Validation stops broken airports, not bad investments.
5. **Does the airport now feel like something the player is building over
   multiple days rather than merely operating?** **Yes.**
   - Each day's report ends in a plan and a build screen.
   - Growth creates visible bottlenecks: the new midday bank backs up East
     security. A lane and staffing are the next spend, paid for by the day's
     revenue.
   - The layout, revision and capital history persist across days and saves.

## Limitations

- **Predefined sites only:** two expansion pads, two terminal pieces, and
  row/yard slots. No free placement, terrain or land purchase.
- **Runway, taxiways and apron are fixed** (M12). Gates attach to the
  existing taxi line.
- **One reclaim hall:** reclaim belts add delivery servers, not separate
  carousels with flight assignment.
- **No construction time or closures;** building happens only between days.
- **The security staff pool is fixed** (8, with 6 assigned by default): extra
  lanes can only open as far as that pool allows.
- **Mid-day saves stay large** (about 15–16 MB, a few seconds) because of the
  within-day event history.
- **The full test suite takes about 20 minutes.**
