extends SceneTree
## Does efficient boarding pay off operationally? Runs the full Riverdale morning
## with each preset applied to every cabin flight and reports punctuality and
## boarding-attributed delay. Pass a JSON object of airport cabin calibration
## overrides after "--" to compare candidates:
##   godot --headless --path game --script tests/strategy_benchmark.gd -- '{"entry_interval_ticks": 90}'

func _initialize() -> void:
	var overrides = {}
	var args := OS.get_cmdline_user_args()
	if not args.is_empty(): overrides = JSON.parse_string(args[0])
	for strategy in ["window_middle_aisle", "random", "back_to_front", "front_to_back"]:
		var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
		if overrides is Dictionary and not overrides.is_empty():
			config.boarding["sim_config_overrides"] = overrides
		for f in config.flights: f.boarding_strategy = strategy
		var sim := AirportSimulation.new()
		sim.setup(config)
		sim.advance(int(config.flights[-1].scheduled_departure) - sim.clock.tick + 30000)
		var boarding_delay := 0
		var boarding_late := 0
		var last_seated := []
		for f: AirportFlight in sim.flight_order:
			var b := int(f.departure_delay_breakdown.get("boarding", 0))
			boarding_delay += b
			if b > 0: boarding_late += 1
			if f.boarding_mode == "cabin": last_seated.append((f.last_seated_tick - f.boarding_open_tick) / 600.0)
		last_seated.sort()
		var m := Baseline.measure(sim)
		print("%-20s late %2d / 24 · mean delay %.1f min · %d flights delayed by boarding (%.1f min total) · last seated after p50 %.1f / max %.1f min · missed %.1f%%" % [strategy, m.late_departures, m.mean_delay_min, boarding_late, boarding_delay / 600.0, last_seated[last_seated.size() / 2], last_seated[-1], m.missed_pct])
	quit()
