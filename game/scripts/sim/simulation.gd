class_name Simulation
extends RefCounted
## The boarding simulation engine. Pure logic, no Nodes, no rendering.
## Runs on integer ticks. Same inputs always produce the same output.
##
## Aisle model (D-002): cell 0 is the entrance, cell r is row r. One passenger
## per cell, forward movement only, no passing.
##
## Seat interference (D-001): a passenger keeps their row's aisle cell through
## STOWING, WAITING_FOR_SEAT and SEATING, blocking everyone behind.

## Bump when a change alters simulation outcomes. Stored with records (D-007).
const SIM_VERSION := "0.1.0"

signal passenger_state_changed(passenger: Passenger, old_state: int, new_state: int)
signal passenger_entered(passenger: Passenger)
signal passenger_seated(passenger: Passenger)
signal boarding_completed(total_ticks: int)

var aircraft: AircraftDef
var config: SimConfig
var strategy: BoardingStrategy
var passengers: Array[Passenger] = []
var seed_value: int = 0

## Ordered passenger ids produced by the strategy.
var queue: Array[int] = []
var queue_index: int = 0
## cell index -> passenger id, or -1 when empty. Size rows + 1.
var aisle: Array[int] = []
## Passengers currently in the aisle, front-most first.
var active: Array[Passenger] = []
var seat_occupied: Dictionary = {}
var _by_id: Dictionary = {}

var tick: int = 0
var seated_count: int = 0
var ticks_since_entry: int = 1_000_000
var completed: bool = false
var warnings: Array[String] = []
## False while more passengers may still be admitted (airport incremental mode).
## Completion requires closed == true; standalone setup() closes immediately.
var closed: bool = true
## Direction passengers move along the aisle, for renderers (+1: toward the rear).
var aisle_direction: int = 1
## Incremental mode: passenger id -> position in the full strategy order.
var _rank: Dictionary = {}


func setup(p_aircraft: AircraftDef, p_passengers: Array[Passenger], p_strategy: BoardingStrategy,
		p_config: SimConfig, p_seed: int) -> void:
	aircraft = p_aircraft
	passengers = p_passengers
	strategy = p_strategy
	config = p_config
	seed_value = p_seed
	warnings.clear()

	_by_id.clear()
	for p in passengers:
		_by_id[p.id] = p
		_reset_passenger(p)

	queue = strategy.resolve(passengers, seed_value)
	if strategy.unassigned_count > 0:
		warnings.append("%d passengers matched no group and were placed in %s." %
			[strategy.unassigned_count, BoardingStrategy.UNASSIGNED_NAME])

	aisle.clear()
	for _i in range(aircraft.rows + 1):
		aisle.append(-1)
	active.clear()
	seat_occupied.clear()
	queue_index = 0
	tick = 0
	seated_count = 0
	ticks_since_entry = 1_000_000
	completed = false
	closed = true
	_rank.clear()


## Airport mode: resolve the strategy over the whole manifest (same groups and
## seeded in-group order as setup()), but start with an empty door queue.
## Passengers join through admit() once they are physically at the gate.
func setup_incremental(p_aircraft: AircraftDef, p_passengers: Array[Passenger], p_strategy: BoardingStrategy,
		p_config: SimConfig, p_seed: int) -> void:
	setup(p_aircraft, p_passengers, p_strategy, p_config, p_seed)
	for i in queue.size():
		_rank[queue[i]] = i
	for p in passengers:
		p.state = Passenger.State.WAITING
	queue.clear()
	closed = false


## Append passengers to the back of the door queue, in strategy order among
## themselves. Unknown or already admitted ids are ignored. Returns the ids
## actually admitted.
func admit(ids: Array) -> Array[int]:
	var fresh: Array[int] = []
	if closed:
		return fresh
	for id in ids:
		var p: Passenger = _by_id.get(int(id))
		if p != null and p.state == Passenger.State.WAITING and not int(id) in fresh:
			fresh.append(int(id))
	fresh.sort_custom(func(a, b): return _rank[a] < _rank[b])
	for id in fresh:
		queue.append(id)
		_set_state(_by_id[id], Passenger.State.QUEUED)
	return fresh


## No further admissions. Boarding completes once everyone admitted is seated,
## immediately if they already are (airport early close; standalone never calls this).
func close() -> void:
	closed = true
	if seated_count >= queue.size() and not completed:
		completed = true
		boarding_completed.emit(tick)


func _reset_passenger(p: Passenger) -> void:
	p.state = Passenger.State.WAITING
	p.aisle_position = -1
	p.progress = 0
	p.timer = 0
	p.obstruction_count = 0
	p.entered_tick = -1
	p.seated_tick = -1
	p.total_blocked_time = 0
	p.total_walk_time = 0
	p.total_stow_time = 0
	p.total_seat_wait_time = 0
	p.caused_blocked_time = 0
	p.boarding_group = -1
	p.boarding_group_name = ""
	p.queue_position = -1


func passenger_by_id(id: int) -> Passenger:
	return _by_id.get(id)


func is_complete() -> bool:
	return completed


func total_passengers() -> int:
	return passengers.size()


func queue_remaining() -> int:
	return queue.size() - queue_index


## Passengers still outside the aircraft, in boarding order.
func queued_passengers() -> Array[Passenger]:
	var out: Array[Passenger] = []
	for i in range(queue_index, queue.size()):
		out.append(_by_id[queue[i]])
	return out


# --- stepping ------------------------------------------------------------

## Advance the simulation by exactly one tick.
func step() -> void:
	if completed:
		return
	tick += 1

	# Front-most passengers move first, so a cell freed this tick can be
	# entered this tick by the passenger directly behind.
	var snapshot := active.duplicate()
	for p in snapshot:
		match p.state:
			Passenger.State.ENTERING, Passenger.State.WALKING, Passenger.State.BLOCKED:
				_step_walking(p)
			Passenger.State.STOWING:
				p.timer -= 1
				p.total_stow_time += 1
				if p.timer <= 0:
					_begin_seat_access(p)
			Passenger.State.WAITING_FOR_SEAT:
				p.timer -= 1
				p.total_seat_wait_time += 1
				if p.timer <= 0:
					_set_state(p, Passenger.State.SEATING)
					p.timer = p.seat_access_duration
			Passenger.State.SEATING:
				p.timer -= 1
				if p.timer <= 0:
					_seat(p)

	_attribute_blocking()
	_step_entry()

	if closed and seated_count >= queue.size() and not completed:
		completed = true
		boarding_completed.emit(tick)


## Charge every BLOCKED tick to the nearest non-blocked passenger ahead, so
## the results screen can name who caused the biggest jam.
func _attribute_blocking() -> void:
	var head: Passenger = null
	for p in active:
		if p.state == Passenger.State.BLOCKED:
			if head != null:
				head.caused_blocked_time += 1
		else:
			head = p


func _step_walking(p: Passenger) -> void:
	if p.progress < p.walk_ticks_per_cell:
		p.progress += 1
		p.total_walk_time += 1
		if p.state != Passenger.State.WALKING:
			_set_state(p, Passenger.State.WALKING)
		if p.progress < p.walk_ticks_per_cell:
			return
	# Ready to advance one cell.
	var next_cell := p.aisle_position + 1
	if aisle[next_cell] == -1:
		aisle[p.aisle_position] = -1
		aisle[next_cell] = p.id
		p.aisle_position = next_cell
		p.progress = 0
		if p.state != Passenger.State.WALKING:
			_set_state(p, Passenger.State.WALKING)
		if next_cell == p.seat_row:
			_arrive_at_row(p)
	else:
		p.total_blocked_time += 1
		if p.state != Passenger.State.BLOCKED:
			_set_state(p, Passenger.State.BLOCKED)


func _arrive_at_row(p: Passenger) -> void:
	if p.carry_on_count > 0 and p.luggage_stow_duration > 0:
		_set_state(p, Passenger.State.STOWING)
		p.timer = p.luggage_stow_duration
	else:
		_begin_seat_access(p)


func _begin_seat_access(p: Passenger) -> void:
	var n := 0
	for letter in aircraft.seats_between_aisle(p.seat_letter):
		if seat_occupied.has(AircraftDef.seat_key(p.seat_row, letter)):
			n += 1
	p.obstruction_count = n
	if n > 0:
		_set_state(p, Passenger.State.WAITING_FOR_SEAT)
		p.timer = n * config.seat_per_obstructer_ticks
	else:
		_set_state(p, Passenger.State.SEATING)
		p.timer = p.seat_access_duration


func _seat(p: Passenger) -> void:
	aisle[p.aisle_position] = -1
	p.aisle_position = -1
	active.erase(p)
	seat_occupied[p.seat_key()] = p.id
	p.seated_tick = tick
	seated_count += 1
	_set_state(p, Passenger.State.SEATED)
	passenger_seated.emit(p)


func _step_entry() -> void:
	ticks_since_entry += 1
	if queue_index >= queue.size():
		return
	if ticks_since_entry < config.entry_interval_ticks:
		return
	if aisle[0] != -1:
		return
	var p: Passenger = _by_id[queue[queue_index]]
	queue_index += 1
	aisle[0] = p.id
	p.aisle_position = 0
	p.progress = 0
	p.entered_tick = tick
	active.append(p)
	ticks_since_entry = 0
	_set_state(p, Passenger.State.ENTERING)
	passenger_entered.emit(p)


func _set_state(p: Passenger, new_state: int) -> void:
	var old := p.state
	if old == new_state:
		return
	p.state = new_state
	passenger_state_changed.emit(p, old, new_state)


## Run until boarding completes or max_ticks is hit. Returns the final tick.
func run_to_completion(max_ticks: int = 2_000_000) -> int:
	while not completed and tick < max_ticks:
		step()
	return tick


# --- diagnostics ---------------------------------------------------------

func state_counts() -> Dictionary:
	var counts := {}
	for s in Passenger.State.values():
		counts[s] = 0
	for p in passengers:
		counts[p.state] += 1
	return counts


func aisle_occupancy() -> int:
	return active.size()


## Number of passengers currently blocked behind the passenger at `cell`.
func passengers_delayed_behind(cell: int) -> int:
	var n := 0
	for p in active:
		if p.aisle_position < cell and p.state == Passenger.State.BLOCKED:
			n += 1
	return n


func result() -> Dictionary:
	var blocked := 0
	var last_seated := 0
	var walk := 0
	var stow := 0
	var seat_wait := 0
	for p in passengers:
		blocked += p.total_blocked_time
		walk += p.total_walk_time
		stow += p.total_stow_time
		seat_wait += p.total_seat_wait_time
		last_seated = maxi(last_seated, p.seated_tick)
	var blockers: Array = []
	for p in passengers:
		if p.caused_blocked_time > 0:
			blockers.append(p)
	blockers.sort_custom(func(a, b):
		if a.caused_blocked_time != b.caused_blocked_time:
			return a.caused_blocked_time > b.caused_blocked_time
		return a.id < b.id
	)
	var top: Array = []
	for i in mini(3, blockers.size()):
		var p: Passenger = blockers[i]
		top.append({
			"id": p.id,
			"seat": p.seat_key(),
			"carry_on_count": p.carry_on_count,
			"obstruction_count": p.obstruction_count,
			"caused_blocked_ticks": p.caused_blocked_time,
		})
	return {
		"sim_version": SIM_VERSION,
		"config_version": config.config_version,
		"seed": seed_value,
		"completed": completed,
		"total_ticks": tick,
		"total_seconds": config.ticks_to_seconds(tick),
		## Differs from total_ticks only while boarding can stay open (airport mode).
		"last_seated_tick": last_seated,
		"passengers": passengers.size(),
		"admitted": queue.size(),
		"seated": seated_count,
		"blocked_ticks": blocked,
		"walk_ticks": walk,
		"stow_ticks": stow,
		"seat_wait_ticks": seat_wait,
		"top_blockers": top,
		"strategy": strategy.to_dict(),
		"warnings": warnings.duplicate(),
	}


# --- persistence (airport saves, D-021) -----------------------------------
# Passenger fields are saved by the owner through Passenger.snapshot(); this
# covers only the engine's own state. restore() takes the same passenger objects.

func snapshot() -> Dictionary:
	var ranks := {}
	for id in _rank:
		ranks[str(id)] = _rank[id]
	var seats := {}
	for key in seat_occupied:
		seats[key] = seat_occupied[key]
	var active_ids: Array = []
	for p in active:
		active_ids.append(p.id)
	return {
		"seed": seed_value, "strategy": strategy.to_dict(), "config": config.to_dict(),
		"queue": Array(queue), "queue_index": queue_index, "aisle": Array(aisle),
		"active": active_ids, "seat_occupied": seats, "tick": tick,
		"seated_count": seated_count, "ticks_since_entry": ticks_since_entry,
		"completed": completed, "closed": closed, "rank": ranks,
		"warnings": Array(warnings),
	}


func restore(p_aircraft: AircraftDef, p_passengers: Array[Passenger], data: Dictionary) -> void:
	aircraft = p_aircraft
	passengers = p_passengers
	config = SimConfig.from_dict(data.config)
	strategy = BoardingStrategy.from_dict(data.strategy)
	seed_value = int(data.seed)
	_by_id.clear()
	for p in passengers:
		_by_id[p.id] = p
	queue.clear()
	for id in data.queue:
		queue.append(int(id))
	queue_index = int(data.queue_index)
	aisle.clear()
	for id in data.aisle:
		aisle.append(int(id))
	active.clear()
	for id in data.active:
		active.append(_by_id[int(id)])
	seat_occupied.clear()
	for key in data.seat_occupied:
		seat_occupied[key] = int(data.seat_occupied[key])
	_rank.clear()
	for key in data.rank:
		_rank[int(key)] = int(data.rank[key])
	tick = int(data.tick)
	seated_count = int(data.seated_count)
	ticks_since_entry = int(data.ticks_since_entry)
	completed = bool(data.completed)
	closed = bool(data.closed)
	warnings.clear()
	for w in data.warnings:
		warnings.append(str(w))


static func format_ticks(ticks: int, tick_rate: int) -> String:
	var total_seconds := ticks / tick_rate
	return "%02d:%02d" % [total_seconds / 60, total_seconds % 60]
