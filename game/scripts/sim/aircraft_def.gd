class_name AircraftDef
extends RefCounted
## Aircraft geometry, loaded from configuration. Nothing in the simulation
## hardcodes rows or seat letters; it all comes through this class.
##
## seat_layout is a string like "ABC|DEF": sides separated by "|", letters
## listed left to right across the cabin. The aisle sits between the sides.

var id: String = ""
var display_name: String = ""
var rows: int = 0
var seats_per_row: int = 0
var aisle_count: int = 1
var boarding_doors: Array[String] = ["front"]
var seat_layout: String = "ABC|DEF"

## side index -> Array of letters, left to right
var sides: Array = []
## letter -> { "side": int, "index": int, "dist_from_aisle": int, "seat_type": int }
var _seat_info: Dictionary = {}


static func load_from_file(path: String) -> AircraftDef:
	return AircraftDef.from_dict(JsonUtil.load_file(path))


static func load_by_id(aircraft_id: String) -> AircraftDef:
	return load_from_file("res://configs/aircraft/%s.json" % aircraft_id)


static func from_dict(d: Dictionary) -> AircraftDef:
	var a := AircraftDef.new()
	a.id = str(d.get("id", ""))
	a.display_name = str(d.get("display_name", a.id))
	a.rows = int(d.get("rows", 0))
	a.seats_per_row = int(d.get("seats_per_row", 0))
	a.aisle_count = int(d.get("aisle_count", 1))
	a.seat_layout = str(d.get("seat_layout", "ABC|DEF"))
	var doors: Array[String] = []
	for x in d.get("boarding_doors", ["front"]):
		doors.append(str(x))
	a.boarding_doors = doors
	a._build_layout()
	return a


func _build_layout() -> void:
	sides.clear()
	_seat_info.clear()
	var parts := seat_layout.split("|")
	assert(parts.size() == 2, "Prototype supports exactly one aisle (two sides)")
	for side_idx in parts.size():
		var letters: Array = []
		var s := parts[side_idx]
		for i in s.length():
			letters.append(s[i])
		sides.append(letters)
		var n := letters.size()
		for i in n:
			# Side 0 is left of the aisle: last letter touches the aisle.
			# Side 1 is right of the aisle: first letter touches the aisle.
			var dist: int = (n - 1 - i) if side_idx == 0 else i
			var seat_type: int
			if dist == 0:
				seat_type = Passenger.SeatType.AISLE
			elif dist == n - 1:
				seat_type = Passenger.SeatType.WINDOW
			else:
				seat_type = Passenger.SeatType.MIDDLE
			_seat_info[letters[i]] = {
				"side": side_idx,
				"index": i,
				"dist_from_aisle": dist,
				"seat_type": seat_type,
			}
	if seats_per_row == 0:
		seats_per_row = _seat_info.size()


func capacity() -> int:
	return rows * seats_per_row


## All seat letters, left to right across the cabin.
func letters() -> Array:
	var out: Array = []
	for side in sides:
		out.append_array(side)
	return out


func seat_type_of(letter: String) -> int:
	return _seat_info[letter]["seat_type"]


func side_of(letter: String) -> int:
	return _seat_info[letter]["side"]


func dist_from_aisle(letter: String) -> int:
	return _seat_info[letter]["dist_from_aisle"]


## Letters of the seats a passenger must pass to reach `letter` from the
## aisle, on the same side and row. Empty for aisle seats.
func seats_between_aisle(letter: String) -> Array:
	var info: Dictionary = _seat_info[letter]
	var out: Array = []
	for other in sides[info["side"]]:
		if other == letter:
			continue
		if _seat_info[other]["dist_from_aisle"] < info["dist_from_aisle"]:
			out.append(other)
	return out


## Every seat id in row order, then cabin-left-to-right within a row.
func all_seats() -> Array:
	var out: Array = []
	for row in range(1, rows + 1):
		for letter in letters():
			out.append([row, letter])
	return out


static func seat_key(row: int, letter: String) -> String:
	return "%d%s" % [row, letter]
