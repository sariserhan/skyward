extends TestCase
## M3: terminal passengers board through the preserved boarding engine and
## departures depend on boarding. See docs/m3-plan.md §8 (T1–T15).

const D := 40000


## One flight with a fast terminal, so boarding and gate-close timing dominate.
## Passengers reach the gate well before boarding opens (D-30 = 22000).
func fixture(aircraft := "737", load := 900, late := 0, strategy := "random", edit := Callable()) -> AirportSimulation:
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.start_tick = 0
	config.turnaround.variation_permille = 0
	var f: Dictionary = config.flights[1].duplicate(true)
	f.aircraft_type = aircraft
	f.scheduled_arrival = 3000
	f.scheduled_departure = D
	f.assigned_gate_id = "A7" if aircraft == "787" else "A2"
	f.load_permille = load
	f.late_passengers = late
	f.boarding_strategy = strategy
	config.flights = [f]
	var flow: Dictionary = config.passenger_flow
	# Earlier-milestone fixtures: no connecting itineraries (M6 tests opt in).
	flow.erase("connections")
	flow.arrival_lead_min_ticks = 30000
	flow.arrival_lead_max_ticks = 34000
	flow.check_in_ticks = 1
	for edge in flow.graph.edges: edge.walking_ticks = 20
	for cp in flow.checkpoints:
		cp.open_lanes = 3
		cp.staff = 3
		cp.service_ticks = 20
	if edit.is_valid(): edit.call(config)
	var sim := AirportSimulation.new()
	sim.setup(config)
	return sim


func flight(sim: AirportSimulation, id := "F002") -> AirportFlight:
	return sim.airport.flights[id]


func run_until(sim: AirportSimulation, predicate: Callable, limit := 80000) -> void:
	for _i in limit:
		if predicate.call(): return
		sim.step()


func count_state(sim: AirportSimulation, state: String) -> int:
	var n := 0
	for p: Passenger in sim.airport.passengers.values():
		if p.airport_state == state: n += 1
	return n


# T1 ---------------------------------------------------------------------------
func test_full_lifecycle_same_passenger_object() -> void:
	var sim := fixture("737", 900)
	var f := flight(sim)
	var p: Passenger = sim.airport.passengers[str(f.passenger_ids[0])]
	var seen := {}
	for _i in 60000:
		sim.step()
		seen[p.airport_state] = true
		assert_true(is_same(p, sim.airport.passengers[str(p.id)]), "same object")
		if f.status == "departed": break
	for state in ["walking_to_gate", "waiting_at_gate", "boarding", "on_aircraft", "departed"]:
		assert_true(seen.has(state), "journey passed through " + state)
	assert_eq(p.state, Passenger.State.SEATED, "cabin layer ends seated")
	assert_true(p.seated_airport_tick >= p.boarding_admit_tick and p.boarding_admit_tick >= f.boarding_open_tick)
	assert_true(p.boarding_admit_tick >= p.gate_arrival_time)
	var order: Array = []
	for event in sim.events.history:
		if event.details.get("passenger_id", -1) == p.id: order.append(event.type)
	assert_eq(order.slice(-3), ["PASSENGER_GATE_ARRIVE", "PASSENGER_BOARDING", "PASSENGER_ON_AIRCRAFT"])
	assert_eq(count_state(sim, "departed"), f.passenger_ids.size())
	assert_eq(f.boarded_count, f.passenger_ids.size())
	assert_true(f.gate_release_tick > f.boarding_complete_tick, "pushback waits for boarding")


# T2 ---------------------------------------------------------------------------
func test_slow_boarding_delays_departure() -> void:
	var results := {}
	for label in ["light", "heavy"]:
		var stow := 0 if label == "light" else 700
		var sim := fixture("A321", 950, 0, "random", func(config):
			config.boarding["sim_config_overrides"] = {"stow_base_ticks": stow, "stow_per_bag_ticks": stow, "stow_variation_ticks": 0})
		var f := flight(sim)
		run_until(sim, func(): return f.status == "departed")
		results[label] = f
	var light: AirportFlight = results.light
	var heavy: AirportFlight = results.heavy
	assert_lt(light.boarding_complete_tick, heavy.boarding_complete_tick, "carry-ons lengthen boarding")
	assert_lt(light.actual_departure, heavy.actual_departure, "and the departure")
	assert_eq(int(light.delay_reasons.get("boarding", 0)), 0, "light flight on time")
	assert_true(int(heavy.delay_reasons.get("boarding", 0)) > 0, "boarding cause recorded")
	assert_true(heavy.actual_departure > D, "real departure delay")
	assert_true(int(heavy.boarding_result.stow_ticks) > int(light.boarding_result.stow_ticks))


# T3 ---------------------------------------------------------------------------
func test_boarding_strategy_changes_boarding_time() -> void:
	var durations := {}
	for strategy in ["window_middle_aisle", "random", "front_to_back"]:
		var sim := fixture("737", 900, 0, strategy)
		var f := flight(sim)
		run_until(sim, func(): return f.status == "taxiing_out")
		assert_eq(f.boarded_count, f.passenger_ids.size(), "everyone was at the gate")
		durations[strategy] = f.last_seated_tick - f.boarding_open_tick
		# Boarding tick k falls in airport tick open + ceil(k / 3) - 1 (D-015).
		assert_eq((int(f.boarding_result.last_seated_tick) + 2) / 3 - 1, durations[strategy], "airport and boarding clocks agree")
	assert_lt(durations.window_middle_aisle, durations.random, str(durations))
	assert_lt(durations.random, durations.front_to_back, str(durations))


# T4 ---------------------------------------------------------------------------
func test_passenger_in_security_never_boards() -> void:
	# Late passengers arrive at the original close; a hold keeps the gate open
	# while security is shut, so they are physically stuck when it finally closes.
	var sim := fixture("737", 900, 3)
	var f := flight(sim)
	run_until(sim, func(): return f.boarding_phase == "open" and sim.clock.tick >= f.boarding_open_tick + 100)
	assert_true(sim.hold_flight("F002"))
	for id in sim.airport.security_checkpoints: sim.set_security(id, 0, 0)
	run_until(sim, func(): return f.boarding_phase == "closed")
	var stuck: Array = []
	for p in sim._manifest(f):
		if p.airport_state == "security_queue": stuck.append(p)
	assert_eq(stuck.size(), 3, "late passengers are held at closed security")
	for p in stuck:
		assert_eq(p.missed_flight_id, f.id)
		assert_eq(p.missed_reason, "security_queue")
		assert_eq(p.boarding_admit_tick, -1, "never entered the engine")
		assert_eq(p.state, Passenger.State.WAITING)
	run_until(sim, func(): return f.status == "departed")
	assert_eq(f.boarded_count + f.missed_count, f.passenger_ids.size())
	assert_eq(f.missed_count, 3)
	assert_eq(int(f.boarding_result.admitted), f.passenger_ids.size() - 3)
	for id in sim.airport.security_checkpoints: sim.set_security(id, 3, 3)
	sim.advance(2000)
	for p in stuck: assert_eq(p.airport_state, "missed_flight", "walks to the closed gate, does not teleport")
	var missed_events := 0
	for event in sim.events.history:
		if event.type == "PASSENGER_MISSED_FLIGHT": missed_events += 1
	assert_eq(missed_events, 3)


# T5 / T6 ------------------------------------------------------------------------
func test_hold_lets_late_passengers_board_and_costs_delay() -> void:
	var base := fixture("737", 900, 2)
	var bf := flight(base)
	run_until(base, func(): return bf.status == "departed")
	assert_eq(bf.missed_count, 2, "without a hold the late passengers miss")
	assert_eq(bf.hold_ticks, 0, "no automatic hold")
	var held := fixture("737", 900, 2)
	var hf := flight(held)
	run_until(held, func(): return hf.boarding_phase == "open" and held.clock.tick >= hf.gate_close_tick - 600)
	assert_eq(held.boarding_alerts().size(), 1, "alert before close")
	assert_true(held.hold_flight("F002"))
	run_until(held, func(): return hf.status == "departed")
	assert_eq(hf.missed_count, 0, "late arrivals board during the hold")
	assert_eq(hf.boarded_count, hf.passenger_ids.size())
	# Once the stragglers are seated the gate closes early; only the hold used counts.
	assert_true(hf.hold_ticks > 0 and hf.hold_ticks < 3000, "unused hold cancelled: %d" % hf.hold_ticks)
	assert_eq(hf.gate_closed_tick, D - 6000 + hf.hold_ticks)
	assert_eq(int(hf.delay_reasons.get("passenger_hold", 0)), hf.hold_ticks)
	assert_eq(hf.actual_departure - bf.actual_departure, hf.hold_ticks, "hold delays the departure by the time used")


func test_hold_limit_and_early_close() -> void:
	var sim := fixture("737", 900, 2)
	var f := flight(sim)
	assert_true(not sim.hold_flight("F002"), "no hold before boarding opens")
	run_until(sim, func(): return f.boarding_phase == "open")
	var planned_close := f.gate_close_tick
	for i in 3: assert_true(sim.hold_flight("F002"), "hold %d" % i)
	# Keep the late passengers out so the gate stays open for the player to close.
	for id in sim.airport.security_checkpoints: sim.set_security(id, 0, 0)
	assert_true(not sim.hold_flight("F002"), "max_hold_ticks enforced")
	assert_eq(f.gate_close_tick, planned_close + 9000)
	run_until(sim, func(): return sim.clock.tick >= planned_close + 1000)
	assert_true(sim.close_gate("F002"))
	assert_eq(f.hold_ticks, 1000, "unused hold cancelled")
	assert_eq(f.departure_target_tick, D + 1000)
	assert_true(not sim.close_gate("F002"), "already closed")
	run_until(sim, func(): return f.status == "departed")
	assert_eq(f.boarded_count + f.missed_count, f.passenger_ids.size())


func test_hold_cascades_to_next_flight_at_gate() -> void:
	var waits := []
	for hold in [false, true]:
		var sim := fixture("737", 900, 2, "random", func(config):
			var next: Dictionary = config.flights[0].duplicate(true)
			next.id = "F100"
			next.flight_number = "NS 900"
			next.scheduled_arrival = D - 2000
			next.scheduled_departure = D + 30000
			next.load_permille = 0
			config.flights.append(next))
		var f := flight(sim)
		if hold:
			run_until(sim, func(): return f.boarding_phase == "open")
			sim.hold_flight("F002")
			sim.hold_flight("F002")
			# Stragglers never make it, so the held gate stays open for the full hold.
			for id in sim.airport.security_checkpoints: sim.set_security(id, 0, 0)
		run_until(sim, func(): return flight(sim, "F100").status == "departed")
		waits.append(int(flight(sim, "F100").delay_reasons.get("gate_wait", 0)))
	assert_lt(waits[0] + 3000, waits[1], "held gate delays the next arrival: %s" % str(waits))


# T7 ---------------------------------------------------------------------------
func test_gate_change_before_boarding_and_lock_during_boarding() -> void:
	# Aircraft arrives later than its passengers, so the gate can still change.
	var sim := fixture("737", 900, 0, "random", func(config): config.flights[0].scheduled_arrival = 10000)
	var f := flight(sim)
	run_until(sim, func(): return sim.passenger_flow.ready_by_flight.F002 > 50)
	assert_true(f.status in ["scheduled", "approaching"], f.status)
	assert_true(sim.assign_gate("F002", "A3").ok)
	run_until(sim, func(): return f.boarding_phase == "open")
	assert_eq(sim.assign_gate("F002", "A4").warnings, ["Gate locked during boarding"])
	run_until(sim, func(): return f.status == "departed")
	assert_eq(f.boarded_count, f.passenger_ids.size())
	for p in sim._manifest(f):
		assert_eq(p.current_location, "A3", "boarded from the reassigned gate")


# T8 ---------------------------------------------------------------------------
func test_same_seed_and_decisions_reproduce_everything() -> void:
	var runs: Array = []
	for chunk in [1, 997]:
		var sim := fixture("737", 900, 2)
		var f := flight(sim)
		sim.set_boarding_strategy("F002", "back_to_front")
		sim.advance(12000)
		sim.set_security("west", 1, 1)
		run_until(sim, func(): return f.boarding_phase == "open")
		sim.hold_flight("F002")
		while f.status != "departed":
			sim.advance(chunk)
		# Pacing differs only in how far past takeoff each run stopped.
		var events: Array = sim.events.history.filter(func(e): return int(e.tick) <= f.actual_departure)
		runs.append({"events": events, "result": f.boarding_result, "decisions": sim.decisions})
	assert_eq(JSON.stringify(runs[1]), JSON.stringify(runs[0]))


# T9 ---------------------------------------------------------------------------
func test_full_morning_no_duplicate_or_lost_passengers() -> void:
	var sim := AirportSimulation.new()
	sim.setup()
	sim.advance(int(sim.config.flights[-1].scheduled_departure) - sim.clock.tick + 30000)
	var on_board := {}
	for event in sim.events.history:
		if event.type == "PASSENGER_ON_AIRCRAFT":
			var id: int = event.details.passenger_id
			assert_true(not on_board.has(id), "boarded twice: %d" % id)
			on_board[id] = event.flight_id
	for f: AirportFlight in sim.flight_order:
		assert_eq(f.status, "departed", f.id)
		assert_eq(f.boarded_count + f.missed_count, f.passenger_ids.size(), f.id)
		var seats := {}
		for p in sim._manifest(f):
			assert_eq(p.current_flight_id, f.id)
			if p.airport_state == "departed":
				assert_eq(on_board.get(p.id), f.id)
				if f.boarding_mode == "cabin":
					assert_true(not seats.has(p.seat_key()), "seat %s twice on %s" % [p.seat_key(), f.id])
					seats[p.seat_key()] = true
			else:
				assert_true(not on_board.has(p.id), "missed passenger never boarded")
				assert_eq(p.missed_flight_id, f.id)
	assert_true(sim.boarding_sessions.is_empty())


# T10 --------------------------------------------------------------------------
## D-021: saving halfway through boarding and resuming must match uninterrupted
## play exactly: seating, completion time, blame, missed passengers, departure.
func test_save_mid_boarding_resumes_identically() -> void:
	var outcomes: Array = []
	for interrupt in [false, true]:
		var sim := fixture("A321", 950, 2, "window_middle_aisle")
		var f := flight(sim)
		run_until(sim, func(): return f.boarding_phase == "open" and sim.boarding_sessions.F002.engine.seated_count > 60)
		sim.hold_flight("F002")
		if interrupt:
			var data = JSON.parse_string(JSON.stringify(sim.snapshot()))
			var restored := AirportSimulation.from_snapshot(data)
			assert_true(restored != null, "mid-boarding snapshot restores")
			if restored == null: return
			assert_eq(JSON.stringify(restored.snapshot()), JSON.stringify(sim.snapshot()), "exact round trip")
			sim = restored
			f = flight(sim)
		run_until(sim, func(): return f.status == "departed")
		var seating: Array = []
		for p in sim._manifest(f):
			seating.append([p.id, p.seat_key(), p.airport_state, p.seated_airport_tick, p.seated_tick, p.caused_blocked_time, p.missed_reason])
		outcomes.append({"seating": seating, "complete": f.boarding_complete_tick, "result": f.boarding_result,
			"missed": f.missed_count, "departure": f.actual_departure, "delays": f.delay_reasons, "events": sim.events.history})
	assert_eq(JSON.stringify(outcomes[1]), JSON.stringify(outcomes[0]), "resumed run diverged")


func test_save_file_during_boarding_and_rejections() -> void:
	var sim := fixture("737", 900)
	var f := flight(sim)
	run_until(sim, func(): return f.boarding_phase == "open" and sim.boarding_sessions.F002.engine.seated_count > 20)
	var path := "user://boarding_test.json"
	assert_eq(sim.save_file(path), OK, "saving is allowed during boarding")
	var loaded := AirportSimulation.load_file(path)
	assert_true(loaded != null and loaded.boarding_sessions.has("F002"))
	DirAccess.remove_absolute(path)
	var good: Dictionary = JSON.parse_string(JSON.stringify(sim.snapshot()))
	var cases := {
		"v2 save": func(d): d.version = 2,
		"engine tick off by one": func(d): d.boarding.F002.engine.tick += 1,
		"duplicate queue entry": func(d): d.boarding.F002.engine.queue.append(d.boarding.F002.engine.queue[0]),
		"missing session": func(d): d.boarding.erase("F002"),
		"engine tick rate not 3 × airport": func(d): d.boarding.F002.engine.config.tick_rate = 25,
		"seat under wrong passenger": func(d):
			var seats: Dictionary = d.boarding.F002.engine.seat_occupied
			var keys := seats.keys()
			var first = seats[keys[0]]
			seats[keys[0]] = seats[keys[1]]
			seats[keys[1]] = first,
		"journey/cabin mismatch": func(d):
			var id := str(int(d.boarding.F002.engine.queue[-1]))
			d.airport.passengers[id].airport_state = "waiting_at_gate",
	}
	for label in cases:
		var bad: Dictionary = good.duplicate(true)
		cases[label].call(bad)
		assert_eq(AirportSimulation.from_snapshot(bad), null, label)


# T11 --------------------------------------------------------------------------
func test_three_boarding_ticks_per_airport_tick() -> void:
	var sim := fixture("737", 900)
	var f := flight(sim)
	run_until(sim, func(): return f.boarding_phase == "open")
	var engine: Simulation = sim.boarding_sessions.F002.engine
	for _i in 500:
		assert_eq(engine.tick, 3 * (sim.clock.tick - f.boarding_open_tick + 1))
		sim.step()
	assert_eq(sim.cabin_config.tick_rate, 3 * AirportClock.TICKS_PER_SECOND)


# T14 --------------------------------------------------------------------------
func test_widebody_boarding_abstraction() -> void:
	var sim := fixture("787", 900, 2)
	var f := flight(sim)
	assert_eq(f.boarding_mode, "placeholder")
	run_until(sim, func(): return f.boarding_phase == "open")
	assert_true(sim.boarding_sessions.is_empty(), "no cabin engine for widebodies")
	var at_gate: int = sim.passenger_flow.ready_by_flight.F002
	run_until(sim, func(): return f.boarding_phase in ["closed", "complete"])
	assert_eq(f.gate_closed_tick, D - 6000, "D-10 close applies")
	assert_eq(f.boarded_count, at_gate)
	assert_eq(f.missed_count, 2)
	run_until(sim, func(): return f.status == "departed")
	assert_eq(count_state(sim, "departed"), f.passenger_ids.size() - 2)
	assert_true(f.gate_release_tick >= f.gate_closed_tick)


# T15 --------------------------------------------------------------------------
func test_cabin_definitions_and_seat_assignment() -> void:
	var a220 := AircraftDef.load_by_id("a220_26")
	assert_eq(a220.capacity(), 130)
	assert_eq(a220.seat_type_of("A"), Passenger.SeatType.WINDOW)
	assert_eq(a220.seat_type_of("B"), Passenger.SeatType.AISLE)
	assert_eq(a220.seat_type_of("D"), Passenger.SeatType.MIDDLE)
	assert_eq(a220.seats_between_aisle("E"), ["C", "D"])
	assert_eq(AircraftDef.load_by_id("a321_37").capacity(), 222)
	var sim := fixture("A321", 1000)
	var f := flight(sim)
	assert_eq(f.passenger_ids.size(), 220, "220 seats sold on a 222-seat cabin")
	var seats := {}
	for p in sim._manifest(f):
		assert_true(p.seat_row >= 1 and p.seat_row <= 37 and not seats.has(p.seat_key()))
		seats[p.seat_key()] = true
		var per_cell := sim.cabin_config.walk_ticks_per_cell
		assert_eq(p.walk_ticks_per_cell, maxi(1, (per_cell * 1000 + p.walking_speed / 2) / p.walking_speed))
		assert_eq(p.luggage_stow_duration > 0, p.carry_on_count > 0)


func test_late_aircraft_opens_boarding_on_service_tick() -> void:
	# Service ends after D-30: the window shifts and the engine clock stays exact.
	var sim := fixture("737", 900, 0, "random", func(config): config.flights[0].scheduled_arrival = 20000)
	var f := flight(sim)
	run_until(sim, func(): return f.boarding_phase == "open")
	assert_eq(f.boarding_open_tick, f.service_ready_tick, "opens as soon as service is done")
	assert_true(f.departure_target_tick > D, "departure target shifted")
	assert_eq(f.gate_close_tick, f.departure_target_tick - 6000)
	sim.step()
	assert_eq(sim.boarding_sessions.F002.engine.tick, 3 * (sim.clock.tick - f.boarding_open_tick + 1))
	assert_true(AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot()))) != null, "savable")


# Early completion ---------------------------------------------------------------
func test_everyone_aboard_closes_gate_early() -> void:
	var sim := fixture("737", 900, 0, "window_middle_aisle")
	var f := flight(sim)
	run_until(sim, func(): return f.status == "departed")
	assert_eq(f.missed_count, 0)
	assert_lt(f.gate_closed_tick, D - 6000, "no waiting for D-10 once the whole manifest is aboard")
	assert_eq(f.gate_closed_tick, f.last_seated_tick, "closes as the last passenger sits")
	assert_eq(f.boarding_complete_tick, f.gate_closed_tick)
	var closes := sim.events.history.filter(func(e): return e.type == "GATE_CLOSED")
	assert_eq(closes[0].details.by, "all_aboard")
	var exit_time := int(sim.config.taxi_out_ticks) + int(sim.config.takeoff_ticks)
	assert_eq(f.gate_release_tick, D - exit_time, "on-time flight still pushes back on schedule, never early")
	assert_true(not f.delay_reasons.has("boarding") and not f.delay_reasons.has("passenger_hold"))


func test_missing_passenger_keeps_scheduled_close_and_hold_decision() -> void:
	var sim := fixture("737", 900, 1)
	var f := flight(sim)
	run_until(sim, func(): return f.boarding_phase == "open" and sim.clock.tick >= f.gate_close_tick - 600)
	assert_true(sim.boarding_alerts().size() == 1 and sim.can_hold("F002"), "player still gets the hold decision")
	run_until(sim, func(): return f.boarding_phase != "open")
	assert_eq(f.gate_closed_tick, D - 6000, "D-10 close while someone is missing")
	var closes := sim.events.history.filter(func(e): return e.type == "GATE_CLOSED")
	assert_eq(closes[0].details.by, "scheduled")
	assert_eq(f.missed_count, 1)


func test_efficient_boarding_recovers_late_aircraft_delay() -> void:
	# Service ends 7 min before D, so boarding itself decides when it leaves.
	var departures := {}
	for strategy in ["window_middle_aisle", "front_to_back"]:
		var sim := fixture("737", 900, 0, strategy, func(config): config.flights[0].scheduled_arrival = 25000)
		var f := flight(sim)
		run_until(sim, func(): return f.status == "departed")
		assert_eq(f.missed_count, 0)
		if strategy == "window_middle_aisle":
			assert_lt(f.actual_departure, f.departure_target_tick, "left before its shifted window ended")
		departures[strategy] = f.actual_departure
	assert_lt(departures.window_middle_aisle, departures.front_to_back, "faster boarding, earlier departure: %s" % str(departures))


func test_widebody_closes_when_everyone_is_at_gate() -> void:
	var sim := fixture("787", 900)
	var f := flight(sim)
	run_until(sim, func(): return f.status == "taxiing_out")
	assert_eq(f.gate_closed_tick, f.boarding_open_tick, "everyone was waiting: abstraction boards at open")
	assert_eq(f.boarded_count, f.passenger_ids.size())
