class_name AircraftView
extends Control
## Draws the cabin, the aisle, passengers and the boarding queue straight
## from simulation state. Contains no game logic.

signal passenger_clicked(passenger: Passenger)
signal background_clicked

const COLOR_BG := Color("#181c22")
const COLOR_CABIN := Color("#232932")
const COLOR_SEAT_EMPTY := Color("#2f3742")
const COLOR_SEAT_OUTLINE := Color("#3d4652")
const COLOR_SEAT_TAKEN := Color("#3e6b58")
const COLOR_AISLE := Color("#1d222a")
const COLOR_FUSELAGE := Color("#20262f")
const COLOR_FUSELAGE_EDGE := Color("#3a4350")
const COLOR_WING := Color("#1b2027")
const COLOR_WING_EDGE := Color("#2f3742")
const NOSE_LEN := 70.0
const TAIL_LEN := 110.0
const COLOR_TEXT := Color("#aab4c0")
const COLOR_TEXT_DIM := Color("#6b7684")
const COLOR_SELECT := Color("#ffffff")

const COLOR_WALKING := Color("#4f8ef7")
const COLOR_BLOCKED := Color("#e5484d")
const COLOR_STOWING := Color("#f5a524")
const COLOR_SEAT_WAIT := Color("#c084fc")
const COLOR_SEATING := Color("#34d399")

const GROUP_PALETTE := [
	Color("#4f8ef7"), Color("#f5a524"), Color("#34d399"), Color("#c084fc"),
	Color("#fb7185"), Color("#22d3ee"), Color("#a3e635"), Color("#f472b6"),
]

const MAX_QUEUE_SHOWN := 48

var sim: Simulation
var selected_id: int = -1

# Layout computed each draw so clicks can be resolved.
var _passenger_pos: Dictionary = {}     # id -> Vector2
var _hit_radius: float = 8.0
var _font: Font
var _font_size_small := 11
var _font_size := 13


func _ready() -> void:
	_font = get_theme_default_font()
	mouse_filter = Control.MOUSE_FILTER_STOP


func _process(_delta: float) -> void:
	if sim != null:
		queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var best_id := -1
		var best_d := _hit_radius * 1.6
		for id in _passenger_pos:
			var d: float = _passenger_pos[id].distance_to(event.position)
			if d < best_d:
				best_d = d
				best_id = id
		if best_id >= 0:
			selected_id = best_id
			passenger_clicked.emit(sim.passenger_by_id(best_id))
		else:
			selected_id = -1
			background_clicked.emit()
		accept_event()


static func group_color(group_index: int) -> Color:
	if group_index < 0:
		return Color("#8a94a2")
	return GROUP_PALETTE[group_index % GROUP_PALETTE.size()]


static func state_color(state: int) -> Color:
	match state:
		Passenger.State.ENTERING, Passenger.State.WALKING:
			return COLOR_WALKING
		Passenger.State.BLOCKED:
			return COLOR_BLOCKED
		Passenger.State.STOWING:
			return COLOR_STOWING
		Passenger.State.WAITING_FOR_SEAT:
			return COLOR_SEAT_WAIT
		Passenger.State.SEATING:
			return COLOR_SEATING
	return Color("#8a94a2")


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), COLOR_BG)
	_passenger_pos.clear()
	if sim == null:
		return
	var aircraft := sim.aircraft
	var letters := aircraft.letters()
	var left_count: int = aircraft.sides[0].size()
	var cells := aircraft.rows + 1

	# --- layout (horizontal cabin: door on the left, rows running right) ---
	var margin := 16.0
	var queue_h := 48.0
	var legend_h := 28.0
	var label_w := 26.0
	var avail_w := size.x - margin * 2.0 - label_w - NOSE_LEN - TAIL_LEN
	var cell_w: float = clampf(floorf(avail_w / float(cells)), 12.0, 34.0)
	var seat := cell_w - 4.0
	var gap := 2.0
	var aisle_h := seat + 12.0
	var header_h := 18.0
	var cabin_w := label_w + cells * cell_w + 6.0
	var cabin_h := header_h + letters.size() * (seat + gap) + aisle_h + 8.0
	var cabin_left := floorf((size.x - cabin_w) / 2.0)
	var cabin_top := floorf(margin + queue_h + (size.y - margin * 2.0 - queue_h - legend_h - cabin_h) / 2.0)
	_hit_radius = seat * 0.5

	var seats_top := cabin_top + header_h
	var aisle_y := seats_top + left_count * (seat + gap)
	var aisle_cy := aisle_y + aisle_h / 2.0
	var cells_left := cabin_left + label_w

	_draw_airframe(cabin_left, cabin_top, cabin_w, cabin_h, cells_left, cell_w, aircraft.rows)

	# Cabin body and aisle
	draw_rect(Rect2(cabin_left, cabin_top, cabin_w, cabin_h), COLOR_CABIN)
	draw_rect(Rect2(cells_left, aisle_y, cells * cell_w, aisle_h), COLOR_AISLE)

	# Seat letters down the left, row numbers along the top
	for i in letters.size():
		var y := _seat_y(i, left_count, seats_top, seat, gap, aisle_h)
		draw_string(_font, Vector2(cabin_left + 8.0, y + seat * 0.5 + 4.0), letters[i],
			HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size_small, COLOR_TEXT_DIM)
	draw_string(_font, Vector2(cells_left + 2.0, cabin_top + 13.0), "DOOR",
		HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size_small, COLOR_TEXT_DIM)
	for row in range(1, aircraft.rows + 1):
		if row % 5 == 0:
			var x := cells_left + row * cell_w
			draw_string(_font, Vector2(x + 2.0, cabin_top + 13.0), str(row),
				HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size_small, COLOR_TEXT_DIM)

	var selected: Passenger = sim.passenger_by_id(selected_id) if selected_id >= 0 else null

	# Seats
	for row in range(1, aircraft.rows + 1):
		var x := cells_left + row * cell_w + 2.0
		for i in letters.size():
			var y := _seat_y(i, left_count, seats_top, seat, gap, aisle_h)
			var key := AircraftDef.seat_key(row, letters[i])
			var r := Rect2(x, y, seat, seat)
			if sim.seat_occupied.has(key):
				var pid: int = sim.seat_occupied[key]
				var p: Passenger = sim.passenger_by_id(pid)
				draw_rect(r, COLOR_SEAT_TAKEN)
				draw_rect(r, group_color(p.boarding_group).darkened(0.35), false, 1.0)
				_passenger_pos[pid] = r.get_center()
				if pid == selected_id:
					draw_rect(r.grow(1.5), COLOR_SELECT, false, 2.0)
			else:
				draw_rect(r, COLOR_SEAT_EMPTY)
				draw_rect(r, COLOR_SEAT_OUTLINE, false, 1.0)
				if selected != null and selected.seat_key() == key:
					draw_rect(r.grow(1.5), COLOR_SELECT, false, 2.0)

	# Passengers in the aisle. Positions are interpolated from simulation
	# progress so movement glides; nothing here feeds back into the sim.
	var radius := seat * 0.42
	var t := float(sim.tick)
	for cell in range(0, cells):
		var pid: int = sim.aisle[cell]
		if pid == -1:
			continue
		var p: Passenger = sim.passenger_by_id(pid)
		var cell_cx := cells_left + cell * cell_w + cell_w / 2.0
		var center := Vector2(cell_cx, aisle_cy)
		var col := state_color(p.state)
		match p.state:
			Passenger.State.ENTERING, Passenger.State.WALKING, Passenger.State.BLOCKED:
				var frac := 0.0
				if p.walk_ticks_per_cell > 0:
					frac = clampf(float(p.progress) / float(p.walk_ticks_per_cell), 0.0, 1.0)
				# Never draw on top of the passenger ahead.
				var next_cell := cell + 1
				if next_cell < cells and sim.aisle[next_cell] != -1:
					frac = minf(frac, 0.55)
				center.x += frac * cell_w
				# Slight stride bob while actually moving.
				if p.state != Passenger.State.BLOCKED:
					center.y += sin(t * 0.9 + float(p.id)) * 0.8
			Passenger.State.STOWING:
				center.y += sin(t * 0.5 + float(p.id)) * 1.2
			Passenger.State.WAITING_FOR_SEAT:
				center.x += sin(t * 0.35 + float(p.id)) * 1.5
			Passenger.State.SEATING:
				# Slide from the aisle into the seat.
				var dur := maxi(1, p.seat_access_duration)
				var frac := 1.0 - clampf(float(p.timer) / float(dur), 0.0, 1.0)
				var li: int = letters.find(p.seat_letter)
				var sy := _seat_y(li, left_count, seats_top, seat, gap, aisle_h)
				var seat_center := Vector2(cells_left + p.seat_row * cell_w + 2.0 + seat * 0.5, sy + seat * 0.5)
				center = center.lerp(seat_center, frac * frac)
		_passenger_pos[pid] = center
		draw_circle(center, radius, col)
		draw_circle(center, radius, group_color(p.boarding_group).darkened(0.3), false, 1.0)
		match p.state:
			Passenger.State.STOWING:
				# Bag travels from the body up into the bin on the seat side.
				var dur := maxi(1, p.luggage_stow_duration)
				var frac := 1.0 - clampf(float(p.timer) / float(dur), 0.0, 1.0)
				var dir := -1.0 if p.side == 0 else 1.0
				var bw := radius * 0.9
				var by := center.y + dir * (radius * 0.2 + frac * (radius + 8.0))
				var bag_col := Color("#3b2a08").lerp(Color("#3b2a08", 0.2), frac)
				draw_rect(Rect2(center.x - bw / 2.0, by - bw * 0.35, bw, bw * 0.7), bag_col)
				draw_rect(Rect2(center.x - bw * 0.2, by - bw * 0.55, bw * 0.4, bw * 0.2), bag_col)
			Passenger.State.WAITING_FOR_SEAT:
				# Pulsing chevron toward the seat side (side 0 is drawn above the aisle)
				var dir := -1.0 if p.side == 0 else 1.0
				var pulse := 0.6 + 0.4 * (0.5 + 0.5 * sin(t * 0.4))
				var tip := Vector2(center.x, center.y + dir * radius * 0.8)
				var base_y := center.y - dir * radius * 0.1
				var white := Color(1, 1, 1, pulse)
				draw_line(Vector2(center.x - radius * 0.5, base_y), tip, white, 1.5)
				draw_line(Vector2(center.x + radius * 0.5, base_y), tip, white, 1.5)
			Passenger.State.BLOCKED:
				draw_circle(center, radius * 0.3, Color("#ffffff", 0.75))
		if pid == selected_id:
			draw_circle(center, radius + 2.5, COLOR_SELECT, false, 2.0)

	# --- boarding queue strip: next passenger nearest the door ------------
	var queued := sim.queued_passengers()
	var qy := margin + 10.0
	var dot_r := clampf(radius * 0.7, 4.0, 7.0)
	var qx := cells_left
	draw_string(_font, Vector2(qx, qy + 4.0), "QUEUE  %d waiting" % queued.size(),
		HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size_small, COLOR_TEXT)
	var shown := mini(queued.size(), MAX_QUEUE_SHOWN)
	var spacing := dot_r * 2.0 + 3.0
	for i in shown:
		var p: Passenger = queued[i]
		var cx := qx + dot_r + i * spacing
		if cx > size.x - margin - 40.0:
			shown = i
			break
		var c := Vector2(cx, qy + 22.0)
		draw_circle(c, dot_r, group_color(p.boarding_group))
		_passenger_pos[p.id] = c
		if p.id == selected_id:
			draw_circle(c, dot_r + 2.0, COLOR_SELECT, false, 1.5)
	if queued.size() > shown:
		draw_string(_font, Vector2(qx + shown * spacing + 6.0, qy + 26.0), "+%d" % (queued.size() - shown),
			HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size_small, COLOR_TEXT_DIM)

	# --- legend -----------------------------------------------------------
	var ly := size.y - margin - 6.0
	var lx := cabin_left
	var items := [
		["Walking", COLOR_WALKING], ["Blocked", COLOR_BLOCKED], ["Stowing", COLOR_STOWING],
		["Seat access", COLOR_SEAT_WAIT], ["Seating", COLOR_SEATING], ["Seated", COLOR_SEAT_TAKEN],
	]
	for item in items:
		draw_circle(Vector2(lx + 5.0, ly - 4.0), 4.5, item[1])
		draw_string(_font, Vector2(lx + 13.0, ly), item[0], HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size_small, COLOR_TEXT_DIM)
		lx += 14.0 + _font.get_string_size(item[0], HORIZONTAL_ALIGNMENT_LEFT, -1, _font_size_small).x + 14.0


func _seat_y(i: int, left_count: int, seats_top: float, seat: float, gap: float, aisle_h: float) -> float:
	var y := seats_top + i * (seat + gap)
	if i >= left_count:
		y += aisle_h
	return y


## Nose, tail, wings and stabilisers drawn around the cabin rectangle. Pure
## decoration so the cabin reads as an aircraft; nothing else depends on it.
func _draw_airframe(cabin_left: float, cabin_top: float, cabin_w: float, cabin_h: float,
		cells_left: float, cell_w: float, rows: int) -> void:
	var cy := cabin_top + cabin_h / 2.0
	var half_h := cabin_h / 2.0 + 6.0
	var body_left := cabin_left - 4.0
	var body_right := cabin_left + cabin_w + 4.0

	# Wings: swept trapezoids either side of the cabin around the middle rows.
	var wing_root_from := cells_left + (rows * 0.36) * cell_w
	var wing_root_to := cells_left + (rows * 0.56) * cell_w
	var wing_span := clampf(size.y * 0.16, 50.0, 120.0)
	var sweep := cell_w * 4.0
	for dir: float in [-1.0, 1.0]:
		var base_y := cy + dir * half_h
		var tip_y := base_y + dir * wing_span
		var wing := PackedVector2Array([
			Vector2(wing_root_from, base_y),
			Vector2(wing_root_to, base_y),
			Vector2(wing_root_to + sweep * 0.9, tip_y),
			Vector2(wing_root_from + sweep * 1.3, tip_y),
		])
		draw_colored_polygon(wing, COLOR_WING)
		draw_polyline(_closed(wing), COLOR_WING_EDGE, 1.0, true)
		# Horizontal stabiliser near the tail.
		var st_from := body_right + TAIL_LEN * 0.45
		var st_to := body_right + TAIL_LEN * 0.8
		var st_span := wing_span * 0.4
		var stab := PackedVector2Array([
			Vector2(st_from, cy + dir * (half_h * 0.35)),
			Vector2(st_to, cy + dir * (half_h * 0.2)),
			Vector2(st_to + cell_w * 1.2, cy + dir * (half_h * 0.2 + st_span)),
			Vector2(st_from + cell_w * 1.6, cy + dir * (half_h * 0.35 + st_span)),
		])
		draw_colored_polygon(stab, COLOR_WING)
		draw_polyline(_closed(stab), COLOR_WING_EDGE, 1.0, true)

	# Fuselage outline: half-ellipse nose on the left, tapered cone on the right.
	var pts := PackedVector2Array()
	var steps := 14
	for i in range(steps + 1):
		var a := -PI / 2.0 + PI * float(i) / float(steps)
		pts.append(Vector2(body_left - NOSE_LEN * cos(a), cy + half_h * sin(a)))
	# pts now runs from top of nose round to bottom; continue along the bottom edge to the tail.
	pts.append(Vector2(body_right, cy + half_h))
	pts.append(Vector2(body_right + TAIL_LEN, cy + half_h * 0.25))
	pts.append(Vector2(body_right + TAIL_LEN, cy - half_h * 0.25))
	pts.append(Vector2(body_right, cy - half_h))
	draw_colored_polygon(pts, COLOR_FUSELAGE)
	draw_polyline(_closed(pts), COLOR_FUSELAGE_EDGE, 1.5, true)

	# Vertical fin, drawn as a small dark wedge on the tail cone.
	var fin := PackedVector2Array([
		Vector2(body_right + TAIL_LEN * 0.55, cy - half_h * 0.6),
		Vector2(body_right + TAIL_LEN * 0.95, cy - half_h * 1.05),
		Vector2(body_right + TAIL_LEN, cy - half_h * 0.25),
	])
	draw_colored_polygon(fin, COLOR_WING)
	draw_polyline(_closed(fin), COLOR_WING_EDGE, 1.0, true)


static func _closed(poly: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array(poly)
	out.append(poly[0])
	return out
