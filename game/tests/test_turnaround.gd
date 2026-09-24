extends TestCase
## M4: aircraft turnaround as a task graph. See docs/m4-plan.md.

const D := 40000


## One 737 at A2 with a fast terminal; everyone is at the gate before D-30.
## Turnaround variation is off so task times are exact.
func fixture(overrides := {}, edit := Callable()) -> AirportSimulation:
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.start_tick = 0
	config.turnaround.variation_permille = 0
	var f: Dictionary = config.flights[1].duplicate(true)
	f.scheduled_arrival = 3000
	f.scheduled_departure = D
	f.assigned_gate_id = "A2"
	f.load_permille = 800
	f.late_passengers = 0
	f.boarding_strategy = "window_middle_aisle"
	f.turnaround_overrides = overrides
	config.flights = [f]
	var flow: Dictionary = config.passenger_flow
	# Earlier-milestone fixtures: no connecting itineraries (M6 tests opt in).
	flow.erase("connections")
	flow.arrival_lead_min_ticks = 30000
	flow.arrival_lead_max_ticks = 34000
	flow.check_in_ticks = 1
	for edge in flow.graph.edges: edge.walking_ticks = 20
	for cp in flow.checkpoints: cp.service_ticks = 20
	if edit.is_valid(): edit.call(config)
	var sim := AirportSimulation.new()
	sim.setup(config)
	return sim


func flight(sim: AirportSimulation) -> AirportFlight:
	return sim.airport.flights.F002


func task(sim: AirportSimulation, type: String) -> TurnaroundTask:
	return sim.turnaround.task(flight(sim), type)


func run_until(sim: AirportSimulation, predicate: Callable, limit := 80000) -> void:
	for _i in limit:
		if predicate.call(): return
		sim.step()


func exit_ticks(sim: AirportSimulation) -> int:
	return int(sim.config.taxi_out_ticks) + int(sim.config.takeoff_ticks)


func sum(breakdown: Dictionary) -> int:
	var total := 0
	for key in breakdown: total += int(breakdown[key])
	return total


func test_dependency_ordering() -> void:
	var sim := fixture()
	var f := flight(sim)
	var seen_boarding_early := false
	while f.status != "departed":
		sim.step()
		var boarding := task(sim, "boarding")
		if boarding.status in [TurnaroundTask.READY, TurnaroundTask.RUNNING]:
			for dependency in ["cleaning", "catering"]:
				if task(sim, dependency).status != TurnaroundTask.COMPLETE: seen_boarding_early = true
	assert_true(not seen_boarding_early, "boarding never starts before cleaning and catering")
	var secured := task(sim, "arrival_secured")
	assert_eq(secured.start_tick, f.gate_arrival_tick + 1, "first task starts when the aircraft is at the gate")
	for type in ["deboarding", "fueling", "placeholder_baggage_service"]:
		assert_eq(task(sim, type).start_tick, secured.finish_tick, type + " waits for arrival secured")
		assert_eq(task(sim, type).started_after, "arrival_secured")
	for type in ["cleaning", "catering"]:
		assert_eq(task(sim, type).start_tick, task(sim, "deboarding").finish_tick + 1, type + " waits for deboarding")
		assert_eq(task(sim, type).started_after, "deboarding")
	var milestone := task(sim, "pushback_ready")
	for type in milestone.after: assert_true(task(sim, type).finish_tick <= milestone.finish_tick, type)


func test_independent_tasks_run_concurrently() -> void:
	var sim := fixture()
	run_until(sim, func(): return task(sim, "deboarding").status == TurnaroundTask.RUNNING)
	sim.step()
	for type in ["deboarding", "fueling", "placeholder_baggage_service"]:
		assert_eq(task(sim, type).status, TurnaroundTask.RUNNING, type + " runs alongside the others")


func test_fueling_and_boarding_never_overlap() -> void:
	# Fueling long enough to still be running at D-30.
	var sim := fixture({"fueling": 12000})
	var f := flight(sim)
	var overlap := false
	var reason := ""
	while f.status != "departed":
		sim.step()
		var fueling := task(sim, "fueling")
		var boarding := task(sim, "boarding")
		if fueling.status == TurnaroundTask.RUNNING and boarding.status in [TurnaroundTask.READY, TurnaroundTask.RUNNING]: overlap = true
		if boarding.status == TurnaroundTask.BLOCKED and task(sim, "cleaning").status == TurnaroundTask.COMPLETE: reason = boarding.blocked_reason
	assert_true(not overlap, "exclusive tasks never overlap")
	assert_eq(reason, "fueling in progress", "blocked reason names the conflicting task")
	assert_eq(f.boarding_open_tick, task(sim, "fueling").finish_tick, "boarding opens as fueling ends")
	assert_eq(task(sim, "boarding").started_after, "fueling")


func test_late_aircraft_shifts_turnaround() -> void:
	var starts := []
	for arrival in [3000, 9000]:
		var sim := fixture({}, func(config): config.flights[0].scheduled_arrival = arrival)
		run_until(sim, func(): return flight(sim).status == "departed")
		var row := {"dock": flight(sim).gate_arrival_tick}
		for type in ["arrival_secured", "cleaning", "placeholder_baggage_service"]: row[type] = task(sim, type).start_tick
		starts.append(row)
	for type in ["arrival_secured", "cleaning", "placeholder_baggage_service"]:
		assert_eq(starts[1][type] - starts[0][type], starts[1].dock - starts[0].dock, type + " shifts with the late gate arrival")


func test_boarding_waits_for_prerequisites_then_completes_through_framework() -> void:
	# A 25-minute deep clean pushes boarding past D-30.
	var sim := fixture({"cleaning": 15000})
	var f := flight(sim)
	run_until(sim, func(): return task(sim, "catering").status == TurnaroundTask.COMPLETE)
	assert_eq(f.status, "turnaround")
	assert_eq(task(sim, "boarding").status, TurnaroundTask.BLOCKED)
	assert_eq(task(sim, "boarding").blocked_reason, "waiting for cleaning")
	run_until(sim, func(): return f.status == "departed")
	var cleaning := task(sim, "cleaning")
	var boarding := task(sim, "boarding")
	assert_true(cleaning.finish_tick > D - 18000, "cleaning ran past D-30")
	assert_eq(f.boarding_open_tick, cleaning.finish_tick, "boarding opens the tick cleaning finishes")
	assert_eq(boarding.start_tick, f.boarding_open_tick)
	assert_eq(boarding.finish_tick, f.boarding_complete_tick)
	assert_eq(boarding.started_after, "cleaning")
	assert_eq(f.boarded_count, f.passenger_ids.size(), "M3 boarding rules unchanged")


func test_no_pushback_with_required_task_incomplete() -> void:
	# Baggage placeholder runs 15 minutes past scheduled pushback.
	var sim := fixture({"placeholder_baggage_service": 25000})
	var f := flight(sim)
	run_until(sim, func(): return f.boarding_phase == "complete")
	sim.step()
	assert_eq(f.status, "boarding", "boarded but not pushback-ready")
	assert_eq(task(sim, "pushback_ready").blocked_reason, "waiting for baggage (placeholder)")
	var baggage := task(sim, "placeholder_baggage_service")
	run_until(sim, func(): return f.status == "departed")
	assert_eq(f.gate_release_tick, baggage.finish_tick, "pushes back the tick the last required task completes")
	assert_true(f.gate_release_tick > D - exit_ticks(sim))


func test_critical_task_delay_is_measured_and_attributed() -> void:
	var sim := fixture({"placeholder_baggage_service": 25000})
	var f := flight(sim)
	run_until(sim, func(): return f.status == "departed")
	var late := f.actual_departure - D
	assert_true(late > 6000, "real departure delay")
	assert_eq(sum(f.departure_delay_breakdown), late, "breakdown is additive and complete")
	var baggage := int(f.departure_delay_breakdown.get("placeholder_baggage_service", 0))
	assert_eq(baggage, f.gate_release_tick - (D - exit_ticks(sim)), "all pushback lateness is baggage")
	assert_true(not f.departure_delay_breakdown.has("boarding"), "boarding finished on time: not blamed")


func test_deep_clean_blames_cleaning_not_boarding() -> void:
	var sim := fixture({"cleaning": 15000})
	var f := flight(sim)
	run_until(sim, func(): return f.status == "departed")
	var late := f.actual_departure - D
	assert_true(late > 0, "deep clean delays departure")
	assert_eq(sum(f.departure_delay_breakdown), late)
	assert_true(int(f.departure_delay_breakdown.get("cleaning", 0)) > 0, str(f.departure_delay_breakdown))
	assert_true(not f.departure_delay_breakdown.has("boarding"), "boarding took its normal time")


func test_non_critical_overlap_adds_no_delay() -> void:
	var baseline := fixture()
	run_until(baseline, func(): return flight(baseline).status == "departed")
	# Catering runs 30 s longer but still ends before cleaning: off the critical path.
	var slower := fixture({"catering": 300})
	run_until(slower, func(): return flight(slower).status == "departed")
	assert_true(task(slower, "catering").finish_tick <= task(slower, "cleaning").finish_tick, "still not critical")
	assert_eq(flight(slower).actual_departure, flight(baseline).actual_departure, "no departure change")
	assert_true(not flight(slower).departure_delay_breakdown.has("catering"), "not blamed")


func test_save_mid_turnaround_resumes_identically() -> void:
	var outcomes: Array = []
	for interrupt in [false, true]:
		var sim := fixture({"cleaning": 15000})
		run_until(sim, func(): return task(sim, "cleaning").status == TurnaroundTask.RUNNING and task(sim, "catering").status == TurnaroundTask.COMPLETE)
		if interrupt:
			var restored := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot())))
			assert_true(restored != null, "mid-turnaround snapshot restores")
			if restored == null: return
			assert_eq(JSON.stringify(restored.snapshot()), JSON.stringify(sim.snapshot()), "exact round trip")
			sim = restored
		run_until(sim, func(): return flight(sim).status == "departed")
		var tasks := {}
		for t: TurnaroundTask in sim.turnaround.tasks_of(flight(sim)): tasks[t.type] = t.to_dict()
		outcomes.append({"tasks": tasks, "breakdown": flight(sim).departure_delay_breakdown,
			"departure": flight(sim).actual_departure, "events": sim.events.history})
	assert_eq(JSON.stringify(outcomes[1]), JSON.stringify(outcomes[0]), "resumed run diverged")


func test_same_seed_same_task_timestamps() -> void:
	var runs: Array = []
	for _i in 2:
		var sim := AirportSimulation.new()
		sim.setup()
		sim.advance(60000)
		var times := {}
		for id in sim.airport.turnaround_tasks: times[id] = sim.airport.turnaround_tasks[id].to_dict()
		runs.append(times)
	assert_eq(JSON.stringify(runs[1]), JSON.stringify(runs[0]))
	assert_eq(runs[0].size(), 24 * sim_task_count())


func test_full_morning_breakdowns_are_exact() -> void:
	var sim := AirportSimulation.new()
	sim.setup()
	sim.advance(int(sim.config.flights[-1].scheduled_departure) - sim.clock.tick + 30000)
	for f: AirportFlight in sim.flight_order:
		assert_eq(f.status, "departed", f.id)
		assert_eq(sum(f.departure_delay_breakdown), maxi(0, f.actual_departure - f.scheduled_departure), f.id)
		for t: TurnaroundTask in sim.turnaround.tasks_of(f): assert_eq(t.status, TurnaroundTask.COMPLETE, t.id)
	# Demo flight F004 has a deep clean: cleaning shows up in its explanation.
	assert_true(int(sim.airport.flights.F004.departure_delay_breakdown.get("cleaning", 0)) > 0, str(sim.airport.flights.F004.departure_delay_breakdown))


func test_tampered_turnaround_saves_rejected() -> void:
	var sim := fixture()
	run_until(sim, func(): return task(sim, "cleaning").status == TurnaroundTask.RUNNING)
	var good: Dictionary = JSON.parse_string(JSON.stringify(sim.snapshot()))
	var cases := {
		"v3 save": func(d): d.version = 3,
		"task missing": func(d): d.airport.turnaround_tasks.erase("F002:fueling"),
		"running before prerequisite": func(d): d.airport.turnaround_tasks["F002:boarding"].status = "RUNNING"; d.airport.turnaround_tasks["F002:boarding"].start_tick = 1,
		"finished in the future": func(d): d.airport.turnaround_tasks["F002:arrival_secured"].finish_tick = d.clock.tick + 50,
		"overdue running task": func(d): d.airport.turnaround_tasks["F002:cleaning"].duration_ticks = 0,
		"unknown status": func(d): d.airport.turnaround_tasks["F002:catering"].status = "PAUSED",
	}
	for label in cases:
		var bad: Dictionary = good.duplicate(true)
		cases[label].call(bad)
		assert_eq(AirportSimulation.from_snapshot(bad), null, label)


func sim_task_count() -> int:
	return JsonUtil.load_file(AirportSimulation.CONFIG_PATH).turnaround.tasks.size()
