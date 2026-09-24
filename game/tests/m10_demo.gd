extends SceneTree
## M10 demonstrations, through the real airport scene (a career).
##   A: a full financial day: Finance tab during the day, the end-of-day report,
##      ledger reconciliation to the cent.
##   C: growth: Global Airways' request accepted on day 1 (ACCEPT in its
##      details); day 2 started from the planning screen has GA 401 and GA 418
##      as ordinary flights.
##   B (headless): the same day with a lean, the default and a generous plan.
##   D (headless): lean fuel → waits → late flights → failed contract → the
##      penalty and the lost bonus, as a chain.
## Writes /tmp/m10-demo-*.png.   tools/ui_tests.sh tests/m10_demo.gd

var main: Control
var frame := 0
var failures := 0
var report: Array = []


func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.save_path = "user://m10_demo.json"
	root.add_child(main)


func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)


func career() -> AirportCareer:
	return main.career


func shot(name: String) -> void:
	main._refresh()
	root.get_viewport().get_texture().get_image().save_png("/tmp/m10-demo-%s.png" % name)


func play_until(predicate: Callable) -> void:
	for _i in 400000:
		if predicate.call(): return
		main.sim.step()
	check(false, "condition never reached")


func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		2:
			main.sim.clock.paused = true
			# Midday: the Finance tab with passenger revenue opened up.
			play_until(func(): return main.sim.clock.tick >= 252000)
			main.view_tabs.current_tab = 0
			main.operations_tabs.current_tab = main.finance_tree.get_index()
		3:
			main._refresh()
			var root_item: TreeItem = main.finance_tree.get_root()
			for item in root_item.get_children():
				if item.get_text(0).begins_with("Passenger service"): item.collapsed = false
			shot("01-finance-midday")
			check(main.metrics_label.text.begins_with("DAY 1 · $"), "the top bar shows the day and cash")
			# GA's request: accept it from the airline details.
			play_until(func(): return main.sim.airlines.state.GA.request == "offered")
			main._select_airline("GA")
		4:
			check(main.detail.text.contains("ACCEPT"), "C · the request can be answered")
			main.detail.meta_clicked.emit("accept:GA")
			check(main.sim.airlines.state.GA.request == "accepted", "C · accepted")
			report.append("C · %s Global Airways asks for GA 401 and GA 418; accepted" % AirportClock.display(main.sim.clock.tick))
			play_until(func(): return career().day_complete())
			main._process(0.0)
		5:
			check(main.day_panel.visible, "A · the day ends with its report")
			shot("02-end-of-day-report")
			var r: Dictionary = career().reports[-1]
			_report_day(r)
			check(career().settled_cash_cents() == career().starting_cash_cents + AirportEconomy.total(career().ledger), "A · reconciles to the cent")
			check(int(r.opening_cents) + int(r.net_cents) == int(r.closing_cents), "A · opening + net = closing")
			main.start_day_button.pressed.emit()
		6:
			check(not main.day_panel.visible and career().day == 2, "C · day 2 is running")
			var s: AirportSimulation = main.sim
			check(s.airport.flights.has("GA401") and s.airport.flights.has("GA418"), "C · the new flights exist")
			play_until(func(): return s.airport.flights.GA418.status in ["turnaround", "boarding"])
			main._select("GA418")
			main.view_tabs.current_tab = 0
			main.operations_tabs.current_tab = main.turnaround_tree.get_index()
		7:
			shot("03-day2-ga418-at-gate")
			var s: AirportSimulation = main.sim
			var f: AirportFlight = s.airport.flights.GA418
			report.append("C · day 2 %s GA 418 (787) at %s: %d inbound, %d booked out (%d connecting), %d bags so far, turnaround %d/%d" % [
				AirportClock.display(s.clock.tick), f.assigned_gate_id, f.inbound_passenger_ids.size(), f.passenger_ids.size(), f.connecting_bookings,
				s.baggage.bags_for(f).size(), s.turnaround.completed_count(f), s.turnaround.tasks_of(f).size()])
			play_until(func(): return career().day_complete())
			main._process(0.0)
		8:
			shot("04-day2-report")
			var r1: Dictionary = career().reports[0]
			var r2: Dictionary = career().reports[1]
			report.append("C · day 1: %d flights, %d passengers, revenue %s · day 2: %d flights, %d passengers, revenue %s" % [
				r1.flights, r1.passengers, AirportEconomy.money(r1.revenue_cents), r2.flights, r2.passengers, AirportEconomy.money(r2.revenue_cents)])
			var ga_rev := 0
			for tx in career().ledger:
				if int(tx.day) == 2 and tx.flight_id in ["GA401", "GA418"]: ga_rev += int(tx.amount_cents)
			report.append("C · GA 401 + GA 418 earned %s on day 2 (service, passengers, bags)" % AirportEconomy.money(ga_rev))
			check(ga_rev > 0 and int(r2.flights) == int(r1.flights) + 2, "C · growth is real")
			_capacity_vs_cost()
			_indirect_loss()
			print("\nM10 demonstration · economy and multi-day operation")
			for line in report: print(line)
			print("M10 demo: %d failures" % failures)
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	if main != null and (main.day_panel == null or not main.day_panel.visible): main._refresh()
	return false


func _report_day(r: Dictionary) -> void:
	report.append("A · DAY %d" % int(r.day))
	report.append("    starting cash       %14s" % AirportEconomy.money(int(r.opening_cents)))
	for c in AirportEconomy.CATEGORIES:
		report.append("    %-19s %14s" % [AirportEconomy.LABELS[c], AirportEconomy.money(int(r.by_category[c]), true)])
	report.append("    net                 %14s" % AirportEconomy.money(int(r.net_cents), true))
	report.append("    ending cash         %14s   (starting cash + %d ledger transactions, to the cent)" % [AirportEconomy.money(int(r.closing_cents)), career().ledger.size()])
	report.append("    %d flights · %d passengers · mean delay %.1f min · %d missed connections · %d missed bags" % [r.flights, r.passengers, r.mean_delay_min, r.missed_connections, r.missed_bags])
	for airline in r.contracts:
		report.append("    %s %s %s" % [airline, r.contracts[airline].contract, r.contracts[airline].status])


func _day(plan: Dictionary) -> AirportCareer:
	var c := AirportCareer.new()
	c.new_career()
	for type in plan: c.set_units(type, plan[type])
	c.start_day()
	while not c.day_complete(): c.sim.step()
	c.settle_day()
	return c


func _capacity_vs_cost() -> void:
	report.append("\nB · the same day 1 under three capacity plans:")
	var plans := {"lean": {"cleaning_crew": 2, "catering_crew": 2, "fuel_unit": 3, "baggage_crew": 6, "pushback_tug": 1},
		"default": {}, "generous": {"cleaning_crew": 5, "catering_crew": 5, "fuel_unit": 6, "baggage_crew": 10, "pushback_tug": 3}}
	var nets := {}
	for label in plans:
		var c := _day(plans[label])
		var r: Dictionary = c.reports[0]
		var m := c.finished.resource_metrics()
		var waited := 0
		for type in m.pools: waited += int(m.pools[type].waited)
		var passed := 0
		for airline in r.contracts:
			if r.contracts[airline].status == "PASSED": passed += 1
		nets[label] = int(r.net_cents)
		report.append("    %-9s resources %10s · %3d tasks waited · %2d flights delayed by shortage · mean delay %.1f · contracts passed %d/4 · revenue %s · net %s" % [
			label, AirportEconomy.money(-int(r.by_category.resources)), waited, m.flights_delayed, r.mean_delay_min, passed,
			AirportEconomy.money(int(r.revenue_cents)), AirportEconomy.money(int(r.net_cents), true)])
	check(nets.generous < nets.default, "B · over-provisioning costs margin")


func _indirect_loss() -> void:
	var base := _day({})
	var lean := _day({"fuel_unit": 2})
	report.append("\nD · fuel units 4 → 2, nothing else changed:")
	for airline in lean.reports[0].contracts:
		var before: Dictionary = base.reports[0].contracts[airline]
		var after: Dictionary = lean.reports[0].contracts[airline]
		if before.status != "PASSED" or after.status != "FAILED": continue
		var s: AirportSimulation = lean.finished
		var e: Dictionary = s.airlines.evaluations[airline]
		var worst: AirportFlight = null
		for f: AirportFlight in s.flight_order:
			if f.airline_id == airline and (worst == null or f.actual_departure - f.scheduled_departure > worst.actual_departure - worst.scheduled_departure): worst = f
		var failing: Array = e.contract.terms.filter(func(t): return t.status == "FAILING").map(func(t): return "%s %s (target %s)" % [t.label, AirlineRelations._fmt(t.metric, float(t.value)), t.target])
		var template: Dictionary = s.config.airline_relations.contracts[e.contract.id]
		report.append("    %s: %s +%.1f min, %s +%.1f · %s → %s FAILED → penalty %s and bonus %s not earned (%s swing)" % [
			s.airport.airlines[airline], worst.flight_number, (worst.actual_departure - worst.scheduled_departure) / 600.0,
			"waiting for fuel unit", int(worst.departure_delay_breakdown.get("wait:fuel_unit", 0)) / 600.0, "; ".join(failing), e.contract.label,
			AirportEconomy.money(-int(template.penalty_cents)), AirportEconomy.money(int(template.bonus_cents)),
			AirportEconomy.money(-int(template.penalty_cents) - int(template.bonus_cents))])
	report.append("    net: %s → %s (fuel cost saved %s)" % [AirportEconomy.money(int(base.reports[0].net_cents), true), AirportEconomy.money(int(lean.reports[0].net_cents), true),
		AirportEconomy.money(2 * int(base.base.economy.resources.fuel_unit.daily_cents))])
	check(lean.contract_history.any(func(h): return h.status == "FAILED"), "D · a contract fails under the lean plan")
