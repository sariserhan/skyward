extends TestCase
## M6: connecting passengers. Same Passenger from the inbound seat to the
## outbound seat; the outbound gate close and holds decide. See docs/m6-plan.md.

const ARRIVAL := 20000


## Inbound FA: a full 737 at A5 landing at ARRIVAL. Outbound FB: a 737 already
## at its gate, departing at `departure`, carrying only connectors named by
## inbound seat. Real walking times; no turnaround variation.
func fixture(seats: Array, departure: int, edit := Callable(), b_gate := "A2") -> AirportSimulation:
	var config := JsonUtil.load_file(AirportSimulation.CONFIG_PATH)
	config.start_tick = 0
	config.turnaround.variation_permille = 0
	var a: Dictionary = config.flights[4].duplicate(true)
	a.merge({"id": "FA", "flight_number": "NS 900", "aircraft_type": "737", "assigned_gate_id": "A5",
		"scheduled_arrival": ARRIVAL, "scheduled_departure": ARRIVAL + 40000, "load_permille": 0, "inbound_load_permille": 1000,
		"late_passengers": 0, "inbound_delay_ticks": 0}, true)
	var b: Dictionary = config.flights[1].duplicate(true)
	b.merge({"id": "FB", "flight_number": "AW 900", "aircraft_type": "737", "assigned_gate_id": b_gate,
		"scheduled_arrival": 3000, "scheduled_departure": departure, "load_permille": 0, "inbound_load_permille": 0,
		"late_passengers": 0, "boarding_strategy": "random", "inbound_delay_ticks": 0}, true)
	config.flights = [a, b]
	config.passenger_flow.connections = {"default_permille": 0, "demo_bank": [{"from": "FA", "to": "FB", "seats": seats}]}
	if edit.is_valid(): edit.call(config)
	var sim := AirportSimulation.new()
	sim.setup(config)
	return sim


func connector(sim: AirportSimulation, seat: String) -> Passenger:
	for id in sim.airport.flights.FA.inbound_passenger_ids:
		var p: Passenger = sim.airport.passengers[str(id)]
		if p.journey_direction == "connecting" and p.itinerary_seats[0][0] == int(seat.to_int()) and p.itinerary_seats[0][1] == seat.right(1):
			return p
	return null


func run_until(sim: AirportSimulation, predicate: Callable, limit := 90000) -> void:
	for _i in limit:
		if predicate.call(): return
		sim.step()


func depart(sim: AirportSimulation) -> void:
	run_until(sim, func(): return sim.airport.flights.FB.status == "departed")


## When the rear connector reaches FB's gate with a generous schedule.
func arrival_of(seat: String, edit := Callable(), b_gate := "A2") -> int:
	var sim := fixture([seat], 60000, edit, b_gate)
	var p := connector(sim, seat)
	run_until(sim, func(): return p.gate_arrival_time >= 0)
	return p.gate_arrival_time


func test_same_passenger_from_one_aircraft_onto_another() -> void:
	var sim := fixture(["14C"], 60000)
	var p := connector(sim, "14C")
	assert_true(p != null, "connector generated")
	var id := p.id
	var states: Array = []
	while sim.airport.flights.FB.status != "departed":
		sim.step()
		assert_true(is_same(p, sim.airport.passengers[str(id)]), "same object")
		var key: String = "%s@%s" % [p.airport_state, p.current_flight_id]
		if states.is_empty() or states[-1] != key: states.append(key)
	assert_eq(states, ["on_aircraft@FA", "deboarding@FA", "walking_to_gate@FB", "waiting_at_gate@FB", "boarding@FB", "on_aircraft@FB", "departed@FB"])
	assert_eq(p.connection_status, "made")
	assert_eq(p.state, Passenger.State.SEATED, "seated in the second cabin")
	assert_eq(p.seat_key(), AircraftDef.seat_key(p.itinerary_seats[1][0], p.itinerary_seats[1][1]), "in the outbound seat")
	assert_true(p.seat_key() != "14C" or p.itinerary_seats[1][1] == "C", "seat switched to the next leg")
	var kinds: Array = []
	for event in sim.events.history:
		if event.details.get("passenger_id", -1) == id: kinds.append(event.type)
	assert_eq(kinds, ["PASSENGER_DEPLANED", "PASSENGER_GATE_ARRIVE", "PASSENGER_BOARDING", "PASSENGER_ON_AIRCRAFT", "CONNECTION_MADE"])


func test_manifests_and_never_on_two_aircraft() -> void:
	var sim := fixture(["3A", "14C", "28F"], 60000)
	var a: AirportFlight = sim.airport.flights.FA
	var b: AirportFlight = sim.airport.flights.FB
	for seat in ["3A", "14C", "28F"]:
		var p := connector(sim, seat)
		assert_eq(a.inbound_passenger_ids.count(p.id), 1, "inbound manifest once")
		assert_eq(b.passenger_ids.count(p.id), 1, "on the outbound manifest from the start")
		assert_true(not a.passenger_ids.has(p.id))
	assert_eq(b.passenger_ids.size(), 3)
	var both := false
	while b.status != "departed":
		sim.step()
		var deboarding: FlightDeboarding = sim.deboarding_sessions.get("FA")
		var boarding: FlightBoarding = sim.boarding_sessions.get("FB")
		for id in b.passenger_ids:
			var p: Passenger = sim.airport.passengers[str(id)]
			var in_a: bool = deboarding != null and not id in deboarding.engine.exited
			var in_b: bool = boarding != null and id in boarding.engine.queue
			if in_a and in_b: both = true
			if in_b and p.current_flight_id != "FB": both = true
	assert_true(not both, "never in both cabins")
	assert_eq(b.connections_made, 3)


func test_missed_connection_strands_passenger_at_closed_gate() -> void:
	var reach := arrival_of("28A")
	# FB closes 3 minutes before the rear connector can get there.
	var sim := fixture(["28A"], reach - 1800 + 6000)
	var p := connector(sim, "28A")
	depart(sim)
	assert_eq(p.connection_status, "missed")
	assert_eq(p.missed_flight_id, "FB")
	run_until(sim, func(): return p.airport_state == "missed_connection")
	assert_eq(p.airport_state, "missed_connection", "not a generic missed flight")
	assert_eq(p.current_location, "A2", "stranded at the closed gate, not teleported")
	assert_eq(p.boarding_admit_tick, -1, "never boarded")
	var report := sim.connection_report(p)
	assert_true(str(report.decisive).contains("gate closed without a hold"), str(report.decisive))
	assert_true(int(report.reached_gate) > int(report.gate_close))
	assert_eq(sim.airport.flights.FB.connections_missed, 1)


func test_hold_saves_the_connection_at_an_operational_cost() -> void:
	var reach := arrival_of("28A")
	var departure := reach + 6000 - 1200   # gate closes 2 min before they arrive
	var results := {}
	for hold in [false, true]:
		var sim := fixture(["28A"], departure)
		var b: AirportFlight = sim.airport.flights.FB
		if hold:
			run_until(sim, func(): return b.boarding_phase == "open" and sim.clock.tick >= b.gate_close_tick - 600)
			assert_true(sim.missing_connectors(b).size() == 1 and sim.boarding_alerts()[0].connecting == 1, "the player sees who is missing")
			assert_true(sim.hold_flight("FB"))
		depart(sim)
		results[hold] = {"status": connector(sim, "28A").connection_status, "departure": b.actual_departure,
			"release": b.gate_release_tick, "breakdown": b.departure_delay_breakdown}
	assert_eq(results[false].status, "missed", "no hold: misses")
	assert_eq(results[true].status, "made", "hold +5: makes it")
	assert_lt(results[false].departure, results[true].departure, "the hold delays the departure")
	assert_lt(results[false].release, results[true].release, "and keeps the gate longer")
	assert_true(int(results[true].breakdown.get("passenger_hold", 0)) > 0, str(results[true].breakdown))


func test_early_inbound_connects_with_room_to_spare() -> void:
	var sim := fixture(["3A"], 60000)
	var p := connector(sim, "3A")
	depart(sim)
	assert_eq(p.connection_status, "made")
	assert_true(sim.connection_metrics().min_margin_ticks > 18000, "a comfortable margin")


func test_late_inbound_turns_a_connection_into_a_miss() -> void:
	var reach := arrival_of("14C")
	var departure := reach + 6000 + 1800   # 3 min to spare when on time
	var on_time := fixture(["14C"], departure)
	depart(on_time)
	assert_eq(connector(on_time, "14C").connection_status, "made")
	var late := fixture(["14C"], departure, func(config): config.flights[0].inbound_delay_ticks = 4800)
	var p := connector(late, "14C")
	depart(late)
	assert_eq(p.connection_status, "missed", "an 8 min late inbound")
	assert_true(str(late.connection_report(p).decisive).begins_with("inbound flight arrived late"), str(late.connection_report(p).decisive))


func test_slow_deboarding_turns_a_connection_into_a_miss() -> void:
	var reach := arrival_of("28A")
	var departure := reach + 6000 + 1200
	var normal := fixture(["28A"], departure)
	depart(normal)
	assert_eq(connector(normal, "28A").connection_status, "made")
	var slow := fixture(["28A"], departure, func(config): config.flights[0].deboarding_overrides = {"door_interval_ticks": 400})
	var p := connector(slow, "28A")
	depart(slow)
	assert_eq(p.connection_status, "missed", "a badly restricted jet-bridge door")
	assert_true(str(slow.connection_report(p).decisive).begins_with("deboarding took long"), str(slow.connection_report(p).decisive))


func test_gate_distance_decides_a_tight_connection() -> void:
	var near := arrival_of("14C", Callable(), "A6")
	var far := arrival_of("14C", Callable(), "A2")
	assert_lt(near + 1200, far, "A5 to A6 is a much shorter walk than A5 to A2")
	var departure := near + 6000 + 600   # close 1 min after the near-gate arrival
	var sim_near := fixture(["14C"], departure, Callable(), "A6")
	depart(sim_near)
	var sim_far := fixture(["14C"], departure, Callable(), "A2")
	depart(sim_far)
	assert_eq(connector(sim_near, "14C").connection_status, "made", "near gate")
	assert_eq(connector(sim_far, "14C").connection_status, "missed", "far gate")


func test_save_mid_connection_resumes_identically() -> void:
	for phase in ["deboarding", "walking_to_gate", "waiting_at_gate", "boarding"]:
		var outcomes: Array = []
		for interrupt in [false, true]:
			var sim := fixture(["3A", "14C", "28F"], 60000)
			var p := connector(sim, "14C")
			run_until(sim, func(): return p.airport_state == phase)
			if interrupt:
				var restored := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot())))
				assert_true(restored != null, "restores while " + phase)
				if restored == null: return
				sim = restored
			depart(sim)
			var people: Array = []
			for id in sim.airport.flights.FB.passenger_ids:
				var q: Passenger = sim.airport.passengers[str(id)]
				people.append([q.id, q.connection_status, q.gate_arrival_time, q.seated_airport_tick, q.seat_key(), q.airport_state])
			outcomes.append({"people": people, "events": sim.events.history, "departure": sim.airport.flights.FB.actual_departure})
		assert_eq(JSON.stringify(outcomes[1]), JSON.stringify(outcomes[0]), "resumed while %s diverged" % phase)


func test_same_seed_same_connections() -> void:
	var runs: Array = []
	for _i in 2:
		var sim := fixture([], 60000, func(config): config.passenger_flow.connections = {"default_permille": 250})
		depart(sim)
		var rows: Array = []
		for id in sim.airport.flights.FB.passenger_ids:
			var p: Passenger = sim.airport.passengers[str(id)]
			rows.append([p.id, p.itinerary_seats, p.connection_status, p.gate_arrival_time])
		runs.append(rows)
	assert_true(runs[0].size() > 20, "a rate-generated bank: %d" % runs[0].size())
	assert_eq(JSON.stringify(runs[1]), JSON.stringify(runs[0]))


func test_widebody_connectors_leave_the_abstraction_for_their_gate() -> void:
	var sim := fixture([], 60000, func(config):
		config.flights[0].aircraft_type = "787"
		config.flights[0].assigned_gate_id = "A7"
		config.passenger_flow.connections = {"default_permille": 150})
	var a: AirportFlight = sim.airport.flights.FA
	var connectors: Array = []
	for id in a.inbound_passenger_ids:
		if sim.airport.passengers[str(id)].journey_direction == "connecting": connectors.append(sim.airport.passengers[str(id)])
	assert_true(connectors.size() > 10, "787 arrivals connect too")
	var t := sim.turnaround.task(a, Turnaround.DEBOARDING)
	run_until(sim, func(): return t.status == TurnaroundTask.COMPLETE)
	for p in connectors:
		assert_eq(p.airport_state, "walking_to_gate", "routed to the connecting gate, not the exit")
		assert_eq(p.current_flight_id, "FB")
		assert_eq(p.deplaned_airport_tick, t.finish_tick)
	depart(sim)
	for p in connectors: assert_eq(p.connection_status, "made")


func test_riverdale_itineraries_are_valid_and_the_demo_bank_is_decisive() -> void:
	var sim := AirportSimulation.new()
	sim.setup()
	var count := 0
	for p: Passenger in sim.airport.passengers.values():
		if p.journey_direction != "connecting": continue
		count += 1
		var a: AirportFlight = sim.airport.flights[p.itinerary_legs[0]]
		var b: AirportFlight = sim.airport.flights[p.itinerary_legs[1]]
		assert_true(a.id != b.id and b.scheduled_departure > a.scheduled_arrival and b.destination != a.origin, "P%d itinerary" % p.id)
		assert_eq(b.passenger_ids.count(p.id), 1)
		assert_eq(p.origin, a.origin)
		assert_eq(p.destination, b.destination)
	var arriving := 0
	for f: AirportFlight in sim.flight_order: arriving += f.inbound_passenger_ids.size()
	assert_true(count > arriving * 8 / 100 and count < arriving * 20 / 100, "%d of %d arrivals connect" % [count, arriving])
	# Demo bank: NS 249 (18 min late) connects four passengers to AW 228.
	var b: AirportFlight = sim.airport.flights.F002
	var bank: Array = []
	for id in b.passenger_ids:
		var p: Passenger = sim.airport.passengers[str(id)]
		if p.journey_direction == "connecting" and p.itinerary_legs[0] == "F005": bank.append(p)
	assert_true(bank.size() >= 4, "demo bank on AW 228")
	depart_flight(sim, b)
	var made := 0
	var missed := 0
	for p in bank:
		if p.connection_status == "made": made += 1
		elif p.connection_status == "missed": missed += 1
	assert_true(made >= 2 and missed >= 2, "without a hold some make it, some miss: %d / %d" % [made, missed])


func depart_flight(sim: AirportSimulation, f: AirportFlight) -> void:
	run_until(sim, func(): return f.status == "departed", 200000)
