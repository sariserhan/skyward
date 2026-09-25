class_name CareerProgress
extends RefCounted
## M13 career progression: chapters of objectives that are predicates on real
## state, and the operational story of a settled day. Nothing here changes the
## simulation; it reads the finished day and the career.
##
## Objectives come from `career.chapters` in the scenario: each chapter has one
## primary objective and a few optional ones, plus one milestone for the whole
## career. They are evaluated at events only (day settlement, construction),
## never per tick. Day objectives read the settled report; state objectives
## (built gates, lanes, runway length, accepted requests) read the career.

const DAY_KINDS := ["departures_min", "mean_delay_max", "net_min", "missed_connections_max", "passengers_min", "all_contracts_passed",
	"relationship_min_all", "relationship_min_any", "widebody_departed", "taxi_wait_max", "request_accepted"]
const STATE_KINDS := ["gates_min", "lanes_min", "runway_length_min", "wide_gates_min"]


static func chapters(base: Dictionary) -> Array:
	return base.get("career", {}).get("chapters", [])


static func milestone(base: Dictionary) -> Dictionary:
	return base.get("career", {}).get("milestone", {})


static func fresh() -> Dictionary:
	return {"chapter": 0, "done": {}, "milestone_day": 0, "results": [], "completed_chapters": []}


## The active chapter (or {} once every chapter is done).
static func active(career) -> Dictionary:
	var list := chapters(career.base)
	var i := int(career.progress.get("chapter", 0))
	return list[i] if i < list.size() else {}


## Does one objective hold? {met, value, target} in player words.
static func check(obj: Dictionary, career, report: Dictionary) -> Dictionary:
	var kind: String = obj.get("kind", "")
	var story: Dictionary = report.get("story", {})
	match kind:
		"all":
			var met := true
			var values: Array = []
			for part in obj.get("of", []):
				var r := check(part, career, report)
				met = met and r.met
				values.append(r.value)
			return {"met": met and not report.is_empty(), "value": " · ".join(values), "target": ""}
		"departures_min":
			if report.is_empty(): return _no()
			return _cmp(int(report.flights) >= int(obj.min), "%d departures" % int(report.flights), "≥ %d" % int(obj.min))
		"passengers_min":
			if report.is_empty(): return _no()
			return _cmp(int(report.passengers) >= int(obj.min), "%d passengers" % int(report.passengers), "≥ %d" % int(obj.min))
		"mean_delay_max":
			if report.is_empty(): return _no()
			return _cmp(float(report.mean_delay_min) <= float(obj.max), "%.1f min" % float(report.mean_delay_min), "≤ %.1f min" % float(obj.max))
		"net_min":
			if report.is_empty(): return _no()
			return _cmp(int(report.net_cents) >= int(obj.min), AirportEconomy.money(int(report.net_cents), true), "≥ " + AirportEconomy.money(int(obj.min)))
		"missed_connections_max":
			if report.is_empty(): return _no()
			return _cmp(int(report.missed_connections) <= int(obj.max), "%d missed" % int(report.missed_connections), "≤ %d" % int(obj.max))
		"all_contracts_passed":
			if report.is_empty(): return _no()
			var passed := 0
			var total := 0
			for airline in report.contracts:
				if str(report.contracts[airline].status) in ["NONE", "PENDING"]: continue
				total += 1
				if report.contracts[airline].status == "PASSED": passed += 1
			return _cmp(total > 0 and passed == total, "%d of %d passed" % [passed, total], "all")
		"relationship_min_all", "relationship_min_any":
			if report.is_empty(): return _no()
			var lowest := 101
			var highest := -1
			for airline in report.contracts:
				lowest = mini(lowest, int(report.contracts[airline].relationship))
				highest = maxi(highest, int(report.contracts[airline].relationship))
			var value := lowest if kind == "relationship_min_all" else highest
			return _cmp(value >= int(obj.min), "%s %d" % ["lowest" if kind == "relationship_min_all" else "best", value], "≥ %d" % int(obj.min))
		"widebody_departed":
			if report.is_empty(): return _no()
			return _cmp(int(story.get("widebody_departed", 0)) >= 1, "%d widebody departures" % int(story.get("widebody_departed", 0)), "≥ 1")
		"taxi_wait_max":
			if report.is_empty(): return _no()
			var minutes := int(story.get("taxi_wait_ticks", 0)) / 600.0
			return _cmp(minutes <= float(obj.max), "%.1f min" % minutes, "≤ %.1f min" % float(obj.max))
		"request_accepted":
			var n := 0
			for id in career.request_status:
				if career.request_status[id] in ["accepted", "activated"]: n += 1
			return _cmp(n >= 1, "%d accepted" % n, "≥ 1")
		"gates_min":
			var gates: int = career.layout.built_gate_ids().size()
			return _cmp(gates >= int(obj.min), "%d gates" % gates, "≥ %d" % int(obj.min))
		"wide_gates_min":
			var wide: int = career.layout.count("gate_wide")
			return _cmp(wide >= int(obj.min), "%d widebody gates" % wide, "≥ %d" % int(obj.min))
		"lanes_min":
			var lanes: int = career.layout.count("security_lane")
			return _cmp(lanes >= int(obj.min), "%d lanes" % lanes, "≥ %d" % int(obj.min))
		"runway_length_min":
			var longest := 0
			if career.base.has("airside"):
				for r in career.layout.current_airside().runways:
					if str(r.get("status", "open")) == "open": longest = maxi(longest, int(r.length_m))
			return _cmp(longest >= int(obj.min), "longest %d m" % longest, "≥ %d m" % int(obj.min))
	return _no()


static func _cmp(met: bool, value: String, target: String) -> Dictionary:
	return {"met": met, "value": value, "target": target}


static func _no() -> Dictionary:
	return {"met": false, "value": "—", "target": ""}


## After a day is settled: evaluate the active chapter against the report,
## record today's results (met or not, with actual vs target), complete
## objectives, advance the chapter when its primary is met, and check the
## milestone. Returns the chapters completed today.
static func advance(career, report: Dictionary) -> Array:
	var p: Dictionary = career.progress
	var results: Array = []
	var completed: Array = []
	var chapter := active(career)
	if not chapter.is_empty():
		for obj in [chapter.primary] + chapter.get("optional", []):
			var r := check(obj, career, report)
			var primary: bool = obj.id == chapter.primary.id
			if r.met and not p.done.has(obj.id): p.done[obj.id] = int(report.get("day", career.day))
			results.append({"id": obj.id, "text": obj.text, "primary": primary, "met": r.met, "done": p.done.has(obj.id), "value": r.value, "target": r.target})
		if p.done.has(chapter.primary.id):
			completed.append(chapter.id)
			p.completed_chapters.append(chapter.id)
			p.chapter = int(p.chapter) + 1
	var m := milestone(career.base)
	if not m.is_empty() and int(p.milestone_day) == 0 and check(m, career, report).met:
		p.milestone_day = int(report.get("day", career.day))
	p.results = results
	return completed


## Between days (after construction): state objectives of the active chapter
## that now hold are completed at once (the primary advances the chapter).
static func check_state(career) -> void:
	var p: Dictionary = career.progress
	var chapter := active(career)
	if chapter.is_empty(): return
	for obj in [chapter.primary] + chapter.get("optional", []):
		if not obj.get("kind", "") in STATE_KINDS or p.done.has(obj.id): continue
		if check(obj, career, {}).met: p.done[obj.id] = career.day
	if p.done.has(chapter.primary.id) and chapter.primary.get("kind", "") in STATE_KINDS:
		p.completed_chapters.append(chapter.id)
		p.chapter = int(p.chapter) + 1


## Valid saved progress for these chapters.
static func valid(p, base: Dictionary) -> bool:
	if not p is Dictionary: return false
	for key in ["chapter", "done", "milestone_day", "results", "completed_chapters"]:
		if not p.has(key): return false
	if not p.chapter is int or p.chapter < 0 or p.chapter > chapters(base).size(): return false
	if not p.done is Dictionary or not p.results is Array or not p.completed_chapters is Array or not p.milestone_day is int: return false
	var ids := {}
	for chapter in chapters(base):
		ids[chapter.primary.id] = true
		for obj in chapter.get("optional", []): ids[obj.id] = true
	for id in p.done:
		if not ids.has(id) or not p.done[id] is int: return false
	return true


# --- the day's story ---------------------------------------------------------------------

## What happened today, for the report and the Today summary: facts only.
static func story(sim: AirportSimulation) -> Dictionary:
	var grace := int(sim.config.get("airline_relations", {}).get("scoring", {}).get("on_time_grace_ticks", 1800))
	var late: Array = []
	var on_time := 0
	var widebody := 0
	var runway_queue := 0
	var taxi_wait := 0
	for f: AirportFlight in sim.flight_order:
		var d := maxi(0, f.actual_departure - f.scheduled_departure) if f.actual_departure >= 0 else 0
		if f.status == "departed" and d <= grace: on_time += 1
		if f.status == "departed" and sim.airport.aircraft[f.aircraft_id].required_gate_type == "wide": widebody += 1
		runway_queue += int(f.delay_reasons.get("runway_takeoff_queue", 0)) + int(f.delay_reasons.get("runway_landing_queue", 0))
		taxi_wait += f.taxi_in_wait_ticks + f.taxi_out_wait_ticks
		if d <= 0: continue
		var cause := ""
		var ticks := 0
		var keys: Array = f.departure_delay_breakdown.keys()
		keys.sort()
		for key in keys:
			if int(f.departure_delay_breakdown[key]) > ticks:
				cause = key
				ticks = int(f.departure_delay_breakdown[key])
		late.append({"id": f.id, "flight": f.flight_number, "late_ticks": d, "cause": cause, "cause_label": cause_label(sim, f, cause), "cause_ticks": ticks})
	late.sort_custom(func(a, b): return a.late_ticks > b.late_ticks or (a.late_ticks == b.late_ticks and a.id < b.id))
	# Resources: which flights waited, and for how long.
	var resources := {}
	if sim.resources.enabled():
		var m := sim.resources.metrics(sim.clock.tick, int(sim.config.start_tick))
		for type in sim.resources.order:
			resources[type] = {"label": str(m[type].label), "units": int(m[type].units), "utilization": snappedf(float(m[type].utilization), 0.01),
				"flights_waited": 0, "wait_ticks": 0, "max_wait_ticks": int(m[type].max_wait_ticks)}
		var waited := {}
		var ids: Array = sim.airport.turnaround_tasks.keys()
		ids.sort()
		for id in ids:
			var t: TurnaroundTask = sim.airport.turnaround_tasks[id]
			if t.resource.is_empty() or t.resource_wait_ticks <= 0 or not resources.has(t.resource): continue
			resources[t.resource].wait_ticks += t.resource_wait_ticks
			waited["%s|%s" % [t.resource, t.flight_id]] = true
		for key in waited: resources[key.get_slice("|", 0)].flights_waited += 1
	# Security, per checkpoint.
	var security := {}
	for cp: SecurityCheckpoint in sim.airport.security_checkpoints.values():
		security[cp.id] = {"peak_queue": cp.peak_queue, "max_wait_ticks": cp.max_wait_ticks, "average_wait_ticks": cp.total_wait_ticks / maxi(1, cp.processed),
			"open_lanes": cp.open_lanes, "physical_lanes": cp.max_lanes, "staff": cp.staff}
	# Baggage stages.
	var baggage := {}
	for id in sim.baggage.stages:
		baggage[id] = {"peak_queue": int(sim.baggage.stages[id].get("peak_queue", 0)), "servers": int(sim.baggage.stages[id].servers)}
	var bags := sim.baggage_metrics()
	var transfers: int = int(bags.transfer_made) + int(bags.transfer_missed)
	# Missed connections and the inbound flight that caused most of them.
	var missed_by := {}
	var made := 0
	var missed := 0
	for p: Passenger in sim.airport.passengers.values():
		if p.journey_direction != "connecting": continue
		if p.connection_status == "made": made += 1
		elif p.connection_status == "missed":
			missed += 1
			var inbound: String = p.itinerary_legs[0]
			missed_by[inbound] = int(missed_by.get(inbound, 0)) + 1
	var worst_inbound := {}
	var keys: Array = missed_by.keys()
	keys.sort()
	for id in keys:
		if worst_inbound.is_empty() or int(missed_by[id]) > int(worst_inbound.count):
			var f: AirportFlight = sim.airport.flights[id]
			worst_inbound = {"id": id, "flight": f.flight_number, "count": int(missed_by[id]),
				"arrival_late_ticks": maxi(0, f.actual_arrival - f.scheduled_arrival) if f.actual_arrival >= 0 else 0}
	# The taxiways aircraft waited for most.
	var taxiways: Array = []
	if sim.airside.enabled():
		var ids: Array = sim.airside.edge_state.keys()
		ids.sort()
		for id in ids:
			var w := int(sim.airside.edge_state[id].get("wait_ticks", 0))
			if w > 0: taxiways.append({"id": id, "wait_ticks": w})
		taxiways.sort_custom(func(a, b): return a.wait_ticks > b.wait_ticks or (a.wait_ticks == b.wait_ticks and a.id < b.id))
	# Contracts with their terms (actual vs target).
	var contracts := {}
	for airline in sim.airlines.airline_ids:
		var c: Dictionary = sim.airlines.evaluations[airline].contract
		var terms: Array = []
		for t in c.get("terms", []):
			terms.append({"label": t.label, "value": "—" if t.value == null else AirlineRelations._fmt(t.metric, float(t.value)), "target": str(t.get("target", "")), "status": t.status})
		contracts[airline] = {"label": c.label, "status": c.status, "terms": terms}
	return {"late": late.slice(0, 5), "late_count": late.size(), "on_time": on_time, "widebody_departed": widebody, "runway_queue_ticks": runway_queue,
		"taxi_wait_ticks": taxi_wait, "resources": resources, "security": security, "baggage": baggage,
		"transfer_bags": transfers, "transfer_bag_rate": -1.0 if transfers == 0 else snappedf(float(bags.transfer_made) / transfers, 0.001),
		"connections_made": made, "connections_missed": missed, "worst_inbound": worst_inbound, "taxiways": taxiways.slice(0, 3), "contracts": contracts}


## A delay cause in player words.
static func cause_label(sim: AirportSimulation, f: AirportFlight, cause: String) -> String:
	if cause.begins_with("wait:"): return "waited for " + sim.resources.unit_name(cause.substr(5))
	var t: TurnaroundTask = sim.turnaround.task(f, cause)
	if t != null: return t.label.to_lower()
	return {"late_inbound": "late inbound aircraft", "passenger_hold": "held for passengers", "runway_takeoff_queue": "runway queue",
		"taxi_congestion": "taxi congestion", "gate_wait": "waited for a gate"}.get(cause, cause.replace("_", " "))
