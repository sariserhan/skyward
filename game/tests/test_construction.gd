extends TestCase
## M11: construction. The airport as built is persistent career state; days are
## built from it; construction is capital in the ledger; validation blocks a day
## that cannot run. See docs/m11-plan.md.

const EXPANSION := "res://configs/airports/riverdale_expansion.json"
const CRUNCH := "res://configs/airports/riverdale_baggage_crunch.json"

var _baseline: Dictionary = {}


func career(path := "") -> AirportCareer:
	var c := AirportCareer.new()
	c.new_career(path)
	return c


func play(c: AirportCareer, accept := false) -> void:
	while not c.day_complete():
		c.sim.step()
		for airline in c.sim.airlines.airline_ids:
			if c.sim.airlines.state[airline].request == "offered": c.sim.answer_airline_request(airline, accept)


## The unexpanded day 1, once (shared).
func baseline() -> Dictionary:
	if _baseline.is_empty():
		var c := career()
		assert_true(c.start_day())
		var s := c.sim
		play(c)
		c.settle_day()
		_baseline = {"career": c, "sim": s, "report": c.reports[0]}
	return _baseline


# --- import and regression ---------------------------------------------------------

func test_unexpanded_riverdale_is_the_m10_day() -> void:
	var c := career()
	var config := c.day_config()
	assert_eq(config.get("_errors", []), [], "the imported airport is valid")
	for key in ["gates"]: assert_eq(JSON.stringify(config[key]), JSON.stringify(c.base[key]), key + " unchanged")
	assert_eq(JSON.stringify(config.passenger_flow.graph.edges), JSON.stringify(c.base.passenger_flow.graph.edges), "same terminal graph")
	assert_eq(JSON.stringify(config.passenger_flow.checkpoints), JSON.stringify(c.base.passenger_flow.checkpoints), "same security")
	assert_eq(JSON.stringify(config.baggage.stages), JSON.stringify(c.base.baggage.stages), "same baggage stages")
	for i in config.flights.size(): assert_eq(config.flights[i].assigned_gate_id, c.base.flights[i].assigned_gate_id)
	var r: Dictionary = baseline().report
	assert_eq(int(r.net_cents), 1841550, "the M10 day 1 result, to the cent")
	assert_eq(int(r.passengers), 3974)
	assert_eq(int(r.missed_connections), 6)


# --- placement and money -----------------------------------------------------------------

func test_placement_charges_once_and_persists() -> void:
	var c := career()
	var cash := c.settled_cash_cents()
	var o := c.build("security_lane", "security_west")
	assert_eq(o.get("error", ""), "")
	assert_eq(c.settled_cash_cents(), cash - int(c.layout.catalog.security_lane.cost_cents), "exact cost, integer cents")
	assert_eq(c.ledger.filter(func(tx): return tx.category == "capital").size(), 1)
	assert_eq(c.day_config().passenger_flow.checkpoints[0].max_lanes, 5, "a fifth west lane")
	var again := AirportCareer.from_snapshot(JSON.parse_string(JSON.stringify(c.snapshot())))
	assert_true(again != null)
	assert_eq(JSON.stringify(again.layout.snapshot()), JSON.stringify(c.layout.snapshot()), "the layout reloads identically")
	assert_eq(again.settled_cash_cents(), c.settled_cash_cents(), "no double charge after reload")


func test_overlaps_and_wrong_sites_are_rejected() -> void:
	var c := career()
	assert_true(c.build("gate_narrow", "pad_A1").has("error"), "A1 is occupied")
	assert_true(c.build("gate_wide", "pad_A9").has("error"), "a widebody gate needs a wide pad")
	assert_true(c.build("gate_narrow", "security_west").has("error"), "a gate needs a pad")
	assert_true(c.build("east_pier", "central_connector").has("error"), "each terminal site takes its own piece")
	assert_eq(c.build("east_pier", "east_pier").get("error", ""), "")
	assert_true(c.build("east_pier", "east_pier").has("error"), "already built")
	assert_eq(c.ledger.filter(func(tx): return tx.category == "capital").size(), 1, "only the valid build was charged")


func test_unaffordable_construction_is_refused() -> void:
	var c := career()
	c.starting_cash_cents = int(c.layout.catalog.gate_wide.cost_cents) - 1
	var result := c.build("gate_wide", "pad_A10")
	assert_true(result.has("error"))
	assert_true(c.ledger.is_empty() and c.layout.find("B0001").is_empty(), "nothing charged, nothing built")


func test_demolition_refunds_and_changes_capacity() -> void:
	var c := career()
	var lane := c.build("security_lane", "security_east")
	var cost := int(c.layout.catalog.security_lane.cost_cents)
	var undo := c.demolish(lane.id)
	assert_eq(int(undo.refund_cents), cost, "undo in the same planning session refunds in full")
	var kept := c.build("security_lane", "security_east")
	c.layout.session_ids = []
	var later := c.demolish(kept.id)
	assert_eq(int(later.refund_cents), cost * int(c.base.construction.refund_permille) / 1000, "later demolition refunds the configured share")
	assert_eq(c.day_config().passenger_flow.checkpoints[1].max_lanes, 4)
	assert_eq(c.ledger.size(), 4, "every build and refund is its own transaction")
	assert_true(c.demolish("G-A1").has("error"), "A1's committed flights have nowhere else to go")


# --- validation ---------------------------------------------------------------------------

func test_disconnected_gate_blocks_the_day() -> void:
	var c := career()
	c.build("gate_narrow", "pad_A9")
	var errors := c.start_errors()
	assert_true(errors.any(func(e): return e.contains("Gate A9 has no passenger path")), "explained: %s" % [errors])
	assert_true(not c.can_start() and not c.start_day(), "cannot start")
	c.build("east_pier", "east_pier")
	assert_eq(c.start_errors(), [], "the pier connects it")
	assert_true(c.can_start())


func test_navigation_cache_belongs_to_one_revision() -> void:
	var c := career()
	var before := c.day_config()
	var graph := TerminalGraph.new()
	graph.setup(before.passenger_flow.graph)
	var walk_before := graph.route_ticks(graph.route("west_hall", "east_hall", true))
	c.build("central_connector", "central_connector")
	var after := c.day_config()
	assert_true(int(after.layout_revision) > int(before.layout_revision), "the revision moves on")
	graph.setup(after.passenger_flow.graph)
	var walk_after := graph.route_ticks(graph.route("west_hall", "east_hall", true))
	assert_true(walk_after < walk_before, "the connector route replaces the old one: %d → %d" % [walk_before, walk_after])
	# A cache kept past a revision change is never used.
	graph.revision += 1
	assert_eq(graph.route("west_hall", "east_hall", true), ["west_hall", "central_link", "east_hall"])
	assert_eq(graph._routes.size(), 1, "rebuilt for the new revision")


# --- gates, security, baggage, resources ------------------------------------------------------

func test_new_gates_carry_real_flights() -> void:
	var c := career(EXPANSION)
	c.request_status["GA_MIDDAY_BANK"] = "accepted"
	assert_true(c.start_errors().any(func(e): return e.begins_with("GA 431")), "the accepted flights don't fit yet")
	assert_eq(c.build("east_pier", "east_pier").get("error", ""), "")
	assert_eq(c.build("gate_narrow", "pad_A9").get("error", ""), "")
	var errors := c.start_errors()
	assert_true(errors.any(func(e): return e.begins_with("GA 431") and e.contains("widebody")), "a 787 cannot use the narrowbody gate: %s" % [errors])
	assert_eq(c.build("gate_wide", "pad_A10").get("error", ""), "")
	assert_eq(c.start_errors(), [])
	assert_true(c.start_day())
	var s := c.sim
	assert_eq(s.airport.flights.GA431.assigned_gate_id, "A10")
	assert_eq(s.airport.flights.GA439.assigned_gate_id, "A9")
	play(c)
	for id in ["GA431", "GA439"]:
		var f: AirportFlight = s.airport.flights[id]
		assert_eq(f.status, "departed", id + " operated")
		assert_true(f.boarded_count > 50 and f.deplaned_count > 50, id + " boarded and deboarded at its new gate")
		assert_true(s.baggage.bags_for(f).size() > 0, id + " had bags")
		assert_eq(s.turnaround.task(f, "fueling").status, TurnaroundTask.COMPLETE)
		assert_true(s.economy.has("D1:%s:passengers" % id), id + " earned its fees")
	c.settle_day()
	assert_true(AirportCareer.from_snapshot(JSON.parse_string(JSON.stringify(c.snapshot()))) != null, "the expanded career saves and loads")


func test_built_lanes_bound_open_lanes() -> void:
	var c := career()
	assert_true(c.start_day())
	assert_true(not c.sim.set_security("west", 5, 3), "only 4 lanes are built")
	c = career()
	c.build("security_lane", "security_west")
	c.build("security_lane", "security_west")
	assert_true(c.start_day())
	assert_eq(c.sim.airport.security_checkpoints.west.max_lanes, 6)
	assert_true(c.sim.set_security("west", 5, 5) or c.sim.set_security("west", 5, 4), "a built lane can be opened (staff permitting)")
	assert_true(not c.sim.set_security("west", 7, 5), "but never more than are built")


func test_more_baggage_modules_more_throughput() -> void:
	var out := {}
	for extra in [0, 3]:
		var c := career(CRUNCH)
		for i in extra: c.build("transfer_sorter", "baggage_transfer_sortation")
		c.start_day()
		assert_eq(c.sim.baggage.stages.transfer_sortation.servers, 2 + extra)
		var peak := [0]
		while not c.day_complete():
			c.sim.step()
			peak[0] = maxi(peak[0], c.sim.baggage.stages.transfer_sortation.queue.size())
		out[extra] = {"peak": peak[0], "missed": int(c.sim.baggage_metrics().transfer_missed), "service": int(c.sim.baggage.stages.transfer_sortation.service_ticks)}
	assert_eq(out[0].service, out[3].service, "same service time, more parallel servers")
	assert_true(out[3].peak < out[0].peak, "shorter queue: %d → %d" % [out[0].peak, out[3].peak])
	assert_true(out[3].missed <= out[0].missed, "no more missed transfer bags: %d → %d" % [out[0].missed, out[3].missed])


func test_facilities_bound_the_daily_plan() -> void:
	var c := career()
	assert_eq(c.maximum_units("fuel_unit"), 6)
	assert_true(not c.set_units("fuel_unit", 7), "only 6 fuel units' worth of facilities")
	c.build("fuel_bay", "service_yard")
	assert_eq(c.maximum_units("fuel_unit"), 8)
	assert_true(c.set_units("fuel_unit", 8))
	assert_eq(c.committed_cost_cents() - career().committed_cost_cents(), 4 * int(c.base.economy.resources.fuel_unit.daily_cents), "building capacity doesn't operate it; paying for units does")
	c.layout.session_ids = []
	var result := c.demolish(c.layout.objects.filter(func(o): return o.type == "fuel_bay")[0].id)
	assert_true(result.has("error"), "cannot demolish a bay the plan is using")


func test_gate_location_changes_a_real_connection_walk() -> void:
	var times := {}
	for gate in ["A6", "A10"]:
		var c := career()
		c.build("east_pier", "east_pier")
		c.build("gate_wide", "pad_A10")
		var config := c.day_config()
		config.erase("_errors")
		config.start_tick = 0
		config.turnaround.variation_permille = 0
		var a: Dictionary = config.flights[4].duplicate(true)
		a.merge({"id": "FA", "flight_number": "NS 900", "aircraft_type": "737", "assigned_gate_id": "A5", "scheduled_arrival": 20000,
			"scheduled_departure": 60000, "load_permille": 0, "inbound_load_permille": 1000, "late_passengers": 0, "inbound_delay_ticks": 0}, true)
		var b: Dictionary = config.flights[1].duplicate(true)
		b.merge({"id": "FB", "flight_number": "AW 900", "aircraft_type": "737", "assigned_gate_id": gate, "scheduled_arrival": 3000,
			"scheduled_departure": 60000, "load_permille": 17, "inbound_load_permille": 0, "late_passengers": 0, "inbound_delay_ticks": 0}, true)
		config.flights = [a, b]
		config.passenger_flow.connections = {"default_permille": 0, "demo_bank": [{"from": "FA", "to": "FB", "seats": ["14C"]}]}
		var s := AirportSimulation.new()
		s.setup(config)
		var p: Passenger = null
		for id in s.airport.flights.FA.inbound_passenger_ids:
			if s.airport.passengers[str(id)].journey_direction == "connecting": p = s.airport.passengers[str(id)]
		while p.gate_arrival_time < 0 and s.clock.tick < 60000: s.step()
		times[gate] = p.gate_arrival_time - p.deplaned_airport_tick
	assert_true(times.A10 > times.A6 + 600, "the pier gate is a longer real walk: %.1f vs %.1f min" % [times.A6 / 600.0, times.A10 / 600.0])


# --- economics and persistence ---------------------------------------------------------------

func test_unused_construction_earns_nothing() -> void:
	var c := career()
	c.build("security_lane", "security_west")
	c.build("east_pier", "east_pier")
	c.build("gate_narrow", "pad_A9")
	c.start_day()
	play(c)
	c.settle_day()
	var r: Dictionary = c.reports[0]
	var base: Dictionary = baseline().report
	assert_eq(int(r.revenue_cents), int(base.revenue_cents), "no phantom revenue from an unused gate, pier or lane")
	assert_eq(int(r.net_cents), int(base.net_cents), "the operating result is the same day")
	assert_eq(int(r.closing_cents), int(base.closing_cents) + int(r.capital_cents), "only the capital spent differs")
	assert_true(int(r.capital_cents) < 0)


func test_mid_day_save_keeps_the_built_airport() -> void:
	var c := career(EXPANSION)
	c.request_status["GA_MIDDAY_BANK"] = "accepted"
	c.build("east_pier", "east_pier")
	c.build("gate_narrow", "pad_A9")
	c.build("gate_wide", "pad_A10")
	c.start_day()
	while c.sim.clock.tick < 262000: c.sim.step()
	var text := JSON.stringify(c.snapshot())
	var resumed := AirportCareer.from_snapshot(JSON.parse_string(text))
	assert_true(resumed != null, "mid-day save of an expanded airport loads")
	assert_true(resumed.sim.airport.gates.has("A10"))
	for _i in 3000:
		c.sim.step()
		resumed.sim.step()
	assert_eq(JSON.stringify(resumed.snapshot()), JSON.stringify(c.snapshot()), "and continues identically")
	var mismatch: Dictionary = JSON.parse_string(text)
	mismatch.career.layout.revision += 1
	assert_true(AirportCareer.from_snapshot(mismatch) == null, "a day never runs on a different layout revision")


func test_corrupt_layouts_are_rejected() -> void:
	var c := career()
	c.build("security_lane", "security_west")
	var good: Dictionary = JSON.parse_string(JSON.stringify(c.snapshot()))
	assert_eq(int(good.version), 11)
	var mutations := {
		"duplicate build id": func(d): d.career.layout.objects.append(d.career.layout.objects[0].duplicate()),
		"two objects in one slot": func(d):
			var o: Dictionary = d.career.layout.objects[-1].duplicate()
			o.id = "B0099"
			d.career.layout.next_id = 100
			o.slot = 0
			d.career.layout.objects.append(o),
		"gate on a security site": func(d): d.career.layout.objects[0].site = "security_west",
		"plan above built capacity": func(d): d.career.resource_plan.fuel_unit = 7,
		"v10": func(d): d.version = 10,
	}
	for label in mutations:
		var bad: Dictionary = good.duplicate(true)
		mutations[label].call(bad)
		assert_true(AirportCareer.from_snapshot(bad) == null, "rejected: " + label)


func test_same_construction_same_next_day() -> void:
	var runs: Array = []
	for _i in 2:
		var c := career("res://configs/airports/riverdale_airline_conflict.json")
		c.build("central_connector", "central_connector")
		c.build("fuel_bay", "service_yard")
		c.set_units("fuel_unit", 2)
		c.start_day()
		play(c)
		c.settle_day()
		runs.append(JSON.stringify(c.snapshot()))
	assert_eq(runs[0], runs[1])
