# Playtest Guide

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
   start together; cleaning and catering follow deboarding.
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
