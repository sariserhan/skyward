> **Precedence (2026-09-24, D-013):** this document is the product direction and
> roadmap for M3 onward. It supersedes `docs/additional_spec.md` for M3+ wherever
> they conflict; that file remains historical context for M0–M2. Settled M3
> decisions are recorded in `docs/DECISIONS.md` (D-013–D-020), and the concrete
> M3 plan is `docs/m3-plan.md`. Milestone order changed per D-020: M4 is the
> turnaround task framework and M5 is deboarding.

# Riverdale International / Boarding
## Agent-Ready Product + Engineering Spec
### Boarding Simulator → Full Airport Operations & Tycoon Game

## 0. Instruction to the Agent

Continue the EXISTING project. Do not start a replacement project, rewrite the simulation core, or discard the current boarding game.

Before changing code:

1. Read the repository structure.
2. Read `docs/roadmap.md`.
3. Read existing tests and simulation interfaces.
4. Run the current test suite.
5. Launch the current Riverdale International scene.
6. Launch `res://scenes/main.tscn` and confirm the original standalone boarding game still works.
7. Inspect save schema v2 and all current serialization code.
8. Report any conflict between this spec and the actual repository before making a destructive architectural change.

The immediate implementation target remains **M3**.

The larger product direction is now explicitly:

> Build a deep airport-management/tycoon simulation where the player designs and operates an airport, while individual passengers, aircraft, boarding, baggage, security, gates, runway traffic, connections and delays are simulated in enough detail that the player can understand exactly why the airport succeeds or fails.

The existing boarding simulator becomes a subsystem of the airport, not a separate abandoned prototype.

---

# 1. Existing State — Preserve It

The project is Godot 4.7.2 using GDScript.

Current project identity:

**Riverdale International**

Current architecture already includes:

- deterministic simulation
- integer-tick simulation
- seeded randomness
- simulation logic substantially separated from scene rendering
- reusable passenger objects
- save/load
- structured events
- tests
- benchmarks
- debug tooling
- local playtest telemetry

Do not regress these properties.

---

# 2. Existing Boarding Simulator

Location:

`game/scripts/sim/`

Existing capabilities include:

- passenger generation
- deterministic seeded simulation
- one aisle cell per aircraft row
- baggage-stow delays
- seat-interference delays
- aisle blocking
- four predefined boarding strategies
- player-created boarding groups
- tutorial scenario
- medium scenario
- full-flight scenario
- carry-on-chaos scenario
- personal records
- blame accounting for blocked ticks

Existing visualization includes:

- side-view aircraft cabin
- passenger walking
- baggage-stowing animation
- waiting animation
- sitting animation
- aircraft outline
- pause
- 1× / 2× / 4× / 8× simulation speed
- passenger inspection
- results screen
- custom strategy editor
- debug panel

The standalone boarding experience must remain playable through:

`res://scenes/main.tscn`

Do not remove it.

---

# 3. Existing Playtest Infrastructure

Preserve:

- JSONL event logs
- `tools/playtest_report.py`
- `docs/PLAYTEST.md`
- automated screenshots
- Linux exports
- Windows exports
- macOS exports

Existing automated validation includes:

- deterministic/repeatable runs
- every passenger eventually boards
- no duplicate seats
- large scenario sweep for deadlocks

Expand this infrastructure rather than replacing it.

---

# 4. Existing Airport Simulation

Riverdale International currently contains:

## M0 — Foundation

Already built:

- airport clock
- 0.1-second ticks
- structured simulation events
- save/load
- shared passenger model between airport and aircraft boarding systems
- save schema v2

There must continue to be ONE logical passenger object through the passenger lifecycle.

Do not create:

`AirportPassenger`

and later separately create:

`BoardingPassenger`

for the same human.

The same logical passenger must move through the system.

---

## M1 — Airside

Already built:

- 8 gates
- 1 runway
- 1 terminal
- 24 flights
- 4 fictional airlines
- aircraft landing
- taxi
- gate arrival
- turnaround
- pushback
- departure
- runway queueing
- gate conflicts
- cascading delays
- manual compatible-gate reassignment
- flight board
- alerts
- F3/debug controls

Preserve these systems.

---

## M2 — Terminal

Already built:

- passengers moving through terminal
- security queues
- gate destinations
- two security checkpoints
- six assignable security staff
- open/close security lanes
- dynamic gate-change rerouting
- passenger inspection
- flight passenger-list inspection
- follow-passenger capability

Current lifecycle effectively stops at:

`WAITING_AT_GATE`

The next milestone connects this to aircraft boarding.

---

# 5. Product Direction

This is no longer only:

> "Find the best aircraft boarding strategy."

It becomes:

> "Build and operate an airport where every operational decision can ripple through passengers, flights and infrastructure."

The original boarding puzzle remains valuable as:

1. a standalone mode;
2. a detailed aircraft subsystem;
3. a diagnostic tool;
4. a challenge/scenario mode;
5. a source of operational consequences inside the larger airport.

---

# 6. Core Player Fantasy

The player should eventually be able to begin with:

- land
- limited cash
- one small terminal
- one runway
- a small number of gates
- limited staff
- a few airline contracts

and grow toward:

- multiple terminals
- multiple runways
- domestic and international traffic
- connecting hubs
- complex taxiway systems
- baggage infrastructure
- immigration/customs
- lounges
- commercial areas
- major airline relationships
- tens of thousands of passengers

The game should retain an old-school management-game philosophy:

> easy to understand at the surface, deep when inspected.

---

# 7. Simulation Philosophy

We want deep simulation where consequences are visible.

Simulate deeply:

- passengers
- aircraft
- gates
- boarding
- deboarding
- runway use
- taxi movement
- security
- baggage
- connections
- aircraft turnaround
- staffing for operational systems
- queues
- delays

Initially abstract or simplify:

- electrical distribution
- plumbing
- detailed payroll
- fuel procurement markets
- HR administration
- building-code simulation
- detailed aircraft maintenance engineering
- detailed airline accounting

Do not turn the game into enterprise airport-management software.

It must remain a game.

---

# 8. Primary Diagnostic Principle

Every important delay should ultimately have an understandable cause.

Example:

Flight RV203 departed 19 minutes late.

Player should eventually be able to discover:

- +4 min runway congestion
- +3 min late inbound aircraft
- +5 min security-delayed passengers
- +2 min late connecting passengers
- +3 min slow boarding
- +2 min baggage loading

And boarding may further explain:

- Passenger 17A blocked aisle for 34 ticks.
- Row 14 caused 3 seat-interference events.
- Carry-on volume added 97 total blocked ticks.

The existing blame-accounting philosophy should expand into an airport-wide causality system.

---

# 9. M3 — NEXT IMPLEMENTATION MILESTONE
## Airport ↔ Boarding Integration

DO THIS NEXT.

Do not begin construction/economy before M3 works.

### Objective

Connect:

`terminal → gate → boarding → aircraft → departure`

using the existing passenger and boarding simulation.

Currently passengers reaching their gate stop there.

After M3, the lifecycle must become:

`ARRIVAL_TO_AIRPORT`
→ `SECURITY`
→ `WALKING_TO_GATE`
→ `WAITING_AT_GATE`
→ `BOARDING`
→ `ON_AIRCRAFT`
→ `DEPARTED`

---

# 10. M3 Boarding Trigger

A flight must not simply use a fixed opaque boarding timer.

Boarding begins according to flight timing and aircraft readiness.

Initial simplified conditions may be:

- aircraft at assigned gate
- aircraft turnaround state allows boarding
- boarding-open time reached
- flight not cancelled
- gate operational

Passengers who are physically at the gate become eligible for boarding.

Passengers still:

- at security
- walking
- shopping later
- connecting later

must not magically teleport onto the aircraft.

---

# 11. M3 Boarding Groups

Use the existing boarding strategy engine.

Each flight should have a selected boarding strategy.

Initially allow:

- default predefined strategy
- existing four strategies
- optionally custom strategy where already supported

The airport version should feed real flight passengers into the same boarding simulation used by the standalone mode.

Do not duplicate boarding logic.

---

# 12. M3 Passenger Identity Preservation

Critical invariant:

The airport passenger entering the aircraft must remain the same logical passenger.

Preserve stable passenger IDs.

Example:

Passenger:

`PAX_000491`

can be followed through:

security
→ gate
→ boarding queue
→ aircraft aisle
→ seat

Inspection should continue working where technically reasonable.

---

# 13. M3 Aircraft Boarding Visualization

Do not require the player to watch every flight cabin.

Airport simulation can continue at the normal airport level.

However:

clicking an actively boarding flight should allow the player to inspect boarding.

Possible UI:

`Flight RV203`

Status:

`BOARDING`

Then:

`View Boarding`

which opens/embeds the existing cabin visualization driven by the actual airport-flight boarding state.

Do not run two independent simulations.

The detailed view must observe the authoritative simulation.

---

# 14. M3 Departure Dependency

Aircraft must no longer depart solely because a fixed turnaround timer expired.

Departure must depend on boarding state.

Initial departure readiness:

- boarding complete or operational departure decision made
- required turnaround tasks complete
- gate departure allowed
- runway/taxi system able to accept aircraft

For M3, turnaround tasks that have not yet been implemented can remain simplified.

But passenger boarding itself must become real.

---

# 15. Late Passenger Rules

Introduce explicit late-passenger behavior.

Initial implementation may use:

### Gate still open

Passenger arriving late can still enter boarding queue.

### Gate closed

Passenger becomes:

`MISSED_FLIGHT`

They do not teleport aboard.

Record event:

`PASSENGER_MISSED_FLIGHT`

with reason information where known.

This will later interact with:

- connections
- rebooking
- satisfaction
- airline relationships

Do not build the full rebooking system in M3.

---

# 16. M3 Flight Delay Accounting

Boarding delay must contribute to flight delay.

Record metrics such as:

- boarding start
- boarding end
- boarding duration
- scheduled boarding duration if applicable
- boarding-induced departure delay
- passenger-caused blocked ticks
- number of passengers missing at gate close

Expose basic breakdown in flight inspection.

---

# 17. M3 Acceptance Criteria

M3 passes only if:

1. Airport passengers reach a gate.
2. Boarding opens.
3. Those same passengers enter the boarding engine.
4. Boarding strategy affects boarding performance.
5. Aircraft departure waits for appropriate boarding completion.
6. Slow boarding can produce a real departure delay.
7. Passengers not physically available cannot magically board.
8. Late passengers can miss a flight.
9. Passenger IDs remain consistent.
10. Existing standalone boarding mode still works.
11. Existing airport saves either migrate safely or schema is deliberately versioned.
12. Simulation remains deterministic under the same seed and inputs.
13. Automated tests cover the lifecycle.
14. No new deadlock path is introduced.

---

# 18. Required M3 Tests

Add automated tests for at least:

### Full lifecycle

Passenger:

terminal
→ security
→ gate
→ aircraft
→ seated
→ departed

### Boarding delay

Create a scenario where baggage/seat interference increases boarding time and confirm flight delay increases.

### Missing passenger

Ensure passenger still in security does not board.

### Gate change before boarding

Ensure passenger reroutes correctly and boards correct flight.

### Gate change during sensitive phase

Define deterministic policy.

Do not leave undefined behavior.

### Repeatability

Same seed and inputs produce identical boarding and airport outcomes.

### No duplication

Every boarded passenger ID appears exactly once.

### Save/load

Saving immediately before or during boarding and restoring does not duplicate/delete passengers or corrupt flight state.

If mid-boarding save is too large for M3, explicitly document and enforce the temporary limitation instead of silently corrupting state.

---

# 19. M5 — Deboarding

After the M4 turnaround task framework (D-020), plugged into it as a task:

Implement aircraft arrival passenger flow.

Lifecycle:

aircraft arrives
→ gate
→ doors open
→ passengers leave seats
→ aisle
→ aircraft exit
→ terminal

Eventually passengers split into:

- arriving passengers
- connecting passengers

Use the same simulation principles as boarding.

Do not simply delete arriving passengers at gate arrival.

---

# 20. M4 — Aircraft Turnaround Task Framework

Replace fixed turnaround timers with explicit tasks.

Initial turnaround tasks:

- deboarding
- cleaning
- catering
- refueling
- baggage unload
- baggage load
- boarding

Each task has:

- start conditions
- duration
- required resources where applicable
- completion state
- dependency relationships

Example:

`boarding`

may overlap some activities but not others according to simplified gameplay rules.

The player should see why the aircraft is still at the gate.

---

# 21. M6 — Connecting Passengers

Add passenger itineraries.

Passenger can have:

`Flight A → Flight B`

Requirements:

- deboard first aircraft
- move through terminal
- potentially change terminal/checkpoint later
- reach second gate
- board connection

Track:

- connection time
- minimum required transfer time
- missed connections

This should create cascading operational effects.

---

# 22. M7 — Baggage

Add passenger baggage objects linked to passenger IDs.

Lifecycle:

check-in
→ baggage system
→ sortation
→ outbound flight
→ aircraft
→ destination unload
→ reclaim / transfer

Possible failure modes:

- late bag
- wrong flight
- missed connection
- baggage congestion

Do not initially simulate individual belt physics if unnecessary.

Logical routing is sufficient.

---

# 23. M8 — Operational Resources

Introduce limited shared resources.

Potential resources:

- gate agents
- ramp crews
- baggage crews
- cleaning crews
- fueling crews
- buses
- baggage carts
- pushback tugs

Resource shortages should create visible delays.

---

# 24. M9 — Airlines and Contracts

Airlines become strategic partners rather than just flight colors.

Each airline should eventually have preferences.

Examples:

### Low-cost airline

Values:

- cheap gate fees
- quick turnaround
- minimal amenities
- remote stands acceptable

### Premium airline

Values:

- jet bridges
- lounges
- passenger satisfaction
- reliable operations
- premium terminal space

### Hub carrier

Values:

- connection performance
- many adjacent gates
- large schedule blocks
- baggage reliability

Airlines can offer contracts such as:

> Operate 8 daily flights if you provide 3 compatible gates and maintain 85% on-time departure performance.

Do not implement all airline negotiation complexity at once.

Start data-driven.

---

# 25. M10 — Economy

This is where the project formally becomes a tycoon game.

Track:

### Revenue

- airline landing fees
- gate fees
- passenger facility revenue
- retail revenue
- parking later
- airline contracts
- optional service fees

### Expenses

- staff
- construction
- operational resources
- maintenance abstraction
- expansion
- utilities abstraction

Player should have:

`cash`

and meaningful investment choices.

---

# 26. M11 — Construction and Expansion

This is the largest new layer.

Do not build it until the operational simulation is stable.

Eventually allow player placement of:

- runway
- taxiway
- aircraft stands
- gates
- terminal floor space
- walls
- walking paths
- security checkpoints
- baggage infrastructure
- check-in
- immigration/customs later
- restrooms
- restaurants
- shops
- lounges
- staff areas

Existing Riverdale International becomes:

- tutorial airport
- benchmark scenario
- campaign/scenario airport

It does not need to disappear.

---

# 27. Construction Architecture

When construction begins, use a data-driven world representation.

Avoid hard-coding airport logic into scene coordinates.

Infrastructure objects should expose properties such as:

`type`
`position`
`orientation`
`capacity`
`operational`
`owner/terminal`
`connections`
`compatibility`
`construction_cost`

The simulation should query infrastructure rather than know Riverdale-specific coordinates.

---

# 28. Airport Growth Loop

Target gameplay:

Start:

`small terminal`
`1 runway`
`2 gates`
`limited money`

Player:

gets airline
→ schedules flights
→ passengers arrive
→ security becomes crowded
→ adds lanes
→ flights increase
→ gates become congested
→ builds gates
→ taxi system becomes congested
→ expands taxiways
→ new airlines arrive
→ terminal expands
→ connecting hub develops

The airport itself should become a machine the player continuously optimizes.

---

# 29. Passenger Needs — Later Tycoon Layer

Eventually give passengers limited needs.

Potential needs:

- hunger
- restroom
- comfort
- shopping interest
- lounge eligibility
- patience
- gate urgency

Do not add Sims-like complexity.

Needs exist to make airport layout decisions meaningful.

Example:

A passenger with 90 minutes before departure may buy food.

A passenger with 8 minutes remaining should prioritize reaching the gate.

Passenger decision-making must remain deterministic given state + seed.

---

# 30. Passenger Following

Preserve and expand the existing follow-passenger feature.

This is important.

Player should eventually be able to select one passenger and watch:

airport entrance
→ check-in
→ security
→ restaurant
→ gate
→ boarding
→ seat
→ aircraft departure

This creates a bridge between macro management and human-scale simulation.

---

# 31. Drill-Down UX

The game's defining UX should allow:

### Level 1

Whole airport

### Level 2

Terminal/runway/gate

### Level 3

Flight

### Level 4

Passenger

### Level 5

Specific delay cause

Example:

Airport delay alert
→ Flight RV203
→ boarding delay
→ passenger 17A
→ carry-on stow blocked aisle for 31 ticks

This should become one of the game's major differentiators.

---

# 32. Airport-Wide Blame / Causality

Generalize the current boarding blame system.

Create structured causal attribution where practical.

Example delay graph:

`Flight RV203 +19 min`

causes:

`+6 security`
`+4 runway`
`+3 late inbound`
`+4 boarding`
`+2 baggage`

Then allow deeper inspection.

Avoid trying to create a universal causal AI system.

Use explicit deterministic attribution from simulation events.

---

# 33. Events and Incidents

Later introduce gameplay events such as:

- runway closure
- bad weather
- equipment failure
- security surge
- delayed inbound aircraft
- staff shortage
- gate malfunction
- baggage-system problem
- VIP flight
- holiday passenger surge

These should interact with existing systems rather than being arbitrary stat penalties.

Example:

bad weather

should reduce runway throughput

rather than simply:

`airport satisfaction -10`.

---

# 34. Game Modes

Eventually support:

## Sandbox

Build freely.

## Career

Start small and build a major airport.

## Scenarios

Examples:

- Morning Rush
- Snowstorm
- Holiday Weekend
- Hub Connection Challenge
- One Runway Nightmare
- Carry-On Chaos

## Boarding Challenge

Preserve original boarding-focused gameplay.

## Airport Operations Challenge

Player manages a prebuilt airport under operational pressure.

---

# 35. Scoring

Scenario scoring may consider:

- on-time departures
- passenger satisfaction
- missed flights
- missed connections
- baggage performance
- airport throughput
- profit
- safety/operational constraints
- average delay

Do not reduce the entire sandbox game to one score.

---

# 36. Speed Controls

Preserve:

- pause
- 1×
- 2×
- 4×
- 8×

Airport systems must behave correctly at all supported speeds.

Avoid frame-rate-dependent simulation logic.

Simulation time and rendering time remain separate.

---

# 37. Save System

Save files need explicit schemas and migrations.

Current schema:

`v2`

Future structural changes must increment versions deliberately.

Never silently reinterpret old data.

Add migrations where reasonable.

For experimental branches that break saves:

document it explicitly.

---

# 38. Determinism

This project already has an important technical advantage:

deterministic seeded simulation.

Preserve it.

The same:

- seed
- world
- schedule
- player decisions

should produce the same results wherever practical.

This supports:

- testing
- bug reproduction
- challenges
- benchmark scenarios
- eventual multiplayer comparisons
- deterministic replay

Do not introduce arbitrary `randf()` calls throughout scene/UI code.

Randomness belongs behind the simulation RNG abstraction.

---

# 39. Separation of Concerns

Maintain:

## Simulation

Authoritative state and rules.

## Presentation

Godot scenes, sprites, animation, UI.

## Input

Player commands translated into simulation actions.

Do not make animation completion determine business logic.

Example:

BAD:

"when aircraft animation reaches gate, simulation says aircraft arrived."

GOOD:

simulation says aircraft arrived
→ view animates aircraft to corresponding position.

---

# 40. Performance

The final game may need thousands of passenger entities.

Do not assume every passenger needs:

- full Node2D tree
- expensive per-frame processing
- independent pathfinding every frame

Maintain lightweight simulation data.

Presentation can instantiate/highlight only what is needed.

Batch where possible.

Benchmark regularly.

---

# 41. Pathfinding

As airport construction becomes dynamic:

Do not recompute full passenger paths every simulation tick.

Pathfinding should respond to meaningful topology/state changes:

- gate change
- closed corridor
- checkpoint closure
- destination change

Cache routes where appropriate.

---

# 42. Browser Target

Long-term target includes browser play.

Do NOT rewrite the game into JavaScript.

Keep Godot as the game.

Target architecture:

Next.js site
→ launches/hosts Godot Web export
→ optional backend services

The existing empty:

`web/`

directory remains reserved for the future web experience.

Potential future website responsibilities:

- landing page
- accounts
- cloud saves
- leaderboards
- community scenarios
- airport sharing
- challenge sharing

Do not build this now.

First make the game good.

---

# 43. Browser Constraints

As systems are added:

- avoid unnecessary native-only dependencies
- periodically test Godot Web export
- avoid architecture that fundamentally depends on unavailable browser features
- keep simulation deterministic across export targets where practical

Desktop builds remain useful for development and profiling.

---

# 44. Visual Direction

Do not require AAA graphics.

Target:

- readable
- charming
- simulation-first
- clear animations
- visually busy airport at scale
- strong information hierarchy

The appeal should come from:

> watching a complicated airport actually function.

A player should enjoy simply watching:

- passengers walking
- lines forming
- aircraft taxiing
- gates turning over
- baggage moving
- flights departing

similar to how RCT is enjoyable just to watch.

---

# 45. Information Overlays

Eventually useful overlays include:

- passenger congestion
- security wait time
- gate utilization
- runway utilization
- taxi congestion
- missed connections
- baggage congestion
- airline territory/gates
- passenger satisfaction
- revenue

Do not implement every overlay immediately.

---

# 46. Player Agency

Avoid systems that only show interesting simulation without giving the player meaningful decisions.

Each deep simulation system should eventually present a management lever.

Examples:

Security congestion:

player can:
- open lanes
- assign staff
- build checkpoint
- redirect terminal flow

Boarding delay:

player can:
- change boarding strategy
- modify gate operation
- alter turnaround planning

Gate congestion:

player can:
- reassign flight
- expand
- change schedule
- negotiate fewer flights

Runway congestion:

player can:
- alter scheduling
- modify taxi layout
- add infrastructure later

---

# 47. Do Not Build Yet

Do NOT jump ahead to:

- multiplayer
- real-world airports
- licensed airlines
- real airline branding
- user-generated airports
- airport marketplace
- Steam Workshop integration
- mobile native version
- cosmetic store
- battle pass
- AI agents
- procedural city simulation
- detailed aircraft maintenance
- multiplayer ATC
- realistic aviation certification rules

These can wait.

---

# 48. Long-Term Differentiators

The project should eventually be distinguishable from generic Airport Tycoon games through:

### 1. Passenger continuity

People are actual simulated entities, not throughput counters.

### 2. Boarding depth

Aircraft boarding genuinely happens.

### 3. Cause-and-effect

Delays have explainable causes.

### 4. Macro ↔ micro inspection

Whole airport down to one passenger.

### 5. Connections

Passengers can transfer between flights.

### 6. Operational + construction gameplay

Airport design affects real operations.

### 7. Watchability

The airport is enjoyable to observe.

---

# 49. Development Rule

Do not add a system simply because real airports have it.

For every proposed feature ask:

1. Does the player notice its effect?
2. Does it create a meaningful decision?
3. Does it interact with another system?
4. Does it generate an understandable consequence?
5. Is it fun enough to justify its complexity?

If not, abstract it.

---

# 50. Immediate Work Order

For the next development cycle:

## Step 1

Inspect current implementation and `docs/roadmap.md`.

## Step 2

Write/update the concrete M3 implementation plan based on the actual code.

Do not invent class names until inspecting current architecture.

## Step 3

Implement M3:

`gate → boarding → seated passengers → departure`

## Step 4

Add deterministic tests.

## Step 5

Run all existing tests and benchmarks.

## Step 6

Perform a manual playtest where one flight can be followed through:

terminal
→ gate
→ boarding
→ departure

## Step 7

Update:

- `docs/roadmap.md`
- project status documentation
- save-schema documentation if changed
- tests
- playtest documentation if behavior changed

## Step 8

Stop and report results before beginning M4.

---

# 51. M3 Demonstration Scenario

Create or reuse a controlled test flight where the reviewer can observe:

1. Aircraft arrives at gate.
2. Passengers pass through security.
3. Passengers walk to gate.
4. Boarding opens.
5. Passengers queue.
6. Cabin boarding simulation runs.
7. Carry-ons and seat interference cause visible boarding effects.
8. Last passenger seats.
9. Boarding completes.
10. Aircraft pushes back.
11. Aircraft taxis.
12. Aircraft departs.

Also include one deliberately late passenger.

The late passenger must visibly miss the flight rather than teleport aboard.

This demonstration is the M3 product proof.

---

# 52. M3 Product Question

At the end of M3, answer:

> Does connecting the detailed boarding engine to the live airport make the airport feel more alive and make delays more understandable?

If YES:

continue toward M4–M11.

If NO:

fix the integration/gameplay presentation before adding more systems.

---

# 53. Ultimate Product Loop

The long-term game loop should become:

BUILD
↓
ATTRACT AIRLINES
↓
SCHEDULE FLIGHTS
↓
PASSENGERS ARRIVE
↓
PROCESS PASSENGERS
↓
BOARD AIRCRAFT
↓
HANDLE OPERATIONAL PROBLEMS
↓
EARN MONEY
↓
EXPAND
↓
INCREASE COMPLEXITY
↓
OPTIMIZE
↓
EXPAND AGAIN

The airport should progressively become a more complicated machine created by the player.

---

# 54. Product Identity

Do not think of this as:

"RCT2 but with airplanes."

Use RCT2 as inspiration for:

- readable simulation
- visible individual agents
- emergent problems
- satisfying construction
- strong cause-and-effect
- watching your creation operate
- easy surface / deep systems

The goal is its own airport simulation.

Working product description:

> Build and operate an airport where every passenger has somewhere to go, every aircraft has somewhere to be, and every bad decision can become somebody's missed flight.

---

# 55. Final Engineering Constraint

The project already has valuable working systems.

Prefer:

**integration**

over:

**rewriting**.

Prefer:

**extending proven models**

over:

**parallel replacements**.

Prefer:

**one authoritative simulation**

over:

**UI-specific fake state**.

Prefer:

**small validated milestones**

over:

**building the entire tycoon game at once**.

The next task is M3 only.

Complete M3, prove it works, update the documentation, report results, and stop before M4.