extends SceneTree
## M11: construction cost. Original, moderately and maximally expanded
## Riverdale (validation, navigation rebuild, day generation, tick cost), and a
## three-day career with builds (generation per day, save size and time).

func _initialize() -> void:
	var layouts := {
		"original": [],
		"moderate": [["east_pier", "east_pier"], ["gate_narrow", "pad_A9"], ["security_lane", "security_east"], ["transfer_sorter", "baggage_transfer_sortation"], ["fuel_bay", "service_yard"]],
		"maximum": [["east_pier", "east_pier"], ["central_connector", "central_connector"], ["gate_narrow", "pad_A9"], ["gate_wide", "pad_A10"],
			["security_lane", "security_east"], ["security_lane", "security_east"], ["security_lane", "security_west"], ["security_lane", "security_west"],
			["outbound_sorter", "baggage_outbound_sortation"], ["outbound_sorter", "baggage_outbound_sortation"], ["outbound_sorter", "baggage_outbound_sortation"], ["outbound_sorter", "baggage_outbound_sortation"],
			["transfer_sorter", "baggage_transfer_sortation"], ["transfer_sorter", "baggage_transfer_sortation"], ["transfer_sorter", "baggage_transfer_sortation"], ["transfer_sorter", "baggage_transfer_sortation"],
			["reclaim_belt", "baggage_reclaim"], ["reclaim_belt", "baggage_reclaim"], ["reclaim_belt", "baggage_reclaim"],
			["fuel_bay", "service_yard"], ["fuel_bay", "service_yard"], ["cleaning_base", "service_yard"], ["catering_base", "service_yard"], ["baggage_equipment", "service_yard"], ["tug_bay", "service_yard"]],
	}
	for label in layouts:
		var c := AirportCareer.new()
		c.new_career()
		c.starting_cash_cents = 100000000
		for step in layouts[label]:
			var r := c.build(step[0], step[1])
			if r.has("error"): print("  build failed: ", step, " ", r.error)
		var t0 := Time.get_ticks_usec()
		var config := c.day_config()
		var assembled := Time.get_ticks_usec() - t0
		t0 = Time.get_ticks_usec()
		var graph := TerminalGraph.new()
		graph.setup(config.passenger_flow.graph)
		for a in graph.nodes:
			for b in graph.nodes: graph.route(a, b)
		var nav := Time.get_ticks_usec() - t0
		t0 = Time.get_ticks_usec()
		var errors := c.layout.validate(c.layout.apply(c.day_config(false)))
		var validation := Time.get_ticks_usec() - t0
		t0 = Time.get_ticks_usec()
		c.start_day()
		var generation := Time.get_ticks_usec() - t0
		var ticks := 0
		var worst := 0
		t0 = Time.get_ticks_usec()
		while not c.day_complete():
			c.sim.step()
			ticks += 1
			worst = maxi(worst, c.sim.last_tick_usec)
		var mean := float(Time.get_ticks_usec() - t0) / ticks
		print("%s: %d objects · config+apply+validate %.1f ms · validation %.1f ms · full route table rebuild (%d nodes) %.1f ms · day generation %.0f ms · mean %.1f us/tick · worst %.1f ms · 4x frame %.1f ms · errors %d" % [
			label, c.layout.objects.size(), assembled / 1000.0, validation / 1000.0, graph.nodes.size(), nav / 1000.0, generation / 1000.0, mean, worst / 1000.0, mean * 40 / 1000.0, errors.size()])
	# A three-day expansion career.
	var c := AirportCareer.new()
	c.new_career("res://configs/airports/riverdale_expansion.json")
	for day in 3:
		if day == 1:
			for step in [["east_pier", "east_pier"], ["gate_narrow", "pad_A9"], ["gate_wide", "pad_A10"]]: c.build(step[0], step[1])
		if day == 2:
			for step in [["security_lane", "security_east"], ["security_lane", "security_east"]]: c.build(step[0], step[1])
		var t0 := Time.get_ticks_usec()
		if not c.start_day():
			print("day %d cannot start: %s" % [c.day, c.start_errors()])
			break
		var generation := Time.get_ticks_usec() - t0
		var ticks := 0
		t0 = Time.get_ticks_usec()
		var mid := ""
		while not c.day_complete():
			c.sim.step()
			ticks += 1
			for airline in c.sim.airlines.airline_ids:
				if c.sim.airlines.state[airline].request == "offered": c.sim.answer_airline_request(airline, true)
			if ticks == 60000 and day == 1: mid = _save_stats(c, "mid-day 2 (expanded)")
		var mean := float(Time.get_ticks_usec() - t0) / ticks
		c.settle_day()
		var r: Dictionary = c.reports[-1]
		print("career day %d: %d flights · %d gates · generation %.0f ms · mean %.1f us/tick · operating %s · capital %s · cash %s" % [r.day, r.flights, c.finished.airport.gates.size(),
			generation / 1000.0, mean, AirportEconomy.money(int(r.net_cents), true), AirportEconomy.money(int(r.capital_cents)), AirportEconomy.money(int(r.closing_cents))])
		if not mid.is_empty(): print("  ", mid)
	print("  ", _save_stats(c, "between days"))
	quit(0)


func _save_stats(c: AirportCareer, label: String) -> String:
	var t0 := Time.get_ticks_usec()
	var text := JSON.stringify(c.snapshot())
	var saved := Time.get_ticks_usec() - t0
	t0 = Time.get_ticks_usec()
	var restored := AirportCareer.from_snapshot(JSON.parse_string(text))
	var loaded := Time.get_ticks_usec() - t0
	return "%s save: %.2f MB (layout %d bytes) · serialize %.0f ms · load %.0f ms · ok %s" % [label, text.length() / 1048576.0, JSON.stringify(c.layout.snapshot()).length(), saved / 1000.0, loaded / 1000.0, restored != null]
