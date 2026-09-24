class_name AirportSimulation
extends RefCounted
## One world, one clock. Cabin flights board through the preserved boarding
## engine (M3); widebodies use the widebody boarding abstraction (D-022).
const SAVE_VERSION := 3
const CONFIG_PATH := "res://configs/airports/riverdale.json"
const STATES := ["scheduled", "approaching", "landed", "taxiing_in", "at_gate",
	"turnaround", "boarding", "ready_for_pushback", "taxiing_out", "departed"]
## Statuses during which a flight owns its gate.
const AT_GATE_STATES := ["at_gate", "turnaround", "boarding", "ready_for_pushback"]
const BOARDING_PHASES := ["", "scheduled", "open", "closed", "complete"]
## Airport-tick defaults when a scenario has no "boarding" block (D-017).
const BOARDING_DEFAULTS := {
	"open_before_departure_ticks": 18000,
	"gate_close_before_departure_ticks": 6000,
	"close_warning_ticks": 1800,
	"hold_increment_ticks": 3000,
	"max_hold_ticks": 9000,
	"default_strategy": "random",
	"boarding_ticks_per_airport_tick": 3,
}
var airport := AirportState.new()
var clock := AirportClock.new()
var events := AirportEvents.new()
var rng := SimRng.new(0)
var passenger_flow := PassengerFlow.new()
var config: Dictionary = {}
var seed_value: int = 0
var decisions: Array = []
var conflicts: Dictionary = {}
var last_tick_usec: int = 0
var flight_order: Array[AirportFlight] = []
## Active cabin boarding sessions by flight id (open until pushback).
var boarding_sessions: Dictionary = {}
## Cabin layouts by cabin config id, and by aircraft type for cabin-boarding types.
var cabins: Dictionary = {}
var cabins_by_type: Dictionary = {}
var cabin_config: SimConfig = SimConfig.load_default()

func setup(scenario: Dictionary = {}, seed_override: int = -1) -> void:
	config = (JsonUtil.load_file(CONFIG_PATH) if scenario.is_empty() else scenario).duplicate(true)
	seed_value = int(config.seed) if seed_override < 0 else seed_override
	rng = SimRng.new(seed_value, SimRng.STREAM_SCENARIO)
	airport = AirportState.new()
	clock = AirportClock.new()
	events = AirportEvents.new()
	decisions = []
	conflicts = {}
	flight_order = []
	boarding_sessions = {}
	_load_cabins()
	clock.tick = int(config.start_tick)
	airport.name = config.name
	airport.airlines = config.airlines.duplicate(true)
	for data in config.gates:
		var gate := AirportGate.new()
		gate.restore(data)
		airport.gates[gate.id] = gate
	for data in config.flights:
		var flight := AirportFlight.new()
		flight.restore(data)
		flight.state_since = clock.tick
		flight.estimated_departure = flight.scheduled_departure
		var aircraft := AirportAircraft.new()
		aircraft.id = "AC_" + flight.id
		aircraft.aircraft_type_id = data.aircraft_type
		var definition: Dictionary = config.aircraft_types[data.aircraft_type]
		aircraft.required_gate_type = definition["class"]
		aircraft.seat_capacity = int(definition.seats)
		flight.aircraft_id = aircraft.id
		if cabins_by_type.has(data.aircraft_type):
			flight.boarding_mode = "cabin"
			aircraft.seat_map = definition.cabin
		if flight.boarding_strategy.is_empty():
			flight.boarding_strategy = str(_boarding("default_strategy"))
		# M3: the timer covers service before boarding only; boarding itself is
		# simulated (cabin) or abstracted (widebody). M4 replaces it with tasks.
		var service := int(definition.get("service_before_boarding_ticks", definition.turnaround_ticks))
		flight.turnaround_ticks = service + rng.randi_range(0, int(config.turnaround_variation_ticks))
		airport.aircraft[aircraft.id] = aircraft
		airport.flights[flight.id] = flight
		flight_order.append(flight)
		var variation := flight.turnaround_ticks - service
		if variation > 0: _add_delay(flight, "turnaround_variation", variation)
	events.record(clock.tick, "SCENARIO_STARTED", "", {"seed": seed_value, "scenario": config.id})
	passenger_flow = PassengerFlow.new()
	passenger_flow.bind(airport, events, config.get("passenger_flow", {}))
	passenger_flow.generate(seed_value, clock.tick, flight_order, cabins_by_type, cabin_config,
		int(_boarding("gate_close_before_departure_ticks")))

func _boarding(key: String) -> Variant:
	return config.get("boarding", {}).get(key, BOARDING_DEFAULTS[key])

## Cabin definitions for aircraft types that board in the engine (D-014). The
## engine tick rate must be an exact multiple of the airport rate (D-015).
func _load_cabins() -> void:
	cabins = {}
	cabins_by_type = {}
	cabin_config = SimConfig.load_default()
	cabin_config.apply_overrides(config.get("boarding", {}).get("sim_config_overrides", {}))
	var ratio := int(_boarding("boarding_ticks_per_airport_tick"))
	assert(cabin_config.tick_rate == ratio * AirportClock.TICKS_PER_SECOND, "boarding/airport tick ratio mismatch")
	for type_id in config.aircraft_types:
		var cabin_id := str(config.aircraft_types[type_id].get("cabin", ""))
		if cabin_id.is_empty(): continue
		if not cabins.has(cabin_id): cabins[cabin_id] = AircraftDef.load_by_id(cabin_id)
		cabins_by_type[type_id] = cabins[cabin_id]

func step() -> void:
	var started := Time.get_ticks_usec()
	clock.tick += 1
	_complete_runway()
	for flight: AirportFlight in flight_order:
		_update_flight(flight)
	_start_runway()
	passenger_flow.step(clock.tick)
	_step_boarding()
	if clock.tick % AirportClock.TICKS_PER_SECOND == 0:
		_update_conflicts()
	last_tick_usec = Time.get_ticks_usec() - started

func advance(ticks: int) -> void:
	for _i in maxi(0, ticks):
		step()

func _transition(flight: AirportFlight, status: String, duration: int = 0) -> void:
	var previous := flight.status
	flight.status = status
	flight.state_since = clock.tick
	flight.due_tick = clock.tick + duration
	events.record(clock.tick, "FLIGHT_STATE_CHANGED", flight.id, {"from": previous, "to": status})

func _update_flight(f: AirportFlight) -> void:
	match f.status:
		"scheduled":
			if clock.tick >= f.scheduled_arrival - int(config.approach_ticks):
				_transition(f, "approaching")
		"approaching":
			if clock.tick >= f.scheduled_arrival - int(config.landing_ticks):
				_request_runway(f, "landing")
		"landed":
			_transition(f, "taxiing_in", int(config.taxi_in_ticks))
		"taxiing_in":
			if clock.tick >= f.due_tick:
				var gate: AirportGate = airport.gates[f.assigned_gate_id]
				if gate.occupied_by_flight_id.is_empty() and clock.tick >= gate.available_from:
					gate.occupied_by_flight_id = f.id
					f.gate_arrival_tick = clock.tick
					_transition(f, "at_gate")
					events.record(clock.tick, "FLIGHT_GATE_ARRIVAL", f.id, {"gate_id": gate.id})
				else:
					_add_delay(f, "gate_wait", 1)
		"at_gate":
			_transition(f, "turnaround", f.turnaround_ticks + f.forced_delay_ticks)
		"turnaround":
			if clock.tick >= f.due_tick:
				_schedule_boarding(f)
				_transition(f, "boarding")
				# A late aircraft opens boarding on this same tick.
				_update_boarding(f)
		"boarding":
			_update_boarding(f)
		"ready_for_pushback":
			_try_pushback(f)
		"taxiing_out":
			if clock.tick >= f.due_tick:
				_request_runway(f, "takeoff")
	if f.status != "departed":
		f.estimated_departure = _estimate_departure(f)

func _add_delay(f: AirportFlight, reason: String, ticks: int) -> void:
	f.delay_reasons[reason] = int(f.delay_reasons.get(reason, 0)) + ticks

func _request_runway(f: AirportFlight, operation: String) -> void:
	if f.runway_requested:
		return
	f.runway_requested = true
	airport.runway.queue.append({"flight_id": f.id, "operation": operation, "requested_at": clock.tick})
	events.record(clock.tick, "RUNWAY_QUEUED", f.id, {"operation": operation})

func _start_runway() -> void:
	var runway := airport.runway
	if not runway.active_operation.is_empty() or clock.tick < runway.occupied_until or runway.queue.is_empty():
		return
	# FIFO; ties use immutable scenario insertion order.
	var operation: Dictionary = runway.queue.pop_front()
	var duration := int(config.landing_ticks if operation.operation == "landing" else config.takeoff_ticks)
	operation["started_at"] = clock.tick
	operation["end_tick"] = clock.tick + duration
	runway.active_operation = operation
	runway.occupied_until = clock.tick + duration + int(config.separation_ticks)
	runway.busy_ticks += duration
	var flight: AirportFlight = airport.flights[operation.flight_id]
	_add_delay(flight, "runway_" + operation.operation + "_queue", clock.tick - int(operation.requested_at))
	events.record(clock.tick, "RUNWAY_STARTED", flight.id, operation)

func _complete_runway() -> void:
	var runway := airport.runway
	if runway.active_operation.is_empty() or clock.tick < int(runway.active_operation.end_tick):
		return
	var operation: Dictionary = runway.active_operation
	var f: AirportFlight = airport.flights[operation.flight_id]
	runway.active_operation = {}
	f.runway_requested = false
	events.record(clock.tick, "RUNWAY_COMPLETED", f.id, operation)
	if operation.operation == "landing":
		f.actual_arrival = clock.tick
		_transition(f, "landed")
	else:
		f.actual_departure = clock.tick
		f.estimated_departure = clock.tick
		_transition(f, "departed")
		for id in f.passenger_ids:
			var p: Passenger = airport.passengers[str(id)]
			if p.airport_state == "on_aircraft": passenger_flow.set_journey_state(p, "departed")
		events.record(clock.tick, "FLIGHT_DEPARTED", f.id, {"delay_ticks": maxi(0, clock.tick - f.scheduled_departure), "causes": f.delay_reasons,
			"boarded": f.boarded_count, "missed": f.missed_count})

func _estimate_departure(f: AirportFlight) -> int:
	var exit_time := int(config.taxi_out_ticks) + int(config.takeoff_ticks)
	# After service, boarding needs its window before the departure target.
	var after_service := int(_boarding("open_before_departure_ticks"))
	var earliest := f.scheduled_arrival + int(config.taxi_in_ticks) + f.turnaround_ticks + f.forced_delay_ticks + after_service + 3
	match f.status:
		"approaching": earliest = maxi(clock.tick + int(config.taxi_in_ticks) + f.turnaround_ticks + f.forced_delay_ticks + after_service, earliest)
		"landed": earliest = clock.tick + int(config.taxi_in_ticks) + f.turnaround_ticks + f.forced_delay_ticks + after_service + 2
		"taxiing_in": earliest = maxi(clock.tick, f.due_tick) + f.turnaround_ticks + f.forced_delay_ticks + after_service + 2
		"at_gate": earliest = clock.tick + f.turnaround_ticks + f.forced_delay_ticks + after_service + 2
		"turnaround": earliest = f.due_tick + after_service + 1
		"boarding":
			# Ready at gate close (earlier if everyone boards), never before schedule + holds.
			var ready := clock.tick if f.boarding_phase in ["closed", "complete"] else maxi(clock.tick, f.gate_close_tick)
			if f.boarding_phase == "scheduled": ready = maxi(ready, f.boarding_open_tick)
			earliest = maxi(f.scheduled_departure + f.hold_ticks, ready + exit_time + 1)
		"ready_for_pushback": earliest = maxi(f.scheduled_departure + f.hold_ticks, clock.tick + exit_time)
		"taxiing_out":
			earliest = maxi(clock.tick, f.due_tick) + int(config.takeoff_ticks)
			var operation := airport.runway.active_operation
			if operation.get("flight_id", "") == f.id:
				earliest = int(operation.end_tick)
	return maxi(f.scheduled_departure, earliest)

func _release_estimate(f: AirportFlight) -> int:
	return f.estimated_departure - int(config.taxi_out_ticks) - int(config.takeoff_ticks)

func assignment_warnings(flight_id: String, gate_id: String) -> Array:
	var warnings: Array = []
	if not airport.flights.has(flight_id) or not airport.gates.has(gate_id):
		return ["Unknown flight or gate"]
	var f: AirportFlight = airport.flights[flight_id]
	var gate: AirportGate = airport.gates[gate_id]
	var aircraft: AirportAircraft = airport.aircraft[f.aircraft_id]
	if not aircraft.required_gate_type in gate.supported_aircraft_classes:
		warnings.append("Aircraft incompatibility")
	if f.terminal != gate.terminal:
		warnings.append("Terminal constraint")
	var arrival := maxi(clock.tick, f.scheduled_arrival + int(config.taxi_in_ticks))
	var release := maxi(arrival + f.turnaround_ticks, _release_estimate(f))
	if arrival < gate.available_from or release > gate.available_until:
		warnings.append("Gate outside availability window")
	for other: AirportFlight in flight_order:
		if other.id == f.id or other.assigned_gate_id != gate_id or other.status in ["taxiing_out", "departed"]:
			continue
		var other_arrival := other.scheduled_arrival + int(config.taxi_in_ticks)
		var other_release := _release_estimate(other)
		if arrival < other_release and release > other_arrival:
			warnings.append("Time overlap with " + other.flight_number)
		elif arrival < other_release + int(config.gate_buffer_ticks) and release + int(config.gate_buffer_ticks) > other_arrival:
			warnings.append("Insufficient buffer with " + other.flight_number)
	return warnings

func assign_gate(flight_id: String, gate_id: String) -> Dictionary:
	var warnings := assignment_warnings(flight_id, gate_id)
	for message in warnings:
		if message in ["Unknown flight or gate", "Aircraft incompatibility", "Terminal constraint", "Gate outside availability window"]:
			return {"ok": false, "warnings": warnings}
	var f: AirportFlight = airport.flights[flight_id]
	if not f.status in ["scheduled", "approaching", "landed", "taxiing_in"]:
		return {"ok": false, "warnings": ["Gate locked after docking" if f.status != "boarding" else "Gate locked during boarding"]}
	var old_gate := f.assigned_gate_id
	f.assigned_gate_id = gate_id
	if old_gate != gate_id: passenger_flow.reroute(f, clock.tick)
	decisions.append({"tick": clock.tick, "type": "assign_gate", "flight_id": flight_id, "gate_id": gate_id})
	events.record(clock.tick, "GATE_ASSIGNED", flight_id, {"from": old_gate, "to": gate_id, "warnings": warnings})
	_update_conflicts()
	return {"ok": true, "warnings": warnings}

func _update_conflicts() -> void:
	var current := {}
	for f: AirportFlight in flight_order:
		if not f.status in ["scheduled", "approaching", "landed", "taxiing_in"]:
			continue
		var gate: AirportGate = airport.gates[f.assigned_gate_id]
		if gate.occupied_by_flight_id.is_empty():
			continue
		var blocker: AirportFlight = airport.flights[gate.occupied_by_flight_id]
		var arrival := f.scheduled_arrival + int(config.taxi_in_ticks)
		if arrival - clock.tick <= 6000 and _release_estimate(blocker) >= arrival:
			var key := f.id + ":" + blocker.id
			current[key] = {"gate_id": gate.id, "flight_id": f.id, "blocker_id": blocker.id,
				"severity": "critical" if f.status == "taxiing_in" and clock.tick >= f.due_tick else "warning"}
			if not conflicts.has(key):
				events.record(clock.tick, "GATE_CONFLICT", f.id, current[key])
	for key in conflicts:
		if not current.has(key):
			events.record(clock.tick, "GATE_CONFLICT_RESOLVED", conflicts[key].flight_id, conflicts[key])
	conflicts = current

func force_delay(flight_id: String, ticks: int = 6000) -> bool:
	if not OS.is_debug_build() or not airport.flights.has(flight_id) or ticks <= 0:
		return false
	var f: AirportFlight = airport.flights[flight_id]
	if not f.status in ["scheduled", "approaching", "landed", "taxiing_in", "at_gate", "turnaround"]:
		return false
	f.forced_delay_ticks += ticks
	if f.status == "turnaround":
		f.due_tick += ticks
	_add_delay(f, "operational_hold", ticks)
	f.estimated_departure = _estimate_departure(f)
	decisions.append({"tick": clock.tick, "type": "force_delay", "flight_id": flight_id, "ticks": ticks})
	events.record(clock.tick, "DELAY_ADDED", flight_id, {"cause": "operational_hold", "ticks": ticks})
	_update_conflicts()
	return true

func force_arrival(flight_id: String) -> bool:
	if not OS.is_debug_build() or not airport.flights.has(flight_id):
		return false
	var f: AirportFlight = airport.flights[flight_id]
	if f.status != "scheduled":
		return false
	# Keep the published timetable; only bring the aircraft into the runway queue.
	_transition(f, "approaching")
	_request_runway(f, "landing")
	decisions.append({"tick": clock.tick, "type": "force_arrival", "flight_id": flight_id})
	return true

func metrics() -> Dictionary:
	var departed := 0
	var late := 0
	var delay := 0
	var occupied := 0
	for f: AirportFlight in flight_order:
		if f.status == "departed":
			departed += 1
			var duration := maxi(0, f.actual_departure - f.scheduled_departure)
			delay += duration
			if duration > 0: late += 1
	for gate: AirportGate in airport.gates.values():
		if not gate.occupied_by_flight_id.is_empty(): occupied += 1
	return {"departed": departed, "late": late, "delay_ticks": delay, "occupied": occupied}

func snapshot() -> Dictionary:
	return _integer_json({"version": SAVE_VERSION, "engine": Engine.get_version_info().string, "scenario": config.duplicate(true),
		"seed": seed_value, "clock": clock.to_dict(), "rng": rng.snapshot(), "airport": airport.to_dict(),
		"events": events.history.duplicate(true), "decisions": decisions.duplicate(true), "conflicts": conflicts.duplicate(true), "passenger_flow": passenger_flow.snapshot(),
		"boarding": _boarding_snapshot()})

## Active cabin sessions (D-021). Passenger cabin fields are already inside
## airport.passengers through Passenger.snapshot().
func _boarding_snapshot() -> Dictionary:
	var out := {}
	for id in boarding_sessions: out[id] = boarding_sessions[id].snapshot()
	return out

static func from_snapshot(data: Dictionary) -> AirportSimulation:
	data = _integer_json(data)
	if int(data.get("version", -1)) != SAVE_VERSION or data.get("engine", "") != Engine.get_version_info().string:
		return null
	for key in ["scenario", "clock", "rng", "airport", "conflicts", "passenger_flow", "boarding"]:
		if not data.get(key) is Dictionary: return null
	for key in ["events", "decisions"]:
		if not data.get(key) is Array: return null
	if not _valid_snapshot(data): return null
	if not PassengerFlowValidation.valid(data): return null
	var sim := AirportSimulation.new()
	sim.config = data.scenario.duplicate(true)
	sim._load_cabins()
	if not sim._valid_boarding(data): return null
	sim.seed_value = int(data.seed)
	sim.clock.restore(data.clock)
	sim.rng.restore(data.rng)
	sim.airport.restore(data.airport)
	for flight in sim.config.flights:
		sim.flight_order.append(sim.airport.flights[flight.id])
	sim.events.history = data.events.duplicate(true)
	sim.decisions = data.decisions.duplicate(true)
	sim.conflicts = data.conflicts.duplicate(true)
	sim.passenger_flow.bind(sim.airport, sim.events, sim.config.get("passenger_flow", {}))
	sim.passenger_flow.restore(data.passenger_flow)
	for id in data.boarding:
		var f: AirportFlight = sim.airport.flights[id]
		sim.boarding_sessions[id] = FlightBoarding.from_snapshot(data.boarding[id], sim.cabins[data.boarding[id].cabin_id], sim._manifest(f))
	return sim

## Every open/closed/complete cabin flight still at the gate has exactly one
## valid session, and no other flight does.
func _valid_boarding(data: Dictionary) -> bool:
	var state: Dictionary = data.airport
	for key in BOARDING_DEFAULTS:
		if data.scenario.get("boarding", {}).has(key) and typeof(data.scenario.boarding[key]) != typeof(BOARDING_DEFAULTS[key]): return false
	for id in state.flights:
		var f: Dictionary = state.flights[id]
		if not f.boarding_phase in BOARDING_PHASES or not f.boarding_mode in ["cabin", "placeholder"]: return false
		if f.boarding_mode == "cabin" and not cabins.has(state.aircraft[f.aircraft_id].seat_map): return false
		var needs_session: bool = f.boarding_mode == "cabin" and f.boarding_phase in ["open", "closed", "complete"] and f.status in AT_GATE_STATES
		if needs_session != data.boarding.has(id): return false
		if f.status == "boarding" and f.boarding_phase == "": return false
		if f.status in ["ready_for_pushback", "taxiing_out", "departed"] and f.boarding_phase != "complete": return false
	for id in data.boarding:
		if data.boarding[id].get("flight_id") != id: return false
		if not FlightBoarding.valid_snapshot(data.boarding[id], state, int(data.clock.tick), cabins): return false
	for key in state.passengers:
		var p: Dictionary = state.passengers[key]
		var f: Dictionary = state.flights[p.current_flight_id]
		match p.airport_state:
			"boarding", "on_aircraft":
				if not f.boarding_phase in ["open", "closed", "complete"] or f.status == "departed": return false
			"departed":
				if f.status != "departed": return false
			"missed_flight":
				if p.missed_flight_id != f.id: return false
		if not p.missed_flight_id.is_empty() and not f.boarding_phase in ["closed", "complete"]: return false
	return true

func save_file(path: String) -> Error:
	var file := FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null: return FileAccess.get_open_error()
	file.store_string(JSON.stringify(snapshot()))
	file.close()
	return DirAccess.rename_absolute(path + ".tmp", path)

static func load_file(path: String) -> AirportSimulation:
	if not FileAccess.file_exists(path): return null
	return from_snapshot(JsonUtil.load_file(path))


static func _integer_json(value: Variant) -> Variant:
	# Godot JSON parses all numbers as floats. Restore integer simulation data.
	if value is float and value == floor(value): return int(value)
	if value is Dictionary:
		var result := {}
		for key in value: result[key] = _integer_json(value[key])
		return result
	if value is Array:
		var result: Array = []
		for item in value: result.append(_integer_json(item))
		return result
	return value


static func _entity_shape(data: Variant, template: AirportEntity) -> bool:
	if not data is Dictionary: return false
	var expected := template.to_dict()
	for key in expected:
		if not data.has(key) or typeof(data[key]) != typeof(expected[key]): return false
	return true

static func _valid_snapshot(data: Dictionary) -> bool:
	if not data.get("seed") is int: return false
	for key in ["tick", "speed"]:
		if not data.clock.get(key) is int: return false
	if data.clock.tick < 0 or not data.clock.speed in [1, 2, 4]: return false
	if not data.clock.get("paused") is bool: return false
	if not (data.clock.get("remainder") is float or data.clock.get("remainder") is int): return false
	if data.clock.remainder < 0: return false
	for key in ["seed", "state"]:
		if not data.rng.get(key) is String or not data.rng[key].is_valid_int(): return false
	for key in ["id", "name"]:
		if not data.airport.get(key) is String: return false
	for key in ["money", "reputation"]:
		if not data.airport.get(key) is int: return false
	for key in ["airlines", "resources", "flights", "gates", "aircraft", "passengers", "bags", "security_checkpoints"]:
		if not data.airport.get(key) is Dictionary: return false
	var state: Dictionary = data.airport
	if state.flights.is_empty() or state.gates.is_empty(): return false
	if not _entity_shape(state.get("runway"), AirportRunway.new()): return false
	for key in state.gates:
		var gate = state.gates[key]
		if not _entity_shape(gate, AirportGate.new()) or gate.id != key: return false
		if gate.occupied_by_flight_id != "" and not state.flights.has(gate.occupied_by_flight_id): return false
	for key in state.aircraft:
		if not _entity_shape(state.aircraft[key], AirportAircraft.new()) or state.aircraft[key].id != key: return false
	for key in state.bags:
		if not _entity_shape(state.bags[key], AirportBag.new()): return false
	for key in state.flights:
		var f = state.flights[key]
		if not _entity_shape(f, AirportFlight.new()) or f.id != key: return false
		if not state.aircraft.has(f.aircraft_id) or not state.gates.has(f.assigned_gate_id): return false
		if not f.status in STATES or not state.airlines.has(f.airline_id): return false
		var gate = state.gates[f.assigned_gate_id]
		if f.status in AT_GATE_STATES and gate.occupied_by_flight_id != f.id: return false
		if not state.aircraft[f.aircraft_id].required_gate_type in gate.supported_aircraft_classes: return false
	for key in state.gates:
		var gate = state.gates[key]
		if gate.occupied_by_flight_id != "":
			var f = state.flights[gate.occupied_by_flight_id]
			if f.assigned_gate_id != key or not f.status in AT_GATE_STATES: return false
	var scenario: Dictionary = data.scenario
	for key in ["landing_ticks", "takeoff_ticks", "taxi_in_ticks", "taxi_out_ticks", "approach_ticks", "gate_buffer_ticks", "separation_ticks"]:
		if not scenario.get(key) is int or scenario[key] < 0: return false
	if not scenario.get("flights") is Array: return false
	var ids: Array = []
	for flight in scenario.flights:
		if not flight is Dictionary or not state.flights.has(flight.get("id", "")) or flight.id in ids: return false
		ids.append(flight.id)
	if ids.size() != state.flights.size(): return false
	var queued: Array = []
	var operations: Array = state.runway.queue.duplicate()
	if not state.runway.active_operation.is_empty():
		var active: Dictionary = state.runway.active_operation
		for key in ["started_at", "end_tick"]:
			if not active.get(key) is int: return false
		operations.append(active)
	for operation in operations:
		if not operation is Dictionary or not state.flights.has(operation.get("flight_id", "")): return false
		if not operation.get("requested_at") is int or not operation.get("operation") in ["landing", "takeoff"]: return false
		if operation.flight_id in queued: return false
		queued.append(operation.flight_id)
		var f = state.flights[operation.flight_id]
		if not f.runway_requested: return false
		if f.status != ("approaching" if operation.operation == "landing" else "taxiing_out"): return false
	for flight in state.flights.values():
		if flight.runway_requested != (flight.id in queued): return false
	for key in data.conflicts:
		var conflict = data.conflicts[key]
		if not conflict is Dictionary: return false
		if not state.flights.has(conflict.get("flight_id", "")) or not state.flights.has(conflict.get("blocker_id", "")): return false
		if not state.gates.has(conflict.get("gate_id", "")) or not conflict.get("severity") in ["warning", "critical"]: return false
	return true


func set_security(checkpoint_id: String, lanes: int, staff: int) -> bool:
	if not passenger_flow.set_security(checkpoint_id, lanes, staff, clock.tick): return false
	var decision := {"tick": clock.tick, "type": "set_security", "checkpoint_id": checkpoint_id, "lanes": lanes, "staff": staff}
	decisions.append(decision)
	events.record(clock.tick, "SECURITY_CAPACITY_CHANGED", "", decision)
	return true


# --- boarding (M3) -----------------------------------------------------------
# Window (D-017): boarding opens at D-30 and the gate closes at D-10, where D is
# the scheduled takeoff. A late aircraft shifts the whole window: the departure
# target becomes service-ready + the open offset. Holds move close and target.

func _manifest(f: AirportFlight) -> Array[Passenger]:
	var out: Array[Passenger] = []
	for id in f.passenger_ids: out.append(airport.passengers[str(id)])
	return out

func _schedule_boarding(f: AirportFlight) -> void:
	var open_offset := int(_boarding("open_before_departure_ticks"))
	f.service_ready_tick = clock.tick
	f.departure_target_tick = maxi(f.scheduled_departure, clock.tick + open_offset)
	f.boarding_open_tick = f.departure_target_tick - open_offset
	f.gate_close_tick = f.departure_target_tick - int(_boarding("gate_close_before_departure_ticks"))
	f.boarding_phase = "scheduled"

func _update_boarding(f: AirportFlight) -> void:
	if f.boarding_phase == "scheduled" and clock.tick >= f.boarding_open_tick:
		_open_boarding(f)
	if f.boarding_phase == "open" and f.boarding_mode != "cabin" and int(passenger_flow.ready_by_flight.get(f.id, 0)) == f.passenger_ids.size():
		_close_gate(f, "all_aboard")
	if f.boarding_phase == "open" and clock.tick >= f.gate_close_tick:
		_close_gate(f, "scheduled")
	if f.boarding_phase == "closed" and f.boarding_complete_tick >= 0:
		f.boarding_phase = "complete"
		events.record(clock.tick, "BOARDING_COMPLETE", f.id, {"boarded": f.boarded_count, "missed": f.missed_count,
			"duration_ticks": f.boarding_complete_tick - f.boarding_open_tick})
		_transition(f, "ready_for_pushback")
		_try_pushback(f)

## Pushback once boarding is complete, never before the scheduled pushback plus
## any hold actually used. A late aircraft that boards quickly recovers time: it
## does not wait for its shifted boarding window.
func _try_pushback(f: AirportFlight) -> void:
	if clock.tick < _pushback_floor(f): return
	var gate: AirportGate = airport.gates[f.assigned_gate_id]
	gate.occupied_by_flight_id = ""
	f.gate_release_tick = clock.tick
	_attribute_boarding_delay(f)
	_finalize_boarding(f)
	_transition(f, "taxiing_out", int(config.taxi_out_ticks))
	events.record(clock.tick, "FLIGHT_PUSHBACK", f.id, {"gate_id": gate.id})

func _pushback_floor(f: AirportFlight) -> int:
	return f.scheduled_departure + f.hold_ticks - int(config.taxi_out_ticks) - int(config.takeoff_ticks)

func _open_boarding(f: AirportFlight) -> void:
	f.boarding_phase = "open"
	f.boarding_open_tick = clock.tick
	var present: Array = []
	for p in _manifest(f):
		if p.airport_state == "waiting_at_gate": present.append(p.id)
	events.record(clock.tick, "BOARDING_OPENED", f.id, {"mode": f.boarding_mode, "strategy": f.boarding_strategy,
		"at_gate": present.size(), "manifest": f.passenger_ids.size(), "gate_close_tick": f.gate_close_tick})
	if f.boarding_mode != "cabin": return
	var session := FlightBoarding.new()
	var cabin: AircraftDef = cabins[airport.aircraft[f.aircraft_id].seat_map]
	# Strategy order is seeded per flight, independent of other flights.
	var seed := absi(hash("%d:%s" % [seed_value, f.id]))
	session.open(f, cabin, _manifest(f), BoardingStrategy.preset(f.boarding_strategy, cabin), cabin_config, seed,
		int(_boarding("boarding_ticks_per_airport_tick")))
	boarding_sessions[f.id] = session
	_admit(f, present)

## Passengers physically at the gate join the door queue (never anyone else).
func _admit(f: AirportFlight, ids: Array) -> void:
	var session: FlightBoarding = boarding_sessions[f.id]
	for id in session.engine.admit(ids):
		var p: Passenger = airport.passengers[str(id)]
		p.boarding_admit_tick = clock.tick
		passenger_flow.set_journey_state(p, "boarding")
		passenger_flow._emit(clock.tick, "PASSENGER_BOARDING", p, {"seat": p.seat_key(), "group": p.boarding_group_name})

func _close_gate(f: AirportFlight, by: String) -> void:
	f.boarding_phase = "closed"
	f.gate_closed_tick = clock.tick
	if clock.tick < f.gate_close_tick:
		# Closing early cancels the unused part of any hold.
		var unused := mini(f.hold_ticks, f.gate_close_tick - clock.tick)
		f.hold_ticks -= unused
		f.departure_target_tick -= unused
		f.gate_close_tick = clock.tick
	var boarded := 0
	for p in _manifest(f):
		if f.boarding_mode != "cabin" and p.airport_state == "waiting_at_gate":
			# Widebody boarding abstraction: everyone present boards at close.
			p.boarding_admit_tick = clock.tick
			p.seated_airport_tick = clock.tick
			f.last_seated_tick = clock.tick
			passenger_flow.set_journey_state(p, "on_aircraft")
			passenger_flow._emit(clock.tick, "PASSENGER_ON_AIRCRAFT", p, {"mode": "widebody_boarding_abstraction"})
		if p.airport_state in ["boarding", "on_aircraft"]:
			boarded += 1
			continue
		p.missed_flight_id = f.id
		p.missed_reason = p.airport_state
		if p.airport_state == "waiting_at_gate": passenger_flow.set_journey_state(p, "missed_flight")
		f.missed_count += 1
		passenger_flow._emit(clock.tick, "PASSENGER_MISSED_FLIGHT", p, {"reason": p.missed_reason})
	f.boarded_count = boarded
	if f.boarding_mode == "cabin":
		var engine: Simulation = boarding_sessions[f.id].engine
		engine.close()
		if engine.is_complete(): f.boarding_complete_tick = clock.tick
	else:
		f.boarding_complete_tick = clock.tick
	events.record(clock.tick, "GATE_CLOSED", f.id, {"by": by, "boarding": boarded, "missed": f.missed_count, "hold_ticks": f.hold_ticks})

## Advance every open cabin engine by exactly the configured boarding ticks.
func _step_boarding() -> void:
	var arrivals := passenger_flow.gate_arrivals
	passenger_flow.gate_arrivals = []
	var by_flight := {}
	for id in arrivals:
		var p: Passenger = airport.passengers[str(id)]
		if not by_flight.has(p.current_flight_id): by_flight[p.current_flight_id] = []
		by_flight[p.current_flight_id].append(id)
	for f: AirportFlight in flight_order:
		if not boarding_sessions.has(f.id): continue
		if f.boarding_phase == "open" and by_flight.has(f.id): _admit(f, by_flight[f.id])
		var session: FlightBoarding = boarding_sessions[f.id]
		if session.engine.is_complete(): continue
		for p in session.step():
			p.seated_airport_tick = clock.tick
			f.last_seated_tick = clock.tick
			passenger_flow.set_journey_state(p, "on_aircraft")
			passenger_flow._emit(clock.tick, "PASSENGER_ON_AIRCRAFT", p, {"seat": p.seat_key()})
		if session.engine.is_complete(): f.boarding_complete_tick = clock.tick
		# Whole manifest aboard: no reason to keep the gate open until D-10.
		if f.boarding_phase == "open" and session.engine.seated_count == f.passenger_ids.size():
			_close_gate(f, "all_aboard")

func _finalize_boarding(f: AirportFlight) -> void:
	if not boarding_sessions.has(f.id): return
	f.boarding_result = boarding_sessions[f.id].engine.result()
	boarding_sessions.erase(f.id)

## Additive split of pushback lateness beyond the scheduled pushback: first the
## hold the player used, then cabin boarding still running after the gate closed.
## A gate kept open for missing passengers in a late aircraft's shifted window is
## explained by the upstream causes (gate wait, landing queue, variation).
func _attribute_boarding_delay(f: AirportFlight) -> void:
	var planned := f.scheduled_departure - int(config.taxi_out_ticks) - int(config.takeoff_ticks)
	var hold := clampi(clock.tick - planned, 0, f.hold_ticks)
	if hold > 0: _add_delay(f, "passenger_hold", hold)
	var boarding := clock.tick - maxi(_pushback_floor(f), f.gate_closed_tick)
	if boarding > 0: _add_delay(f, "boarding", boarding)

func set_boarding_strategy(flight_id: String, strategy_id: String) -> bool:
	if not airport.flights.has(flight_id) or not strategy_id in BoardingStrategy.PRESET_IDS: return false
	var f: AirportFlight = airport.flights[flight_id]
	if f.boarding_mode != "cabin" or not f.boarding_phase in ["", "scheduled"]: return false
	f.boarding_strategy = strategy_id
	decisions.append({"tick": clock.tick, "type": "set_boarding_strategy", "flight_id": flight_id, "strategy": strategy_id})
	events.record(clock.tick, "BOARDING_STRATEGY_SET", flight_id, {"strategy": strategy_id})
	return true

## Hold +increment: the gate stays open longer and the departure target moves
## with it. Limited to max_hold_ticks per flight; never automatic (D-017).
func hold_flight(flight_id: String) -> bool:
	if not can_hold(flight_id): return false
	var f: AirportFlight = airport.flights[flight_id]
	var increment := int(_boarding("hold_increment_ticks"))
	f.hold_ticks += increment
	f.gate_close_tick += increment
	f.departure_target_tick += increment
	f.estimated_departure = _estimate_departure(f)
	decisions.append({"tick": clock.tick, "type": "hold_flight", "flight_id": flight_id})
	events.record(clock.tick, "FLIGHT_HELD", flight_id, {"hold_ticks": f.hold_ticks, "gate_close_tick": f.gate_close_tick})
	_update_conflicts()
	return true

func can_hold(flight_id: String) -> bool:
	if not airport.flights.has(flight_id): return false
	var f: AirportFlight = airport.flights[flight_id]
	return f.boarding_phase == "open" and f.hold_ticks + int(_boarding("hold_increment_ticks")) <= int(_boarding("max_hold_ticks"))

func close_gate(flight_id: String) -> bool:
	if not airport.flights.has(flight_id) or airport.flights[flight_id].boarding_phase != "open": return false
	decisions.append({"tick": clock.tick, "type": "close_gate", "flight_id": flight_id})
	_close_gate(airport.flights[flight_id], "player")
	return true

## Manifest passengers of an open flight who have not reached boarding yet.
func missing_passengers(f: AirportFlight) -> int:
	var missing := 0
	for p in _manifest(f):
		if not p.airport_state in ["boarding", "on_aircraft", "departed", "waiting_at_gate"]: missing += 1
	return missing

## Flights whose gate closes soon with passengers still missing.
func boarding_alerts() -> Array:
	var out: Array = []
	for f: AirportFlight in flight_order:
		if f.boarding_phase != "open" or f.gate_close_tick - clock.tick > int(_boarding("close_warning_ticks")): continue
		var missing := missing_passengers(f)
		if missing > 0: out.append({"flight_id": f.id, "missing": missing, "closes_in": f.gate_close_tick - clock.tick})
	return out
