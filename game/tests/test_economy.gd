extends TestCase
## M10: economy and multi-day operation. Integer-cent ledger with stable ids,
## revenue from real operations, committed capacity costs, contract money,
## once-only settlement, persistent careers and growth. See docs/m10-plan.md.

const CONFLICT := "res://configs/airports/riverdale_airline_conflict.json"

## One default two-day career, shared by several tests (a day takes a while):
## day 1 accepts every request; snapshots are kept at interesting moments.
var _cached: Dictionary = {}


func play_day(c: AirportCareer, accept := true, on_tick := Callable()) -> void:
	while not c.day_complete():
		c.sim.step()
		if on_tick.is_valid(): on_tick.call(c)
		for airline in c.sim.airlines.airline_ids:
			if c.sim.airlines.state[airline].request == "offered": c.sim.answer_airline_request(airline, accept)


func default_career() -> Dictionary:
	if not _cached.is_empty(): return _cached
	var c := AirportCareer.new()
	c.new_career()
	assert_true(c.start_day(), "day 1 starts")
	var mid := {}
	play_day(c, true, func(career):
		if mid.is_empty() and career.sim.clock.tick >= 240000: mid["save"] = JSON.stringify(career.snapshot()))
	var before_settle := JSON.stringify(c.snapshot())
	var day1_sim := c.sim
	c.settle_day()
	var between := JSON.stringify(c.snapshot())
	var day1_ledger := c.ledger.duplicate(true)
	var relationships := c.relationships.duplicate()
	assert_true(c.start_day(), "day 2 starts")
	var day2_config := c.sim.config.duplicate(true)
	var day2_flights := c.sim.flight_order.size()
	var day2_sim := c.sim
	play_day(c)
	c.settle_day()
	_cached = {"career": c, "mid_day1": mid.save, "before_settle": before_settle, "between": between, "day1_ledger": day1_ledger,
		"day1_sim": day1_sim, "day2_sim": day2_sim, "relationships_after_day1": relationships, "day2_config": day2_config, "day2_flights": day2_flights}
	return _cached


func sum_category(ledger: Array, day: int, category: String) -> int:
	var total := 0
	for tx in ledger:
		if int(tx.day) == day and tx.category == category: total += int(tx.amount_cents)
	return total


# --- accounting --------------------------------------------------------------------

func test_money_is_integer_cents_and_reconciles() -> void:
	var d := default_career()
	var c: AirportCareer = d.career
	for tx in c.ledger: assert_true(tx.amount_cents is int, "integer cents: " + tx.id)
	var snap: Dictionary = JSON.parse_string(JSON.stringify(c.snapshot()))
	assert_true(AirportCareer.from_snapshot(snap) != null, "the saved career validates")
	assert_eq(c.settled_cash_cents(), c.starting_cash_cents + AirportEconomy.total(c.ledger), "starting cash + ledger = cash")
	for r in c.reports:
		assert_eq(int(r.opening_cents) + int(r.net_cents), int(r.closing_cents), "day %d: opening + net = closing" % r.day)
		var all_by_category := 0
		for k in r.by_category: all_by_category += int(r.by_category[k])
		assert_eq(all_by_category, int(r.net_cents), "categories add up to the net")
	var tampered := snap.duplicate(true)
	tampered.career.cash_cents += 1
	assert_true(AirportCareer.from_snapshot(tampered) == null, "a cent off does not load")


func test_each_flight_earns_its_service_fee_exactly_once() -> void:
	var d := default_career()
	var s: AirportSimulation = d.day1_sim
	var fees: Dictionary = s.config.economy.fees
	for f: AirportFlight in s.flight_order:
		var type: String = s.airport.aircraft[f.aircraft_id].aircraft_type_id
		var found: Array = d.day1_ledger.filter(func(tx): return tx.flight_id == f.id and tx.category == "aircraft")
		assert_eq(found.size(), 1, f.flight_number + " charged once")
		assert_eq(int(found[0].amount_cents), int(fees.aircraft_cents[type]) + int(fees.gate_cents[type]), f.flight_number + " fee by type")


func test_only_departed_passengers_pay_the_service_fee() -> void:
	var d := default_career()
	var s: AirportSimulation = d.day1_sim
	var fee := int(s.config.economy.fees.passenger_cents)
	var f: AirportFlight = s.airport.flights.F002
	assert_true(f.missed_count > 0, "AW 228 leaves a passenger behind (M3 demo)")
	var tx: Dictionary = d.day1_ledger.filter(func(t): return t.id == "D1:F002:passengers")[0]
	var departed := 0
	for id in f.passenger_ids:
		var p: Passenger = s.airport.passengers[str(id)]
		if p.current_flight_id == "F002" and p.airport_state == "departed": departed += 1
	assert_eq(int(tx.amount_cents), departed * fee)
	assert_true(departed < f.passenger_ids.size(), "booked but missed passengers pay nothing")


func test_bag_handling_is_charged_once_per_operation() -> void:
	var d := default_career()
	var s: AirportSimulation = d.day1_sim
	var fee := int(s.config.economy.fees.bag_handling_cents)
	var operations := 0
	for bag: AirportBag in s.airport.bags.values():
		# Unloaded from an inbound aircraft, and/or loaded and flown out.
		if bag.unloaded_tick >= 0: operations += 1
		if bag.state == "departed": operations += 1
	assert_eq(-sum_category(d.day1_ledger, 1, "baggage") * -1, operations * fee, "bags handled × fee, no duplicates")


func test_committed_costs_follow_the_plan() -> void:
	var c := AirportCareer.new()
	c.new_career()
	var economy: Dictionary = c.base.economy
	var expected := int(economy.costs.fixed_daily_cents) + int(economy.costs.security_staff_daily_cents) * c.security_staff()
	for type in c.resource_plan: expected += int(economy.resources[type].daily_cents) * int(c.resource_plan[type])
	assert_eq(c.committed_cost_cents(), expected)
	assert_true(c.set_units("fuel_unit", 6))
	assert_eq(c.committed_cost_cents(), expected + 2 * int(economy.resources.fuel_unit.daily_cents), "two more fuel units cost two more days of fuel units")
	assert_true(not c.set_units("fuel_unit", 99), "above the configured maximum")
	assert_true(not c.set_units("fuel_unit", 0), "below the minimum")
	c.start_day()
	assert_true(not c.set_units("fuel_unit", 5), "no capacity changes once the day is underway")
	assert_eq(-sum_category(c.sim.economy.transactions, 1, "resources"), c.committed_cost_cents() - int(economy.costs.fixed_daily_cents) - int(economy.costs.security_staff_daily_cents) * c.security_staff())


# --- contracts ----------------------------------------------------------------------

func test_contract_money_is_paid_once_per_day() -> void:
	var d := default_career()
	var c: AirportCareer = d.career
	var contracts: Dictionary = c.base.airline_relations.contracts
	for day in [1, 2]:
		for h in c.contract_history.filter(func(x): return int(x.day) == day):
			var txs: Array = c.ledger.filter(func(tx): return tx.id == "D%d:CONTRACT:%s" % [day, h.airline])
			assert_eq(txs.size(), 1, "one settlement for %s on day %d" % [h.airline, day])
			var template: Dictionary = contracts[h.contract]
			var expected := int(template.bonus_cents) if h.status == "PASSED" else -int(template.penalty_cents)
			assert_eq(int(txs[0].amount_cents), expected, "configured amount for %s %s" % [h.airline, h.status])


func test_failed_contract_costs_its_penalty() -> void:
	var c := AirportCareer.new()
	c.new_career(CONFLICT)
	c.start_day()
	for f: AirportFlight in c.sim.flight_order:
		if f.airline_id == "GA": c.sim.set_service_priority(f.id, "high")
	play_day(c, false)
	c.settle_day()
	var failed: Array = c.contract_history.filter(func(h): return h.status == "FAILED")
	assert_true(not failed.is_empty(), "SunJet fails behind Global Airways' priority")
	for h in failed:
		assert_eq(int(h.amount_cents), -int(c.base.airline_relations.contracts[h.contract].penalty_cents), "the listed penalty, once")
		var tx: Dictionary = c.ledger.filter(func(t): return t.id == "D1:CONTRACT:" + h.airline)[0]
		assert_eq(tx.category, "contract_penalty")
		assert_true(str(tx.reason).contains("FAILED"), "explained: " + tx.reason)


# --- settlement and saves --------------------------------------------------------------

func test_settlement_happens_exactly_once() -> void:
	var d := default_career()
	var c: AirportCareer = d.career
	var size := c.ledger.size()
	assert_true(not c.settle_day(), "nothing to settle while planning")
	assert_eq(c.ledger.size(), size)
	# Reload just before settling day 1, settle, and compare with the original.
	var again := AirportCareer.from_snapshot(JSON.parse_string(d.before_settle))
	assert_true(again != null)
	assert_true(again.settle_day())
	assert_true(not again.settle_day(), "a second call does nothing")
	assert_eq(JSON.stringify(again.ledger), JSON.stringify(d.day1_ledger), "same ledger, no duplicates")
	# Reload between days: settling again is refused; day 2 revenue is not doubled.
	var between := AirportCareer.from_snapshot(JSON.parse_string(d.between))
	assert_true(between != null and between.phase == "planning" and between.day == 2)
	assert_true(not between.settle_day())
	assert_eq(between.settled_cash_cents(), again.settled_cash_cents())


func test_mid_day_save_gives_the_same_money() -> void:
	var d := default_career()
	var resumed := AirportCareer.from_snapshot(JSON.parse_string(d.mid_day1))
	assert_true(resumed != null, "mid-day career save loads")
	play_day(resumed)
	resumed.settle_day()
	assert_eq(JSON.stringify(resumed.ledger), JSON.stringify(d.day1_ledger), "identical transactions after reload")
	assert_eq(JSON.stringify(resumed.relationships), JSON.stringify(d.relationships_after_day1))


func test_old_or_inconsistent_saves_are_rejected() -> void:
	var d := default_career()
	var between: Dictionary = JSON.parse_string(d.between)
	var old := between.duplicate(true)
	old.version = 9
	assert_true(AirportCareer.from_snapshot(old) == null, "v9 rejected")
	var dup := between.duplicate(true)
	dup.career.ledger.append(dup.career.ledger[0].duplicate())
	dup.career.cash_cents += int(dup.career.ledger[0].amount_cents)
	assert_true(AirportCareer.from_snapshot(dup) == null, "duplicate transaction id rejected")
	var reopened := between.duplicate(true)
	reopened.career.settled_days = []
	assert_true(AirportCareer.from_snapshot(reopened) == null, "settled days cannot be undone")
	var over := between.duplicate(true)
	over.career.resource_plan.fuel_unit = 99
	assert_true(AirportCareer.from_snapshot(over) == null, "plan outside its range rejected")


# --- days -----------------------------------------------------------------------------

func test_day_two_starts_clean_and_remembers_the_career() -> void:
	var d := default_career()
	var day2: AirportSimulation = d.day2_sim
	assert_true(not is_same(day2, d.day1_sim), "a new simulation")
	assert_eq(day2.economy.day, 2)
	assert_eq(day2.economy.opening_cash_cents, int(d.career.reports[0].closing_cents), "opens with yesterday's closing cash")
	assert_true(not is_same(day2.airport.passengers["1"], d.day1_sim.airport.passengers["1"]), "fresh passengers")
	for airline in d.relationships_after_day1:
		assert_eq(int(d.day2_config.airline_relations.profiles[airline].starting_relationship), int(d.relationships_after_day1[airline]),
			airline + " starts day 2 where day 1 ended")
	assert_true(d.day2_config.seed != d.day1_sim.config.seed, "a day-scoped seed")


func test_accepted_request_becomes_real_flights() -> void:
	var d := default_career()
	var s: AirportSimulation = d.day2_sim
	assert_true(d.career.request_status.get("GA_EXPANSION_01", "") in ["activated"], "accepted on day 1, activated on day 2")
	assert_eq(d.day2_flights, s.config.flights.size())
	for id in ["GA401", "GA418"]:
		assert_true(s.airport.flights.has(id), id + " exists on day 2")
		var f: AirportFlight = s.airport.flights[id]
		assert_eq(f.status, "departed", "operated like any flight")
		assert_true(f.passenger_ids.size() > 50 and f.inbound_passenger_ids.size() > 50, "passengers both ways")
		assert_true(s.turnaround.task(f, "fueling").unit_id == "" and s.turnaround.task(f, "fueling").status == TurnaroundTask.COMPLETE, "fuelled with a real unit")
		assert_eq(d.career.ledger.filter(func(tx): return tx.id == "D2:%s:aircraft" % id).size(), 1, "and paid for")
	assert_eq(s.airport.flights.GA418.assigned_gate_id, "A7", "a widebody gate")


func test_growth_persists_and_is_not_repeated() -> void:
	var d := default_career()
	var c: AirportCareer = d.career
	var day3 := c.day_config()
	var ids: Array = day3.flights.map(func(f): return f.id)
	assert_eq(ids.count("GA401"), 1, "still flying on day 3, and only once")
	assert_eq(c.next_request("GA") .get("id", ""), "GA_EXPANSION_02" if not c.request_status.has("GA_EXPANSION_02") else "", "the next tier, never the same one again")


func test_declined_request_adds_nothing() -> void:
	var c := AirportCareer.new()
	c.new_career()
	c.request_status["GA_EXPANSION_01"] = "declined"
	var config := c.day_config()
	assert_true(not config.flights.any(func(f): return f.id in ["GA401", "GA418", "GA426"]), "no GA growth")
	assert_true(not config.airline_relations.profiles.GA.has("request"), "and no further GA tiers")
	var unqualified := AirportCareer.new()
	unqualified.new_career()
	assert_true(not unqualified.day_config().flights.any(func(f): return f.id == "GA401"), "no flights until a request is accepted")


func test_growth_brings_revenue_and_load() -> void:
	var d := default_career()
	var r1: Dictionary = d.career.reports[0]
	var r2: Dictionary = d.career.reports[1]
	assert_true(int(r2.flights) > int(r1.flights))
	assert_true(int(r2.by_category.aircraft) > int(r1.by_category.aircraft), "more service revenue")
	assert_true(int(r2.passengers) > int(r1.passengers), "more passengers")
	var allocations := func(s: AirportSimulation) -> int:
		var n := 0
		for type in s.resources.order: n += int(s.resources.pools[type].stats.allocations)
		return n
	assert_true(allocations.call(d.day2_sim) > allocations.call(d.day1_sim), "more work for the same crews and fuel units")


func test_resource_plan_changes_cost_and_contention() -> void:
	var out := {}
	for units in [1, 3]:
		var c := AirportCareer.new()
		c.new_career(CONFLICT)
		c.set_units("fuel_unit", units)
		c.start_day()
		play_day(c, false)
		out[units] = {"cost": -sum_category(c.sim.economy.transactions, 1, "resources"), "waited": int(c.sim.resources.pools.fuel_unit.stats.waited)}
	assert_eq(out[3].cost - out[1].cost, 2 * int(AirportSimulation.load_config(CONFLICT).economy.resources.fuel_unit.daily_cents))
	assert_true(out[1].waited > out[3].waited, "the lean plan queues for fuel: %d vs %d" % [out[1].waited, out[3].waited])


func test_same_seed_and_decisions_same_career() -> void:
	var runs: Array = []
	for _i in 2:
		var c := AirportCareer.new()
		c.new_career(CONFLICT)
		for day in 2:
			c.start_day()
			play_day(c)
			c.settle_day()
		runs.append(JSON.stringify(c.snapshot()))
	assert_eq(runs[0], runs[1])


func test_unaffordable_day_cannot_start() -> void:
	var c := AirportCareer.new()
	c.new_career()
	c.starting_cash_cents = c.committed_cost_cents() - 1
	assert_true(not c.can_start() and not c.start_day(), "cannot pay for the plan")
	assert_true(not c.insolvent(), "a smaller plan would still be affordable")
	for type in c.resource_plan: c.set_units(type, int(c.minimum_plan()[type]))
	assert_true(c.can_start(), "reducing capacity makes the day affordable")
	c.starting_cash_cents = c.committed_cost_cents(c.minimum_plan()) - 1
	assert_true(c.insolvent(), "even the minimum plan is unaffordable: insolvent")
	assert_true(not c.start_day())
