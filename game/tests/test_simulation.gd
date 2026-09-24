extends TestCase
## Spec §28 tests, minus the deadlock sweep which lives in test_deadlock.gd.


func test_determinism_same_inputs_same_result() -> void:
	var sc := full_flight()
	var results: Array[int] = []
	for _i in 3:
		var sim := sc.build_simulation(strategy("random"))
		sim.run_to_completion()
		results.append(sim.tick)
	assert_eq(results[0], results[1], "run 1 vs 2")
	assert_eq(results[1], results[2], "run 2 vs 3")


func test_determinism_manifest_identical() -> void:
	var sc := full_flight()
	var a := sc.build_simulation(strategy("random"))
	var b := sc.build_simulation(strategy("random"))
	for i in a.passengers.size():
		assert_eq(a.passengers[i].to_dict(), b.passengers[i].to_dict(), "passenger %d" % i)


func test_different_seed_different_manifest() -> void:
	var sc := full_flight()
	var a := sc.build_simulation(strategy("random"), 1)
	var b := sc.build_simulation(strategy("random"), 2)
	var differ := false
	for i in a.passengers.size():
		if a.passengers[i].to_dict() != b.passengers[i].to_dict():
			differ = true
			break
	assert_true(differ, "seeds 1 and 2 should produce different manifests")


func test_full_boarding_all_seated() -> void:
	var sim := full_flight().build_simulation(strategy("random"))
	sim.run_to_completion()
	assert_true(sim.is_complete(), "simulation completed")
	for p in sim.passengers:
		assert_eq(p.state, Passenger.State.SEATED, "passenger %d seated" % p.id)
	assert_eq(sim.aisle_occupancy(), 0, "aisle empty at end")
	for cell in sim.aisle:
		assert_eq(cell, -1, "aisle cell empty")


func test_no_duplicate_seats() -> void:
	for count in [60, 120, 180]:
		var sc := full_flight()
		sc.passenger_count = count
		var sim := sc.build_simulation(strategy("random"))
		var seen := {}
		for p in sim.passengers:
			assert_true(not seen.has(p.seat_key()), "duplicate seat %s" % p.seat_key())
			seen[p.seat_key()] = true
		assert_eq(seen.size(), count, "seat count for %d" % count)


func test_no_lost_passengers() -> void:
	var sim := full_flight().build_simulation(strategy("back_to_front"))
	var before := sim.passengers.size()
	sim.run_to_completion()
	assert_eq(sim.passengers.size(), before, "passenger array size")
	assert_eq(sim.seated_count, before, "seated count")
	assert_eq(sim.seat_occupied.size(), before, "occupied seat count")


func test_strategy_coverage_every_passenger_queued() -> void:
	for id in BoardingStrategy.PRESET_IDS:
		var sim := full_flight().build_simulation(strategy(id))
		var seen := {}
		for p in sim.passengers:
			assert_true(p.queue_position >= 0, "%s: passenger %d has queue position" % [id, p.id])
			assert_true(p.boarding_group >= 0, "%s: passenger %d has group" % [id, p.id])
			assert_true(not seen.has(p.queue_position), "%s: duplicate queue position" % id)
			seen[p.queue_position] = true
		assert_eq(sim.queue.size(), sim.passengers.size(), "%s: queue length" % id)


func test_playback_independence_is_tick_based() -> void:
	# Playback speed is a renderer concern: the engine only exposes step().
	# Verify that stepping in different batch sizes yields the same result.
	var sc := full_flight()
	var a := sc.build_simulation(strategy("window_middle_aisle"))
	var b := sc.build_simulation(strategy("window_middle_aisle"))
	while not a.is_complete():
		a.step()
	while not b.is_complete():
		for _i in 8:
			b.step()
	assert_eq(a.tick, b.tick, "1x vs 8x batches")


func test_strategies_produce_different_outcomes() -> void:
	var sc := full_flight()
	var times := {}
	for id in BoardingStrategy.PRESET_IDS:
		var sim := sc.build_simulation(strategy(id))
		sim.run_to_completion()
		times[id] = sim.tick
	print("      strategy times (ticks): %s" % str(times))
	assert_ne(times["random"], times["back_to_front"])
	assert_ne(times["random"], times["front_to_back"])
	assert_ne(times["random"], times["window_middle_aisle"])
	# Well-established qualitative ordering for single-aisle boarding.
	assert_lt(times["window_middle_aisle"], times["random"], "WMA beats random")
	assert_lt(times["random"], times["front_to_back"], "random beats front-to-back")


func test_seat_interference_blocks_aisle() -> void:
	# Two passengers in row 5: aisle seat C boards first, then window seat A.
	# A must wait in the aisle cell for the obstruction delay while a third
	# passenger behind them is blocked.
	var aircraft := AircraftDef.load_by_id("narrowbody_30")
	var config := SimConfig.load_default()
	var ps: Array[Passenger] = []
	ps.append(_mk(1, 5, "C", aircraft, config))
	ps.append(_mk(2, 5, "A", aircraft, config))
	ps.append(_mk(3, 9, "D", aircraft, config))
	var strat := BoardingStrategy.make_custom([
		_g("first", 5, 5, [Passenger.SeatType.AISLE]),
		_g("second", 5, 5, [Passenger.SeatType.WINDOW]),
		_g("third", 9, 9, []),
	])
	var sim := Simulation.new()
	sim.setup(aircraft, ps, strat, config, 1)
	var p2 := sim.passenger_by_id(2)
	var p3 := sim.passenger_by_id(3)
	var saw_wait := false
	var saw_p3_blocked_behind := false
	while not sim.is_complete():
		sim.step()
		if p2.state == Passenger.State.WAITING_FOR_SEAT:
			saw_wait = true
			assert_eq(p2.aisle_position, 5, "window passenger holds row cell while waiting")
			if p3.state == Passenger.State.BLOCKED and p3.aisle_position == 4:
				saw_p3_blocked_behind = true
	assert_true(saw_wait, "window passenger entered WAITING_FOR_SEAT")
	assert_eq(p2.obstruction_count, 1, "one obstructer (aisle seat)")
	assert_eq(p2.total_seat_wait_time, config.seat_per_obstructer_ticks, "wait equals per-obstructer ticks")
	assert_true(saw_p3_blocked_behind, "passenger behind was blocked in cell 4")
	assert_true(p3.total_blocked_time > 0, "passenger behind accumulated blocked time")


func test_two_obstructers_double_wait() -> void:
	var aircraft := AircraftDef.load_by_id("narrowbody_30")
	var config := SimConfig.load_default()
	var ps: Array[Passenger] = []
	ps.append(_mk(1, 3, "D", aircraft, config))
	ps.append(_mk(2, 3, "E", aircraft, config))
	ps.append(_mk(3, 3, "F", aircraft, config))
	var strat := BoardingStrategy.make_custom([
		_g("aisle", 3, 3, [Passenger.SeatType.AISLE]),
		_g("middle", 3, 3, [Passenger.SeatType.MIDDLE]),
		_g("window", 3, 3, [Passenger.SeatType.WINDOW]),
	])
	var sim := Simulation.new()
	sim.setup(aircraft, ps, strat, config, 1)
	sim.run_to_completion()
	assert_eq(sim.passenger_by_id(1).obstruction_count, 0)
	assert_eq(sim.passenger_by_id(2).obstruction_count, 1)
	assert_eq(sim.passenger_by_id(3).obstruction_count, 2)
	assert_eq(sim.passenger_by_id(3).total_seat_wait_time, 2 * config.seat_per_obstructer_ticks)


func test_stowing_blocks_aisle() -> void:
	var aircraft := AircraftDef.load_by_id("narrowbody_30")
	var config := SimConfig.load_default()
	var ps: Array[Passenger] = []
	var a := _mk(1, 4, "C", aircraft, config)
	a.carry_on_count = 2
	a.luggage_stow_duration = 200
	ps.append(a)
	ps.append(_mk(2, 10, "C", aircraft, config))
	var strat := BoardingStrategy.make_custom([_g("a", 4, 4, []), _g("b", 10, 10, [])])
	var sim := Simulation.new()
	sim.setup(aircraft, ps, strat, config, 1)
	sim.run_to_completion()
	assert_eq(a.total_stow_time, 200, "stow time consumed")
	assert_true(sim.passenger_by_id(2).total_blocked_time > 0, "follower blocked by stowing passenger")


func test_custom_strategy_unassigned_group() -> void:
	var sc := full_flight()
	var strat := BoardingStrategy.make_custom([_g("Only rows 1-10", 1, 10, [])])
	var sim := sc.build_simulation(strat)
	assert_true(strat.unassigned_count > 0, "unassigned passengers detected")
	assert_eq(strat.groups.back().name, BoardingStrategy.UNASSIGNED_NAME, "UNASSIGNED appended last")
	assert_eq(sim.warnings.size(), 1, "one warning raised")
	for p in sim.passengers:
		assert_true(p.queue_position >= 0, "every passenger queued")
	sim.run_to_completion()
	assert_true(sim.is_complete())


func test_entry_is_rate_limited() -> void:
	var sim := full_flight().build_simulation(strategy("random"))
	var last_entry := -1000
	var min_gap := 1_000_000
	# Avoid capturing `sim` in the lambda (reference cycle); read tick via the passenger.
	var cb := func(p: Passenger):
		if last_entry >= 0:
			min_gap = mini(min_gap, p.entered_tick - last_entry)
		last_entry = p.entered_tick
	sim.passenger_entered.connect(cb)
	sim.run_to_completion()
	sim.passenger_entered.disconnect(cb)
	assert_true(min_gap >= sim.config.entry_interval_ticks, "min gap %d >= %d" % [min_gap, sim.config.entry_interval_ticks])


func test_no_passing_in_aisle() -> void:
	# Order of passengers in the aisle must equal their entry order at all times.
	var sim := full_flight().build_simulation(strategy("random"))
	var ok := true
	while not sim.is_complete() and ok:
		sim.step()
		for i in range(1, sim.active.size()):
			if sim.active[i].aisle_position >= sim.active[i - 1].aisle_position:
				ok = false
				break
		# Aisle array and active list must agree.
		for p in sim.active:
			if sim.aisle[p.aisle_position] != p.id:
				ok = false
	assert_true(ok, "aisle ordering invariant held")


func test_result_totals_consistent() -> void:
	var sim := full_flight().build_simulation(strategy("back_to_front"))
	sim.run_to_completion()
	var r := sim.result()
	assert_eq(r["seated"], 180)
	assert_eq(r["total_ticks"], sim.tick)
	assert_true(r["blocked_ticks"] > 0, "some blocking happened")
	assert_true(r["stow_ticks"] > 0, "some stowing happened")
	assert_true(r["seat_wait_ticks"] > 0, "some seat interference happened")
	var caused := 0
	for p in sim.passengers:
		caused += p.caused_blocked_time
	assert_eq(caused, r["blocked_ticks"], "every blocked tick is attributed to exactly one blocker")
	assert_true(r["top_blockers"].size() > 0, "top blockers reported")
	assert_true(r["top_blockers"][0]["caused_blocked_ticks"] >= r["top_blockers"][-1]["caused_blocked_ticks"], "sorted desc")


func test_records_versioning() -> void:
	var sc := full_flight()
	var config := sc.build_config()
	var rec := Records.new()
	var r1 := {"total_ticks": 1000, "strategy": {}}
	var r2 := {"total_ticks": 900, "strategy": {}}
	var r3 := {"total_ticks": 950, "strategy": {}}
	assert_true(rec.record_attempt(sc, config, r1), "first attempt is a best")
	assert_true(rec.record_attempt(sc, config, r2), "faster is a best")
	assert_true(not rec.record_attempt(sc, config, r3), "slower is not a best")
	assert_eq(rec.best_ticks(sc, config), 900)
	assert_eq(rec.attempt_count(sc), 3)
	# Simulate a version bump: stale record no longer counts.
	rec.data[Records.key_for(sc)]["sim_version"] = "0.0.0"
	assert_eq(rec.best_ticks(sc, config), -1, "stale record ignored")
	DirAccess.remove_absolute(Records.SAVE_PATH)


func test_aircraft_seat_geometry() -> void:
	var a := AircraftDef.load_by_id("narrowbody_30")
	assert_eq(a.rows, 30)
	assert_eq(a.capacity(), 180)
	assert_eq(a.seat_type_of("A"), Passenger.SeatType.WINDOW)
	assert_eq(a.seat_type_of("B"), Passenger.SeatType.MIDDLE)
	assert_eq(a.seat_type_of("C"), Passenger.SeatType.AISLE)
	assert_eq(a.seat_type_of("D"), Passenger.SeatType.AISLE)
	assert_eq(a.seat_type_of("E"), Passenger.SeatType.MIDDLE)
	assert_eq(a.seat_type_of("F"), Passenger.SeatType.WINDOW)
	assert_eq(a.seats_between_aisle("A"), ["B", "C"])
	assert_eq(a.seats_between_aisle("F"), ["D", "E"])
	assert_eq(a.seats_between_aisle("C"), [])
	assert_eq(a.seats_between_aisle("E"), ["D"])


func test_standalone_matches_golden_baseline() -> void:
	# M3 step 1 baseline: the airport integration must not move standalone outcomes.
	var expected = JSON.parse_string(FileAccess.get_file_as_string(StandaloneGolden.PATH))
	var actual = JSON.parse_string(JSON.stringify(StandaloneGolden.compute()))
	assert_eq(actual.sim_version, expected.sim_version, "SIM_VERSION")
	assert_eq(actual.runs.size(), expected.runs.size(), "run count")
	for key in expected.runs:
		assert_eq(JSON.stringify(actual.runs.get(key), "", true), JSON.stringify(expected.runs[key], "", true), key)


func test_incremental_admission_order_and_close() -> void:
	var sc := full_flight()
	var aircraft := sc.load_aircraft()
	var config := sc.build_config()
	var manifest := PassengerGenerator.generate(aircraft, 30, 7, config)
	var sim := Simulation.new()
	sim.setup_incremental(aircraft, manifest, strategy("back_to_front"), config, 7)
	assert_eq(sim.queue.size(), 0, "nobody queued before admission")
	for p in manifest: assert_eq(p.state, Passenger.State.WAITING)
	# Admit the back half first: they queue in strategy order among themselves.
	var late: Array = []
	var early: Array = []
	for p in manifest:
		(early if p.id % 2 == 0 else late).append(p.id)
	assert_eq(sim.admit(early).size(), early.size())
	assert_eq(sim.admit(early).size(), 0, "re-admission is ignored")
	for i in range(1, sim.queue.size()):
		assert_lt(sim.passenger_by_id(sim.queue[i - 1]).queue_position, sim.passenger_by_id(sim.queue[i]).queue_position)
	sim.run_to_completion(20000)
	assert_true(not sim.is_complete(), "open boarding never completes on its own")
	assert_eq(sim.seated_count, early.size())
	sim.admit(late)
	sim.close()
	assert_eq(sim.admit([manifest[0].id]).size(), 0, "closed boarding admits nobody")
	sim.run_to_completion()
	assert_true(sim.is_complete())
	assert_eq(sim.seated_count, manifest.size())
	assert_eq(sim.result().admitted, manifest.size())


func test_incremental_close_with_missing_passengers_completes() -> void:
	var sc := full_flight()
	var aircraft := sc.load_aircraft()
	var config := sc.build_config()
	var manifest := PassengerGenerator.generate(aircraft, 20, 3, config)
	var sim := Simulation.new()
	sim.setup_incremental(aircraft, manifest, strategy("random"), config, 3)
	sim.admit([manifest[0].id, manifest[1].id])
	sim.close()
	sim.run_to_completion()
	assert_true(sim.is_complete())
	assert_eq(sim.seated_count, 2)
	assert_eq(manifest[5].state, Passenger.State.WAITING, "missing passenger never entered")
	assert_eq(sim.result().passengers, 20)


func test_engine_snapshot_resume_matches_uninterrupted() -> void:
	var sc := full_flight()
	var aircraft := sc.load_aircraft()
	var config := sc.build_config()
	var runs: Array = []
	for interrupt in [false, true]:
		var manifest := PassengerGenerator.generate(aircraft, 150, 11, config)
		var sim := Simulation.new()
		sim.setup_incremental(aircraft, manifest, strategy("window_middle_aisle"), config, 11)
		var ids: Array = []
		for p in manifest: ids.append(p.id)
		sim.admit(ids.slice(0, 100))
		for _i in 2500: sim.step()
		if interrupt:
			# Round-trip everything through JSON, as an airport save does.
			var engine_data = JSON.parse_string(JSON.stringify(sim.snapshot()))
			var restored: Array[Passenger] = []
			for p in manifest:
				var copy := Passenger.new()
				copy.restore_snapshot(JSON.parse_string(JSON.stringify(p.snapshot())))
				restored.append(copy)
			manifest = restored
			sim = Simulation.new()
			sim.restore(aircraft, manifest, engine_data)
		sim.admit(ids.slice(100))
		sim.close()
		sim.run_to_completion()
		var seated: Array = []
		for p in manifest: seated.append([p.id, p.seat_key(), p.seated_tick, p.caused_blocked_time, p.total_blocked_time])
		runs.append({"result": sim.result(), "seated": seated})
	assert_eq(JSON.stringify(runs[1]), JSON.stringify(runs[0]), "resumed engine diverged")


# --- helpers -------------------------------------------------------------

static func _mk(id: int, row: int, letter: String, aircraft: AircraftDef, config: SimConfig) -> Passenger:
	var p := Passenger.new()
	p.id = id
	p.seat_row = row
	p.seat_letter = letter
	p.seat_type = aircraft.seat_type_of(letter)
	p.side = aircraft.side_of(letter)
	p.walking_speed = 1000
	p.walk_ticks_per_cell = config.walk_ticks_per_cell
	p.carry_on_count = 0
	p.luggage_stow_duration = 0
	p.seat_access_duration = config.seat_base_ticks
	return p


static func _g(gname: String, row_from: int, row_to: int, seat_types: Array) -> BoardingStrategy.Group:
	var g := BoardingStrategy.Group.new()
	g.name = gname
	g.row_from = row_from
	g.row_to = row_to
	g.seat_types = seat_types
	g.order = BoardingStrategy.Order.RANDOM
	return g
