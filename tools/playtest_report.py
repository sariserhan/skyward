#!/usr/bin/env python3
"""Summarise BOARDING playtest logs into the spec §33 metrics.

Usage:
    tools/playtest_report.py path/to/logs/*.jsonl

Each tester sends back their playtest_log.jsonl. Point this at any number of
them. Testers are identified by the random `tester` id inside the file, so
file names do not matter.
"""
import json
import sys
from collections import defaultdict


def load(paths):
    events = []
    for path in paths:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    events.sort(key=lambda e: (e.get("tester", ""), e.get("t", 0)))
    return events


def fmt_ticks(ticks, rate=30):
    s = int(ticks) // rate
    return f"{s // 60:02d}:{s % 60:02d}"


def pct(n, d):
    return "n/a" if d == 0 else f"{100.0 * n / d:5.1f}%"


def main(paths):
    events = load(paths)
    if not events:
        print("no events found")
        return 1
    by_tester = defaultdict(list)
    for e in events:
        by_tester[e.get("tester", "?")].append(e)

    testers = len(by_tester)
    completed_first = 0
    retried = 0
    edited = 0
    custom = 0
    beat_attempt = 0
    attempts_total = 0
    session_seconds = []
    strategy_use = defaultdict(int)
    best_by_scenario = {}

    for tester, evs in by_tester.items():
        completed = [e for e in evs if e["event"] == "simulation_completed"]
        started = [e for e in evs if e["event"] == "simulation_started"]
        if completed:
            completed_first += 1
        attempts_total += len(completed)
        # Voluntary retry: a second completed run on the same scenario+seed.
        runs = defaultdict(int)
        for e in completed:
            runs[(e.get("scenario"), e.get("seed"))] += 1
        if any(n >= 2 for n in runs.values()):
            retried += 1
        if any(e["event"] == "editor_opened" for e in evs):
            edited += 1
        if any(e["event"] == "custom_strategy_created" for e in evs):
            custom += 1
        # Attempted to beat score: started a run after already having a best.
        if any(e["event"] == "simulation_started" and e.get("attempt", 1) > 1 for e in evs):
            beat_attempt += 1
        for e in completed:
            strategy_use[e.get("preset", "?")] += 1
            key = e.get("scenario")
            t = e.get("total_ticks")
            if key is not None and t is not None:
                best_by_scenario[key] = min(best_by_scenario.get(key, t), t)
        # Session durations from session_ms of the last event per session.
        sessions = defaultdict(int)
        for e in evs:
            sessions[e.get("session")] = max(sessions[e.get("session")], e.get("session_ms", 0))
        session_seconds.extend(v / 1000.0 for v in sessions.values())

    print(f"Testers                      {testers}")
    print(f"Completed first simulation   {pct(completed_first, testers)}  ({completed_first})")
    print(f"Voluntarily retried          {pct(retried, testers)}  ({retried})")
    print(f"Edited a strategy            {pct(edited, testers)}  ({edited})")
    print(f"Created a custom strategy    {pct(custom, testers)}  ({custom})")
    print(f"Tried to beat their score    {pct(beat_attempt, testers)}  ({beat_attempt})")
    print(f"Avg completed attempts       {attempts_total / testers:.1f}")
    if session_seconds:
        print(f"Avg session length           {sum(session_seconds) / len(session_seconds) / 60.0:.1f} min")
    print()
    print("Strategy usage (completed runs)")
    for k, v in sorted(strategy_use.items(), key=lambda kv: -kv[1]):
        print(f"  {k:24s} {v}")
    print()
    print("Best time seen per scenario")
    for k, v in sorted(best_by_scenario.items()):
        print(f"  {k:24s} {fmt_ticks(v)}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1:]))
