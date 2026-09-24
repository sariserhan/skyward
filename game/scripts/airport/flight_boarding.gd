class_name FlightBoarding
extends RefCounted
## One flight's cabin boarding session: the airport-side adapter around the
## preserved boarding engine (Simulation). The engine receives the flight's own
## canonical Passenger objects; there is no second passenger model (D-016).
##
## Time (D-015): the engine runs in boarding ticks (30 Hz). The airport calls
## step() once per airport tick (10 Hz) and the session advances the engine by
## exactly `ratio` boarding ticks, so engine.tick == ratio * airport ticks open
## until boarding completes.

var flight_id: String = ""
var cabin_id: String = ""
var ratio: int = 3
var engine := Simulation.new()
var _seated: Array[Passenger] = []


func open(flight: AirportFlight, cabin: AircraftDef, manifest: Array[Passenger], strategy: BoardingStrategy,
		config: SimConfig, seed_value: int, p_ratio: int) -> void:
	flight_id = flight.id
	cabin_id = cabin.id
	ratio = p_ratio
	engine.setup_incremental(cabin, manifest, strategy, config, seed_value)
	_connect()


## Returns passengers seated during this airport tick, in seating order.
func step() -> Array[Passenger]:
	_seated.clear()
	for _i in ratio:
		engine.step()
	return _seated.duplicate()


func _connect() -> void:
	engine.passenger_seated.connect(func(p: Passenger): _seated.append(p))


func snapshot() -> Dictionary:
	return {"flight_id": flight_id, "cabin_id": cabin_id, "ratio": ratio, "engine": engine.snapshot()}


static func from_snapshot(data: Dictionary, cabin: AircraftDef, manifest: Array[Passenger]) -> FlightBoarding:
	var session := FlightBoarding.new()
	session.flight_id = data.flight_id
	session.cabin_id = data.cabin_id
	session.ratio = int(data.ratio)
	session.engine.restore(cabin, manifest, data.engine)
	session._connect()
	return session


## Structural checks on a saved session before anything is restored. `state` is
## the saved airport registry; `now` the saved airport tick.
static func valid_snapshot(data: Variant, state: Dictionary, now: int, cabins: Dictionary) -> bool:
	if not data is Dictionary: return false
	for key in ["flight_id", "cabin_id"]:
		if not data.get(key) is String: return false
	if not data.get("ratio") is int or data.ratio < 1 or not data.get("engine") is Dictionary: return false
	if not state.flights.has(data.flight_id) or not cabins.has(data.cabin_id): return false
	var f: Dictionary = state.flights[data.flight_id]
	if f.boarding_mode != "cabin" or not f.boarding_phase in ["open", "closed", "complete"]: return false
	var e: Dictionary = data.engine
	for key in ["seed", "queue_index", "tick", "seated_count", "ticks_since_entry"]:
		if not e.get(key) is int: return false
	for key in ["queue", "aisle", "active", "warnings"]:
		if not e.get(key) is Array: return false
	for key in ["seat_occupied", "rank", "strategy", "config"]:
		if not e.get(key) is Dictionary: return false
	for key in ["completed", "closed"]:
		if not e.get(key) is bool: return false
	# D-015: the engine clock must be an exact multiple of the airport clock.
	if e.config.get("tick_rate") != data.ratio * AirportClock.TICKS_PER_SECOND: return false
	var cabin: AircraftDef = cabins[data.cabin_id]
	var manifest := {}
	for id in f.passenger_ids: manifest[int(id)] = true
	if e.rank.size() != manifest.size(): return false
	for key in e.rank:
		if not key.is_valid_int() or not manifest.has(int(key)) or not e.rank[key] is int: return false
	# Queue: unique manifest members; entered prefix; everyone else admitted.
	var queued := {}
	for id in e.queue:
		if not id is int or not manifest.has(id) or queued.has(id): return false
		queued[id] = true
	if e.queue_index < 0 or e.queue_index > e.queue.size(): return false
	if e.aisle.size() != cabin.rows + 1: return false
	var in_aisle := {}
	for id in e.aisle:
		if not id is int: return false
		if id == -1: continue
		if in_aisle.has(id) or not queued.has(id) or e.queue.find(id) >= e.queue_index: return false
		in_aisle[id] = true
	if e.active.size() != in_aisle.size(): return false
	for id in e.active:
		if not in_aisle.has(id): return false
	var seated := {}
	for key in e.seat_occupied:
		var id = e.seat_occupied[key]
		if not id is int or not queued.has(id) or seated.has(id) or in_aisle.has(id): return false
		var p: Dictionary = state.passengers[str(id)]
		if AircraftDef.seat_key(p.seat_row, p.seat_letter) != key: return false
		seated[id] = true
	if e.seated_count != seated.size(): return false
	if e.completed and not (e.closed and seated.size() == e.queue.size()): return false
	if (f.boarding_phase == "open") == e.closed: return false
	# D-015: open for (now - open + 1) airport ticks means ratio times that many boarding ticks.
	if not e.completed and e.tick != data.ratio * (now - f.boarding_open_tick + 1): return false
	# Journey layer agrees with the cabin layer for every manifest passenger.
	for id in manifest:
		var p: Dictionary = state.passengers[str(id)]
		var expected := ""
		if seated.has(id): expected = "on_aircraft"
		elif queued.has(id): expected = "boarding"
		if not expected.is_empty() and p.airport_state != expected: return false
		# A connector not yet off their inbound aircraft is on another flight's leg.
		if expected.is_empty() and p.current_flight_id == data.flight_id and p.airport_state in ["boarding", "on_aircraft", "departed", "waiting_at_gate"]: return false
		if not expected.is_empty() and p.current_flight_id != data.flight_id: return false
		if queued.has(id) and p.boarding_admit_tick < 0: return false
	return true
