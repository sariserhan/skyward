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
	var avail_w := size.x - margin * 2.0 - label_w
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

	# Passengers in the aisle
	var radius := seat * 0.42
	for cell in range(0, cells):
		var pid: int = sim.aisle[cell]
		if pid == -1:
			continue
		var p: Passenger = sim.passenger_by_id(pid)
		var center := Vector2(cells_left + cell * cell_w + cell_w / 2.0, aisle_cy)
		_passenger_pos[pid] = center
		var col := state_color(p.state)
		draw_circle(center, radius, col)
		draw_circle(center, radius, group_color(p.boarding_group).darkened(0.3), false, 1.0)
		match p.state:
			Passenger.State.STOWING:
				# Bag glyph inside the body
				var bw := radius * 0.9
				draw_rect(Rect2(center.x - bw / 2.0, center.y - bw * 0.35, bw, bw * 0.7), Color("#3b2a08"))
				draw_rect(Rect2(center.x - bw * 0.2, center.y - bw * 0.55, bw * 0.4, bw * 0.2), Color("#3b2a08"))
			Passenger.State.WAITING_FOR_SEAT:
				# Chevron toward the seat side (side 0 is drawn above the aisle)
				var dir := -1.0 if p.side == 0 else 1.0
				var tip := Vector2(center.x, center.y + dir * radius * 0.75)
				var base_y := center.y - dir * radius * 0.15
				draw_line(Vector2(center.x - radius * 0.5, base_y), tip, Color("#ffffff"), 1.5)
				draw_line(Vector2(center.x + radius * 0.5, base_y), tip, Color("#ffffff"), 1.5)
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
