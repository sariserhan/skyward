# Playtest Guide

This is the guide for the prototype playtest (spec §33). Two parts: what to
send testers, and how to read what comes back.

## For testers

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

## For the person running the playtest

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

Builds land in `dist/`. Zip each platform folder before sending. If the
simulation constants change between rounds, bump `SIM_VERSION` in
`simulation.gd` so old personal bests stop counting.
