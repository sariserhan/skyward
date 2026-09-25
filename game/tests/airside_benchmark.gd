extends SceneTree
## M12: airside cost. Routing (full route tables on Riverdale's networks and a
## synthetic 400-node grid), airside validation, movement cost per tick (full
## passenger days and an operations-only stress morning with many aircraft on
## two-way taxiways), and the mid-taxi save.

const SINGLE := "res://configs/airports/riverdale_single_taxiway.json"


static func light(config: Dictionary) -> Dictionary:
	var c := config.duplicate(true)
	c.erase("_errors")
	for key in ["passenger_flow", "baggage", "resources"]: c.erase(key)
	return c


static func north_runway(c: AirportCareer) -> void:
	c.starting_cash_cents = 100000000
	var r := c.build_runway("G_300_-300", "E", 3200)
	c.build_taxiway(r.id + "_B", "R1_EXIT", 1)
	c.build_taxiway("R1_HOLD", r.id + "_A", 1)


## A 20 × 20 grid of two-way taxiways, 150 m apart.
static func grid() -> Dictionary:
	var nodes := {}
	var edges: Array = []
	for y in 20:
		for x in 20:
			nodes["N%02d_%02d" % [x, y]] = {"x": x * 150, "y": y * 150}
			if x > 0: edges.append({"id": "H%02d_%02d" % [x, y], "from": "N%02d_%02d" % [x - 1, y], "to": "N%02d_%02d" % [x, y], "length_m": 150, "oneway": false})
			if y > 0: edges.append({"id": "V%02d_%02d" % [x, y], "from": "N%02d_%02d" % [x, y - 1], "to": "N%02d_%02d" % [x, y], "length_m": 150, "oneway": false})
	return {"taxi_speed_mps": 10, "headway_ticks": 150, "node_ticks": 50, "nodes": nodes, "edges": edges, "runways": []}


func _routing(label: String, airside: Dictionary, pairs: int) -> void:
	var net := AirsideNetwork.new()
	var t0 := Time.get_ticks_usec()
	net.setup(airside)
	var setup := Time.get_ticks_usec() - t0
	var ids: Array = net.nodes.keys()
	ids.sort()
	var rng := RandomNumberGenerator.new()
	rng.seed = 12
	t0 = Time.get_ticks_usec()
	var found := 0
	var count := 0
	if pairs <= 0:
		for a in ids:
			for b in ids:
				if not net.route(a, b, "wide").is_empty(): found += 1
				count += 1
	else:
		for _i in pairs:
			if not net.route(ids[rng.randi_range(0, ids.size() - 1)], ids[rng.randi_range(0, ids.size() - 1)], "wide").is_empty(): found += 1
			count += 1
	var routing := Time.get_ticks_usec() - t0
	net.route(ids[0], ids[-1], "wide")
	t0 = Time.get_ticks_usec()
	for _i in 100: net.route(ids[0], ids[-1], "wide")
	var cached := (Time.get_ticks_usec() - t0) / 100
	print("%-26s %4d nodes %4d edges · setup %.2f ms · %d routes (%d found) %.1f ms = %.0f us/route · cached lookup %d us" % [
		label, net.nodes.size(), net.edges.size(), setup / 1000.0, count, found, routing / 1000.0, float(routing) / count, cached])


func _day(label: String, config: Dictionary) -> AirportSimulation:
	var t0 := Time.get_ticks_usec()
	var sim := AirportSimulation.new()
	sim.setup(config)
	var generation := Time.get_ticks_usec() - t0
	var ticks := 0
	var worst := 0
	var peak := 0
	t0 = Time.get_ticks_usec()
	var done := false
	for _i in 300000:
		done = true
		var taxiing := 0
		for f: AirportFlight in sim.flight_order:
			if f.status != "departed": done = false
			if f.status in ["taxiing_in", "taxiing_out"]: taxiing += 1
		peak = maxi(peak, taxiing)
		if done: break
		sim.step()
		ticks += 1
		worst = maxi(worst, sim.last_tick_usec)
	var mean := float(Time.get_ticks_usec() - t0) / maxi(1, ticks)
	var m := sim.airside_metrics()
	print("%-26s %2d flights · generation %.0f ms · mean %.1f us/tick · worst %.1f ms · 4x frame %.1f ms · peak taxiing %d · taxi waits %.1f min · routes cached %d · complete %s" % [
		label, sim.flight_order.size(), generation / 1000.0, mean, worst / 1000.0, mean * 40 / 1000.0, peak, int(m.taxi_wait_ticks) / 600.0, int(m.routes), done])
	return sim


func _initialize() -> void:
	print("== routing")
	var plain := AirportCareer.new()
	plain.new_career()
	var two := AirportCareer.new()
	two.new_career()
	north_runway(two)
	_routing("Riverdale", plain.day_config().airside, 0)
	_routing("Riverdale + R2", two.day_config().airside, 0)
	_routing("one taxilane", AirportSimulation.load_config(SINGLE).airside, 0)
	_routing("20x20 grid", grid(), 2000)
	print("== validation")
	for pair in [["Riverdale", plain], ["Riverdale + R2", two]]:
		var config: Dictionary = pair[1].day_config(false)
		config = pair[1].layout.apply(config)
		var t0 := Time.get_ticks_usec()
		var errors := AirportLayout.validate_airside(config)
		print("%-26s validate_airside %.1f ms · errors %d" % [pair[0], (Time.get_ticks_usec() - t0) / 1000.0, errors.size()])
	print("== movement (operations only)")
	var timers := light(plain.day_config())
	timers.erase("airside")
	_day("Riverdale, M11 timers", timers)
	_day("Riverdale", light(plain.day_config()))
	_day("Riverdale + R2", light(two.day_config()))
	_day("one taxilane", light(AirportSimulation.load_config(SINGLE)))
	# Stress: the one-lane airport with the schedule tripled into one morning.
	var stress := light(AirportSimulation.load_config(SINGLE))
	var rng := RandomNumberGenerator.new()
	rng.seed = 54
	var flights: Array = []
	for copy in 3:
		for f in stress.flights:
			var g: Dictionary = f.duplicate(true)
			var turn := int(g.scheduled_departure) - int(g.scheduled_arrival)
			g.id = "%s_%d" % [f.id, copy]
			g.flight_number = "%s/%d" % [f.flight_number, copy]
			g.scheduled_arrival = int(stress.start_tick) + 1200 + rng.randi_range(0, 54000)
			g.scheduled_departure = int(g.scheduled_arrival) + turn
			flights.append(g)
	stress.flights = flights
	_day("stress: 72 on one lane", stress)
	print("== full days (passengers, bags, crews)")
	var full_timers: Dictionary = plain.day_config().duplicate(true)
	full_timers.erase("airside")
	_day("Riverdale, M11 timers", full_timers)
	_day("Riverdale", plain.day_config().duplicate(true))
	_day("one taxilane", AirportSimulation.load_config(SINGLE))
	# The mid-taxi save of a full day.
	var sim := AirportSimulation.new()
	sim.setup(AirportSimulation.load_config(SINGLE))
	for _i in 200000:
		sim.step()
		if sim.flight_order.filter(func(f): return f.status in ["taxiing_in", "taxiing_out"]).size() >= 4: break
	var t0 := Time.get_ticks_usec()
	var text := JSON.stringify(sim.snapshot())
	var serialize := Time.get_ticks_usec() - t0
	t0 = Time.get_ticks_usec()
	var loaded := AirportSimulation.from_snapshot(JSON.parse_string(text))
	var load := Time.get_ticks_usec() - t0
	print("mid-taxi save (%s, %d taxiing): %.2f MB · airside state %d bytes · serialize %d ms · parse+validate+restore %d ms · ok %s" % [
		AirportClock.display(sim.clock.tick).left(5), sim.flight_order.filter(func(f): return f.status in ["taxiing_in", "taxiing_out"]).size(), text.length() / 1048576.0,
		JSON.stringify(sim.snapshot().airside).length(), serialize / 1000, load / 1000, loaded != null])
	quit()
