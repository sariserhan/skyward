class_name AirportSimulation
extends RefCounted
## One world, one clock. M1 deliberately uses timed turnarounds.
const SAVE_VERSION := 2
const CONFIG_PATH := "res://configs/airports/riverdale.json"
const STATES := ["scheduled", "approaching", "landed", "taxiing_in", "at_gate",
	"turnaround", "ready_for_pushback", "taxiing_out", "departed"]
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
		flight.turnaround_ticks = int(definition.turnaround_ticks) + rng.randi_range(0, int(config.turnaround_variation_ticks))
		airport.aircraft[aircraft.id] = aircraft
		airport.flights[flight.id] = flight
		flight_order.append(flight)
		var variation := flight.turnaround_ticks - int(definition.turnaround_ticks)
		if variation > 0: _add_delay(flight, "turnaround_variation", variation)
	events.record(clock.tick, "SCENARIO_STARTED", "", {"seed": seed_value, "scenario": config.id})
	passenger_flow = PassengerFlow.new()
	passenger_flow.bind(airport, events, config.get("passenger_flow", {}))
	passenger_flow.generate(seed_value, clock.tick, flight_order)

func step() -> void:
	var started := Time.get_ticks_usec()
	clock.tick += 1
	_complete_runway()
	for flight: AirportFlight in flight_order:
		_update_flight(flight)
	_start_runway()
	passenger_flow.step(clock.tick)
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
				_transition(f, "ready_for_pushback")
		"ready_for_pushback":
			if clock.tick >= f.scheduled_departure - int(config.taxi_out_ticks) - int(config.takeoff_ticks):
				var gate: AirportGate = airport.gates[f.assigned_gate_id]
				gate.occupied_by_flight_id = ""
				f.gate_release_tick = clock.tick
				_transition(f, "taxiing_out", int(config.taxi_out_ticks))
				events.record(clock.tick, "FLIGHT_PUSHBACK", f.id, {"gate_id": gate.id})
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
		events.record(clock.tick, "FLIGHT_DEPARTED", f.id, {"delay_ticks": maxi(0, clock.tick - f.scheduled_departure), "causes": f.delay_reasons})

func _estimate_departure(f: AirportFlight) -> int:
	var exit_time := int(config.taxi_out_ticks) + int(config.takeoff_ticks)
	var earliest := f.scheduled_arrival + int(config.taxi_in_ticks) + f.turnaround_ticks + f.forced_delay_ticks + exit_time + 3
	match f.status:
		"approaching": earliest = maxi(clock.tick + int(config.taxi_in_ticks) + f.turnaround_ticks + f.forced_delay_ticks + exit_time, earliest)
		"landed": earliest = clock.tick + int(config.taxi_in_ticks) + f.turnaround_ticks + f.forced_delay_ticks + exit_time + 2
		"taxiing_in": earliest = maxi(clock.tick, f.due_tick) + f.turnaround_ticks + f.forced_delay_ticks + exit_time + 2
		"at_gate": earliest = clock.tick + f.turnaround_ticks + f.forced_delay_ticks + exit_time + 2
		"turnaround": earliest = f.due_tick + exit_time + 1
		"ready_for_pushback": earliest = clock.tick + exit_time
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
		return {"ok": false, "warnings": ["Gate locked after docking"]}
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
		"events": events.history.duplicate(true), "decisions": decisions.duplicate(true), "conflicts": conflicts.duplicate(true), "passenger_flow": passenger_flow.snapshot()})

static func from_snapshot(data: Dictionary) -> AirportSimulation:
	data = _integer_json(data)
	if int(data.get("version", -1)) != SAVE_VERSION or data.get("engine", "") != Engine.get_version_info().string:
		return null
	for key in ["scenario", "clock", "rng", "airport", "conflicts", "passenger_flow"]:
		if not data.get(key) is Dictionary: return null
	for key in ["events", "decisions"]:
		if not data.get(key) is Array: return null
	if not _valid_snapshot(data): return null
	if not PassengerFlowValidation.valid(data): return null
	var sim := AirportSimulation.new()
	sim.config = data.scenario.duplicate(true)
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
	return sim

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
		if f.status in ["at_gate", "turnaround", "ready_for_pushback"] and gate.occupied_by_flight_id != f.id: return false
		if not state.aircraft[f.aircraft_id].required_gate_type in gate.supported_aircraft_classes: return false
	for key in state.gates:
		var gate = state.gates[key]
		if gate.occupied_by_flight_id != "":
			var f = state.flights[gate.occupied_by_flight_id]
			if f.assigned_gate_id != key or not f.status in ["at_gate", "turnaround", "ready_for_pushback"]: return false
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
