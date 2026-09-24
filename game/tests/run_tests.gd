extends SceneTree
## Headless test runner:  godot --headless --path game --script tests/run_tests.gd
## Exit code is the number of failed tests (0 = success).

const SUITES := [
	"res://tests/test_passenger_flow.gd",
	"res://tests/test_airport.gd",
	"res://tests/test_boarding_integration.gd",
	"res://tests/test_simulation.gd",
	"res://tests/test_deadlock.gd",
]


func _initialize() -> void:
	var total := 0
	var failed := 0
	var started := Time.get_ticks_msec()
	print("BOARDING test harness — Godot %s, sim %s" % [Engine.get_version_info()["string"], Simulation.SIM_VERSION])
	for path in SUITES:
		var script: GDScript = load(path)
		var suite: TestCase = script.new()
		print("\n%s" % path.get_file())
		for m in suite.list_tests():
			suite.current_test = m
			var before := suite.failures.size()
			var t0 := Time.get_ticks_msec()
			suite.call(m)
			var dt := Time.get_ticks_msec() - t0
			total += 1
			if suite.failures.size() > before:
				failed += 1
				print("  FAIL  %s (%d ms)" % [m, dt])
				for i in range(before, suite.failures.size()):
					print("        %s" % suite.failures[i])
			else:
				print("  ok    %s (%d ms)" % [m, dt])
	var elapsed := (Time.get_ticks_msec() - started) / 1000.0
	print("\n%d tests, %d failed, %.1fs" % [total, failed, elapsed])
	quit(failed)
