class_name TerminalView
extends Control
signal passenger_selected(passenger_id: int)
var sim: AirportSimulation
var selected_id: int = -1
var display_ids: Array = []
var hits: Dictionary = {}
const MINT := Color("70dec0")
const INK := Color("a7becd")
const AMBER := Color("ffc078")

func _ready() -> void:
	custom_minimum_size = Vector2(600, 290)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

func position_of(node: String) -> Vector2:
	var data: Dictionary = sim.passenger_flow.graph.nodes.get(node, {"x": 500, "y": 900})
	return Vector2(24 + int(data.x) * (size.x - 48) / 1000.0, 18 + int(data.y) * (size.y - 40) / 1000.0)

func refresh_population() -> void:
	display_ids = []
	if sim == null: return
	var samples := {}
	var moving := 0
	for p: Passenger in sim.airport.passengers.values():
		if p.airport_state in ["not_arrived", "boarding", "on_aircraft", "departed", "deboarding", "left_airport"]: continue
		var walking := not p.walk_to.is_empty()
		var bucket := p.current_location + ":" + p.airport_state
		var limit := 8 if p.airport_state == "waiting_at_gate" else 18
		if p.id == selected_id or (walking and moving < 300) or (not walking and int(samples.get(bucket, 0)) < limit):
			display_ids.append(p.id)
			samples[bucket] = int(samples.get(bucket, 0)) + 1
			if walking: moving += 1
	queue_redraw()

func _label(at: Vector2, text: String, color: Color = INK, font_size: int = 12) -> void:
	draw_string(ThemeDB.fallback_font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("182d38"))
	if sim == null or sim.passenger_flow.graph.nodes.is_empty(): return
	var graph := sim.passenger_flow.graph
	for from in graph.edges:
		for edge in graph.edges[from]:
			draw_line(position_of(from), position_of(edge.to), Color("314d5c"), 7)
	if sim.airport.passengers.has(str(selected_id)):
		var selected: Passenger = sim.airport.passengers[str(selected_id)]
		if not selected.walk_to.is_empty():
			var route: Array = [selected.walk_from, selected.walk_to]
			route.append_array(graph.route(selected.walk_to, selected.route_goal, selected.security_cleared).slice(1))
			for i in range(1, route.size()): draw_line(position_of(route[i - 1]), position_of(route[i]), AMBER, 2)
	for node in graph.nodes:
		var pos := position_of(node)
		var is_gate := sim.airport.gates.has(node)
		draw_circle(pos, 8, MINT if is_gate else INK)
		if sim.airport.passengers.has(str(selected_id)):
			var selected: Passenger = sim.airport.passengers[str(selected_id)]
			if sim.airport.flights[selected.current_flight_id].assigned_gate_id == node:
				draw_arc(pos, 13, 0, TAU, 24, AMBER, 2)
		_label(pos + Vector2(-25, -15), graph.nodes[node].get("label", node), MINT if is_gate else INK, 11)
		if is_gate:
			var waiting := 0
			for f: AirportFlight in sim.flight_order:
				if f.assigned_gate_id == node: waiting += int(sim.passenger_flow.ready_by_flight.get(f.id, 0))
			_label(pos + Vector2(-15, 24), str(waiting) + " here", INK, 10)
	for cp: SecurityCheckpoint in sim.airport.security_checkpoints.values():
		var pos := position_of(cp.node_id)
		_label(pos + Vector2(18, 3), "%d queued · %d screening" % [cp.queue.size(), cp.active.size()], AMBER if cp.queue.size() > 30 else INK, 11)
	hits.clear()
	var slots := {}
	for id in display_ids:
		var p: Passenger = sim.airport.passengers[str(id)]
		var pos := position_of(p.current_location)
		if not p.walk_to.is_empty():
			var progress := clampf(float(sim.clock.tick - p.walk_started_tick) / maxi(1, p.flow_due_tick - p.walk_started_tick), 0, 1)
			pos = position_of(p.walk_from).lerp(position_of(p.walk_to), progress)
			pos += Vector2((p.id % 5 - 2) * 3, ((p.id / 5) % 3 - 1) * 3)
		else:
			var slot: int = int(slots.get(p.current_location, 0))
			slots[p.current_location] = slot + 1
			pos += Vector2(-23 + (slot % 8) * 6, 32 + (slot / 8) * 7)
		var color := AMBER if p.airport_state == "security_queue" else MINT
		if p.airport_state == "missed_flight": color = Color("e5484d")
		elif p.journey_direction == "arriving": color = Color("7aa2f7")
		draw_circle(pos, 2.5, color)
		if p.id == selected_id: draw_arc(pos, 7, 0, TAU, 16, Color.WHITE, 1.5)
		hits[p.id] = pos
	_label(Vector2(14, size.y - 9), "Click a passenger to follow their journey · gate and queue counts include everyone", INK, 11)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var nearest := -1
		var distance := 10.0
		for id in hits:
			var candidate: float = event.position.distance_to(hits[id])
			if candidate < distance:
				distance = candidate
				nearest = id
		if nearest >= 0:
			passenger_selected.emit(nearest)
			accept_event()
