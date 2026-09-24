class_name DeboardingSimulation
extends RefCounted
## The deboarding engine (M5). Pure logic on integer boarding ticks, no Nodes.
## Same aisle model as boarding (D-002): cell 0 is the door, cell r is row r,
## one passenger per cell, no passing, but movement is toward the door.
##
## Each tick:
##   1. Seat leavers. Per row and side, only the seated passenger nearest the
##      aisle can get up (seat_exit ticks). They step into their row's aisle
##      cell when it is empty; seat leavers take a free cell before walkers
##      from behind, so rows ahead empty first. Stepping in and retrieving
##      carry-ons occupy the cell.
##   2. Walkers, front-most first, advance one cell when it is free.
##   3. The door lets one passenger out every door_interval ticks.
## Blocked ticks are charged to the nearest non-blocked passenger ahead.

signal passenger_exited(passenger: Passenger)

var aircraft: AircraftDef
var config: Dictionary = {}
var passengers: Array[Passenger] = []
## cell -> passenger id or -1. Size rows + 1.
var aisle: Array[int] = []
## Passengers in the aisle, front-most (lowest cell) first.
var active: Array[Passenger] = []
## Seat key -> passenger id for passengers still in their seats.
var seat_occupied: Dictionary = {}
## Index row * 2 + side -> passenger ids still seated, nearest the aisle first.
var seat_queues: Array = []
## Passengers not yet in the aisle; seat processing stops at zero.
var seated_count: int = 0
var exited: Array[int] = []
var tick: int = 0
var ticks_since_exit: int = 1_000_000
var completed: bool = false
## Renderers draw movement toward the door.
var aisle_direction: int = -1
var _by_id: Dictionary = {}

const DEFAULTS := {
	"seat_exit_ticks": 60,
	"aisle_entry_ticks": 30,
	"retrieve_base_ticks": 120,
	"retrieve_per_bag_ticks": 150,
	"walk_ticks_per_cell": 40,
	"door_interval_ticks": 45,
}


static func config_from(settings: Dictionary) -> Dictionary:
	var out := DEFAULTS.duplicate()
	for key in DEFAULTS:
		if settings.has(key): out[key] = int(settings[key])
	return out


## Per-passenger deboarding timings from speed and carry-ons. Seeded variation
## only on getting up and on retrieving bags; both draws always happen so the
## stream is stable regardless of bag count.
static func apply_timing(p: Passenger, settings: Dictionary, rng: SimRng) -> void:
	var c := config_from(settings)
	var seat_var := rng.randi_range(0, int(c.seat_exit_ticks))
	var bag_var := rng.randi_range(0, int(c.retrieve_base_ticks) / 2)
	p.deboard_seat_exit_ticks = int(c.seat_exit_ticks) + seat_var
	p.deboard_retrieve_ticks = 0 if p.carry_on_count == 0 else int(c.retrieve_base_ticks) + int(c.retrieve_per_bag_ticks) * p.carry_on_count + bag_var
	p.deboard_walk_ticks_per_cell = maxi(1, (int(c.walk_ticks_per_cell) * 1000 + p.walking_speed / 2) / p.walking_speed)


func setup(p_aircraft: AircraftDef, p_passengers: Array[Passenger], p_config: Dictionary) -> void:
	aircraft = p_aircraft
	passengers = p_passengers
	config = config_from(p_config)
	aisle.clear()
	for _i in range(aircraft.rows + 1): aisle.append(-1)
	active.clear()
	seat_occupied.clear()
	seat_queues.clear()
	for _i in (aircraft.rows + 1) * 2: seat_queues.append([])
	seated_count = passengers.size()
	exited.clear()
	tick = 0
	ticks_since_exit = 1_000_000
	completed = passengers.is_empty()
	_index()
	for p in passengers:
		p.state = Passenger.State.SEATED
		p.aisle_position = -1
		p.progress = 0
		p.timer = -1
		p.total_blocked_time = 0
		p.caused_blocked_time = 0
		p.exited_tick = -1
		seat_occupied[p.seat_key()] = p.id
	# Seated queues per row side, nearest the aisle first; ids break ties.
	var ordered := passengers.duplicate()
	ordered.sort_custom(func(a, b):
		var da := aircraft.dist_from_aisle(a.seat_letter)
		var db := aircraft.dist_from_aisle(b.seat_letter)
		return da < db if da != db else a.id < b.id)
	for p in ordered: seat_queues[p.seat_row * 2 + p.side].append(p.id)


func _index() -> void:
	_by_id.clear()
	for p in passengers: _by_id[p.id] = p


func passenger_by_id(id: int) -> Passenger:
	return _by_id.get(id)


func is_complete() -> bool:
	return completed


func exited_count() -> int:
	return exited.size()


## Renderers call this for a boarding queue strip; nobody queues outside here.
func queued_passengers() -> Array[Passenger]:
	return []


func step() -> void:
	if completed: return
	tick += 1
	ticks_since_exit += 1
	if seated_count > 0: _step_seats()
	# Only the front-most passenger can leave the aisle, so iterate in place.
	var i := 0
	while i < active.size():
		var before := active.size()
		_step_aisle(active[i])
		if active.size() == before: i += 1
	_attribute_blocking()
	if exited.size() >= passengers.size():
		completed = true


func _step_seats() -> void:
	for row in range(1, aircraft.rows + 1):
		for side in 2:
			var queue: Array = seat_queues[row * 2 + side]
			if queue.is_empty(): continue
			var p: Passenger = _by_id[queue[0]]
			if p.state == Passenger.State.SEATED:
				p.state = Passenger.State.LEAVING_SEAT
				p.timer = p.deboard_seat_exit_ticks
			if p.state != Passenger.State.LEAVING_SEAT: continue
			if p.timer > 0:
				p.timer -= 1
				continue
			if aisle[row] != -1: continue
			queue.pop_front()
			seated_count -= 1
			seat_occupied.erase(p.seat_key())
			aisle[row] = p.id
			p.aisle_position = row
			p.progress = 0
			p.timer = int(config.aisle_entry_ticks) + p.deboard_retrieve_ticks
			p.state = Passenger.State.RETRIEVING_BAGS if p.carry_on_count > 0 else Passenger.State.ENTERING
			_insert_active(p)


func _insert_active(p: Passenger) -> void:
	var at := 0
	while at < active.size() and active[at].aisle_position < p.aisle_position: at += 1
	active.insert(at, p)


func _step_aisle(p: Passenger) -> void:
	if p.state == Passenger.State.ENTERING or p.state == Passenger.State.RETRIEVING_BAGS:
		p.timer -= 1
		if p.timer <= 0: p.state = Passenger.State.WALKING
		return
	if p.progress < p.deboard_walk_ticks_per_cell:
		p.progress += 1
		p.state = Passenger.State.WALKING
		if p.progress < p.deboard_walk_ticks_per_cell: return
	if p.aisle_position == 0:
		if ticks_since_exit >= int(config.door_interval_ticks):
			_exit(p)
		else:
			_block(p)
		return
	var next := p.aisle_position - 1
	if aisle[next] == -1:
		aisle[p.aisle_position] = -1
		aisle[next] = p.id
		p.aisle_position = next
		p.progress = 0
		p.state = Passenger.State.WALKING
	else:
		_block(p)


func _block(p: Passenger) -> void:
	p.total_blocked_time += 1
	p.state = Passenger.State.BLOCKED


func _exit(p: Passenger) -> void:
	aisle[0] = -1
	p.aisle_position = -1
	p.state = Passenger.State.EXITED
	p.exited_tick = tick
	active.erase(p)
	exited.append(p.id)
	ticks_since_exit = 0
	passenger_exited.emit(p)


func _attribute_blocking() -> void:
	var head: Passenger = null
	for p in active:
		if p.state == Passenger.State.BLOCKED:
			if head != null: head.caused_blocked_time += 1
		else:
			head = p


## Engine tick until completion; for tests and tools.
func run_to_completion(max_ticks: int = 2_000_000) -> int:
	while not completed and tick < max_ticks: step()
	return tick


func result() -> Dictionary:
	var blocked := 0
	var blockers: Array = []
	for p in passengers:
		blocked += p.total_blocked_time
		if p.caused_blocked_time > 0: blockers.append(p)
	blockers.sort_custom(func(a, b): return a.caused_blocked_time > b.caused_blocked_time if a.caused_blocked_time != b.caused_blocked_time else a.id < b.id)
	var top: Array = []
	for i in mini(3, blockers.size()):
		var p: Passenger = blockers[i]
		top.append({"id": p.id, "seat": p.seat_key(), "carry_on_count": p.carry_on_count, "caused_blocked_ticks": p.caused_blocked_time})
	return {"completed": completed, "total_ticks": tick, "passengers": passengers.size(), "exited": exited.size(),
		"blocked_ticks": blocked, "top_blockers": top}


# --- persistence (airport saves) -------------------------------------------
# Passenger fields travel in Passenger.snapshot(); this is the engine's own state.

func snapshot() -> Dictionary:
	var active_ids: Array = []
	for p in active: active_ids.append(p.id)
	return {"config": config.duplicate(), "aisle": Array(aisle), "active": active_ids,
		"seat_occupied": seat_occupied.duplicate(), "seat_queues": seat_queues.duplicate(true), "seated_count": seated_count,
		"exited": Array(exited), "tick": tick, "ticks_since_exit": ticks_since_exit, "completed": completed}


func restore(p_aircraft: AircraftDef, p_passengers: Array[Passenger], data: Dictionary) -> void:
	aircraft = p_aircraft
	passengers = p_passengers
	config = config_from(data.config)
	_index()
	aisle.clear()
	for id in data.aisle: aisle.append(int(id))
	active.clear()
	for id in data.active: active.append(_by_id[int(id)])
	seat_occupied.clear()
	for key in data.seat_occupied: seat_occupied[key] = int(data.seat_occupied[key])
	seat_queues.clear()
	for queue in data.seat_queues:
		var ids: Array = []
		for id in queue: ids.append(int(id))
		seat_queues.append(ids)
	seated_count = int(data.seated_count)
	exited.clear()
	for id in data.exited: exited.append(int(id))
	tick = int(data.tick)
	ticks_since_exit = int(data.ticks_since_exit)
	completed = bool(data.completed)
