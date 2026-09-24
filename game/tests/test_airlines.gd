extends TestCase
## M9: airlines as customers. Relationships are each airline's weighted reading
## of real flight outcomes; contracts are data-driven terms; requests follow
## performance. See docs/m9-plan.md.


## Two airlines with opposite priorities over the same kind of outcomes.
## "HUB" cares about connections, "FAST" about punctuality and turnaround.
func settings() -> Dictionary:
	return {
		"scoring": {"on_time_grace_ticks": 1800, "credibility_flights": 3, "contract_passed_points": 5, "contract_failed_points": -10, "request_declined_points": -3},
		"contracts": {
			"hub": {"label": "Hub", "terms": [{"metric": "connection_rate", "label": "Connections", "min": 0.95, "risk": 0.02}, {"metric": "mean_delay_min", "label": "Delay", "max": 8, "risk": 2}]},
			"fast": {"label": "Fast", "terms": [{"metric": "turnaround_delay_min", "label": "Turnaround", "max": 4, "risk": 1.5}]},
		},
		"profiles": {
			"HUB": {"starting_relationship": 70, "weights": {"punctuality": 20, "connections": 50, "baggage": 20, "turnaround": 10}, "contract": "hub",
				"request": {"min_relationship": 80, "min_flights_operated": 2, "flights": [{"flight_number": "HB 1", "aircraft_type": "A220", "scheduled_arrival": 0, "scheduled_departure": 1}]}},
			"FAST": {"starting_relationship": 70, "weights": {"punctuality": 50, "connections": 0, "baggage": 10, "turnaround": 40}, "contract": "fast"},
		},
	}


func flights(per_airline := 3) -> Array:
	var out: Array = []
	for airline in ["HUB", "FAST"]:
		for i in per_airline:
			var f := AirportFlight.new()
			f.id = "%s%d" % [airline, i]
			f.airline_id = airline
			out.append(f)
	return out


func relations(config := {}, per_airline := 3) -> AirlineRelations:
	var r := AirlineRelations.new()
	r.bind(AirportState.new(), AirportEvents.new(), config if not config.is_empty() else settings(), flights(per_airline))
	return r


## A departed flight's record, with sensible defaults.
func rec(airline: String, over := {}) -> Dictionary:
	var out := {"airline": airline, "late_ticks": 0, "turnaround_delay_ticks": 0, "resource_delay_ticks": 0, "resource_wait_ticks": 0,
		"baggage_delay_ticks": 0, "hold_ticks": 0, "bags_checked": 10, "reclaim_wait_ticks": 0, "reclaim_waits": 0, "preferred_gate": true,
		"connections": {}, "transfer_bags": {}, "cause": "", "cause_ticks": 0, "served_first": []}
	out.merge(over, true)
	return out


func depart(r: AirlineRelations, id: String, record: Dictionary, gate_free := true) -> void:
	var f := AirportFlight.new()
	f.id = id
	f.airline_id = record.airline
	r.record(f, record, 1000, func(_spec): return gate_free)


## Both airlines, one identical flight each, then score them.
func both(over := {}) -> AirlineRelations:
	var r := relations()
	depart(r, "HUB0", rec("HUB", over))
	depart(r, "FAST0", rec("FAST", over))
	return r


# --- weighting -------------------------------------------------------------------

func test_same_results_score_differently_by_airline_weights() -> void:
	var outcome := {"late_ticks": 6000, "connections": {"HUB": [18, 2], "FAST": [18, 2]}}
	var r := both(outcome)
	var hub: Dictionary = r.evaluations.HUB
	var fast: Dictionary = r.evaluations.FAST
	assert_eq(hub.dimensions.punctuality.score, fast.dimensions.punctuality.score, "identical inputs, identical dimension scores")
	assert_true(absf(hub.day_score - fast.day_score) > 5.0, "different weights, different verdicts: %.1f vs %.1f" % [hub.day_score, fast.day_score])


func test_late_flights_cost_punctuality_as_configured() -> void:
	var on_time := both()
	var late := both({"late_ticks": 6000})
	# Punctuality = mean(on-time %, 100 − 8 × mean delay min): 10 min late → (0 + 20) / 2.
	assert_eq(on_time.evaluations.FAST.dimensions.punctuality.score, 100.0)
	assert_eq(late.evaluations.FAST.dimensions.punctuality.score, 10.0)
	var drop_fast: float = on_time.evaluations.FAST.day_score - late.evaluations.FAST.day_score
	var drop_hub: float = on_time.evaluations.HUB.day_score - late.evaluations.HUB.day_score
	assert_true(drop_fast > drop_hub, "a punctuality-focused airline minds a late flight more (%.1f vs %.1f)" % [drop_fast, drop_hub])


func test_missed_connection_hurts_the_connection_airline_more() -> void:
	var clean := both({"connections": {"HUB": [20, 0], "FAST": [20, 0]}})
	var missed := both({"connections": {"HUB": [18, 2], "FAST": [18, 2]}})
	var drop_hub: float = clean.evaluations.HUB.day_score - missed.evaluations.HUB.day_score
	var drop_fast: float = clean.evaluations.FAST.day_score - missed.evaluations.FAST.day_score
	assert_true(drop_hub > 10.0 and drop_fast < 1.0, "hub drop %.1f, fast drop %.1f" % [drop_hub, drop_fast])


func test_missed_transfer_bag_hurts_baggage_evaluation() -> void:
	var clean := both({"transfer_bags": {"HUB": [20, 0]}})
	var missed := both({"transfer_bags": {"HUB": [19, 1]}})
	assert_eq(clean.evaluations.HUB.dimensions.baggage.score, 100.0)
	assert_true(absf(missed.evaluations.HUB.dimensions.baggage.score - 50.0) < 0.001, "5% missed × 10 points")
	assert_true(missed.evaluations.HUB.day_score < clean.evaluations.HUB.day_score)


func test_credibility_keeps_one_flight_from_swinging_the_relationship() -> void:
	var r := relations()
	depart(r, "FAST0", rec("FAST", {"late_ticks": 30000}))
	var after_one: int = r.evaluations.FAST.relationship
	assert_true(after_one > 40, "one disaster moves the relationship, it doesn't collapse it: %d" % after_one)
	assert_eq(after_one, roundi((70 * 3 + r.evaluations.FAST.day_score * 1) / 4.0), "documented blend")


# --- contracts -----------------------------------------------------------------------

func test_contract_passing_at_risk_failing() -> void:
	var passing := both({"connections": {"HUB": [99, 1]}})
	assert_eq(passing.evaluations.HUB.contract.status, "PASSING")
	var risk := both({"connections": {"HUB": [96, 4]}})
	assert_eq(risk.evaluations.HUB.contract.status, "AT RISK", "96% is within 2 points of 95%")
	var failing := both({"connections": {"HUB": [90, 10]}})
	assert_eq(failing.evaluations.HUB.contract.status, "FAILING")
	assert_eq(failing.evaluations.HUB.contract.terms[0].status, "FAILING")
	assert_eq(failing.evaluations.HUB.contract.terms[1].status, "PASSING", "each term judged on its own")


func test_contract_settles_when_the_day_ends() -> void:
	var r := relations({}, 1)
	depart(r, "HUB0", rec("HUB", {"connections": {"HUB": [90, 10]}}))
	assert_eq(r.evaluations.HUB.contract.status, "FAILING", "live until the day is over")
	depart(r, "FAST0", rec("FAST"))
	assert_eq(r.evaluations.HUB.contract.status, "FAILED")
	assert_eq(r.evaluations.FAST.contract.status, "PASSED")
	assert_eq(r.state.HUB.adjustments, [["contract failed", -10]])
	assert_eq(r.state.FAST.adjustments, [["contract passed", 5]])
	assert_eq(r.evaluations.HUB.adjustment, -10, "the failure is a visible, explained penalty")


# --- requests -----------------------------------------------------------------------

func test_strong_performance_unlocks_the_request() -> void:
	var r := relations()
	depart(r, "HUB0", rec("HUB", {"connections": {"HUB": [30, 0]}}))
	assert_eq(r.state.HUB.request, "", "not after one flight (needs 2 operated)")
	depart(r, "HUB1", rec("HUB", {"connections": {"HUB": [30, 0]}}))
	assert_eq(r.state.HUB.request, "offered")
	assert_true(r.answer_request("HUB", true, 2000))
	assert_eq(r.state.HUB.request, "accepted")
	assert_true(not r.answer_request("HUB", false, 2001), "answered once")


func test_weak_performance_or_no_gate_denies_the_request() -> void:
	var weak := relations()
	for i in 2: depart(weak, "HUB%d" % i, rec("HUB", {"late_ticks": 12000, "connections": {"HUB": [20, 5]}}))
	assert_eq(weak.state.HUB.request, "", "relationship too low, contract failing")
	var no_gate := relations()
	for i in 2:
		var f := AirportFlight.new()
		f.id = "HUB%d" % i
		f.airline_id = "HUB"
		no_gate.record(f, rec("HUB", {"connections": {"HUB": [30, 0]}}), 1000, func(_spec): return false)
	assert_eq(no_gate.state.HUB.request, "", "no compatible gate free for the new flights")
	assert_eq(weak.state.FAST.request, "", "an airline without a request never asks")


func test_declining_a_request_costs_goodwill() -> void:
	var r := relations()
	for i in 2: depart(r, "HUB%d" % i, rec("HUB", {"connections": {"HUB": [30, 0]}}))
	var before: int = r.evaluations.HUB.relationship
	assert_true(r.answer_request("HUB", false, 2000))
	assert_eq(r.evaluations.HUB.relationship, before - 3)


# --- data-driven -----------------------------------------------------------------------

func test_scoring_is_config_driven_not_airline_specific() -> void:
	# Swap the two airlines' profiles: the scores swap with them.
	var swapped := settings()
	var hub: Dictionary = swapped.profiles.HUB
	swapped.profiles.HUB = swapped.profiles.FAST
	swapped.profiles.FAST = hub
	var outcome := {"late_ticks": 6000, "connections": {"HUB": [18, 2], "FAST": [18, 2]}}
	var a := both(outcome)
	var b := relations(swapped)
	depart(b, "HUB0", rec("HUB", outcome))
	depart(b, "FAST0", rec("FAST", outcome))
	assert_eq(b.evaluations.HUB.day_score, a.evaluations.FAST.day_score)
	assert_eq(b.evaluations.FAST.day_score, a.evaluations.HUB.day_score)
	var source := FileAccess.get_file_as_string("res://scripts/airport/airline_relations.gd")
	for id in ['"GA"', '"SJ"', '"AW"', '"NS"']: assert_true(not source.contains(id), "no hard-coded airline " + id)


# --- real operations ------------------------------------------------------------------

func run_to_end(s: AirportSimulation) -> AirportSimulation:
	while s.clock.tick < 360000: s.step()
	return s


func test_resource_shortage_reaches_airline_evaluation() -> void:
	var calm := AirportSimulation.new()
	var config := AirportSimulation.load_config("res://configs/airports/riverdale_airline_conflict.json")
	config.resources.fuel_unit.units = 4
	calm.setup(config)
	run_to_end(calm)
	var short := AirportSimulation.new()
	short.setup(AirportSimulation.load_config("res://configs/airports/riverdale_airline_conflict.json"))
	run_to_end(short)
	var calm_sj: Dictionary = calm.airlines.evaluations.SJ
	var short_sj: Dictionary = short.airlines.evaluations.SJ
	assert_true(short_sj.metrics.resource_delay_min > calm_sj.metrics.resource_delay_min, "fuel waits appear in SunJet's turnaround")
	assert_true(short_sj.relationship < calm_sj.relationship, "and cost its relationship: %d vs %d" % [short_sj.relationship, calm_sj.relationship])


func test_hold_trades_punctuality_for_connections() -> void:
	var results := {}
	for hold in [false, true]:
		var s := AirportSimulation.new()
		s.setup(AirportSimulation.load_config("res://configs/airports/riverdale_ga_hold.json"))
		var ga: AirportFlight = s.airport.flights.F012
		if hold:
			while not (ga.boarding_phase == "open" and s.clock.tick >= ga.gate_close_tick - 1200): s.step()
			assert_true(s.hold_flight("F012"))
		run_to_end(s)
		results[hold] = s.airlines.evaluations.GA
	assert_true(results[true].dimensions.connections.score > results[false].dimensions.connections.score, "the hold saves connections")
	assert_true(results[true].dimensions.punctuality.score < results[false].dimensions.punctuality.score, "and costs punctuality")


func test_mid_day_save_gives_the_same_final_airline_evaluation() -> void:
	var path := "res://configs/airports/riverdale_airline_conflict.json"
	for at in [230000, 262000]:
		var original := AirportSimulation.new()
		original.setup(AirportSimulation.load_config(path))
		for f: AirportFlight in original.flight_order:
			if f.airline_id == "GA": original.set_service_priority(f.id, "high")
		while original.clock.tick < at: original.step()
		var resumed := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(original.snapshot())))
		assert_true(resumed != null, "restores at %d" % at)
		if resumed == null: continue
		run_to_end(original)
		run_to_end(resumed)
		assert_eq(JSON.stringify(resumed.snapshot().airline_relations), JSON.stringify(original.snapshot().airline_relations), "same records, contracts and requests")
		for id in original.airlines.airline_ids:
			assert_eq(resumed.airlines.evaluations[id].relationship, original.airlines.evaluations[id].relationship)


func test_airline_save_is_validated() -> void:
	var s := AirportSimulation.new()
	s.setup(AirportSimulation.load_config("res://configs/airports/riverdale_airline_conflict.json"))
	while s.airlines.records.size() < 2: s.step()
	var good: Dictionary = JSON.parse_string(JSON.stringify(s.snapshot()))
	assert_true(AirportSimulation.from_snapshot(good.duplicate(true)) != null)
	var old := good.duplicate(true)
	old.version = AirportSimulation.SAVE_VERSION - 1
	assert_true(AirportSimulation.from_snapshot(old) == null, "v8 is rejected")
	var pending: String = ""
	for f: AirportFlight in s.flight_order:
		if f.status != "departed": pending = f.id
	var mutations := {
		"record for a flight still at the airport": func(d): d.airline_relations.records[pending] = d.airline_relations.records.values()[0].duplicate(),
		"unknown request state": func(d): d.airline_relations.state.GA.request = "maybe",
		"unknown airline": func(d): d.airline_relations.state["ZZ"] = d.airline_relations.state.GA.duplicate(),
		"missing airline block": func(d): d.erase("airline_relations"),
	}
	for label in mutations:
		var bad: Dictionary = good.duplicate(true)
		mutations[label].call(bad)
		assert_true(AirportSimulation.from_snapshot(bad) == null, "rejected: " + label)


func test_same_seed_and_decisions_same_relationships() -> void:
	var outs: Array = []
	for _i in 2:
		var s := AirportSimulation.new()
		s.setup(AirportSimulation.load_config("res://configs/airports/riverdale_airline_conflict.json"))
		for f: AirportFlight in s.flight_order:
			if f.airline_id == "SJ": s.set_service_priority(f.id, "high")
		run_to_end(s)
		outs.append(JSON.stringify(s.snapshot().airline_relations))
	assert_eq(outs[0], outs[1])


func test_riverdale_default_has_winners_and_weaknesses() -> void:
	var s := run_to_end(_default())
	var best := 0
	var weak := false
	var failed := 0
	for id in s.airlines.airline_ids:
		var e: Dictionary = s.airlines.evaluations[id]
		best = maxi(best, e.relationship)
		if e.contract.terms.any(func(t): return t.status in ["AT RISK", "FAILING"]): weak = true
		if e.contract.status == "FAILED": failed += 1
	assert_true(best >= 85, "at least one clearly strong airline (%d)" % best)
	assert_true(weak, "at least one meaningful weakness")
	assert_true(failed <= 1, "contracts mostly achievable")


func _default() -> AirportSimulation:
	var s := AirportSimulation.new()
	s.setup()
	return s
