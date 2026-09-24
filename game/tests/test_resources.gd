extends TestCase
## M8: operational resources. Turnaround tasks hold units from limited pools;
## flights compete; service priority decides who goes first. See
## docs/m8-plan.md.

const D := 40000


## `n` 737s (F0, F1, …) at gates A1… landing a minute apart, departing
## D + i × `spacing`. Pools default to plenty; `units` overrides some.
## No turnaround variation; small loads; no connections.
func fixture(n: int, units: Dictionary, spacing := 600, edit := Callable()) -> AirportSimulation:
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.start_tick = 0
	config.turnaround.variation_permille = 0
	var template: Dictionary = config.flights[1]
	config.flights = []
	for i in n:
		var f: Dictionary = template.duplicate(true)
		f.merge({"id": "F%d" % i, "flight_number": "AW 9%02d" % i, "assigned_gate_id": "A%d" % (i + 1),
			"scheduled_arrival": 3000 + i * 600, "scheduled_departure": D + i * spacing, "load_permille": 300,
			"inbound_load_permille": 300, "late_passengers": 0, "boarding_strategy": "window_middle_aisle"}, true)
		config.flights.append(f)
	var flow: Dictionary = config.passenger_flow
	flow.erase("connections")
	flow.arrival_lead_min_ticks = 30000
	flow.arrival_lead_max_ticks = 34000
	flow.check_in_ticks = 1
	for cp in flow.checkpoints: cp.service_ticks = 20
	for type in config.resources: config.resources[type].units = int(units.get(type, 8))
	if edit.is_valid(): edit.call(config)
	var sim := AirportSimulation.new()
	sim.setup(config)
	return sim


func run_until(sim: AirportSimulation, predicate: Callable, limit := 120000) -> void:
	for _i in limit:
		if predicate.call(): return
		sim.step()


func all_departed(sim: AirportSimulation) -> bool:
	for f: AirportFlight in sim.flight_order:
		if f.status != "departed": return false
	return true


func task(sim: AirportSimulation, fid: String, type: String) -> TurnaroundTask:
	return sim.turnaround.task(sim.airport.flights[fid], type)


func sum(breakdown: Dictionary) -> int:
	var total := 0
	for key in breakdown: total += int(breakdown[key])
	return total


# --- acquisition, blocking, exclusivity, release ------------------------------

func test_ready_task_acquires_a_free_unit() -> void:
	var sim := fixture(1, {"fuel_unit": 1})
	var fueling := task(sim, "F0", "fueling")
	run_until(sim, func(): return fueling.status == TurnaroundTask.RUNNING)
	assert_eq(fueling.unit_id, "fuel_unit#1")
	assert_eq(fueling.resource_wait_ticks, 0, "nothing to wait for")
	assert_eq(fueling.start_tick, task(sim, "F0", "arrival_secured").finish_tick, "starts the tick it is ready")
	assert_eq(sim.resources.pools.fuel_unit.units[0].task_id, fueling.id, "the unit records its holder")


func test_task_cannot_progress_without_its_resource() -> void:
	var sim := fixture(2, {"fuel_unit": 1})
	var first := task(sim, "F0", "fueling")
	var second := task(sim, "F1", "fueling")
	run_until(sim, func(): return second.status == TurnaroundTask.WAITING)
	assert_eq(first.status, TurnaroundTask.RUNNING)
	assert_eq(second.blocked_reason, "waiting for fuel unit")
	var boarding := task(sim, "F1", "boarding")
	for _i in 2000:
		sim.step()
		if second.status != TurnaroundTask.WAITING: break
		assert_eq(second.start_tick, -1, "no progress while waiting")
		assert_true(not boarding.status in [TurnaroundTask.READY, TurnaroundTask.RUNNING], "a flight waiting for fuel does not board")


func test_one_unit_never_serves_two_tasks() -> void:
	var sim := fixture(3, {"fuel_unit": 2, "baggage_crew": 2})
	for _i in 60000:
		sim.step()
		for type in sim.resources.order:
			var holders := {}
			var running := 0
			for unit in sim.resources.pools[type].units:
				if unit.task_id.is_empty(): continue
				assert_true(not holders.has(unit.task_id), "one task per unit")
				holders[unit.task_id] = true
			for t: TurnaroundTask in sim.airport.turnaround_tasks.values():
				if t.resource == type and t.status == TurnaroundTask.RUNNING:
					running += 1
					assert_true(holders.has(t.id), "running work holds a unit")
			assert_true(running <= sim.resources.pools[type].units.size())
		if all_departed(sim): break


func test_release_then_next_in_queue_starts() -> void:
	var sim := fixture(2, {"fuel_unit": 1})
	var first := task(sim, "F0", "fueling")
	var second := task(sim, "F1", "fueling")
	run_until(sim, func(): return first.status == TurnaroundTask.COMPLETE)
	assert_eq(second.start_tick, first.finish_tick, "the freed unit goes to the next in line on the same tick")
	assert_eq(second.unit_id, first.unit_id if not first.unit_id.is_empty() else "fuel_unit#1")
	assert_eq(first.unit_id, "", "released")
	assert_eq(second.resource_wait_ticks, first.finish_tick - second.ready_tick)


# --- ordering and priority -------------------------------------------------------

func test_equal_requests_resolve_identically() -> void:
	# Same readiness tick and departure: the flight's scenario order decides,
	# whichever asked first.
	var orders: Array = []
	for reverse in [false, true]:
		var sim := fixture(3, {"fuel_unit": 1}, 0)
		var ids := ["F1", "F2"] if not reverse else ["F2", "F1"]
		for fid in ids:
			var t := task(sim, fid, "fueling")
			t.started_after = "gate"
			sim.resources.request(t, 100)
		var queue: Array = []
		for t in sim.resource_queue("fuel_unit"): queue.append(t.flight_id)
		orders.append(queue)
	assert_eq(orders[0], ["F1", "F2"])
	assert_eq(orders[1], orders[0], "same order regardless of request order")


func test_high_priority_goes_first_and_someone_else_waits() -> void:
	var outcome := {}
	for high in [false, true]:
		var sim := fixture(3, {"fuel_unit": 1})
		if high: sim.set_service_priority("F2", "high")
		run_until(sim, func(): return all_departed(sim))
		outcome[high] = {"F1": task(sim, "F1", "fueling").start_tick, "F2": task(sim, "F2", "fueling").start_tick,
			"dep1": sim.airport.flights.F1.actual_departure, "dep2": sim.airport.flights.F2.actual_departure,
			"allocations": sim.resource_metrics().pools.fuel_unit.allocations,
			"busy": sim.resource_metrics().pools.fuel_unit.utilization}
	assert_true(outcome[false].F1 < outcome[false].F2, "default: the earlier departure fuels first")
	assert_true(outcome[true].F2 < outcome[true].F1, "HIGH moves F2 ahead")
	assert_true(outcome[true].F1 > outcome[false].F1, "F1 now waits longer")
	assert_true(outcome[true].dep2 <= outcome[false].dep2, "the priority flight improves")
	assert_true(outcome[true].dep1 >= outcome[false].dep1, "the other flight gets worse")
	assert_eq(outcome[true].allocations, outcome[false].allocations, "no extra capacity appears")


func test_priority_change_reorders_waiting_queue() -> void:
	var sim := fixture(3, {"fuel_unit": 1})
	run_until(sim, func(): return sim.resource_queue("fuel_unit").size() == 2)
	var ids := func() -> Array:
		var out: Array = []
		for t in sim.resource_queue("fuel_unit"): out.append(t.flight_id)
		return out
	assert_eq(ids.call(), ["F1", "F2"])
	assert_true(sim.set_service_priority("F2", "high"))
	assert_eq(ids.call(), ["F2", "F1"])
	assert_true(sim.set_service_priority("F1", "high"))
	assert_eq(ids.call(), ["F1", "F2"], "equal priority: back to the normal order")
	assert_true(not sim.set_service_priority("F1", "urgent"), "unknown level rejected")
	assert_eq(sim.decisions[-1].type, "set_service_priority")


# --- pushback, baggage -----------------------------------------------------------

func test_ready_aircraft_waits_for_a_tug() -> void:
	# Two flights due off-blocks on the same tick, one tug.
	var sim := fixture(2, {"pushback_tug": 1}, 0)
	var a: AirportFlight = sim.airport.flights.F0
	var b: AirportFlight = sim.airport.flights.F1
	var op := task(sim, "F1", "pushback")
	run_until(sim, func(): return op.status == TurnaroundTask.WAITING)
	assert_eq(b.status, "ready_for_pushback", "ready but still at the gate")
	assert_eq(sim.airport.gates.A2.occupied_by_flight_id, "F1")
	run_until(sim, func(): return all_departed(sim))
	var first := task(sim, "F0", "pushback")
	assert_eq(b.gate_release_tick, first.start_tick + first.duration_ticks, "pushes back when the tug is free")
	assert_eq(a.gate_release_tick, first.start_tick)
	assert_true(int(b.departure_delay_breakdown.get("wait:pushback_tug", 0)) > 0, "blamed on the tug: %s" % b.departure_delay_breakdown)
	assert_eq(sum(b.departure_delay_breakdown), b.actual_departure - b.scheduled_departure)


func test_unload_and_load_share_baggage_crews() -> void:
	# F2 lands while F0 and F1 are in their loading windows (from D-35).
	var sim := fixture(3, {"baggage_crew": 1}, 3000, func(config):
		config.flights[2].scheduled_arrival = 17500
		config.flights[2].scheduled_departure = D + 20000)
	var saw_contention := [false]
	run_until(sim, func():
		for fid in ["F0", "F1", "F2"]:
			for type in ["baggage_unload", "baggage_load"]:
				var t := task(sim, fid, type)
				if t.status != TurnaroundTask.WAITING: continue
				var holder: TurnaroundTask = sim.resource_holders("baggage_crew")[0]
				if holder != null and holder.type != t.type: saw_contention[0] = true
		return all_departed(sim))
	assert_true(saw_contention[0], "an unload waited for a load (or the reverse)")
	for fid in ["F0", "F1", "F2"]:
		assert_eq(task(sim, fid, "baggage_load").status, TurnaroundTask.COMPLETE)


# --- causality ---------------------------------------------------------------------

func test_resource_wait_on_the_critical_path_delays_departure() -> void:
	var sim := fixture(3, {"fuel_unit": 1})
	run_until(sim, func(): return all_departed(sim))
	var f: AirportFlight = sim.airport.flights.F2
	var fueling := task(sim, "F2", "fueling")
	assert_true(fueling.resource_wait_ticks > 6000, "waited for both others")
	assert_true(f.actual_departure > f.scheduled_departure, "late")
	var waited := int(f.departure_delay_breakdown.get("wait:fuel_unit", 0))
	assert_true(waited > 0, "blamed on the fuel unit wait: %s" % f.departure_delay_breakdown)
	assert_true(waited <= fueling.resource_wait_ticks)
	assert_eq(sum(f.departure_delay_breakdown), f.actual_departure - f.scheduled_departure, "breakdown is complete")
	assert_true(int(f.departure_delay_breakdown.get("fueling", 0)) == 0, "fueling itself ran to plan: execution and waiting kept apart")


func test_resource_wait_off_the_critical_path_gets_no_blame() -> void:
	# The second flight waits for the only cleaning crew but has hours of slack.
	var sim := fixture(2, {"cleaning_crew": 1}, 30000)
	run_until(sim, func(): return all_departed(sim))
	var cleaning := task(sim, "F1", "cleaning")
	assert_true(cleaning.resource_wait_ticks > 0, "it did wait")
	var f: AirportFlight = sim.airport.flights.F1
	assert_true(not f.departure_delay_breakdown.has("wait:cleaning_crew"), "no false blame: %s" % f.departure_delay_breakdown)
	assert_eq(sim.resource_metrics().pools.cleaning_crew.waited, 1)


func test_baggage_crew_shortage_costs_a_transfer_bag() -> void:
	# FB's loading window (from D-35) holds the only baggage crew when FA lands
	# with a connector whose bag must be unloaded. The passenger makes it; the
	# bag doesn't.
	var run := func(crews: int) -> Dictionary:
		var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
		config.start_tick = 0
		config.turnaround.variation_permille = 0
		var a: Dictionary = config.flights[4].duplicate(true)
		a.merge({"id": "FA", "flight_number": "NS 900", "aircraft_type": "737", "assigned_gate_id": "A5",
			"scheduled_arrival": 20000, "scheduled_departure": 60000, "load_permille": 0, "inbound_load_permille": 1000,
			"late_passengers": 0, "inbound_delay_ticks": 0}, true)
		var b: Dictionary = config.flights[1].duplicate(true)
		b.merge({"id": "FB", "flight_number": "AW 900", "aircraft_type": "737", "assigned_gate_id": "A2",
			"scheduled_arrival": 3000, "scheduled_departure": 43000, "load_permille": 17, "inbound_load_permille": 0,
			"late_passengers": 0, "boarding_strategy": "random", "inbound_delay_ticks": 0}, true)
		config.flights = [a, b]
		config.passenger_flow.connections = {"default_permille": 0, "demo_bank": [{"from": "FA", "to": "FB", "seats": ["1A"]}]}
		config.baggage.merge({"checked_permille": 0, "airline_checked_permille": {}, "demo_bags": [{"flight": "FA", "seat": "1A", "bags": 1}]}, true)
		config.resources.baggage_crew.units = crews
		var sim := AirportSimulation.new()
		sim.setup(config)
		run_until(sim, func(): return sim.airport.flights.FB.status == "departed")
		var p: Passenger = null
		for id in sim.airport.flights.FA.inbound_passenger_ids:
			if sim.airport.passengers[str(id)].journey_direction == "connecting": p = sim.airport.passengers[str(id)]
		return {"passenger": p.connection_status, "bag": sim.airport.bags[p.checked_bag_ids[0]].state,
			"unload_wait": sim.turnaround.task(sim.airport.flights.FA, "baggage_unload").resource_wait_ticks}
	var plenty: Dictionary = run.call(4)
	var short: Dictionary = run.call(1)
	assert_eq(plenty.passenger, "made")
	assert_true(plenty.bag in ["departed", "on_aircraft"], "with crews available the bag makes it: %s" % plenty.bag)
	assert_eq(short.passenger, "made", "the passenger still makes it")
	assert_eq(short.bag, "missed_connection", "the bag waited for the only crew and missed the cutoff")
	assert_true(short.unload_wait > 0, "FA's unload waited for a baggage crew")


# --- persistence and determinism ---------------------------------------------------

func test_save_mid_contention_resumes_identically() -> void:
	for at in [6000, 9000, 20000, 40500]:
		var original := fixture(3, {"fuel_unit": 1, "pushback_tug": 1, "baggage_crew": 2}, 300)
		original.set_service_priority("F2", "high")
		original.advance(at)
		var resumed := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(original.snapshot())))
		assert_true(resumed != null, "restores at %d" % at)
		if resumed == null: continue
		for _i in 60000 - at:
			original.step()
			resumed.step()
		assert_true(JSON.stringify(original.snapshot()) == JSON.stringify(resumed.snapshot()), "identical after save at %d" % at)


func test_mid_contention_save_is_validated() -> void:
	var sim := fixture(3, {"fuel_unit": 1})
	run_until(sim, func(): return sim.resource_queue("fuel_unit").size() == 2)
	var good: Dictionary = JSON.parse_string(JSON.stringify(sim.snapshot()))
	assert_true(AirportSimulation.from_snapshot(good.duplicate(true)) != null, "a valid mid-contention save loads")
	var old := good.duplicate(true)
	old.version = AirportSimulation.SAVE_VERSION - 1
	assert_true(AirportSimulation.from_snapshot(old) == null, "v7 is rejected")
	var holder: String = good.resources.pools.fuel_unit.units[0].task_id
	var mutations := {
		"unit held twice": func(d): d.resources.pools.fuel_unit.units.append({"id": "fuel_unit#2", "task_id": holder, "since": 0}),
		"waiting task missing from its queue": func(d): d.resources.pools.fuel_unit.queue.pop_back(),
		"queue out of order": func(d): d.resources.pools.fuel_unit.queue.reverse(),
		"running without its unit": func(d): d.resources.pools.fuel_unit.units[0].task_id = "",
		"wrong pool": func(d): d.resources.pools.cleaning_crew.queue.append(d.resources.pools.fuel_unit.queue[0]),
		"missing resources block": func(d): d.erase("resources"),
	}
	for label in mutations:
		var bad: Dictionary = good.duplicate(true)
		mutations[label].call(bad)
		assert_true(AirportSimulation.from_snapshot(bad) == null, "rejected: " + label)


func test_same_seed_and_decisions_same_allocation() -> void:
	var runs: Array = []
	for _i in 2:
		var sim := fixture(3, {"fuel_unit": 1, "pushback_tug": 1, "baggage_crew": 2}, 300)
		sim.advance(8000)
		sim.set_service_priority("F2", "high")
		run_until(sim, func(): return all_departed(sim))
		runs.append(JSON.stringify(sim.snapshot()))
	assert_eq(runs[0], runs[1], "identical allocation, timing and outcomes")


func test_riverdale_default_is_busy_not_broken() -> void:
	var sim := AirportSimulation.new()
	sim.setup()
	while sim.clock.tick < 330000: sim.step()
	var m := sim.resource_metrics()
	var waited := 0
	for type in m.pools: waited += int(m.pools[type].waited)
	assert_true(waited > 0, "some contention in the waves")
	assert_true(m.flights_delayed <= 3, "few flights lose time to shortages: %d" % m.flights_delayed)
	for f: AirportFlight in sim.flight_order: assert_eq(f.status, "departed")
	var short := AirportSimulation.new()
	short.setup(AirportSimulation.load_config("res://configs/airports/riverdale_shortage.json"))
	while short.clock.tick < 330000: short.step()
	assert_true(short.resource_metrics().flights_delayed > 8, "the shortage scenario cascades")
