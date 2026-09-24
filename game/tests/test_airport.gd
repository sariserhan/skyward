extends TestCase

func fixture(count: int = 3) -> AirportSimulation:
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.erase("passenger_flow")
	config.erase("baggage")
	config.erase("resources")
	config.start_tick = 0
	config.landing_ticks = 7
	config.takeoff_ticks = 5
	config.separation_ticks = 4
	config.taxi_in_ticks = 10
	config.taxi_out_ticks = 10
	config.approach_ticks = 15
	config.gate_buffer_ticks = 10
	config.flights = config.flights.slice(0, count)
	# Turnaround tasks scaled like every other duration here.
	var durations := {"arrival_secured": 2, "cleaning": 20, "catering": 15, "fueling": 10, "baggage_unload": 14, "baggage_load": 14}
	for spec in config.turnaround.tasks:
		if durations.has(spec.type): spec.durations = {"*": durations[spec.type]}
	# Boarding window scaled like every other duration here (no passengers).
	config.boarding = {"open_before_departure_ticks": 20, "gate_close_before_departure_ticks": 16,
		"close_warning_ticks": 5, "hold_increment_ticks": 10, "max_hold_ticks": 30}
	for i in config.flights.size():
		config.flights[i].scheduled_arrival = 20 + i * 5
		config.flights[i].scheduled_departure = 85 + i * 5
		config.flights[i].assigned_gate_id = "A1"
	var sim := AirportSimulation.new()
	sim.setup(config)
	return sim

func test_clock_pause_speed_and_backlog() -> void:
	var clock := AirportClock.new()
	clock.paused = true
	assert_eq(clock.frame_steps(4), 0)
	clock.paused = false
	clock.set_speed(4)
	assert_eq(clock.frame_steps(0.5), 20)
	clock.set_speed(8)
	assert_eq(clock.speed, 4)
	assert_eq(clock.frame_steps(200), 4000)
	assert_eq(clock.frame_steps(0), 4000, "slow frames must preserve time")

func test_rng_snapshot_preserves_64_bit_state() -> void:
	var original := SimRng.new(8492014)
	for i in 17: original.randi_range(0, 999)
	var copy := SimRng.new(0)
	copy.restore(JSON.parse_string(JSON.stringify(original.snapshot())))
	for i in 50: assert_eq(original.randi_range(0, 999999), copy.randi_range(0, 999999))

func test_flight_lifecycle_and_runway_separation() -> void:
	var sim := fixture()
	sim.advance(400)
	assert_eq(sim.metrics().departed, 3)
	var last_end := -100
	var transitions: Array = []
	for event in sim.events.history:
		if event.type == "RUNWAY_STARTED":
			assert_true(int(event.tick) >= last_end + int(sim.config.separation_ticks), "runway separation")
			last_end = int(event.details.end_tick)
		if event.type == "FLIGHT_STATE_CHANGED" and event.flight_id == "F001": transitions.append(event.details.to)
	assert_eq(transitions, ["approaching", "landed", "taxiing_in", "at_gate", "turnaround", "boarding", "ready_for_pushback", "taxiing_out", "departed"])
	for gate: AirportGate in sim.airport.gates.values(): assert_eq(gate.occupied_by_flight_id, "")
	for i in sim.events.history.size(): assert_eq(sim.events.history[i].sequence, i)

func test_gate_conflict_wait_delay_and_resolution() -> void:
	var sim := fixture()
	sim.advance(55)
	assert_true(not sim.conflicts.is_empty())
	assert_true(sim.airport.flights.F002.delay_reasons.get("gate_wait", 0) > 0)
	assert_eq(sim.airport.gates.A1.occupied_by_flight_id, "F001")
	assert_true(sim.assign_gate("F002", "A2").ok)
	sim.step()
	assert_eq(sim.airport.gates.A2.occupied_by_flight_id, "F002")
	sim.advance(400)
	assert_true(sim.airport.flights.F003.actual_departure > sim.airport.flights.F003.scheduled_departure)
	assert_true(sim.conflicts.is_empty())

func test_assignment_constraints_and_warnings() -> void:
	var sim := fixture()
	assert_true(not sim.assignment_warnings("F002", "A1").is_empty())
	sim.airport.aircraft.AC_F001.required_gate_type = "wide"
	assert_true(not sim.assign_gate("F001", "A2").ok)
	assert_true(sim.assign_gate("F001", "A7").ok)
	sim.airport.gates.A8.terminal = "B"
	assert_true(not sim.assign_gate("F001", "A8").ok)
	assert_true(not sim.assign_gate("missing", "A8").ok)
	sim.advance(55)
	assert_true(not sim.assign_gate("F001", "A8").ok, "docked flights cannot teleport")

func test_same_seed_decisions_events_and_resume() -> void:
	var a := fixture()
	var b := fixture()
	a.advance(41)
	b.advance(41)
	a.assign_gate("F002", "A2")
	b.assign_gate("F002", "A2")
	a.force_delay("F001", 23)
	b.force_delay("F001", 23)
	var resumed := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(a.snapshot())))
	assert_true(resumed != null)
	if resumed == null: return
	a.advance(400)
	b.advance(400)
	resumed.advance(400)
	assert_eq(JSON.stringify(a.snapshot()), JSON.stringify(b.snapshot()), "same decisions reproduce all state")
	assert_eq(JSON.stringify(a.snapshot()), JSON.stringify(resumed.snapshot()), "JSON resume matches uninterrupted run")

func test_save_file_and_version_rejection() -> void:
	var sim := fixture()
	sim.advance(18)
	assert_eq(sim.save_file("user://airport_test.json"), OK)
	var copy := AirportSimulation.load_file("user://airport_test.json")
	assert_true(copy != null)
	if copy != null:
		sim.advance(200)
		copy.advance(200)
		assert_eq(JSON.stringify(sim.snapshot()), JSON.stringify(copy.snapshot()))
	var bad := sim.snapshot()
	bad.version = 999
	assert_eq(AirportSimulation.from_snapshot(bad), null)
	DirAccess.remove_absolute("user://airport_test.json")

func test_debug_delay_and_force_arrival() -> void:
	var sim := fixture()
	assert_true(sim.force_arrival("F003"))
	assert_true(not sim.force_arrival("F003"))
	assert_true(sim.force_delay("F001", 100))
	sim.advance(500)
	assert_true(sim.airport.flights.F001.actual_departure > sim.airport.flights.F001.scheduled_departure)
	assert_eq(sim.airport.flights.F001.delay_reasons.operational_hold, 100)


func test_resume_preserves_scenario_order_with_unsorted_ids() -> void:
	var config := fixture().config.duplicate(true)
	config.flights[0].id = "Z9"
	config.flights[1].id = "A2"
	config.flights[2].id = "M3"
	for f in config.flights: f.scheduled_arrival = 20
	var original := AirportSimulation.new()
	original.setup(config)
	original.advance(12)
	var resumed := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(original.snapshot())))
	assert_true(resumed != null)
	if resumed == null: return
	original.advance(400)
	resumed.advance(400)
	assert_true(JSON.stringify(original.snapshot()) == JSON.stringify(resumed.snapshot()), "scenario order survives sorted JSON object keys")

func test_corrupt_save_is_rejected_without_partial_restore() -> void:
	var sim := fixture()
	var broken := sim.snapshot()
	broken.clock.erase("tick")
	assert_eq(AirportSimulation.from_snapshot(broken), null)
	broken = sim.snapshot()
	broken.airport.flights.F001.assigned_gate_id = "missing"
	assert_eq(AirportSimulation.from_snapshot(broken), null)
	broken = sim.snapshot()
	broken.airport.gates.A1.occupied_by_flight_id = "F001"
	assert_eq(AirportSimulation.from_snapshot(broken), null)

func test_gate_buffer_and_delayed_flight_cannot_depart_early() -> void:
	var sim := fixture(2)
	sim.airport.flights.F002.scheduled_arrival = 65
	assert_true("Insufficient buffer with NS 221" in sim.assignment_warnings("F002", "A1"))
	sim.force_delay("F001", 100)
	sim.advance(90)
	assert_eq(sim.airport.flights.F001.status, "turnaround")
	assert_eq(sim.airport.gates.A1.occupied_by_flight_id, "F001")

func test_frame_speed_changes_do_not_change_simulation_events() -> void:
	var slow := fixture()
	var fast := fixture()
	fast.clock.set_speed(4)
	for i in 400: slow.advance(slow.clock.frame_steps(0.1))
	for i in 100: fast.advance(fast.clock.frame_steps(0.1))
	assert_eq(slow.events.history, fast.events.history)
	assert_eq(slow.airport.to_dict(), fast.airport.to_dict())
