extends TestCase
## Spec §28 deadlock sweep: many generated scenarios must all terminate.
## Count is controlled by BOARDING_DEADLOCK_RUNS (default 1000).


func test_generated_scenarios_terminate() -> void:
	var runs := 1000
	var env := OS.get_environment("BOARDING_DEADLOCK_RUNS")
	if env != "":
		runs = int(env)
	var aircraft := AircraftDef.load_by_id("narrowbody_30")
	var base_config := SimConfig.load_default()
	var rng := SimRng.new(20260918, SimRng.STREAM_SCENARIO)
	var started := Time.get_ticks_msec()
	var max_ticks_seen := 0
	for i in runs:
		var seed_value := rng.randi_range(1, 2_000_000_000)
		var count := rng.randi_range(1, aircraft.capacity())
		var config := base_config.duplicate_config()
		# Occasionally stress the config too.
		if rng.randi_range(0, 3) == 0:
			config.bag_weights = [rng.randi_range(0, 30), rng.randi_range(1, 70), rng.randi_range(0, 70)]
			config.entry_interval_ticks = rng.randi_range(1, 90)
		var strat: BoardingStrategy
		var pick := rng.randi_range(0, BoardingStrategy.PRESET_IDS.size())
		if pick < BoardingStrategy.PRESET_IDS.size():
			strat = BoardingStrategy.preset(BoardingStrategy.PRESET_IDS[pick], aircraft)
		else:
			strat = _random_custom(rng, aircraft.rows)
		var passengers := PassengerGenerator.generate(aircraft, count, seed_value, config)
		var sim := Simulation.new()
		sim.setup(aircraft, passengers, strat, config, seed_value)
		var limit := 500_000
		sim.run_to_completion(limit)
		max_ticks_seen = maxi(max_ticks_seen, sim.tick)
		if not sim.is_complete():
			failures.append("deadlock: seed=%d count=%d strategy=%s tick=%d states=%s" %
				[seed_value, count, strat.preset_id, sim.tick, str(sim.state_counts())])
			return
		checks += 1
	var elapsed := (Time.get_ticks_msec() - started) / 1000.0
	print("      %d scenarios in %.1fs, longest %d ticks" % [runs, elapsed, max_ticks_seen])


## M3: random admission schedules (some passengers never admitted) must always
## terminate once boarding is closed.
func test_incremental_admission_terminates() -> void:
	var runs := 300
	var env := OS.get_environment("BOARDING_DEADLOCK_RUNS")
	if env != "":
		runs = int(env)
	var rng := SimRng.new(20260924, SimRng.STREAM_SCENARIO)
	var cabins := ["narrowbody_30", "a220_26", "a321_37"]
	for i in runs:
		var aircraft := AircraftDef.load_by_id(cabins[i % cabins.size()])
		var config := SimConfig.load_default()
		var seed_value := rng.randi_range(1, 2_000_000_000)
		var count := rng.randi_range(1, aircraft.capacity())
		var passengers := PassengerGenerator.generate(aircraft, count, seed_value, config)
		var pick := rng.randi_range(0, BoardingStrategy.PRESET_IDS.size())
		var strat := BoardingStrategy.preset(BoardingStrategy.PRESET_IDS[pick], aircraft) if pick < BoardingStrategy.PRESET_IDS.size() else _random_custom(rng, aircraft.rows)
		var sim := Simulation.new()
		sim.setup_incremental(aircraft, passengers, strat, config, seed_value)
		var pending: Array = []
		for p in passengers:
			if rng.randi_range(0, 9) > 0: pending.append(p.id)
		rng.shuffle(pending)
		while not pending.is_empty():
			var batch := rng.randi_range(1, 12)
			sim.admit(pending.slice(0, batch))
			pending = pending.slice(batch)
			for _t in rng.randi_range(0, 400): sim.step()
		sim.close()
		sim.run_to_completion(500_000)
		if not sim.is_complete() or sim.seated_count != sim.queue.size():
			failures.append("incremental deadlock: seed=%d cabin=%s count=%d tick=%d" % [seed_value, aircraft.id, count, sim.tick])
			return
		checks += 1


## M5: deboarding always finishes, for random cabins, loads and timings.
func test_deboarding_terminates() -> void:
	var runs := 300
	var env := OS.get_environment("BOARDING_DEADLOCK_RUNS")
	if env != "":
		runs = int(env)
	var rng := SimRng.new(20260925, SimRng.STREAM_SCENARIO)
	var cabins := ["narrowbody_30", "a220_26", "a321_37"]
	for i in runs:
		var cabin := AircraftDef.load_by_id(cabins[i % cabins.size()])
		var settings := {"seat_exit_ticks": rng.randi_range(1, 150), "aisle_entry_ticks": rng.randi_range(0, 90),
			"retrieve_base_ticks": rng.randi_range(0, 300), "retrieve_per_bag_ticks": rng.randi_range(0, 300),
			"walk_ticks_per_cell": rng.randi_range(1, 90), "door_interval_ticks": rng.randi_range(1, 300)}
		var count := rng.randi_range(0, cabin.capacity())
		var seed_value := rng.randi_range(1, 2_000_000_000)
		var ps := TestDeboardingFixtures.manifest(cabin, count, seed_value, settings)
		var sim := DeboardingSimulation.new()
		sim.setup(cabin, ps, settings)
		sim.run_to_completion(2_000_000)
		if not sim.is_complete() or sim.exited.size() != count:
			failures.append("deboarding stuck: seed=%d cabin=%s count=%d settings=%s" % [seed_value, cabin.id, count, str(settings)])
			return
		checks += 1


static func _random_custom(rng: SimRng, rows: int) -> BoardingStrategy:
	var groups: Array = []
	var n := rng.randi_range(1, 5)
	for _i in n:
		var g := BoardingStrategy.Group.new()
		g.name = "G"
		var a := rng.randi_range(1, rows)
		var b := rng.randi_range(1, rows)
		g.row_from = mini(a, b)
		g.row_to = maxi(a, b)
		g.seat_types = []
		for t in Passenger.SeatType.values():
			if rng.randi_range(0, 1) == 1:
				g.seat_types.append(t)
		g.order = rng.randi_range(0, 2)
		groups.append(g)
	return BoardingStrategy.make_custom(groups)
