#!/usr/bin/env sh
# Rendered UI tests and the M3 demonstration under a virtual X display.
#
#   tools/ui_tests.sh                       # all rendered checks
#   tools/ui_tests.sh tests/m3_demo.gd      # one script (paths relative to game/)
#
# Needs godot 4.7.2 (PATH or ~/.local/bin) and xvfb-run (package: xvfb).
# Godot's X11 driver also loads libXcursor and libXinerama. If the system lacks
# them, the Debian/Ubuntu packages are fetched once with `apt-get download` (no
# root) and unpacked into .cache/ui-test-libs, which is git-ignored. Installing
# `libxcursor1 libxinerama1` system-wide makes that step unnecessary.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
command -v godot >/dev/null 2>&1 || export PATH="$HOME/.local/bin:$PATH"
command -v xvfb-run >/dev/null 2>&1 || { echo "xvfb-run not found: install the xvfb package" >&2; exit 2; }

LIBS="$ROOT/.cache/ui-test-libs"
missing=""
for pair in libXcursor.so.1:libxcursor1 libXinerama.so.1:libxinerama1; do
	so=${pair%%:*}
	pkg=${pair##*:}
	if ! ldconfig -p | grep -q "$so" && ! ls "$LIBS"/usr/lib/*/"$so" >/dev/null 2>&1; then
		missing="$missing $pkg"
	fi
done
if [ -n "$missing" ]; then
	echo "Fetching X11 client libraries for rendered tests:$missing"
	mkdir -p "$LIBS/debs"
	(cd "$LIBS/debs" && apt-get download $missing)
	for deb in "$LIBS"/debs/*.deb; do dpkg-deb -x "$deb" "$LIBS"; done
fi
for dir in "$LIBS"/usr/lib/*; do
	[ -d "$dir" ] && LD_LIBRARY_PATH="$dir${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
done
export LD_LIBRARY_PATH

cd "$ROOT/game"
godot --headless --path . --import >/dev/null 2>&1 || true
scripts=${*:-"tests/airport_ui_smoke.gd tests/terminal_ui_smoke.gd tests/m3_demo.gd tests/m4_demo.gd tests/m5_demo.gd tests/m6_demo.gd tests/m7_demo.gd tests/m8_demo.gd tests/m9_demo.gd tests/m10_demo.gd tests/m11_demo.gd"}
failed=0
for script in $scripts; do
	echo "== $script"
	if ! xvfb-run -a -s "-screen 0 1280x800x24" godot --path . --audio-driver Dummy --script "$script"; then
		failed=$((failed + 1))
	fi
done
echo "Rendered checks: $failed failed"
exit "$failed"
