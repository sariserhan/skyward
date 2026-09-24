class_name Turnaround
extends RefCounted
## Aircraft turnaround as a small task graph (M4). The graph comes from the
## scenario's "turnaround" block; tasks are canonical TurnaroundTask entities in
## AirportState.turnaround_tasks. This class holds only the rules: creation with
## seeded durations, per-tick status updates, blocking reasons, and additive
## departure-delay attribution along the critical path.
##
## Boarding tasks are not timed here. AirportSimulation drives them through the
## M3 boarding window and reports RUNNING / COMPLETE back.

const PUSHBACK := "pushback_ready"
const BOARDING := "boarding"

var airport: AirportState
var events: AirportEvents
var config: Dictionary = {}
## Task types in configured order. The order is topological (validated at bind).
var order: Array = []
## Per flight: tasks in order and by type. Derived from the registry, not saved.
var _lists: Dictionary = {}
var _by_type: Dictionary = {}
var _offsets: Dictionary = {}
## Per flight: the next tick at which update() can change anything (a running
## task finishing). Boarding and duration changes wake the flight at once.
## An update with nothing due is a no-op, so skipping it keeps results exact.
var _wake: Dictionary = {}


func bind(state: AirportState, event_bus: AirportEvents, settings: Dictionary) -> void:
	airport = state
	events = event_bus
	config = settings.duplicate(true)
	order = []
	for spec in config.get("tasks", []):
		for dependency in spec.get("after", []):
			assert(dependency in order, "turnaround task %s listed before its prerequisite %s" % [spec.type, dependency])
		order.append(spec.type)
	_lists = {}
	_by_type = {}
	_offsets = {}
	_wake = {}


func task(f: AirportFlight, type: String) -> TurnaroundTask:
	if not _by_type.has(f.id): _index(f)
	return _by_type[f.id].get(type)


func tasks_of(f: AirportFlight) -> Array:
	if not _lists.has(f.id): _index(f)
	return _lists[f.id]


func _index(f: AirportFlight) -> void:
	var list: Array = []
	var by_type := {}
	for id in f.task_ids:
		var t: TurnaroundTask = airport.turnaround_tasks[id]
		list.append(t)
		by_type[t.type] = t
	_lists[f.id] = list
	_by_type[f.id] = by_type


## Create a flight's tasks at setup with seeded durations (drawn in flight, then
## task order) and a planned schedule from nominal durations.
## `gate_tick`: planned docking. `open_tick`: planned boarding open (D-30).
## `pushback_tick`: scheduled pushback.
func create(f: AirportFlight, aircraft_type: String, rng: SimRng, gate_tick: int, open_tick: int, pushback_tick: int) -> void:
	f.task_ids = []
	var variation := int(config.get("variation_permille", 0))
	for spec in config.get("tasks", []):
		var t := TurnaroundTask.new()
		t.type = spec.type
		t.id = f.id + ":" + t.type
		t.flight_id = f.id
		t.label = str(spec.get("label", t.type))
		t.kind = str(spec.get("kind", "timed"))
		t.required = bool(spec.get("required", true))
		t.after = spec.get("after", []).duplicate()
		t.exclusive_with = spec.get("exclusive_with", []).duplicate()
		var durations: Dictionary = spec.get("durations", {})
		t.nominal_ticks = int(durations.get(aircraft_type, durations.get("*", 0)))
		t.duration_ticks = t.nominal_ticks
		if t.kind == "timed":
			t.duration_ticks += rng.randi_range(0, t.nominal_ticks * variation / 1000)
			t.duration_ticks += int(f.turnaround_overrides.get(t.type, 0))
		airport.turnaround_tasks[t.id] = t
		f.task_ids.append(t.id)
	_index(f)
	# Exclusion is mutual: record it on both tasks.
	for t: TurnaroundTask in tasks_of(f):
		for other in t.exclusive_with:
			var x := task(f, other)
			if x != null and not t.type in x.exclusive_with: x.exclusive_with.append(t.type)
	for t: TurnaroundTask in tasks_of(f):
		var ready := gate_tick
		for dependency in t.after: ready = maxi(ready, task(f, dependency).planned_finish_tick)
		match t.kind:
			"timed":
				t.planned_start_tick = ready
				t.planned_finish_tick = ready + t.nominal_ticks
			"boarding":
				t.planned_start_tick = maxi(ready, open_tick)
				t.planned_finish_tick = maxi(t.planned_start_tick, pushback_tick)
			_:
				t.planned_start_tick = ready
				t.planned_finish_tick = ready


## Before docking every task is pending, so the estimate reduces to two offsets
## from docking: when boarding's prerequisites finish, and when the other
## pushback prerequisites finish. Same result as walking the graph; cached.
func dock_offsets(f: AirportFlight) -> Array:
	if _offsets.has(f.id): return _offsets[f.id]
	var finish := {}
	var boarding_ready := 0
	var others := 0
	for t: TurnaroundTask in tasks_of(f):
		var ready := 0
		for dependency in t.after: ready = maxi(ready, int(finish.get(dependency, 0)))
		finish[t.type] = ready + (t.duration_ticks if t.kind == "timed" else 0)
		if t.kind == "boarding": boarding_ready = ready
		if t.type == PUSHBACK:
			for dependency in t.after:
				if task(f, dependency).kind != "boarding": others = maxi(others, int(finish[dependency]))
	_offsets[f.id] = [boarding_ready, others]
	return _offsets[f.id]


## Durations changed (ramp hold): drop the cached offsets.
func durations_changed(f: AirportFlight) -> void:
	_offsets.erase(f.id)
	wake(f)


## Nominal dock-to-pushback-ready time, for estimates and gate warnings.
func planned_gate_ticks(f: AirportFlight, gate_tick: int) -> int:
	var milestone := task(f, PUSHBACK)
	return 0 if milestone == null else milestone.planned_finish_tick - gate_tick


## Advance a docked flight's tasks at `now`, in topological order, so a task
## finishing this tick releases its dependents on the same tick.
## `schedule_boarding` is called when the boarding task is released.
func update(f: AirportFlight, now: int, schedule_boarding: Callable) -> void:
	if int(_wake.get(f.id, now)) > now: return
	for t: TurnaroundTask in tasks_of(f):
		match t.status:
			TurnaroundTask.COMPLETE, TurnaroundTask.READY:
				continue
			TurnaroundTask.RUNNING:
				if t.kind == "timed" and now >= t.start_tick + t.duration_ticks:
					_complete(t, t.start_tick + t.duration_ticks)
				continue
		var reason := _blocker(f, t)
		if not reason.is_empty():
			t.status = TurnaroundTask.BLOCKED
			t.blocked_reason = reason
			continue
		t.blocked_reason = ""
		t.started_after = _released_by(f, t)
		match t.kind:
			"timed":
				t.status = TurnaroundTask.RUNNING
				t.start_tick = now
				events.record(now, "TASK_STARTED", f.id, {"task": t.type, "after": t.started_after, "duration_ticks": t.duration_ticks})
				if t.duration_ticks <= 0: _complete(t, now)
			"milestone":
				t.start_tick = now
				_complete(t, now)
			"boarding":
				t.status = TurnaroundTask.READY
				schedule_boarding.call(f)
	var wake := 2147483647
	for t: TurnaroundTask in tasks_of(f):
		if t.status == TurnaroundTask.RUNNING and t.kind == "timed": wake = mini(wake, t.start_tick + t.duration_ticks)
	_wake[f.id] = wake


## Something outside the timed tasks changed: re-evaluate on the next update.
func wake(f: AirportFlight) -> void:
	_wake.erase(f.id)


## The boarding window has opened (M3 boarding phase "open").
func boarding_running(f: AirportFlight, now: int) -> void:
	var t := task(f, BOARDING)
	if t == null: return
	t.status = TurnaroundTask.RUNNING
	t.start_tick = now
	t.blocked_reason = ""
	wake(f)
	events.record(now, "TASK_STARTED", f.id, {"task": t.type, "after": t.started_after})


## Boarding reached phase "complete" (gate closed, everyone admitted seated).
func boarding_complete(f: AirportFlight, finished: int) -> void:
	var t := task(f, BOARDING)
	if t != null: _complete(t, finished)
	wake(f)


func pushback_ready(f: AirportFlight) -> bool:
	var milestone := task(f, PUSHBACK)
	return milestone == null or milestone.status == TurnaroundTask.COMPLETE


## What is holding departure right now: follow the pushback milestone through
## whatever blocks it until reaching work that is running or waiting on its own
## (boarding window, gate). Empty once pushback-ready or before docking.
func holding(f: AirportFlight) -> TurnaroundTask:
	var t := task(f, PUSHBACK)
	if t == null or t.status in [TurnaroundTask.COMPLETE, TurnaroundTask.PENDING]: return null
	for _i in f.task_ids.size():
		if t.status != TurnaroundTask.BLOCKED: return t
		var next: TurnaroundTask = null
		for dependency in t.after:
			if task(f, dependency).status != TurnaroundTask.COMPLETE:
				next = task(f, dependency)
				break
		if next == null:
			for other in t.exclusive_with:
				if _active(task(f, other)): next = task(f, other)
		if next == null: return t
		t = next
	return t


func completed_count(f: AirportFlight) -> int:
	var n := 0
	for t: TurnaroundTask in tasks_of(f):
		if t.status == TurnaroundTask.COMPLETE: n += 1
	return n


func _complete(t: TurnaroundTask, at: int) -> void:
	t.status = TurnaroundTask.COMPLETE
	t.finish_tick = at
	t.blocked_reason = ""
	events.record(at, "TASK_COMPLETED", t.flight_id, {"task": t.type, "start_tick": t.start_tick,
		"overrun_ticks": (t.finish_tick - t.start_tick) - (t.planned_finish_tick - t.planned_start_tick)})


func _active(t: TurnaroundTask) -> bool:
	return t.status == TurnaroundTask.RUNNING or (t.kind == "boarding" and t.status == TurnaroundTask.READY)


func _blocker(f: AirportFlight, t: TurnaroundTask) -> String:
	for dependency in t.after:
		var p := task(f, dependency)
		if p.status != TurnaroundTask.COMPLETE: return "waiting for " + p.label.to_lower()
	for other in t.exclusive_with:
		var x := task(f, other)
		if _active(x): return x.label.to_lower() + " in progress"
	return ""


## The prerequisite or exclusive partner that finished last (first in order on
## ties), else the gate: what this task actually waited for.
func _released_by(f: AirportFlight, t: TurnaroundTask) -> String:
	var best := "gate"
	var latest := -1
	for type in t.after + t.exclusive_with:
		var x := task(f, type)
		if x.status == TurnaroundTask.COMPLETE and x.finish_tick > latest:
			latest = x.finish_tick
			best = type
	return best


# --- causality ---------------------------------------------------------------

## Additive split of a flight's takeoff lateness (sums exactly to it):
## runway queue at takeoff, the hold used, then a walk back along the critical
## path from pushback readiness. Each task on it is blamed first for its own
## overrun beyond plan; the rest passes to whatever released it. Lateness that
## reaches the gate is late_inbound.
func attribute(f: AirportFlight, planned_pushback: int, takeoff_wait: int) -> Dictionary:
	var out := {}
	var lateness := f.actual_departure - f.scheduled_departure
	if lateness <= 0: return out
	_add(out, "runway_takeoff_queue", mini(takeoff_wait, lateness))
	var pushback_late := f.gate_release_tick - planned_pushback
	var hold := clampi(pushback_late, 0, f.hold_ticks)
	_add(out, "passenger_hold", hold)
	var milestone := task(f, PUSHBACK)
	var rest := pushback_late - hold
	if milestone == null: _add(out, "late_inbound", rest)
	else: _blame(f, milestone, rest, out)
	return out


func _blame(f: AirportFlight, t: TurnaroundTask, amount: int, out: Dictionary) -> void:
	if amount <= 0: return
	var overrun := (t.finish_tick - t.start_tick) - (t.planned_finish_tick - t.planned_start_tick)
	var own := clampi(overrun, 0, amount)
	var rest := amount - own
	# Pass on only what this task inherited: its own late start.
	var inherited := clampi(t.start_tick - t.planned_start_tick, 0, rest)
	own += rest - inherited
	if t.started_after != "gate" and task(f, t.started_after) != null:
		_blame(f, task(f, t.started_after), inherited, out)
	else:
		_add(out, "late_inbound", inherited)
	_add(out, t.type, own)


static func _add(out: Dictionary, key: String, ticks: int) -> void:
	if ticks > 0: out[key] = int(out.get(key, 0)) + ticks


# --- persistence -----------------------------------------------------------

## Validate saved tasks against the saved flights before restoring anything.
static func valid_snapshot(data: Dictionary) -> bool:
	var state: Dictionary = data.airport
	var now := int(data.clock.tick)
	var settings = data.scenario.get("turnaround", {})
	if not settings is Dictionary or not settings.get("tasks", []) is Array: return false
	var types: Array = []
	for spec in settings.get("tasks", []):
		if not spec is Dictionary or not spec.get("type") is String or spec.type in types: return false
		if not str(spec.get("kind", "timed")) in TurnaroundTask.KINDS: return false
		for dependency in spec.get("after", []):
			if not dependency in types: return false
		types.append(spec.type)
	var owned := 0
	for fid in state.flights:
		var f: Dictionary = state.flights[fid]
		if f.task_ids.size() != types.size(): return false
		var docked: bool = f.status in ["at_gate", "turnaround", "boarding", "ready_for_pushback", "taxiing_out", "departed"]
		var by_type := {}
		for i in f.task_ids.size():
			var t = state.turnaround_tasks.get(f.task_ids[i])
			if not AirportSimulation._entity_shape(t, TurnaroundTask.new()): return false
			if t.id != f.task_ids[i] or t.flight_id != fid or t.type != types[i] or t.id != fid + ":" + t.type: return false
			if not t.status in TurnaroundTask.STATUSES or not t.kind in TurnaroundTask.KINDS: return false
			if t.duration_ticks < 0 or t.nominal_ticks < 0: return false
			if not docked and t.status != TurnaroundTask.PENDING: return false
			if t.status == TurnaroundTask.READY and t.kind != "boarding": return false
			if t.status in [TurnaroundTask.RUNNING, TurnaroundTask.COMPLETE] and (t.start_tick < 0 or t.start_tick > now): return false
			if t.status == TurnaroundTask.COMPLETE and (t.finish_tick < t.start_tick or t.finish_tick > now): return false
			if t.status == TurnaroundTask.RUNNING and t.kind == "timed" and now >= t.start_tick + t.duration_ticks: return false
			for dependency in t.after:
				if not by_type.has(dependency): return false
				if t.status in [TurnaroundTask.RUNNING, TurnaroundTask.COMPLETE] and by_type[dependency].status != TurnaroundTask.COMPLETE: return false
			for other in t.exclusive_with:
				if not other in types: return false
			by_type[t.type] = t
			owned += 1
		var boarding = by_type.get(BOARDING)
		if boarding != null:
			var expected: Array = {"": [TurnaroundTask.PENDING, TurnaroundTask.BLOCKED], "scheduled": [TurnaroundTask.READY],
				"open": [TurnaroundTask.RUNNING], "closed": [TurnaroundTask.RUNNING], "complete": [TurnaroundTask.RUNNING, TurnaroundTask.COMPLETE]}.get(f.boarding_phase, [])
			if not boarding.status in expected: return false
		var milestone = by_type.get(PUSHBACK)
		if milestone != null and (milestone.status == TurnaroundTask.COMPLETE) != (f.status in ["ready_for_pushback", "taxiing_out", "departed"]): return false
	return owned == state.turnaround_tasks.size()
