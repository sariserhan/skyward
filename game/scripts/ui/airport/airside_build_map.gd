class_name AirsideBuildMap
extends Control
## The Build tab's airside tool (M12): the airside as currently built, with
## the construction grid. Click two points for a taxiway (existing nodes or
## free grid anchors), or one free anchor for a runway start; the pending
## piece is drawn as a preview.
signal picked

var layout: AirportLayout
## "taxiway" or "runway".
var mode := "taxiway"
var picks: Array = []
var heading := "E"
var length_m := 3200
var _origin := Vector2.ZERO
var _scale := 1.0
var _points: Dictionary = {}

const INK := Color("a7becd")
const MINT := Color("70dec0")
const AMBER := Color("ffc078")

func _ready() -> void:
	custom_minimum_size = Vector2(440, 210)
	mouse_default_cursor_shape = Control.CURSOR_CROSS

func reset() -> void:
	picks = []
	queue_redraw()

func _fit(airside: Dictionary) -> void:
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for z in airside.get("zones", []) + [airside.get("terminal_zone", {})]:
		if z.is_empty(): continue
		lo = lo.min(Vector2(float(z.x0), float(z.y0)))
		hi = hi.max(Vector2(float(z.x1), float(z.y1)))
	for id in airside.nodes:
		var p := AirportLayout._pos(airside, id)
		lo = lo.min(p)
		hi = hi.max(p)
	var span := (hi - lo).max(Vector2(1, 1))
	var area := size - Vector2(20, 20)
	_scale = minf(area.x / span.x, area.y / span.y)
	_origin = Vector2(10, 10) + (area - span * _scale) / 2.0 - lo * _scale

func _screen(world: Vector2) -> Vector2:
	return _origin + world * _scale

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("132430"))
	if layout == null or not layout.base.has("airside"): return
	var a := layout.current_airside()
	_fit(a)
	_points = {}
	var t: Dictionary = a.get("terminal_zone", {})
	if not t.is_empty(): draw_rect(Rect2(_screen(Vector2(float(t.x0), float(t.y0))), Vector2(float(t.x1) - float(t.x0), float(t.y1) - float(t.y0)) * _scale), Color("233b49"))
	# Free grid anchors (only these and existing nodes can be picked).
	var grid := float(a.get("grid_m", 300))
	for z in a.get("zones", []):
		var x := ceilf(float(z.x0) / grid) * grid
		while x <= float(z.x1):
			var y := ceilf(float(z.y0) / grid) * grid
			while y <= float(z.y1):
				var id := AirportLayout.anchor_id(Vector2(x, y))
				if layout._point_error(a, id).is_empty():
					_points[id] = _screen(Vector2(x, y))
					draw_circle(_points[id], 1.5, Color("4a5f6b"))
				y += grid
			x += grid
	for r in a.runways:
		var closed := str(r.get("status", "open")) != "open"
		draw_line(_screen(AirportLayout._pos(a, r.a)), _screen(AirportLayout._pos(a, r.b)), Color("2a353c") if closed else Color("5b6f7c"), 6)
	for e in a.edges:
		draw_line(_screen(AirportLayout._pos(a, e.from)), _screen(AirportLayout._pos(a, e.to)), Color("617161"), 1.5)
	for id in a.nodes:
		var kind := str(a.nodes[id].get("kind", ""))
		var p := _screen(AirportLayout._pos(a, id))
		if kind == "stand":
			draw_circle(p, 3, INK)
			continue
		_points[id] = p
		draw_circle(p, 2.5, MINT if kind in ["runway_end", "hold", "exit"] else Color("8ea0ab"))
	# The pending piece.
	for id in picks:
		if _points.has(id) or a.nodes.has(id): draw_arc(_screen(AirportLayout._pos(a, id)), 6, 0, TAU, 16, AMBER, 2)
	if mode == "taxiway" and picks.size() == 2:
		draw_line(_screen(AirportLayout._pos(a, picks[0])), _screen(AirportLayout._pos(a, picks[1])), AMBER, 2)
	if mode == "runway" and picks.size() == 1:
		var start := AirportLayout.anchor_position(picks[0])
		if start.x != INF:
			var end: Vector2 = start + AirportLayout.HEADINGS[heading] * float(length_m)
			draw_line(_screen(start), _screen(end), AMBER, 6)

func _gui_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT): return
	var best := ""
	var best_d := 12.0
	for id in _points:
		var d: float = event.position.distance_to(_points[id])
		if d < best_d or (d == best_d and id < best):
			best = id
			best_d = d
	if best.is_empty(): return
	if mode == "runway": picks = [best]
	elif picks.size() >= 2: picks = [best]
	else: picks.append(best)
	accept_event()
	queue_redraw()
	picked.emit()
