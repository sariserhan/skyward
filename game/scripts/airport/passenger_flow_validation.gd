class_name PassengerFlowValidation
extends RefCounted
## Validate cross-references before constructing a populated save.
static func valid(data: Dictionary) -> bool:
	var state: Dictionary = data.airport
	var flow: Dictionary = data.passenger_flow
	if not flow.get("pending") is Array or not flow.get("sequence") is int or flow.sequence < 0: return false
	if not flow.get("rng") is Dictionary: return false
	for key in ["seed", "state"]:
		if not flow.rng.get(key) is String or not flow.rng[key].is_valid_int(): return false
	var settings = data.scenario.get("passenger_flow", {})
	if not settings is Dictionary: return false
	if settings.is_empty():
		if not state.passengers.is_empty() or not state.security_checkpoints.is_empty() or not flow.pending.is_empty(): return false
		for f in state.flights.values():
			if not f.passenger_ids.is_empty(): return false
		return true
	for key in ["load_permille", "arrival_lead_min_ticks", "arrival_lead_max_ticks", "gate_target_buffer_ticks", "check_in_ticks", "staff_pool"]:
		if not settings.get(key) is int or settings[key] < 0: return false
	if not settings.get("graph") is Dictionary: return false
	var ranges: Array = settings.get("airline_load_permille_ranges", {}).values()
	if settings.has("load_permille_range"): ranges.append(settings.load_permille_range)
	for bounds in ranges:
		if not bounds is Array or bounds.size() != 2 or not bounds[0] is int or not bounds[1] is int: return false
		if bounds[0] < 0 or bounds[0] > bounds[1] or bounds[1] > 1000: return false
	var graph_data: Dictionary = settings.graph
	if not graph_data.get("nodes") is Dictionary or not graph_data.get("edges") is Array: return false
	for node in ["entrance", "check_in"]:
		if not graph_data.nodes.has(node): return false
	for gate in state.gates:
		if not graph_data.nodes.has(gate): return false
	for node in graph_data.nodes.values():
		if not node is Dictionary or not node.get("airside") is bool: return false
		if not node.get("x") is int or not node.get("y") is int: return false
	for edge in graph_data.edges:
		if not edge is Dictionary or not graph_data.nodes.has(edge.get("from", "")) or not graph_data.nodes.has(edge.get("to", "")): return false
		if not edge.get("walking_ticks") is int or edge.walking_ticks <= 0: return false
	var graph := TerminalGraph.new()
	graph.setup(graph_data)
	# Departing: one outbound manifest. Arriving: one inbound manifest.
	# Connecting: the inbound manifest of legs[0] and the outbound one of legs[1].
	var inbound_of := {}
	var outbound_of := {}
	for f in state.flights.values():
		for pair in [["inbound_passenger_ids", inbound_of], ["passenger_ids", outbound_of]]:
			for id in f[pair[0]]:
				if not id is int or pair[1].has(str(id)) or not state.passengers.has(str(id)): return false
				if not state.passengers[str(id)] is Dictionary: return false
				pair[1][str(id)] = f.id
	# Bookings (D-034): the manifest is exactly the target, split by origin.
	for f in state.flights.values():
		if f.passenger_ids.size() != f.target_bookings or f.originating_bookings + f.connecting_bookings != f.target_bookings: return false
	for key in state.passengers:
		var p = state.passengers[key]
		if not p is Dictionary: return false
		match p.get("journey_direction"):
			"departing":
				if inbound_of.has(key) or outbound_of.get(key) != p.current_flight_id: return false
			"arriving":
				if outbound_of.has(key) or inbound_of.get(key) != p.current_flight_id: return false
			"connecting":
				var legs = p.get("itinerary_legs")
				if not legs is Array or legs.size() != 2 or not p.get("leg_index") in [0, 1]: return false
				if inbound_of.get(key) != legs[0] or outbound_of.get(key) != legs[1] or legs[0] == legs[1]: return false
				if p.current_flight_id != legs[p.leg_index]: return false
				if not p.connection_status in ["pending", "made", "missed"]: return false
			_:
				return false
	var expected := Passenger.new().snapshot()
	for key in state.passengers:
		var p = state.passengers[key]
		if not p is Dictionary: return false
		for field in expected:
			if not p.has(field) or typeof(p[field]) != typeof(expected[field]): return false
		if str(p.id) != key or p.walking_speed <= 0 or not p.airport_state in PassengerFlow.JOURNEY_STATES: return false
		var arriving: bool = p.journey_direction == "arriving"
		var connecting: bool = p.journey_direction == "connecting"
		match p.journey_direction:
			"arriving":
				if not p.airport_state in PassengerFlow.ARRIVING_STATES: return false
			"connecting":
				if not p.airport_state in PassengerFlow.CONNECTING_STATES[p.leg_index]: return false
			_:
				if p.airport_state in ["deboarding", "walking_to_exit", "left_airport", "missed_connection"]: return false
				if not state.security_checkpoints.has(p.security_checkpoint_id): return false
		# Still on the inbound aircraft: no terminal location yet.
		var aboard: bool = (arriving or (connecting and p.leg_index == 0)) and p.airport_state in ["on_aircraft", "deboarding"]
		if aboard != ((arriving or connecting) and p.current_location == ""): return false
		if p.airport_state != "not_arrived" and not aboard and not graph.nodes.has(p.current_location): return false
		if p.airport_state == "waiting_at_gate":
			if not p.security_cleared or p.current_location != state.flights[p.current_flight_id].assigned_gate_id: return false
			if p.gate_arrival_time < 0 or p.gate_arrival_time > data.clock.tick: return false
		if p.airport_state.begins_with("walking_"):
			if p.walk_from != p.current_location or graph.edge_ticks(p.walk_from, p.walk_to) < 1: return false
			if p.walk_started_tick > data.clock.tick or p.flow_due_tick <= data.clock.tick: return false
			if p.airport_state == "walking_to_gate" and not p.security_cleared: return false
	var in_security := {}
	var staff := 0
	for key in state.security_checkpoints:
		var cp = state.security_checkpoints[key]
		if not AirportSimulation._entity_shape(cp, SecurityCheckpoint.new()) or cp.id != key: return false
		if not graph.nodes.has(cp.node_id) or cp.service_ticks <= 0 or cp.max_lanes < 1: return false
		if cp.open_lanes < 0 or cp.open_lanes > cp.max_lanes or cp.staff < 0 or cp.staff > cp.max_lanes: return false
		staff += cp.staff
		for id in cp.queue:
			if not _security_member(state, id, key, "security_queue", in_security): return false
			if state.passengers[str(id)].flow_due_tick != -1: return false
		for lane in cp.active:
			if not lane is String or not lane.is_valid_int() or int(lane) < 0 or int(lane) >= cp.max_lanes: return false
			var id = cp.active[lane]
			if not _security_member(state, id, key, "security_processing", in_security): return false
			if state.passengers[str(id)].security_lane != int(lane): return false
	if staff > settings.staff_pool: return false
	var scheduled := {}
	var sequences := {}
	for i in flow.pending.size():
		var event = flow.pending[i]
		if not event is Dictionary: return false
		for key in ["passenger_id", "tick", "sequence"]:
			if not event.get(key) is int: return false
		if event.tick <= data.clock.tick or event.sequence < 0 or event.sequence >= flow.sequence or sequences.has(event.sequence): return false
		sequences[event.sequence] = true
		var key := str(event.passenger_id)
		if not state.passengers.has(key) or scheduled.has(key): return false
		var p = state.passengers[key]
		if p.flow_due_tick != event.tick: return false
		var kind := ""
		match p.airport_state:
			"not_arrived": kind = "arrive"
			"check_in": kind = "check_in"
			"security_processing": kind = "security"
			"walking_to_check_in", "walking_to_security", "walking_to_gate", "walking_to_exit": kind = "walk"
		if kind.is_empty() or event.get("kind") != kind: return false
		scheduled[key] = true
		if i > 0:
			var parent: Dictionary = flow.pending[(i - 1) / 2]
			if event.tick < parent.tick or (event.tick == parent.tick and event.sequence < parent.sequence): return false
	for key in state.passengers:
		var p = state.passengers[key]
		if p.airport_state in ["security_queue", "security_processing"] and not in_security.has(key): return false
		if (p.flow_due_tick >= 0) != scheduled.has(key): return false
		if not p.airport_state in PassengerFlow.RESTING_STATES and not scheduled.has(key): return false
	return true

static func _security_member(state: Dictionary, id: Variant, checkpoint: String, phase: String, seen: Dictionary) -> bool:
	if not id is int or not state.passengers.has(str(id)) or seen.has(str(id)): return false
	var p = state.passengers[str(id)]
	if p.airport_state != phase or p.security_checkpoint_id != checkpoint or p.security_cleared: return false
	if p.current_location != state.security_checkpoints[checkpoint].node_id: return false
	seen[str(id)] = true
	return true
