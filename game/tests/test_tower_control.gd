extends TestCase

func scenario() -> AirportSimulation:
	var config := AirportSimulation.load_config("res://configs/airports/riverdale.json")
	for key in ["passenger_flow", "baggage", "resources"]: config.erase(key)
	var s := AirportSimulation.new()
	s.setup(config)
	return s

func test_clearance_respects_queue_and_separation() -> void:
	var s := scenario()
	s.set_tower_control(true)
	var a: AirportFlight = s.flight_order[0]
	var b: AirportFlight = s.flight_order[1]
	s._request_runway(a,"landing")
	s._request_runway(b,"landing")
	var runway: AirportRunway = s.airport.runways[a.runway_id]
	s._start_runway()
	assert_true(runway.active_operation.is_empty(),"manual queue waits")
	assert_true(not s.tower_command(b.id,"clear").ok,"cannot clear out of sequence")
	assert_true(s.tower_command(a.id,"clear").ok)
	s._start_runway()
	assert_eq(runway.active_operation.flight_id,a.id)
	assert_true(not s.tower_command(b.id,"clear").ok,"cannot clear occupied runway")
	s.clock.tick = int(runway.active_operation.end_tick)
	s._complete_runway()
	assert_true(not s.tower_command(b.id,"clear").ok,"separation remains enforced")
	s.clock.tick = runway.occupied_until
	assert_true(s.tower_command(b.id,"clear").ok)

func test_taxi_hold_waits_at_node_then_resumes() -> void:
	var s := scenario()
	var f: AirportFlight = s.flight_order[0]
	f.runway_id = s.airport.runways.keys()[0]
	s._begin_taxi(f,"in")
	assert_true(s.tower_command(f.id,"hold").ok)
	var leg: int = f.taxi_leg
	s.clock.tick = f.leg_exit_tick+1
	assert_true(not s._advance_taxi(f))
	assert_eq(f.taxi_leg,leg,"does not enter another edge while held")
	assert_true(s.tower_command(f.id,"resume").ok)
	s._advance_taxi(f)
	assert_true(f.taxi_leg>leg or f.taxi_state=="done")
	s.tower_command(f.id,"hold")
	s.set_tower_control(false)
	assert_true(not f.taxi_hold,"auto releases controller holds")

func test_controller_fields_survive_save_and_old_defaults() -> void:
	var flight := AirportFlight.new()
	flight.taxi_hold = true
	flight.runway_cleared = true
	var copy := AirportFlight.new()
	copy.restore(flight.to_dict())
	assert_true(copy.taxi_hold and copy.runway_cleared)
	var old := AirportFlight.new()
	old.restore({"id":"old"})
	assert_true(not old.taxi_hold and not old.runway_cleared)
	var runway := AirportRunway.new()
	runway.manual_control = true
	var other := AirportRunway.new()
	other.restore(runway.to_dict())
	assert_true(other.manual_control)

func test_legacy_v13_snapshot_migrates_and_invalid_flags_fail() -> void:
	var s := scenario()
	var data := s.snapshot()
	for f in data.airport.flights.values():
		f.erase("taxi_hold")
		f.erase("runway_cleared")
	for r in data.airport.runways.values(): r.erase("manual_control")
	var restored := AirportSimulation.from_snapshot(data)
	assert_true(restored != null,"existing careers remain loadable")
	data.airport.flights.values()[0]["taxi_hold"] = "yes"
	assert_true(AirportSimulation.from_snapshot(data) == null,"invalid new values still rejected")
