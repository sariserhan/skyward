extends TestCase

func fixture(count: int = 12, lanes: int = 2) -> AirportSimulation:
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.start_tick = 0
	config.flights = config.flights.slice(0, 1)
	# Departing-flow tests: no inbound passengers on this aircraft.
	config.flights[0].inbound_load_permille = 0
	config.flights[0].scheduled_arrival = 20000
	config.flights[0].scheduled_departure = 40000
	config.aircraft_types.A220.seats = count
	var flow: Dictionary = config.passenger_flow
	# Earlier-milestone fixtures: no connecting itineraries (M6 tests opt in)
	# no checked-baggage model (M7 tests opt in) and no operational resource
	# limits (M8 tests opt in).
	flow.erase("connections")
	config.erase("baggage")
	config.erase("resources")
	flow.load_permille = 1000
	flow.staff_pool = 6
	# Exact manifest sizes: use the flat load, not the scenario's load ranges.
	flow.erase("load_permille_range")
	flow.erase("airline_load_permille_ranges")
	flow.arrival_lead_min_ticks = 39999
	flow.arrival_lead_max_ticks = 39999
	flow.check_in_ticks = 1
	for edge in flow.graph.edges: edge.walking_ticks = 2
	flow.checkpoints[0].open_lanes = lanes
	flow.checkpoints[0].staff = lanes
	flow.checkpoints[0].service_ticks = 20
	var sim := AirportSimulation.new()
	sim.setup(config)
	return sim

func test_graph_shortest_path_and_airside_boundary() -> void:
	var graph := TerminalGraph.new()
	graph.setup({"nodes": {"a": {"airside": true}, "b": {"airside": true}, "c": {"airside": true}, "shortcut": {"airside": false}}, "edges": [
		{"from": "a", "to": "b", "walking_ticks": 10}, {"from": "b", "to": "c", "walking_ticks": 10},
		{"from": "a", "to": "c", "walking_ticks": 50}, {"from": "a", "to": "shortcut", "walking_ticks": 1},
		{"from": "shortcut", "to": "c", "walking_ticks": 1}]})
	assert_eq(graph.route("a", "c"), ["a", "shortcut", "c"])
	assert_eq(graph.route("a", "c", true), ["a", "b", "c"])
	assert_eq(graph.route("a", "missing"), [])
	assert_eq(graph.route_ticks(["a", "b", "c"], 500), 40)

func test_canonical_generation_and_complete_terminal_journey() -> void:
	var sim := fixture()
	assert_eq(sim.airport.passengers.size(), 12)
	assert_eq(sim.airport.flights.F001.passenger_ids.size(), 12)
	var p: Passenger = sim.airport.passengers["1"]
	sim.advance(500)
	assert_true(is_same(p, sim.airport.passengers["1"]), "same passenger object throughout journey")
	for passenger: Passenger in sim.airport.passengers.values():
		assert_eq(passenger.airport_state, "waiting_at_gate")
		assert_eq(passenger.current_location, "A1")
		assert_true(passenger.security_cleared)
		assert_true(passenger.gate_arrival_time > passenger.arrival_time_at_airport)
	assert_eq(sim.passenger_flow.ready_by_flight.F001, 12)
	assert_eq(sim.airport.security_checkpoints.west.processed, 12)
	assert_eq(sim.passenger_flow.pending.size(), 0)
	var gate_events := 0
	for event in sim.events.history:
		if event.type == "PASSENGER_GATE_ARRIVE": gate_events += 1
	assert_eq(gate_events, 12)

func test_security_capacity_changes_gate_arrival_times() -> void:
	var slow := fixture(20, 1)
	var fast := fixture(20, 4)
	slow.advance(500)
	fast.advance(500)
	var slow_total := 0
	var fast_total := 0
	for id in slow.airport.passengers:
		slow_total += slow.airport.passengers[id].gate_arrival_time
		fast_total += fast.airport.passengers[id].gate_arrival_time
	assert_lt(fast_total, slow_total)
	assert_lt(fast.airport.security_checkpoints.west.total_wait_ticks, slow.airport.security_checkpoints.west.total_wait_ticks)

func test_closed_lanes_drain_active_work_then_reopen_fifo() -> void:
	var sim := fixture()
	sim.advance(20)
	var cp: SecurityCheckpoint = sim.airport.security_checkpoints.west
	assert_eq(cp.active.size(), 2)
	var waiting: Array = cp.queue.duplicate()
	assert_eq(waiting.size(), 10)
	assert_true(sim.set_security("west", 0, 2))
	sim.advance(40)
	assert_eq(cp.active.size(), 0)
	assert_eq(cp.processed, 2)
	assert_eq(cp.queue, waiting)
	assert_true(sim.set_security("west", 1, 1))
	assert_eq(cp.active["0"], waiting[0], "FIFO preserved across closure")
	sim.advance(500)
	assert_eq(cp.processed, 12)
	assert_eq(sim.passenger_flow.ready_by_flight.F001, 12)

func test_staff_pool_limits_and_unstaffed_lanes() -> void:
	var sim := fixture()
	assert_true(not sim.set_security("west", 5, 2))
	assert_true(not sim.set_security("unknown", 1, 1))
	assert_true(sim.set_security("east", 4, 4))
	assert_true(not sim.set_security("west", 3, 3), "finite pool")
	assert_true(sim.set_security("west", 4, 0))
	sim.advance(100)
	assert_eq(sim.airport.security_checkpoints.west.processed, 0)
	assert_eq(sim.airport.security_checkpoints.west.queue.size(), 12)
	assert_true(sim.set_security("west", 4, 2))
	assert_eq(sim.airport.security_checkpoints.west.active.size(), 2, "staff limits open lanes")

func test_gate_change_mid_walk_preserves_leg_and_identity() -> void:
	var sim := fixture(1)
	var p: Passenger = sim.airport.passengers["1"]
	for i in 100:
		sim.step()
		if p.airport_state == "walking_to_gate": break
	assert_eq(p.airport_state, "walking_to_gate")
	var next := p.walk_to
	var due := p.flow_due_tick
	assert_true(sim.assign_gate("F001", "A8").ok)
	assert_eq(p.walk_to, next)
	assert_eq(p.flow_due_tick, due)
	sim.advance(100)
	assert_eq(p.current_location, "A8")
	assert_eq(p.airport_state, "waiting_at_gate")
	assert_eq(sim.airport.passengers.size(), 1)

func test_waiting_passengers_walk_to_reassigned_gate() -> void:
	var sim := fixture(3)
	sim.advance(200)
	assert_eq(sim.passenger_flow.ready_by_flight.F001, 3)
	var p: Passenger = sim.airport.passengers["1"]
	assert_true(sim.assign_gate("F001", "A8").ok)
	assert_eq(p.current_location, "A1", "no teleport")
	assert_eq(p.gate_arrival_time, -1)
	assert_eq(sim.passenger_flow.ready_by_flight.F001, 0)
	sim.advance(100)
	assert_eq(sim.passenger_flow.ready_by_flight.F001, 3)
	assert_eq(p.current_location, "A8")

func test_same_seed_and_lane_decisions_reproduce_events() -> void:
	var a := fixture(30)
	var b := fixture(30)
	for sim in [a, b]:
		sim.advance(20)
		sim.set_security("west", 0, 1)
		sim.advance(40)
		sim.set_security("west", 3, 3)
		sim.assign_gate("F001", "A8")
		sim.advance(400)
	assert_true(JSON.stringify(a.snapshot()) == JSON.stringify(b.snapshot()), "same state and ordered events")

func test_save_resume_queued_processing_walking_and_future_arrivals() -> void:
	for tick in [0, 3, 20, 30, 70, 500]:
		var original := fixture()
		original.advance(tick)
		# Preserve boarding substate too, without changing the boarding record API.
		original.airport.passengers["1"].timer = 37
		var copy := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(original.snapshot())))
		assert_true(copy != null, "snapshot at tick %d" % tick)
		if copy == null: continue
		original.set_security("west", 3, 3)
		copy.set_security("west", 3, 3)
		original.assign_gate("F001", "A8")
		copy.assign_gate("F001", "A8")
		original.advance(500)
		copy.advance(500)
		assert_true(JSON.stringify(original.snapshot()) == JSON.stringify(copy.snapshot()), "resume at tick %d" % tick)
		assert_eq(copy.airport.passengers["1"].timer, 37)

func test_invalid_passenger_queue_and_scheduler_saves_rejected() -> void:
	var sim := fixture()
	sim.advance(20)
	var bad := sim.snapshot()
	bad.airport.security_checkpoints.west.queue.append(99999)
	assert_eq(AirportSimulation.from_snapshot(bad), null)
	bad = sim.snapshot()
	bad.airport.flights.F001.passenger_ids.append(1)
	assert_eq(AirportSimulation.from_snapshot(bad), null)
	bad = sim.snapshot()
	bad.passenger_flow.pending.pop_back()
	assert_eq(AirportSimulation.from_snapshot(bad), null)
	bad = sim.snapshot()
	bad.airport.passengers["1"].security_checkpoint_id = "missing"
	assert_eq(AirportSimulation.from_snapshot(bad), null)

func test_gate_changes_before_security_and_pause_speed() -> void:
	var slow := fixture()
	var fast := fixture()
	for sim in [slow, fast]: sim.assign_gate("F001", "A8")
	fast.clock.set_speed(4)
	fast.clock.paused = true
	fast.advance(fast.clock.frame_steps(3))
	assert_eq(fast.clock.tick, 0)
	fast.clock.paused = false
	for i in 400: slow.advance(slow.clock.frame_steps(0.1))
	for i in 100: fast.advance(fast.clock.frame_steps(0.1))
	assert_eq(slow.events.history, fast.events.history)
	assert_eq(slow.airport.to_dict(), fast.airport.to_dict())
	for p: Passenger in fast.airport.passengers.values(): assert_eq(p.current_location, "A8")
