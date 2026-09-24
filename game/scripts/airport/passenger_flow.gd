class_name PassengerFlow
extends RefCounted
## Events are scheduled on the airport's integer clock, not a second clock.
const JOURNEY_STATES := ["not_arrived", "walking_to_check_in", "check_in", "walking_to_security",
	"security_queue", "security_processing", "walking_to_gate", "waiting_at_gate", "route_blocked",
	"boarding", "on_aircraft", "departed", "missed_flight",
	"deboarding", "walking_to_exit", "left_airport", "missed_connection"]
## Journey states of arriving passengers (M5).
const ARRIVING_STATES := ["on_aircraft", "deboarding", "walking_to_exit", "left_airport"]
## Journey states of a connecting passenger on each leg (M6).
const CONNECTING_STATES := [["on_aircraft", "deboarding"],
	["walking_to_gate", "waiting_at_gate", "route_blocked", "boarding", "on_aircraft", "departed", "missed_connection"]]
## Journey states with no pending terminal event (the passenger is not moving).
const RESTING_STATES := ["waiting_at_gate", "security_queue", "route_blocked",
	"boarding", "on_aircraft", "departed", "missed_flight", "deboarding", "left_airport", "missed_connection"]
var airport: AirportState
var events: AirportEvents
var graph := TerminalGraph.new()
var config: Dictionary = {}
var pending: Array = []
var sequence: int = 0
var counts: Dictionary = {}
var rng := SimRng.new(0)
var ready_by_flight: Dictionary = {}
## Passenger ids that reached their gate this tick, drained by boarding each tick.
var gate_arrivals: Array = []

func bind(state: AirportState, event_bus: AirportEvents, settings: Dictionary) -> void:
	airport = state
	events = event_bus
	config = settings.duplicate(true)
	graph.setup(config.get("graph", {}))

## `cabins` maps aircraft type -> AircraftDef for types that board in the cabin
## engine; their passengers get seats and boarding-tick durations from a
## separate RNG stream so terminal-flow draws are unchanged.
## Generation order (M6 closeout, D-034): each flight's target bookings
## (capacity × load, the load meaning total bookings) and outbound seat order;
## inbound passengers; connectors, taking booked seats within each target; then
## local (originating) passengers for exactly the seats that remain. Connections
## change a flight's passenger mix, never its size.
func generate(seed_value: int, now: int, flights: Array[AirportFlight], cabins: Dictionary = {},
		cabin_config: SimConfig = null, gate_close_offset: int = 0, deboarding: Dictionary = {}, deboard_plans: Dictionary = {}) -> void:
	if config.is_empty(): return
	rng = SimRng.new(seed_value, SimRng.STREAM_PASSENGERS)
	var cabin_rng := SimRng.new(seed_value, SimRng.STREAM_CABIN)
	var load_rng := SimRng.new(seed_value, SimRng.STREAM_LOAD)
	for data in config.checkpoints:
		var checkpoint := SecurityCheckpoint.new()
		checkpoint.restore(data)
		airport.security_checkpoints[checkpoint.id] = checkpoint
	var booked := {}
	for f in flights:
		var aircraft: AirportAircraft = airport.aircraft[f.aircraft_id]
		# Always draw, so an explicit override does not shift other flights' loads.
		var drawn := _draw_load(f, load_rng)
		if f.load_permille < 0: f.load_permille = drawn
		var target := int(aircraft.seat_capacity * f.load_permille / 1000)
		var cabin: AircraftDef = cabins.get(aircraft.aircraft_type_id)
		var seats: Array = []
		if cabin != null:
			seats = cabin.all_seats()
			cabin_rng.shuffle(seats)
			target = mini(target, seats.size())
			seats = seats.slice(0, target)
		f.target_bookings = target
		# The booked-seat pool: connectors take seats from it first, locals the rest.
		booked[f.id] = {"seats": seats, "left": target, "cabin": cabin}
	var next_id := _generate_inbound(seed_value, 1, flights, cabins, deboarding)
	_generate_connections(seed_value, flights, cabin_config, deboard_plans, gate_close_offset, booked)
	for f in flights:
		var pool: Dictionary = booked[f.id]
		var cabin: AircraftDef = pool.cabin
		var count: int = pool.left
		f.connecting_bookings = f.passenger_ids.size()
		f.originating_bookings = count
		var earliest := maxi(now + 1, f.scheduled_departure - int(config.arrival_lead_max_ticks))
		var latest := maxi(earliest, f.scheduled_departure - int(config.arrival_lead_min_ticks))
		ready_by_flight[f.id] = 0
		for i in count:
			var p := Passenger.new()
			p.id = next_id
			next_id += 1
			p.current_flight_id = f.id
			p.itinerary_id = "IT_%d" % p.id
			p.origin = airport.id
			p.destination = f.destination
			p.walking_speed = rng.randi_range(800, 1200)
			p.carry_on_count = rng.randi_range(0, 2)
			p.arrival_time_at_airport = rng.randi_range(earliest, latest)
			p.gate_target_tick = f.scheduled_departure - int(config.gate_target_buffer_ticks)
			p.security_checkpoint_id = _choose_checkpoint(f.assigned_gate_id)
			if i >= count - f.late_passengers:
				# Demonstration: reaches the airport as the gate closes.
				p.arrival_time_at_airport = maxi(now + 1, f.scheduled_departure - gate_close_offset)
			if cabin != null:
				var seat: Array = pool.seats[i]
				p.seat_row = seat[0]
				p.seat_letter = seat[1]
				p.seat_type = cabin.seat_type_of(p.seat_letter)
				p.side = cabin.side_of(p.seat_letter)
				PassengerGenerator.apply_cabin_timing(p, cabin_config, cabin_rng)
			airport.passengers[str(p.id)] = p
			f.passenger_ids.append(p.id)
			counts["not_arrived"] = int(counts.get("not_arrived", 0)) + 1
			_schedule(p, p.arrival_time_at_airport, "arrive")

## Arriving passengers, from their own stream: load, seats, speed, bags and
## deboarding timings. Returns the next free passenger id.
func _generate_inbound(seed_value: int, next_id: int, flights: Array[AirportFlight], cabins: Dictionary, deboarding: Dictionary) -> int:
	var inbound_rng := SimRng.new(seed_value, SimRng.STREAM_INBOUND)
	for f in flights:
		var aircraft: AirportAircraft = airport.aircraft[f.aircraft_id]
		var drawn := _draw_load(f, inbound_rng)
		if f.inbound_load_permille < 0: f.inbound_load_permille = drawn
		var count := int(aircraft.seat_capacity * f.inbound_load_permille / 1000)
		var seats: Array = []
		var cabin: AircraftDef = cabins.get(aircraft.aircraft_type_id)
		if cabin != null:
			seats = cabin.all_seats()
			inbound_rng.shuffle(seats)
			count = mini(count, seats.size())
		var timings: Dictionary = deboarding.duplicate()
		timings.merge(f.deboarding_overrides, true)
		for i in count:
			var p := Passenger.new()
			p.id = next_id
			next_id += 1
			p.journey_direction = "arriving"
			p.current_flight_id = f.id
			p.itinerary_id = "IT_%d" % p.id
			p.origin = f.origin
			p.destination = airport.id
			p.walking_speed = inbound_rng.randi_range(800, 1200)
			p.carry_on_count = inbound_rng.randi_range(0, 2)
			p.airport_state = "on_aircraft"
			if cabin != null:
				p.seat_row = seats[i][0]
				p.seat_letter = seats[i][1]
				p.seat_type = cabin.seat_type_of(p.seat_letter)
				p.side = cabin.side_of(p.seat_letter)
				DeboardingSimulation.apply_timing(p, timings, inbound_rng)
			airport.passengers[str(p.id)] = p
			f.inbound_passenger_ids.append(p.id)
			counts["on_aircraft"] = int(counts.get("on_aircraft", 0)) + 1
	return next_id

## Connecting itineraries (M6). Each arriving passenger may connect, at the
## arriving airline's rate, onto a flight they could make under ideal
## conditions: their share of the planned deboarding plus the ideal gate-to-gate
## walk before its scheduled gate close. Connectors take booked seats within the
## target (`booked`), never beyond it, and join that flight's manifest now: the
## airline expects them. A scenario demo_bank names exact inbound seats.
func _generate_connections(seed_value: int, flights: Array[AirportFlight], cabin_config: SimConfig,
		plans: Dictionary, close_offset: int, booked: Dictionary) -> void:
	var settings: Dictionary = config.get("connections", {})
	if settings.is_empty(): return
	var rng := SimRng.new(seed_value, SimRng.STREAM_CONNECTION)
	var free := booked
	var banked := {}
	for entry in settings.get("demo_bank", []):
		if not airport.flights.has(entry.from) or not airport.flights.has(entry.to): continue
		var a: AirportFlight = airport.flights[entry.from]
		for seat in entry.seats:
			for id in a.inbound_passenger_ids:
				var p: Passenger = airport.passengers[str(id)]
				if p.seat_key() == seat and free[entry.to].left > 0:
					_connect(p, a, airport.flights[entry.to], free[entry.to], rng.randi_range(0, 1_000_000), cabin_config, rng)
					banked[p.id] = true
	var by_airline: Dictionary = settings.get("airline_permille", {})
	for a in flights:
		var permille := int(by_airline.get(a.airline_id, settings.get("default_permille", 0)))
		for id in a.inbound_passenger_ids:
			# Both draws always happen, so one passenger's outcome never shifts another's.
			var roll := rng.randi_range(0, 999)
			var pick := rng.randi_range(0, 1_000_000)
			if banked.has(id) or roll >= permille: continue
			var p: Passenger = airport.passengers[str(id)]
			var candidates: Array = []
			for b in flights:
				if free[b.id].left > 0 and _reachable(p, a, b, plans, close_offset, int(settings.get("max_connection_ticks", 0))):
					candidates.append(b)
			if candidates.is_empty(): continue
			var b: AirportFlight = candidates[pick % candidates.size()]
			_connect(p, a, b, free[b.id], pick, cabin_config, rng)

## Could this passenger make flight b under ideal conditions? `plans` holds each
## flight's planned deboarding [start, finish] and cabin rows.
func _reachable(p: Passenger, a: AirportFlight, b: AirportFlight, plans: Dictionary, close_offset: int, max_ticks: int) -> bool:
	if b.id == a.id or b.destination == a.origin or b.scheduled_departure <= a.scheduled_arrival: return false
	if max_ticks > 0 and b.scheduled_departure - a.scheduled_arrival > max_ticks: return false
	var plan: Array = plans.get(a.id, [a.scheduled_arrival, a.scheduled_arrival, 0])
	# Front rows are off first: their share of the planned deboarding.
	var deplane: int = int(plan[1])
	if p.seat_row > 0 and int(plan[2]) > 0:
		deplane = int(plan[0]) + (int(plan[1]) - int(plan[0])) * (p.seat_row - 1) / int(plan[2])
	var walk := graph.route_ticks(graph.route(a.assigned_gate_id, b.assigned_gate_id, true))
	return walk >= 0 and deplane + walk <= b.scheduled_departure - close_offset

func _connect(p: Passenger, a: AirportFlight, b: AirportFlight, seats: Dictionary, pick: int, cabin_config: SimConfig, rng: SimRng) -> void:
	var inbound_seat: Array = [] if p.seat_row <= 0 else [p.seat_row, p.seat_letter, p.seat_type, p.side]
	var outbound_seat: Array = []
	var cabin: AircraftDef = seats.cabin
	if cabin != null and not seats.seats.is_empty():
		var seat: Array = seats.seats.pop_at(pick % seats.seats.size())
		outbound_seat = [seat[0], seat[1], cabin.seat_type_of(seat[1]), cabin.side_of(seat[1])]
		PassengerGenerator.apply_cabin_timing(p, cabin_config, rng)
	seats.left -= 1
	p.journey_direction = "connecting"
	p.itinerary_legs = [a.id, b.id]
	p.itinerary_seats = [inbound_seat, outbound_seat]
	p.leg_index = 0
	p.connection_status = "pending"
	p.connection_flight_id = b.id
	p.destination = b.destination
	p.gate_target_tick = b.scheduled_departure - int(config.get("gate_target_buffer_ticks", 0))
	# Airside from the moment they leave the aircraft: no re-screening.
	p.security_cleared = true
	b.passenger_ids.append(p.id)

## A connector has left the inbound aircraft at `gate`: next leg, next seat,
## walking airside to the connecting flight's gate. Same passenger throughout.
func transfer_to_connection(p: Passenger, gate: String, now: int) -> void:
	p.current_location = gate
	p.deplaned_airport_tick = now
	p.leg_index = 1
	p.current_flight_id = p.itinerary_legs[1]
	var seat: Array = p.itinerary_seats[1]
	p.seat_row = 0 if seat.is_empty() else int(seat[0])
	p.seat_letter = "" if seat.is_empty() else str(seat[1])
	if not seat.is_empty():
		p.seat_type = int(seat[2])
		p.side = int(seat[3])
	p.state = Passenger.State.WAITING
	p.aisle_position = -1
	_emit(now, "PASSENGER_DEPLANED", p, {"gate_id": gate, "connecting_to": p.current_flight_id})
	_begin_walk(p, "walking_to_gate", airport.flights[p.current_flight_id].assigned_gate_id, now)

## A passenger has left the aircraft at `gate`: into the terminal, toward the exit.
func arrive_from_aircraft(p: Passenger, gate: String, now: int) -> void:
	p.current_location = gate
	p.deplaned_airport_tick = now
	_emit(now, "PASSENGER_DEPLANED", p, {"gate_id": gate})
	_begin_walk(p, "walking_to_exit", str(config.get("exit_node", "airport_exit")), now)

## Load factor in permille: the airline's range, else the scenario range, else
## the flat scenario default.
func _draw_load(f: AirportFlight, load_rng: SimRng) -> int:
	var bounds: Array = config.get("airline_load_permille_ranges", {}).get(f.airline_id, config.get("load_permille_range", []))
	if bounds.size() != 2: return int(config.load_permille)
	return load_rng.randi_range(int(bounds[0]), int(bounds[1]))

func _choose_checkpoint(gate: String) -> String:
	var best := ""
	var shortest := 2147483647
	var ids := airport.security_checkpoints.keys()
	ids.sort()
	for id in ids:
		var checkpoint: SecurityCheckpoint = airport.security_checkpoints[id]
		var landside := graph.route("check_in", checkpoint.node_id)
		var airside := graph.route(checkpoint.node_id, gate, true)
		if landside.is_empty() or airside.is_empty(): continue
		var duration := graph.route_ticks(landside) + graph.route_ticks(airside)
		if duration < shortest:
			shortest = duration
			best = id
	return best

func step(now: int) -> void:
	while not pending.is_empty() and int(pending[0].tick) <= now:
		var event := _pop()
		var p: Passenger = airport.passengers[str(event.passenger_id)]
		p.flow_due_tick = -1
		match event.kind:
			"arrive":
				p.current_location = "entrance"
				_emit(now, "PASSENGER_TERMINAL_ENTER", p)
				_begin_walk(p, "walking_to_check_in", "check_in", now)
			"walk":
				p.current_location = p.walk_to
				p.walk_from = ""
				p.walk_to = ""
				_continue_walk(p, now)
			"check_in":
				if p.security_checkpoint_id.is_empty():
					_set_state(p, "route_blocked")
				else:
					_begin_walk(p, "walking_to_security", airport.security_checkpoints[p.security_checkpoint_id].node_id, now)
			"security":
				_finish_security(p, now)

## Journey transitions made by boarding. Keeps counts and gate-ready caches exact.
func set_journey_state(p: Passenger, state: String) -> void:
	if p.airport_state == "waiting_at_gate" and state != "waiting_at_gate":
		ready_by_flight[p.current_flight_id] = int(ready_by_flight[p.current_flight_id]) - 1
	_set_state(p, state)

func _set_state(p: Passenger, state: String) -> void:
	counts[p.airport_state] = int(counts.get(p.airport_state, 0)) - 1
	p.airport_state = state
	counts[state] = int(counts.get(state, 0)) + 1

func _emit(now: int, kind: String, p: Passenger, details: Dictionary = {}) -> void:
	details = details.duplicate(true)
	details["passenger_id"] = p.id
	events.record(now, kind, p.current_flight_id, details)

func _begin_walk(p: Passenger, state: String, goal: String, now: int) -> void:
	_set_state(p, state)
	p.route_goal = goal
	p.terminal_route = []
	_continue_walk(p, now)

func _continue_walk(p: Passenger, now: int) -> void:
	if p.airport_state == "walking_to_gate":
		p.route_goal = airport.flights[p.current_flight_id].assigned_gate_id
	if p.current_location == p.route_goal:
		match p.airport_state:
			"walking_to_check_in":
				_set_state(p, "check_in")
				_schedule(p, now + int(config.check_in_ticks), "check_in")
			"walking_to_security":
				var cp: SecurityCheckpoint = airport.security_checkpoints[p.security_checkpoint_id]
				_set_state(p, "security_queue")
				p.security_queue_enter_tick = now
				cp.queue.append(p.id)
				_emit(now, "PASSENGER_SECURITY_ENTER", p, {"checkpoint": cp.id})
				_dispatch(cp, now)
			"walking_to_exit":
				_set_state(p, "left_airport")
				p.left_airport_tick = now
				_emit(now, "PASSENGER_LEFT_AIRPORT", p)
			"walking_to_gate":
				p.gate_arrival_time = now
				if not p.missed_flight_id.is_empty():
					# The gate closed while they were on the way: they arrive, never board.
					_set_state(p, "missed_connection" if p.journey_direction == "connecting" else "missed_flight")
					_emit(now, "PASSENGER_GATE_ARRIVE", p, {"gate_id": p.current_location, "missed_flight": true})
					return
				_set_state(p, "waiting_at_gate")
				gate_arrivals.append(p.id)
				ready_by_flight[p.current_flight_id] = int(ready_by_flight.get(p.current_flight_id, 0)) + 1
				p.risk_flags.erase("late_to_gate")
				if now > p.gate_target_tick: p.risk_flags.append("late_to_gate")
				_emit(now, "PASSENGER_GATE_ARRIVE", p, {"gate_id": p.current_location, "late_ticks": maxi(0, now - p.gate_target_tick)})
		return
	if p.terminal_route.is_empty():
		p.terminal_route = graph.route(p.current_location, p.route_goal, p.security_cleared)
		if p.terminal_route.is_empty():
			_set_state(p, "route_blocked")
			_emit(now, "PASSENGER_ROUTE_BLOCKED", p, {"goal": p.route_goal})
			return
		p.terminal_route.pop_front()
	p.walk_from = p.current_location
	p.walk_to = p.terminal_route.pop_front()
	p.walk_started_tick = now
	var duration := graph.edge_ticks(p.walk_from, p.walk_to, p.walking_speed)
	_schedule(p, now + duration, "walk")

func _dispatch(cp: SecurityCheckpoint, now: int) -> void:
	for lane in cp.capacity():
		if cp.queue.is_empty(): break
		if cp.active.has(str(lane)): continue
		var p: Passenger = airport.passengers[str(cp.queue.pop_front())]
		_set_state(p, "security_processing")
		p.security_wait_ticks = now - p.security_queue_enter_tick
		p.security_lane = lane
		cp.active[str(lane)] = p.id
		_emit(now, "PASSENGER_SECURITY_START", p, {"checkpoint": cp.id, "lane": lane, "wait_ticks": p.security_wait_ticks})
		_schedule(p, now + cp.service_ticks, "security")

func _finish_security(p: Passenger, now: int) -> void:
	var cp: SecurityCheckpoint = airport.security_checkpoints[p.security_checkpoint_id]
	cp.active.erase(str(p.security_lane))
	p.security_lane = -1
	p.security_cleared = true
	cp.processed += 1
	cp.total_wait_ticks += p.security_wait_ticks
	cp.max_wait_ticks = maxi(cp.max_wait_ticks, p.security_wait_ticks)
	_emit(now, "PASSENGER_SECURITY_EXIT", p, {"checkpoint": cp.id})
	_begin_walk(p, "walking_to_gate", airport.flights[p.current_flight_id].assigned_gate_id, now)
	_dispatch(cp, now)

func reroute(flight: AirportFlight, now: int) -> void:
	for id in flight.passenger_ids:
		var p: Passenger = airport.passengers[str(id)]
		if p.airport_state == "walking_to_gate":
			# Finish the current edge; reroute at its endpoint, never teleport.
			p.terminal_route = []
			p.route_goal = flight.assigned_gate_id
		elif p.airport_state == "waiting_at_gate" and p.current_location != flight.assigned_gate_id:
			ready_by_flight[flight.id] = int(ready_by_flight[flight.id]) - 1
			p.gate_arrival_time = -1
			_begin_walk(p, "walking_to_gate", flight.assigned_gate_id, now)
		elif p.airport_state == "route_blocked" and p.security_cleared:
			_begin_walk(p, "walking_to_gate", flight.assigned_gate_id, now)
		else: continue
		_emit(now, "PASSENGER_REROUTED", p, {"gate_id": flight.assigned_gate_id})

func set_security(checkpoint_id: String, lanes: int, staff: int, now: int) -> bool:
	if not airport.security_checkpoints.has(checkpoint_id): return false
	var cp: SecurityCheckpoint = airport.security_checkpoints[checkpoint_id]
	if lanes < 0 or lanes > cp.max_lanes or staff < 0 or staff > cp.max_lanes: return false
	var assigned := staff
	for other: SecurityCheckpoint in airport.security_checkpoints.values():
		if other.id != cp.id: assigned += other.staff
	if assigned > int(config.staff_pool): return false
	cp.open_lanes = lanes
	cp.staff = staff
	_dispatch(cp, now)
	return true

func checkpoint_metrics(cp: SecurityCheckpoint, now: int) -> Dictionary:
	var oldest := 0
	if not cp.queue.is_empty(): oldest = now - airport.passengers[str(cp.queue[0])].security_queue_enter_tick
	return {"queue": cp.queue.size(), "processing": cp.active.size(), "capacity": cp.capacity(),
		"oldest_wait": oldest, "processed": cp.processed,
		"average_wait": cp.total_wait_ticks / maxi(1, cp.processed)}

func rebuild_caches() -> void:
	counts = {}
	ready_by_flight = {}
	for id in airport.flights: ready_by_flight[id] = 0
	for p: Passenger in airport.passengers.values():
		counts[p.airport_state] = int(counts.get(p.airport_state, 0)) + 1
		if p.airport_state == "waiting_at_gate": ready_by_flight[p.current_flight_id] += 1

# Binary min-heap: tie-break by monotonic insertion sequence.
func _before(a: Dictionary, b: Dictionary) -> bool:
	return int(a.tick) < int(b.tick) or (a.tick == b.tick and int(a.sequence) < int(b.sequence))

func _schedule(p: Passenger, tick: int, kind: String) -> void:
	p.flow_due_tick = tick
	var event := {"tick": tick, "sequence": sequence, "passenger_id": p.id, "kind": kind}
	sequence += 1
	pending.append(event)
	var index := pending.size() - 1
	while index > 0:
		var parent := (index - 1) / 2
		if not _before(pending[index], pending[parent]): break
		var swap = pending[parent]
		pending[parent] = pending[index]
		pending[index] = swap
		index = parent

func _pop() -> Dictionary:
	var first: Dictionary = pending[0]
	var last: Dictionary = pending.pop_back()
	if pending.is_empty(): return first
	pending[0] = last
	var index := 0
	while index * 2 + 1 < pending.size():
		var child := index * 2 + 1
		if child + 1 < pending.size() and _before(pending[child + 1], pending[child]): child += 1
		if not _before(pending[child], pending[index]): break
		var swap = pending[index]
		pending[index] = pending[child]
		pending[child] = swap
		index = child
	return first

func snapshot() -> Dictionary:
	return {"pending": pending.duplicate(true), "sequence": sequence, "rng": rng.snapshot()}

func restore(data: Dictionary) -> void:
	pending = data.pending.duplicate(true)
	sequence = int(data.sequence)
	rng.restore(data.rng)
	rebuild_caches()
