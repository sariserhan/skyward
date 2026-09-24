extends SceneTree

func _initialize() -> void:
	for count in [24, 100]:
		var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
		if count == 100:
			var templates: Array = config.flights.duplicate(true)
			config.flights = []
			for i in count:
				var flight: Dictionary = templates[i % templates.size()].duplicate(true)
				flight.id = "BENCH_%03d" % i
				flight.flight_number = "NS %03d" % i
				var shift: int = (i / templates.size()) * 36000
				flight.scheduled_arrival += shift
				flight.scheduled_departure += shift
				config.flights.append(flight)
		var sim := AirportSimulation.new()
		sim.setup(config)
		var ticks := 144000 if count == 24 else 216000
		var start := Time.get_ticks_usec()
		var worst := 0
		for _i in ticks:
			sim.step()
			worst = maxi(worst, sim.last_tick_usec)
		var elapsed := Time.get_ticks_usec() - start
		print("%d flights / %d ticks: %.3f s, %.2f us/tick, worst tick %d us, departed %d, events %d" % [count, ticks, elapsed / 1000000.0, float(elapsed) / ticks, worst, sim.metrics().departed, sim.events.history.size()])
		if count == 24 and sim.metrics().departed != 24:
			push_error("Default schedule did not finish within four hours")
			quit(1)
			return
		# Through JSON, as a real save file is.
		var restored := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot())))
		if restored == null:
			push_error("Benchmark ended with invalid domain invariants")
			quit(1)
			return
	quit(0)
