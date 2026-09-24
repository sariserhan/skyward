extends TestCase
## M5: arriving passengers deboard through the cabin engine and leave through
## the terminal. See docs/m5-plan.md.

const D := 40000


## One aircraft at a gate with a fast terminal and no turnaround variation.
func fixture(aircraft := "737", overrides := {}, edit := Callable()) -> AirportSimulation:
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.start_tick = 0
	config.turnaround.variation_permille = 0
	var f: Dictionary = config.flights[1].duplicate(true)
	f.aircraft_type = aircraft
	f.scheduled_arrival = 3000
	f.scheduled_departure = D
	f.assigned_gate_id = "A7" if aircraft == "787" else "A2"
	f.load_permille = 800
	f.inbound_load_permille = 850
	f.late_passengers = 0
	f.boarding_strategy = "window_middle_aisle"
	f.deboarding_overrides = overrides
	config.flights = [f]
	var flow: Dictionary = config.passenger_flow
	# Earlier-milestone fixtures: no connecting itineraries (M6 tests opt in).
	flow.erase("connections")
	flow.arrival_lead_min_ticks = 30000
	flow.arrival_lead_max_ticks = 34000
	flow.check_in_ticks = 1
	for cp in flow.checkpoints: cp.service_ticks = 20
	if edit.is_valid(): edit.call(config)
	var sim := AirportSimulation.new()
	sim.setup(config)
	return sim


func flight(sim: AirportSimulation) -> AirportFlight:
	return sim.airport.flights.F002


func task(sim: AirportSimulation, type: String) -> TurnaroundTask:
	return sim.turnaround.task(flight(sim), type)


func run_until(sim: AirportSimulation, predicate: Callable, limit := 90000) -> void:
	for _i in limit:
		if predicate.call(): return
		sim.step()


func inbound(sim: AirportSimulation) -> Array[Passenger]:
	return sim._inbound(flight(sim))


func sum(breakdown: Dictionary) -> int:
	var total := 0
	for key in breakdown: total += int(breakdown[key])
	return total


static func manifest(cabin: AircraftDef, count: int, seed_value: int, settings := {}) -> Array[Passenger]:
	return TestDeboardingFixtures.manifest(cabin, count, seed_value, settings)


# Engine ------------------------------------------------------------------------
func test_engine_everyone_exits_without_passing() -> void:
	var cabin := AircraftDef.load_by_id("narrowbody_30")
	var ps := manifest(cabin, 160, 5)
	var sim := DeboardingSimulation.new()
	sim.setup(cabin, ps, {})
	var last_cell := {}
	var passed := false
	var overlap := false
	while not sim.is_complete() and sim.tick < 200000:
		sim.step()
		var seen := {}
		var previous := -1
		for p in sim.active:
			if seen.has(p.aisle_position): overlap = true
			seen[p.aisle_position] = true
			if p.aisle_position < previous: passed = true
			previous = p.aisle_position
			if last_cell.has(p.id) and p.aisle_position > last_cell[p.id]: passed = true
			last_cell[p.id] = p.aisle_position
	assert_true(sim.is_complete(), "everyone leaves")
	assert_eq(sim.exited.size(), 160)
	assert_true(not overlap, "one passenger per aisle cell")
	assert_true(not passed, "aisle order never changes; nobody moves away from the door")
	var exited := {}
	for id in sim.exited:
		assert_true(not exited.has(id), "exits once")
		exited[id] = true
	for p in ps: assert_eq(p.state, Passenger.State.EXITED)
	assert_true(sim.seat_occupied.is_empty())


func test_engine_is_deterministic_and_resumes_from_snapshot() -> void:
	var cabin := AircraftDef.load_by_id("a321_37")
	var runs: Array = []
	for interrupt in [false, true, false]:
		var ps := manifest(cabin, 200, 9)
		var sim := DeboardingSimulation.new()
		sim.setup(cabin, ps, {})
		for _i in 4000: sim.step()
		if interrupt:
			var data = JSON.parse_string(JSON.stringify(sim.snapshot()))
			var copies: Array[Passenger] = []
			for p in ps:
				var copy := Passenger.new()
				copy.restore_snapshot(JSON.parse_string(JSON.stringify(p.snapshot())))
				copies.append(copy)
			ps = copies
			sim = DeboardingSimulation.new()
			sim.restore(cabin, ps, AirportSimulation._integer_json(data))
		sim.run_to_completion()
		var exits: Array = []
		for p in ps: exits.append([p.id, p.exited_tick, p.caused_blocked_time])
		runs.append({"exits": exits, "result": sim.result()})
	assert_eq(JSON.stringify(runs[2]), JSON.stringify(runs[0]), "same inputs, same deboarding")
	assert_eq(JSON.stringify(runs[1]), JSON.stringify(runs[0]), "resumed engine diverged")


func test_front_rows_leave_first_and_bags_block_the_aisle() -> void:
	var cabin := AircraftDef.load_by_id("narrowbody_30")
	var ps := manifest(cabin, 150, 3)
	var sim := DeboardingSimulation.new()
	sim.setup(cabin, ps, {})
	sim.run_to_completion()
	var front := 0.0
	var rear := 0.0
	var nf := 0
	var nr := 0
	for p in ps:
		if p.seat_row <= 5: front += p.exited_tick; nf += 1
		elif p.seat_row >= 26: rear += p.exited_tick; nr += 1
	assert_lt(front / nf, rear / nr, "front rows are off first")
	assert_true(int(sim.result().blocked_ticks) > 0, "retrieving bags holds up people behind")


# Airport ------------------------------------------------------------------------
func test_passenger_identity_from_seat_to_airport_exit() -> void:
	var sim := fixture()
	var p: Passenger = inbound(sim)[0]
	var seat := p.seat_key()
	var states: Array = []
	var locations: Array = []
	for _i in 60000:
		sim.step()
		assert_true(is_same(p, sim.airport.passengers[str(p.id)]), "same object")
		if states.is_empty() or states[-1] != p.airport_state: states.append(p.airport_state)
		if not p.current_location.is_empty() and (locations.is_empty() or locations[-1] != p.current_location): locations.append(p.current_location)
		if p.airport_state == "left_airport": break
	assert_eq(states, ["on_aircraft", "deboarding", "walking_to_exit", "left_airport"])
	assert_eq(p.seat_key(), seat, "the seat they left from")
	assert_eq(locations[0], "A2", "enters the terminal at the gate")
	assert_eq(locations[-1], "airport_exit")
	assert_true(p.exited_tick > 0 and p.deplaned_airport_tick > 0 and p.left_airport_tick > p.deplaned_airport_tick)
	var kinds: Array = []
	for event in sim.events.history:
		if event.details.get("passenger_id", -1) == p.id: kinds.append(event.type)
	assert_eq(kinds, ["PASSENGER_DEPLANED", "PASSENGER_LEFT_AIRPORT"])


func test_everyone_deboards_and_is_never_in_two_places() -> void:
	var sim := fixture("A321")
	var f := flight(sim)
	var both := false
	while task(sim, Turnaround.DEBOARDING).status != TurnaroundTask.COMPLETE:
		sim.step()
		var session: FlightDeboarding = sim.deboarding_sessions.get("F002")
		if session == null: continue
		var out := {}
		for id in session.engine.exited: out[id] = true
		for p in inbound(sim):
			var in_terminal: bool = p.airport_state in ["walking_to_exit", "left_airport"]
			if in_terminal != out.has(p.id): both = true
			if in_terminal and (p.aisle_position >= 0 or session.engine.seat_occupied.has(p.seat_key())): both = true
	assert_true(not both, "cabin and terminal never share a passenger")
	assert_eq(f.deplaned_count, f.inbound_passenger_ids.size())
	run_until(sim, func(): return sim.passenger_flow.counts.get("walking_to_exit", 0) == 0)
	for p in inbound(sim): assert_eq(p.airport_state, "left_airport")
	assert_true(sim.deboarding_sessions.is_empty())


func test_cleaning_and_catering_wait_for_deboarding() -> void:
	var sim := fixture()
	run_until(sim, func(): return flight(sim).status == "departed")
	var deboarding := task(sim, Turnaround.DEBOARDING)
	for type in ["cleaning", "catering"]:
		assert_true(task(sim, type).start_tick > deboarding.finish_tick, type + " starts after the last passenger is off")
		assert_eq(task(sim, type).started_after, "deboarding")
	assert_eq(deboarding.finish_tick, flight(sim).deboarding_complete_tick)


func test_fueling_and_baggage_run_during_deboarding() -> void:
	var sim := fixture()
	run_until(sim, func(): return task(sim, Turnaround.DEBOARDING).status == TurnaroundTask.RUNNING and flight(sim).deplaned_count > 20)
	for type in ["fueling", "placeholder_baggage_service"]:
		assert_eq(task(sim, type).status, TurnaroundTask.RUNNING, type + " alongside deboarding")


func test_slow_deboarding_delays_turnaround_and_departure() -> void:
	var results := {}
	for label in ["normal", "slow"]:
		var sim := fixture("A321", {} if label == "normal" else {"door_interval_ticks": 240}, func(config):
			config.flights[0].scheduled_arrival = 12000)
		run_until(sim, func(): return flight(sim).status == "departed")
		results[label] = {"sim": sim, "f": flight(sim)}
	var normal: AirportFlight = results.normal.f
	var slow: AirportFlight = results.slow.f
	var ns: AirportSimulation = results.normal.sim
	var ss: AirportSimulation = results.slow.sim
	assert_lt(normal.deboarding_complete_tick, slow.deboarding_complete_tick)
	assert_lt(ns.turnaround.task(normal, "cleaning").start_tick, ss.turnaround.task(slow, "cleaning").start_tick, "delays cleaning")
	assert_lt(normal.boarding_open_tick, slow.boarding_open_tick, "delays boarding")
	assert_lt(normal.gate_release_tick, slow.gate_release_tick, "delays pushback")
	var late := slow.actual_departure - slow.scheduled_departure
	assert_true(late > 0, "real departure delay")
	assert_eq(sum(slow.departure_delay_breakdown), late, "additive")
	assert_true(int(slow.departure_delay_breakdown.get("deboarding", 0)) > 0, str(slow.departure_delay_breakdown))
	assert_true(not slow.departure_delay_breakdown.has("cleaning"), "cleaning took its planned time")


func test_slow_deboarding_off_the_critical_path_is_not_blamed() -> void:
	# Plenty of slack before D-30: slower deboarding changes nothing downstream.
	var baseline := fixture()
	run_until(baseline, func(): return flight(baseline).status == "departed")
	var slower := fixture("737", {"door_interval_ticks": 150})
	run_until(slower, func(): return flight(slower).status == "departed")
	assert_lt(task(baseline, Turnaround.DEBOARDING).finish_tick, task(slower, Turnaround.DEBOARDING).finish_tick, "deboarding was slower")
	assert_true(task(slower, Turnaround.DEBOARDING).finish_tick - task(slower, Turnaround.DEBOARDING).start_tick > task(slower, Turnaround.DEBOARDING).nominal_ticks, "and over plan")
	assert_eq(flight(slower).actual_departure, flight(baseline).actual_departure, "same departure")
	assert_true(not flight(slower).departure_delay_breakdown.has("deboarding"), "no false blame")


func test_late_inbound_shifts_deboarding_and_downstream() -> void:
	var rows: Array = []
	for arrival in [3000, 9000]:
		var sim := fixture("737", {}, func(config): config.flights[0].scheduled_arrival = arrival)
		run_until(sim, func(): return task(sim, "cleaning").status == TurnaroundTask.COMPLETE)
		rows.append({"dock": flight(sim).gate_arrival_tick, "deboard": task(sim, Turnaround.DEBOARDING).start_tick,
			"off": flight(sim).deboarding_complete_tick, "clean": task(sim, "cleaning").start_tick})
	var shift: int = rows[1].dock - rows[0].dock
	for key in ["deboard", "off", "clean"]: assert_eq(rows[1][key] - rows[0][key], shift, key + " shifts with the late arrival")


func test_save_mid_deboarding_resumes_identically() -> void:
	var outcomes: Array = []
	for interrupt in [false, true]:
		var sim := fixture("A321")
		run_until(sim, func(): return flight(sim).deplaned_count > 60)
		if interrupt:
			var restored := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot())))
			assert_true(restored != null, "mid-deboarding snapshot restores")
			if restored == null: return
			assert_eq(JSON.stringify(restored.snapshot()), JSON.stringify(sim.snapshot()), "exact round trip")
			sim = restored
		run_until(sim, func(): return flight(sim).status == "departed")
		var people: Array = []
		for p in inbound(sim): people.append([p.id, p.exited_tick, p.deplaned_airport_tick, p.airport_state, p.current_location, p.caused_blocked_time])
		var tasks := {}
		for t: TurnaroundTask in sim.turnaround.tasks_of(flight(sim)): tasks[t.type] = t.to_dict()
		outcomes.append({"people": people, "tasks": tasks, "result": flight(sim).deboarding_result,
			"departure": flight(sim).actual_departure, "breakdown": flight(sim).departure_delay_breakdown, "events": sim.events.history})
	assert_eq(JSON.stringify(outcomes[1]), JSON.stringify(outcomes[0]), "resumed run diverged")


func test_tampered_deboarding_saves_rejected() -> void:
	var sim := fixture()
	run_until(sim, func(): return flight(sim).deplaned_count > 30)
	var good: Dictionary = JSON.parse_string(JSON.stringify(sim.snapshot()))
	var cases := {
		"v4 save": func(d): d.version = 4,
		"session missing": func(d): d.deboarding.erase("F002"),
		"engine tick off by one": func(d): d.deboarding.F002.engine.tick += 1,
		"exited passenger still deboarding": func(d): d.airport.passengers[str(int(d.deboarding.F002.engine.exited[0]))].airport_state = "deboarding",
		"passenger in two places": func(d): d.deboarding.F002.engine.exited.append(d.deboarding.F002.engine.active[0]),
	}
	for label in cases:
		var bad: Dictionary = good.duplicate(true)
		cases[label].call(bad)
		assert_eq(AirportSimulation.from_snapshot(bad), null, label)


func test_widebody_deboarding_abstraction() -> void:
	var sim := fixture("787")
	var f := flight(sim)
	run_until(sim, func(): return task(sim, Turnaround.DEBOARDING).status == TurnaroundTask.RUNNING)
	assert_true(sim.deboarding_sessions.is_empty(), "no cabin engine for widebodies")
	for p in inbound(sim): assert_eq(p.airport_state, "deboarding")
	var t := task(sim, Turnaround.DEBOARDING)
	run_until(sim, func(): return t.status == TurnaroundTask.COMPLETE)
	assert_eq(t.finish_tick, t.start_tick + t.duration_ticks, "placeholder duration")
	for p in inbound(sim):
		assert_eq(p.airport_state, "walking_to_exit")
		assert_eq(p.deplaned_airport_tick, t.finish_tick)
		assert_eq(p.exited_tick, -1, "never aisle-simulated")
	var events := sim.events.history.filter(func(e): return e.type == "DEBOARDING_STARTED")
	assert_eq(events[0].details.mode, "widebody_deboarding_abstraction")
	assert_eq(f.deplaned_count, f.inbound_passenger_ids.size())


func test_full_morning_every_arrival_leaves_the_airport() -> void:
	var sim := AirportSimulation.new()
	sim.setup()
	sim.advance(int(sim.config.flights[-1].scheduled_departure) - sim.clock.tick + 30000)
	var arriving := 0
	for f: AirportFlight in sim.flight_order:
		assert_eq(f.deplaned_count, f.inbound_passenger_ids.size(), f.id)
		assert_eq(sum(f.departure_delay_breakdown), maxi(0, f.actual_departure - f.scheduled_departure), f.id)
		for p in sim._inbound(f):
			arriving += 1
			# Local arrivals leave the airport; connectors (M6) fly on or are stranded.
			var endpoints: Array = ["left_airport"] if p.journey_direction == "arriving" else ["departed", "missed_connection"]
			assert_true(p.airport_state in endpoints, "P%d ended %s" % [p.id, p.airport_state])
	assert_true(arriving > 3000, "a full morning of arrivals: %d" % arriving)
	# Demo flight SJ 235 has a slow jet bridge door: deboarding shows up in its explanation.
	assert_true(int(sim.airport.flights.F003.departure_delay_breakdown.get("deboarding", 0)) > 0, str(sim.airport.flights.F003.departure_delay_breakdown))
