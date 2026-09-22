class_name AirportMap
extends Control
signal flight_selected(flight_id: String)
var sim: AirportSimulation
var selected_id: String = ""
var hits: Dictionary = {}
const INK := Color("a7becd")
const MINT := Color("70dec0")
const AMBER := Color("ffc078")

func _ready() -> void:
	custom_minimum_size = Vector2(600, 290)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

func _label(at: Vector2, text: String, color: Color = INK, font_size: int = 13) -> void:
	draw_string(ThemeDB.fallback_font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)

func gate_position(index: int) -> Vector2:
	return Vector2(60 + index * (size.x - 120) / 7, size.y * 0.67)

func _draw() -> void:
	draw_style_box(_background(), Rect2(Vector2.ZERO, size))
	if sim == null: return
	hits.clear()
	_label(Vector2(20, 28), "AIRFIELD  /  TERMINAL A", MINT, 13)
	_label(Vector2(size.x - 218, 28), "09 / 27   •   SINGLE RUNWAY")
	var runway_y := size.y * 0.25
	draw_rect(Rect2(26, runway_y - 17, size.x - 52, 34), Color("344753"))
	for x in range(65, int(size.x - 40), 45):
		draw_line(Vector2(x, runway_y), Vector2(x + 22, runway_y), Color("9cabb3"), 2)
	_label(Vector2(34, runway_y + 5), "09", Color.WHITE, 12)
	var taxi_y := size.y * 0.44
	draw_line(Vector2(50, taxi_y), Vector2(size.x - 50, taxi_y), Color("617161"), 3)
	draw_line(Vector2(50, runway_y + 20), Vector2(50, taxi_y), Color("617161"), 3)
	draw_line(Vector2(size.x - 50, runway_y + 20), Vector2(size.x - 50, taxi_y), Color("617161"), 3)
	draw_rect(Rect2(28, size.y * 0.76, size.x - 56, size.y * 0.18), Color("233b49"))
	_label(Vector2(44, size.y * 0.89), "RIVERDALE  /  CONCOURSE A", INK, 14)
	var keys := sim.airport.gates.keys()
	for i in keys.size():
		var gate: AirportGate = sim.airport.gates[keys[i]]
		var pos := gate_position(i)
		var occupied := not gate.occupied_by_flight_id.is_empty()
		var color := MINT if occupied else INK
		for conflict in sim.conflicts.values():
			if conflict.gate_id == gate.id: color = AMBER
		draw_line(Vector2(pos.x, taxi_y), pos, Color("465b61"), 1)
		draw_line(pos + Vector2(0, 18), Vector2(pos.x, size.y * 0.76), color, 4)
		draw_circle(pos, 22, Color("2c414d"))
		if sim.airport.flights.has(selected_id) and sim.airport.flights[selected_id].assigned_gate_id == gate.id:
			draw_arc(pos, 27, 0, TAU, 32, Color("ffc078"), 2)
		_label(pos + Vector2(-10, 43), gate.id, color, 14)
		if gate.type == "wide": _label(pos + Vector2(-15, 58), "WIDE", INK, 9)
	for flight: AirportFlight in sim.airport.flights.values():
		if flight.status in ["scheduled", "departed"]: continue
		var index := keys.find(flight.assigned_gate_id)
		var gate_pos := gate_position(index)
		var position := gate_pos
		var progress := clampf(float(sim.clock.tick - flight.state_since) / maxf(1, flight.due_tick - flight.state_since), 0, 1)
		match flight.status:
			"approaching": position = Vector2(65 + (index % 4) * 50, runway_y - 30 - (index / 4) * 22)
			"landed": position = Vector2(size.x - 55, runway_y)
			"taxiing_in":
				position = _route(Vector2(size.x - 50, taxi_y), Vector2(gate_pos.x, taxi_y), gate_pos - Vector2(0, 34), progress)
			"taxiing_out":
				position = _route(gate_pos, Vector2(gate_pos.x, taxi_y), Vector2(50, taxi_y), progress)
		var operation := sim.airport.runway.active_operation
		if operation.get("flight_id", "") == flight.id:
			var runway_progress := clampf(float(sim.clock.tick - int(operation.started_at)) / (int(operation.end_tick) - int(operation.started_at)), 0, 1)
			position = Vector2(70 + runway_progress * (size.x - 140), runway_y)
		var color := MINT if flight.id != selected_id else Color.WHITE
		if flight.id == selected_id: draw_arc(position, 20, 0, TAU, 32, AMBER, 2)
		_plane(position, color)
		_label(position + Vector2(-23, -19), flight.flight_number, color, 10)
		hits[flight.id] = position

func _background() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color("182d38")
	box.set_corner_radius_all(10)
	return box

func _route(a: Vector2, b: Vector2, c: Vector2, progress: float) -> Vector2:
	return a.lerp(b, progress * 2) if progress < 0.5 else b.lerp(c, (progress - 0.5) * 2)

func _plane(at: Vector2, color: Color) -> void:
	draw_colored_polygon(PackedVector2Array([at + Vector2(0, -14), at + Vector2(3, -3), at + Vector2(14, 5), at + Vector2(3, 3), at + Vector2(3, 10), at + Vector2(7, 13), at + Vector2(-7, 13), at + Vector2(-3, 10), at + Vector2(-3, 3), at + Vector2(-14, 5), at + Vector2(-3, -3)]), color)

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		for id in hits:
			if event.position.distance_to(hits[id]) < 25:
				flight_selected.emit(id)
				accept_event()
				return
