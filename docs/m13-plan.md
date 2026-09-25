# M13 plan: Career V1, progression, onboarding and human playtesting

**Status:** planned 2026-09-25 against M12 (`64ea3b8`). Decisions D-057 to
D-064.

**Split agreed with the user.** Human playtest rounds (spec §34–37) need real
first-time players, which the implementer cannot run.

- **M13 part 1 (this plan):** steps 1–14 and 18 of the work order, plus a
  tester kit. It is committed as *M13 part 1*, and the work stops there.
- **The user** runs round 1 and returns the playtest bundles.
- **Then:** fixes for blockers and major issues, then round 2, then the M13
  commit with the evidence.

No automated or scripted walkthrough is reported as human evidence.

## What M12 left (actual code)

- **The scene starts itself.** `airport.tscn` (`airport_main.gd`) is the main
  scene. `_ready()` starts a career on Riverdale (or `--scenario=`) and runs
  day 1 at once. There is no menu, no career choice and no airport name.
  `main.tscn` is the standalone boarding game.
- **Career** (`career.gd`): cash, ledger, days, relationships, request tiers,
  plan, layout. `new_career(path, seed)`, `start_day()`, `settle_day()`,
  `snapshot()` and `from_snapshot()`.
- **One save slot, manual only:** `user://riverdale_airport.json`.
- **The report** (`_day_report_text`) is a finance table plus one line of
  operations and one line per airline (contract status, no reason).
- **Alerts** are a flat `ItemList`, built every refresh from conflicts,
  security, contracts, requests, resource queues, tug waits, baggage backlogs
  and boarding alerts. They have no severity or grouping.
- **Help:** a status line lists hotkeys. There is no tutorial and no help.
- **The airfield map** fits the view; it has no zoom or pan.
- **Developer surfaces visible to players:** debug ids, "RIVERDALE"
  hard-coded in the title, map and report, and internal cause keys
  (`wait:fuel_unit`) in places.
- **Playtest logging** exists only for the standalone boarding game
  (`PlaytestLog`, `tools/playtest_report.py`).
- **No sound system.** §43 is deferred.
- **Web export templates for 4.7.2 are installed.** There is only a Linux
  preset.

## Design

### Starter airport (D-057)

`configs/airports/career_starter.json` is a full scenario, not a Riverdale
overlay. It reuses Riverdale's aircraft types, turnaround tasks, boarding and
deboarding timings, fee tables and contract templates (copied by a generator
script, `tools/make_starter.py`, so they cannot drift silently).

- **Airside:** 1 runway (2,400 m: no 787 until the player builds 2,800 m or
  longer), a parallel taxiway, one two-way apron lane and stubs. It is
  geometric, and small enough that congestion only appears when traffic grows.
- **Terminal:** entrance → check-in → one security checkpoint (2 physical
  lanes, 1 open) → one concourse → gates B1–B3 (narrowbody). Arrivals,
  reclaim and exit.
- **Expansion sites:** pads B4 and B5 (narrowbody) off the concourse. A
  south pier (terminal piece) reaching pad B6, a widebody pad. Security row
  up to 5 lanes; baggage rows; a service yard; the airside grid.
- **Baggage:** 1 outbound, 1 transfer, 1 reclaim server.
- **Resources:** small facilities (cleaning 1–2, catering 1–2, fuel 1–2,
  baggage crews 3, tugs 1).
- **Airlines:** three, from Riverdale's fictional set:
  - Northstar: A220, reliability-minded
  - SunJet: 737 / A321, turnaround-minded
  - Global Airways: A321 for now, the connection airline, with later a 787
- **Day 1:** 6 flights in two short waves, with shorter passenger arrival
  leads so the terminal does not flood at the start. It aims at about 2
  simulated hours, about 30 minutes at mixed 2×/4×, to be measured in
  playtests.
- **Growth** comes only from the M9 request tiers, earned by relationship and
  flights operated:
  - more narrowbody rotations (need B4/B5)
  - a connection bank
  - Global Airways' 787 (needs the pier, B6 widebody gate, and a 2,800 m
    runway)

  Nothing is day-scheduled. A good player sees it earlier; a struggling one
  later.

Riverdale is untouched: it stays the regression baseline and becomes
**Sandbox · Riverdale International** in the menu.

### Progression and objectives (D-058)

`career.objectives` in the scenario defines four chapters (Operate, Improve,
Grow, Expand airside) and a V1 milestone. Each chapter has one primary
objective and at most three optional ones. Every objective is a predicate on
real state:

- **the settled day report:** flights, passengers, mean delay, missed
  connection rate, net result, contract results
- **career state:** request accepted, layout counts beyond the imported
  airport (gates, lanes, runway length), cash
- **the day's flights:** a 787 departed

Objectives are evaluated at events only (day settlement, construction,
request answers), never per tick. State lives in the career save
(completed ids with day, current chapter). There is no XP and no levels. The
milestone — *Regional hub: ≥ 14 departures in a day, profitable, every
operating airline's relationship ≥ 60, and a 787 served* — is tuned by
automated baselines now and by playtests later. Play continues after it.

### Contextual tutorial (D-059)

`TutorialDirector` (UI layer) watches existing state on the UI refresh (not
the simulation tick):

- first aircraft approaching
- first security queue ≥ N
- first resource wait
- first boarding alert with connectors
- first late departure (the drill-down into its causes)
- day end
- first request offered
- Build tab opened
- first taxi hold

Each prompt is one short card pointing at the relevant panel, dismissible,
and recorded in the career as done, so it never repeats (also after
loading). A global setting turns tips off. Sandbox starts with tips off.

### Difficulty (D-060)

`RELAXED` / `STANDARD` / `CHALLENGING` presets in the starter config change
only:

- starting cash
- contract thresholds (loosened or tightened)
- request thresholds (growth speed)
- daily resource costs

The simulation and its physics are identical. The difficulty is saved with
the career.

### Menu, continue, saves, autosave (D-061)

`menu.tscn` becomes the main scene:

- **CONTINUE:** the newest save of any kind
- **NEW CAREER:** airport name, seed (random by default, editable),
  difficulty
- **SANDBOX · RIVERDALE**
- **LOAD GAME:** the saves list
- **SETTINGS:**
  - tips on/off
  - pause on critical alerts
  - slow to 1× on critical alerts
  - UI scale
- **QUIT**

`--scenario=` still opens the airport scene directly (developer and test
path). Developer scenarios are listed only with `--dev` or in debug builds.

**Save slots:** `user://saves/<career id>/`, holding `manual.json` and three
rotating autosaves. Autosaves happen:

- at the start of each operating day
- at the settled end of day
- after each committed planning or construction change

Mid-day manual saves stay.

### Alerts (D-062)

Every alert gets a severity:

- **CRITICAL:** a boarding gate closing with missing connectors, an arrival
  with no gate soon (a critical gate conflict), the next day cannot start
- **IMPORTANT:** a resource queue of 2 or more, a tug wait of 2 minutes or
  more, a long security queue, a baggage backlog, a contract AT RISK or
  FAILING
- **INFO:** requests on offer, aircraft holding on the taxiway

Repeated alerts of one kind are grouped (*Fuel units · 3 flights waiting*).
The list is sorted by severity. A new CRITICAL can pause or slow the game,
per the settings; the default is chosen by playtest (initially *slow to 1×*,
not pause).

### Decision visibility and bottlenecks

- **Today tab:** a compact bottleneck summary from existing metrics:
  - security average and worst wait per checkpoint, with lanes open /
    physical
  - resource utilization and flights that waited
  - baggage stage utilization and peak queue
  - the worst taxiway (total wait per edge)
  - runway queue
  - contracts at risk
- **Taxiway waits:** `AirsideNetwork` gains a per-edge wait counter (saved),
  the only new simulation state.
- **Top bar:** cash, the next critical item and the day's objective.

### End-of-day story

The report leads with:

- **Headline:** flights, passengers, result
- **WHAT WENT WELL:** contracts passed, with actual vs target; on-time and
  bag-transfer rates
- **WHAT HURT:**
  - resource waits (with the flights)
  - missed connections, with the largest cause flight and its delay
  - security peak
  - the worst taxiway
  - failed contracts, with actual vs required and the largest cause
- **OBJECTIVES:** progress
- **NEXT:** requests accepted or offered, what blocks the next day

The finance table follows. Build info shows the relevant facts for the
category (for example *Security: peak queue 41 · lanes 2/2 open*), never
advice. Catalog effect texts are rewritten to physical effects.

### Help, accessibility, polish

- **Help:** eight short pages behind **?** or **H**: flight lifecycle,
  resources, connections, baggage, airlines and contracts, finance,
  construction, airside.
- **Controls:** the airfield map gets mouse-wheel zoom and drag pan. The UI
  scale setting sets `content_scale_factor`.
- **Clean-up:** debug-only ids stay behind F3. The airport name replaces
  "RIVERDALE". Cause keys become labels everywhere. The selected aircraft,
  critical alerts and build validity get stronger colors.

### Playtest bundle (D-063)

`AirportPlaytestLog` appends session events to `user://playtest/session.jsonl`:

- session start and end, wall-clock time
- menu choices, speed changes, selections, tab opens
- decisions (security, priority, hold/close, gate, plan, build, accept or
  decline)
- tutorial prompts shown and dismissed
- day start and end, with the report summary
- performance samples: FPS and tick µs per minute

**EXPORT PLAYTEST BUNDLE** (menu and F9) writes one zip: the current save,
the session log, the settings, derived §35 checklist flags and screenshots
taken automatically at each day's report (plus F12). On web it downloads the
zip.

`tools/airport_playtest_report.py` turns a folder of bundles into the §35
table.

**The event history stays in saves** (explanations depend on it). A
starter-career mid-day save is measured; trimming is left as debt unless it
blocks playtesting (§30).

### Save schema v13 (D-064)

The career gains:

- mode (career or sandbox)
- airport name
- difficulty
- the objective state
- tutorial prompts done
- a career id

The day gains the per-edge taxi wait counters. v12 is rejected.

## Tests (`test_career_v1.gd`)

- **Deterministic creation:** a new starter career is deterministic; the
  seed and difficulty are applied.
- **Multi-day progression:** several days advance; construction persists.
- **Objectives:** completed and failed from real metrics (constructed
  reports and real days).
- **Tutorial:** done prompts do not repeat, including across a save and load.
- **Growth:** real performance unlocks a request tier; poor performance
  delays it.
- **Autosave:** boundary autosaves restore exactly, and the rotation keeps
  three.
- **Insolvency:** it offers restart and menu; nothing else ends a career.
- **Continue:** it picks the newest save.
- **Sandbox isolation:** the Riverdale config and day 1 are unchanged, to
  the cent.
- **Determinism:** the same seed and the same actions give the same results.
- **Regression:** all M1–M12 tests and the golden baseline.

## Demos (`m13_demo.gd`) and baselines

- **A (rendered):** the first 30 minutes: the menu, a new career, the first
  aircraft tip, a security decision, a resource wait, the end of day 1, the
  report, the plan.
- **B:** a multi-day career: growth earned, the airport built, traffic up, a
  new bottleneck.
- **C:** recovery: a deliberately under-provisioned bad day (a failed
  contract, a loss), then recovery through planning.
- **D:** construction creates the next problem: gates → flights → security
  → lanes → connections → taxi congestion.
- **Strategy baselines:** conservative, aggressive, under-provisioned,
  overbuilt, growth-heavy (`tests/career_strategies.gd`).

## Tester kit (`docs/PLAYTEST.md`)

- the build to run (Linux, web)
- the single instruction ("Start a new career and run the airport")
- an observer sheet with the §35 metrics and the severity scale (§36)
- how to export the bundle
