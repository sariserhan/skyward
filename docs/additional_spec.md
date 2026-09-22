# Airport Operations Simulator + Boarding Simulation

## Agent-Ready Product & Engineering Specification

## 0. Mission

Build a simulation game centered on **operating an airport**, where flights, aircraft, passengers, baggage, gates, security, boarding, deboarding, connections, and delays interact as one system.

The existing aircraft-boarding simulation must become a **deep subsystem of the airport simulation**, not a separate disconnected game.

The core idea:

```text
AIRPORT OPERATIONS
        ↓
FLIGHT ARRIVES
        ↓
AIRCRAFT TURNAROUND
        ↓
DEBOARDING
        ↓
PASSENGERS / BAGGAGE / CONNECTIONS
        ↓
BOARDING
        ↓
DEPARTURE
        ↓
RESULTS AFFECT AIRPORT
```

The game should create cascading operational consequences.

Example:

```text
Security queue too long
        ↓
passengers reach gate late
        ↓
boarding delayed
        ↓
aircraft misses departure slot
        ↓
gate remains occupied
        ↓
next aircraft waits
        ↓
gate change
        ↓
more passenger walking
        ↓
more missed connections
```

The player should constantly think:

> "If I fix this bottleneck, can I get the airport running smoothly again?"

This is the core gameplay loop.

---

# 1. Existing Boarding Project

There is already an aircraft-boarding simulation project.

Important existing direction:

* Godot client
* Convex backend
* Better Auth
* deterministic seeded simulation
* simulation/render separation
* V1 originally centered on boarding optimization
* aisle modeled roughly as one cell per aircraft row
* seat interference affects boarding
* passengers and baggage behavior can influence boarding time

Future ideas already associated with the boarding project include:

* deboarding
* checked baggage
* missed/misrouted luggage
* customs/immigration
* flight connections
* airport operational irregularities
* real airport layouts
* real airline/aircraft integrations later
* eventual boarding-pass scanning / actual-trip scenarios

Do NOT throw this work away.

The airport simulator should absorb and expand it.

---

# 2. Product Structure

Think of the product in layers.

```text
LEVEL 1 — AIRPORT
Runways
Taxiways
Gates
Terminal
Security
Baggage
Passenger flows
Flight schedule

        ↓

LEVEL 2 — FLIGHT TURNAROUND
Aircraft arrival
Gate assignment
Deboarding
Cleaning
Fuel
Catering
Baggage unloading/loading
Boarding
Pushback

        ↓

LEVEL 3 — PASSENGER
Walking
Security
Connections
Gate arrival
Boarding
Seat interaction
Carry-on behavior

        ↓

LEVEL 4 — BAG
Unload
Sort
Transfer
Load
Misroute
Claim
```

All levels must share the same underlying simulation state.

Do NOT implement separate incompatible passenger models for airport and boarding.

---

# 3. Important Product Decision

For initial versions:

**The player operates the airport.**

The player does NOT own an airline yet.

Airlines are simulated customers.

Later we may create an airline-management layer.

For now airlines:

* schedule flights
* use gates
* bring passengers
* have service requirements
* have satisfaction
* may increase/decrease service depending on airport performance

---

# 4. Example Player Experience

Airport:

```text
RIVERDALE INTERNATIONAL

Runways: 1
Gates: 8
Passengers today: 1,842

On-time departures: 84%
Average security: 17 min
Average turnaround: 49 min
Mishandled bags: 8
Missed connections: 21
```

Schedule:

```text
08:10  UA221   Chicago       B2
08:25  TK008   Istanbul      C1
08:30  AA918   Dallas        A4
08:45  DL403   Atlanta       B3
```

Player clicks TK008:

```text
TK008
Washington → Istanbul

Aircraft: Boeing 787-9
Gate: C1
Passengers: 276

Scheduled departure: 08:25
Estimated departure: 08:31

Boarding status:
NOT STARTED

[OPEN TURNAROUND]
```

Inside turnaround:

```text
Deboarding       COMPLETE
Cleaning         80%
Catering         COMPLETE
Fuel             COMPLETE
Baggage unload   COMPLETE
Baggage load     61%
Boarding         READY
```

Player starts boarding.

The existing boarding simulation becomes active.

Result:

```text
Boarding complete

Expected: 24:00
Actual:   31:42

Delay: +7:42

Causes:
- 9 aisle blockages
- 17 oversized carry-ons
- 4 late passengers
- 3 seat-interference events
```

Result returns to airport simulation.

Flight now departs late.

That lateness affects the larger system.

---

# 5. Core Game Loop

```text
Schedule arrives
      ↓
Manage airport capacity
      ↓
Assign / maintain gates
      ↓
Move passengers
      ↓
Handle baggage
      ↓
Turn aircraft around
      ↓
Board flights
      ↓
Flights depart
      ↓
Performance measured
      ↓
Earn money / reputation
      ↓
Expand airport
      ↓
More flights
      ↓
More complexity
```

---

# 6. Primary Metrics

Track at least:

```text
on-time departure %
average departure delay
average arrival delay

passengers processed
missed connections
passenger satisfaction

average security wait
average gate wait

average turnaround time

baggage mishandled
bags missed
bags delayed

gate utilization
runway utilization

airline satisfaction

airport revenue
airport expenses
```

---

# 7. Technology

Continue using:

```text
Godot
GDScript

Convex
Better Auth

Web export later / where appropriate
```

Do not rewrite the simulation into React.

Godot owns:

* simulation
* airport map
* passengers
* aircraft
* visual rendering
* interaction
* boarding simulation

Backend owns:

* accounts
* saved airports
* progression
* leaderboards later
* cloud saves
* shared scenarios later
* user-generated content later

---

# 8. Critical Architecture Rule

Simulation must remain independent from rendering.

Structure conceptually:

```text
simulation/
    airport/
    flights/
    passengers/
    baggage/
    turnaround/
    boarding/

render/
    airport/
    aircraft/
    passengers/
    UI/
```

Simulation code should be testable without rendering thousands of sprites.

Never make visual nodes the canonical state.

---

# 9. Determinism

Simulation should be deterministic given:

```text
scenario
seed
player decisions
```

Store seed.

Example:

```text
Scenario:
Morning Rush

Seed:
8492014
```

Same strategy + same inputs should reproduce the same result.

This is important for:

* testing
* leaderboards
* challenges
* replay
* comparing strategies
* debugging

Avoid simulation-critical randomness directly from global RNG.

Use seeded RNG through controlled simulation services.

---

# 10. Simulation Clock

Create one authoritative simulation clock.

Support:

```text
pause
1x
2x
4x
```

Possibly later:

```text
8x
```

All systems operate against simulation time, not real frame time.

Simulation should support fixed-step processing.

Example:

```text
SIM_TICK = 0.1 seconds
```

Exact value may be adjusted through profiling.

Rendering may interpolate independently.

---

# 11. Core Domain Entities

Create clear domain models.

## Airport

```text
Airport
id
name
money
reputation
current_sim_time

runways[]
gates[]
terminal_nodes[]
security_checkpoints[]
baggage_systems[]
airlines[]
flights[]
passengers[]
bags[]
```

---

# 12. Flight

Canonical flight model:

```text
Flight
id

airline_id
flight_number

origin
destination

aircraft_id

scheduled_arrival
actual_arrival

scheduled_departure
estimated_departure
actual_departure

assigned_gate_id

passenger_ids[]
bag_ids[]

status

delay_reasons[]
```

Status:

```text
scheduled
approaching
landed
taxiing_in
at_gate
deboarding
turnaround
boarding
ready_for_pushback
taxiing_out
departed
cancelled
```

---

# 13. Aircraft

```text
Aircraft
id
aircraft_type_id

seat_map
seat_capacity

carry_on_capacity
checked_bag_capacity

boarding_door_configuration

required_gate_type

turnaround_requirements
```

Aircraft type data:

```text
A220
737-800
737 MAX 8
A321neo
787-9
A350
```

Do NOT use dozens initially.

---

# 14. Passenger

There must be ONE canonical passenger representation.

```text
Passenger
id

current_flight_id
itinerary_id

origin
destination

seat

boarding_group

checked_bag_ids[]

carry_on_count
carry_on_size_class

walking_speed

mobility_profile

travel_party_id nullable

connection_flight_id nullable

arrival_time_at_airport
gate_arrival_time

current_location
state

satisfaction

risk_flags
```

Passenger states might include:

```text
not_arrived
terminal_entry
check_in
security_queue
security_processing
walking_to_gate
waiting_at_gate
boarding_queue
boarding_aircraft
seated
in_flight
deboarding
walking_to_connection
baggage_claim
exited
missed_flight
```

Do not model unnecessary personal demographic attributes.

---

# 15. Passenger Itinerary

A passenger may have multiple flights.

```text
PassengerItinerary
passenger_id

segments:
[
 IAD → ORD
 ORD → SFO
]
```

This enables connection simulation.

For early V1:

support:

```text
direct
one connection
```

Do not model arbitrary multi-day itineraries initially.

---

# 16. Travel Parties

Some passengers travel together.

```text
TravelParty
id
passenger_ids[]
behavior
```

Examples:

```text
family
couple
group
individual
```

Party members may:

* wait for each other
* board together
* move more slowly
* create seating interactions

Keep behavior simple initially.

---

# 17. Baggage

Every checked bag is its own simulation object.

```text
Bag
id

passenger_id

current_flight_id
final_destination

state
location

connection_flight_id nullable

loaded_aircraft_id nullable

misrouted
```

States:

```text
checked
conveyor
sorting
cart
aircraft
unloading
transfer_sort
claim
delivered
misrouted
lost
```

Do NOT simulate every physical centimeter of conveyor machinery initially.

Use logical nodes and travel times.

---

# 18. Gates

```text
Gate
id
terminal
type

supported_aircraft_classes

occupied_by_flight_id nullable

available_from
available_until

boarding_capacity

jet_bridge_count
```

Gate conflicts matter.

Example:

```text
TK008 late by 14 min

Next:
UA921 scheduled at same gate
```

Player must:

```text
wait
reassign gate
delay incoming aircraft
```

---

# 19. Gate Assignment

V1:

Player may manually assign gates.

System should warn about:

```text
aircraft incompatibility
time overlap
insufficient turnaround buffer
terminal constraints
```

Later:

automatic assignment assistant.

Do not build advanced optimization initially.

---

# 20. Runway

V1 may use one runway.

Model:

```text
Runway
id

occupied_until
queue[]
```

Operations:

```text
landing
takeoff
```

Require separation time.

Example:

```text
landing occupies 70 sec
takeoff occupies 55 sec
minimum separation 40 sec
```

Numbers should be configurable simulation values, not claims of real-world operational procedure.

---

# 21. Taxiing

Do not build full realistic ATC initially.

V1:

```text
runway
→ taxi travel time
→ gate
```

Aircraft visually follow defined taxi paths.

Later:

* taxiway congestion
* runway crossings
* holding points

---

# 22. Terminal Graph

Passenger movement must use a navigation graph.

Nodes may include:

```text
entrance
check-in
security
junction
shop
restroom
gate
baggage claim
immigration later
exit
```

Edges:

```text
distance
walking_time
capacity
```

Godot navigation may handle visual walking, but simulation logic must remain capable of calculating expected route/time independently.

---

# 23. Security

Security is initially a queueing system.

```text
SecurityCheckpoint
lanes
service_rate
queue
```

Passenger:

```text
arrive queue
↓
wait
↓
process
↓
continue
```

Player can:

```text
open lane
close lane
assign staff
```

Later add:

* priority lanes
* secondary screening
* terminal-specific checkpoints

Not required initially.

---

# 24. Airport Passenger Flow

Departing passenger:

```text
airport entrance
↓
check-in abstraction
↓
security
↓
terminal walking
↓
gate
↓
boarding
```

Arriving passenger:

```text
aircraft
↓
deboarding
↓
terminal
↓
connection OR baggage claim
↓
exit
```

Connection passenger:

```text
aircraft
↓
deboarding
↓
connection route
↓
next gate
↓
boarding
```

Customs/immigration comes later.

---

# 25. Flight Turnaround

This is one of the most important systems.

Canonical turnaround:

```text
arrival
↓
gate docking
↓
deboarding
↓
baggage unloading
↓
cleaning
↓
catering
↓
fuel
↓
baggage loading
↓
boarding
↓
door close
↓
pushback
```

Some operations may occur in parallel.

Example:

```text
          ┌─ cleaning
deboard ──┼─ catering
          ├─ baggage unload → baggage load
          └─ fueling
                     ↓
                  boarding
```

Implement dependencies explicitly.

---

# 26. Turnaround Task

Model tasks as:

```text
TurnaroundTask
type

flight_id

required
state

start_time
end_time

duration

dependencies[]

assigned_resource nullable
```

Task types:

```text
deboarding
cleaning
fuel
catering
baggage_unload
baggage_load
boarding
```

Possible states:

```text
blocked
ready
in_progress
complete
failed
```

---

# 27. Turnaround Resources

Later resource constraints create strategy.

Examples:

```text
cleaning crews
fuel trucks
baggage crews
catering trucks
gate agents
```

Initial V1 may abstract some resources.

At minimum make architecture support them.

Do NOT require all resource types to ship first playable build.

---

# 28. Boarding Engine Integration

The existing boarding simulation must become:

```text
BoardingSimulation
```

Input:

```text
Flight
Aircraft
Passengers
BoardingStrategy
Seed
AirportContext
```

Output:

```text
BoardingResult
duration

passengers_boarded

late_passengers
aisle_block_events
seat_interference_events
carry_on_delay_events

completion_time
delay_minutes

event_log
```

No airport-specific UI should exist inside the core boarding engine.

The airport passes a scenario into it.

The boarding engine returns result/state.

---

# 29. Boarding Strategies

Support at least:

```text
random
back_to_front
front_to_back
window_middle_aisle
boarding_groups
```

Allow future:

```text
custom strategy
```

Custom strategy must NOT be required for airport V1.

---

# 30. Late Passengers

Passengers may reach gate after boarding begins.

Example:

```text
Passenger 342

security delay
↓
reaches gate 8 min late
↓
still boards
↓
causes interference
```

Some may miss boarding cutoff entirely.

Result:

```text
missed_flight
```

This should affect:

```text
passenger satisfaction
connection handling later
airline satisfaction
```

---

# 31. Deboarding

Add as separate simulation subsystem.

Input:

```text
aircraft
passengers
seat layout
carry-ons
door configuration
```

Output:

```text
deboarding duration
passenger exit times
connection availability times
```

Deboarding affects connecting passengers.

Example:

```text
Passenger seated 42A
tight connection
slow deboarding
↓
misses next flight
```

---

# 32. Connections

Connections are one of the key differentiators.

Passenger:

```text
TK007
Istanbul → Washington

connection:

AA1832
Washington → Miami
```

Track:

```text
arrival gate
deboarding time
walking time
security/recheck later
next gate
boarding cutoff
```

For first version:

```text
connection success =
deboard complete
+ walking time
<= boarding cutoff
```

Later include customs/security/recheck.

---

# 33. Missed Connection

When a passenger misses:

```text
state = missed_connection
```

Effects:

```text
passenger satisfaction decreases
airline satisfaction decreases
statistics update
bag may become disconnected
```

Rebooking can be introduced later.

Do not build full airline reservation systems initially.

---

# 34. Baggage + Passenger Separation

Passenger and bag must remain independent objects.

Example:

```text
Passenger:
boards Miami flight

Bag:
misses transfer
```

Result:

```text
Passenger arrives Miami
Bag remains Washington
```

Track:

```text
mishandled_bag
```

This should contribute to airport performance score.

---

# 35. Airline Model

Airlines are simulated customers.

```text
Airline
id
name
code

satisfaction
relationship

flights_per_day

service_requirements
```

Use fictional airlines in early versions.

Examples:

```text
Northstar Air
Atlantic Wings
SunJet
Global Airways
```

Do NOT use real airline branding without permission.

---

# 36. Airline Satisfaction

Affected by:

```text
departure punctuality
gate availability
turnaround performance
baggage handling
passenger satisfaction
```

Example:

```text
Northstar Air

Satisfaction: 82

+ good baggage handling
+ short turnaround
- frequent gate changes
```

Later airlines can:

```text
add routes
remove routes
request gates
offer contracts
```

---

# 37. Economy

Player earns from:

```text
landing fees
gate fees
passenger fees
commercial revenue later
airline contracts later
```

Player spends on:

```text
staff
gate operations
security
maintenance
expansion
equipment
```

V1 economy can remain simplified.

Do not spend excessive development time balancing financial realism before simulation is fun.

---

# 38. Airport Expansion

Future player upgrades:

```text
new gates
larger terminal
additional security
baggage capacity
new runway
better equipment
staff
shops
lounges
```

For first playable:

allow:

```text
add gate
upgrade security
increase baggage throughput
```

Full freeform airport construction is NOT required initially.

---

# 39. Game Modes

## Scenario Mode

Primary first mode.

Example:

```text
Morning Rush

Run one airport
06:00–12:00

Objective:
90% on-time departures
<15 minute security wait
<10 mishandled bags
```

Excellent for development/testing.

---

## Sandbox

Later.

Player runs airport indefinitely.

---

## Challenge Mode

Later.

Same scenario + same seed.

Players compare:

```text
score
delay
missed connections
baggage
```

Determinism makes this viable.

---

# 40. Scoring

Do not rely solely on money.

Possible score:

```text
Operational Score

On-time performance        30%
Passenger satisfaction     20%
Connections                15%
Baggage                    15%
Turnaround efficiency      10%
Financial result           10%
```

Exact weights TBD.

No online leaderboard required initially.

---

# 41. Visual Style

Use clean stylized 2D or 2.5D/isometric presentation.

Do not chase realistic 3D graphics.

Priority:

```text
readability
simulation visibility
lots of moving passengers
aircraft operations
clear bottlenecks
satisfying airport activity
```

Player should visually understand:

```text
why a queue exists
where passengers are
why a flight is delayed
where baggage is stuck
```

---

# 42. Airport Map

First airport should be developer-created.

Example:

```text
1 runway
1 terminal
8 gates

2 security checkpoints
1 baggage system
```

Do NOT implement user airport construction before the operational simulation is proven.

---

# 43. UI

Main screen:

```text
┌────────────────────────────────────────┐
│ 08:17   $1.8M   Score 83   Delay 7m   │
├────────────────────────────────────────┤
│                                        │
│             AIRPORT MAP                │
│                                        │
│ ✈ runway                               │
│                                        │
│ Terminal                               │
│ Gate A1  Gate A2 ...                   │
│ 👤👤👤                                 │
│                                        │
├────────────────────────────────────────┤
│ Flights | Alerts | Passengers | Stats │
└────────────────────────────────────────┘
```

---

# 44. Alerts

Generate actionable alerts.

Examples:

```text
TK008 boarding delayed
Security checkpoint A > 20 min
Gate B4 conflict in 12 minutes
37 passengers at risk of missed connection
Baggage system overloaded
```

Click alert → camera focuses relevant area.

Do not overwhelm player.

Prioritize severity.

---

# 45. Flight Detail

Clicking aircraft/flight opens:

```text
Flight
Aircraft
Gate
Schedule

Passengers
Connections
Baggage

Turnaround tasks

Delay causes

[Open Boarding]
```

---

# 46. Passenger Inspector

Click passenger:

```text
AYSE KAYA

Current:
Walking to Gate C4

Flight:
TK008

Seat:
34A

Connection:
None

Bags:
1 checked

Status:
On time
```

Connection passenger:

```text
JOHN DOE

Arrived:
UA221

Connecting:
AA918

Time remaining:
18 min

Estimated walk:
11 min

Status:
AT RISK
```

This should be one of the most satisfying features.

---

# 47. Bag Inspector

Click bag:

```text
BAG 938124

Passenger:
John Doe

Flight:
AA918

Current:
Transfer Sorting

Destination:
Dallas

Status:
On track
```

Later:

```text
MISROUTED
Loaded onto UA329
```

---

# 48. Delay Attribution

Every delay should have explicit causes.

Example:

```text
TK008
+14:23 delay

Security late passengers   +3:10
Baggage loading            +4:21
Boarding interference      +5:52
Gate agent delay           +1:00
```

Store delay causes structurally.

Do NOT simply increment one generic delay variable.

---

# 49. Event Log

Simulation should emit structured events.

Example:

```text
PASSENGER_SECURITY_ENTER
PASSENGER_SECURITY_EXIT

PASSENGER_GATE_ARRIVE

BOARDING_STARTED
PASSENGER_BOARDED
BOARDING_COMPLETED

BAG_TRANSFER_STARTED
BAG_LOADED

FLIGHT_GATE_ARRIVAL
FLIGHT_PUSHBACK
FLIGHT_DEPARTED

CONNECTION_MISSED
BAG_MISROUTED
```

This event architecture can drive:

```text
UI
analytics
debugging
replay
scoring
```

---

# 50. Simulation Performance

Do NOT create heavyweight Godot nodes for every simulation entity if thousands are present.

Use lightweight data/state objects where possible.

Rendering should use:

```text
pooling
visibility culling
LOD-like simplification
```

Simulation may know about 5,000 passengers while only hundreds are visually detailed.

Profile early.

---

# 51. Save Game

Save:

```text
scenario
seed

simulation time

airport state
flights
passengers
bags
resources
money

player decisions
```

Ensure deterministic systems resume correctly.

Backend sync comes after reliable local serialization.

---

# 52. Backend

Convex initially supports:

```text
user
airport saves
scenario results
game progression
settings
```

Later:

```text
leaderboards
shared airports
challenges
user-generated scenarios
```

Do not send every passenger movement to Convex.

Simulation runs locally.

Backend stores meaningful persistent state/results only.

---

# 53. Authentication

Use Better Auth integration already chosen for the project.

Godot native client should use the existing appropriate token/device authentication architecture.

Do not design browser-only auth assumptions into native Godot.

---

# 54. Multiplayer

NOT V1.

Do not build:

```text
multiple players controlling same airport
live airport visitors
PvP
real-time network simulation
```

Possible later.

---

# 55. Real Airports

NOT V1.

First use fictional airport.

Later possible:

```text
IAD
JFK
ATL
IST
LHR
DXB
```

Real airports introduce:

```text
layout accuracy
data licensing
branding
schedule data
airport permissions
```

Do not block product on these.

---

# 56. Real Airlines

NOT V1.

Use fictional brands.

Potential future licensed scenarios.

---

# 57. Real Flight Integration

Long-term feature only.

Possible future:

```text
user scans boarding pass
↓
flight information detected
↓
origin/destination
↓
aircraft/gate when available
↓
game creates scenario based on actual trip
```

Do not build now.

Preserve architecture for:

```text
external flight reference
```

on a scenario/flight.

---

# 58. Future Airline Simulation

Eventually a second strategic layer may be added.

Player owns airline:

```text
buy/lease aircraft
choose routes
set schedules
choose hub
set fares
manage fleet
```

Those flights then run through airports.

Architecture should not make this impossible.

However:

**Do not implement airline ownership until the airport simulator itself is compelling.**

---

# 59. Future World Simulation

Long term:

```text
AIRLINE PLAYER
creates flight

        ↓

AIRPORT PLAYER
handles it

        ↓

BOARDING SIMULATION
determines turnaround quality

        ↓

airline performance affected
```

Potentially different players could operate airports and airlines.

This is future architecture only.

---

# 60. Development Milestones

## M0 — Simulation Foundation

Build/refactor:

```text
simulation clock
seeded RNG
event bus
domain entities
simulation/render separation
tests
```

Canonical models:

```text
Airport
Flight
Aircraft
Passenger
Bag
Gate
```

Acceptance:

Simulation can run headless.

---

# M1 — Airport Skeleton

Build:

```text
fictional airport
1 runway
8 gates

flight schedule

aircraft arrivals
gate occupancy
aircraft departures

simulation speed
basic UI
```

No passengers yet if necessary.

Acceptance:

Flights arrive, occupy gates, turn around on placeholder timers, and depart.

Gate conflicts are possible.

---

# M2 — Passenger Terminal Flow

Build:

```text
passenger generation

entrance
security
walking
gate waiting

navigation

security queues
```

Acceptance:

Passengers enter airport and reach correct gates.

Security capacity affects arrival time.

---

# M3 — Boarding Integration

Integrate existing boarding engine.

Do not recreate it.

Build adapter:

```text
AirportFlight
      ↓
BoardingScenarioAdapter
      ↓
BoardingSimulation
      ↓
BoardingResult
      ↓
AirportFlight
```

Acceptance:

Airport passengers physically become boarding simulation passengers.

Boarding duration affects departure time.

---

# M4 — Deboarding

Build:

```text
aircraft passenger exit
seat-related timing
terminal arrival
connection availability
```

Acceptance:

Arriving passengers move from seats into airport.

---

# M5 — Turnaround System

Replace placeholder turnaround timers with tasks:

```text
cleaning
fuel
catering
baggage unload/load
boarding
```

Allow parallel dependencies.

Acceptance:

Aircraft cannot depart until required turnaround tasks complete.

---

# M6 — Connections

Build:

```text
connecting passengers
connection deadlines
gate-to-gate travel
missed connections
```

Acceptance:

Airport design/operations cause real connection successes/failures.

---

# M7 — Baggage

Build:

```text
Bag entity
arrival unload
sorting
transfer
loading
claim
mishandling
```

Acceptance:

Passenger and luggage may independently succeed/fail.

---

# M8 — Operational Resources

Build:

```text
baggage crews
cleaning crews
fuel resources
gate staff
```

Player allocates limited resources.

Acceptance:

Resource shortages create measurable delays.

---

# M9 — Airline Relationships

Build:

```text
fictional airlines
service expectations
airline satisfaction
route growth/reduction
```

Acceptance:

Airport performance affects airline behavior.

---

# M10 — Economy and Expansion

Build:

```text
revenue
expenses

gate expansion
security upgrades
baggage upgrades
```

Acceptance:

Player can reinvest operating profit into airport capacity.

---

# M11 — Scenario/Challenge System

Build:

```text
scenario definitions
seeded challenge
score
result summary
```

Acceptance:

Two players using same scenario/seed get comparable deterministic conditions.

---

# 61. First Implementation Instruction

Start ONLY with:

```text
M0
+
M1
```

Do NOT begin passengers, baggage, or boarding integration until the airport skeleton is stable.

---

# 62. M0 Tasks

1. Inspect existing boarding project architecture.
2. Do not rewrite stable existing boarding code.
3. Identify reusable simulation abstractions.
4. Introduce authoritative simulation clock.
5. Introduce seeded RNG service.
6. Introduce event system.
7. Create/refactor canonical entities:

   * Airport
   * Flight
   * Aircraft
   * Gate
   * Passenger
   * Bag
8. Passenger/Bag may remain unused until later.
9. Ensure simulation logic does not depend on rendered nodes.
10. Add headless tests.
11. Document architecture.

---

# 63. M1 Tasks

Create fictional airport:

```text
Riverdale International
```

Initial configuration:

```text
1 runway
8 gates
1 terminal
```

Create fictional airlines and flights.

Example:

```text
Northstar 221
Atlantic 108
SunJet 443
Global 008
```

Implement:

```text
schedule
approach
landing
taxi abstraction
gate arrival
gate occupancy

placeholder turnaround
pushback
departure

gate conflicts

simulation clock UI

pause
1x
2x
4x
```

Build flight board.

Build flight detail panel.

Build basic airport map.

---

# 64. M1 Placeholder Turnaround

Use deterministic configurable turnaround duration temporarily.

Example:

```text
A220      25 min
737       35 min
A321      40 min
787       55 min
```

These are GAME configuration values, not claims of real operational standards.

Later M5 replaces them.

---

# 65. M1 Gate Conflict

If flight remains at gate beyond next assignment:

generate:

```text
GATE_CONFLICT
```

UI warning:

```text
Gate B3 conflict

Northstar 221 departure delayed.
Atlantic 108 arrives in 9 minutes.
```

Player can:

```text
assign another compatible gate
```

If none:

```text
incoming flight waits
```

This establishes cascading delay gameplay before passenger systems exist.

---

# 66. Testing

Use automated tests wherever simulation logic allows.

Test:

```text
deterministic RNG
simulation clock
flight state transitions
gate assignment
gate incompatibility
gate conflicts
delayed departure
runway queue
event ordering
save serialization
```

Important deterministic test:

```text
same scenario
same seed
same decisions
=
same event/result sequence
```

---

# 67. Debug Tools

Provide developer-only debug overlay:

```text
simulation time
seed
active flights
flight states
gate assignments
queued runway ops
event count
FPS
simulation tick time
```

Provide:

```text
skip 10 min
force arrival
force delay
```

only in debug builds.

This will significantly improve development speed.

---

# 68. Performance Target

M1 should easily support:

```text
50–100 scheduled flights
```

without performance concern.

Future architecture target:

```text
thousands of passengers
thousands of bags
dozens of aircraft
```

Do not prematurely optimize beyond sensible data-oriented design.

---

# 69. Documentation

Maintain:

```text
docs/
    architecture.md
    simulation.md
    roadmap.md
    status.md
```

`simulation.md` must document:

```text
clock
tick
RNG
event architecture
state transitions
domain invariants
```

---

# 70. Agent Completion Report

After M0 + M1, report:

```text
Files changed

Existing boarding architecture reused

New simulation architecture

Domain entities

Simulation clock

RNG implementation

Event system

Airport implementation

Gate system

Flight state machine

Runway behavior

UI created

Tests added

Commands executed

Pass/fail results

Performance observations

Known limitations

Technical debt

Recommended M2 plan
```

Do not proceed automatically to M2.

---

# 71. Core Product Principles

When making implementation choices:

```text
simulation depth > visual realism

cause-and-effect > arbitrary difficulty

readability > graphical complexity

one shared world model > disconnected minigames

determinism > uncontrolled randomness

reusable boarding engine > duplicate implementation

operational consequences > decorative airport building
```

The airport should feel alive because every aircraft, passenger, bag, gate, and delay is part of the same system.

The eventual vision is not merely:

```text
build an airport
```

It is:

```text
operate a living transportation system
where one late passenger, one overloaded security
checkpoint, or one slow aircraft turnaround can
propagate through the entire airport.
```

That is the defining experience.
