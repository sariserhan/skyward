extends SceneTree
## M8 stress: normal morning, 100 flights, the resource-shortage morning,
## baggage-heavy and connection-heavy. Reports tick cost (mean, worst, one 4x
## frame), the resource dispatcher's own cost, allocations, peak queues, and
## the delay blamed on waiting for resources.

func _initialize() -> void:
	var base := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	var stress := base.duplicate(true)
	var templates: Array = stress.flights.duplicate(true)
	stress.flights = []
	for i in 100:
		var flight: Dictionary = templates[i % templates.size()].duplicate(true)
		flight.id = "BENCH_%03d" % i
		flight.flight_number = "NS %03d" % i
		var shift: int = (i / templates.size()) * 36000
		flight.scheduled_arrival += shift
		flight.scheduled_departure += shift
		stress.flights.append(flight)
	var heavy := base.duplicate(true)
	heavy.baggage.merge({"checked_permille": 1000, "airline_checked_permille": {}, "second_bag_permille": 330}, true)
	for id in heavy.baggage.stages: heavy.baggage.stages[id].servers = maxi(1, int(heavy.baggage.stages[id].servers) / 2)
	var connecting := base.duplicate(true)
	connecting.passenger_flow.connections = {"default_permille": 400, "max_connection_ticks": 90000}
	var scenarios := {"default": base, "100 flights": stress, "shortage": AirportSimulation.load_config("res://configs/airports/riverdale_shortage.json"),
		"baggage-heavy": heavy, "connection-heavy": connecting}
	for label in scenarios:
		var config: Dictionary = scenarios[label]
		var sim := AirportSimulation.new()
		sim.setup(config)
		var ticks := int(config.flights[-1].scheduled_departure) - sim.clock.tick + 30000
		var started := Time.get_ticks_usec()
		var worst := 0
		for _i in ticks:
			sim.step()
			worst = maxi(worst, sim.last_tick_usec)
		var elapsed := Time.get_ticks_usec() - started
		var m := sim.resource_metrics()
		var allocations := 0
		var queues: Array = []
		for type in m.pools:
			allocations += int(m.pools[type].allocations)
			queues.append("%s %d" % [str(m.pools[type].label).get_slice(" ", 0).to_lower(), m.pools[type].peak_queue])
		var mean := float(elapsed) / ticks
		print("%s: %d flights · mean %.1f us/tick · worst %.1f ms · 4x frame %.1f ms · resource dispatch %.2f us/tick · %d allocations · peak queues %s · %d flights delayed by shortages (%.1f min) · late %d" % [
			label, sim.flight_order.size(), mean, worst / 1000.0, mean * 40 / 1000.0, float(sim.resource_usec) / ticks, allocations,
			", ".join(queues), m.flights_delayed, m.delay_ticks / 600.0, sim.metrics().late])
		if AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot()))) == null:
			push_error("resource benchmark failed save validation: " + label)
			quit(1)
			return
	quit(0)
