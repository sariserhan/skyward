class_name AirportMap
extends Control
signal flight_selected(flight_id: String)
var sim: AirportSimulation
var selected_id: String = ""
var hits: Dictionary = {}
## M12: colour edges by occupancy and show queues (O); ids and reservations (F3).
var overlay := false
var debug := false
var _origin := Vector2.ZERO
var _scale := 1.0
## M13: mouse-wheel zoom around the cursor, right/middle-drag pan (airside map).
var zoom := 1.0
var pan := Vector2.ZERO
var _dragging := false
## The airport's name for the terminal label (set by the scene).
var airport_name := ""
const INK := Color("a7becd")
const MINT := Color("70dec0")
const AMBER := Color("ffc078")

func _ready() -> void:
	clip_contents = true
	custom_minimum_size = Vector2(600, 290)
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

func _label(at: Vector2, text: String, color: Color = INK, font_size: int = 13) -> void:
	draw_string(ThemeDB.fallback_font, at, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, color)

func gate_position(index: int) -> Vector2:
	# Spread however many gates are built along the apron (M11).
	return Vector2(60 + index * (size.x - 120) / maxi(1, sim.airport.gates.size() - 1), size.y * 0.67)

func _draw() -> void:
	draw_style_box(_background(), Rect2(Vector2.ZERO, size))
	if sim == null: return
	hits.clear()
	if sim.airside.enabled():
		_draw_airside()
		return
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
	_label(Vector2(44, size.y * 0.89), airport_name.to_upper() + "  /  TERMINAL", INK, 14)
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
		var operation: Dictionary = sim.airport.runways.values()[0].active_operation
		if operation.get("flight_id", "") == flight.id:
			var runway_progress := clampf(float(sim.clock.tick - int(operation.started_at)) / (int(operation.end_tick) - int(operation.started_at)), 0, 1)
			position = Vector2(70 + runway_progress * (size.x - 140), runway_y)
		var color := MINT if flight.id != selected_id else Color.WHITE
		if flight.id == selected_id: draw_arc(position, 20, 0, TAU, 32, AMBER, 2)
		_plane(position, color)
		_label(position + Vector2(-23, -19), flight.flight_number, color, 10)
		if flight.boarding_phase == "open": _label(position + Vector2(-23, 27), "BOARDING", MINT, 9)
		elif flight.boarding_phase == "closed": _label(position + Vector2(-23, 27), "DOORS CLOSING", AMBER, 9)
		hits[flight.id] = position

# --- airside (M12): everything below is drawn from the simulation's graph -------------

## World metres -> screen, fitted to the network's extent.
func _fit() -> void:
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for id in sim.airside.nodes:
		var p := sim.airside.node_position(id)
		lo = lo.min(p)
		hi = hi.max(p)
	for surface in sim.airside.config.get("surfaces", []):
		for point in surface.points:
			lo = lo.min(Vector2(point[0], point[1]))
			hi = hi.max(Vector2(point[0], point[1]))
	var zone: Dictionary = sim.airside.config.get("terminal_zone", {})
	if not zone.is_empty(): hi.y = maxf(hi.y, float(zone.y0) + 250.0)
	var span := (hi - lo).max(Vector2(1, 1))
	var area := size - Vector2(80, 90)
	_scale = minf(area.x / span.x, area.y / span.y)
	_origin = Vector2(40, 50) + (area - span * _scale) / 2.0 - lo * _scale

func _screen(world: Vector2) -> Vector2:
	var fitted := _origin + world * _scale
	return size / 2.0 + (fitted - size / 2.0) * zoom + pan

func _node(id: String) -> Vector2:
	return _screen(sim.airside.node_position(id))

func _draw_airside() -> void:
	_fit()
	var net := sim.airside
	if net.config.get("geographic", false): _draw_geographic_ground()
	var open := 0
	for r: AirportRunway in sim.airport.runways.values(): open += 1 if r.status == "open" else 0
	_label(Vector2(20, 28), "AIRFIELD" + ("" if is_equal_approx(zoom, 1.0) else "  ·  ZOOM %d%% (middle-click resets)" % roundi(zoom * 100)), MINT, 13)
	var header := "%d RUNWAY%s  ·  %d TAXI EDGES%s" % [open, "" if open == 1 else "S", net.edges.size(), "  ·  OVERLAY" if overlay else ""]
	if net.config.get("geographic", false) and not debug: header = "%d RUNWAYS  ·  SCROLL TO ZOOM / RIGHT-DRAG TO PAN" % open
	_label(Vector2(size.x - 20 - ThemeDB.fallback_font.get_string_size(header, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x, 28), header)
	var zone: Dictionary = net.config.get("terminal_zone", {})
	if not zone.is_empty():
		var top := _screen(Vector2(float(zone.x0), float(zone.y0)))
		draw_rect(Rect2(Vector2(28, top.y), Vector2(size.x - 56, size.y - top.y - 14)), Color("233b49"))
		_label(Vector2(44, size.y - 24), airport_name.to_upper() + "  /  TERMINAL", INK, 14)
	for r in net.runways():
		var a := _node(r.a)
		var b := _node(r.b)
		var closed := str(r.get("status", "open")) != "open"
		var width := maxf(3.0 if net.config.get("geographic", false) else 10.0, float(r.get("width_m", 45.0)) * _scale * zoom)
		draw_line(a, b, Color("2a353c") if closed else Color("344753"), width)
		var along := (b - a).normalized()
		var dash := 0.0
		while dash < a.distance_to(b) - 30:
			draw_line(a + along * (dash + 20), a + along * (dash + 34), Color("9cabb3") if not closed else Color("5b6870"), 2)
			dash += 36
		_label(a + Vector2(-6, -width / 2 - 6), "%s%s" % [r.get("label", r.id), "  CLOSED" if closed else ""], Color.WHITE if not closed else AMBER, 11)
		if overlay and sim.airport.runways.has(r.id):
			var rr: AirportRunway = sim.airport.runways[r.id]
			if rr.queue.size() > 0: _label(a + Vector2(40, -width / 2 - 6), "QUEUE %d" % rr.queue.size(), AMBER, 11)
	for id in net.edges:
		var e: Dictionary = net.edges[id]
		var a := _node(e.from)
		var b := _node(e.to)
		var st: Dictionary = net.edge_state[id]
		var color := Color("617161")
		if overlay:
			if not st.occupants.is_empty(): color = AMBER
			elif int(st.locks) > 0: color = MINT.darkened(0.3)
		if not net.config.get("geographic", false) or overlay or debug:
			draw_line(a, b, color, 3 if e.get("kind", "taxiway") == "taxiway" else 2)
		if bool(e.get("oneway", false)) and a.distance_to(b) > 24:
			var mid := (a + b) / 2.0
			var d := (b - a).normalized()
			draw_colored_polygon(PackedVector2Array([mid + d * 5, mid - d * 4 + d.orthogonal() * 4, mid - d * 4 - d.orthogonal() * 4]), color.lightened(0.25))
		if debug: _label((a + b) / 2.0 + Vector2(3, -3), id, Color("8ea0ab"), 8)
	if debug:
		for id in net.nodes:
			var busy := int(net.node_busy.get(id, -1)) > sim.clock.tick
			draw_circle(_node(id), 3, AMBER if busy else Color("8ea0ab"))
	# The selected flight's route.
	if sim.airport.flights.has(selected_id):
		var sf: AirportFlight = sim.airport.flights[selected_id]
		if sf.status in ["taxiing_in", "taxiing_out"]:
			for i in range(maxi(0, sf.taxi_leg), sf.taxi_route.size()):
				var edge: Dictionary = net.edges[net.leg_edge(sf.taxi_route[i])]
				if edge.has("points"):
					var line := PackedVector2Array()
					for point in edge.points: line.append(_screen(Vector2(point[0], point[1])))
					draw_polyline(line, Color(1, 0.75, 0.47, 0.8), 4)
				else: draw_line(_node(net.leg_from(sf.taxi_route[i])), _node(net.leg_to(sf.taxi_route[i])), Color(1, 0.75, 0.47, 0.8), 5)
	var stands: Dictionary = net.config.get("stands", {})
	for gate_id in sim.airport.gates:
		var gate: AirportGate = sim.airport.gates[gate_id]
		if not stands.has(gate_id): continue
		var pos := _node(stands[gate_id])
		var color := MINT if not gate.occupied_by_flight_id.is_empty() else INK
		for conflict in sim.conflicts.values():
			if conflict.gate_id == gate.id: color = AMBER
		var radius := clampf(2.0 * zoom, 2.0, 7.0) if net.config.get("geographic", false) else 13.0
		draw_circle(pos, radius, Color("2c414d"))
		draw_arc(pos, radius, 0, TAU, 24, color, 1.0)
		if sim.airport.flights.has(selected_id) and sim.airport.flights[selected_id].assigned_gate_id == gate.id:
			draw_arc(pos, 18, 0, TAU, 32, AMBER, 2)
		if not net.config.get("geographic", false) or zoom >= 3.0:
			_label(pos + Vector2(4, -4), gate.id, color, 10)
			if gate.type == "wide" and not net.config.get("geographic", false): _label(pos + Vector2(-13, 42), "WIDE", INK, 9)
	var approaching := 0
	for flight: AirportFlight in sim.airport.flights.values():
		if flight.status in ["scheduled", "departed"]: continue
		var world := _aircraft_world(flight)
		var position: Vector2
		if world.x == INF:
			# Approaching: stacked off the arrival end of the runway it will use.
			var start: Vector2 = _node(net.runways()[0].a) if not net.runways().is_empty() else Vector2(60, 60)
			position = start + Vector2(-10 - (approaching % 3) * 30, -30 - (approaching / 3) * 22)
			approaching += 1
		else: position = _screen(world)
		# Holding for an occupied stand: beside it, not on top of the aircraft parked there.
		if flight.status == "taxiing_in" and flight.taxi_state == "done": position += Vector2(-18, -20)
		var color := MINT if flight.id != selected_id else Color.WHITE
		if flight.taxi_blocker != "" and flight.status in ["taxiing_in", "taxiing_out"]: color = AMBER if flight.id != selected_id else Color.WHITE
		if flight.id == selected_id: draw_arc(position, 16, 0, TAU, 32, AMBER, 2)
		_plane_small(position, color)
		_label(position + Vector2(-20, -13), flight.flight_number, color, 9)
		hits[flight.id] = position


## Geographic source polygons and surveyed centre lines; no invented terminal boxes.
func _draw_geographic_ground() -> void:
	var data := sim.airside.config
	for layer in ["apron", "buildings"]:
		for surface in data.get("surfaces", []):
			if (surface.kind == "apron") != (layer == "apron"): continue
			var points := PackedVector2Array()
			for point in surface.points: points.append(_screen(Vector2(point[0], point[1])))
			if points.size() < 3: continue
			var color := Color("263b43") if layer == "apron" else Color("527382")
			if surface.kind == "terminal": color = Color("658d9c")
			if not Geometry2D.triangulate_polygon(points).is_empty(): draw_colored_polygon(points, color)
			points.append(points[0])
			draw_polyline(points, color.lightened(0.18), 1.0, true)
	for path in data.get("map_paths", []):
		var points := PackedVector2Array()
		for point in path.points: points.append(_screen(Vector2(point[0], point[1])))
		if points.size() < 2: continue
		var stand: bool = path.kind == "parking_position"
		draw_polyline(points, Color("9f9359") if stand else Color("52615e"), maxf(1.0, (3.0 if stand else 23.0) * _scale * zoom), true)
		if zoom >= 3.0 and not stand and not str(path.label).is_empty():
			_label(points[points.size() / 2], path.label, Color("d3c986"), 10)
	if zoom >= 4.0:
		for gate in data.get("map_gates", []):
			if sim.airport.gates.has(gate.label): continue
			var p := _screen(Vector2(gate.position[0], gate.position[1]))
			draw_circle(p, 2, INK)
			_label(p + Vector2(3, -3), gate.label, INK, 9)
	for surface in data.get("surfaces", []):
		if surface.kind != "terminal" or str(surface.label).is_empty(): continue
		if zoom < 2.0: continue
		if zoom < 4.0 and not str(surface.label) in ["Washington-Dulles International Airport, Main Terminal", "Concourse A & B", "Concourses C & D"]: continue
		var center := Vector2.ZERO
		for point in surface.points: center += Vector2(point[0], point[1])
		center /= surface.points.size()
		var text := str(surface.label).replace("Washington-Dulles International Airport, ", "")
		_label(_screen(center) + Vector2(0, -8), text, Color.WHITE, 11)
	_label(Vector2(20, 57), "N ↑  ·  FAA RUNWAYS / MAPPED FOOTPRINTS", INK, 10)
	_label(Vector2(20, size.y - 12), str(data.get("attribution", "")), INK, 10)

## World position (metres) of an aircraft, or (INF, INF) while still in the air.
func _aircraft_world(f: AirportFlight) -> Vector2:
	var net := sim.airside
	for r: AirportRunway in sim.airport.runways.values():
		var op := r.active_operation
		if op.get("flight_id", "") == f.id and net.nodes.has(r.a):
			var t := clampf(float(sim.clock.tick - int(op.started_at)) / maxf(1, int(op.end_tick) - int(op.started_at)), 0, 1)
			return net.node_position(r.a).lerp(net.node_position(r.b), t)
	var at: Dictionary = sim.aircraft_position(f)
	if not at.is_empty(): return at.pos
	match f.status:
		"approaching": return Vector2(INF, INF)
		"landed":
			if sim.airport.runways.has(f.runway_id): return net.node_position(sim.airport.runways[f.runway_id].b)
			return Vector2(INF, INF)
	var stand := str(net.config.get("stands", {}).get(f.assigned_gate_id, ""))
	return net.node_position(stand) if net.nodes.has(stand) else Vector2(INF, INF)

func _plane_small(at: Vector2, color: Color) -> void:
	var k := 0.7
	draw_colored_polygon(PackedVector2Array([at + Vector2(0, -14) * k, at + Vector2(3, -3) * k, at + Vector2(14, 5) * k, at + Vector2(3, 3) * k, at + Vector2(3, 10) * k, at + Vector2(7, 13) * k, at + Vector2(-7, 13) * k, at + Vector2(-3, 10) * k, at + Vector2(-3, 3) * k, at + Vector2(-14, 5) * k, at + Vector2(-3, -3) * k]), color)

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
	if sim != null and sim.airside.enabled():
		if event is InputEventMouseButton and event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
			var before := zoom
			zoom = clampf(zoom * (1.15 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0 / 1.15), 1.0, 4.0)
			# Keep the point under the cursor where it is.
			var c := size / 2.0
			pan = event.position - c - (event.position - c - pan) * (zoom / before)
			if is_equal_approx(zoom, 1.0): pan = Vector2.ZERO
			queue_redraw()
			accept_event()
			return
		if event is InputEventMouseButton and event.button_index in [MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_MIDDLE]:
			_dragging = event.pressed and event.button_index == MOUSE_BUTTON_RIGHT
			if event.pressed and event.button_index == MOUSE_BUTTON_MIDDLE:
				zoom = 1.0
				pan = Vector2.ZERO
				queue_redraw()
			accept_event()
			return
		if event is InputEventMouseMotion and _dragging:
			pan += event.relative
			queue_redraw()
			accept_event()
			return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		for id in hits:
			if event.position.distance_to(hits[id]) < (25 if not sim.airside.enabled() else 16):
				flight_selected.emit(id)
				accept_event()
				return
