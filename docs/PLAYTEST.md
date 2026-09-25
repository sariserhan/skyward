# Playtest Guide

## M13 human playtest kit (first-time players)

M13 needs evidence from **genuine first-time players** (spec §34–37). Scripted
demos are not evidence. Run round 1 with at least five people who have never
seen the project; fix what they hit; then run round 2 with fresh people.

### Before each tester

1. Give them a build:
   - **Linux:** `dist/linux/boarding.x86_64`
   - **Windows / macOS:** the matching export
   - **Web:** host `dist/web/` on any static server
     (`python3 -m http.server` in that folder) and open `index.html` in
     Chrome or Firefox.
2. On a machine that has run the game before, open **SETTINGS → RESET
   PLAYTEST DATA**, so the log holds only this tester.
3. Say one sentence, and nothing more: **"Start a new career and run the
   airport."** Do not explain the UI. Step in only if they are completely
   stuck for more than two minutes, and note it (`stuck_where`).
4. Sit behind them. Take notes, and don't help.

### While they play: what to watch (spec §35)

The game logs most of this itself. The observer adds what a log cannot see.

| Metric | From the log | Observer |
| --- | --- | --- |
| Reached the first flight | `first_landing` | — |
| Found the time controls | `speed` / `pause` | how (keys, buttons, never) |
| Opened flight details | `select_flight` | — |
| Changed security staffing | `security_change` | prompted by the tip, or on their own? |
| Noticed resource contention | Resources tab, `priority` | did they say it out loud? |
| Understood hold/close | `hold` / `close_gate` | **ask after:** "what happens if you hold?" |
| Understood why flights were late | — | **ask after:** point at a late flight, "why was it late?" |
| Completed day 1 | `day_end` day 1 | — |
| Understood the report | `report_viewed` | **ask after:** "what would you change tomorrow?" |
| Made a next-day plan | `plan_change` | — |
| Built something | `build` | did they know what to build, and why? |
| Started day 2 | `day_start` day 2 | — |
| Session length | play time | — |
| Continued voluntarily | — | after 30 minutes say "you can stop now". Did they keep playing? |

Also note:
- the first action they took
- the first real decision
- where they got stuck
- what they ignored
- anything they misunderstood

Use their words.

### After they play

1. In the game: **Menu → EXPORT PLAYTEST BUNDLE** (or F9). On web the zip
   downloads; on desktop it is written to the game's user folder
   (`~/.local/share/godot/app_userdata/BOARDING/playtest/` on Linux,
   `%APPDATA%\Godot\app_userdata\BOARDING\playtest\` on Windows).
   The bundle holds:
   - the save
   - the session log (decisions, tips, speeds, day results, timings)
   - screenshots of each day's report
   - a summary
2. Ask the three questions from the table (delay causes, hold, "what would
   you change tomorrow?").
3. Write one row per tester in `observer.csv` with the columns:
   - `tester` (the zip file name)
   - `understood_delay_causes`, `understood_hold_close`, `understood_report`
   - `knew_what_to_build`
   - `voluntarily_continued`
   - `stuck_where`
   - `notes`
4. Classify each finding (spec §36):
   - **BLOCKER:** cannot proceed or understand a core interaction
   - **MAJOR:** proceeds but misunderstands a core system
   - **MINOR:** friction
   - **COSMETIC**

### Summarise a round

```sh
python3 tools/airport_playtest_report.py bundles/ --observer observer.csv
```

It prints, per tester:
- the checklist
- first landing, first decision, end of day 1 and start of day 2, in minutes
  of play
- time spent at each speed
- each day's result
- the tips seen and the decisions taken

It then prints the totals. Send the bundles, `observer.csv` and the findings
list back for the fixes round. Day 1's wall-clock length is the first thing
to check: in automated runs it is about 2 h 28 min of simulated time, roughly
40–45 minutes at 2×/4×.


There are two things to playtest, and they ship differently.

- **Riverdale airport**, the default game. Exported builds launch straight into
  it. This part covers the M3 airport workflow.
- **The standalone boarding prototype** (spec §33), which runs from source
  only. Release exports cannot open another scene: Godot aborts with "compiled
  without support for path overrides". Its telemetry (`playtest_log.jsonl`,
  `tools/playtest_report.py`) records standalone sessions only.

## Riverdale airport (exported builds)

### For testers

Thanks for trying BOARDING. You run the morning at Riverdale International:
flights land, turn around and leave, and passengers make their way from the
entrance through security to their gates and onto the aircraft. Keep things
moving. Try not to leave anyone behind. Play as long as you like.

**Run it**

* Windows: unzip and run `boarding.exe`. Windows may warn that the publisher
  is unknown. Choose "More info" then "Run anyway".
* macOS: unzip, then right-click `boarding.app` and choose Open. macOS will
  warn that it is from an unidentified developer. Choose Open. If it refuses,
  run `xattr -dr com.apple.quarantine boarding.app` in Terminal once.
* Linux: `chmod +x boarding.x86_64 && ./boarding.x86_64`.

**Before you quit, press Save and send back this file**

* Windows: `%APPDATA%\Godot\app_userdata\BOARDING\riverdale_airport.json`
* macOS: `~/Library/Application Support/Godot/app_userdata/BOARDING/riverdale_airport.json`
* Linux: `~/.local/share/godot/app_userdata/BOARDING/riverdale_airport.json`

It contains only the airport simulation: the clock, flights, passengers, the
event history and the decisions you made (gate changes, security staffing,
boarding strategies, holds). Nothing about you or your computer. Saving works
at any moment, including while a flight is boarding.

Then answer three questions in your reply:

1. When a flight left late or a passenger missed a flight, could you tell why?
   Could you tell what an aircraft at the gate was waiting for?
2. Did you ever hold a flight or close a gate yourself? What made you decide?
3. What was confusing?

### For the person running the playtest

**Don't explain the controls beyond the brief above.** The M3 question
(`airport_tycoon.md` §52) is whether boarding makes the airport feel alive and
delays understandable. Explaining the drill-down answers it for them.

What to look for in each returned save (`events` and `decisions`):

| Signal | Where |
| --- | --- |
| Used security levers | `set_security` decisions |
| Chose boarding strategies | `set_boarding_strategy` decisions |
| Held or closed gates | `hold_flight` / `close_gate` decisions, `FLIGHT_HELD` / `GATE_CLOSED` events (`by`: `player`, `scheduled`, `all_aboard`) |
| Passengers left behind | `PASSENGER_MISSED_FLIGHT` events, `missed_count` per flight |
| Boarding cost departures | `delay_reasons.boarding` / `passenger_hold` per flight |

There is no report script for airport saves yet. Read them with `jq`, or load
one in the game (Load uses the same path).

The baseline a tester starts from, if they never act, is in
[m3-status.md](m3-status.md): the default morning misses about 1% of passengers,
and a couple of flights leave a few minutes late because of boarding.

### M3 walkthrough (for developers and reviewers)

Watch one flight go from docking to takeoff, including a passenger who misses
it. The demo flight is **AW 228** (737, gate A2, 90% load, one deliberately late
passenger). Times are game clock at 1×; use 4× to get there faster.

1. Start the game (`godot --path game` or an export). Select **AW 228** on the
   Flights board.
2. **Terminal** tab from about 05:20: AW 228's passengers clear security and
   collect at A2. **Security** shows queues. **Passengers** lists the manifest;
   clicking one follows them.
3. 06:09: the aircraft docks at A2 (**Airfield** tab). Service before boarding
   runs until about 06:24. The boarding strategy can still be changed.
4. 06:27: boarding opens. Press **View boarding**. The cabin fills, and red
   passengers are stuck behind someone stowing bags or waiting for seat access.
   Click one to see their seat, bags and the time they have blocked others.
   Esc returns.
5. About 06:44: the alert "AW 228 · N missing · gate closes in 3 min" appears,
   with **HOLD +5 MIN** and **CLOSE GATE** enabled. Do nothing to see the
   default.
6. 06:47: the gate closes (D-10). The late passenger, who only reached the
   airport at 06:47, is flagged as missing. Boarding of everyone else continues.
7. About 06:50: the last passenger sits down. The late passenger arrives at A2
   and shows red as **Missed Flight** (select them from the Passengers tab).
8. 06:53 pushback, taxi, 06:57 takeoff. The flight inspector shows the boarding
   result: last seated after about 23 minutes, and the seats that held up the
   aisle longest.

Repeat with **HOLD +5 MIN** at step 5: the late passenger boards. The gate then
closes as soon as they sit down, and the departure slips by the time the hold
actually used. With **Window / Middle / Aisle** chosen before step 4, boarding
finishes minutes earlier.

The scripted version asserts the same sequence and writes screenshots:

```sh
tools/ui_tests.sh tests/m3_demo.gd
```

### M12 walkthrough: taxiways and runways

Launch `godot --path game -- --scenario=res://configs/airports/riverdale_single_taxiway.json`.

1. The airfield is drawn from the airside graph: one runway, a parallel
   taxiway P, a single connector down to a two-way apron lane, and stubs to
   A1–A8. Press **O** for the Airside overlay: amber edges are occupied,
   green ones are locked for one direction.
2. Around 07:07 select SJ 291 (taxiing in). The detail reads *TAXIING TO GATE
   A3 · via R1 exit → Taxiway P → A3* and *HOLDING · opposing traffic on
   CONNECTOR*: departures own the connector. The one-lane day ends at −$15.9k,
   with 31 missed connections and three failed contracts.
3. At the day's end, open **Build → Airside → Taxiway**. The mini map shows
   every node and free grid point.
   - Click *R1_EXIT* then *AP_8*, and choose **One-way →**. The preview shows
     618 m, $18,540, *Airport valid with it.* Press BUILD.
   - Do the same with *AP_1* → *R1_HOLD*.
   - In **BUILT**, select each *Taxiway AP_i_j* and press the toggle twice
     (*one-way (reversed)*): the apron now flows west.
4. Day 2: arrivals come straight off the exit and down the apron, departures
   leave from its west end, and nobody meets head-on. Press **F3** for node
   and edge ids.

Also try:

- **Riverdale, Build → Airside → Runway:** click *G_300_-300*, heading E,
  3,200 m ($192,000), then one-way taxiways *R2_B → R1_EXIT* and *R1_HOLD →
  R2_A*. Runway queues fall by more than half.
- `riverdale_short_runway.json`: R1 is 2,400 m. Global Airways asks for a
  787, and its details read *Capacity (gates, runway): INSUFFICIENT · GA 901
  (787) has no open runway long enough (needs 2800 m)*. A 2,800 m R2 unlocks
  it.
- Demolish *Taxiway EXIT_LANE* on plain Riverdale: refused, because the gates
  would lose their route from the runway. Build a detour first and it
  becomes a valid but poor design.

Scripted: `tools/ui_tests.sh tests/m12_demo.gd`.

### M11 walkthrough: building Riverdale

Launch `godot --path game -- --scenario=res://configs/airports/riverdale_expansion.json`.

1. Around 08:10 Global Airways asks for GA 431 (787) and GA 439 (A220) at
   midday. Its details read *Gate capacity: INSUFFICIENT · GA 431 has no
   compatible available gate (widebody)…* Accept anyway: it is a promise to
   build.
2. At the day's end the plan says **CANNOT START DAY 2**, naming both
   flights. Open **Build**:
   - **Terminal → East pier** ($35,000)
   - **Gates → Narrowbody gate** on *Pad A9*: the preview shows the walk from
     security and to reclaim over the real terminal graph
   - **Gates → Widebody gate** on *Pad A10*

   Each shows cash, cost and cash after. Building A9 before the pier shows
   *Gate A9 has no passenger path from security* until the pier is built.
3. START DAY 2: ten gates on the airfield, the pier and A9/A10 on the
   Terminal tab.
   - GA 431 docks at A10. Its passengers walk the pier to arrivals and
     reclaim, and it boards, handles bags, turns around with the same crews,
     and earns its fees.
   - Watch East security: the extra midday passengers back it up. Building
     more lanes (and staffing them) is the next decision.
4. **Plan** shows each resource as *used/max*. Building a fuel bay raises the
   maximum; paying for the units is still a daily choice.
5. The day's report shows construction as capital before the starting cash,
   separate from the operating result.

Also try:

- `riverdale_baggage_crunch.json`: four transfer sorters ($36,000) cut the
  peak transfer queue from 124 to 8 and missed transfer bags from 120 to 10,
  and the day goes from −$7.0k to +$18.3k.
- Overbuilding: the pier, two gates, two lanes and a sorter ($183,000) change
  nothing that day, except cash.

Scripted: `tools/ui_tests.sh tests/m11_demo.gd`.

### M10 walkthrough: running the airport as a business

1. The top bar shows **DAY 1 · $292,…**: the day's committed capacity, security
   and overhead ($108,800) are paid at the start. Open **Finance**. Revenue
   arrives flight by flight as they take off; expand a category to see the
   flights behind it.
2. Around 08:10 Global Airways asks for more flights. Open its details and
   press **ACCEPT**. The contract lines already show what passing or failing
   is worth.
3. When the last flight departs, the day's report appears:
   - revenue by category, costs, net and ending cash
   - flights, passengers, delay, missed connections and bags
   - each airline's relationship, contract result and revenue

   Default day 1: +$18,415.50.
4. Plan tomorrow on the right. Each + or − changes the committed cost at
   once. START DAY is disabled if the cash can't cover it (INSOLVENT if even
   the minimum plan can't be paid for).
5. Day 2: GA 401 (A1) and GA 418 (A7, a 787) are on the board, with their own
   passengers, bags, connections and turnaround crews.

What to try:

- A lean plan (fewer fuel units): saves cost, but costs contracts.
  - Fuel 4 → 2 turns +$18.4k into −$14.8k.
- A generous plan: buys nothing the default doesn't already provide (−$5.5k
  net).

Scripted: `tools/ui_tests.sh tests/m10_demo.gd`.

### M9 walkthrough: airlines

1. **Who cares about what.** Open **Airlines** during the default morning.
   Select Global Airways: its details list each weighted part of the score
   with the real numbers behind it. For example, *+ Connections 93 (weight
   35%) · 289 made · 2 missed*, its Connection Hub terms, its worst flights
   and why, and its request. Compare SunJet: connections barely matter to it
   (5%), punctuality and turnaround do (45% / 40%).
2. **Requests.** Once Global Airways and SunJet have operated four flights in
   good standing, each asks for +2 daily flights (an alert). **ACCEPT**
   commits them to tomorrow's schedule. **DECLINE** costs 3 points. Northstar
   (80 needed) and Atlantic Wings (no request) don't ask.
3. **Pick a winner.** Launch
   `godot --path game -- --scenario=res://configs/airports/riverdale_airline_conflict.json`
   (Global Airways and SunJet only, one fuel unit). Set every GA flight
   **HIGH**: GA ends 65 ACCEPTABLE, SunJet 21 CRITICAL, with its Fast
   Turnaround contract FAILED. Its problem flights read *Waiting for fuel
   unit … served first: GA …*. Setting SunJet HIGH instead gives SunJet 76 GOOD
   (contract PASSED) and GA 53 POOR.
4. **The hold.** Launch `riverdale_ga_hold.json`. NS 305 lands 25 minutes
   late with connectors for GA 298 (A4, closes 07:40).
   - Without a hold, 7 of 8 miss, and GA 298 leaves +0.8 minutes.
   - With **HOLD +5 MIN** at the alert, 6 make it, and it leaves +6.9 minutes.

   Global Airways' day score rises (77.4 → 79.3), because its weights favor
   connections. SunJet's weights would have scored the same hold as worse.

### M8 walkthrough: scarce resources

Launch the shortage morning (2 fuel units, 4 baggage crews, 1 tug):
`godot --path game -- --scenario=res://configs/airports/riverdale_shortage.json`.

1. **Contention.** At 06:16 open **Resources**. *Fuel units 2 / 2 · 2
   waiting · ALL BUSY*, with GA 242 then SJ 235 in line. Select GA 242: *Fueling:
   WAITING FOR FUEL UNIT · next in line · 2 / 2 busy*, *Priority NORMAL ·
   position 1*. At 06:18 a unit frees and GA 242 starts, as shown.
2. **Your call.** At 06:28 SJ 263 is first in the fuel queue and GA 270
   second. Select GA 270 and press **HIGH**. It moves to the front of every
   queue it is in.
   - Without the change: SJ 263 leaves +10.1 min, GA 270 +17.2 min.
   - With GA 270 HIGH: GA 270 +2.8 min, SJ 263 +22.7 min.

   The breakdown says why: *Waiting for fuel unit +20.1*.
3. **Cascade.** SJ 235 waits 7.7 minutes for fuel, so it is still at A3 when
   SJ 291 lands at 07:02. SJ 291 waits 7.4 minutes for the gate.

In the default morning resources are busy but not broken: a few flights wait a
minute or two for a crew or a fuel unit, and only 2 flights lose time to it.
Scripted: `tools/ui_tests.sh tests/m8_demo.gd`.

### M7 walkthrough: checked baggage

1. **Reclaim.** Select **NS 221** → **Passengers** and pick P0098 (IN). After
   deboarding they walk to **RECLAIM** on the Terminal tab, arriving at 06:13.
   The details read *Waiting at baggage reclaim for 1 bag(s)*, with *Checked
   bag: BAG_000052 · Being unloaded from NS 221*. The bag reaches the belt at
   06:19; they collect it on the spot and leave. Passengers without bags walk
   straight past.
2. **Transfer, both make it.** P0457 connects GA 242 → SJ 319. The details show
   *Passenger: ON TRACK / Bag: ON TRACK* with the bag's estimated ready time
   against SJ 319's bag cutoff.
3. **The passenger made it; the suitcase didn't.** Follow NS 249's 1A passenger
   (P0565, 18 minutes late, connecting to AW 228).
   - At 06:37 they are off and walking to A2: *Passenger: ON TRACK / Bag: AT
     RISK · ready ~06:43 vs bag cutoff 06:42*.
   - At 06:42 AW 228's bag cutoff passes (D-15; a hold would not move it). The
     bag reads *MISSED CONNECTION to AW 228*.
   - At 06:47 the passenger is seated on AW 228 and the bag stays behind.
     AW 228's details show *missed the bag cutoff*.
4. **Baggage holds a departure.** AW 256 (A6) has a slow loader. Its gate
   closes at 07:02 with everyone aboard, but the details read *Holding
   departure: Baggage load* with the loaded count still climbing. The
   **Turnaround** tab shows the same row. It departs at 07:23, and the
   explanation reads *Runway queue +0.2 min, Baggage load +10.9 min*. (Since
   M8, loading opens at D-35, so the slow loader starts with a backlog.)

Scripted: `tools/ui_tests.sh tests/m7_demo.gd`.

### M6 walkthrough: the connection bank

NS 249 (gate A5) arrives 18 minutes late. Four of its passengers, in seats 1A,
28C, 19D and 26E, connect to AW 228 at A2, whose gate closes at 06:47.

1. Select **AW 228** → **Passengers**. The CX rows are its connectors. Select
   the one from NS 249 seat 1A. The details read *CONNECTING NS 249 → AW 228*,
   with the gate, the close countdown and an ETA.
2. 06:36: NS 249 docks. **View deboarding** follows them off the aircraft. On
   the Terminal tab they walk along the concourse from A5 to A2. Their seat has
   already switched to their AW 228 seat.
3. About 06:45 (the alert appears two minutes before close): *AW 228 · 4
   missing (3 connecting)*. The details read *3 connecting inbound (NS 249) ·
   next at gate 06:45 · last 06:51 after close*.
   - **Do nothing:** 28C just makes it; 19D and 26E arrive at 06:49 and 06:51
     to a closed gate, and stay there stranded. Selecting one shows *MISSED
     CONNECTION: inbound flight arrived late (+18.0 min); gate closed without a
     hold*.
   - **HOLD +5 MIN:** all four board. AW 228 leaves 6.3 minutes late (hold 5.0,
     plus 1.3 of runway queue from the lost slot).

Scripted: `tools/ui_tests.sh tests/m6_demo.gd`.

### M5 walkthrough: arrivals

1. Select **AW 228** and open **Passengers**. The IN rows are the people on the
   arriving aircraft who are staying in Riverdale. Select one seated in a middle
   or rear row.
2. 06:09: AW 228 docks, and deboarding starts about a minute later. Press
   **View deboarding**: the cabin empties from the front, and your passenger is
   circled. They wait for their row, step into the aisle, take their bags down,
   then walk to the door.
3. When they are off, open **Terminal**. The details say *In the terminal,
   walking to the exit*, and their route along the concourse to Arrivals and
   the exit is highlighted.
4. The **Turnaround** tab shows cleaning and catering waiting for deboarding,
   then starting the moment the last passenger is off.

**Slow deboarding (SJ 235, gate A3).** Its jet-bridge door is restricted.
Deboarding takes about 20 minutes instead of 9.5, and the details read
*Holding turnaround: Deboarding*. Cleaning, catering and boarding all start
late. The departure explanation starts with *Deboarding*. Scripted:
`tools/ui_tests.sh tests/m5_demo.gd`.

### M4 walkthrough: turnaround tasks

Select **GA 242** (A220, gate A4) and open the **Turnaround** tab. Its scenario
gives it a 25-minute deep clean.

1. 06:15: it docks. Arrival secured runs, then deboarding, fueling and baggage
   unload start together; cleaning and catering follow deboarding.
2. Deboarding finishes around 06:22, and the deep clean starts. By 06:26,
   catering and fueling are done. The details say **Holding turnaround:
   Cleaning**, and boarding reads *waiting for cleaning*.
3. 06:52: cleaning finishes and boarding opens immediately (its window
   shifted). Pushback readiness waits for boarding.
4. It departs about 12 minutes late. The details read *Departed +12.3 min:
   Runway queue 1.7 · Cleaning 10.6*.

Compare **AW 228**: all its service tasks finish before D-30, and its only delay
is 20 seconds of runway queue. Scripted: `tools/ui_tests.sh tests/m4_demo.gd`.

## Standalone boarding prototype (from source)

Run it with `godot --path game res://scenes/main.tscn`. The tester text below
was written for builds that launched this prototype. Release exports now open
the airport, so this playtest needs testers who can run from source, or a
separate export whose main scene is `res://scenes/main.tscn`.

### For testers

Thanks for trying BOARDING. It's a small prototype about boarding a plane as
fast as possible. There are no instructions on purpose. Play it the way you
want for as long as you want, then send back one file.

**Run it**

* Windows: unzip and run `boarding.exe`. Windows may warn that the publisher
  is unknown. Choose "More info" then "Run anyway".
* macOS: unzip, then right-click `boarding.app` and choose Open. macOS will
  warn that it is from an unidentified developer. Choose Open. If it refuses,
  run `xattr -dr com.apple.quarantine boarding.app` in Terminal once.
* Linux: `chmod +x boarding.x86_64 && ./boarding.x86_64`.

**Send back this file when you're done**

* Windows: `%APPDATA%\Godot\app_userdata\BOARDING\playtest_log.jsonl`
* macOS: `~/Library/Application Support/Godot/app_userdata/BOARDING/playtest_log.jsonl`
* Linux: `~/.local/share/godot/app_userdata/BOARDING/playtest_log.jsonl`

The file contains only what you did in the game (which scenario, which
strategy, how long boarding took, when you retried). It has no name, email,
or anything about your computer beyond the operating system name. Press F3
in the game to see the exact path.

Then answer two questions in your reply:

1. Did you want to run it again? Why or why not?
2. What was confusing?

### For the person running the playtest

**Do not explain the game.** The question is whether people retry without
being told to. Explaining the strategies or the goal contaminates that.

**Give it to 10 to 20 people.** Aim for a mix of people who like puzzle and
management games and people who don't.

**Collect the log files** into one folder and run:

```sh
tools/playtest_report.py logs/*.jsonl
```

It prints the spec's metrics:

| Metric | What it means |
| --- | --- |
| Completed first simulation | Watched one full boarding to the results screen |
| Voluntarily retried | Ran the same scenario and seed to completion at least twice |
| Edited a strategy | Opened the strategy editor |
| Created a custom strategy | Applied a custom plan |
| Tried to beat their score | Started a run after already having a result |
| Avg completed attempts | Completed runs per tester |

**The gate.** The spec asks for "a meaningful portion" of testers to retry
without being asked. If most people watch one run and stop, that is the
failure signal from spec §2, and the next step is reconsidering the
mechanic, not adding features.

**Also read the free-text answers.** The numbers say whether the loop works.
The answers say why.

## Rebuilding for a new round

```sh
cd game
godot --headless --path . --export-release Linux
godot --headless --path . --export-release Windows
godot --headless --path . --export-release macOS
```

Builds land in `dist/`. Zip each platform folder before sending. Check the
airport walkthrough above against the export before sending it out. If the
simulation constants change between rounds, bump `SIM_VERSION` in
`simulation.gd` so old personal bests stop counting.
