#!/usr/bin/env sh
# Headless test runner. Imports the project first so class_name lookups resolve.
set -e
# Fall back to the pinned local install if godot is not on PATH.
command -v godot >/dev/null 2>&1 || export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/game"
if [ "$1" = "--quick" ]; then export BOARDING_DEADLOCK_RUNS=50; fi
godot --headless --path . --import >/dev/null 2>&1 || true
exec godot --headless --path . --script tests/run_tests.gd
