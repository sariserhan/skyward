#!/usr/bin/env python3
"""Summarise M13 airport playtest bundles (spec §35).

Each tester sends one zip exported from the game (Settings or in-game Menu →
EXPORT PLAYTEST BUNDLE, or F9). Put them in one folder and run:

    python3 tools/airport_playtest_report.py path/to/bundles/ [--observer notes.csv]

It prints, per tester, the checklist flags the log can show, the timings that
matter for pacing (first landing, first decision, end of day 1, start of day
2, session length, time spent at each speed), each day's result, the tips
seen, and the decisions taken. Flags that only an observer can judge
(understood hold/close, understood the report, voluntarily continued) come
from an optional observer CSV with a `tester` column (the zip file name).
"""
import csv
import json
import sys
import zipfile
from pathlib import Path

FLAGS = [
    ("reached_first_flight", "first flight"), ("found_time_controls", "time controls"), ("opened_flight_details", "flight details"),
    ("changed_security_staffing", "security staffing"), ("noticed_resource_contention", "resource contention"),
    ("used_hold_or_close", "hold/close used"), ("completed_day_1", "completed day 1"), ("viewed_report", "saw report"),
    ("made_next_day_plan", "planned next day"), ("built_something", "built"), ("started_day_2", "started day 2"), ("opened_help", "opened help"),
]
OBSERVER = ["understood_delay_causes", "understood_hold_close", "understood_report", "knew_what_to_build", "voluntarily_continued", "stuck_where", "notes"]


def load(path):
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        events = []
        if "session.jsonl" in names:
            for line in z.read("session.jsonl").decode().splitlines():
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        summary = json.loads(z.read("summary.json")) if "summary.json" in names else {}
        shots = [n for n in names if n.startswith("shots/")]
    return events, summary, shots


def with_play_time(events):
    """Add play_min: minutes of play across sessions (a tester may quit and continue)."""
    offset, current, last_max = 0.0, None, 0.0
    for e in events:
        if e.get("session") != current:
            offset += last_max
            current, last_max = e.get("session"), 0.0
        t = float(e.get("session_sec", 0))
        last_max = max(last_max, t)
        e["play_min"] = (offset + t) / 60.0
    return events


def first(events, name, pred=lambda e: True):
    for e in events:
        if e.get("event") == name and pred(e):
            return e
    return None


def minutes(e):
    return "—" if e is None else "%.1f" % float(e.get("play_min", 0))


def speed_share(events):
    """Minutes of the session spent at each speed (paused counts as 0×)."""
    spans = {}
    speed, paused, last = 1, True, None
    for e in events:
        t = float(e.get("play_min", 0)) * 60.0
        if last is not None:
            key = "paused" if paused else "%d×" % speed
            spans[key] = spans.get(key, 0.0) + max(0.0, t - last) / 60.0
        last = t
        if e.get("event") == "speed":
            speed = int(e.get("speed", speed))
        if e.get("event") == "pause":
            paused = bool(e.get("paused", paused))
        if e.get("event") == "day_start":
            paused = False
    return ", ".join("%s %.1f" % (k, v) for k, v in sorted(spans.items()))


def main(args):
    if not args:
        print(__doc__)
        return 1
    folder = Path(args[0])
    observer = {}
    if "--observer" in args:
        with open(args[args.index("--observer") + 1]) as f:
            for row in csv.DictReader(f):
                observer[row.get("tester", "")] = row
    bundles = sorted(folder.glob("*.zip"))
    if not bundles:
        print("no bundles in", folder)
        return 1
    totals = {key: 0 for key, _ in FLAGS}
    for path in bundles:
        events, summary, shots = load(path)
        events = with_play_time(events)
        flags = summary.get("checklist", {})
        career = summary.get("career", {})
        print("\n== %s  (%s, seed %s, %s)" % (path.name, career.get("name", "?"), career.get("seed", "?"), career.get("difficulty", "?")))
        for key, label in FLAGS:
            ok = bool(flags.get(key))
            totals[key] += ok
            print("  %-20s %s" % (label, "yes" if ok else "no"))
        decision = next((e for e in events if e.get("event") in ("security_change", "priority", "hold", "close_gate", "plan_change", "build", "request_accept", "request_decline")), None)
        print("  sessions: %d" % len({e.get("session") for e in events}))
        print("  timings (play min): first landing %s · first decision %s (%s) · day 1 ended %s · day 2 started %s · session %.1f" % (
            minutes(first(events, "first_landing")), minutes(decision), decision.get("event") if decision else "—",
            minutes(first(events, "day_end", lambda e: int(e.get("day", 0)) == 1)),
            minutes(first(events, "day_start", lambda e: int(e.get("day", 0)) >= 2)), float(events[-1].get("play_min", 0)) if events else 0.0))
        print("  time at each speed (min): " + speed_share(events))
        for r in career.get("reports", []):
            print("  day %d: %d flights · net %.2f · mean delay %.1f min · missed connections %d" % (r["day"], r["flights"], r["net_cents"] / 100.0, r["mean_delay_min"], r["missed_connections"]))
        tips = [e.get("tip") for e in events if e.get("event") == "tip_shown"]
        print("  tips seen: " + (", ".join(tips) or "none"))
        decisions = [e.get("event") for e in events if e.get("event") in ("security_change", "priority", "hold", "close_gate", "gate_assign", "plan_change", "build", "demolish", "request_accept", "request_decline", "request_withdrawn")]
        counts = {}
        for d in decisions:
            counts[d] = counts.get(d, 0) + 1
        print("  decisions: " + (", ".join("%s ×%d" % kv for kv in sorted(counts.items())) or "none"))
        print("  critical alerts: %d · screenshots: %d" % (len([e for e in events if e.get("event") == "critical_alert"]), len(shots)))
        obs = observer.get(path.name)
        if obs:
            for key in OBSERVER:
                if obs.get(key):
                    print("  observer · %s: %s" % (key, obs[key]))
    print("\n== all testers (%d)" % len(bundles))
    for key, label in FLAGS:
        print("  %-20s %d/%d" % (label, totals[key], len(bundles)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
