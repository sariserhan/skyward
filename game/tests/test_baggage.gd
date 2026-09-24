extends TestCase
## M7: checked baggage. Persistent bags linked to passengers, logical processing
## stages, real unload/load turnaround tasks, reclaim, transfers, cutoff and
## holds. See docs/m7-plan.md.

const D := 40000
const ARRIVAL := 20000


## One 737 (F002) at A2: inbound at 3000 with 850‰ aboard, outbound at D with
## `load`‰ booked. Fast terminal; no turnaround variation; no connections.
## Every passenger checks exactly one bag unless `edit` says otherwise.
func fixture(load := 300, edit := Callable()) -> AirportSimulation:
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.start_tick = 0
	config.turnaround.variation_permille = 0
	var f: Dictionary = config.flights[1].duplicate(true)
	f.merge({"scheduled_arrival": 3000, "scheduled_departure": D, "assigned_gate_id": "A2", "load_permille": load,
		"inbound_load_permille": 850, "late_passengers": 0, "boarding_strategy": "window_middle_aisle"}, true)
	config.flights = [f]
	var flow: Dictionary = config.passenger_flow
	flow.erase("connections")
	flow.arrival_lead_min_ticks = 30000
	flow.arrival_lead_max_ticks = 34000
	flow.check_in_ticks = 1
	for cp in flow.checkpoints: cp.service_ticks = 20
	config.baggage.merge({"checked_permille": 1000, "airline_checked_permille": {}, "second_bag_permille": 0, "demo_bags": []}, true)
	if edit.is_valid(): edit.call(config)
	var sim := AirportSimulation.new()
	sim.setup(config)
	return sim


## M6's connection pair: FA (full 737 at A5, lands at ARRIVAL) connects the
## named seats to FB (737 at A2, departing at `departure`). Connectors check one
## bag each; nobody else does.
func connection_fixture(seats: Array, departure: int, edit := Callable()) -> AirportSimulation:
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.start_tick = 0
	config.turnaround.variation_permille = 0
	var a: Dictionary = config.flights[4].duplicate(true)
	a.merge({"id": "FA", "flight_number": "NS 900", "aircraft_type": "737", "assigned_gate_id": "A5",
		"scheduled_arrival": ARRIVAL, "scheduled_departure": ARRIVAL + 40000, "load_permille": 0, "inbound_load_permille": 1000,
		"late_passengers": 0, "inbound_delay_ticks": 0}, true)
	var b: Dictionary = config.flights[1].duplicate(true)
	b.merge({"id": "FB", "flight_number": "AW 900", "aircraft_type": "737", "assigned_gate_id": "A2",
		"scheduled_arrival": 3000, "scheduled_departure": departure, "load_permille": 17, "inbound_load_permille": 0,
		"late_passengers": 0, "boarding_strategy": "random", "inbound_delay_ticks": 0}, true)
	config.flights = [a, b]
	config.passenger_flow.connections = {"default_permille": 0, "demo_bank": [{"from": "FA", "to": "FB", "seats": seats}]}
	var fixed: Array = []
	for seat in seats: fixed.append({"flight": "FA", "seat": seat, "bags": 1})
	config.baggage.merge({"checked_permille": 0, "airline_checked_permille": {}, "demo_bags": fixed}, true)
	if edit.is_valid(): edit.call(config)
	var sim := AirportSimulation.new()
	sim.setup(config)
	return sim


func run_until(sim: AirportSimulation, predicate: Callable, limit := 90000) -> void:
	for _i in limit:
		if predicate.call(): return
		sim.step()


func connector(sim: AirportSimulation, seat: String) -> Passenger:
	for id in sim.airport.flights.FA.inbound_passenger_ids:
		var p: Passenger = sim.airport.passengers[str(id)]
		if p.journey_direction == "connecting" and AircraftDef.seat_key(int(p.itinerary_seats[0][0]), str(p.itinerary_seats[0][1])) == seat:
			return p
	return null


func bag_of(sim: AirportSimulation, p: Passenger) -> AirportBag:
	return sim.airport.bags[p.checked_bag_ids[0]]


func first_with_bag(sim: AirportSimulation, direction: String) -> Passenger:
	var ids: Array = []
	for key in sim.airport.passengers: ids.append(int(key))
	ids.sort()
	for id in ids:
		var p: Passenger = sim.airport.passengers[str(id)]
		if p.journey_direction == direction and not p.checked_bag_ids.is_empty(): return p
	return null


func bag_states(sim: AirportSimulation, bag: AirportBag, until: Callable) -> Array:
	var states: Array = []
	var id := bag.id
	for _i in 90000:
		assert_true(is_same(bag, sim.airport.bags[id]), "same bag object throughout")
		var key: String = bag.state + ("@" + bag.stage if bag.stage != "" else "")
		if states.is_empty() or states[-1] != key: states.append(key)
		if until.call(): break
		sim.step()
	return states


# --- generation ----------------------------------------------------------------

func test_bags_are_generated_deterministically_and_linked_to_one_passenger() -> void:
	var one := AirportSimulation.new()
	one.setup()
	var two := AirportSimulation.new()
	two.setup()
	assert_eq(JSON.stringify(one.snapshot().airport.bags), JSON.stringify(two.snapshot().airport.bags), "same seed, same bags")
	var owners := {}
	var per_passenger := {0: 0, 1: 0, 2: 0}
	for p: Passenger in one.airport.passengers.values():
		per_passenger[p.checked_bag_ids.size()] += 1
		for id in p.checked_bag_ids:
			assert_true(not owners.has(id), "a bag has one owner")
			owners[id] = p.id
			var bag: AirportBag = one.airport.bags[id]
			assert_eq(bag.passenger_id, p.id)
			var kind: String = {"departing": "originating", "arriving": "local", "connecting": "transfer"}[p.journey_direction]
			assert_eq(bag.kind, kind)
			assert_eq(bag.legs, p.itinerary_legs if kind == "transfer" else [p.current_flight_id] if kind == "originating" else bag.legs)
	assert_eq(owners.size(), one.airport.bags.size(), "every bag is owned")
	assert_true(per_passenger[0] > 0 and per_passenger[1] > 0 and per_passenger[2] > 0, "0, 1 and occasionally 2 bags: %s" % per_passenger)
	assert_true(per_passenger[2] < per_passenger[1] / 4, "two bags is occasional")
	var m := one.baggage_metrics()
	assert_true(m.bags_per_passenger > 0.3 and m.bags_per_passenger < 0.7, "bags per passenger %.2f" % m.bags_per_passenger)


func test_airline_probability_and_own_stream() -> void:
	var rate := func(sim: AirportSimulation, airline: String) -> float:
		var with := 0
		var total := 0
		for p: Passenger in sim.airport.passengers.values():
			if p.journey_direction != "departing" or sim.airport.flights[p.current_flight_id].airline_id != airline: continue
			total += 1
			if not p.checked_bag_ids.is_empty(): with += 1
		return float(with) / total
	var sim := AirportSimulation.new()
	sim.setup()
	assert_true(rate.call(sim, "GA") > rate.call(sim, "SJ") + 0.15, "GA (600‰) checks far more than SJ (300‰)")
	# The baggage stream is its own: turning bags off changes no passenger.
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.baggage.checked_permille = 0
	config.baggage.airline_checked_permille = {}
	config.baggage.demo_bags = []
	var none := AirportSimulation.new()
	none.setup(config)
	assert_eq(none.airport.bags.size(), 0)
	for key in sim.airport.passengers:
		var a: Dictionary = sim.airport.passengers[key].snapshot()
		var b: Dictionary = none.airport.passengers[key].snapshot()
		a.erase("checked_bag_ids")
		b.erase("checked_bag_ids")
		if a != b:
			assert_true(false, "passenger %s changed with bags off" % key)
			return


# --- outbound ------------------------------------------------------------------

func test_outbound_bag_lifecycle_same_object() -> void:
	var sim := fixture()
	var p := first_with_bag(sim, "departing")
	var bag := bag_of(sim, p)
	var f: AirportFlight = sim.airport.flights.F002
	var states := bag_states(sim, bag, func(): return f.status == "departed")
	assert_eq(states, ["created", "in_transit@outbound_sortation", "sorting@outbound_sortation", "ready_for_flight", "loading", "on_aircraft", "departed"])
	assert_true(bag.checked_tick >= 0 and bag.ready_tick > bag.checked_tick and bag.loaded_tick > bag.ready_tick)
	assert_eq(f.bags_loaded, sim.baggage.bags_for(f).size(), "every bag of a boarded passenger flew")


func test_unload_then_load_and_pushback_requires_baggage_load() -> void:
	var sim := fixture()
	var f: AirportFlight = sim.airport.flights.F002
	var unload := sim.turnaround.task(f, Turnaround.BAGGAGE_UNLOAD)
	var load := sim.turnaround.task(f, Turnaround.BAGGAGE_LOAD)
	run_until(sim, func(): return f.status == "departed")
	var inbound := 0
	for id in f.inbound_passenger_ids: inbound += sim.airport.passengers[str(id)].checked_bag_ids.size()
	assert_true(inbound > 50, "inbound bags to unload")
	var rates: Dictionary = sim.config.baggage.aircraft
	assert_eq(unload.finish_tick - unload.start_tick, int(rates.unload_base_ticks) + inbound * int(rates.unload_ticks_per_bag), "unload time comes from the bags")
	assert_eq(load.start_tick, unload.finish_tick, "loading starts once the hold is empty")
	assert_eq(load.started_after, Turnaround.BAGGAGE_UNLOAD)
	assert_true(load.finish_tick >= f.bag_finalized_tick and f.bag_finalized_tick >= f.gate_closed_tick, "finalized after the gate closed")
	assert_true(f.gate_release_tick >= load.finish_tick, "no pushback before the baggage is loaded")
	assert_true(f.departure_delay_breakdown.is_empty(), "normal baggage does not delay the flight: %s" % f.departure_delay_breakdown)


func test_slow_baggage_load_holds_departure_with_honest_blame() -> void:
	var sim := fixture(800, func(config): config.flights[0].baggage_overrides = {"load_ticks_per_bag": 400})
	var f: AirportFlight = sim.airport.flights.F002
	run_until(sim, func(): return f.status == "departed")
	var load := sim.turnaround.task(f, Turnaround.BAGGAGE_LOAD)
	assert_eq(f.gate_release_tick, load.finish_tick, "pushback the moment the last bag is in")
	var late := f.actual_departure - D
	assert_true(late > 3000, "baggage delays the flight")
	var total := 0
	for cause in f.departure_delay_breakdown: total += int(f.departure_delay_breakdown[cause])
	assert_eq(total, late, "breakdown is complete")
	assert_true(int(f.departure_delay_breakdown.get("baggage_load", 0)) > 3000, "blamed on baggage loading: %s" % f.departure_delay_breakdown)
	assert_true(not f.departure_delay_breakdown.has("boarding"), "boarding was on time")


func test_late_boarding_is_not_blamed_on_baggage() -> void:
	# Deep clean: boarding closes late, so loading finalizes late too. That wait
	# belongs to cleaning, not to baggage.
	var sim := fixture(300, func(config): config.flights[0].turnaround_overrides = {"cleaning": 30000})
	var f: AirportFlight = sim.airport.flights.F002
	run_until(sim, func(): return f.status == "departed")
	assert_true(f.actual_departure - D > 3000, "late")
	assert_true(int(f.departure_delay_breakdown.get("cleaning", 0)) > 3000, "cleaning is blamed: %s" % f.departure_delay_breakdown)
	assert_true(not f.departure_delay_breakdown.has("baggage_load") and not f.departure_delay_breakdown.has("baggage_unload"), "no false baggage blame")


func test_slow_but_non_critical_baggage_gets_no_blame() -> void:
	# A slow unload and loader that still finish inside the turnaround window.
	# Separately, a deep clean makes the flight late: none of that is baggage's.
	var sim := fixture(300, func(config):
		config.flights[0].baggage_overrides = {"unload_ticks_per_bag": 120, "load_ticks_per_bag": 90}
		config.flights[0].turnaround_overrides = {"cleaning": 30000})
	var f: AirportFlight = sim.airport.flights.F002
	var unload := sim.turnaround.task(f, Turnaround.BAGGAGE_UNLOAD)
	run_until(sim, func(): return f.status == "departed")
	assert_true(unload.finish_tick - unload.start_tick > int(sim.config.baggage.aircraft.unload_base_ticks) + 100 * 60, "the unload really was slow")
	assert_true(f.actual_departure - D > 3000, "the flight is late for another reason")
	assert_true(not f.departure_delay_breakdown.has("baggage_unload") and not f.departure_delay_breakdown.has("baggage_load"),
		"off the critical path: no baggage blame %s" % f.departure_delay_breakdown)


func test_same_seed_same_bags_and_timing() -> void:
	var one := fixture(600)
	var two := fixture(600)
	one.advance(45000)
	two.advance(45000)
	assert_eq(JSON.stringify(one.snapshot()), JSON.stringify(two.snapshot()), "identical bags, stages, loaders and timestamps")
	var loaded := 0
	for bag: AirportBag in one.airport.bags.values():
		if bag.loaded_tick >= 0: loaded += 1
	assert_true(loaded > 50, "the run actually moved bags")


func test_widebody_real_bags_aggregate_rates() -> void:
	var sim := fixture(300, func(config):
		config.flights[0].aircraft_type = "787"
		config.flights[0].assigned_gate_id = "A7")
	var f: AirportFlight = sim.airport.flights.F002
	run_until(sim, func(): return f.status == "departed")
	var unload := sim.turnaround.task(f, Turnaround.BAGGAGE_UNLOAD)
	var inbound := 0
	for id in f.inbound_passenger_ids: inbound += sim.airport.passengers[str(id)].checked_bag_ids.size()
	var per_bag := int(sim.config.baggage.aircraft_types["787"].unload_ticks_per_bag)
	assert_eq(unload.finish_tick - unload.start_tick, int(sim.config.baggage.aircraft.unload_base_ticks) + inbound * per_bag, "787 rate")
	assert_true(f.bags_loaded > 0 and f.bags_loaded == sim.baggage.bags_for(f).size(), "real bag objects fly on the widebody")
	var m := sim.baggage_metrics()
	assert_eq(m.collected, m.local, "every local bag collected")


# --- reclaim -------------------------------------------------------------------

func test_local_passenger_waits_at_reclaim_for_own_bag() -> void:
	var sim := fixture()
	# Bags come off in id order: the last one off keeps its owner waiting.
	var bag: AirportBag = null
	for b: AirportBag in sim.airport.bags.values():
		if b.kind == "local" and (bag == null or b.id > bag.id): bag = b
	var p: Passenger = sim.airport.passengers[str(bag.passenger_id)]
	var states: Array = []
	run_until(sim, func():
		if states.is_empty() or states[-1] != p.airport_state: states.append(p.airport_state)
		return p.airport_state == "left_airport")
	assert_eq(states, ["on_aircraft", "deboarding", "walking_to_reclaim", "waiting_at_reclaim", "walking_to_exit", "left_airport"])
	assert_eq(bag.state, "collected")
	assert_true(bag.at_reclaim_tick > p.reclaim_arrival_tick, "the bag arrived after its passenger")
	assert_eq(p.bags_collected_tick, bag.at_reclaim_tick, "collected the moment it arrived")
	assert_eq(bag.collected_tick, p.bags_collected_tick)
	assert_true(bag.unloaded_tick > 0 and bag.at_reclaim_tick > bag.unloaded_tick)


func test_passenger_without_bags_goes_straight_to_exit() -> void:
	var sim := fixture(300, func(config): config.baggage.checked_permille = 0)
	var f: AirportFlight = sim.airport.flights.F002
	run_until(sim, func(): return f.status == "departed")
	for id in f.inbound_passenger_ids:
		var p: Passenger = sim.airport.passengers[str(id)]
		assert_eq(p.airport_state, "left_airport")
		assert_eq(p.reclaim_arrival_tick, -1, "never stopped at reclaim")
		assert_eq(p.bags_collected_tick, -1)


func test_passenger_with_two_bags_waits_for_both() -> void:
	var sim := fixture(300, func(config): config.baggage.second_bag_permille = 1000)
	var p := first_with_bag(sim, "arriving")
	assert_eq(p.checked_bag_ids.size(), 2)
	run_until(sim, func(): return p.airport_state == "left_airport")
	var last := 0
	for id in p.checked_bag_ids: last = maxi(last, sim.airport.bags[id].at_reclaim_tick)
	assert_eq(p.bags_collected_tick, maxi(last, p.reclaim_arrival_tick), "leaves with both, not the first")


# --- transfers -----------------------------------------------------------------

func test_transfer_bag_follows_connector_as_same_object() -> void:
	var sim := connection_fixture(["1A"], 60000)
	var p := connector(sim, "1A")
	var bag := bag_of(sim, p)
	assert_eq(bag.kind, "transfer")
	assert_eq(bag.legs, ["FA", "FB"])
	var states := bag_states(sim, bag, func(): return sim.airport.flights.FB.status == "departed")
	# FB's loader is already open, so the bag goes straight from ready to loading.
	assert_eq(states, ["on_aircraft", "unloading", "in_transit@transfer_sortation", "sorting@transfer_sortation", "loading", "on_aircraft", "departed"])
	assert_true(bag.ready_tick > bag.unloaded_tick and bag.loaded_tick > bag.ready_tick)
	assert_eq(bag.current_flight_id, "FB")
	assert_eq(bag.leg_index, 1)
	assert_eq(p.connection_status, "made")
	assert_true(sim.bag_transfer_margin(bag) > 0, "made the bag cutoff with room")


func test_passenger_makes_connection_bag_does_not() -> void:
	# Case B: both passengers make FB, but the slow unload means the second bag
	# off misses the D-15 bag cutoff. Passenger and bag are independent.
	var seats := ["1A", "30F"]
	var departure := ARRIVAL + 18000
	var sim := connection_fixture(seats, departure, func(config):
		config.baggage.aircraft.unload_ticks_per_bag = 1500)
	run_until(sim, func(): return sim.airport.flights.FB.status == "departed")
	var front := connector(sim, "1A")
	var rear := connector(sim, "30F")
	assert_eq(front.connection_status, "made")
	assert_eq(rear.connection_status, "made")
	# Bags come off in id order: the first made it, the second did not.
	var bags := [bag_of(sim, front), bag_of(sim, rear)]
	bags.sort_custom(func(a, b): return a.id < b.id)
	assert_eq(bags[0].state, "departed", "the first bag off made it")
	var bag: AirportBag = bags[1]
	assert_eq(bag.state, "missed_connection", "the passenger flew, the bag did not")
	assert_eq(bag.missed_flight_id, "FB")
	assert_true(sim.bag_transfer_margin(bag) < 0, "bag margin negative while the passenger's was positive")
	assert_eq(sim.airport.flights.FB.bags_missed, 1)
	var m := sim.baggage_metrics()
	assert_eq(m.transfer_made, 1)
	assert_eq(m.transfer_missed, 1)


func test_passenger_misses_connection_bag_is_held() -> void:
	# Case C: FB closes before the connector can get there. The bag is not
	# flown without them, whichever reached the cutoff first.
	var sim := connection_fixture(["30F"], ARRIVAL + 9500)
	run_until(sim, func(): return sim.airport.flights.FB.status == "departed")
	var p := connector(sim, "30F")
	assert_eq(p.connection_status, "missed")
	var bag := bag_of(sim, p)
	assert_eq(bag.state, "held")
	assert_eq(bag.missed_reason, BaggageSystem.REASON_NOT_BOARDED)
	assert_eq(sim.airport.flights.FB.bags_loaded, 0)
	assert_eq(sim.airport.flights.FB.bags_missed, 0, "not a baggage miss")
	assert_eq(sim.airport.flights.FB.bags_held, 1)


func test_loaded_bag_of_no_show_is_offloaded_and_held() -> void:
	# Security jammed: passengers check bags in, the bags are loaded, but their
	# owners never reach the gate. Their bags come back off before pushback.
	var sim := fixture(100, func(config):
		for cp in config.passenger_flow.checkpoints:
			cp.service_ticks = 6000
			cp.open_lanes = 1)
	var f: AirportFlight = sim.airport.flights.F002
	run_until(sim, func(): return f.status == "departed")
	var offloaded := 0
	for event in sim.events.history:
		if event.type == "BAG_OFFLOADED": offloaded += 1
	assert_true(offloaded > 0, "some loaded bags were offloaded")
	for bag in sim.baggage.bags_for(f):
		var p: Passenger = sim.airport.passengers[str(bag.passenger_id)]
		if p.airport_state == "departed": assert_eq(bag.state, "departed")
		else: assert_eq(bag.state, "held", "no bag flies without its passenger")
	assert_eq(f.bags_loaded, sim.baggage_metrics().departed, "loaded count matches the hold")


func test_bag_cutoff_does_not_move_with_a_hold() -> void:
	var sim := fixture()
	var f: AirportFlight = sim.airport.flights.F002
	run_until(sim, func(): return f.boarding_phase == "open")
	var cutoff := f.bag_cutoff_tick
	assert_eq(cutoff, D - int(sim.config.baggage.bag_cutoff_before_departure_ticks))
	run_until(sim, func(): return sim.can_hold("F002"))
	assert_true(sim.hold_flight("F002"))
	assert_eq(f.bag_cutoff_tick, cutoff)


# --- congestion ----------------------------------------------------------------

func test_sortation_backlog_makes_bags_miss_and_is_visible() -> void:
	var sim := fixture(900, func(config):
		config.passenger_flow.arrival_lead_min_ticks = 11000
		config.passenger_flow.arrival_lead_max_ticks = 13000
		config.baggage.stages.outbound_sortation.merge({"servers": 1, "service_ticks": 150}, true))
	var f: AirportFlight = sim.airport.flights.F002
	var peak := [0]
	run_until(sim, func():
		peak[0] = maxi(peak[0], sim.baggage.stages.outbound_sortation.queue.size())
		return f.status == "departed")
	assert_true(peak[0] > 20, "a queue formed at sortation: %d" % peak[0])
	assert_true(f.bags_missed > 0, "the backlog missed the cutoff")
	# Missed bags still drain through sortation, then stop there.
	run_until(sim, func(): return sim.baggage.pending.is_empty())
	for bag in sim.baggage.bags_for(f):
		assert_true(bag.state in ["departed", "missed_flight", "held"], "no bag in limbo: " + bag.state)
		if bag.state == "missed_flight": assert_true(bag.ready_tick < 0 or bag.ready_tick > f.bag_cutoff_tick)


func test_no_bag_or_passenger_stuck_after_riverdale_morning() -> void:
	var sim := AirportSimulation.new()
	sim.setup()
	while sim.clock.tick < 330000: sim.step()
	var m := sim.baggage_metrics()
	assert_eq(m.in_processing, 0, "nothing left in processing")
	assert_eq(m.at_reclaim, 0, "nobody's bag left on the belt")
	assert_eq(m.collected, m.local)
	assert_eq(m.departed + m.transfer_missed + m.missed_flight + m.held, m.originating + m.transfer)
	assert_true(m.transfer_made >= 0.9 * m.transfer, "transfers mostly work: %d/%d" % [m.transfer_made, m.transfer])
	for f: AirportFlight in sim.flight_order:
		assert_eq(f.status, "departed")
		if f.id != "F006": assert_true(not f.departure_delay_breakdown.has("baggage_load"), f.flight_number + " not delayed by baggage")
	assert_true(int(sim.airport.flights.F006.departure_delay_breakdown.get("baggage_load", 0)) > 0, "the demo flight's slow loader delays it")
	for p: Passenger in sim.airport.passengers.values():
		assert_true(not p.airport_state in ["walking_to_reclaim", "waiting_at_reclaim"], "nobody stuck at reclaim")


# --- persistence ---------------------------------------------------------------

func test_save_mid_baggage_flow_resumes_identically() -> void:
	for at in [2400, 9000, 16000, 25000, 33000]:
		var original := fixture(600)
		original.advance(at)
		var data: Dictionary = JSON.parse_string(JSON.stringify(original.snapshot()))
		var resumed := AirportSimulation.from_snapshot(data)
		assert_true(resumed != null, "restores at %d" % at)
		if resumed == null: continue
		for _i in 45000 - at:
			original.step()
			resumed.step()
		assert_true(JSON.stringify(original.snapshot()) == JSON.stringify(resumed.snapshot()), "identical after save at %d" % at)


func test_save_while_bags_are_mid_stage_is_validated() -> void:
	var sim := fixture(600)
	var f: AirportFlight = sim.airport.flights.F002
	run_until(sim, func(): return not sim.baggage.stages.outbound_sortation.busy.is_empty())
	var good: Dictionary = JSON.parse_string(JSON.stringify(sim.snapshot()))
	run_until(sim, func(): return not f.bag_loader_current.is_empty())
	var loading: Dictionary = JSON.parse_string(JSON.stringify(sim.snapshot()))
	assert_true(AirportSimulation.from_snapshot(loading.duplicate(true)) != null, "a save mid-load loads")
	var twice: Dictionary = loading.duplicate(true)
	twice.airport.flights.F002.bag_load_queue.append(twice.airport.flights.F002.bag_loader_current)
	assert_true(AirportSimulation.from_snapshot(twice) == null, "rejected: loader loads a bag twice")
	assert_eq(int(good.version), 7)
	assert_true(AirportSimulation.from_snapshot(good.duplicate(true)) != null, "a valid mid-flow save loads")
	var old := good.duplicate(true)
	old.version = 6
	assert_true(AirportSimulation.from_snapshot(old) == null, "v6 is rejected")
	var mutations := {
		"bag state without its event": func(d):
			for id in d.airport.bags:
				if d.airport.bags[id].state == "sorting":
					d.airport.bags[id].state = "ready_for_flight"
					return,
		"bag owned by nobody": func(d):
			var bag: Dictionary = d.airport.bags.values()[0].duplicate()
			bag.id = "BAG_999999"
			d.airport.bags["BAG_999999"] = bag,
		"server slot out of range": func(d):
			var busy: Dictionary = d.baggage.stages.outbound_sortation.busy
			var key: String = busy.keys()[0]
			busy["99"] = busy[key]
			busy.erase(key),
		"event in the past": func(d): d.baggage.pending[0].tick = 0,
		"missing baggage block": func(d): d.erase("baggage"),
	}
	for label in mutations:
		var bad: Dictionary = good.duplicate(true)
		mutations[label].call(bad)
		assert_true(AirportSimulation.from_snapshot(bad) == null, "rejected: " + label)
