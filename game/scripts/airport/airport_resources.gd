class_name AirportResources
extends RefCounted
## Operational resources (M8): pools of abstract units (cleaning crews, fuel
## units, baggage crews, tugs) that turnaround tasks hold while they run. No
## movement or travel time: a granted unit is in use on the tick it is granted.
##
## Allocation is event-driven. Requests, releases, priority changes and
## restores mark a pool dirty; dispatch() runs once per tick after every flight
## has updated and assigns free units in queue order. The queue order is fully
## deterministic: service priority, scheduled departure, the tick the task
## became ready, the flight's scenario order, the task's graph order.

const PRIORITIES := ["high", "normal", "low"]

var airport: AirportState
var events: AirportEvents
## Type -> {"label", "units": [{"id", "task_id", "since"}], "queue": [task ids],
## "stats": {...}}. Types dispatched in name order.
var pools: Dictionary = {}
var order: Array = []
var dirty: Dictionary = {}
## Flight id -> scenario index, and task type -> graph index (tie-breakers).
var _flight_index: Dictionary = {}
var _task_index: Dictionary = {}


func bind(state: AirportState, event_bus: AirportEvents, settings: Dictionary, flight_ids: Array, task_types: Array) -> void:
	airport = state
	events = event_bus
	pools = {}
	order = []
	dirty = {}
	# Dispatch order is by type name: saves sort object keys, so config order
	# would not survive a round trip.
	var types: Array = settings.keys()
	types.sort()
	for type in types:
		var spec: Dictionary = settings[type]
		var units: Array = []
		for i in int(spec.get("units", 0)): units.append({"id": "%s#%d" % [type, i + 1], "task_id": "", "since": -1})
		pools[type] = {"label": str(spec.get("label", type)), "units": units, "queue": [],
			"stats": {"requests": 0, "waited": 0, "wait_total": 0, "wait_max": 0, "allocations": 0, "peak_queue": 0,
				"busy_ticks": 0, "last_change": -1}}
		order.append(type)
	_flight_index = {}
	for i in flight_ids.size(): _flight_index[flight_ids[i]] = i
	_task_index = {}
	for i in task_types.size(): _task_index[task_types[i]] = i


func enabled() -> bool:
	return not pools.is_empty()


## Whether this task must hold a unit before it can run.
func needs(t: TurnaroundTask) -> bool:
	return not t.resource.is_empty() and pools.has(t.resource)


## The task is ready to run but needs a unit: queue it.
func request(t: TurnaroundTask, now: int) -> void:
	var pool: Dictionary = pools[t.resource]
	t.status = TurnaroundTask.WAITING
	t.ready_tick = now
	t.blocked_reason = "waiting for " + unit_name(t.resource)
	_insert(pool.queue, t)
	pool.stats.requests += 1
	pool.stats.peak_queue = maxi(pool.stats.peak_queue, pool.queue.size())
	dirty[t.resource] = true


## The task is done with its unit.
func release(t: TurnaroundTask, now: int) -> void:
	if t.unit_id.is_empty(): return
	var pool: Dictionary = pools[t.resource]
	_account(pool, now)
	for unit in pool.units:
		if unit.id == t.unit_id:
			unit.task_id = ""
			unit.since = now
	events.record(now, "RESOURCE_RELEASED", t.flight_id, {"resource": t.resource, "unit": t.unit_id, "task": t.type})
	t.unit_id = ""
	dirty[t.resource] = true


## Assign free units to waiting tasks in queue order, calling `start` for each
## granted task. Only dirty pools are looked at.
func dispatch(now: int, start: Callable) -> void:
	if dirty.is_empty(): return
	for type in order:
		if not dirty.has(type): continue
		var pool: Dictionary = pools[type]
		for unit in pool.units:
			if pool.queue.is_empty(): break
			if not unit.task_id.is_empty(): continue
			var t: TurnaroundTask = airport.turnaround_tasks[pool.queue.pop_front()]
			_account(pool, now)
			unit.task_id = t.id
			unit.since = now
			t.unit_id = unit.id
			t.resource_wait_ticks = now - t.ready_tick
			pool.stats.allocations += 1
			if t.resource_wait_ticks > 0:
				pool.stats.waited += 1
				pool.stats.wait_total += t.resource_wait_ticks
				pool.stats.wait_max = maxi(pool.stats.wait_max, t.resource_wait_ticks)
			events.record(now, "RESOURCE_ASSIGNED", t.flight_id, {"resource": type, "unit": unit.id, "task": t.type, "waited_ticks": t.resource_wait_ticks})
			start.call(t)
		# Shortage transitions only, never one event per tick.
		var short: bool = not pool.queue.is_empty()
		if short and not pool.stats.get("short", false):
			events.record(now, "RESOURCE_SHORTAGE", "", {"resource": type, "waiting": pool.queue.size()})
		elif not short and pool.stats.get("short", false):
			events.record(now, "RESOURCE_SHORTAGE_CLEARED", "", {"resource": type})
		pool.stats["short"] = short
	dirty = {}


## A flight's service priority changed: re-sort its waiting tasks.
func reprioritize(f: AirportFlight) -> void:
	for type in order:
		var pool: Dictionary = pools[type]
		var mine: Array = []
		for id in pool.queue:
			if airport.turnaround_tasks[id].flight_id == f.id: mine.append(id)
		if mine.is_empty(): continue
		for id in mine:
			pool.queue.erase(id)
			_insert(pool.queue, airport.turnaround_tasks[id])
		dirty[type] = true


func _insert(queue: Array, t: TurnaroundTask) -> void:
	var key := _key(t)
	var at := queue.size()
	for i in queue.size():
		if _less(key, _key(airport.turnaround_tasks[queue[i]])):
			at = i
			break
	queue.insert(at, t.id)


func _key(t: TurnaroundTask) -> Array:
	var f: AirportFlight = airport.flights[t.flight_id]
	return [maxi(0, PRIORITIES.find(f.service_priority)), f.scheduled_departure, t.ready_tick,
		int(_flight_index.get(f.id, 0)), int(_task_index.get(t.type, 0))]


static func _less(a: Array, b: Array) -> bool:
	for i in a.size():
		if a[i] != b[i]: return a[i] < b[i]
	return false


## Busy unit-ticks, integrated at every change of occupancy.
func _account(pool: Dictionary, now: int) -> void:
	var stats: Dictionary = pool.stats
	if stats.last_change >= 0: stats.busy_ticks += busy(pool) * (now - int(stats.last_change))
	stats.last_change = now


## Every queue is in deterministic order (checked after a restore).
func queues_ordered() -> bool:
	for type in order:
		var queue: Array = pools[type].queue
		for i in range(1, queue.size()):
			if _less(_key(airport.turnaround_tasks[queue[i]]), _key(airport.turnaround_tasks[queue[i - 1]])): return false
	return true


# --- queries -----------------------------------------------------------------

static func busy(pool: Dictionary) -> int:
	var n := 0
	for unit in pool.units:
		if not unit.task_id.is_empty(): n += 1
	return n


func unit_name(type: String) -> String:
	return str(pools[type].label).to_lower().trim_suffix("s") if pools.has(type) else type.replace("_", " ")


## 0-based position of a waiting task in its queue, or -1.
func position(t: TurnaroundTask) -> int:
	return pools[t.resource].queue.find(t.id) if needs(t) else -1


## Rough start estimate for a waiting task: the units' expected release times
## (running tasks' planned ends), cycled by queue position.
func expected_start(t: TurnaroundTask, now: int) -> int:
	var pool: Dictionary = pools[t.resource]
	var frees: Array = []
	for unit in pool.units:
		if unit.task_id.is_empty(): frees.append(now)
		else:
			var holder: TurnaroundTask = airport.turnaround_tasks[unit.task_id]
			frees.append(maxi(now, holder.start_tick + holder.duration_ticks))
	if frees.is_empty(): return now
	frees.sort()
	var k := maxi(0, position(t))
	return int(frees[k % frees.size()]) + (k / frees.size()) * t.duration_ticks


## Airport-wide resource metrics at `now` (utilization, waits, queues).
func metrics(now: int, start_tick: int) -> Dictionary:
	var out := {}
	for type in order:
		var pool: Dictionary = pools[type]
		var stats: Dictionary = pool.stats
		var busy_ticks: int = stats.busy_ticks + (busy(pool) * (now - int(stats.last_change)) if stats.last_change >= 0 else 0)
		var capacity: int = pool.units.size() * maxi(1, now - start_tick)
		out[type] = {"label": pool.label, "units": pool.units.size(), "busy": busy(pool), "waiting": pool.queue.size(),
			"utilization": float(busy_ticks) / maxi(1, capacity), "requests": stats.requests, "waited": stats.waited,
			"mean_wait_ticks": 0 if stats.waited == 0 else stats.wait_total / stats.waited, "max_wait_ticks": stats.wait_max,
			"peak_queue": stats.peak_queue, "allocations": stats.allocations}
	return out


# --- persistence ---------------------------------------------------------------

func snapshot() -> Dictionary:
	var out := {}
	for type in order: out[type] = {"units": pools[type].units.duplicate(true), "queue": pools[type].queue.duplicate(), "stats": pools[type].stats.duplicate()}
	return {"pools": out, "dirty": dirty.keys()}


func restore(data: Dictionary) -> void:
	for type in data.pools:
		pools[type].units = data.pools[type].units.duplicate(true)
		pools[type].queue = data.pools[type].queue.duplicate()
		pools[type].stats = data.pools[type].stats.duplicate()
	dirty = {}
	for type in data.dirty: dirty[type] = true


## Units, holders and queues agree with the saved tasks, and queues are in the
## deterministic order.
static func valid_snapshot(data: Dictionary) -> bool:
	var settings = data.scenario.get("resources", {})
	var system = data.get("resources")
	if not settings is Dictionary or not system is Dictionary: return false
	if not system.get("pools") is Dictionary or not system.get("dirty") is Array: return false
	var state: Dictionary = data.airport
	var tasks: Dictionary = state.turnaround_tasks
	var held := {}
	var queued := {}
	if system.pools.size() != settings.size(): return false
	for type in settings:
		var pool = system.pools.get(type)
		if not pool is Dictionary or not pool.get("units") is Array or not pool.get("queue") is Array or not pool.get("stats") is Dictionary: return false
		if pool.units.size() != int(settings[type].get("units", 0)): return false
		for i in pool.units.size():
			var unit = pool.units[i]
			if not unit is Dictionary or unit.get("id") != "%s#%d" % [type, i + 1] or not unit.get("task_id") is String or not unit.get("since") is int: return false
			if unit.task_id.is_empty(): continue
			var t = tasks.get(unit.task_id)
			if t == null or held.has(unit.task_id) or t.resource != type or t.unit_id != unit.id: return false
			if t.status != TurnaroundTask.RUNNING: return false
			held[unit.task_id] = true
		for id in pool.queue:
			var t = tasks.get(id)
			if not id is String or t == null or queued.has(id) or t.resource != type or t.status != TurnaroundTask.WAITING: return false
			queued[id] = true
	for type in system.dirty:
		if not settings.has(type): return false
	for id in tasks:
		var t: Dictionary = tasks[id]
		var needs: bool = not t.resource.is_empty() and settings.has(t.resource)
		if t.status == TurnaroundTask.WAITING and not queued.has(id): return false
		if not t.unit_id.is_empty() and not held.has(id): return false
		# Running resource work always holds its unit.
		if needs and t.status == TurnaroundTask.RUNNING and not held.has(id): return false
		if not needs and (t.status == TurnaroundTask.WAITING or not t.unit_id.is_empty()): return false
	return true
