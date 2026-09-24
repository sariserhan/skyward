class_name PassengerFlow
extends RefCounted
## Events are scheduled on the airport's integer clock, not a second clock.
const JOURNEY_STATES := ["not_arrived", "walking_to_check_in", "check_in", "walking_to_security",
	"security_queue", "security_processing", "walking_to_gate", "waiting_at_gate", "route_blocked",
	"boarding", "on_aircraft", "departed", "missed_flight"]
## Journey states with no pending terminal event (the passenger is not moving).
const RESTING_STATES := ["waiting_at_gate", "security_queue", "route_blocked",
	"boarding", "on_aircraft", "departed", "missed_flight"]
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
func generate(seed_value: int, now: int, flights: Array[AirportFlight], cabins: Dictionary = {},
		cabin_config: SimConfig = null, gate_close_offset: int = 0) -> void:
	if config.is_empty(): return
	rng = SimRng.new(seed_value, SimRng.STREAM_PASSENGERS)
	var cabin_rng := SimRng.new(seed_value, SimRng.STREAM_CABIN)
	var load_rng := SimRng.new(seed_value, SimRng.STREAM_LOAD)
	for data in config.checkpoints:
		var checkpoint := SecurityCheckpoint.new()
		checkpoint.restore(data)
		airport.security_checkpoints[checkpoint.id] = checkpoint
	var next_id := 1
	for f in flights:
		var aircraft: AirportAircraft = airport.aircraft[f.aircraft_id]
		# Always draw, so an explicit override does not shift other flights' loads.
		var drawn := _draw_load(f, load_rng)
		if f.load_permille < 0: f.load_permille = drawn
		var count := int(aircraft.seat_capacity * f.load_permille / 1000)
		var seats: Array = []
		if cabins.has(aircraft.aircraft_type_id):
			var cabin: AircraftDef = cabins[aircraft.aircraft_type_id]
			seats = cabin.all_seats()
			cabin_rng.shuffle(seats)
			count = mini(count, seats.size())
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
			if not seats.is_empty():
				var cabin: AircraftDef = cabins[aircraft.aircraft_type_id]
				p.seat_row = seats[i][0]
				p.seat_letter = seats[i][1]
				p.seat_type = cabin.seat_type_of(p.seat_letter)
				p.side = cabin.side_of(p.seat_letter)
				PassengerGenerator.apply_cabin_timing(p, cabin_config, cabin_rng)
			airport.passengers[str(p.id)] = p
			f.passenger_ids.append(p.id)
			counts["not_arrived"] = int(counts.get("not_arrived", 0)) + 1
			_schedule(p, p.arrival_time_at_airport, "arrive")

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
			"walking_to_gate":
				p.gate_arrival_time = now
				if not p.missed_flight_id.is_empty():
					# The gate closed while they were on the way: they arrive, never board.
					_set_state(p, "missed_flight")
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
