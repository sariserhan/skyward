extends TestCase
## M12: airside construction, taxiways, runways and aircraft routing. One
## airside graph moves every aircraft; construction changes it between days.
## See docs/m12-plan.md.

const SINGLE := "res://configs/airports/riverdale_single_taxiway.json"
const SHORT := "res://configs/airports/riverdale_short_runway.json"


func career(path := "") -> AirportCareer:
	var c := AirportCareer.new()
	c.new_career(path)
	return c


## Operations only (no passengers, bags or crews): fast, and every aircraft
## still lands, taxis, turns and departs on the real airside.
static func light(config: Dictionary) -> Dictionary:
	var c := config.duplicate(true)
	c.erase("_errors")
	for key in ["passenger_flow", "baggage", "resources"]: c.erase(key)
	return c


static func run(config: Dictionary, limit := 200000) -> AirportSimulation:
	var sim := AirportSimulation.new()
	sim.setup(config)
	for _i in limit:
		if departed(sim): break
		sim.step()
	return sim


static func departed(sim: AirportSimulation) -> bool:
	for f: AirportFlight in sim.flight_order:
		if f.status != "departed": return false
	return true


## A second runway north of R1 (3,200 m by default), joined by one-way
## taxiways around R1's ends: arrivals east to the exit, departures from the hold.
static func build_north_runway(c: AirportCareer, length := 3200) -> Dictionary:
	var r := c.build_runway("G_300_-300", "E", length)
	if r.has("error"): return r
	var inbound := c.build_taxiway(r.id + "_B", "R1_EXIT", 1)
	if inbound.has("error"): return inbound
	var outbound := c.build_taxiway("R1_HOLD", r.id + "_A", 1)
	if outbound.has("error"): return outbound
	return {"runway": r, "taxiways": [inbound, outbound]}


func _breakdown_additive(sim: AirportSimulation) -> void:
	for f: AirportFlight in sim.flight_order:
		var late := maxi(0, f.actual_departure - f.scheduled_departure)
		var total := 0
		for cause in f.departure_delay_breakdown: total += int(f.departure_delay_breakdown[cause])
		assert_eq(total, late, "%s: the breakdown adds up to the delay" % f.flight_number)


# --- the imported airside --------------------------------------------------------------

func test_unchanged_riverdale_airside_is_the_scenario() -> void:
	var c := career()
	var config := c.day_config()
	assert_eq(config.get("_errors", []), [])
	assert_eq(JSON.stringify(config.airside), JSON.stringify(c.base.airside), "applying the imported layout reproduces the scenario's airside")
	assert_eq(c.layout.count("legacy_taxiway"), c.base.airside.edges.size())
	assert_eq(c.layout.count("legacy_runway"), 1)
	# Every legacy gate route is the pre-M12 taxi timer, in and out.
	var net := AirsideNetwork.new()
	net.setup(config.airside)
	for gate in config.airside.stands:
		assert_eq(net.free_ticks(net.route("R1_B", config.airside.stands[gate], "wide")), int(config.taxi_in_ticks), gate + " taxi-in")
		assert_eq(net.free_ticks(net.route(config.airside.stands[gate], "R1_A", "wide")), int(config.taxi_out_ticks), gate + " taxi-out")


# --- routing ----------------------------------------------------------------------------

static func _diamond(extra := {}) -> Dictionary:
	# S -> (A | B) -> T with equal lengths; A is also narrow-only in one variant.
	var d := {"taxi_speed_mps": 10, "headway_ticks": 20, "node_ticks": 5,
		"nodes": {"S": {"x": 0, "y": 0}, "A": {"x": 100, "y": -100}, "B": {"x": 100, "y": 100}, "T": {"x": 200, "y": 0}},
		"edges": [
			{"id": "SA", "from": "S", "to": "A", "length_m": 100, "oneway": false, "classes": ["narrow", "wide"]},
			{"id": "AT", "from": "A", "to": "T", "length_m": 100, "oneway": false, "classes": ["narrow", "wide"]},
			{"id": "SB", "from": "S", "to": "B", "length_m": 100, "oneway": false, "classes": ["narrow", "wide"]},
			{"id": "BT", "from": "B", "to": "T", "length_m": 100, "oneway": false, "classes": ["narrow", "wide"]}],
		"runways": []}
	d.merge(extra, true)
	return d


func test_routing_is_deterministic_shortest_with_stable_ties() -> void:
	var net := AirsideNetwork.new()
	net.setup(_diamond())
	assert_eq(net.route("S", "T", "narrow"), ["SA:1", "AT:1"], "equal routes: the lexically first node wins")
	assert_eq(net.route("T", "S", "narrow"), ["AT:-1", "SA:-1"], "two-way edges run backwards")
	for _i in 5: assert_eq(net.route("S", "T", "narrow"), ["SA:1", "AT:1"], "the same answer every time")
	assert_eq(net.free_ticks(["SA:1", "AT:1"]), 200, "200 m at 10 m/s = 20 s")
	# A shorter B side wins on time.
	var d := _diamond()
	d.edges[2].length_m = 50
	net.setup(d)
	assert_eq(net.route("S", "T", "narrow"), ["SB:1", "BT:1"])


func test_one_way_and_aircraft_classes_restrict_routes() -> void:
	var d := _diamond()
	d.edges[0].oneway = true
	d.edges[1].oneway = true
	var net := AirsideNetwork.new()
	net.setup(d)
	assert_eq(net.route("S", "T", "narrow"), ["SA:1", "AT:1"])
	assert_eq(net.route("T", "S", "narrow"), ["BT:-1", "SB:-1"], "one-way A side cannot be used backwards")
	d = _diamond()
	d.edges[0].classes = ["narrow"]
	net.setup(d)
	assert_eq(net.route("S", "T", "narrow"), ["SA:1", "AT:1"])
	assert_eq(net.route("S", "T", "wide"), ["SB:1", "BT:1"], "a widebody avoids a narrow-only taxiway")
	d.edges[2].classes = ["narrow"]
	net.setup(d)
	assert_eq(net.route("S", "T", "wide"), [], "no widebody route at all")


func test_route_cache_follows_the_layout_revision() -> void:
	var net := AirsideNetwork.new()
	net.setup(_diamond({"layout_revision": 3}))
	net.route("S", "T", "narrow")
	assert_eq(net._routes.size(), 1, "cached")
	net.route("S", "T", "narrow")
	assert_eq(net._routes.size(), 1, "reused, not recomputed")
	net.revision = 4
	net.route("T", "S", "narrow")
	assert_eq(net._routes.size(), 1, "a new revision drops the old routes")


# --- occupancy ---------------------------------------------------------------------------

func test_same_direction_headway_and_no_passing() -> void:
	var net := AirsideNetwork.new()
	net.setup(_diamond())
	var legs := net.route("S", "T", "narrow")
	assert_true(net.try_start(legs) and net.try_start(legs), "same direction: both may start")
	var first := net.try_enter(legs[0], 0, "F1")
	assert_eq(first, 100)
	assert_eq(net.try_enter(legs[0], 10, "F2"), -1, "the follower waits for the headway")
	var second := net.try_enter(legs[0], 20, "F2")
	assert_eq(second, 120, "and never leaves before the leader + headway")
	assert_true(net.is_front(legs[0], "F1") and not net.is_front(legs[0], "F2"), "only the leader may leave")
	net.leave(legs[0], "F1")
	assert_true(net.is_front(legs[0], "F2"))


func test_two_way_edges_lock_against_opposing_traffic() -> void:
	var net := AirsideNetwork.new()
	net.setup(_diamond())
	var east := net.route("S", "T", "narrow")
	var west := net.route("T", "S", "narrow")
	assert_true(net.try_start(east))
	assert_true(not net.try_start(west), "opposing traffic waits before it moves")
	assert_eq(net.start_blocker(west), "AT")
	net.leave(east[0])
	assert_true(not net.try_start(west), "still locked while the first is on AT")
	net.leave(east[1])
	assert_true(net.try_start(west), "free once the first has cleared")


func test_intersection_reservation() -> void:
	var net := AirsideNetwork.new()
	net.setup(_diamond())
	assert_true(net.try_enter("SA:1", 0, "F1") > 0)
	assert_eq(net.try_enter("SB:1", 2, "F2"), -1, "S is being crossed")
	assert_eq(net.enter_blocker("SB:1", 2), "intersection")
	assert_true(net.try_enter("SB:1", 5, "F2") > 0, "free after node_ticks")


# --- runways -------------------------------------------------------------------------------

func test_runway_length_decides_what_it_serves() -> void:
	var net := AirsideNetwork.new()
	net.setup(career().base.airside)
	var minimums := {"A220": 1500, "737": 1800, "A321": 2000, "787": 2800}
	for length in [1500, 2000, 2400, 2800, 3000]:
		for type in minimums:
			assert_eq(net.runway_serves({"length_m": length, "status": "open"}, type), length >= minimums[type], "%s on %d m" % [type, length])
	assert_true(not net.runway_serves({"length_m": 3000, "status": "closed"}, "A220"), "a closed runway serves nothing")


func test_second_runway_shares_traffic_deterministically() -> void:
	var c := career()
	var built := build_north_runway(c)
	assert_true(not built.has("error"), str(built.get("error", "")))
	var config := c.day_config()
	assert_eq(config.get("_errors", []), [])
	assert_eq(config.airside.runways.size(), 2)
	var sim := run(light(config))
	assert_true(departed(sim), "everything departs")
	var m := sim.airside_metrics()
	assert_true(int(m.runways.R2.movements) > 0, "R2 is used")
	assert_eq(int(m.runways.R1.movements) + int(m.runways.R2.movements), 2 * sim.flight_order.size())
	_breakdown_additive(sim)
	var again := run(light(config))
	for i in sim.flight_order.size():
		assert_eq(sim.flight_order[i].runway_id, again.flight_order[i].runway_id)
		assert_eq(sim.flight_order[i].actual_departure, again.flight_order[i].actual_departure)
	# Fewer queued ticks than the single-runway day (same operations model).
	var single := run(light(career().day_config()))
	var queued := func(s: AirportSimulation) -> int:
		var total := 0
		for f: AirportFlight in s.flight_order:
			total += int(f.delay_reasons.get("runway_takeoff_queue", 0)) + int(f.delay_reasons.get("runway_landing_queue", 0))
		return total
	assert_lt(queued.call(sim), queued.call(single), "a second runway shortens runway queues")


# --- movement and causality ------------------------------------------------------------------

func test_aircraft_move_continuously_along_the_graph() -> void:
	var sim := AirportSimulation.new()
	sim.setup(light(AirportSimulation.load_config(SINGLE)))
	var last := {}
	var taxied := {}
	for _i in 60000:
		sim.step()
		for f: AirportFlight in sim.flight_order:
			if not f.status in ["taxiing_in", "taxiing_out"]:
				last.erase(f.id)
				continue
			var at: Dictionary = sim.aircraft_position(f)
			assert_true(not at.is_empty(), "a taxiing aircraft has a position")
			if last.has(f.id) and last[f.id][1] == f.status:
				assert_true(at.pos.distance_to(last[f.id][0]) <= 1.01, "%s moves at most 1 m per tick (no teleport)" % f.flight_number)
			last[f.id] = [at.pos, f.status]
			taxied[f.id + f.status] = true
		if departed(sim): break
	assert_true(taxied.size() >= 10, "many aircraft taxied")


func test_single_taxilane_congests_and_attribution_stays_exact() -> void:
	var config := light(AirportSimulation.load_config(SINGLE))
	var sim := run(config)
	assert_true(departed(sim), "the one-lane day completes (no deadlock)")
	var m := sim.airside_metrics()
	assert_true(int(m.taxi_wait_ticks) > 0, "aircraft wait for the taxilane")
	var congested := 0
	for f: AirportFlight in sim.flight_order: congested += int(f.departure_delay_breakdown.get("taxi_congestion", 0))
	assert_true(congested > 0, "taxi congestion is a departure delay cause")
	_breakdown_additive(sim)
	var events := sim.events.history.filter(func(e): return e.type == "TAXI_COMPLETED")
	assert_eq(events.size(), 2 * sim.flight_order.size(), "every aircraft taxis in and out once")


func test_taxi_status_says_what_blocks() -> void:
	var seen := {}
	# Riverdale with A1's and A2's flights at the same times (their out-lanes
	# merge, so one waits for the headway), and the one-lane airport (opposing traffic).
	var merging := light(career().day_config())
	var at_a1 := {}
	for f in merging.flights:
		if f.assigned_gate_id == "A1": at_a1[int(f.scheduled_arrival) / 18000] = f
	for f in merging.flights:
		var twin = at_a1.get(int(f.scheduled_arrival) / 18000)
		if f.assigned_gate_id == "A2" and twin != null:
			f.scheduled_arrival = twin.scheduled_arrival
			f.scheduled_departure = twin.scheduled_departure
	for config in [merging, light(AirportSimulation.load_config(SINGLE))]:
		var sim := AirportSimulation.new()
		sim.setup(config)
		for _i in 200000:
			if departed(sim): break
			sim.step()
			for f: AirportFlight in sim.flight_order:
				var t := sim.taxi_status(f)
				if t.is_empty(): continue
				assert_eq(t.runway, "09/27")
				seen[t.blocker] = true
				if t.blocker == "taxiway" and not t.ahead.is_empty(): seen["ahead"] = true
	assert_true(seen.has(""), "moving")
	assert_true(seen.has("taxiway") and seen.has("ahead"), "waiting behind another aircraft is reported, with who is ahead")
	assert_true(seen.keys().any(func(k): return str(k).begins_with("opposing") or str(k).begins_with("gate")), "held before starting is reported")


func test_deadlock_sweep_on_two_way_taxiways() -> void:
	var env := OS.get_environment("BOARDING_DEADLOCK_RUNS")
	var runs := int(env) if env.is_valid_int() else 8
	var base := light(AirportSimulation.load_config(SINGLE))
	var wide := ["A7", "A8"]
	var narrow := ["A1", "A2", "A3", "A4", "A5", "A6"]
	for run_index in runs:
		var rng := RandomNumberGenerator.new()
		rng.seed = 9001 + run_index
		var config := base.duplicate(true)
		config.seed = 100 + run_index
		# A compressed, shuffled morning: arrivals within 40 minutes, random gates.
		for f in config.flights:
			var turn := int(f.scheduled_departure) - int(f.scheduled_arrival)
			f.scheduled_arrival = int(config.start_tick) + 900 + rng.randi_range(0, 24000)
			f.scheduled_departure = int(f.scheduled_arrival) + turn
			var pool: Array = wide if config.aircraft_types[f.aircraft_type].class == "wide" else narrow
			f.assigned_gate_id = pool[rng.randi_range(0, pool.size() - 1)]
		var sim := run(config, 150000)
		assert_true(departed(sim), "run %d: every aircraft departs (no deadlock)" % run_index)
		for id in sim.airside.edge_state:
			var st: Dictionary = sim.airside.edge_state[id]
			assert_true(st.occupants.is_empty() and int(st.locks) == 0, "run %d: %s released" % [run_index, id])


func test_reassigning_a_taxiing_aircraft_reroutes_it_physically() -> void:
	var config := light(career().day_config())
	var first: Dictionary = config.flights[0]
	var second: Dictionary = config.flights[1]
	# F002 follows F001 into A1 while F001 is still there.
	second.assigned_gate_id = first.assigned_gate_id
	second.scheduled_arrival = int(first.scheduled_arrival) + 1200
	var sim := AirportSimulation.new()
	sim.setup(config)
	var f: AirportFlight = sim.airport.flights[second.id]
	for _i in 60000:
		sim.step()
		if f.status == "taxiing_in" and f.taxi_state == "done": break
	assert_eq(f.taxi_state, "done", "it reached the occupied stand and holds")
	assert_true(str(sim.taxi_status(f).get("blocker", "")).begins_with("gate A1"), "holding for the gate is reported")
	var before: Vector2 = sim.aircraft_position(f).pos
	var result := sim.assign_gate(f.id, "A2")
	assert_true(result.ok, str(result.warnings))
	assert_eq(sim.aircraft_position(f).pos, before, "no jump: it starts from the stand it holds at")
	assert_true(f.taxi_route.any(func(leg): return leg.begins_with("RECIRC")), "around the loop: out-lane, hold, recirculation, exit, in-lane")
	for _i in 60000:
		sim.step()
		if f.status != "taxiing_in": break
	assert_true(f.gate_arrival_tick > 0 and f.assigned_gate_id == "A2", "docked at A2")
	assert_true(sim.events.history.any(func(e): return e.type == "TAXI_REROUTED" and e.flight_id == f.id))
	# A moving aircraft cannot turn back to a gate it has passed, but can go on to one ahead.
	sim = AirportSimulation.new()
	sim.setup(light(career().day_config()))
	var g: AirportFlight = null
	for _i in 60000:
		sim.step()
		for h: AirportFlight in sim.flight_order:
			if h.status == "taxiing_in" and h.taxi_state == "moving" and h.taxi_leg >= 3 and h.assigned_gate_id in ["A1", "A2", "A3"]: g = h
		if g != null: break
	assert_true(g != null)
	var passed := sim.assign_gate(g.id, "A8")
	assert_true(not passed.ok and str(passed.warnings).contains("No taxi route"), "no way back to A8 on the one-way lane")
	var ahead := "A1" if g.assigned_gate_id != "A1" else "A2"
	if sim.airport.gates[ahead].occupied_by_flight_id.is_empty(): assert_true(sim.assign_gate(g.id, ahead).ok, "on to a gate further along")


func test_routes_never_pass_through_a_stand() -> void:
	var net := AirsideNetwork.new()
	net.setup(career().day_config().airside)
	for gate in net.config.stands:
		for other in net.config.stands:
			var legs := net.route(net.config.stands[gate], net.config.stands[other], "narrow")
			for i in range(0, legs.size() - 1):
				assert_true(net.nodes[net.leg_to(legs[i])].kind != "stand", "%s → %s passes a stand" % [gate, other])


# --- construction rules ----------------------------------------------------------------------

func test_taxiway_placement_rules() -> void:
	var c := career()
	var l := c.layout
	assert_eq(l.taxiway_error("R1_EXIT", "G_3900_300"), "", "a stub from the exit to a free grid point")
	assert_true(l.taxiway_error("G_3600_-300", "G_3900_-300").contains("existing network"), "must connect to the network")
	assert_true(l.taxiway_error("R1_EXIT", "G_3950_300").contains("grid"), "off the grid")
	assert_true(l.taxiway_error("R1_EXIT", "G_3900_1500").contains("construction area"), "outside the zones")
	assert_true(l.taxiway_error("R1_HOLD", "G_3600_900").contains("area"), "not into the terminal")
	assert_true(l.taxiway_error("LO_W", "G_1200_1200").contains("area"), "nor through it")
	assert_true(l.taxiway_error("LO_W", "LI_A3").contains("cross IN_A2"), "no crossing without a junction")
	assert_true(l.taxiway_error("R1_EXIT", "LO_E").contains("pass through LI_E"), "no running through a node")
	assert_true(l.taxiway_error("R1_HOLD", "R1_EXIT").contains("already"), "the recirculation taxiway exists")
	assert_true(l.taxiway_error("R1_HOLD", "G_1800_-300").contains("runway R1"), "no crossing a runway")
	assert_true(l.taxiway_error("R1_B", "R1_EXIT").contains("already"), "already connected")
	assert_true(l.taxiway_error("R1_EXIT", "STAND_A1").contains("stand"), "stands have their own links")


func test_runway_placement_rules() -> void:
	var l := career().layout
	assert_eq(l.runway_error("G_300_-300", "E", 3200), "")
	assert_true(l.runway_error("G_300_-300", "E", 2500).contains("offered"), "offered lengths only")
	assert_true(l.runway_error("G_300_0", "E", 3200).contains("300 m") or l.runway_error("G_300_0", "E", 3200).contains("close"), "keeps clear of R1")
	assert_true(l.runway_error("G_1800_-600", "S", 2000).contains("cross") or l.runway_error("G_1800_-600", "S", 2000).contains("leave"), "cannot cross R1 or the apron")
	assert_true(l.runway_error("G_3000_-300", "E", 3200).contains("area"), "stays inside the airside")
	assert_true(l.runway_error("G_300_-300", "X", 3200).contains("heading"))


func test_costs_scale_with_length_and_post_to_the_ledger() -> void:
	var c := career()
	var cash := c.settled_cash_cents()
	var o := c.build_taxiway("R1_EXIT", "G_3900_300", 0)
	assert_true(not o.has("error"), str(o.get("error", "")))
	var metres := roundi(Vector2(3400, 330).distance_to(Vector2(3900, 300)))
	assert_eq(cash - c.settled_cash_cents(), metres * 3000, "taxiway cost per metre")
	assert_true(c.ledger.any(func(tx): return tx.id == "D1:BUILD:" + o.id and tx.category == "capital"))
	var undo := c.demolish(o.id)
	assert_eq(int(undo.refund_cents), metres * 3000, "same-session undo refunds in full")
	assert_eq(c.settled_cash_cents(), cash)
	var r := c.build_runway("G_300_-300", "E", 2800)
	assert_eq(cash - c.settled_cash_cents(), 2800 * 6000, "runway: a major cost per metre")
	assert_eq(r.id, "R2")
	# The unconnected runway stops the day until taxiways reach it.
	assert_true(c.start_errors().any(func(e): return e.contains("R2")), "an unconnected runway is reported")


func test_validation_and_demolition_safety() -> void:
	var c := career()
	assert_true(c.demolish("AT-EXIT_LANE").get("error", "").begins_with("Cannot demolish"), "the only exit path cannot go")
	assert_true(c.demolish("AR-R1").get("error", "").begins_with("Cannot demolish"), "the only runway cannot go")
	assert_true(c.set_airside("AR-R1", "status", "closed").get("error", "").begins_with("Cannot change"), "the only runway cannot close")
	assert_true(c.set_airside("AT-LI_4", "direction", -1).get("error", "").begins_with("Cannot change"), "reversing the in-lane strands gates")
	var two_way := c.set_airside("AT-LI_4", "direction", 0)
	assert_true(not two_way.has("error"), "a two-way lane is still valid")
	assert_eq(c.day_config().get("_errors", []), [])
	# With a second runway connected, R1 may close; its traffic moves to R2.
	build_north_runway(c)
	var closed := c.set_airside("AR-R1", "status", "closed")
	assert_true(not closed.has("error"), str(closed.get("error", "")))
	var sim := run(light(c.day_config()))
	assert_true(departed(sim))
	assert_eq(int(sim.airside_metrics().runways.R1.movements), 0, "a closed runway carries no traffic")


func test_short_runway_blocks_a_787_request_until_one_is_built() -> void:
	var c := career(SHORT)
	assert_eq(c.start_errors(), [], "the short-runway airport runs its narrowbody day")
	var tier: Dictionary = c.expansion_tiers("GA")[0]
	var missing := c.tier_capacity(tier)
	assert_true(missing.size() == 1 and missing[0].contains("2800"), "the 787 needs a longer runway: %s" % str(missing))
	assert_true(not build_north_runway(c, 2800).has("error"))
	assert_eq(c.tier_capacity(tier), [], "a 2,800 m runway unlocks it")
	c.request_status[tier.id] = "accepted"
	var config := c.day_config()
	assert_eq(config.get("_errors", []), [])
	var sim := run(light(config))
	var f787: AirportFlight = sim.airport.flights["GA901"]
	assert_eq(f787.status, "departed")
	assert_eq(f787.runway_id, "R2", "the 787 uses the only runway long enough")
	assert_true(f787.assigned_gate_id in ["A7", "A8"], "at a widebody gate")


# --- persistence -------------------------------------------------------------------------

func _mid_taxi(limit := 60000) -> AirportSimulation:
	var sim := AirportSimulation.new()
	sim.setup(light(AirportSimulation.load_config(SINGLE)))
	for _i in limit:
		sim.step()
		var moving := 0
		var holding := 0
		for f: AirportFlight in sim.flight_order:
			if f.status in ["taxiing_in", "taxiing_out"] and f.taxi_state == "moving": moving += 1
			if f.status in ["taxiing_in", "taxiing_out"] and f.taxi_state == "starting": holding += 1
		if moving >= 2 and holding >= 1: return sim
	return sim


func test_save_mid_taxi_resumes_identically() -> void:
	var original := _mid_taxi()
	var resumed := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(original.snapshot())))
	assert_true(resumed != null, "a mid-taxi save loads")
	for _i in 6000:
		original.step()
		resumed.step()
	assert_eq(JSON.stringify(original.snapshot()), JSON.stringify(resumed.snapshot()), "identical after resuming")


func test_corrupt_airside_saves_are_rejected() -> void:
	var sim := _mid_taxi()
	var good: Dictionary = JSON.parse_string(JSON.stringify(sim.snapshot()))
	assert_true(AirportSimulation.from_snapshot(good.duplicate(true)) != null)
	var taxiing := ""
	for key in good.airport.flights:
		if good.airport.flights[key].taxi_state == "moving" and int(good.airport.flights[key].taxi_leg) >= 0: taxiing = key
	var cases := {
		"v11": func(d): d.version = 11,
		"occupant on the wrong edge": func(d):
			var leg: String = d.airport.flights[taxiing].taxi_route[int(d.airport.flights[taxiing].taxi_leg)]
			for id in d.airside.edge_state:
				if id != AirsideNetwork.leg_edge(leg):
					d.airside.edge_state[id].occupants.append(taxiing)
					break,
		"lock count": func(d):
			for id in d.airside.edge_state:
				d.airside.edge_state[id].locks = 7
				break,
		"route through a missing edge": func(d): d.airport.flights[taxiing].taxi_route[0] = "NOPE:1",
		"unknown runway": func(d): d.airport.flights[taxiing].runway_id = "R9",
		"missing edge state": func(d): d.airside.edge_state.erase(d.airside.edge_state.keys()[0]),
		"leg out of range": func(d): d.airport.flights[taxiing].taxi_leg = 99,
	}
	assert_true(not taxiing.is_empty())
	for label in cases:
		var bad: Dictionary = good.duplicate(true)
		cases[label].call(bad)
		assert_true(AirportSimulation.from_snapshot(bad) == null, "rejected: " + label)


func test_career_save_keeps_the_airside_layout() -> void:
	var c := career()
	build_north_runway(c)
	c.set_airside("AT-LI_4", "direction", 0)
	var data: Dictionary = JSON.parse_string(JSON.stringify(c.snapshot()))
	var loaded := AirportCareer.from_snapshot(data.duplicate(true))
	assert_true(loaded != null)
	assert_eq(JSON.stringify(AirportSimulation._integer_json(loaded.day_config().airside)), JSON.stringify(AirportSimulation._integer_json(c.day_config().airside)), "the same airside after loading")
	var bad: Dictionary = data.duplicate(true)
	for o in bad.career.layout.objects:
		if o.type == "runway": o.heading = "Q"
	assert_true(AirportCareer.from_snapshot(bad) == null, "a corrupt runway object is rejected")
	bad = data.duplicate(true)
	for o in bad.career.layout.objects:
		if o.type == "legacy_taxiway": o.edge = "GHOST"
	assert_true(AirportCareer.from_snapshot(bad) == null, "an unknown imported taxiway is rejected")
