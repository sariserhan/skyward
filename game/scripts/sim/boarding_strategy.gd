class_name BoardingStrategy
extends RefCounted
## A boarding strategy is an ordered list of groups. Each group matches
## passengers by row range and seat type. A passenger belongs to the first
## group that matches. Passengers matched by no group are collected into a
## trailing UNASSIGNED group and a warning is raised.
##
## Presets (Random, Back to Front, Front to Back, Window/Middle/Aisle) are
## expressed in the same group format as custom strategies so one resolver
## serves everything.

enum Order { RANDOM, BACK_TO_FRONT, FRONT_TO_BACK }

const ORDER_NAMES := {
	Order.RANDOM: "Random",
	Order.BACK_TO_FRONT: "Back to front",
	Order.FRONT_TO_BACK: "Front to back",
}

const PRESET_IDS := ["random", "back_to_front", "front_to_back", "window_middle_aisle"]
const PRESET_NAMES := {
	"random": "Random",
	"back_to_front": "Back to Front",
	"front_to_back": "Front to Back",
	"window_middle_aisle": "Window / Middle / Aisle",
	"custom": "Custom",
}

const UNASSIGNED_NAME := "UNASSIGNED"


class Group:
	var name: String = ""
	var row_from: int = 1
	var row_to: int = 999
	## Array of Passenger.SeatType. Empty means "any seat type".
	var seat_types: Array = []
	var order: int = Order.RANDOM

	func matches(p: Passenger) -> bool:
		if p.seat_row < row_from or p.seat_row > row_to:
			return false
		if seat_types.is_empty():
			return true
		return p.seat_type in seat_types

	func to_dict() -> Dictionary:
		return {
			"name": name,
			"row_from": row_from,
			"row_to": row_to,
			"seat_types": seat_types.duplicate(),
			"order": order,
		}

	static func from_dict(d: Dictionary) -> Group:
		var g := Group.new()
		g.name = str(d.get("name", ""))
		g.row_from = int(d.get("row_from", 1))
		g.row_to = int(d.get("row_to", 999))
		g.seat_types = []
		for t in d.get("seat_types", []):
			g.seat_types.append(int(t))
		g.order = int(d.get("order", Order.RANDOM))
		return g

	func describe() -> String:
		var rows_txt := "Rows %d–%d" % [row_from, row_to]
		var seats_txt := "any seat"
		if not seat_types.is_empty():
			var names: Array = []
			for t in seat_types:
				names.append(Passenger.SEAT_TYPE_NAMES[t])
			seats_txt = ", ".join(names)
		return "%s · %s" % [rows_txt, seats_txt]


var preset_id: String = "custom"
var name: String = "Custom"
var groups: Array = []
## Set by resolve() when an UNASSIGNED group had to be appended.
var unassigned_count: int = 0


# --- presets -------------------------------------------------------------

static func preset(id: String, aircraft: AircraftDef) -> BoardingStrategy:
	match id:
		"random":
			return make_random()
		"back_to_front":
			return make_back_to_front(aircraft.rows)
		"front_to_back":
			return make_front_to_back(aircraft.rows)
		"window_middle_aisle":
			return make_window_middle_aisle()
	push_error("Unknown preset: %s" % id)
	return make_random()


static func make_random() -> BoardingStrategy:
	var s := BoardingStrategy.new()
	s.preset_id = "random"
	s.name = PRESET_NAMES["random"]
	s.groups = [_group("All passengers", 1, 999, [], Order.RANDOM)]
	return s


static func make_back_to_front(rows: int, chunks: int = 3) -> BoardingStrategy:
	var s := BoardingStrategy.new()
	s.preset_id = "back_to_front"
	s.name = PRESET_NAMES["back_to_front"]
	var bounds := _chunk_bounds(rows, chunks)
	bounds.reverse()
	var i := 1
	for b in bounds:
		s.groups.append(_group("Group %d" % i, b[0], b[1], [], Order.RANDOM))
		i += 1
	return s


static func make_front_to_back(rows: int, chunks: int = 3) -> BoardingStrategy:
	var s := BoardingStrategy.new()
	s.preset_id = "front_to_back"
	s.name = PRESET_NAMES["front_to_back"]
	var i := 1
	for b in _chunk_bounds(rows, chunks):
		s.groups.append(_group("Group %d" % i, b[0], b[1], [], Order.RANDOM))
		i += 1
	return s


static func make_window_middle_aisle() -> BoardingStrategy:
	var s := BoardingStrategy.new()
	s.preset_id = "window_middle_aisle"
	s.name = PRESET_NAMES["window_middle_aisle"]
	s.groups = [
		_group("Window", 1, 999, [Passenger.SeatType.WINDOW], Order.RANDOM),
		_group("Middle", 1, 999, [Passenger.SeatType.MIDDLE], Order.RANDOM),
		_group("Aisle", 1, 999, [Passenger.SeatType.AISLE], Order.RANDOM),
	]
	return s


static func make_custom(custom_groups: Array) -> BoardingStrategy:
	var s := BoardingStrategy.new()
	s.preset_id = "custom"
	s.name = PRESET_NAMES["custom"]
	s.groups = custom_groups
	return s


static func _group(gname: String, row_from: int, row_to: int, seat_types: Array, order: int) -> Group:
	var g := Group.new()
	g.name = gname
	g.row_from = row_from
	g.row_to = row_to
	g.seat_types = seat_types
	g.order = order
	return g


## Split rows 1..rows into `chunks` contiguous [from, to] ranges, front first.
static func _chunk_bounds(rows: int, chunks: int) -> Array:
	var out: Array = []
	var size := int(ceil(float(rows) / float(chunks)))
	var start := 1
	while start <= rows:
		var stop := mini(rows, start + size - 1)
		out.append([start, stop])
		start = stop + 1
	return out


# --- resolution ----------------------------------------------------------

## Assign every passenger a boarding group and a queue position. Returns the
## ordered list of passenger ids. Deterministic for a given seed.
func resolve(passengers: Array[Passenger], seed_value: int) -> Array[int]:
	var rng := SimRng.new(seed_value, SimRng.STREAM_STRATEGY)
	unassigned_count = 0

	# Drop any UNASSIGNED group from a previous resolve so it is recomputed.
	var work_groups: Array = []
	for g in groups:
		if g.name != UNASSIGNED_NAME:
			work_groups.append(g)

	var buckets: Array = []
	for _g in work_groups:
		buckets.append([])
	var unmatched: Array = []

	for p in passengers:
		var placed := false
		for gi in work_groups.size():
			if work_groups[gi].matches(p):
				buckets[gi].append(p)
				placed = true
				break
		if not placed:
			unmatched.append(p)

	if not unmatched.is_empty():
		var ug := _group(UNASSIGNED_NAME, 1, 999, [], Order.RANDOM)
		work_groups.append(ug)
		buckets.append(unmatched)
		unassigned_count = unmatched.size()
	groups = work_groups

	var order_ids: Array[int] = []
	for gi in work_groups.size():
		var g: Group = work_groups[gi]
		var bucket: Array = buckets[gi]
		_order_bucket(bucket, g.order, rng)
		for p in bucket:
			p.boarding_group = gi
			p.boarding_group_name = g.name
			p.queue_position = order_ids.size()
			p.state = Passenger.State.QUEUED
			order_ids.append(p.id)
	return order_ids


static func _order_bucket(bucket: Array, order: int, rng: SimRng) -> void:
	# Shuffle first so ties within a row are deterministic-random, then
	# apply the row ordering with an explicit stable key.
	rng.shuffle(bucket)
	if order == Order.RANDOM:
		return
	var keyed: Array = []
	for i in bucket.size():
		var p: Passenger = bucket[i]
		var row_key: int = -p.seat_row if order == Order.BACK_TO_FRONT else p.seat_row
		keyed.append([row_key * 100000 + i, p])
	keyed.sort_custom(func(a, b): return a[0] < b[0])
	for i in keyed.size():
		bucket[i] = keyed[i][1]


# --- serialisation -------------------------------------------------------

func to_dict() -> Dictionary:
	var gs: Array = []
	for g in groups:
		gs.append(g.to_dict())
	return {"preset_id": preset_id, "name": name, "groups": gs}


static func from_dict(d: Dictionary) -> BoardingStrategy:
	var s := BoardingStrategy.new()
	s.preset_id = str(d.get("preset_id", "custom"))
	s.name = str(d.get("name", PRESET_NAMES.get(s.preset_id, "Custom")))
	s.groups = []
	for gd in d.get("groups", []):
		s.groups.append(Group.from_dict(gd))
	return s


func duplicate_strategy() -> BoardingStrategy:
	return BoardingStrategy.from_dict(to_dict())


func group_count() -> int:
	return groups.size()
