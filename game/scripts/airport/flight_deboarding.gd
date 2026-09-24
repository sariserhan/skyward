class_name FlightDeboarding
extends RefCounted
## One arriving flight's cabin deboarding session (M5): the airport adapter
## around DeboardingSimulation, fed the flight's own inbound Passenger objects.
## Steps the engine exactly `ratio` boarding ticks per airport tick (D-015).

var flight_id: String = ""
var cabin_id: String = ""
var ratio: int = 3
var engine := DeboardingSimulation.new()
var _exited: Array[Passenger] = []


func open(flight: AirportFlight, cabin: AircraftDef, manifest: Array[Passenger], settings: Dictionary, p_ratio: int) -> void:
	flight_id = flight.id
	cabin_id = cabin.id
	ratio = p_ratio
	engine.setup(cabin, manifest, settings)
	_connect()


## Passengers who left the cabin during this airport tick, in exit order.
func step() -> Array[Passenger]:
	_exited.clear()
	for _i in ratio: engine.step()
	return _exited.duplicate()


func _connect() -> void:
	engine.passenger_exited.connect(func(p: Passenger): _exited.append(p))


func snapshot() -> Dictionary:
	return {"flight_id": flight_id, "cabin_id": cabin_id, "ratio": ratio, "engine": engine.snapshot()}


static func from_snapshot(data: Dictionary, cabin: AircraftDef, manifest: Array[Passenger]) -> FlightDeboarding:
	var session := FlightDeboarding.new()
	session.flight_id = data.flight_id
	session.cabin_id = data.cabin_id
	session.ratio = int(data.ratio)
	session.engine.restore(cabin, manifest, data.engine)
	session._connect()
	return session


## Structural checks before restoring. `start` is the deboarding task's start.
static func valid_snapshot(data: Variant, state: Dictionary, now: int, start: int, cabins: Dictionary) -> bool:
	if not data is Dictionary or not data.get("engine") is Dictionary or not data.get("ratio") is int or data.ratio < 1: return false
	if not data.get("flight_id") is String or not state.flights.has(data.flight_id) or not cabins.has(data.get("cabin_id", "")): return false
	var f: Dictionary = state.flights[data.flight_id]
	var e: Dictionary = data.engine
	for key in ["tick", "ticks_since_exit", "seated_count"]:
		if not e.get(key) is int: return false
	for key in ["aisle", "active", "exited", "seat_queues"]:
		if not e.get(key) is Array: return false
	for key in ["seat_occupied", "config"]:
		if not e.get(key) is Dictionary: return false
	if not e.get("completed") is bool: return false
	var cabin: AircraftDef = cabins[data.cabin_id]
	if e.aisle.size() != cabin.rows + 1: return false
	var manifest := {}
	for id in f.inbound_passenger_ids: manifest[int(id)] = true
	# Every inbound passenger is in exactly one place: seat queue, aisle, or out.
	var where := {}
	if e.seat_queues.size() != (cabin.rows + 1) * 2: return false
	for index in e.seat_queues.size():
		if not e.seat_queues[index] is Array: return false
		for id in e.seat_queues[index]:
			if not id is int or not manifest.has(id) or where.has(id): return false
			var p: Dictionary = state.passengers[str(id)]
			if p.seat_row * 2 + p.side != index: return false
			where[id] = "seat"
	if e.seated_count != where.size(): return false
	var in_aisle := 0
	for cell in e.aisle.size():
		var id = e.aisle[cell]
		if not id is int: return false
		if id == -1: continue
		if not manifest.has(id) or where.has(id): return false
		if state.passengers[str(id)].aisle_position != cell: return false
		where[id] = "aisle"
		in_aisle += 1
	if e.active.size() != in_aisle: return false
	for id in e.active:
		if where.get(id) != "aisle": return false
	for id in e.exited:
		if not id is int or not manifest.has(id) or where.has(id): return false
		where[id] = "out"
	if where.size() != manifest.size(): return false
	for key in e.seat_occupied:
		if where.get(e.seat_occupied[key]) != "seat": return false
	if e.completed != (e.exited.size() == manifest.size()): return false
	if not e.completed and e.tick != data.ratio * (now - start + 1): return false
	# Journey layer agrees: in the cabin means deboarding; out means in the terminal.
	for id in manifest:
		var p: Dictionary = state.passengers[str(id)]
		if where[id] == "out":
			if not p.airport_state in ["walking_to_exit", "left_airport"] or p.exited_tick < 0: return false
		elif p.airport_state != "deboarding" or p.exited_tick != -1: return false
	return true
