# M6 completion report: connecting passengers

Implemented on 2026-09-24 from M5 `029ad4f`, against [m6-plan.md](m6-plan.md).
Decisions D-031 to D-033. M7 has not started.

## Delivered

- **One passenger, two aircraft.** A connector is an arriving `Passenger` with
  `itinerary_legs = [inbound, outbound]`, a leg index, one seat per leg, and a
  connection status. `current_flight_id` follows the current leg. The same
  object goes:

  > on_aircraft (inbound) → deboarding → walking_to_gate → waiting_at_gate →
  > boarding → on_aircraft (outbound) → departed

  The seat switches to the outbound seat at the leg change, and the cabin states
  stay a separate layer. No copy is made and nobody despawns. More legs later
  means longer arrays.
- **Manifests.** Connectors are on the outbound flight's manifest from
  generation onward, so its gate close counts them missing.
- **Generation.** Deterministic, from a dedicated stream. About 12% of arrivals
  connect, by arriving airline: GA 22% (hub), NS 15%, AW 12%, SJ 10%.
  Connections are created only when ideally reachable: planned deboarding start
  + the passenger's row share + ideal gate-to-gate walk ≤ the outbound's
  scheduled D-10 close. Never the same flight, never back to the origin, never
  beyond 150 minutes, and only into a free seat.
- **Transfer.** Airside, with no re-screening, using the cached terminal routes.
  The 787 widebody deboarding abstraction releases connectors to their gates
  and local passengers to the exit.
- **Gate close and hold.** The M3 mechanism is unchanged: HOLD +5 MIN, a
  15-minute maximum, CLOSE GATE, and automatic close.
  - The flight details now show booked (and connecting), at gate, and a
    headline such as *3 connecting inbound (NS 249) · next at gate 06:45 · last
    06:51 after close*, with up to three named connectors, their status and
    ETA.
  - Alerts are grouped per outbound flight: *AW 228 · 4 missing (3
    connecting)*.
- **Missed connections.** The passenger is marked `missed` at close, with the
  reason. They keep walking and end at the closed gate as `missed_connection`,
  stranded. This is a temporary endpoint; there is no rebooking.
- **Causality.** `connection_report()` gives, from recorded ticks: inbound
  lateness, time from doors open to off the aircraft, transfer walk, arrival at
  the gate vs close, and hold vs limit. It names the decisive factor, for
  example *inbound flight arrived late (+18.0 min); gate closed without a hold*.
- **Follow a connector.** A CONNECTING *A → B* header shows the gate, the close
  countdown, the ETA and ON TRACK / CONNECTION AT RISK / CONNECTION MADE /
  MISSED CONNECTION. **View deboarding** and **View boarding** follow them in
  both cabins. The Passengers tab marks them CX.
- **Metrics.** Connecting, made, missed, success rate, mean transfer time and
  minimum margin, shown in the top bar. Per-flight `connections_made` and
  `connections_missed` are kept, alongside hold minutes and punctuality, for
  M9.
- **Save schema v6.** A save while a connector is seated inbound, deboarding,
  walking, waiting or boarding resumes identically. v5 is rejected.

## Demonstration: the connection bank

Run `tools/ui_tests.sh tests/m6_demo.gd`. It writes `/tmp/m6-demo-01…05*.png`.

NS 249 (gate A5) is 18 minutes late. Seats 1A, 28C, 19D and 26E connect to
AW 228 (gate A2, closes 06:47). Following P4546 from 1A:

```
  05:15:00  P4546 seated in 1A on NS 249, booked on AW 228
  06:37:29  NS 249 docked 06:36:00 (18 min late); P4546 in the aisle
  06:37:33  Off NS 249 at A5; walking airside to A2 (seat switched to 28E)
  06:42:12  At A2 06:42:12; admitted to AW 228's door queue
  06:45:15  Alert: East security · 218 waiting / AW 228 · 4 missing (3 connecting) · gate closes in 2 min
  06:47:15  AW 228 gate closed 06:47:15 (no hold)
  06:50:29  P4546 seated in 28E on AW 228 (connection made)

  Without a hold (AW 228 departed 06:57:35, Runway queue +0.3 min):
    1A   off 06:37:33  at A2 06:42:12  vs close 06:47:15  → MADE
    28C  off 06:40:13  at A2 06:45:15  vs close 06:47:15  → MADE
    19D  off 06:44:20  at A2 06:49:15  vs close 06:47:15  → MISSED  (inbound flight arrived late (+18.0 min); gate closed without a hold)
    26E  off 06:45:28  at A2 06:51:44  vs close 06:47:15  → MISSED  (inbound flight arrived late (+18.0 min); gate closed without a hold)

  With HOLD +5 MIN (AW 228 departed 07:03:35, Runway queue +1.3 min, Passenger hold +5.0 min):
    all four MADE (26E by 31 s)
```

The fourth missing passenger in the alert is the M3 demo's deliberately late
local passenger.

## Baseline (full morning, default config)

| | M5 | M6 |
| --- | --- | --- |
| Passengers | 7,986 | 7,986, of whom 493 connect |
| Connections | — | 483 made, 10 missed (98.0%); mean transfer 4.0 min; tightest made margin 0.1 min |
| Late departures (any / > 5 min) | 14 / 2 | 16 / 5 |
| Mean delay | 1.6 min | 3.0 min |
| Delay by cause (min) | runway 16.1, cleaning 11.2, deboarding 6.8, boarding 2.7 | runway 16.9, late inbound 16.9, cleaning 15.1, boarding 10.5, deboarding 8.3, fueling 3.6 |

The five flights more than 5 minutes late:

- **The three demo flights:** GA 242 (deep clean), SJ 235 (slow door) and
  NS 249 (18 min late inbound).
- **Two SJ A321s** (SJ 291 and SJ 347), where boarding at near-full loads, a
  gate-conflict late inbound, and fueling (SJ 291) add up.

Strategy benchmark (every cabin flight on one strategy):

| Strategy | Flights delayed by boarding | Boarding delay |
| --- | --- | --- |
| Window/Middle/Aisle | 0 | 0 min |
| Random | 5 | 10.5 min |
| Back-to-front | 12 | 49.0 min |
| Front-to-back | 14 | 88.0 min |

Boarding matters more than in M5 because flights are fuller (see the open
question).

### Open question: connectors on top of the configured load

Connectors are **added** to their outbound flight, up to its free seats. They
don't replace local bookings, so outbound loads average **92.7%** against the
configured **82.4%**. That is why punctuality and boarding delays got worse
from M5.

Two ways to go:

- **Keep it:** connecting traffic genuinely adds demand.
- **Make the load factor mean total booked:** reduce local outbound bookings by
  each flight's expected connecting share.

I haven't changed this; it is a design decision. If you want the second, it is
a small change to generation plus a baseline re-tune.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 107 tests, 0 failed. Sweeps: 1,000 standalone deadlock scenarios, 300 incremental admission, 300 deboarding |
| New `test_connections.gd` (13 tests) | identity across both aircraft; manifests and never on two aircraft; missed connection stranded at the closed gate with its cause; hold saves the connection and costs departure time and gate time; early inbound; late inbound turns a connection into a miss; slow deboarding turns one into a miss; gate distance decides a tight connection; mid-connection save resumes identically in 4 phases; same seed, same connections; widebody connectors; Riverdale itineraries valid (8–20% connect) and the demo bank decisive |
| Regression | all M3–M5 tests pass. Earlier fixtures opt out of connections; M5's full-morning check accepts connector endpoints; the M3 demo counts connection misses separately. Standalone golden baseline identical |
| `tools/ui_tests.sh` | airport UI, terminal UI, M3, M4, M5 and M6 demos: 0 failures |

## Performance

| | M5 | M6 |
| --- | --- | --- |
| Mean airport tick (default morning) | 138–163 µs | 149–167 µs |
| Worst tick | 2.9–3.2 ms | 3.0–3.8 ms |
| 100-flight stress (mean / worst) | 318 µs / 3.7 ms | 332 µs / 3.8 ms |
| Simulation per frame at 4× | 5.5–6.5 ms | 6.0–6.7 ms |
| Peak active passengers | 2,246 | 2,467 (connectors stay in the terminal) |

Profile (µs per tick): flights 34, passenger flow (including pathfinding) 8,
boarding cabins 27, deboarding cabins 56.

**Connection processing.** At runtime there is no per-tick connection work
beyond normal passenger flow: connectors reuse the cached routes and the
existing boarding admission. Generation runs once at setup. Setup takes
205 ms with the default rates and 227 ms with 40% of arrivals connecting (795
connectors, 98.6% made, same tick cost).

Nothing was optimized; no profile showed a regression.

## Limitations

- **Stranded passengers are not rebooked.** No hotels, no compensation.
- **No baggage transfer (M7), customs or immigration.** Transfers are airside
  only.
- **Two legs at most.**
- **Connectors add to outbound loads** (see the open question).
- **Estimated arrival times before the inbound docks are schedule-based.** They
  don't foresee runway queues.
- **The full test suite takes 7.4 minutes;** the quick run takes about 3.5.

## Product questions

1. **Can the player follow one actual human from one airplane onto another?**
   **Yes.** P4546 is the same object and id from NS 249 seat 1A, through the
   aisle, off at A5, along the concourse, at gate A2, and in AW 228's door queue,
   to seat 28E, and on departure. **View deboarding** and **View boarding**
   follow them in both cabins.
2. **Can inbound delay, deboarding and terminal layout genuinely determine
   whether that person makes the connection?** **Yes.** Each has its own test,
   in which that factor alone turns a made connection into a miss:
   - an 8-minute late inbound
   - a restricted jet-bridge door
   - the far gate (A2) instead of the near one (A6) at the same close time

   The miss report names the decisive factor from recorded times.
3. **Does holding an outbound flight create an understandable trade-off?**
   **Yes.** At AW 228's alert the player sees three connectors inbound from
   NS 249, the last arriving after close. Doing nothing strands two, and the
   flight leaves on time. HOLD +5 MIN saves all four; the flight leaves
   6.3 minutes late (5.0 hold + 1.3 runway queue from the lost slot) and holds
   the gate longer. Both outcomes are explained on screen.
