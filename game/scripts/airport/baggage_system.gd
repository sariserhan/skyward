class_name BaggageSystem
extends RefCounted
## Checked baggage (M7): logical, timed processing of AirportBag objects. No
## belts or vehicles. Stages (outbound sortation, transfer sortation, reclaim
## delivery) each have a transit time into them, finitely many servers, a FIFO
## queue and a fixed service time. Aircraft unload and load bags one at a time
## at configured rates. Everything runs on the airport clock through one stable
## event heap, so it is deterministic and survives save/load exactly.

const REASON_NOT_BOARDED := "passenger_not_boarded"

var airport: AirportState
var events: AirportEvents
var passenger_flow: PassengerFlow
var config: Dictionary = {}
## Stage id -> {"servers", "service_ticks", "transit_ticks", "queue": [bag ids], "busy": {slot: bag id}}
var stages: Dictionary = {}
var pending: Array = []
var sequence: int = 0


func bind(state: AirportState, event_bus: AirportEvents, flow: PassengerFlow, settings: Dictionary) -> void:
	airport = state
	events = event_bus
	passenger_flow = flow
	config = settings.duplicate(true)
	stages = {}
	for id in config.get("stages", {}):
		var s: Dictionary = config.stages[id]
		stages[id] = {"servers": int(s.servers), "service_ticks": int(s.service_ticks), "transit_ticks": int(s.transit_ticks), "queue": [], "busy": {}}


func enabled() -> bool:
	return not config.is_empty()


# --- generation --------------------------------------------------------------

## Bags for every passenger, in passenger-id order, from their own stream: the
## chance of checking a bag follows the airline of the passenger's first
## flight, with an occasional second bag. Scenario demo_bags can fix a count.
func generate(seed_value: int) -> void:
	if not enabled(): return
	var rng := SimRng.new(seed_value, SimRng.STREAM_BAGGAGE)
	var by_airline: Dictionary = config.get("airline_checked_permille", {})
	var fixed := {}
	for entry in config.get("demo_bags", []): fixed["%s:%s" % [entry.flight, entry.seat]] = int(entry.bags)
	var ids: Array = []
	for key in airport.passengers: ids.append(int(key))
	ids.sort()
	var next := 1
	for id in ids:
		var p: Passenger = airport.passengers[str(id)]
		var first: AirportFlight = airport.flights[p.itinerary_legs[0] if p.journey_direction == "connecting" else p.current_flight_id]
		# Both draws always happen, so one passenger's bags never shift another's.
		var roll := rng.randi_range(0, 999)
		var second := rng.randi_range(0, 999)
		var count := 0
		if roll < int(by_airline.get(first.airline_id, config.get("checked_permille", 0))):
			count = 2 if second < int(config.get("second_bag_permille", 0)) else 1
		var seat: Array = p.itinerary_seats[0] if p.journey_direction == "connecting" else [p.seat_row, p.seat_letter]
		var key := "%s:%s" % [first.id, AircraftDef.seat_key(int(seat[0]), str(seat[1])) if not seat.is_empty() else ""]
		if fixed.has(key): count = fixed[key]
		for _i in count:
			var bag := AirportBag.new()
			bag.id = "BAG_%06d" % next
			next += 1
			bag.passenger_id = p.id
			match p.journey_direction:
				"departing":
					bag.kind = "originating"
					bag.legs = [p.current_flight_id]
					bag.state = "created"
				"arriving":
					bag.kind = "local"
					bag.legs = [p.current_flight_id]
					bag.state = "on_aircraft"
				_:
					bag.kind = "transfer"
					bag.legs = p.itinerary_legs.duplicate()
					bag.state = "on_aircraft"
			bag.current_flight_id = bag.legs[0]
			airport.bags[bag.id] = bag
			p.checked_bag_ids.append(bag.id)


# --- stepping ----------------------------------------------------------------

func step(now: int) -> void:
	while not pending.is_empty() and int(pending[0].tick) <= now:
		var event := _pop()
		var bag: AirportBag = airport.bags[event.bag_id]
		match event.kind:
			"arrive": _enqueue(bag, now)
			"sorted": _sorted(bag, int(event.slot), now)
			"unloaded": _unloaded(bag, now)
			"loaded": _loaded(bag, now)
			"offloaded": _offloaded(bag, now)


## The passenger has checked in: their bags head for outbound sortation.
func check_in(p: Passenger, now: int) -> void:
	for id in p.checked_bag_ids:
		var bag: AirportBag = airport.bags[id]
		if bag.state != "created": continue
		bag.checked_tick = now
		_send(bag, "outbound_sortation", now)


func _send(bag: AirportBag, stage_id: String, now: int) -> void:
	bag.state = "in_transit"
	bag.stage = stage_id
	_schedule(bag, now + int(stages[stage_id].transit_ticks), "arrive")


func _enqueue(bag: AirportBag, now: int) -> void:
	bag.state = "queued"
	stages[bag.stage].queue.append(bag.id)
	_dispatch(bag.stage, now)


func _dispatch(stage_id: String, now: int) -> void:
	var s: Dictionary = stages[stage_id]
	for slot in int(s.servers):
		if s.queue.is_empty(): return
		if s.busy.has(str(slot)): continue
		var bag: AirportBag = airport.bags[s.queue.pop_front()]
		bag.state = "sorting"
		s.busy[str(slot)] = bag.id
		_schedule(bag, now + int(s.service_ticks), "sorted", slot)


func _sorted(bag: AirportBag, slot: int, now: int) -> void:
	var stage_id := bag.stage
	stages[stage_id].busy.erase(str(slot))
	bag.stage = ""
	if stage_id == "reclaim":
		bag.state = "at_reclaim"
		bag.at_reclaim_tick = now
		events.record(now, "BAG_AT_RECLAIM", bag.current_flight_id, {"bag_id": bag.id, "passenger_id": bag.passenger_id})
		passenger_flow.bag_at_reclaim(airport.passengers[str(bag.passenger_id)], now)
	else:
		_ready(bag, now)
	_dispatch(stage_id, now)


## Sorted for its current flight: loaded if the flight is still taking bags.
func _ready(bag: AirportBag, now: int) -> void:
	bag.ready_tick = now
	var f: AirportFlight = airport.flights[bag.current_flight_id]
	if bag.missed_flight_id.is_empty() and f.bag_cutoff_passed:
		_flag(bag, f, "sorting", now)
	if not bag.missed_flight_id.is_empty():
		_end_missed(bag)
		return
	bag.state = "ready_for_flight"
	if f.bag_loading_open and not f.bag_load_finalized:
		f.bag_load_queue.append(bag.id)
		_load_next(f, now)


func _unloaded(bag: AirportBag, now: int) -> void:
	bag.unloaded_tick = now
	events.record(now, "BAG_UNLOADED", bag.current_flight_id, {"bag_id": bag.id, "passenger_id": bag.passenger_id})
	if bag.kind == "transfer":
		bag.leg_index = 1
		bag.current_flight_id = bag.legs[1]
		_send(bag, "transfer_sortation", now)
	else:
		_send(bag, "reclaim", now)


# --- aircraft unload / load ----------------------------------------------------

## The baggage_unload task starts: this aircraft's inbound bags come off one by
## one. Returns the tick the last bag is off (the task's end).
func start_unload(f: AirportFlight, now: int) -> int:
	var rates := _rates(f)
	var bags: Array = []
	for id in f.inbound_passenger_ids:
		for bag_id in airport.passengers[str(id)].checked_bag_ids:
			var bag: AirportBag = airport.bags[bag_id]
			if bag.leg_index == 0 and bag.legs[0] == f.id and bag.state == "on_aircraft": bags.append(bag)
	bags.sort_custom(func(a, b): return a.id < b.id)
	for i in bags.size():
		bags[i].state = "unloading"
		_schedule(bags[i], now + int(rates.unload_base_ticks) + (i + 1) * int(rates.unload_ticks_per_bag), "unloaded")
	f.bag_unload_due_tick = now + int(rates.unload_base_ticks) + bags.size() * int(rates.unload_ticks_per_bag)
	return f.bag_unload_due_tick


## The baggage_load task starts: bags already sorted for this flight go first,
## in the order they became ready; later ones join as they are sorted.
func start_load(f: AirportFlight, now: int) -> void:
	f.bag_loading_open = true
	var ready: Array = []
	for bag in bags_for(f):
		if bag.state == "ready_for_flight": ready.append(bag)
	ready.sort_custom(func(a, b): return a.ready_tick < b.ready_tick if a.ready_tick != b.ready_tick else a.id < b.id)
	for bag in ready: f.bag_load_queue.append(bag.id)
	_load_next(f, now)


func _load_next(f: AirportFlight, now: int) -> void:
	if not f.bag_loader_current.is_empty() or f.bag_load_queue.is_empty(): return
	var op: String = f.bag_load_queue.pop_front()
	var rates := _rates(f)
	f.bag_loader_current = op
	if op.begins_with("-"):
		_schedule(airport.bags[op.substr(1)], now + int(rates.offload_ticks_per_bag), "offloaded")
	else:
		var bag: AirportBag = airport.bags[op]
		bag.state = "loading"
		_schedule(bag, now + int(rates.load_ticks_per_bag), "loaded")


func _loaded(bag: AirportBag, now: int) -> void:
	var f: AirportFlight = airport.flights[bag.current_flight_id]
	f.bag_loader_current = ""
	bag.state = "on_aircraft"
	bag.loaded_tick = now
	f.bags_loaded += 1
	# Loaded while its passenger was found not aboard: take it back off.
	if bag.missed_reason == REASON_NOT_BOARDED: f.bag_load_queue.push_front("-" + bag.id)
	_load_next(f, now)


func _offloaded(bag: AirportBag, now: int) -> void:
	var f: AirportFlight = airport.flights[bag.current_flight_id]
	f.bag_loader_current = ""
	f.bags_loaded -= 1
	bag.loaded_tick = -1
	_end_missed(bag)
	events.record(now, "BAG_OFFLOADED", f.id, {"bag_id": bag.id, "passenger_id": bag.passenger_id})
	_load_next(f, now)


## Bag cutoff: every bag for this flight that is not sorted and ready misses it.
func cutoff(f: AirportFlight, now: int) -> void:
	f.bag_cutoff_passed = true
	for bag in bags_for(f):
		var here: bool = bag.leg_index == bag.legs.size() - 1
		if (here and bag.state in ["ready_for_flight", "loading", "on_aircraft"]) or not bag.missed_flight_id.is_empty(): continue
		_flag(bag, f, bag.state if here else "on_inbound_aircraft", now)
		if bag.state == "created": _end_missed(bag)


## Gate closed and cutoff passed: bags of passengers not aboard are not flown.
## Queued ones are held; loaded ones are offloaded (loader time), then held.
func finalize(f: AirportFlight, now: int) -> void:
	f.bag_load_finalized = true
	f.bag_finalized_tick = now
	for bag in bags_for(f):
		var p: Passenger = airport.passengers[str(bag.passenger_id)]
		if p.current_flight_id == f.id and p.airport_state in ["boarding", "on_aircraft"]: continue
		# A transfer bag still on its inbound aircraft is not in this hold.
		var state: String = bag.state if bag.leg_index == bag.legs.size() - 1 else "inbound"
		match state:
			"ready_for_flight":
				f.bag_load_queue.erase(bag.id)
				_flag(bag, f, REASON_NOT_BOARDED, now)
				_end_missed(bag)
			"on_aircraft":
				_flag(bag, f, REASON_NOT_BOARDED, now)
				f.bag_load_queue.append("-" + bag.id)
			"loading":
				_flag(bag, f, REASON_NOT_BOARDED, now)
			_:
				if bag.missed_flight_id.is_empty(): _flag(bag, f, REASON_NOT_BOARDED, now)
				elif bag.missed_flight_id == f.id and bag.missed_reason != REASON_NOT_BOARDED:
					# Late at the cutoff, but its passenger did not fly either:
					# the passenger decides (V1), so the bag is held, not missed.
					f.bags_missed -= 1
					_flag(bag, f, REASON_NOT_BOARDED, now)
					if bag.state in ["missed_flight", "missed_connection"]: _end_missed(bag)
	events.record(now, "BAG_LOAD_FINALIZED", f.id, {"loaded": f.bags_loaded, "missed": f.bags_missed, "held": f.bags_held})
	_load_next(f, now)


func load_done(f: AirportFlight) -> bool:
	return f.bag_load_finalized and f.bag_loader_current.is_empty() and f.bag_load_queue.is_empty()


## At takeoff: everything still in the hold flies.
func depart(f: AirportFlight) -> void:
	for bag in bags_for(f):
		if bag.state == "on_aircraft" and bag.current_flight_id == f.id: bag.state = "departed"


func _flag(bag: AirportBag, f: AirportFlight, reason: String, now: int) -> void:
	bag.missed_flight_id = f.id
	bag.missed_reason = reason
	if reason == REASON_NOT_BOARDED: f.bags_held += 1
	else: f.bags_missed += 1
	events.record(now, "BAG_HELD" if reason == REASON_NOT_BOARDED else "BAG_MISSED", f.id, {"bag_id": bag.id, "passenger_id": bag.passenger_id, "reason": reason})


func _end_missed(bag: AirportBag) -> void:
	bag.stage = ""
	if bag.missed_reason == REASON_NOT_BOARDED: bag.state = "held"
	else: bag.state = "missed_connection" if bag.kind == "transfer" else "missed_flight"


func _rates(f: AirportFlight) -> Dictionary:
	var rates: Dictionary = config.get("aircraft", {}).duplicate()
	var aircraft: AirportAircraft = airport.aircraft.get(f.aircraft_id)
	if aircraft != null: rates.merge(config.get("aircraft_types", {}).get(aircraft.aircraft_type_id, {}), true)
	rates.merge(f.baggage_overrides, true)
	return rates


# --- reclaim -----------------------------------------------------------------

func all_at_reclaim(p: Passenger) -> bool:
	for id in p.checked_bag_ids:
		if airport.bags[id].state != "at_reclaim": return false
	return true


func collect(p: Passenger, now: int) -> void:
	for id in p.checked_bag_ids:
		var bag: AirportBag = airport.bags[id]
		bag.state = "collected"
		bag.collected_tick = now


# --- queries -----------------------------------------------------------------

## Bags that should fly on flight f: its passengers' bags whose last leg is f.
func bags_for(f: AirportFlight) -> Array:
	var out: Array = []
	for id in f.passenger_ids:
		for bag_id in airport.passengers[str(id)].checked_bag_ids:
			var bag: AirportBag = airport.bags[bag_id]
			if bag.legs[-1] == f.id: out.append(bag)
	return out


## A readable status line for a bag.
func describe(bag: AirportBag) -> String:
	var flight := func(id: String) -> String: return airport.flights[id].flight_number
	# Flagged at the cutoff while still moving: the outcome is already decided.
	if not bag.missed_flight_id.is_empty() and not bag.state in ["missed_flight", "missed_connection", "held"]:
		if bag.missed_reason == REASON_NOT_BOARDED: return "Held: passenger not on %s" % flight.call(bag.missed_flight_id)
		return "%s %s (still in processing)" % ["MISSED CONNECTION to" if bag.kind == "transfer" else "MISSED", flight.call(bag.missed_flight_id)]
	match bag.state:
		"created": return "Not checked in yet"
		"in_transit": return {"outbound_sortation": "To outbound sortation", "transfer_sortation": "To transfer sorting", "reclaim": "On its way to reclaim"}.get(bag.stage, "In transit")
		"queued", "sorting": return {"outbound_sortation": "Outbound sortation", "transfer_sortation": "Transfer sorting", "reclaim": "Reclaim belt"}.get(bag.stage, bag.stage) + (" (queued)" if bag.state == "queued" else "")
		"ready_for_flight": return "Ready for %s" % flight.call(bag.current_flight_id)
		"loading": return "Loading onto %s" % flight.call(bag.current_flight_id)
		"on_aircraft": return "On %s" % flight.call(bag.current_flight_id)
		"unloading": return "Being unloaded from %s" % flight.call(bag.current_flight_id)
		"departed": return "Departed on %s" % flight.call(bag.current_flight_id)
		"at_reclaim": return "On the reclaim belt"
		"collected": return "Collected"
		"missed_flight": return "MISSED %s" % flight.call(bag.missed_flight_id)
		"missed_connection": return "MISSED CONNECTION to %s" % flight.call(bag.missed_flight_id)
		"held": return "Held: passenger not on %s" % flight.call(bag.missed_flight_id)
	return bag.state


# --- event heap ----------------------------------------------------------------

func _schedule(bag: AirportBag, tick: int, kind: String, slot := -1) -> void:
	var event := {"tick": tick, "sequence": sequence, "bag_id": bag.id, "kind": kind, "slot": slot}
	sequence += 1
	pending.append(event)
	var index := pending.size() - 1
	while index > 0:
		var parent := (index - 1) / 2
		if not _before(pending[index], pending[parent]): break
		var swap = pending[parent]
		pending[parent] = pending[index]
		pending[index] = swap
		index = parent


func _before(a: Dictionary, b: Dictionary) -> bool:
	return int(a.tick) < int(b.tick) or (int(a.tick) == int(b.tick) and int(a.sequence) < int(b.sequence))


func _pop() -> Dictionary:
	var first: Dictionary = pending[0]
	var last: Dictionary = pending.pop_back()
	if pending.is_empty(): return first
	pending[0] = last
	var index := 0
	while index * 2 + 1 < pending.size():
		var child := index * 2 + 1
		if child + 1 < pending.size() and _before(pending[child + 1], pending[child]): child += 1
		if not _before(pending[child], pending[index]): break
		var swap = pending[index]
		pending[index] = pending[child]
		pending[child] = swap
		index = child
	return first


# --- persistence ---------------------------------------------------------------

func snapshot() -> Dictionary:
	var out_stages := {}
	for id in stages: out_stages[id] = {"queue": stages[id].queue.duplicate(), "busy": stages[id].busy.duplicate()}
	return {"pending": pending.duplicate(true), "sequence": sequence, "stages": out_stages}


func restore(data: Dictionary) -> void:
	pending = data.pending.duplicate(true)
	sequence = int(data.sequence)
	for id in data.stages:
		stages[id].queue = data.stages[id].queue.duplicate()
		stages[id].busy = data.stages[id].busy.duplicate()


## Cross-check saved bags, stage queues, the event heap and flight loaders.
static func valid_snapshot(data: Dictionary) -> bool:
	var state: Dictionary = data.airport
	var system = data.get("baggage")
	var settings = data.scenario.get("baggage", {})
	if not system is Dictionary or not settings is Dictionary: return false
	if settings.is_empty(): return state.bags.is_empty()
	if not system.get("pending") is Array or not system.get("sequence") is int or not system.get("stages") is Dictionary: return false
	var where := {}
	for id in settings.get("stages", {}):
		var s = system.stages.get(id)
		if not s is Dictionary or not s.get("queue") is Array or not s.get("busy") is Dictionary: return false
		for bag_id in s.queue:
			if where.has(bag_id): return false
			where[bag_id] = "queued:" + id
		for slot in s.busy:
			if not slot.is_valid_int() or int(slot) < 0 or int(slot) >= int(settings.stages[id].servers): return false
			if where.has(s.busy[slot]): return false
			where[s.busy[slot]] = "sorting:" + id
	var scheduled := {}
	for i in system.pending.size():
		var e = system.pending[i]
		if not e is Dictionary or not e.get("tick") is int or not e.get("sequence") is int or not e.get("bag_id") is String: return false
		if int(e.tick) <= int(data.clock.tick) or int(e.sequence) >= int(system.sequence) or scheduled.has(e.bag_id): return false
		scheduled[e.bag_id] = e.kind
		if i > 0:
			var parent: Dictionary = system.pending[(i - 1) / 2]
			if int(e.tick) < int(parent.tick) or (e.tick == parent.tick and int(e.sequence) < int(parent.sequence)): return false
	var loaders := {}
	for fid in state.flights:
		var f: Dictionary = state.flights[fid]
		for op in f.bag_load_queue:
			if not op is String or loaders.has(op): return false
			loaders[op] = fid
		if not f.bag_loader_current.is_empty():
			if loaders.has(f.bag_loader_current): return false
			loaders[f.bag_loader_current] = fid
	var owned := 0
	for key in state.passengers:
		for bag_id in state.passengers[key].checked_bag_ids:
			var bag = state.bags.get(bag_id)
			if not AirportSimulation._entity_shape(bag, AirportBag.new()) or bag.id != bag_id or str(bag.passenger_id) != key: return false
			owned += 1
			if not bag.state in AirportBag.STATES or not bag.legs is Array or bag.legs.is_empty() or bag.leg_index < 0 or bag.leg_index >= bag.legs.size(): return false
			if bag.current_flight_id != bag.legs[bag.leg_index] or not state.flights.has(bag.current_flight_id): return false
			# Each state has exactly the bookkeeping it needs, and no other.
			var expected := ""
			match bag.state:
				"in_transit": expected = "arrive"
				"sorting": expected = "sorted"
				"unloading": expected = "unloaded"
				"loading": expected = "loaded"
			var offloading: bool = loaders.get("-" + bag_id) != null and state.flights[loaders["-" + bag_id]].bag_loader_current == "-" + bag_id
			if offloading: expected = "offloaded"
			if scheduled.get(bag_id, "") != expected: return false
			if bag.state == "queued" and where.get(bag_id) != "queued:" + bag.stage: return false
			if bag.state == "sorting" and where.get(bag_id) != "sorting:" + bag.stage: return false
			if not bag.state in ["queued", "sorting"] and where.has(bag_id): return false
			if bag.state == "loading" and state.flights[bag.current_flight_id].bag_loader_current != bag_id: return false
			if loaders.has(bag_id) and not bag.state in ["ready_for_flight", "loading"]: return false
	return owned == state.bags.size()
