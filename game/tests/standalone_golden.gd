class_name StandaloneGolden
extends RefCounted
## Regression baseline for the standalone boarding engine (M3 step 1). Captured
## before the airport integration touched Simulation; outcomes must not drift.
## Regenerate only for an intentional SIM_VERSION change:
##   godot --headless --path game --script tests/capture_golden.gd

const PATH := "res://tests/fixtures/standalone_golden.json"
const SEEDS := [-1, 1, 2]


static func compute() -> Dictionary:
	var out := {"sim_version": Simulation.SIM_VERSION, "runs": {}}
	for scenario in Scenario.load_all():
		var aircraft := scenario.load_aircraft()
		for preset in BoardingStrategy.PRESET_IDS:
			for s in SEEDS:
				var sim := scenario.build_simulation(BoardingStrategy.preset(preset, aircraft), s)
				sim.run_to_completion()
				var r := sim.result()
				# Per-passenger seating order pins the whole trajectory, not just totals.
				var seated: Array = []
				for p in sim.passengers:
					seated.append([p.id, p.seated_tick, p.caused_blocked_time])
				out.runs["%s/%s/%d" % [scenario.scenario_id, preset, s]] = {
					"total_ticks": r.total_ticks, "blocked_ticks": r.blocked_ticks,
					"walk_ticks": r.walk_ticks, "stow_ticks": r.stow_ticks,
					"seat_wait_ticks": r.seat_wait_ticks, "top_blockers": r.top_blockers,
					"seated_hash": hash(JSON.stringify(seated)),
				}
	return out
