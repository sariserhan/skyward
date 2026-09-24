extends SceneTree
## M6 stress: the Riverdale morning with the default connection rates and with
## 40% of every arrival connecting. Reports generation cost, tick cost and
## connection outcomes.

func _initialize() -> void:
	for heavy in [false, true]:
		var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
		if heavy: config.passenger_flow.connections = {"default_permille": 400, "max_connection_ticks": 90000}
		var sim := AirportSimulation.new()
		var started := Time.get_ticks_usec()
		sim.setup(config)
		var setup_usec := Time.get_ticks_usec() - started
		var ticks := int(config.flights[-1].scheduled_departure) - sim.clock.tick + 30000
		started = Time.get_ticks_usec()
		var worst := 0
		for _i in ticks:
			sim.step()
			worst = maxi(worst, sim.last_tick_usec)
		var elapsed := Time.get_ticks_usec() - started
		var m := sim.connection_metrics()
		print("%s: setup %.1f ms · %d ticks %.2f us/tick mean, worst %d us · %d passengers · connections %d (made %d, missed %d, pending %d, success %.1f%%) · mean transfer %.1f min · min margin %.1f min · late departures %d" % [
			"40% connecting" if heavy else "default rates", setup_usec / 1000.0, ticks, float(elapsed) / ticks, worst, sim.airport.passengers.size(),
			m.connecting, m.made, m.missed, m.pending, m.success_rate * 100.0, m.mean_transfer_ticks / 600.0, m.min_margin_ticks / 600.0, sim.metrics().late])
		if AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot()))) == null:
			push_error("connection benchmark failed save validation")
			quit(1)
			return
	quit(0)
