class_name AirlineRelations
extends RefCounted
## Airlines as customers (M9). Each departed flight leaves a record of its real
## outcome; an airline's relationship is its own weighted reading of those
## records over the operating day, plus explicit adjustments (contract result,
## a declined request). Contracts are data-driven threshold terms. Everything is
## evaluated when a flight departs or the player answers a request, never per
## tick, and nothing is random.

const DIMENSIONS := ["punctuality", "connections", "baggage", "turnaround", "gates"]
const BANDS := [[90, "EXCELLENT"], [75, "GOOD"], [55, "ACCEPTABLE"], [35, "POOR"], [0, "CRITICAL"]]
const REQUEST_STATES := ["", "offered", "accepted", "declined"]

var airport: AirportState
var events: AirportEvents
var config: Dictionary = {}
## Airlines operating today, in name order (stable across saves).
var airline_ids: Array = []
## Airline -> flights scheduled today (fixed at setup).
var scheduled: Dictionary = {}
## Flight id -> outcome record (saved).
var records: Dictionary = {}
## Airline -> {"contract": live or final status, "final": bool, "adjustments":
## [[reason, points]], "request": state, "request_tick": tick} (saved).
var state: Dictionary = {}
## Airline -> latest evaluation (derived; rebuilt on restore).
var evaluations: Dictionary = {}
## M10: called once per airline when its contract settles at the day's end:
## (airline, contract template with "id", passed, tick).
var on_settle: Callable


func bind(airport_state: AirportState, event_bus: AirportEvents, settings: Dictionary, flights: Array) -> void:
	airport = airport_state
	events = event_bus
	config = settings.duplicate(true)
	scheduled = {}
	for f: AirportFlight in flights:
		if config.get("profiles", {}).has(f.airline_id): scheduled[f.airline_id] = int(scheduled.get(f.airline_id, 0)) + 1
	# Only airlines operating today are judged; every profile keeps its state.
	airline_ids = scheduled.keys()
	airline_ids.sort()
	records = {}
	state = {}
	for id in config.get("profiles", {}): state[id] = {"contract": "PENDING", "final": false, "adjustments": [], "request": "", "request_tick": -1}
	evaluations = {}
	for id in airline_ids: evaluations[id] = evaluate(id)


func enabled() -> bool:
	return not airline_ids.is_empty()


func profile(airline: String) -> Dictionary:
	return config.get("profiles", {}).get(airline, {})


# --- recording ----------------------------------------------------------------

## A flight departed: keep its outcome and re-evaluate every airline it
## touched (its own, and those of connectors and transfer bags aboard).
func record(f: AirportFlight, rec: Dictionary, now: int, gate_free: Callable) -> void:
	if not enabled(): return
	records[f.id] = rec
	events.record(now, "AIRLINE_FLIGHT_EVALUATED", f.id, {"airline": f.airline_id, "late_ticks": rec.late_ticks})
	# The operating day ends with its last departure: contracts are settled
	# together, once every record that could touch them is in.
	var day_over := records.size() >= _total_scheduled()
	var touched := {f.airline_id: true}
	for airline in rec.connections: touched[airline] = true
	for airline in rec.transfer_bags: touched[airline] = true
	for airline in airline_ids:
		if touched.has(airline) or day_over: _refresh(airline, now, gate_free, day_over)


func _total_scheduled() -> int:
	var total := 0
	for airline in scheduled: total += int(scheduled[airline])
	return total


func _refresh(airline: String, now: int, gate_free: Callable, day_over: bool) -> void:
	var s: Dictionary = state[airline]
	var e := evaluate(airline)
	if day_over and not s.final:
		s.final = true
		var passed: bool = e.contract.status != "FAILING"
		var points := int(config.get("scoring", {}).get("contract_passed_points" if passed else "contract_failed_points", 0))
		s.adjustments.append(["contract " + ("passed" if passed else "failed"), points])
		events.record(now, "CONTRACT_" + ("PASSED" if passed else "FAILED"), "", {"airline": airline, "contract": e.contract.id})
		if on_settle.is_valid() and not e.contract.id.is_empty():
			var template: Dictionary = config.get("contracts", {}).get(e.contract.id, {}).duplicate()
			template["id"] = e.contract.id
			on_settle.call(airline, template, passed, now)
		e = evaluate(airline)
	if e.contract.status != s.contract:
		events.record(now, "CONTRACT_STATUS_CHANGED", "", {"airline": airline, "from": s.contract, "to": e.contract.status})
		s.contract = e.contract.status
	if s.request == "" and not s.final and _request_ready(airline, e, gate_free):
		s.request = "offered"
		s.request_tick = now
		s["request_id"] = str(request_of(airline).get("id", ""))
		events.record(now, "AIRLINE_REQUEST_OFFERED", "", {"airline": airline, "request": s.request_id, "flights": request_of(airline).get("flights", []).size()})
		e = evaluate(airline)
	evaluations[airline] = e


## Player answers an offered request. Accepting commits the proposed flights
## to the next operating day's schedule; declining costs a little goodwill.
func answer_request(airline: String, accept: bool, now: int) -> bool:
	if not state.has(airline) or state[airline].request != "offered": return false
	var s: Dictionary = state[airline]
	s.request = "accepted" if accept else "declined"
	s.request_tick = now
	if not accept: s.adjustments.append(["request declined", int(config.get("scoring", {}).get("request_declined_points", 0))])
	events.record(now, "AIRLINE_REQUEST_" + ("ACCEPTED" if accept else "DECLINED"), "", {"airline": airline})
	evaluations[airline] = evaluate(airline)
	return true


## The request on offer today: a single `request`, or the first of the
## `requests` tiers (M10's career passes the next undecided tier as `request`).
func request_of(airline: String) -> Dictionary:
	var p := profile(airline)
	if p.has("request"): return p.request
	var tiers: Array = p.get("requests", [])
	return {} if tiers.is_empty() else tiers[0]


func _request_ready(airline: String, e: Dictionary, gate_free: Callable) -> bool:
	var request: Dictionary = request_of(airline)
	if request.is_empty(): return false
	if e.relationship < int(request.get("min_relationship", 101)): return false
	if e.metrics.flights < int(request.get("min_flights_operated", 0)): return false
	if e.contract.status in ["FAILING", "FAILED"]: return false
	for flight in request.get("flights", []):
		if not gate_free.call(flight): return false
	return true


# --- evaluation -----------------------------------------------------------------

## Metrics, dimension scores, day score, relationship, contract: everything the
## airline detail shows. Pure function of the records and saved state.
func evaluate(airline: String) -> Dictionary:
	var scoring: Dictionary = config.get("scoring", {})
	var m := metrics(airline)
	var weights: Dictionary = profile(airline).get("weights", {})
	var dims := {}
	var total := 0.0
	var weight_sum := 0.0
	for dim in DIMENSIONS:
		var value = _dimension(dim, m)
		dims[dim] = {"score": value, "weight": float(weights.get(dim, 0))}
		if value == null or float(weights.get(dim, 0)) <= 0: continue
		total += float(value) * float(weights[dim])
		weight_sum += float(weights[dim])
	var start := int(profile(airline).get("starting_relationship", 70))
	var k := float(scoring.get("credibility_flights", 3))
	var day = null if weight_sum <= 0 or m.flights == 0 else total / weight_sum
	var relationship: float = float(start) if day == null else (start * k + float(day) * m.flights) / (k + m.flights)
	var adjustment := 0
	for item in state.get(airline, {}).get("adjustments", []): adjustment += int(item[1])
	var score := clampi(roundi(relationship) + adjustment, 0, 100)
	return {"airline": airline, "metrics": m, "dimensions": dims, "day_score": day, "start": start, "adjustment": adjustment,
		"relationship": score, "band": band(score), "contract": contract_status(airline, m)}


static func band(score: int) -> String:
	for entry in BANDS:
		if score >= entry[0]: return entry[1]
	return "CRITICAL"


## Airline totals over today's records.
func metrics(airline: String) -> Dictionary:
	var grace := int(config.get("scoring", {}).get("on_time_grace_ticks", 1800))
	var m := {"flights": 0, "scheduled": int(scheduled.get(airline, 0)), "on_time": 0, "late_over_5": 0, "delay_ticks": 0,
		"turnaround_delay_ticks": 0, "resource_delay_ticks": 0, "resource_wait_ticks": 0, "baggage_delay_ticks": 0, "hold_ticks": 0,
		"connections_made": 0, "connections_missed": 0, "transfer_bags_made": 0, "transfer_bags_missed": 0, "bags_checked": 0,
		"reclaim_wait_ticks": 0, "reclaim_waits": 0, "preferred_gate": 0, "flight_ids": []}
	var ids: Array = records.keys()
	ids.sort()
	for id in ids:
		var rec: Dictionary = records[id]
		var c: Array = rec.connections.get(airline, [0, 0])
		m.connections_made += int(c[0])
		m.connections_missed += int(c[1])
		var b: Array = rec.transfer_bags.get(airline, [0, 0])
		m.transfer_bags_made += int(b[0])
		m.transfer_bags_missed += int(b[1])
		if rec.airline != airline: continue
		m.flights += 1
		m.flight_ids.append(id)
		if int(rec.late_ticks) <= grace: m.on_time += 1
		if int(rec.late_ticks) > 3000: m.late_over_5 += 1
		for key in ["delay_ticks", "turnaround_delay_ticks", "resource_delay_ticks", "resource_wait_ticks", "baggage_delay_ticks", "hold_ticks", "bags_checked", "reclaim_wait_ticks", "reclaim_waits"]:
			m[key] += int(rec[key if key != "delay_ticks" else "late_ticks"])
		if rec.preferred_gate: m.preferred_gate += 1
	var n := maxi(1, m.flights)
	m["on_time_rate"] = null if m.flights == 0 else float(m.on_time) / m.flights
	m["mean_delay_min"] = null if m.flights == 0 else m.delay_ticks / 600.0 / n
	m["turnaround_delay_min"] = null if m.flights == 0 else m.turnaround_delay_ticks / 600.0 / n
	m["resource_delay_min"] = null if m.flights == 0 else m.resource_delay_ticks / 600.0 / n
	m["baggage_delay_min"] = null if m.flights == 0 else m.baggage_delay_ticks / 600.0 / n
	var connections: int = m.connections_made + m.connections_missed
	m["connection_rate"] = null if connections == 0 else float(m.connections_made) / connections
	var bags: int = m.transfer_bags_made + m.transfer_bags_missed
	m["transfer_bag_rate"] = null if bags == 0 else float(m.transfer_bags_made) / bags
	m["mean_reclaim_min"] = null if m.reclaim_waits == 0 else m.reclaim_wait_ticks / 600.0 / m.reclaim_waits
	m["preferred_gate_rate"] = null if m.flights == 0 else float(m.preferred_gate) / m.flights
	return m


## One dimension's 0–100 score, or null when there is nothing to judge yet.
## The formulas are the documented ones (D-042); inputs are shown in the UI.
static func _dimension(dim: String, m: Dictionary):
	match dim:
		"punctuality":
			if m.on_time_rate == null: return null
			return clampf((100.0 * m.on_time_rate + clampf(100.0 - 8.0 * m.mean_delay_min, 0.0, 100.0)) / 2.0, 0.0, 100.0)
		"connections":
			if m.connection_rate == null: return null
			return clampf(100.0 - 10.0 * 100.0 * (1.0 - m.connection_rate), 0.0, 100.0)
		"baggage":
			if m.flights == 0: return null
			var missed: float = 0.0 if m.transfer_bag_rate == null else 100.0 * (1.0 - m.transfer_bag_rate)
			var reclaim: float = 0.0 if m.mean_reclaim_min == null else maxf(0.0, m.mean_reclaim_min - 5.0)
			return clampf(100.0 - 10.0 * missed - 5.0 * m.baggage_delay_min - 2.0 * reclaim, 0.0, 100.0)
		"turnaround":
			if m.flights == 0: return null
			return clampf(100.0 - 10.0 * m.turnaround_delay_min, 0.0, 100.0)
		"gates":
			if m.preferred_gate_rate == null: return null
			return 100.0 * m.preferred_gate_rate
	return null


# --- contracts ------------------------------------------------------------------

## Live contract status from its terms: FAILING if any term is breached, AT RISK
## if any is within its risk band, PASSING otherwise; PENDING before any data.
## Once the airline's day is over: PASSED or FAILED.
func contract_status(airline: String, m: Dictionary) -> Dictionary:
	var id: String = profile(airline).get("contract", "")
	var template: Dictionary = config.get("contracts", {}).get(id, {})
	var out := {"id": id, "label": str(template.get("label", "")), "status": "NONE", "terms": []}
	if template.is_empty(): return out
	var worst := 0
	var measured := false
	for term in template.get("terms", []):
		var value = m.get(term.metric)
		var t := {"metric": term.metric, "label": str(term.get("label", term.metric)), "value": value, "status": "NO DATA"}
		if value != null:
			measured = true
			var risk := float(term.get("risk", 0))
			if term.has("min"):
				t["target"] = "≥ " + _fmt(term.metric, float(term.min))
				t.status = "FAILING" if float(value) < float(term.min) else ("AT RISK" if float(value) < float(term.min) + risk else "PASSING")
			else:
				t["target"] = "≤ " + _fmt(term.metric, float(term.max))
				t.status = "FAILING" if float(value) > float(term.max) else ("AT RISK" if float(value) > float(term.max) - risk else "PASSING")
			worst = maxi(worst, ["PASSING", "AT RISK", "FAILING"].find(t.status))
		out.terms.append(t)
	out.status = "PENDING" if not measured else ["PASSING", "AT RISK", "FAILING"][worst]
	if state.get(airline, {}).get("final", false): out.status = "FAILED" if out.status == "FAILING" else "PASSED"
	return out


static func _fmt(metric: String, value: float) -> String:
	if metric.ends_with("_rate"): return "%d%%" % roundi(value * 100.0)
	if metric.ends_with("_min"): return "%.1f min" % value
	return str(roundi(value))


# --- persistence ------------------------------------------------------------------

func snapshot() -> Dictionary:
	return {"records": records.duplicate(true), "state": state.duplicate(true)}


func restore(data: Dictionary) -> void:
	records = data.records.duplicate(true)
	state = data.state.duplicate(true)
	for id in airline_ids: evaluations[id] = evaluate(id)


const RECORD_KEYS := ["airline", "late_ticks", "turnaround_delay_ticks", "resource_delay_ticks", "resource_wait_ticks", "baggage_delay_ticks",
	"hold_ticks", "bags_checked", "reclaim_wait_ticks", "reclaim_waits", "preferred_gate", "connections", "transfer_bags", "cause", "cause_ticks", "served_first"]

## Records only for departed flights of known airlines, known states only.
static func valid_snapshot(data: Dictionary) -> bool:
	var settings = data.scenario.get("airline_relations", {})
	var system = data.get("airline_relations")
	if not settings is Dictionary or not system is Dictionary: return false
	if not system.get("records") is Dictionary or not system.get("state") is Dictionary: return false
	var profiles: Dictionary = settings.get("profiles", {})
	if system.state.size() != profiles.size(): return false
	for id in system.state:
		var s = system.state[id]
		if not profiles.has(id) or not s is Dictionary or not s.get("adjustments") is Array or not s.get("final") is bool: return false
		if not s.get("request") in REQUEST_STATES or not s.get("request_tick") is int: return false
		if not s.get("contract") in ["PENDING", "NONE", "PASSING", "AT RISK", "FAILING", "PASSED", "FAILED"]: return false
	for fid in system.records:
		var f = data.airport.flights.get(fid)
		var rec = system.records[fid]
		if f == null or f.status != "departed" or not rec is Dictionary: return false
		for key in RECORD_KEYS:
			if not rec.has(key): return false
		if rec.airline != f.airline_id or not rec.connections is Dictionary or not rec.transfer_bags is Dictionary: return false
	return true
