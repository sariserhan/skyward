extends TestCase

func make_career() -> AirportCareer:
	var c := AirportCareer.new()
	c.new_career(AirportLaunch.DULLES, -1, {"mode": "sandbox"})
	return c

func test_geography_routes_and_save() -> void:
	var c := make_career()
	assert_true(c.start_errors().is_empty(), str(c.start_errors()))
	assert_true(c.start_day(), "Dulles starts")
	if c.sim == null: return
	var net := c.sim.airside
	assert_eq(net.runways().size(), 4)
	assert_true(net.config.surfaces.size() >= 30, "mapped building and apron polygons")
	assert_true(net.config.map_gates.size() >= 100, "full mapped gates")
	var lengths := {"01L": 2865.12, "01C": 3505.2, "01R": 3505.2, "12": 3200.7048}
	for r in net.runways():
		assert_true(absf(float(r.length_m) - lengths[r.id]) < 0.02, "FAA runway length " + r.id)
		for gate in net.config.stands:
			assert_true(not net.route(r.b, net.config.stands[gate], "wide").is_empty(), "arrival " + r.id + " to " + gate)
			assert_true(not net.route(net.config.stands[gate], r.a, "wide").is_empty(), "departure " + gate + " to " + r.id)
	for _i in 18000: c.sim.step()
	var loaded := AirportCareer.from_snapshot(JSON.parse_string(JSON.stringify(c.snapshot())))
	assert_true(loaded != null, "geographic day reloads")
	if loaded == null: return
	for _i in 100:
		c.sim.step()
		loaded.sim.step()
	assert_eq(JSON.stringify(loaded.snapshot()), JSON.stringify(c.snapshot()), "same continuation")

func test_sample_day_finishes_and_next_day_starts() -> void:
	var c := make_career()
	assert_true(c.start_day())
	if c.sim == null: return
	var limit := c.sim.clock.tick + 360000
	while not c.day_complete() and c.sim.clock.tick < limit: c.sim.step()
	var pending: Array = []
	for f in c.sim.flight_order:
		if f.status != "departed": pending.append([f.id, f.status, f.taxi_blocker])
	assert_true(c.day_complete(), "all sample flights depart within ten hours: " + str(pending))
	if not c.day_complete(): return
	c.settle_day()
	assert_true(c.start_errors().is_empty(), str(c.start_errors()))
	assert_true(c.start_day(), "day two can start")

func test_curved_taxi_edges_preserve_geometry_in_both_directions() -> void:
	var net := AirsideNetwork.new()
	net.setup({"nodes": {"A": {"x": 0, "y": 0}, "B": {"x": 100, "y": 100}},
		"edges": [{"id": "curve", "from": "A", "to": "B", "length_m": 200,
			"points": [[0, 0], [100, 0], [100, 100]]}], "runways": []})
	assert_eq(net.position_on("curve:1", 0, 100, 50), Vector2(100, 0))
	assert_eq(net.position_on("curve:-1", 0, 100, 25), Vector2(100, 50))
	var e: Dictionary = net.edges.curve.duplicate(true)
	AirportLayout.new()._direct(e, -1)
	assert_eq(e.points, [[100, 100], [100, 0], [0, 0]])
	assert_eq(e.from, "B")
