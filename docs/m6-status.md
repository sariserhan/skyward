# M6 completion report: connecting passengers

Implemented on 2026-09-24 from M5 `029ad4f`, against [m6-plan.md](m6-plan.md).
Decisions D-031 to D-034; D-034 is the closeout, in which a flight's load means
total bookings. M7 has not started.

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
- **Manifests and bookings.** Connectors are on the outbound flight's manifest
  from generation onward, so its gate close counts them missing. A flight's load
  is its **total bookings** (D-034): target = capacity × load; connectors take
  booked seats, and local passengers fill only the rest. Flights record target,
  originating and connecting bookings, with boarded count kept separately.
- **Generation.** Deterministic, from a dedicated stream. About 13% of arrivals
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
AW 228 (gate A2, closes 06:47). Following P0565 from 1A (after the closeout,
inbound passengers take the low ids):

```
  05:15:00  P0565 seated in 1A on NS 249, booked on AW 228
  06:37:29  NS 249 docked 06:36:00 (18 min late); P0565 in the aisle
  06:37:33  Off NS 249 at A5; walking airside to A2 (seat switched to 23B)
  06:42:12  At A2 06:42:12; admitted to AW 228's door queue
  06:45:15  Alert: East security · 163 waiting / AW 228 · 4 missing (3 connecting) · gate closes in 2 min
  06:47:15  AW 228 gate closed 06:47:15 (no hold)
  06:47:15  P0565 seated in 23B on AW 228 (connection made)

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

## Baseline (full morning, default config), after the closeout

| | M5 | M6 as first committed (connectors on top) | M6 closeout (total bookings) |
| --- | --- | --- | --- |
| Outbound load: configured / booked / boarded | 82.4 / 82.4 / — % | 82.4 / 92.7 / — % | 82.4 / 82.1 / 81.8 % |
| Booked load range by flight | — | — | 69–94% |
| Outbound bookings: originating + connecting | 3,981 + 0 | 3,981 + 493 | 3,448 + 533 = 3,981 |
| Passengers in the morning | 7,986 | 7,986 | 7,453 (4,005 arriving, of whom 533 connect, + 3,448 originating) |
| Connections made / missed | — | 483 / 10 (98.0%) | 523 / 10 (98.1%); mean transfer 4.2 min; tightest made margin 5 s |
| Flights delayed by boarding | 2 | 5 | 1 (2.5 min) |
| Late departures (any / > 5 min) | 14 / 2 | 16 / 5 | 14 / 3 |
| Mean delay | 1.6 min | 3.0 min | 1.9 min |
| Empty seats at departure | — | — | 866 (bookings below capacity, plus missed passengers and connections) |
| Security wait p50 / p90 | 4.4 / 30.9 min | 1.7 / 30.3 min | 0.4 / 15.9 min (fewer locals through security) |

With total-bookings semantics, the booked load averages 82.1%. It is slightly
below the configured 82.4% because each flight's target is rounded down. Only
the three demo flights are more than 5 minutes late:

| Flight | Late | Cause |
| --- | --- | --- |
| GA 242 | +11.4 min | deep clean |
| NS 249 | +13.8 min | 18 min late inbound |
| SJ 235 | +6.8 min | slow jet-bridge door |

Delay by cause (minutes): late inbound 11.9, cleaning 11.4, runway queue 11.2,
deboarding 6.8, boarding 2.5, fueling 2.1.

Strategy benchmark (every cabin flight on one strategy):

| Strategy | Flights delayed by boarding | Boarding delay | Mean delay |
| --- | --- | --- | --- |
| Window/Middle/Aisle | 0 | 0 min | 1.2 min |
| Random | 1 | 2.5 min | 1.9 min |
| Back-to-front | 6 | 17.5 min | 4.0 min |
| Front-to-back | 9 | 50.4 min | 6.0 min |

Connections now create difficulty through timing and coordination, not through
extra passengers.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 108 tests, 0 failed. Sweeps: 1,000 standalone deadlock scenarios, 300 incremental admission, 300 deboarding |
| New `test_connections.gd` (14 tests) | connections fill bookings and never add to them (target, split, one booking per seat); every Riverdale manifest equals its target; identity across both aircraft; manifests and never on two aircraft; missed connection stranded at the closed gate with its cause; hold saves the connection and costs departure time and gate time; early inbound; late inbound turns a connection into a miss; slow deboarding turns one into a miss; gate distance decides a tight connection; mid-connection save resumes identically in 4 phases; same seed, same connections; widebody connectors; Riverdale itineraries valid (8–20% connect) and the demo bank decisive |
| Regression | all M3–M5 tests pass. Earlier fixtures opt out of connections; M5's full-morning check accepts connector endpoints; the M3 demo counts connection misses separately. Standalone golden baseline identical |
| `tools/ui_tests.sh` | airport UI, terminal UI, M3, M4, M5 and M6 demos: 0 failures |

## Performance (after the closeout)

| | M5 | M6 |
| --- | --- | --- |
| Mean airport tick (default morning) | 138–163 µs | 143–160 µs |
| Worst tick | 2.9–3.2 ms | 3.1–4.9 ms |
| 100-flight stress (mean / worst) | 318 µs / 3.7 ms | 332 µs / 3.7 ms |
| Simulation per frame at 4× | 5.5–6.5 ms | 5.7–6.4 ms |
| Peak active passengers | 2,246 | 2,222 |

Profile (µs per tick): flights 34, passenger flow (including pathfinding) 7,
boarding cabins 27, deboarding cabins 57.

**Connection processing.** At runtime there is no per-tick connection work
beyond normal passenger flow: connectors reuse the cached routes and the
existing boarding admission. Generation runs once at setup: 191 ms with the
default rates, and 257 ms with 40% of arrivals connecting (1,544 connectors,
98.6% made, the same tick cost).

The worst-tick range includes one 4.9 ms reading taken while another benchmark
ran alongside. Nothing was optimized; no profile showed a regression.

## Limitations

- **Stranded passengers are not rebooked.** No hotels, no compensation.
- **No baggage transfer (M7), customs or immigration.** Transfers are airside
  only.
- **Two legs at most.**
- **Estimated arrival times before the inbound docks are schedule-based.** They
  don't foresee runway queues.
- **The full test suite takes about 7 minutes;** the quick run takes about 4.
- **No overbooking, standby or excess demand yet.** Normal generation never
  exceeds a flight's target bookings.

## Product questions

1. **Can the player follow one actual human from one airplane onto another?**
   **Yes.** P0565 is the same object and id from NS 249 seat 1A, through the
   aisle, off at A5, along the concourse, at gate A2, and in AW 228's door queue,
   to seat 23B, and on departure. **View deboarding** and **View boarding**
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
