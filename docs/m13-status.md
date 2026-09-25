# M13 part 1 report: Career V1, progression and onboarding (human playtests pending)

Implemented on 2026-09-25 from M12 (`64ea3b8`), against
[m13-plan.md](m13-plan.md). Decisions D-057 to D-064.

**What this is.** By agreement with the project owner, M13 is split:

- **Part 1 (this report):** work-order steps 1–14 and 18. The playable
  career, onboarding, the playtest tooling and a tester kit, the automated
  tests, the baselines and the web export.
- **Next, run by the project owner:** human playtest rounds 1 and 2 with
  first-time players (spec §34–37), then fixes for blockers and major issues,
  then the M13 commit.

**Nothing below is human evidence.** The scripted demos and automated "player"
policies show the systems work and respond to choices. Whether a stranger
understands them is what the playtests must show. The product questions are
answered at the end as *not yet answered*, with what the automated runs
suggest.

## Delivered

- **A game you start from a menu (D-061).**
  - **Menu:** CONTINUE, NEW CAREER (airport name, seed, difficulty), SANDBOX
    · RIVERDALE INTERNATIONAL, LOAD GAME, SETTINGS, and QUIT (not on web).
  - **In game:** an Esc menu (resume, save, help, playtest bundle, main menu,
    quit).
  - **Saves:** a manual save and three rotating autosaves per career (at day
    start, at day end, and after planning or construction changes).
  - **Developer paths:** `--scenario=` and the developer scenarios (`--dev`
    or debug builds) still work.
- **Harbor Field Regional (D-057),** a small starter airport built from real
  construction objects on the full simulation:
  - 1 runway (2,400 m), one connector to a two-way apron
  - 3 narrowbody gates, one security hall (2 lanes, 1 open)
  - one server per baggage stage, small service facilities
  - three airlines, 6 flights on day 1

  **Expansion:** pads B4, B5, B7 and B8, a widebody pad B6 behind an east
  pier, more lanes, sorters and facilities, taxiways, and a second runway. The
  growth tiers add up to 14 flights and a 787.

  **Riverdale** is the untouched sandbox: its day 1 is the M12 day to the
  cent (tested).
- **Progression from the airport itself (D-058).** Four chapters (Operate,
  Improve, Grow, Expand airside), each with one primary and up to three
  optional objectives. The career milestone is *Regional hub*: 14 departures,
  profitable, every airline at 60 or better, and a 787.
  - Objectives are predicates on settled reports and on the built airport.
  - Missed ones show the actual value against the target.
  - There is no XP, and nothing is day-scheduled: growth comes only from the
    airlines' requests, earned by performance.
- **Difficulty (D-060):** Relaxed, Standard, Challenging change cash, costs,
  contract slack and growth thresholds only (tested: identical simulation).
- **Contextual tips (D-059),** eleven of them, each at the moment its
  situation first arises:
  - welcome
  - a security queue (open a lane)
  - the first aircraft
  - a resource wait (service priority)
  - a tight connection (hold or close)
  - a late departure (read its causes)
  - a growth request
  - a taxi hold
  - the day's end
  - tomorrow blocked
  - the Build tab

  They are dismissible, recorded in the career, and never repeat.
- **Decision visibility:**
  - **Top bar:** cash and the chapter's goal with today's progress.
  - **Today tab:** the bottleneck summary. It shows security worst and average
    wait with lanes open of physical, resource busy % and the flights that
    waited, baggage peaks, the worst taxiways, the runway queue, and contracts
    at risk with the failing terms.
  - **Goals tab.**
  - **Alerts** ranked CRITICAL / IMPORTANT / INFO and grouped (D-062). A new
    critical alert drops the game to 1× by default (pause or neither in
    Settings).
- **Why was it late.** The flight detail now leads with its status and, once
  departed, the delay broken down with the biggest cause first (for example
  *Departed +3.6 min late · Waiting for fuel unit +2.2 · Fueling +1.0 · Runway
  queue +0.3*).
- **An end-of-day story:**
  - the headline (flights, passengers, result)
  - CHAPTER COMPLETE and MILESTONE banners
  - **WHAT WENT WELL:** contracts passed, with actual against target
  - **WHAT HURT:**
    - failed contracts with the failing term, required vs actual
    - flights that waited for each resource
    - missed connections, with the inbound flight that caused most of them
      and how late it was
    - security worst waits
    - busy taxiways
    - the three latest flights with their biggest cause
  - **OBJECTIVES,** met or not, with values
  - then the finance table
- **Construction:**
  - **Effects:** catalog texts now name the physical effect.
  - **Facts:** the Build tab shows yesterday's facts for the category (for
    example *Main security: peak queue 44 · worst wait 4.4 min · 2 of 2
    physical lanes open*), never advice.
- **Recovery, not traps (D-061):**
  - **Withdrawal:** an accepted request that blocks tomorrow can be
    withdrawn. It costs 10 relationship points, and the airline may ask
    again.
  - **Reserve:** construction keeps a reserve for tomorrow's minimum plan, so
    no build can make the career insolvent.
  - **Insolvency** is the only hard failure; it offers restart or the menu.
- **Help and controls:**
  - **H or ?** opens eight help pages: flights, resources, security,
    connections, baggage, airlines, money, building.
  - **Map:** mouse-wheel zoom and right-drag pan on the airfield.
  - **Settings:** interface scale.
  - **Security:** one OPEN A LANE / CLOSE A LANE action per lane (lane and
    staff together).
- **Playtest tooling (D-063).**
  - **Session log:** decisions, speeds, tabs, tips, days, critical alerts, and
    a performance sample each minute.
  - **EXPORT PLAYTEST BUNDLE:** one zip (log, settings, save, report
    screenshots, a summary with the §35 flags); on web it downloads.
  - **Report tool:** `tools/airport_playtest_report.py` gives per-tester
    checklists, play-time timings, time at each speed, decisions and tips, and
    merges observer notes.
  - **Tester kit:** at the top of [PLAYTEST.md](PLAYTEST.md).
- **Web build.** A Web export preset (no threads), plus a bundled symbol
  fallback font, because browsers have no system fonts for → ✓ ≤ ≥.
- **Save schema v13 (D-064).**
- **Simulation additions, metrics only:** peak queues, per-taxiway waits and
  gate-hold ticks.
- **One M12 attribution fix:** an arrival held at the runway exit for its
  occupied gate is a gate wait, not taxi congestion.

## Demonstrations

**A — the first session (rendered, `tools/ui_tests.sh tests/m13_demo.gd`).**
It follows the tips as a player would: open the lane, select the aircraft,
look at the resources and at the late flight, accept nothing. Simulated time
from the start of day 1:

| Sim time | What happens |
| --- | --- |
| +0:00 | Welcome: 6 flights, 3 gates, the goal, the controls |
| +0:14 | NS 101 arriving: *click it* |
| +0:22 | 20 passengers queuing at security with 1 lane: OPEN A LANE (the demo does) |
| +0:26 | All fuel units busy, SJ 201 waits: service priority |
| +1:27 | GA 301 left 3.6 min late: its causes, fuel first |
| +2:16 | SunJet wants more flights |
| +2:28 | Last departure. The report: 6 flights, 757 passengers, +$976.50, mean delay 0.6 min, all four chapter-1 objectives met. The day-end tip, then the plan (+1 fuel unit) and the goals |

Without opening the second lane, the same day loses $1,396 with a 162-person
queue and 32-minute security waits (the underprovisioned baseline).

**B–D and the strategy baselines** come from the 12-day runs of
`tests/career_strategies.gd` (seed 5313, Standard). The automated policies are
crude: they follow simple rules and are not good play.

| Policy | Flights | Operating | Capital | Cash on day 12 |
| --- | --- | --- | --- | --- |
| conservative: grows when it can, one more unit of what made flights wait | 134 | +$187,194 | −$165,000 | $172,194 |
| aggressive: accepts all, maximum capacity, builds eagerly | 65 | +$17,906 | −$117,000 | $20,906 |
| underprovisioned: minimum capacity, one lane, declines | 72 | +$22,266 | $0 | $172,266 |
| overbuilt: $126k of construction on day 1, no growth | 72 | +$2,143 | −$126,000 | $26,143 |
| growth: accepts everything including the 787 | 82 in 8 days | +$109,926 | −$165,000 | $24,926 (stopped day 9) |

The aggressive and growth policies stop when their scripted rules can't
resolve a blocked day. A player would plan differently, so those rows are
floors, not outcomes.

- **B, progression** (conservative):
  - growth by day: 6 → 7 → 10 → 13 flights
  - the result: +$1k → +$15k → +$22k a day
  - four gates, then the pier and two more
  - chapters completed: Operate on day 1, Improve on day 3, Grow on day 4,
    then Expand airside becomes active
- **C, recovery** (a 6th policy, 8 days):
  - **Days 1–2, deliberately bad** (minimum capacity, no second lane,
    requests unanswered): 32-minute security waits, contracts 2 of 3.
  - **Days 3–6, better planning:** 6 → 11 flights and +$15–19k a day.
  - **Day 7, a cash crunch:** 13 flights but mean delay 20 min and 0 of 3
    contracts.
  - **Day 8:** back to +$17k.
- **D, construction creates the next problem** (conservative):
  1. B4 brings 7 and then 10 flights; the security peak goes 22 → 44 → 79.
  2. The pier and B7 bring 13 flights; security peaks at 268 with 27-minute
     waits.
  3. Taxi waits on CONNECTOR go 0.7 → 2.0 min, and baggage crews start to
     wait.

  This comes from the simulation; nothing is scripted.
- **The 787** stays a medium-term goal. Its package (pier, widebody gate,
  2,800 m runway, two taxiways) costs about $210k. The growth policy accepts
  it on day 8 and has to withdraw it; conservative has about $172k by day 12.

**Balance reading (automated, for the playtests to confirm or refute):**

- No single policy dominates on every axis. Neglect is safe but stagnant;
  overbuilding and over-capacity cost cash.
- Growth with measured investment clearly beats both.
- Security becomes the binding constraint as traffic grows, which is the
  intended next decision.

## Verification

| Check | Result |
| --- | --- |
| `./run_tests.sh` | 235 tests, 0 failed (2,232 s, 50 deadlock runs). The standalone golden baseline is identical |
| New `test_career_v1.gd` | 16 tests |
| `tools/ui_tests.sh` | Airport UI, terminal UI and the M3–M13 demos: 0 failures (the M12 demo after its trace fix, rerun on its own) |
| Web export | runs in headless Chromium: menu, new career, day running at 4×, Esc menu (see Performance) |

The 16 career tests:

- **Creation:** a deterministic starter (3 gates, 2,400 m runway, 6 flights,
  real construction objects); difficulty changes economics, not the
  simulation.
- **Objectives:** judged on real metrics, with actual vs target on a miss;
  state objectives complete at build time; the milestone needs everything at
  once.
- **Tips:** never repeat, even after a save and load; none in the sandbox.
- **Growth and recovery:**
  - growth is earned (a well-run day earns a request; the gate it needs
    persists into later days)
  - neglect earns none
  - a bad day is not the end
  - a withdrawn promise frees the next day and may come back
  - construction cannot bankrupt the career
  - insolvency is the only hard failure
- **Saves:** autosaves restore exactly and rotate; CONTINUE picks the newest;
  saves keep career state and reject v12, unknown objectives and unknown
  difficulties.
- **Isolation and determinism:** the sandbox is Riverdale unchanged; the same
  seed and the same actions give the same career; the report tells the story.

**Regression:**

- M1–M12 are green.
- The standalone golden baseline is unchanged.
- The M1–M12 smoke tests needed two text updates: one OPEN A LANE press
  replaces the "+ staff" / "+ lane" pair, and the save message reads *Saved*.
- **The M12 demo under the corrected gate-hold attribution (D-057):**
  - **A:** the one-lane day's taxi waits read 50.5 min instead of 107.2 (the
    rest was aircraft held for occupied gates).
  - **E:** its trace now splits AW 312's 15.0 min from landing to gate
    (Riverdale 11.3) into taxiing 3.8 min (Riverdale 3.0) and holding for its
    gate 11.3 min (Riverdale 8.3). The gate stayed busy because the aircraft
    in it was delayed on the one-lane taxiway.
  - Every other M12 figure is unchanged.
- M11's gate assignment now prefers the least capable gate for open slots
  (widebodies first). Configured gates are untouched, so the Riverdale
  results are unchanged.

## Performance

`tests/career_v1_benchmark.gd`, measured on a heavily shared machine (load
average 25). The absolute numbers are inflated by other processes; the
relative costs are what matter.

| | Result |
| --- | --- |
| Starter day 1 (6 flights) | 141.8 µs/tick · worst 4.2 ms · generation 80 ms |
| Starter expanded (14 flights, 8 gates, 2 runways) | 205.1 µs/tick · worst 6.8 ms · generation 183 ms |
| Riverdale sandbox day 1 (24 flights) | 422.8 µs/tick (M12's 283 was measured at load 14) · generation 558 ms |
| M13 UI layer (alerts, objective line, Today story every 5 s), per UI refresh | 0.30 ms starter · 0.61 ms expanded · 1.17 ms Riverdale. At 4 refreshes a second this is 1.2–4.7 ms per second of play, outside the simulation tick |
| Saves (starter) | at day start 2.5 MB · mid-day 3.0 MB (parse + validate + restore 1.05 s) · between days 0.03 MB |
| Saves (expanded / Riverdale) | mid-day 6.8 MB (2.5 s) / 13.2 MB (5.1 s) |
| Web (headless Chromium, software WebGL) | loads in about 12 s; the menu at 56 FPS; the airport at 22–52 FPS depending on host load; the simulation keeps real time at 4× (2 simulated minutes in 30 s) |

- **The simulation's per-tick work is unchanged** apart from three counters:
  objectives and tips run at events and on the UI refresh, never per tick.
- **Starter saves are small enough for playtesting,** so the §30 split of the
  event history stays debt.
- **Autosaves:** the day-start autosave writes about 2.5 MB (a fraction of a
  second).

## Product questions

These need the human playtests; they are **not answered yet**. The automated
runs only show the preconditions exist.

1. **Can a new player operate the airport without developer guidance?**
   Unanswered. The tips cover the first-session actions in the order they
   arise, and Demo A completes day 1 by following them. That is not a
   person.
2. **Can they identify a real bottleneck and take a relevant action?**
   Unanswered. The bottleneck is surfaced three ways: the security tip at
   +0:22, the Today tab, and WHAT HURT. Opening the lane is worth about
   $2,400 on day 1.
3. **Do they understand why flights become late?** Unanswered. Every departed
   flight lists its causes, biggest first, and the late-departure tip points
   there.
4. **Does the report tell them what to change tomorrow?** Unanswered. It
   lists waits by resource, failed terms with required vs actual, and the
   biggest causes, with the plan beside it.
5. **Does expansion feel like growth?** Unanswered. The automated
   progression goes from 6 to 13 flights and from +$1k to +$22k a day over
   six days, with the pier and new gates visibly on the map.
6. **Do players voluntarily continue into another day?** Unanswered. It can
   only be observed.

## Known risks the playtests should target

- **The day's length.** Day 1 is 2 h 28 min of simulated time: about 45
  minutes at 2× for the first half hour and 4× after. That exceeds the
  15–30-minute target. The turnaround durations are the shared simulation
  and were not shortened. If testers find dead time, the schedule
  (fewer or tighter waves) is the lever, not an 8× speed.
- **Density.** The screen is dense (ten tabs). Whether new players find
  Security, Resources and Today by themselves is the core observation.
- **Pause and slow defaults.** The default is to slow to 1× on a critical
  alert; untested with people.
- **The 787's pace:** about two weeks of in-game days with steady play.
  Possibly too slow for a first milestone.

## Limitations

- **No human evidence yet** (by design of this split).
- **No sound:** there is no audio system, so §43 is deferred.
- **Mid-day saves** of the Riverdale sandbox stay large (event history; see
  D-063).
- **Web:** the no-threads build; saves live in the browser's storage (they
  are lost if site data is cleared); the playtest bundle downloads as a file.
  Measured only in headless Chromium with software rendering.
- **Map:** the airfield zooms and pans; the terminal view does not.
- **The strategy policies are crude scripts.** Their numbers describe the
  career's responsiveness, not optimal play.
