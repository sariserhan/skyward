extends SceneTree
## M7 stress: the Riverdale morning with default baggage, baggage-heavy (every
## passenger checks a bag, a third check two, sortation at half capacity),
## connection-heavy (40% of arrivals connect), and a 100-flight morning.
## Reports tick cost (mean, worst, cost of one 4x frame), bag totals, peak
## active bags, the busiest queue, and the baggage step's own cost.

const ACTIVE := ["in_transit", "queued", "sorting", "ready_for_flight", "loading", "unloading", "at_reclaim"]


func _initialize() -> void:
	var base := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	var heavy := base.duplicate(true)
	heavy.baggage.merge({"checked_permille": 1000, "airline_checked_permille": {}, "second_bag_permille": 330}, true)
	for id in heavy.baggage.stages: heavy.baggage.stages[id].servers = maxi(1, int(heavy.baggage.stages[id].servers) / 2)
	var connecting := base.duplicate(true)
	connecting.passenger_flow.connections = {"default_permille": 400, "max_connection_ticks": 90000}
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
	var scenarios := {"default": base, "baggage-heavy": heavy, "connection-heavy": connecting, "100 flights": stress}
	for label in scenarios:
		var config: Dictionary = scenarios[label]
		var sim := AirportSimulation.new()
		sim.setup(config)
		var ticks := int(config.flights[-1].scheduled_departure) - sim.clock.tick + 30000
		var started := Time.get_ticks_usec()
		var worst := 0
		var peak_active := 0
		var peak_queue := 0
		var bag_usec := 0
		for i in ticks:
			sim.step()
			worst = maxi(worst, sim.last_tick_usec)
			if i % 50 == 0:
				var active := 0
				for bag: AirportBag in sim.airport.bags.values():
					if bag.state in ACTIVE: active += 1
				peak_active = maxi(peak_active, active)
				for id in sim.baggage.stages: peak_queue = maxi(peak_queue, sim.baggage.stages[id].queue.size())
		var elapsed := Time.get_ticks_usec() - started
		bag_usec = sim.baggage_usec
		var m := sim.baggage_metrics()
		var mean := float(elapsed) / ticks
		print("%s: %d flights · mean %.1f us/tick · worst %.1f ms · 4x frame %.1f ms · bags %d (%.2f/pax) · peak active %d · peak queue %d · transfer %d made / %d missed · held %d · reclaim wait mean %.1f max %.1f min · baggage delay %.1f min · late %d · baggage step %.1f us/tick" % [
			label, sim.flight_order.size(), mean, worst / 1000.0, mean * 40 / 1000.0, m.bags, m.bags_per_passenger, peak_active, peak_queue,
			m.transfer_made, m.transfer_missed, m.held, m.mean_reclaim_wait_ticks / 600.0, m.max_reclaim_wait_ticks / 600.0, m.baggage_delay_ticks / 600.0,
			sim.metrics().late, float(bag_usec) / ticks])
		if AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot()))) == null:
			push_error("baggage benchmark failed save validation: " + label)
			quit(1)
			return
	quit(0)
