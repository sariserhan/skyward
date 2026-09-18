# BOARDING

## Agent-Ready Prototype & V1 Specification

**Status:** Start implementation
**Working title:** BOARDING
**Primary platform:** Desktop / Steam-oriented prototype
**Engine:** Godot 4
**Game language:** GDScript
**Future web/backend:** Next.js + Convex + Better Auth
**Core principle:** Prove the boarding simulation is fun before building the larger platform.

---

# 1. Product Concept

BOARDING is a minimalist 2D passenger-aircraft boarding optimization game.

The player receives:

* an aircraft
* a fixed passenger manifest
* assigned passenger seats
* passenger characteristics
* a boarding-time target

The player chooses or designs a boarding strategy.

Then the player presses:

**START BOARDING**

Passengers behave autonomously.

The player watches congestion emerge from:

* aisle blocking
* luggage storage
* walking speed
* passengers accessing window/middle/aisle seats
* passengers passing seated passengers
* boarding order
* passenger groups

The objective is:

> Board every passenger in the shortest possible time.

The main replay loop is:

**Plan → Simulate → Analyze → Change Strategy → Simulate Again → Improve Time**

---

# 2. Critical Product Hypothesis

We are testing one question:

> Is optimizing aircraft boarding sufficiently satisfying that players voluntarily replay the same scenario to improve their time?

Do not expand the game until this has been demonstrated.

Success behavior looks like:

* player finishes once
* immediately changes strategy
* runs simulation again
* attempts to beat previous time
* compares different boarding strategies
* becomes interested in why congestion happened

Failure behavior:

* watches one simulation
* says "interesting"
* has no desire to run it again

If the latter occurs consistently, stop expanding the game and reconsider the mechanic.

---

# 3. Prototype Scope

The first playable version must contain only:

* one fictional narrow-body aircraft
* 30 rows
* 6 seats per row
* seats A–F
* one center aisle
* one front boarding door
* maximum 180 passengers
* assigned seats
* carry-on bags
* different passenger walking speeds
* luggage-stowing delays
* seat-access delays
* boarding queue
* four predefined boarding strategies
* one custom strategy
* deterministic simulation
* boarding timer
* simulation speed controls
* result screen
* retry button
* comparison against previous attempt

No backend is required for this phase.

No account is required.

No real airline or airport branding.

---

# 4. Technology

## Game

Use:

**Godot 4.x**

Language:

**GDScript**

Rendering:

**2D**

Do not use Unity or Unreal for this prototype.

The game should be capable of eventually exporting to:

* Windows
* macOS
* Linux
* iOS
* Android

But optimize initial development for desktop.

---

# 5. Repository Structure

Use:

```text
boarding/
│
├── game/
│   ├── project.godot
│   ├── scenes/
│   ├── scripts/
│   ├── assets/
│   ├── configs/
│   └── tests/
│
├── web/
│   └── RESERVED FOR FUTURE
│
├── docs/
│   ├── GAME_SPEC.md
│   ├── SIMULATION.md
│   ├── ROADMAP.md
│   └── DECISIONS.md
│
├── README.md
└── .gitignore
```

Do not initialize the backend in the first simulation milestone unless doing so has zero impact on prototype development.

---

# 6. Architecture Rule

Simulation logic must be separate from visual rendering.

Required architecture:

```text
Passenger Data
      ↓
Boarding Strategy
      ↓
Simulation Engine
      ↓
Passenger State Machines
      ↓
Aircraft/Aisle State
      ↓
Simulation Events
      ↓
Renderer / UI
```

The simulation must be runnable without graphics.

This is important because later we need:

* automated testing
* thousands of simulations
* leaderboard verification
* AI strategy testing
* server-side challenge validation
* fast-forward simulation
* replay generation

Do not put core simulation logic inside UI nodes.

---

# 7. Deterministic Simulation

Every scenario has a numeric seed.

Example:

```text
seed = 1847291
```

Given:

* same seed
* same passenger manifest
* same aircraft
* same boarding strategy
* same simulation configuration

the final boarding time must always be identical.

Randomness must use the seeded simulation RNG.

Do not use uncontrolled global randomness.

---

# 8. Simulation Tick

Run the logical simulation on a fixed timestep.

Target:

```text
30 simulation ticks / second
```

Rendering may run independently.

Simulation speed options:

```text
Pause
1x
2x
4x
8x
```

Changing playback speed must not change the outcome.

---

# 9. Aircraft Model

Prototype aircraft:

```text
Rows: 30

LEFT       AISLE       RIGHT

A B C        |         D E F
A B C        |         D E F
A B C        |         D E F
...
Row 30
```

Seats:

```text
1A ... 30F
```

Capacity:

```text
180
```

Aircraft definition must come from configuration data.

Example conceptual structure:

```text
AircraftDefinition
- id
- display_name
- rows
- seats_per_row
- aisle_count
- boarding_doors
- seat_layout
```

Do not hardcode aircraft geometry throughout the simulation.

---

# 10. Passenger Model

Each passenger should include:

```text
Passenger
- id
- seat_row
- seat_letter
- seat_type
- side
- walking_speed
- carry_on_count
- luggage_stow_duration
- seat_access_duration
- boarding_group
- queue_position
- state
- aisle_position
- total_blocked_time
- total_walk_time
- total_stow_time
```

Seat type:

```text
WINDOW
MIDDLE
AISLE
```

---

# 11. Passenger Generation

Prototype passenger values should be procedurally generated from the scenario seed.

Default capacity:

```text
180 passengers
```

Initially support load factors such as:

```text
60%
75%
90%
100%
```

Default test scenario:

```text
100% / 180 passengers
```

---

# 12. Walking Speed

Assign slight speed variation.

Example normalized range:

```text
0.90 – 1.15
```

Values must be configurable.

Do not attempt medical or demographic simulation in V1.

Walking speed is simply a game/simulation property.

---

# 13. Carry-On Bags

Initial distribution:

```text
0 bags
1 bag
2 bags
```

Use configurable weighted probabilities.

Example starting configuration:

```text
0 bags = 15%
1 bag  = 65%
2 bags = 20%
```

These are gameplay defaults, not claims about real-world airline statistics.

---

# 14. Luggage Stow Behavior

When a passenger reaches their row:

If carry-on count > 0:

```text
WALKING
↓
STOWING
↓
SEATING
```

While stowing luggage, the passenger occupies the aisle and blocks passengers behind them.

Stow duration should depend on:

```text
base stow time
+
number of bags
+
small deterministic passenger variation
```

Store these values in configuration.

---

# 15. Seat Interference

This is a major gameplay mechanic.

Example:

Passenger assigned:

```text
21A
```

If 21B and/or 21C are already seated, accessing 21A takes longer.

This should generate visible delay.

Conceptually:

```text
window passenger with no obstruction
= low delay

window passenger with middle passenger seated
= medium delay

window passenger with middle + aisle occupied
= high delay
```

Same logic mirrored for seats D/E/F.

Do not try to create complex passenger animations initially.

Represent the delay clearly.

---

# 16. Passenger State Machine

At minimum:

```text
WAITING
QUEUED
ENTERING
WALKING
BLOCKED
STOWING
WAITING_FOR_SEAT
SEATING
SEATED
```

Transitions must be explicit.

Avoid giant conditional blocks controlling passenger behavior.

---

# 17. Aisle Model

For the prototype, do **not** build general A* pathfinding.

There is only one straight aisle.

Represent the aisle as ordered positions/cells.

Example:

```text
Entrance
↓
Row 1
Row 2
Row 3
...
Row 30
```

Passengers cannot pass through another passenger occupying the required aisle space.

This gives us deterministic congestion.

Future wide-body aircraft can replace this with graph-based navigation.

---

# 18. Boarding Queue

Passengers begin outside the aircraft in a boarding queue.

Their order is generated by the selected boarding strategy.

The aircraft entry must behave as a constrained resource.

Do not spawn all passengers inside simultaneously.

---

# 19. Required Boarding Strategies

Implement these presets.

## Strategy A — Random

Random passenger order using the scenario seed.

---

## Strategy B — Back to Front

Board rear rows first.

Example groups:

```text
Rows 21–30
Rows 11–20
Rows 1–10
```

Passenger order inside each group may be deterministic-random.

---

## Strategy C — Front to Back

Opposite:

```text
Rows 1–10
Rows 11–20
Rows 21–30
```

This is expected to perform poorly and provides useful comparison.

---

## Strategy D — Window / Middle / Aisle

Board:

```text
window seats
↓
middle seats
↓
aisle seats
```

Allow row ordering within groups.

---

## Strategy E — Custom

Player creates boarding groups.

Initial rule fields:

```text
Rows:
FROM __ TO __

Seat types:
[ ] Window
[ ] Middle
[ ] Aisle
```

Example:

```text
GROUP 1
Rows 20–30
Window

GROUP 2
Rows 10–19
Window

GROUP 3
All rows
Middle

GROUP 4
All rows
Aisle
```

Groups should be reorderable.

Every passenger must eventually belong to exactly one boarding group.

If custom rules leave passengers unmatched, automatically create:

```text
UNASSIGNED
```

as the final group and warn the player.

---

# 20. Main Game Screen

Recommended layout:

```text
+--------------------------------------------------+
| BOARDING                           TIME  08:42    |
+---------------------+----------------------------+
|                     |                            |
| BOARDING PLAN       |       AIRCRAFT             |
|                     |                            |
| Group 1             |  A B C | D E F            |
| Group 2             |  ● ● ● | ● ● ●            |
| Group 3             |  ● ● ● | ● ● ●            |
|                     |  ...                       |
| [Edit Strategy]     |                            |
|                     |                            |
|                     |      boarding queue        |
+---------------------+----------------------------+
| Pause | 1x | 2x | 4x | 8x        Restart      |
+--------------------------------------------------+
```

Keep UI minimalist.

---

# 21. Passenger Visualization

Do not invest in detailed character art yet.

Passengers can initially be:

* circles
* simple human silhouettes
* minimalist sprites

Color may represent current state.

For example:

```text
walking
blocked
stowing
seating
seated
```

However, avoid requiring the user to memorize many colors.

Clicking a passenger should show:

```text
Passenger #82
Seat: 21A
Carry-ons: 2
State: Stowing luggage
Blocked time: 18.4 sec
```

---

# 22. Simulation Feedback

The player must be able to understand **why** boarding is slow.

Visually expose congestion.

Examples:

* queue backing up
* highlighted blockage
* luggage icon over stowing passenger
* seat-access icon
* passenger waiting indicator

Optional:

Clicking a blockage displays:

```text
AISLE BLOCKED

Passenger 81
Seat 18A
Stowing 2 bags

Passengers delayed: 14
```

This is important because optimization requires understandable feedback.

---

# 23. Results Screen

At completion show:

```text
BOARDING COMPLETE

Total Time
09:41

Previous Best
10:17

Improvement
-00:36

Passengers
180

Total Blocked Time
18:42

Luggage Delay
06:14

Seat Interference
03:51
```

Primary metric:

**Total Boarding Time**

Secondary diagnostics help players optimize.

Buttons:

```text
TRY AGAIN

EDIT STRATEGY

NEW PASSENGERS
```

---

# 24. Personal Best

For the same scenario seed:

store locally:

```text
best_time
strategy
attempt_count
```

No account required.

Use local Godot persistence.

---

# 25. Scenario System

Create scenarios using:

```text
ScenarioDefinition
- scenario_id
- aircraft_id
- passenger_count
- seed
- config
- target_time
```

Example:

```text
scenario_id: prototype_full_001
aircraft: narrowbody_30
passengers: 180
seed: 418923
```

---

# 26. Required Prototype Scenarios

Create at least:

```text
Tutorial
60 passengers

Medium
120 passengers

Full Flight
180 passengers

Carry-On Chaos
180 passengers
high baggage probability
```

---

# 27. Performance Requirement

The game must support:

```text
180 active passengers
```

without visible simulation slowdown.

At 8× simulation speed, the prototype should remain responsive on an ordinary modern laptop.

Do not optimize prematurely beyond this requirement.

---

# 28. Automated Tests

Create a headless simulation test harness.

Test at minimum:

### Determinism

Same scenario + strategy produces the same result repeatedly.

### Full Boarding

All passengers eventually reach:

```text
SEATED
```

### No Duplicate Seats

No two passengers receive the same seat.

### No Lost Passengers

Passenger count before and after simulation remains identical.

### Strategy Coverage

Every passenger receives a queue position.

### Deadlock Test

Run at least:

```text
1,000 generated scenarios
```

and verify the simulation eventually terminates.

Increase this later.

### Playback Independence

1× and 8× result in identical simulated boarding time.

---

# 29. Debug Mode

Include a developer/debug panel capable of showing:

```text
Simulation seed
Current tick
Passenger state counts
Aisle occupancy
Queue length
Boarded count
Simulation FPS
```

Include:

```text
RUN TO COMPLETION
```

which executes the simulation without rendering delays for testing.

---

# 30. Configuration

Do not bury gameplay constants throughout code.

Use configuration resources/files for:

```text
walking speed
stow times
seat delays
bag probabilities
simulation tick
aircraft dimensions
boarding-group settings
```

This will allow rapid balancing.

---

# 31. Prototype Milestones

## Milestone 1 — Static Aircraft

Deliver:

* aircraft visualization
* 30 rows
* seats
* aisle
* boarding entrance

Acceptance:

Aircraft layout renders correctly.

---

## Milestone 2 — One Passenger

Deliver:

Passenger:

```text
enters
walks to assigned row
sits down
```

Acceptance:

Passenger reaches correct seat deterministically.

---

## Milestone 3 — Congestion

Deliver:

Multiple passengers.

Passengers block one another in aisle.

Acceptance:

Queue visibly forms.

---

## Milestone 4 — Luggage

Deliver:

Carry-ons and stow delays.

Acceptance:

Stowing passenger blocks aisle.

---

## Milestone 5 — Seat Interference

Deliver:

Window/middle/aisle access delay.

Acceptance:

Boarding order affects total simulation time.

This is a critical milestone.

---

## Milestone 6 — 180 Passengers

Deliver:

Fully loaded aircraft.

Acceptance:

Simulation completes without deadlock.

---

## Milestone 7 — Strategies

Deliver:

* Random
* Back-to-front
* Front-to-back
* Window/Middle/Aisle
* Custom

Acceptance:

Different strategies produce measurably different outcomes.

---

## Milestone 8 — Game Loop

Deliver:

```text
Choose Strategy
↓
Start
↓
Watch
↓
Results
↓
Retry
```

Acceptance:

Playable repeatedly without developer tools.

---

# 32. Prototype Completion Gate

Do not proceed automatically into a full game.

Prototype is complete when:

* 180 passengers reliably simulate
* different strategies produce different outcomes
* custom strategy works
* simulation is deterministic
* results explain major delays
* retry loop works
* no blocking bugs remain

Then conduct human playtesting.

---

# 33. Playtest Gate

Give prototype to approximately:

```text
10–20 people
```

Track:

```text
How many complete first simulation?
How many voluntarily retry?
Average number of attempts
How many edit strategy?
How many attempt to beat their score?
```

Important signal:

**voluntary retries**

Target initial hypothesis:

At least a meaningful portion of testers should voluntarily run multiple attempts without being instructed.

Do not artificially force replay.

---

# 34. Features Explicitly Excluded From Prototype

Do NOT implement yet:

* accounts
* Better Auth
* Convex
* multiplayer
* global leaderboards
* Steam integration
* payments
* achievements
* aircraft unlocks
* real airports
* real airlines
* real aircraft branding
* boarding-pass scanning
* deboarding
* checked baggage
* baggage claim
* immigration
* customs
* airport security
* connecting flights
* flight-data APIs
* weather
* airline sponsorships
* mobile release
* detailed passenger graphics

These belong after the gameplay test.

---

# 35. Online Architecture — After Prototype Passes

After validation:

```text
                  ┌─────────────────┐
                  │   Godot Game    │
                  └────────┬────────┘
                           │ HTTPS
                           ▼
                  ┌─────────────────┐
                  │ Web/API Layer   │
                  │    Next.js      │
                  └────────┬────────┘
                           │
               ┌───────────┴──────────┐
               ▼                      ▼
        Better Auth                Convex
        Identity                  Game Data
```

Godot should not depend directly on React libraries.

---

# 36. Authentication

Use:

**Better Auth**

Do not use Clerk.

For the Next.js/Convex web side use the official integration:

```text
better-auth
@convex-dev/better-auth
```

Better Auth currently documents a Convex integration where the auth instance can run through a Convex component and be exposed to Next.js.

---

# 37. Native Godot Authentication

Do not attempt to run the Better Auth JavaScript client inside Godot.

For the eventual native game login, use an HTTPS token-based flow.

Preferred direction:

**Better Auth Device Authorization**

Flow:

```text
Godot requests device code
↓
Game displays code / QR
↓
Player opens website
↓
Player signs in through Better Auth
↓
Player approves device
↓
Godot polls authorization endpoint
↓
Godot receives token
↓
Game securely uses token for online APIs
```

Better Auth currently implements OAuth 2.0 Device Authorization for applications such as gaming consoles and other native/limited-input clients.

For authenticated API calls, use signed bearer/OAuth tokens rather than trying to emulate browser cookies from Godot. Better Auth also provides bearer-token authentication for non-cookie API clients.

Do not implement this until online features are needed.

---

# 38. Future Better Auth Providers

Eventually support:

```text
email
Google
Apple
Steam identity linking if technically appropriate
```

Do not block game access behind account creation unless online functionality requires it.

Offline/local play should remain possible.

---

# 39. Future Convex Responsibilities

Convex will eventually store:

```text
profiles
daily challenges
challenge seeds
leaderboards
verified scores
attempt history
achievements
aircraft unlocks
scenario metadata
social challenge data
```

Do not store per-frame simulation state in Convex.

Simulation occurs locally.

---

# 40. Leaderboard Verification

When leaderboards are added, never trust:

```text
client says time = 04:21
```

Instead submit:

```text
scenario_id
scenario_seed
strategy definition
simulation version
reported result
```

The backend or trusted verifier should be capable of replaying/validating the deterministic simulation.

This is why simulation/render separation is mandatory.

---

# 41. Future Website

Stack:

```text
Next.js
TypeScript
Tailwind CSS
Convex
Better Auth
Vercel
```

Potential pages:

```text
/
 /daily
 /leaderboard
 /profile
 /aircraft
 /challenges
 /device
```

`/device` will eventually support Better Auth device authorization for game login.

---

# 42. Analytics After Validation

Add PostHog only after the prototype proves fun.

Track events such as:

```text
simulation_started
simulation_completed
simulation_retried
strategy_changed
custom_strategy_created
personal_best
scenario_abandoned
```

Most important metrics:

```text
retry rate
attempts/session
session duration
return rate
custom strategy usage
```

---

# 43. Error Monitoring

Use Sentry after online/public builds begin.

Not required for the first local simulation prototype.

---

# 44. Commercial Direction

If prototype succeeds:

Initial likely business model:

```text
Steam
$7.99–$9.99
```

Potential later mobile version:

```text
Free demo
+
one-time full-game unlock
```

Avoid:

* energy systems
* pay-to-win
* forced ads

---

# 45. Future Game Expansion

Preserve these ideas in the roadmap but do not implement them now.

## More aircraft

Eventually:

* regional aircraft
* narrow-body
* wide-body
* double-deck aircraft
* two-door boarding
* jet bridge + stairs
* bus boarding

---

# 46. Deboarding

Simulate:

```text
landing
↓
seat exit
↓
aisle congestion
↓
aircraft exit
```

Optimization target:

**minimum total deboarding time**

---

# 47. Checked Baggage

Later simulate:

* checked bags
* baggage loading
* incorrect aircraft
* delayed bags
* transfer bags
* missing luggage
* baggage claim

---

# 48. Connections

Eventually support complete passenger journeys:

```text
Arrival
↓
Deboard
↓
Immigration
↓
Transfer
↓
Security
↓
Next Gate
↓
Board
```

Passengers can miss connections.

---

# 49. Airport Operations

Possible later systems:

* gate changes
* aircraft swaps
* late passengers
* duplicate seats
* document issues
* wrong gate
* unattended baggage
* operational disruptions

Security gameplay should use observable events/documents/items rather than demographic profiling.

---

# 50. Real Airport Mode

After commercial traction, investigate licensed real airports.

Example:

```text
Washington Dulles International Airport
IAD
```

Possible real-world scenarios could eventually replicate:

```text
terminal
gate
route
aircraft
destination
```

Only use trademarks, official layouts, liveries and branding when licensing/permissions permit.

---

# 51. Airline Partnerships

Long-term possibility:

```text
OFFICIAL AIRLINE CHALLENGE
```

Example concept:

```text
Washington → Istanbul
```

Potential sponsored content:

* official airline livery
* airline route
* branded boarding challenge
* leaderboard event
* destination promotion

Do not approach airlines until actual player traction exists.

---

# 52. Airport Partnerships

Potential airport partnerships could include:

```text
Official Dulles Challenge
Official Istanbul Airport Challenge
```

The game could become interactive destination/airport promotion.

---

# 53. Aircraft Manufacturer Partnerships

Possible future licensed aircraft packs from manufacturers.

Potential value:

```text
official cabin configuration
official aircraft model
manufacturer challenge
```

Again, pursue only after audience traction.

---

# 54. Real Boarding Pass Mode

This is a major long-term differentiator.

A traveler waiting at the airport could scan their actual boarding pass.

Concept:

```text
SCAN YOUR BOARDING PASS
```

The system identifies available information such as:

```text
airline
flight number
origin
destination
departure date
seat
boarding group
cabin
```

Additional public/partner flight data could supplement:

```text
aircraft type
terminal
gate
actual departure
```

Then generate:

```text
PLAY YOUR FLIGHT
```

---

# 55. Example Real-Flight Experience

Passenger is waiting at Washington Dulles.

They scan their boarding pass.

Game displays:

```text
YOUR FLIGHT

Washington Dulles
        ↓
Istanbul

Seat 21A

Can you board this flight faster
than the simulation target?
```

The player's real seat can appear in the simulated aircraft.

---

# 56. Same-Flight Social Mode

An eventual viral feature:

People on the same actual flight receive the same challenge.

Example:

```text
FLIGHT CHALLENGE

IAD → IST

43 passengers on this flight
have played today's challenge.
```

Leaderboard:

```text
1. Player A   12:41
2. Player B   12:53
3. Player C   13:02
```

This should not require exposing passenger identities.

---

# 57. Daily Challenge

After online infrastructure exists:

Every player receives the same:

```text
aircraft
manifest
seed
constraints
```

Example:

```text
DAILY FLIGHT #184

Aircraft: NB-30
Passengers: 176
Carry-On Load: Heavy

Best Time:
06:42
```

This is likely one of the most important retention systems.

---

# 58. Shareable Results

Eventually create a share card:

```text
BOAR
```
