class_name AirportSimulation
extends RefCounted
## One world, one clock. Turnaround is a task graph (M4); cabin flights deboard
## (M5) and board (M3) through cabin engines as tasks of it; widebodies use the
## widebody deboarding and boarding abstractions (D-022, D-029).
const SAVE_VERSION := 13
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
var turnaround := Turnaround.new()
var baggage := BaggageSystem.new()
var resources := AirportResources.new()
var airlines := AirlineRelations.new()
var economy := AirportEconomy.new()
## M12: the aircraft movement network (empty when a scenario has no airside).
var airside := AirsideNetwork.new()
var _taxi_plan: Dictionary = {}
## Built once: what the turnaround calls to release boarding and start driven work.
var _release := Callable(self, "_release_boarding")
var _starters := {"deboarding": Callable(self, "_start_deboarding"), "baggage_unload": Callable(self, "_start_baggage_unload"),
	"baggage_load": Callable(self, "_start_baggage_load")}
var config: Dictionary = {}
var seed_value: int = 0
var decisions: Array = []
var conflicts: Dictionary = {}
var last_tick_usec: int = 0
## Profiling: total time spent in the baggage event step (not saved).
var baggage_usec: int = 0
## Profiling: total time spent dispatching resources (not saved).
var resource_usec: int = 0
## Profiling: total time spent evaluating airlines at departures (not saved).
var airline_usec: int = 0
## Profiling: total time spent posting flight revenue (not saved).
var economy_usec: int = 0
var flight_order: Array[AirportFlight] = []
## Active cabin boarding sessions by flight id (open until pushback).
var boarding_sessions: Dictionary = {}
## Active cabin deboarding sessions by flight id (until the last passenger is off).
var deboarding_sessions: Dictionary = {}
## Cabin layouts by cabin config id, and by aircraft type for cabin-boarding types.
var cabins: Dictionary = {}
var cabins_by_type: Dictionary = {}
var cabin_config: SimConfig = SimConfig.load_default()

## A scenario file, resolving "extends": the named base file (relative to this
## one) with this file's keys merged over it (objects merge, anything else
## replaces). Used for variants such as the M8 resource-shortage morning.
static func load_config(path: String) -> Dictionary:
	var data: Dictionary = JsonUtil.load_file(path)
	if not data.has("extends"): return data
	var base := load_config(path.get_base_dir().path_join(str(data.extends)))
	data.erase("extends")
	# Per-flight changes merge into the base schedule by flight id.
	var overrides: Dictionary = data.get("flight_overrides", {})
	data.erase("flight_overrides")
	var only: Array = data.get("include_flights", [])
	data.erase("include_flights")
	var task_overrides: Dictionary = data.get("task_overrides", {})
	data.erase("task_overrides")
	# Top-level keys a variant replaces whole instead of merging (M12: a different airside).
	var replace: Array = data.get("replace", [])
	data.erase("replace")
	for key in replace: base.erase(key)
	var merged := _merged(base, data)
	# A variant may keep just part of the schedule.
	if not only.is_empty(): merged.flights = merged.flights.filter(func(flight): return flight.id in only)
	for flight in merged.get("flights", []):
		if overrides.has(flight.id): flight.merge(overrides[flight.id], true)
	# Turnaround task specs merge by task type (for example, faster fueling).
	for spec in merged.get("turnaround", {}).get("tasks", []):
		if task_overrides.has(spec.type): spec.merge(task_overrides[spec.type], true)
	return merged

static func _merged(base: Dictionary, over: Dictionary) -> Dictionary:
	var out := base.duplicate(true)
	for key in over:
		if out.get(key) is Dictionary and over[key] is Dictionary: out[key] = _merged(out[key], over[key])
		else: out[key] = over[key].duplicate(true) if over[key] is Dictionary or over[key] is Array else over[key]
	return out

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
	deboarding_sessions = {}
	_load_cabins()
	turnaround = Turnaround.new()
	turnaround.bind(airport, events, config.get("turnaround", {}))
	clock.tick = int(config.start_tick)
	airport.name = config.name
	airport.airlines = config.airlines.duplicate(true)
	for data in config.gates:
		var gate := AirportGate.new()
		gate.restore(data)
		airport.gates[gate.id] = gate
	_setup_airside()
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
		airport.aircraft[aircraft.id] = aircraft
		airport.flights[flight.id] = flight
		flight_order.append(flight)
		# Turnaround tasks with seeded durations and a planned schedule (M4).
		turnaround.create(flight, data.aircraft_type, rng, flight.scheduled_arrival + _taxi_in_plan(flight),
			flight.scheduled_departure - int(_boarding("open_before_departure_ticks")), _scheduled_pushback(flight))
	_bind_resources()
	events.record(clock.tick, "SCENARIO_STARTED", "", {"seed": seed_value, "scenario": config.id})
	passenger_flow = PassengerFlow.new()
	passenger_flow.bind(airport, events, config.get("passenger_flow", {}))
	# Planned deboarding windows let connection generation test ideal reachability.
	var plans := {}
	for f: AirportFlight in flight_order:
		var deboarding := turnaround.task(f, Turnaround.DEBOARDING)
		var cabin: AircraftDef = cabins_by_type.get(airport.aircraft[f.aircraft_id].aircraft_type_id)
		if deboarding != null: plans[f.id] = [deboarding.planned_start_tick, deboarding.planned_finish_tick, 0 if cabin == null else cabin.rows]
	passenger_flow.generate(seed_value, clock.tick, flight_order, cabins_by_type, cabin_config,
		int(_boarding("gate_close_before_departure_ticks")), config.get("deboarding", {}), plans)
	# Checked bags for every passenger, from their own stream (M7).
	baggage = BaggageSystem.new()
	baggage.bind(airport, events, passenger_flow, config.get("baggage", {}))
	passenger_flow.baggage = baggage
	baggage.generate(seed_value)
	# Airlines judge the day from real flight outcomes (M9).
	airlines = AirlineRelations.new()
	airlines.bind(airport, events, config.get("airline_relations", {}), flight_order)
	airlines.on_settle = Callable(self, "_contract_settled")
	# The day's money (M10): revenue at takeoff, contracts at the day's end.
	economy = AirportEconomy.new()
	economy.bind(config.get("economy", {}))

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
	# Resources are handed out once every flight has asked (M8, event-driven).
	if not resources.dirty.is_empty():
		var resources_started := Time.get_ticks_usec()
		resources.dispatch(clock.tick, Callable(self, "_grant"))
		resource_usec += Time.get_ticks_usec() - resources_started
	_start_runway()
	passenger_flow.step(clock.tick)
	_step_boarding()
	_step_deboarding()
	var baggage_started := Time.get_ticks_usec()
	baggage.step(clock.tick)
	baggage_usec += Time.get_ticks_usec() - baggage_started
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
			if clock.tick >= f.scheduled_arrival + f.inbound_delay_ticks - int(config.approach_ticks):
				_transition(f, "approaching")
				if f.inbound_delay_ticks > 0: _add_delay(f, "late_inbound", f.inbound_delay_ticks)
		"approaching":
			if clock.tick >= f.scheduled_arrival + f.inbound_delay_ticks - int(config.landing_ticks):
				_request_runway(f, "landing")
		"landed":
			if airside.enabled(): _begin_taxi(f, "in")
			else: _transition(f, "taxiing_in", int(config.taxi_in_ticks))
		"taxiing_in":
			var arrived := _advance_taxi(f) if airside.enabled() else clock.tick >= f.due_tick
			if arrived:
				var gate: AirportGate = airport.gates[f.assigned_gate_id]
				if gate.occupied_by_flight_id.is_empty() and clock.tick >= gate.available_from:
					gate.occupied_by_flight_id = f.id
					f.taxi_blocker = ""
					f.gate_arrival_tick = clock.tick
					_transition(f, "at_gate")
					events.record(clock.tick, "FLIGHT_GATE_ARRIVAL", f.id, {"gate_id": gate.id})
				else:
					_add_delay(f, "gate_wait", 1)
					if airside.enabled(): f.taxi_blocker = "gate %s occupied" % gate.id
		"at_gate":
			_transition(f, "turnaround")
			_update_turnaround(f)
		"turnaround", "boarding":
			_update_turnaround(f)
		"ready_for_pushback":
			_try_pushback(f)
		"taxiing_out":
			_finish_pushback(f)
			var at_hold := _advance_taxi(f) if airside.enabled() else clock.tick >= f.due_tick
			if at_hold: _request_runway(f, "takeoff")
	# Estimates refresh once per simulated second, with the conflict check that
	# reads them; commands refresh immediately. Timing never depends on frames.
	if f.status != "departed" and clock.tick % AirportClock.TICKS_PER_SECOND == 0:
		f.estimated_departure = _estimate_departure(f)

## Tasks advance first; releasing boarding schedules its window, which a late
## aircraft opens on this same tick. A second pass lets boarding completion
## release the pushback milestone (and anything exclusive with boarding).
func _update_turnaround(f: AirportFlight) -> void:
	_update_abstract_deboarding(f)
	turnaround.update(f, clock.tick, _release, _starters)
	if f.status == "boarding": _update_boarding(f)
	_update_baggage_tasks(f)
	turnaround.update(f, clock.tick, _release, _starters)
	if turnaround.pushback_ready(f) and f.status in ["turnaround", "boarding"]:
		_transition(f, "ready_for_pushback")
		_try_pushback(f)

func _release_boarding(f: AirportFlight) -> void:
	_schedule_boarding(f)
	_transition(f, "boarding")

func _scheduled_pushback(f: AirportFlight) -> int:
	return f.scheduled_departure - _taxi_out_plan(f) - int(config.takeoff_ticks)

func _add_delay(f: AirportFlight, reason: String, ticks: int) -> void:
	f.delay_reasons[reason] = int(f.delay_reasons.get(reason, 0)) + ticks

func _request_runway(f: AirportFlight, operation: String) -> void:
	if f.runway_requested:
		return
	# Arrivals pick their runway when they ask to land; departures at pushback.
	if operation == "landing" or f.runway_id.is_empty() or not airport.runways.has(f.runway_id): f.runway_id = _choose_runway(f, operation)
	var runway: AirportRunway = airport.runways[f.runway_id]
	f.runway_requested = true
	runway.queue.append({"flight_id": f.id, "operation": operation, "requested_at": clock.tick, "runway": runway.id})
	runway.peak_queue = maxi(runway.peak_queue, runway.queue.size())
	events.record(clock.tick, "RUNWAY_QUEUED", f.id, {"operation": operation, "runway": runway.id})

## Runways in id order: each is an independent FIFO resource.
func _start_runway() -> void:
	for id in _runway_ids():
		var runway: AirportRunway = airport.runways[id]
		if not runway.active_operation.is_empty() or clock.tick < runway.occupied_until or runway.queue.is_empty():
			continue
		# FIFO; ties use immutable scenario insertion order.
		var operation: Dictionary = runway.queue.pop_front()
		var duration := int(config.landing_ticks if operation.operation == "landing" else config.takeoff_ticks)
		operation["started_at"] = clock.tick
		operation["end_tick"] = clock.tick + duration
		runway.active_operation = operation
		runway.occupied_until = clock.tick + duration + int(config.separation_ticks)
		runway.busy_ticks += duration
		runway.movements += 1
		var flight: AirportFlight = airport.flights[operation.flight_id]
		_add_delay(flight, "runway_" + operation.operation + "_queue", clock.tick - int(operation.requested_at))
		if operation.operation == "takeoff": flight.takeoff_wait_ticks = clock.tick - int(operation.requested_at)
		events.record(clock.tick, "RUNWAY_STARTED", flight.id, operation)

func _complete_runway() -> void:
	for id in _runway_ids():
		var runway: AirportRunway = airport.runways[id]
		if runway.active_operation.is_empty() or clock.tick < int(runway.active_operation.end_tick):
			continue
		var operation: Dictionary = runway.active_operation
		var f: AirportFlight = airport.flights[operation.flight_id]
		runway.active_operation = {}
		f.runway_requested = false
		events.record(clock.tick, "RUNWAY_COMPLETED", f.id, operation)
		_runway_done(f, operation)

func _runway_ids() -> Array:
	var ids: Array = airport.runways.keys()
	ids.sort()
	return ids

func _runway_done(f: AirportFlight, operation: Dictionary) -> void:
	if operation.operation == "landing":
		f.actual_arrival = clock.tick
		_transition(f, "landed")
	else:
		f.actual_departure = clock.tick
		f.estimated_departure = clock.tick
		# Taxi beyond the planned (best free-flow) time: waits, or a longer runway route.
		var taxi_extra := maxi(0, f.taxi_out_ticks_actual - _taxi_out_plan(f)) if f.taxi_out_ticks_actual >= 0 else 0
		f.departure_delay_breakdown = turnaround.attribute(f, _scheduled_pushback(f), f.takeoff_wait_ticks, taxi_extra)
		baggage.depart(f)
		# A tug time longer than taxi-out still ends by takeoff.
		var op := turnaround.task(f, Turnaround.PUSHBACK_OP)
		if op != null and op.status == TurnaroundTask.RUNNING: turnaround.complete_task(f, Turnaround.PUSHBACK_OP, clock.tick)
		_transition(f, "departed")
		for id in f.passenger_ids:
			var p: Passenger = airport.passengers[str(id)]
			if p.current_flight_id == f.id and p.airport_state == "on_aircraft": passenger_flow.set_journey_state(p, "departed")
		events.record(clock.tick, "FLIGHT_DEPARTED", f.id, {"delay_ticks": maxi(0, clock.tick - f.scheduled_departure), "causes": f.delay_reasons,
			"breakdown": f.departure_delay_breakdown, "boarded": f.boarded_count, "missed": f.missed_count})
		if economy.enabled():
			var economy_started := Time.get_ticks_usec()
			_post_flight_revenue(f)
			economy_usec += Time.get_ticks_usec() - economy_started
		if airlines.enabled():
			var airline_started := Time.get_ticks_usec()
			airlines.record(f, _airline_record(f), clock.tick, Callable(self, "_request_slot_free"))
			airline_usec += Time.get_ticks_usec() - airline_started

func _estimate_departure(f: AirportFlight) -> int:
	var exit_time := _taxi_out_plan(f) + int(config.takeoff_ticks)
	var dock := -1
	var earliest := f.scheduled_departure
	match f.status:
		"scheduled": dock = f.scheduled_arrival + f.inbound_delay_ticks + _taxi_in_plan(f) + 3
		"approaching": dock = maxi(clock.tick, f.scheduled_arrival + f.inbound_delay_ticks) + _taxi_in_plan(f) + 2
		"landed": dock = clock.tick + _taxi_in_plan(f) + 2
		"taxiing_in": dock = maxi(clock.tick, f.due_tick) + 2
		"at_gate", "turnaround", "boarding": dock = clock.tick
		"ready_for_pushback":
			earliest = maxi(_pushback_floor(f), clock.tick) + exit_time
			var op := turnaround.task(f, Turnaround.PUSHBACK_OP)
			if op != null and op.status == TurnaroundTask.WAITING: earliest = maxi(earliest, resources.expected_start(op, clock.tick) + exit_time)
		"taxiing_out":
			earliest = maxi(clock.tick, f.due_tick) + int(config.takeoff_ticks)
			var operation: Dictionary = airport.runways[f.runway_id].active_operation if airport.runways.has(f.runway_id) else {}
			if operation.get("flight_id", "") == f.id:
				earliest = int(operation.end_tick)
	if dock >= 0: earliest = _estimate_pushback(f, dock) + exit_time
	return maxi(f.scheduled_departure, earliest)

## Walk the task graph: finished tasks keep their times, running ones finish on
## their duration, the rest start after their prerequisites (or docking) take
## their full duration. Boarding follows the M3 window: it ends by gate close.
func _estimate_pushback(f: AirportFlight, dock: int) -> int:
	var finish := {}
	var open_offset := int(_boarding("open_before_departure_ticks"))
	var close_offset := int(_boarding("gate_close_before_departure_ticks"))
	var pushback := _pushback_floor(f)
	if not f.status in ["turnaround", "boarding"]:
		var offsets := turnaround.dock_offsets(f)
		var boarding_end := maxi(f.scheduled_departure, dock + int(offsets[0]) + open_offset) - close_offset
		return maxi(pushback, maxi(boarding_end, dock + int(offsets[1])))
	for t: TurnaroundTask in turnaround.tasks_of(f):
		var ready := dock
		for dependency in t.after: ready = maxi(ready, int(finish[dependency]))
		match t.status:
			TurnaroundTask.COMPLETE: finish[t.type] = t.finish_tick
			_:
				match t.kind:
					"timed", "deboarding", "baggage_unload":
						var started := t.start_tick if t.status == TurnaroundTask.RUNNING else maxi(ready, t.earliest_start_tick)
						# Queued for a resource: when a unit should come free for it.
						if t.status == TurnaroundTask.WAITING: started = maxi(started, resources.expected_start(t, clock.tick))
						finish[t.type] = maxi(clock.tick, started + t.duration_ticks)
					"boarding":
						if f.boarding_phase in ["closed", "complete"]: finish[t.type] = clock.tick
						elif f.boarding_phase in ["scheduled", "open"]: finish[t.type] = maxi(clock.tick, f.gate_close_tick)
						else: finish[t.type] = maxi(f.scheduled_departure, ready + open_offset) - close_offset
					"baggage_load":
						# Loading finalizes once the gate has closed.
						var close := f.gate_close_tick if f.gate_close_tick >= 0 else f.scheduled_departure - close_offset
						finish[t.type] = maxi(maxi(ready, close), clock.tick)
						if t.status == TurnaroundTask.WAITING: finish[t.type] = maxi(finish[t.type], resources.expected_start(t, clock.tick) + 600)
						if t.status == TurnaroundTask.RUNNING and baggage.enabled():
							# The loader's backlog: bags queued plus the one in hand.
							var left: int = f.bag_load_queue.size() + (0 if f.bag_loader_current.is_empty() else 1)
							finish[t.type] = maxi(finish[t.type], clock.tick + left * int(baggage._rates(f).get("load_ticks_per_bag", 0)))
					_: finish[t.type] = ready
		if t.type == Turnaround.PUSHBACK: pushback = maxi(pushback, int(finish[t.type]))
	return pushback

func _release_estimate(f: AirportFlight) -> int:
	return f.estimated_departure - _taxi_out_plan(f) - int(config.takeoff_ticks)

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
	var arrival := maxi(clock.tick, f.scheduled_arrival + _taxi_in_plan(f))
	var release := maxi(arrival + turnaround.planned_gate_ticks(f, f.scheduled_arrival + _taxi_in_plan(f)), _release_estimate(f))
	if arrival < gate.available_from or release > gate.available_until:
		warnings.append("Gate outside availability window")
	for other: AirportFlight in flight_order:
		if other.id == f.id or other.assigned_gate_id != gate_id or other.status in ["taxiing_out", "departed"]:
			continue
		var other_arrival := other.scheduled_arrival + _taxi_in_plan(other)
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
	# M12: a taxiing aircraft needs a physical route to the new gate from where it is.
	if f.status == "taxiing_in" and airside.enabled() and old_gate != gate_id:
		var reason := _reroute_taxi(f, gate_id, false)
		if not reason.is_empty(): return {"ok": false, "warnings": warnings + [reason]}
		_reroute_taxi(f, gate_id, true)
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
		var arrival := f.scheduled_arrival + _taxi_in_plan(f)
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
	# A ramp hold: the first task if it has not finished, else all running work.
	var held: Array = []
	var first: TurnaroundTask = turnaround.tasks_of(f)[0]
	if first.status != TurnaroundTask.COMPLETE: held = [first]
	else:
		for t: TurnaroundTask in turnaround.tasks_of(f):
			if t.status == TurnaroundTask.RUNNING and t.kind == "timed": held.append(t)
	if held.is_empty(): return false
	for t in held: t.duration_ticks += ticks
	turnaround.durations_changed(f)
	f.forced_delay_ticks += ticks
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
		"boarding": _boarding_snapshot(), "deboarding": _deboarding_snapshot(), "baggage": baggage.snapshot(), "resources": resources.snapshot(),
		"airline_relations": airlines.snapshot(), "economy": economy.snapshot(), "airside": airside.snapshot()})

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
	for key in ["scenario", "clock", "rng", "airport", "conflicts", "passenger_flow", "boarding", "deboarding", "baggage", "resources", "airline_relations", "economy", "airside"]:
		if not data.get(key) is Dictionary: return null
	for key in ["events", "decisions"]:
		if not data.get(key) is Array: return null
	if not _valid_snapshot(data): return null
	if not PassengerFlowValidation.valid(data): return null
	if not Turnaround.valid_snapshot(data): return null
	if not BaggageSystem.valid_snapshot(data): return null
	if not AirportResources.valid_snapshot(data): return null
	if not AirlineRelations.valid_snapshot(data): return null
	if not AirportEconomy.valid_snapshot(data): return null
	if not _valid_airside(data): return null
	var sim := AirportSimulation.new()
	sim.config = data.scenario.duplicate(true)
	sim._load_cabins()
	if not sim._valid_boarding(data) or not sim._valid_deboarding(data): return null
	sim.seed_value = int(data.seed)
	sim.clock.restore(data.clock)
	sim.rng.restore(data.rng)
	sim.airport.restore(data.airport)
	# The day's airside network (M12), then its occupancy.
	var runways_saved: Dictionary = sim.airport.runways.duplicate()
	sim._setup_airside()
	sim.airport.runways = runways_saved
	sim.airside.restore(data.airside)
	for flight in sim.config.flights:
		sim.flight_order.append(sim.airport.flights[flight.id])
	sim.events.history = data.events.duplicate(true)
	sim.decisions = data.decisions.duplicate(true)
	sim.conflicts = data.conflicts.duplicate(true)
	sim.passenger_flow.bind(sim.airport, sim.events, sim.config.get("passenger_flow", {}))
	sim.passenger_flow.restore(data.passenger_flow)
	sim.turnaround.bind(sim.airport, sim.events, sim.config.get("turnaround", {}))
	sim.baggage.bind(sim.airport, sim.events, sim.passenger_flow, sim.config.get("baggage", {}))
	sim.baggage.restore(data.baggage)
	sim.passenger_flow.baggage = sim.baggage
	sim._bind_resources()
	sim.resources.restore(data.resources)
	if not sim.resources.queues_ordered(): return null
	sim.airlines.bind(sim.airport, sim.events, sim.config.get("airline_relations", {}), sim.flight_order)
	sim.airlines.restore(data.airline_relations)
	sim.airlines.on_settle = Callable(sim, "_contract_settled")
	sim.economy.bind(sim.config.get("economy", {}))
	sim.economy.restore(data.economy)
	for id in data.boarding:
		var f: AirportFlight = sim.airport.flights[id]
		sim.boarding_sessions[id] = FlightBoarding.from_snapshot(data.boarding[id], sim.cabins[data.boarding[id].cabin_id], sim._manifest(f))
	for id in data.deboarding:
		var f: AirportFlight = sim.airport.flights[id]
		sim.deboarding_sessions[id] = FlightDeboarding.from_snapshot(data.deboarding[id], sim.cabins[data.deboarding[id].cabin_id], sim._inbound(f))
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
		# Arrivals, and connectors still on their inbound leg, are checked by _valid_deboarding.
		if p.journey_direction == "arriving" or (p.journey_direction == "connecting" and p.leg_index == 0): continue
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
	for key in ["airlines", "resources", "flights", "gates", "aircraft", "passengers", "bags", "security_checkpoints", "turnaround_tasks"]:
		if not data.airport.get(key) is Dictionary: return false
	var state: Dictionary = data.airport
	if state.flights.is_empty() or state.gates.is_empty(): return false
	if not state.get("runways") is Dictionary or state.runways.is_empty(): return false
	for key in state.runways:
		if not _entity_shape(state.runways[key], AirportRunway.new()) or state.runways[key].id != key: return false
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
	var operations: Array = []
	for key in state.runways:
		var runway: Dictionary = state.runways[key]
		for operation in runway.queue:
			if not operation is Dictionary or operation.get("runway", key) != key: return false
			operations.append(operation)
		if not runway.active_operation.is_empty():
			var active: Dictionary = runway.active_operation
			for field in ["started_at", "end_tick"]:
				if not active.get(field) is int: return false
			if active.get("runway", key) != key: return false
			operations.append(active)
	for operation in operations:
		if not operation is Dictionary or not state.flights.has(operation.get("flight_id", "")): return false
		if not operation.get("requested_at") is int or not operation.get("operation") in ["landing", "takeoff"]: return false
		if operation.flight_id in queued: return false
		queued.append(operation.flight_id)
		var f = state.flights[operation.flight_id]
		if not f.runway_requested: return false
		if data.scenario.has("airside") and f.runway_id != str(operation.get("runway", "")): return false
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
	# Bags must be sorted and ready before this (M7); holds do not move it.
	f.bag_cutoff_tick = f.departure_target_tick - int(config.get("baggage", {}).get("bag_cutoff_before_departure_ticks", 0))
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
		turnaround.boarding_complete(f, f.boarding_complete_tick)

## Pushback once boarding is complete, never before the scheduled pushback plus
## any hold actually used. A late aircraft that boards quickly recovers time: it
## does not wait for its shifted boarding window.
func _try_pushback(f: AirportFlight) -> void:
	if clock.tick < _pushback_floor(f) or not turnaround.pushback_ready(f): return
	var op := turnaround.task(f, Turnaround.PUSHBACK_OP)
	if op != null:
		# M8: ready and allowed to leave; the push itself needs a tug.
		if op.status != TurnaroundTask.PENDING: return
		op.ready_tick = clock.tick
		op.started_after = Turnaround.PUSHBACK
		if resources.needs(op):
			resources.request(op, clock.tick)
			return
		_push_back(f, op)
		return
	_release_gate(f)

## A waiting task was granted its unit (M8).
func _grant(t: TurnaroundTask) -> void:
	if t.kind == "pushback": _push_back(airport.flights[t.flight_id], t)
	else: turnaround.grant(t, clock.tick, _release, _starters)

func _push_back(f: AirportFlight, op: TurnaroundTask) -> void:
	op.status = TurnaroundTask.RUNNING
	op.start_tick = clock.tick
	op.blocked_reason = ""
	events.record(clock.tick, "TASK_STARTED", f.id, {"task": op.type, "after": op.started_after, "unit": op.unit_id})
	_release_gate(f)

## The tug's part ends during taxi-out; it is free again.
func _finish_pushback(f: AirportFlight) -> void:
	var op := turnaround.task(f, Turnaround.PUSHBACK_OP)
	if op != null and op.status == TurnaroundTask.RUNNING and clock.tick >= op.start_tick + op.duration_ticks:
		turnaround.complete_task(f, Turnaround.PUSHBACK_OP, op.start_tick + op.duration_ticks)

func _release_gate(f: AirportFlight) -> void:
	var gate: AirportGate = airport.gates[f.assigned_gate_id]
	gate.occupied_by_flight_id = ""
	f.gate_release_tick = clock.tick
	_attribute_boarding_delay(f)
	_finalize_boarding(f)
	if airside.enabled():
		f.runway_id = _choose_runway(f, "takeoff")
		_begin_taxi(f, "out")
	else: _transition(f, "taxiing_out", int(config.taxi_out_ticks))
	events.record(clock.tick, "FLIGHT_PUSHBACK", f.id, {"gate_id": gate.id, "runway": f.runway_id})

func _pushback_floor(f: AirportFlight) -> int:
	return f.scheduled_departure + f.hold_ticks - _taxi_out_plan(f) - int(config.takeoff_ticks)

func _open_boarding(f: AirportFlight) -> void:
	f.boarding_phase = "open"
	f.boarding_open_tick = clock.tick
	turnaround.boarding_running(f, clock.tick)
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
			_connection_made(p, f)
		if _aboard(p, f):
			boarded += 1
			continue
		p.missed_flight_id = f.id
		# A connector may still be on (or leaving) their inbound aircraft.
		p.missed_reason = ("inbound_" if p.current_flight_id != f.id else "") + p.airport_state
		if p.airport_state == "waiting_at_gate": passenger_flow.set_journey_state(p, "missed_flight")
		f.missed_count += 1
		passenger_flow._emit(clock.tick, "PASSENGER_MISSED_FLIGHT", p, {"reason": p.missed_reason})
		if p.journey_direction == "connecting":
			p.connection_status = "missed"
			f.connections_missed += 1
			passenger_flow._emit(clock.tick, "CONNECTION_MISSED", p, {"from": p.itinerary_legs[0], "to": f.id, "reason": p.missed_reason})
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
			_connection_made(p, f)
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
	var planned := f.scheduled_departure - _taxi_out_plan(f) - int(config.takeoff_ticks)
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
		if not _aboard(p, f) and not (p.current_flight_id == f.id and p.airport_state in ["departed", "waiting_at_gate"]): missing += 1
	return missing

## Boarding or seated on this flight (not on a connector's inbound aircraft).
func _aboard(p: Passenger, f: AirportFlight) -> bool:
	return p.current_flight_id == f.id and p.airport_state in ["boarding", "on_aircraft"]

## Flights whose gate closes soon with passengers still missing.
func boarding_alerts() -> Array:
	var out: Array = []
	for f: AirportFlight in flight_order:
		if f.boarding_phase != "open" or f.gate_close_tick - clock.tick > int(_boarding("close_warning_ticks")): continue
		var missing := missing_passengers(f)
		if missing > 0: out.append({"flight_id": f.id, "missing": missing, "connecting": missing_connectors(f).size(), "closes_in": f.gate_close_tick - clock.tick})
	return out



# --- deboarding (M5) ---------------------------------------------------------
# Doors open when the deboarding task is released. Cabin flights run the
# deboarding engine; widebodies use the widebody deboarding abstraction: the
# task's configured duration, then every inbound passenger enters the terminal.

func _inbound(f: AirportFlight) -> Array[Passenger]:
	var out: Array[Passenger] = []
	for id in f.inbound_passenger_ids: out.append(airport.passengers[str(id)])
	return out

func _deboarding_settings(f: AirportFlight) -> Dictionary:
	var settings: Dictionary = config.get("deboarding", {}).duplicate()
	settings.merge(f.deboarding_overrides, true)
	return settings

func _start_deboarding(f: AirportFlight) -> void:
	for p in _inbound(f): passenger_flow.set_journey_state(p, "deboarding")
	events.record(clock.tick, "DEBOARDING_STARTED", f.id, {"mode": "cabin" if f.boarding_mode == "cabin" else "widebody_deboarding_abstraction",
		"passengers": f.inbound_passenger_ids.size()})
	if f.boarding_mode != "cabin": return
	var session := FlightDeboarding.new()
	session.open(f, cabins[airport.aircraft[f.aircraft_id].seat_map], _inbound(f), _deboarding_settings(f),
		int(_boarding("boarding_ticks_per_airport_tick")))
	deboarding_sessions[f.id] = session

## Advance every deboarding cabin; passengers who reach the door enter the
## terminal at the gate on the same tick.
func _step_deboarding() -> void:
	for f: AirportFlight in flight_order:
		if not deboarding_sessions.has(f.id): continue
		var session: FlightDeboarding = deboarding_sessions[f.id]
		for p in session.step(): _deplane(f, p)
		if session.engine.is_complete(): _finish_deboarding(f)

func _update_abstract_deboarding(f: AirportFlight) -> void:
	if f.boarding_mode == "cabin": return
	var t := turnaround.task(f, Turnaround.DEBOARDING)
	if t == null or t.status != TurnaroundTask.RUNNING or clock.tick < t.start_tick + t.duration_ticks: return
	for p in _inbound(f): _deplane(f, p)
	_finish_deboarding(f)

## Off the aircraft at the gate: local arrivals head for the exit, connectors
## for their next flight's gate.
func _deplane(f: AirportFlight, p: Passenger) -> void:
	f.deplaned_count += 1
	if p.journey_direction == "connecting": passenger_flow.transfer_to_connection(p, f.assigned_gate_id, clock.tick)
	else: passenger_flow.arrive_from_aircraft(p, f.assigned_gate_id, clock.tick)

func _connection_made(p: Passenger, f: AirportFlight) -> void:
	if p.journey_direction != "connecting" or p.connection_status != "pending": return
	p.connection_status = "made"
	f.connections_made += 1
	passenger_flow._emit(clock.tick, "CONNECTION_MADE", p, {"from": p.itinerary_legs[0], "to": f.id,
		"margin_ticks": _connection_margin(p, f)})

## Slack between reaching the gate and the gate's scheduled close (with any
## late-aircraft shift and holds), unaffected by an early all-aboard close.
func _connection_margin(p: Passenger, f: AirportFlight) -> int:
	var close := f.departure_target_tick - int(_boarding("gate_close_before_departure_ticks"))
	if f.departure_target_tick < 0: close = f.scheduled_departure - int(_boarding("gate_close_before_departure_ticks"))
	return close - p.gate_arrival_time

func _finish_deboarding(f: AirportFlight) -> void:
	f.deboarding_complete_tick = clock.tick
	if deboarding_sessions.has(f.id):
		f.deboarding_result = deboarding_sessions[f.id].engine.result()
		deboarding_sessions.erase(f.id)
	events.record(clock.tick, "DEBOARDING_COMPLETE", f.id, {"passengers": f.deplaned_count})
	turnaround.deboarding_complete(f, clock.tick)

func _deboarding_snapshot() -> Dictionary:
	var out := {}
	for id in deboarding_sessions: out[id] = deboarding_sessions[id].snapshot()
	return out

## A cabin session exists exactly while a cabin flight's deboarding task runs.
## Arriving passengers agree with their flight's deboarding progress.
func _valid_deboarding(data: Dictionary) -> bool:
	var state: Dictionary = data.airport
	var now := int(data.clock.tick)
	for id in state.flights:
		var f: Dictionary = state.flights[id]
		var task = state.turnaround_tasks.get(id + ":" + Turnaround.DEBOARDING)
		var running: bool = task != null and task.status == TurnaroundTask.RUNNING
		if (running and f.boarding_mode == "cabin") != data.deboarding.has(id): return false
		if data.deboarding.has(id) and not FlightDeboarding.valid_snapshot(data.deboarding[id], state, now, int(task.start_tick), cabins): return false
		var done: bool = task == null or task.status == TurnaroundTask.COMPLETE
		for pid in f.inbound_passenger_ids:
			var p: Dictionary = state.passengers[str(pid)]
			# Still on this aircraft: seated before doors open, deboarding while they
			# are. Off it (terminal, or a connector's next leg): only once it began.
			var on_leg: bool = p.current_flight_id == id and p.airport_state in ["on_aircraft", "deboarding"]
			if on_leg and p.airport_state == "on_aircraft" and (running or done): return false
			if on_leg and p.airport_state == "deboarding" and not running: return false
			if not on_leg and not (done or (running and f.boarding_mode == "cabin")): return false
	return true


# --- connections (M6) --------------------------------------------------------

## Why a connection was made or missed, from recorded ticks only (no guessing).
## Times in airport ticks; -1 where a step has not happened yet.
func connection_report(p: Passenger) -> Dictionary:
	var a: AirportFlight = airport.flights[p.itinerary_legs[0]]
	var b: AirportFlight = airport.flights[p.itinerary_legs[1]]
	var deboarding := turnaround.task(a, Turnaround.DEBOARDING)
	var graph := passenger_flow.graph
	var ideal_walk := graph.route_ticks(graph.route(a.assigned_gate_id, b.assigned_gate_id, true))
	var report := {
		"from": a.id, "to": b.id, "status": p.connection_status,
		"inbound_late": -1 if a.gate_arrival_tick < 0 else maxi(0, a.gate_arrival_tick - (a.scheduled_arrival + _taxi_in_plan(a))),
		"deboarding": -1 if p.deplaned_airport_tick < 0 or deboarding == null else p.deplaned_airport_tick - deboarding.start_tick,
		"walk": -1 if p.gate_arrival_time < 0 or p.deplaned_airport_tick < 0 else p.gate_arrival_time - p.deplaned_airport_tick,
		"ideal_walk": ideal_walk, "reached_gate": p.gate_arrival_time,
		"gate_close": b.gate_closed_tick if b.gate_closed_tick >= 0 else b.gate_close_tick,
		"hold": b.hold_ticks, "hold_limit": int(_boarding("max_hold_ticks")), "decisive": "",
	}
	if p.connection_status != "missed": return report
	# The biggest overrun against plan decides, then what the gate did about it.
	var planned_off := 0
	if deboarding != null:
		if p.itinerary_seats[0].is_empty():
			# Widebody deboarding abstraction: everyone leaves at its end.
			planned_off = deboarding.nominal_ticks
		else:
			var rows: int = cabins[airport.aircraft[a.aircraft_id].seat_map].rows
			planned_off = deboarding.nominal_ticks * (int(p.itinerary_seats[0][0]) - 1) / rows
	var causes := {"inbound flight arrived late": maxi(0, int(report.inbound_late)),
		"deboarding took long": maxi(0, int(report.deboarding) - planned_off),
		"transfer walk took long": maxi(0, int(report.walk) - ideal_walk)}
	var worst := ""
	for cause in causes:
		if worst.is_empty() or causes[cause] > causes[worst]: worst = cause
	var gate := "gate closed without a hold" if b.hold_ticks == 0 else ("hold limit reached" if b.hold_ticks >= int(report.hold_limit) else "gate closed after a %d min hold" % (b.hold_ticks / 600))
	report.decisive = "%s (+%.1f min); %s" % [worst, causes[worst] / 600.0, gate]
	return report

## Airport-wide connection summary (data for later airline measures, M9).
func connection_metrics() -> Dictionary:
	var out := {"connecting": 0, "made": 0, "missed": 0, "pending": 0, "transfer_ticks_total": 0, "transfers": 0, "min_margin_ticks": -1}
	for p: Passenger in airport.passengers.values():
		if p.journey_direction != "connecting": continue
		out.connecting += 1
		out[p.connection_status] += 1
		if p.gate_arrival_time >= 0 and p.deplaned_airport_tick >= 0:
			out.transfers += 1
			out.transfer_ticks_total += p.gate_arrival_time - p.deplaned_airport_tick
		if p.connection_status == "made":
			var margin := _connection_margin(p, airport.flights[p.itinerary_legs[1]])
			if out.min_margin_ticks < 0 or margin < out.min_margin_ticks: out.min_margin_ticks = margin
	out["success_rate"] = 0.0 if out.made + out.missed == 0 else float(out.made) / (out.made + out.missed)
	out["mean_transfer_ticks"] = 0 if out.transfers == 0 else out.transfer_ticks_total / out.transfers
	return out

## Connectors on flight f's manifest not yet at its gate or aboard it.
func missing_connectors(f: AirportFlight) -> Array[Passenger]:
	var out: Array[Passenger] = []
	for p in _manifest(f):
		if p.journey_direction == "connecting" and p.connection_status == "pending" and not _aboard(p, f) \
				and not (p.current_flight_id == f.id and p.airport_state == "waiting_at_gate"):
			out.append(p)
	return out

## When a missing connector should reach f's gate, and what they are doing now.
func connector_eta(p: Passenger, f: AirportFlight) -> Dictionary:
	var a: AirportFlight = airport.flights[p.itinerary_legs[0]]
	var graph := passenger_flow.graph
	var walk := graph.route_ticks(graph.route(a.assigned_gate_id, f.assigned_gate_id, true), p.walking_speed)
	if p.leg_index == 1:
		var remaining := graph.route_ticks(graph.route(p.walk_to if not p.walk_to.is_empty() else p.current_location, f.assigned_gate_id, true), p.walking_speed)
		var leg_end := maxi(clock.tick, p.flow_due_tick) if not p.walk_to.is_empty() else clock.tick
		return {"status": "walking to gate %s" % f.assigned_gate_id, "eta": leg_end + maxi(0, remaining)}
	if p.airport_state == "deboarding":
		return {"status": "deboarding %s at %s" % [a.flight_number, a.assigned_gate_id], "eta": clock.tick + walk}
	var dock := a.gate_arrival_tick if a.gate_arrival_tick >= 0 else a.scheduled_arrival + a.inbound_delay_ticks + _taxi_in_plan(a)
	return {"status": "on %s (%s)" % [a.flight_number, a.status.replace("_", " ")], "eta": maxi(dock, clock.tick) + walk}



# --- baggage (M7) ------------------------------------------------------------

func _start_baggage_unload(f: AirportFlight) -> void:
	if baggage.enabled(): baggage.start_unload(f, clock.tick)
	else: f.bag_unload_due_tick = clock.tick + turnaround.task(f, Turnaround.BAGGAGE_UNLOAD).duration_ticks

func _start_baggage_load(f: AirportFlight) -> void:
	baggage.start_load(f, clock.tick)

## Unload ends with the last bag off. The bag cutoff marks unready bags missed.
## Loading finalizes once the gate has closed and the cutoff has passed, and
## completes when the loader has nothing left to load or offload.
func _update_baggage_tasks(f: AirportFlight) -> void:
	var unload := turnaround.task(f, Turnaround.BAGGAGE_UNLOAD)
	if unload != null and unload.status == TurnaroundTask.RUNNING and clock.tick >= f.bag_unload_due_tick:
		turnaround.complete_task(f, Turnaround.BAGGAGE_UNLOAD, clock.tick)
	if baggage.enabled() and f.boarding_phase != "" and not f.bag_cutoff_passed and clock.tick >= f.bag_cutoff_tick:
		baggage.cutoff(f, clock.tick)
	var load := turnaround.task(f, Turnaround.BAGGAGE_LOAD)
	if load == null or load.status != TurnaroundTask.RUNNING: return
	if not baggage.enabled():
		# No baggage model in this scenario: loading takes its nominal time.
		if clock.tick >= load.start_tick + load.duration_ticks: turnaround.complete_task(f, Turnaround.BAGGAGE_LOAD, clock.tick)
		return
	if not f.bag_load_finalized and f.bag_cutoff_passed and f.boarding_phase in ["closed", "complete"]:
		baggage.finalize(f, clock.tick)
	if baggage.load_done(f):
		turnaround.complete_task(f, Turnaround.BAGGAGE_LOAD, clock.tick)

## Airport-wide baggage summary (data for later airline measures and economy).
func baggage_metrics() -> Dictionary:
	var out := {"bags": 0, "passengers_with_bags": 0, "originating": 0, "local": 0, "transfer": 0, "departed": 0,
		"transfer_made": 0, "transfer_missed": 0, "missed_flight": 0, "held": 0, "at_reclaim": 0, "collected": 0,
		"reclaim_waits": 0, "reclaim_wait_ticks": 0, "max_reclaim_wait_ticks": 0, "baggage_delay_ticks": 0, "in_processing": 0}
	for bag: AirportBag in airport.bags.values():
		out.bags += 1
		out[bag.kind] += 1
		match bag.state:
			"departed":
				out.departed += 1
				if bag.kind == "transfer": out.transfer_made += 1
			"missed_connection": out.transfer_missed += 1
			"missed_flight": out.missed_flight += 1
			"held": out.held += 1
			"at_reclaim": out.at_reclaim += 1
			"collected": out.collected += 1
			"in_transit", "queued", "sorting", "unloading", "loading", "ready_for_flight": out.in_processing += 1
	for p: Passenger in airport.passengers.values():
		if p.checked_bag_ids.is_empty(): continue
		out.passengers_with_bags += 1
		if p.bags_collected_tick >= 0:
			var wait := p.bags_collected_tick - p.reclaim_arrival_tick
			out.reclaim_waits += 1
			out.reclaim_wait_ticks += wait
			out.max_reclaim_wait_ticks = maxi(out.max_reclaim_wait_ticks, wait)
	for f: AirportFlight in flight_order:
		out.baggage_delay_ticks += int(f.departure_delay_breakdown.get("baggage_load", 0)) + int(f.departure_delay_breakdown.get("baggage_unload", 0))
	out["bags_per_passenger"] = float(out.bags) / maxi(1, airport.passengers.size())
	out["mean_reclaim_wait_ticks"] = 0 if out.reclaim_waits == 0 else out.reclaim_wait_ticks / out.reclaim_waits
	return out

## A transfer bag's slack: ready for its outbound flight vs that flight's bag cutoff.
func bag_transfer_margin(bag: AirportBag) -> int:
	var f: AirportFlight = airport.flights[bag.legs[-1]]
	if bag.ready_tick < 0 or f.bag_cutoff_tick < 0: return 0
	return f.bag_cutoff_tick - bag.ready_tick

## One flight's baggage at a glance: loaded of expected, still in processing,
## transfer bags still on inbound aircraft, not yet checked in, and outcomes.
func flight_baggage(f: AirportFlight) -> Dictionary:
	var out := {"expected": 0, "loaded": 0, "ready": 0, "sorting": 0, "transfer_inbound": 0, "not_checked": 0,
		"missed": f.bags_missed, "held": f.bags_held, "inbound": 0, "unloaded": 0}
	for bag: AirportBag in baggage.bags_for(f):
		if bag.missed_flight_id == f.id: continue
		out.expected += 1
		if bag.leg_index < bag.legs.size() - 1:
			out.transfer_inbound += 1
			continue
		match bag.state:
			"created": out.not_checked += 1
			"in_transit", "queued", "sorting": out.sorting += 1
			"ready_for_flight", "loading": out.ready += 1
			"on_aircraft", "departed": out.loaded += 1
	for id in f.inbound_passenger_ids:
		for bag_id in airport.passengers[str(id)].checked_bag_ids:
			var bag: AirportBag = airport.bags[bag_id]
			if bag.legs[0] != f.id: continue
			out.inbound += 1
			if bag.unloaded_tick >= 0: out.unloaded += 1
	return out

## When a bag should be sorted and ready for its (last) flight, from its
## scheduled events, queue position and the inbound aircraft's unload plan.
func bag_ready_estimate(bag: AirportBag) -> int:
	if bag.ready_tick >= 0: return bag.ready_tick
	var stage_id := "transfer_sortation" if bag.kind == "transfer" else "outbound_sortation"
	var s: Dictionary = baggage.stages.get(stage_id, {})
	if s.is_empty(): return -1
	var sort_ticks: int = int(s.service_ticks) * (1 + s.queue.size() / maxi(1, int(s.servers)))
	var due := -1
	for e in baggage.pending:
		if e.bag_id == bag.id: due = int(e.tick)
	match bag.state:
		"sorting": return due
		"queued": return clock.tick + int(s.service_ticks) * (1 + s.queue.find(bag.id) / maxi(1, int(s.servers)))
		"in_transit": return due + sort_ticks
		"unloading": return due + int(s.transit_ticks) + sort_ticks
		"on_aircraft":
			if bag.leg_index != 0 or bag.kind != "transfer": return -1
			var a: AirportFlight = airport.flights[bag.legs[0]]
			var dock := a.gate_arrival_tick if a.gate_arrival_tick >= 0 else a.scheduled_arrival + a.inbound_delay_ticks + _taxi_in_plan(a)
			var secured: TurnaroundTask = turnaround.task(a, "arrival_secured")
			var rates := baggage._rates(a)
			var rank := 1
			for id in a.inbound_passenger_ids:
				for other in airport.passengers[str(id)].checked_bag_ids:
					if other < bag.id and airport.bags[other].legs[0] == a.id: rank += 1
			return maxi(dock, clock.tick) + (secured.duration_ticks if secured != null else 0) + int(rates.get("unload_base_ticks", 0)) + \
				rank * int(rates.get("unload_ticks_per_bag", 0)) + int(s.transit_ticks) + sort_ticks
	return -1

## A transfer bag's outlook: ON BOARD, MISSED CONNECTION, HELD, or while still
## moving ON TRACK / AT RISK against its flight's bag cutoff.
func bag_connection_status(bag: AirportBag) -> Dictionary:
	var f: AirportFlight = airport.flights[bag.legs[-1]]
	var cutoff := f.bag_cutoff_tick if f.bag_cutoff_tick >= 0 else f.scheduled_departure - int(config.get("baggage", {}).get("bag_cutoff_before_departure_ticks", 0))
	if bag.missed_flight_id == f.id and not bag.state in ["missed_connection", "held"]:
		return {"status": "HELD" if bag.missed_reason == BaggageSystem.REASON_NOT_BOARDED else "MISSED CONNECTION", "ready": bag_ready_estimate(bag), "cutoff": cutoff}
	match bag.state:
		"missed_connection": return {"status": "MISSED CONNECTION", "ready": bag.ready_tick, "cutoff": cutoff}
		"held": return {"status": "HELD", "ready": bag.ready_tick, "cutoff": cutoff}
		"on_aircraft", "departed", "loading", "ready_for_flight":
			if bag.leg_index == bag.legs.size() - 1: return {"status": "LOADED" if bag.state in ["on_aircraft", "departed"] else "READY", "ready": bag.ready_tick, "cutoff": cutoff}
	var ready := bag_ready_estimate(bag)
	return {"status": "ON TRACK" if ready >= 0 and ready <= cutoff - 1800 else "AT RISK", "ready": ready, "cutoff": cutoff}



# --- operational resources (M8) -----------------------------------------------

func _bind_resources() -> void:
	var ids: Array = []
	for f: AirportFlight in flight_order: ids.append(f.id)
	resources = AirportResources.new()
	resources.bind(airport, events, config.get("resources", {}), ids, turnaround.order)
	turnaround.resources = resources

## Player decision: which flight goes first when turnaround resources are
## scarce. Reorders its waiting tasks; never adds capacity.
func set_service_priority(flight_id: String, priority: String) -> bool:
	if not airport.flights.has(flight_id) or not priority in AirportResources.PRIORITIES: return false
	var f: AirportFlight = airport.flights[flight_id]
	if f.status == "departed" or f.service_priority == priority: return false
	f.service_priority = priority
	resources.reprioritize(f)
	decisions.append({"tick": clock.tick, "type": "set_service_priority", "flight_id": flight_id, "priority": priority})
	events.record(clock.tick, "SERVICE_PRIORITY_CHANGED", flight_id, {"priority": priority})
	return true

## Per resource type: utilization, waits and queues; plus which departures the
## shortage delayed (critical-path blame on "wait:<type>").
func resource_metrics() -> Dictionary:
	var pools := resources.metrics(clock.tick, int(config.start_tick))
	var delayed := 0
	var delay_ticks := 0
	for f: AirportFlight in flight_order:
		var mine := 0
		for cause in f.departure_delay_breakdown:
			if str(cause).begins_with("wait:"):
				mine += int(f.departure_delay_breakdown[cause])
				var type := str(cause).substr(5)
				if pools.has(type): pools[type]["delay_ticks"] = int(pools[type].get("delay_ticks", 0)) + int(f.departure_delay_breakdown[cause])
		if mine > 0: delayed += 1
		delay_ticks += mine
	return {"pools": pools, "flights_delayed": delayed, "delay_ticks": delay_ticks}

## Waiting tasks for one resource type, in queue order (for the UI).
func resource_queue(type: String) -> Array:
	var out: Array = []
	for id in resources.pools[type].queue: out.append(airport.turnaround_tasks[id])
	return out

## The tasks holding units of one resource type, by unit.
func resource_holders(type: String) -> Array:
	var out: Array = []
	for unit in resources.pools[type].units:
		out.append(null if unit.task_id.is_empty() else airport.turnaround_tasks[unit.task_id])
	return out



# --- airlines (M9) ----------------------------------------------------------------

## What one departed flight contributes to airline evaluation: its real
## outcome, and the connections and transfer bags it carried, credited to every
## airline on those itineraries.
func _airline_record(f: AirportFlight) -> Dictionary:
	var late := maxi(0, f.actual_departure - f.scheduled_departure)
	var turnaround_delay := 0
	var resource_delay := 0
	var baggage_delay := 0
	var cause := ""
	var cause_ticks := 0
	for key in f.departure_delay_breakdown:
		var ticks := int(f.departure_delay_breakdown[key])
		if ticks > cause_ticks:
			cause = key
			cause_ticks = ticks
		if key in ["runway_takeoff_queue", "taxi_congestion", "passenger_hold", "late_inbound"]: continue
		turnaround_delay += ticks
		if str(key).begins_with("wait:"): resource_delay += ticks
		if key in ["baggage_load", "baggage_unload", "wait:baggage_crew"]: baggage_delay += ticks
	var resource_wait := 0
	for t: TurnaroundTask in turnaround.tasks_of(f): resource_wait += t.resource_wait_ticks
	var connections := {}
	for id in f.passenger_ids:
		var p: Passenger = airport.passengers[str(id)]
		if p.journey_direction != "connecting" or p.itinerary_legs[-1] != f.id: continue
		var made := 1 if p.connection_status == "made" else 0
		for airline in _itinerary_airlines(p.itinerary_legs):
			var c: Array = connections.get(airline, [0, 0])
			connections[airline] = [c[0] + made, c[1] + 1 - made]
	var transfer_bags := {}
	var checked := 0
	for bag in baggage.bags_for(f):
		checked += 1
		if bag.kind != "transfer" or not bag.state in ["departed", "missed_connection"]: continue
		var made := 1 if bag.state == "departed" else 0
		for airline in _itinerary_airlines(bag.legs):
			var b: Array = transfer_bags.get(airline, [0, 0])
			transfer_bags[airline] = [b[0] + made, b[1] + 1 - made]
	var reclaim_ticks := 0
	var reclaim_waits := 0
	for id in f.inbound_passenger_ids:
		var p: Passenger = airport.passengers[str(id)]
		if p.bags_collected_tick >= 0 and p.reclaim_arrival_tick >= 0:
			reclaim_ticks += p.bags_collected_tick - p.reclaim_arrival_tick
			reclaim_waits += 1
	var preferred: Array = airlines.profile(f.airline_id).get("preferred_gates", [])
	return {"airline": f.airline_id, "late_ticks": late, "turnaround_delay_ticks": turnaround_delay, "resource_delay_ticks": resource_delay,
		"resource_wait_ticks": resource_wait, "baggage_delay_ticks": baggage_delay, "hold_ticks": f.hold_ticks, "bags_checked": checked,
		"reclaim_wait_ticks": reclaim_ticks, "reclaim_waits": reclaim_waits, "preferred_gate": preferred.is_empty() or f.assigned_gate_id in preferred,
		"connections": connections, "transfer_bags": transfer_bags, "cause": cause, "cause_ticks": cause_ticks,
		"served_first": _served_while_waiting(f, cause)}

func _itinerary_airlines(legs: Array) -> Array:
	var out: Array = []
	for leg in legs:
		var airline: String = airport.flights[leg].airline_id
		if not airline in out: out.append(airline)
	return out

## For a resource-wait cause: the flights handed that resource while this one
## waited, with their service priority (from RESOURCE_ASSIGNED events).
func _served_while_waiting(f: AirportFlight, cause: String) -> Array:
	if not cause.begins_with("wait:"): return []
	var type := cause.substr(5)
	var waiting: TurnaroundTask = null
	for t: TurnaroundTask in turnaround.tasks_of(f):
		if t.resource == type and t.resource_wait_ticks > 0 and (waiting == null or t.resource_wait_ticks > waiting.resource_wait_ticks): waiting = t
	if waiting == null: return []
	var out: Array = []
	var history := events.history
	# Events are in tick order: find the first at the start of the wait.
	var lo := 0
	var hi := history.size()
	while lo < hi:
		var mid := (lo + hi) / 2
		if int(history[mid].tick) < waiting.ready_tick: lo = mid + 1
		else: hi = mid
	for i in range(lo, history.size()):
		var e: Dictionary = history[i]
		if int(e.tick) > waiting.start_tick: break
		if e.type != "RESOURCE_ASSIGNED" or e.details.get("resource") != type or e.flight_id == f.id: continue
		var other: AirportFlight = airport.flights[e.flight_id]
		out.append("%s (%s)" % [other.flight_number, other.service_priority.to_upper()])
	return out

## A requested flight fits the next day's schedule: some compatible gate has no
## scheduled occupancy (with the gate buffer) overlapping its slot.
func _request_slot_free(spec: Dictionary) -> bool:
	var type: Dictionary = config.aircraft_types.get(spec.aircraft_type, {})
	# A request that names its gate needs that gate; otherwise any compatible one.
	var only := str(spec.get("assigned_gate_id", ""))
	var start := int(spec.scheduled_arrival) + int(config.taxi_in_ticks)
	var finish := int(spec.scheduled_departure)
	var buffer := int(config.gate_buffer_ticks)
	for gate: AirportGate in airport.gates.values():
		if not str(type.get("class", "")) in gate.supported_aircraft_classes: continue
		if not only.is_empty() and gate.id != only: continue
		var clear := true
		for f: AirportFlight in flight_order:
			if f.assigned_gate_id != gate.id: continue
			var busy_from := f.scheduled_arrival + int(config.taxi_in_ticks) - buffer
			var busy_to := f.scheduled_departure + buffer
			if start < busy_to and finish > busy_from:
				clear = false
				break
		if clear: return true
	return false

## Player decision on an airline's request for more flights (M9).
func answer_airline_request(airline: String, accept: bool) -> bool:
	if not airlines.answer_request(airline, accept, clock.tick): return false
	decisions.append({"tick": clock.tick, "type": "airline_request", "airline": airline, "accept": accept})
	return true



# --- economy (M10) ------------------------------------------------------------------

## A departed flight's revenue: service fee by aircraft type, its departed
## passengers, and the bags it handled (flown out, and unloaded from its
## inbound). Posted once, at takeoff.
func _post_flight_revenue(f: AirportFlight) -> void:
	var passengers := 0
	for id in f.passenger_ids:
		var p: Passenger = airport.passengers[str(id)]
		if p.current_flight_id == f.id and p.airport_state == "departed": passengers += 1
	var bags_out := 0
	for bag in baggage.bags_for(f):
		if bag.state == "departed" and bag.current_flight_id == f.id: bags_out += 1
	var bags_in := 0
	for id in f.inbound_passenger_ids:
		for bag_id in airport.passengers[str(id)].checked_bag_ids:
			var bag: AirportBag = airport.bags[bag_id]
			if bag.legs[0] == f.id and bag.unloaded_tick >= 0: bags_in += 1
	economy.flight_departed(f, airport.aircraft[f.aircraft_id].aircraft_type_id, passengers, bags_out, bags_in, clock.tick)

func _contract_settled(airline: String, contract: Dictionary, passed: bool, now: int) -> void:
	economy.contract_settled(airline, str(airport.airlines.get(airline, airline)), contract, passed, now)



# --- airside movement (M12) -----------------------------------------------------------

func _setup_airside() -> void:
	airport.runways = {}
	_taxi_plan = {}
	airside = AirsideNetwork.new()
	if not config.has("airside"):
		# Scenarios without an airside keep the single timer-based runway.
		var legacy := AirportRunway.new()
		airport.runways[legacy.id] = legacy
		return
	var data: Dictionary = config.airside.duplicate(true)
	data["layout_revision"] = int(config.get("layout_revision", 0))
	airside.setup(data)
	for r in airside.runways():
		var runway := AirportRunway.new()
		runway.id = r.id
		runway.label = str(r.get("label", r.id))
		runway.length_m = int(r.length_m)
		runway.status = str(r.get("status", "open"))
		runway.a = r.a
		runway.b = r.b
		airport.runways[runway.id] = runway

func _aircraft_type(f: AirportFlight) -> String:
	return airport.aircraft[f.aircraft_id].aircraft_type_id

func _aircraft_class(f: AirportFlight) -> String:
	return airport.aircraft[f.aircraft_id].required_gate_type

func _stand(f: AirportFlight) -> String:
	return str(config.airside.get("stands", {}).get(f.assigned_gate_id, ""))

## The taxi legs for a flight between its stand and a runway.
func _taxi_route(f: AirportFlight, runway: AirportRunway, direction: String) -> Array:
	if direction == "in": return airside.route(runway.b, _stand(f), _aircraft_class(f))
	return airside.route(_stand(f), runway.a, _aircraft_class(f))

## Deterministic runway choice among open runways long enough for the type with
## a route to or from the stand: lowest estimated time (free-flow taxi + queue
## length × operation time), then runway id.
func _choose_runway(f: AirportFlight, operation: String) -> String:
	if not airside.enabled(): return _runway_ids()[0]
	var best := ""
	var best_cost := 1 << 60
	var op_ticks := int(config.landing_ticks if operation == "landing" else config.takeoff_ticks) + int(config.separation_ticks)
	for id in _runway_ids():
		var runway: AirportRunway = airport.runways[id]
		if not airside.runway_serves(airside.runway(id), _aircraft_type(f)): continue
		var legs := _taxi_route(f, runway, "in" if operation == "landing" else "out")
		if legs.is_empty(): continue
		var cost := airside.free_ticks(legs) + (runway.queue.size() + (0 if runway.active_operation.is_empty() else 1)) * op_ticks
		if cost < best_cost:
			best = id
			best_cost = cost
	return best if not best.is_empty() else _runway_ids()[0]

## Free-flow taxi time for planning (queue-free best runway); the scenario's
## constants when there is no airside.
func _taxi_in_plan(f: AirportFlight) -> int:
	return _plan_ticks(f, "in", int(config.taxi_in_ticks))

func _taxi_out_plan(f: AirportFlight) -> int:
	return _plan_ticks(f, "out", int(config.taxi_out_ticks))

func _plan_ticks(f: AirportFlight, direction: String, fallback: int) -> int:
	if not airside.enabled(): return fallback
	var key := "%s:%s:%s" % [f.assigned_gate_id, _aircraft_type(f), direction]
	if not _taxi_plan.has(key):
		var best := -1
		for id in _runway_ids():
			if not airside.runway_serves(airside.runway(id), _aircraft_type(f)): continue
			var legs := _taxi_route(f, airport.runways[id], direction)
			if legs.is_empty(): continue
			var ticks := airside.free_ticks(legs)
			if best < 0 or ticks < best: best = ticks
		_taxi_plan[key] = best if best >= 0 else fallback
	return int(_taxi_plan[key])

## A taxi route begins (after landing, or at pushback).
func _begin_taxi(f: AirportFlight, direction: String) -> void:
	var runway: AirportRunway = airport.runways[f.runway_id]
	f.taxi_route = _taxi_route(f, runway, direction)
	f.taxi_leg = -1
	f.leg_enter_tick = -1
	f.leg_exit_tick = -1
	f.taxi_start_tick = clock.tick
	f.taxi_free_ticks = airside.free_ticks(f.taxi_route)
	f.taxi_state = "starting"
	f.taxi_blocker = ""
	_transition(f, "taxiing_in" if direction == "in" else "taxiing_out", f.taxi_free_ticks)
	_advance_taxi(f)

## Move a taxiing aircraft on: start the route (direction locks), then enter
## each next leg when it is free. True once the route is complete (at the stand,
## or at the runway hold). Waiting is only ever for same-direction traffic, a
## node being crossed, or (before starting) opposing traffic or an occupied gate.
func _advance_taxi(f: AirportFlight) -> bool:
	if f.taxi_state == "done": return true
	if f.taxi_state == "starting":
		var inbound := f.status == "taxiing_in"
		if inbound and _has_two_way(f.taxi_route):
			var gate: AirportGate = airport.gates[f.assigned_gate_id]
			if not gate.occupied_by_flight_id.is_empty() or clock.tick < gate.available_from:
				f.taxi_blocker = "gate %s occupied" % gate.id
				# Waiting for the gate is a gate wait (M1), not taxi congestion.
				if f.taxi_hold_tick != clock.tick:
					f.taxi_hold_tick = clock.tick
					f.taxi_gate_hold_ticks += 1
					_add_delay(f, "gate_wait", 1)
				return false
		if not airside.try_start(f.taxi_route):
			var blocked := airside.start_blocker(f.taxi_route)
			f.taxi_blocker = "opposing traffic on " + blocked
			_taxi_wait_on(f, blocked + ":1")
			return false
		f.taxi_state = "moving"
	while true:
		if f.taxi_leg >= 0 and clock.tick < f.leg_exit_tick: return false
		# Nobody passes: the aircraft ahead on this edge leaves first.
		if f.taxi_leg >= 0 and not airside.is_front(f.taxi_route[f.taxi_leg], f.id):
			f.taxi_blocker = "taxiway"
			_taxi_wait_on(f, f.taxi_route[f.taxi_leg])
			return false
		var next := f.taxi_leg + 1
		if next >= f.taxi_route.size():
			if f.taxi_leg >= 0: airside.leave(f.taxi_route[f.taxi_leg], f.id)
			_finish_taxi(f)
			return true
		var exit_tick := airside.try_enter(f.taxi_route[next], clock.tick, f.id)
		if exit_tick < 0:
			f.taxi_blocker = airside.enter_blocker(f.taxi_route[next], clock.tick)
			_taxi_wait_on(f, f.taxi_route[next])
			return false
		if f.taxi_leg >= 0: airside.leave(f.taxi_route[f.taxi_leg], f.id)
		f.taxi_leg = next
		f.leg_enter_tick = clock.tick
		f.leg_exit_tick = exit_tick
		f.taxi_blocker = ""
	return false

## Gate reassignment while taxiing in. The new route starts where the aircraft
## is: its route start (still holding there), the end of its current edge
## (moving), or the stand it holds at (the old gate was occupied). Refused, with
## the reason, if there is no route or opposing traffic owns it right now.
## With apply = false nothing changes.
func _reroute_taxi(f: AirportFlight, gate_id: String, apply: bool) -> String:
	var stand := str(config.airside.get("stands", {}).get(gate_id, ""))
	var from := ""
	var kept: Array = []
	var rest: Array = []
	match f.taxi_state:
		"starting": from = airside.leg_from(f.taxi_route[0])
		"moving":
			from = airside.leg_to(f.taxi_route[f.taxi_leg]) if f.taxi_leg >= 0 else airside.leg_from(f.taxi_route[0])
			kept = f.taxi_route.slice(0, f.taxi_leg + 1)
			rest = f.taxi_route.slice(f.taxi_leg + 1)
		_: from = airside.leg_to(f.taxi_route[-1])
	var legs := airside.route(from, stand, _aircraft_class(f))
	if legs.is_empty(): return "No taxi route from %s to gate %s" % [str(airside.nodes[from].get("label", from)), gate_id]
	if f.taxi_state == "starting":
		if apply:
			f.taxi_route = legs
			f.taxi_free_ticks = airside.free_ticks(legs)
			events.record(clock.tick, "TAXI_REROUTED", f.id, {"gate_id": gate_id, "from": from})
		return ""
	# Swap the direction locks of the rest of the route for the new one's.
	airside.release_route(rest)
	if not airside.try_start(legs):
		var blocker := airside.start_blocker(legs)
		airside.try_start(rest)
		return "Taxiing: opposing traffic on %s; try again shortly" % blocker
	if not apply:
		airside.release_route(legs)
		airside.try_start(rest)
		return ""
	if f.taxi_state == "moving":
		f.taxi_route = kept + legs
		f.taxi_free_ticks = airside.free_ticks(kept) + airside.free_ticks(legs)
	else:
		# Holding at the old stand: a new taxi from there.
		f.taxi_route = legs
		f.taxi_leg = -1
		f.leg_enter_tick = -1
		f.leg_exit_tick = -1
		f.taxi_state = "moving"
		f.taxi_start_tick = clock.tick
		f.taxi_free_ticks = airside.free_ticks(legs)
		f.taxi_blocker = ""
	events.record(clock.tick, "TAXI_REROUTED", f.id, {"gate_id": gate_id, "from": from})
	return ""

## One tick of an aircraft waiting for an edge (counted once per tick per aircraft).
func _taxi_wait_on(f: AirportFlight, leg: String) -> void:
	if f.taxi_hold_tick == clock.tick: return
	f.taxi_hold_tick = clock.tick
	var st: Dictionary = airside.edge_state[AirsideNetwork.leg_edge(leg)]
	st["wait_ticks"] = int(st.get("wait_ticks", 0)) + 1

func _has_two_way(legs: Array) -> bool:
	for leg in legs:
		if not bool(airside.edges[AirsideNetwork.leg_edge(leg)].get("oneway", false)): return true
	return false

func _finish_taxi(f: AirportFlight) -> void:
	f.taxi_state = "done"
	f.taxi_blocker = ""
	var actual := clock.tick - f.taxi_start_tick
	var waited := maxi(0, actual - f.taxi_free_ticks - f.taxi_gate_hold_ticks)
	f.taxi_gate_hold_ticks = 0
	# Inbound taxi may come in parts (a reroute from a held stand): they add up.
	if f.status == "taxiing_in":
		f.taxi_in_ticks_actual = maxi(0, f.taxi_in_ticks_actual) + actual
		f.taxi_in_wait_ticks += waited
	else:
		f.taxi_out_ticks_actual = actual
		f.taxi_out_wait_ticks = waited
	if waited > 0: _add_delay(f, "taxi_congestion", waited)
	events.record(clock.tick, "TAXI_COMPLETED", f.id, {"direction": "in" if f.status == "taxiing_in" else "out", "ticks": actual, "waited": waited, "runway": f.runway_id})

## What a taxiing aircraft is doing, for the flight detail.
func taxi_status(f: AirportFlight) -> Dictionary:
	if not airside.enabled() or f.taxi_route.is_empty() or not f.status in ["taxiing_in", "taxiing_out"]: return {}
	var names: Array = []
	for leg in f.taxi_route:
		var node := airside.leg_to(leg)
		var label := str(airside.nodes[node].get("label", ""))
		if not label.is_empty() and not label in names: names.append(label)
	var ahead := ""
	var blocker := f.taxi_blocker
	# Held back on an edge by the aircraft ahead (past its free-flow time on it).
	if blocker.is_empty() and f.taxi_state == "moving" and f.taxi_leg >= 0 and clock.tick >= f.leg_enter_tick + int(airside.edges[AirsideNetwork.leg_edge(f.taxi_route[f.taxi_leg])].ticks) and clock.tick < f.leg_exit_tick:
		blocker = "taxiway"
	if blocker == "taxiway":
		var leg: String = f.taxi_route[f.taxi_leg] if f.taxi_leg >= 0 else f.taxi_route[0]
		var other := airside.front(leg)
		# Refused entry to the next edge: whoever entered it last is ahead.
		if (other == f.id or f.taxi_leg < 0) and f.taxi_leg + 1 < f.taxi_route.size():
			other = str(airside.edge_state[AirsideNetwork.leg_edge(f.taxi_route[f.taxi_leg + 1])].get("last_who", ""))
		if airport.flights.has(other) and other != f.id: ahead = airport.flights[other].flight_number
	return {"direction": "in" if f.status == "taxiing_in" else "out", "runway": airport.runways[f.runway_id].label if airport.runways.has(f.runway_id) else "",
		"route": names, "state": f.taxi_state, "blocker": blocker, "ahead": ahead}

## Where an aircraft is on the airside, in world metres (or empty).
func aircraft_position(f: AirportFlight) -> Dictionary:
	if not airside.enabled(): return {}
	if f.status in ["taxiing_in", "taxiing_out"] and not f.taxi_route.is_empty():
		if f.taxi_leg < 0:
			var start := airside.leg_from(f.taxi_route[0])
			return {"pos": airside.node_position(start)}
		var leg: String = f.taxi_route[f.taxi_leg]
		return {"pos": airside.position_on(leg, f.leg_enter_tick, f.leg_exit_tick, clock.tick)}
	return {}

## Airside summary: per runway movements, utilization and queue; taxi times.
func airside_metrics() -> Dictionary:
	var runways := {}
	for id in _runway_ids():
		var r: AirportRunway = airport.runways[id]
		var span := maxi(1, clock.tick - int(config.start_tick))
		runways[id] = {"label": r.label, "movements": r.movements, "utilization": float(r.busy_ticks) / span, "queue": r.queue.size(), "peak_queue": r.peak_queue, "length_m": r.length_m, "status": r.status}
	var taxi_in := 0
	var taxi_out := 0
	var waits := 0
	var count_in := 0
	var count_out := 0
	for f: AirportFlight in flight_order:
		if f.taxi_in_ticks_actual >= 0:
			taxi_in += f.taxi_in_ticks_actual
			count_in += 1
		if f.taxi_out_ticks_actual >= 0:
			taxi_out += f.taxi_out_ticks_actual
			count_out += 1
		waits += f.taxi_in_wait_ticks + f.taxi_out_wait_ticks
	return {"runways": runways, "mean_taxi_in_ticks": 0 if count_in == 0 else taxi_in / count_in, "mean_taxi_out_ticks": 0 if count_out == 0 else taxi_out / count_out,
		"taxi_wait_ticks": waits, "routes": airside._routes.size()}


## M12: the saved airside occupancy agrees with the network and the aircraft on it.
static func _valid_airside(data: Dictionary) -> bool:
	var state: Dictionary = data.airport
	var saved = data.get("airside")
	if not saved is Dictionary: return false
	if not data.scenario.has("airside"):
		return saved.get("edge_state", {}).is_empty() and state.runways.size() == 1
	var airside: Dictionary = data.scenario.airside
	if not AirsideNetwork.valid_definition(airside): return false
	if not saved.get("edge_state") is Dictionary or not saved.get("node_busy") is Dictionary: return false
	var edges := {}
	for e in airside.edges: edges[e.id] = e
	if saved.edge_state.size() != edges.size(): return false
	var runway_ids := {}
	for r in airside.runways: runway_ids[r.id] = r
	if state.runways.size() != runway_ids.size(): return false
	var locks := {}
	for key in state.flights:
		var f: Dictionary = state.flights[key]
		if not f.runway_id.is_empty() and not runway_ids.has(f.runway_id): return false
		if not f.status in ["taxiing_in", "taxiing_out"] or f.taxi_route.is_empty(): continue
		if f.taxi_leg < -1 or f.taxi_leg >= f.taxi_route.size(): return false
		if not f.taxi_state in ["starting", "moving", "done"]: return false
		for leg in f.taxi_route:
			if not leg is String or not edges.has(AirsideNetwork.leg_edge(leg)) or not AirsideNetwork.leg_dir(leg) in [1, -1]: return false
		# Two-way locks held: every two-way leg from the current one on, once moving.
		if f.taxi_state != "moving": continue
		for i in range(maxi(0, f.taxi_leg), f.taxi_route.size()):
			var leg: String = f.taxi_route[i]
			var e: Dictionary = edges[AirsideNetwork.leg_edge(leg)]
			if bool(e.get("oneway", false)): continue
			var held: Array = locks.get(e.id, [0, 0])
			if held[0] > 0 and held[1] != AirsideNetwork.leg_dir(leg): return false
			locks[e.id] = [held[0] + 1, AirsideNetwork.leg_dir(leg)]
	for id in saved.edge_state:
		var st = saved.edge_state[id]
		if not edges.has(id) or not st is Dictionary or not st.get("occupants") is Array: return false
		for who in st.occupants:
			var f = state.flights.get(who)
			if f == null or f.taxi_leg < 0 or f.taxi_leg >= f.taxi_route.size() or AirsideNetwork.leg_edge(f.taxi_route[f.taxi_leg]) != id: return false
		var held: Array = locks.get(id, [0, 0])
		if int(st.get("locks", -1)) != held[0]: return false
		if held[0] > 0 and int(st.get("lock_dir", 0)) != held[1]: return false
	return true
