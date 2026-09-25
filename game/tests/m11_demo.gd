extends SceneTree
## M11 demonstrations: construction.
##   A (rendered): riverdale_expansion.json. Global Airways asks for a midday
##      787 and A220 that no gate can take; the player accepts, builds the east
##      pier, a narrowbody gate on A9 and a widebody gate on A10 (Build tab),
##      and day 2 runs them there like any other flights.
##   B (headless): one connecting passenger, the outbound flight at A6 or at
##      the new A10: the real route, walk and margin decide the connection.
##   C (headless): the transfer-baggage crunch with and without 4 more transfer
##      sortation modules.
##   D (headless): overbuilding: unused capacity leaves operations unchanged
##      and cash lower.
## Writes /tmp/m11-demo-*.png.   tools/ui_tests.sh tests/m11_demo.gd

const EXPANSION := "res://configs/airports/riverdale_expansion.json"
const CRUNCH := "res://configs/airports/riverdale_baggage_crunch.json"

var main: Control
var frame := 0
var failures := 0
var report: Array = []


func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.scenario_path = EXPANSION
	main.save_path = "user://m11_demo.json"
	root.add_child(main)


func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)


func career() -> AirportCareer:
	return main.career


func shot(name: String) -> void:
	if main.day_panel == null or not main.day_panel.visible: main._refresh()
	root.get_viewport().get_texture().get_image().save_png("/tmp/m11-demo-%s.png" % name)


func play_until(predicate: Callable) -> void:
	for _i in 400000:
		if predicate.call(): return
		main.sim.step()
	check(false, "condition never reached")


## Build through the Build tab, as a player would: category, item, site, BUILD.
func build_via_ui(type: String, site: String) -> void:
	var item: Dictionary = career().layout.catalog[type]
	main.build_category.select(main.BUILD_CATEGORIES.find(item.category))
	main._refresh_build_tab()
	main.build_items.select(main.build_item_ids.find(type))
	main._refresh_build_sites()
	main.build_sites.select(main.build_site_ids.find(site))
	main._refresh_build_info()
	check(not main.build_button.disabled, "A · %s can be built on %s" % [item.label, site])
	main.build_button.pressed.emit()


func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		2:
			main.sim.clock.paused = true
			play_until(func(): return main.sim.airlines.state.GA.request == "offered")
			main._select_airline("GA")
		3:
			check(main.detail.text.contains("INSUFFICIENT"), "A · the request needs capacity that isn't built")
			shot("01-request-needs-gates")
			main.detail.meta_clicked.emit("accept:GA")
			report.append("A · %s Global Airways asks for GA 431 (787) and GA 439 (A220) at midday; gate capacity INSUFFICIENT; accepted" % AirportClock.display(main.sim.clock.tick))
			play_until(func(): return career().day_complete())
			main._process(0.0)
		4:
			check(main.day_panel.visible and not career().can_start(), "A · day 2 cannot start without the capacity")
			report.append("A · planning day 2: " + " ".join(career().start_errors()))
			build_via_ui("east_pier", "east_pier")
			build_via_ui("gate_narrow", "pad_A9")
			build_via_ui("gate_wide", "pad_A10")
			main._show_day_panel()
			main.day_tabs.current_tab = 1
		5:
			shot("02-build-tab")
			check(career().start_errors().is_empty() and career().can_start(), "A · the airport is valid again")
			report.append("A · built East pier, A9 (narrowbody), A10 (widebody): capital %s · cash %s" % [AirportEconomy.money(career().capital_cents(2)), AirportEconomy.money(career().settled_cash_cents())])
			main.start_day_button.pressed.emit()
		6:
			var s: AirportSimulation = main.sim
			check(s.airport.gates.size() == 10, "A · ten gates on day 2")
			play_until(func(): return s.airport.flights.GA431.status in ["turnaround", "boarding"] and s.airport.flights.GA431.deplaned_count > 100)
			main._select("GA431")
		7:
			shot("03-ga431-at-a10")
			main.view_tabs.current_tab = 1
			var s: AirportSimulation = main.sim
			for id in s.airport.flights.GA431.inbound_passenger_ids:
				var p: Passenger = s.airport.passengers[str(id)]
				if p.airport_state in ["walking_to_reclaim", "walking_to_exit", "walking_to_gate"]:
					main._select_passenger(p.id)
					break
		8:
			shot("04-passenger-from-a10")
			var s: AirportSimulation = main.sim
			play_until(func(): return career().day_complete())
			for id in ["GA431", "GA439"]:
				var f: AirportFlight = s.airport.flights[id]
				var earned := 0
				for tx in s.economy.transactions:
					if tx.flight_id == id: earned += int(tx.amount_cents)
				report.append("A · %s at %s: %d deplaned, %d boarded, %d bags, turnaround %d/%d, departed %s, earned %s" % [f.flight_number, f.assigned_gate_id,
					f.deplaned_count, f.boarded_count, s.baggage.bags_for(f).size(), s.turnaround.completed_count(f), s.turnaround.tasks_of(f).size(),
					AirportClock.display(f.actual_departure), AirportEconomy.money(earned)])
				check(f.status == "departed" and earned > 0, "A · %s operated and earned" % id)
			main._process(0.0)
		9:
			shot("05-day2-report")
			_connection_walk()
			_baggage_capacity()
			_overbuild()
			print("\nM11 demonstration · construction")
			for line in report: print(line)
			print("M11 demo: %d failures" % failures)
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	if main != null and (main.day_panel == null or not main.day_panel.visible): main._refresh()
	return false


## One NS → AW connector; the outbound flight at A6, or at the new A10.
func _connector_run(gate: String, departure: int) -> Dictionary:
	var c := AirportCareer.new()
	c.new_career()
	c.build("east_pier", "east_pier")
	c.build("gate_wide", "pad_A10")
	var config := c.day_config()
	config.erase("_errors")
	config.start_tick = 0
	config.turnaround.variation_permille = 0
	var a: Dictionary = config.flights[4].duplicate(true)
	a.merge({"id": "FA", "flight_number": "NS 900", "aircraft_type": "737", "assigned_gate_id": "A5", "scheduled_arrival": 20000,
		"scheduled_departure": 60000, "load_permille": 0, "inbound_load_permille": 1000, "late_passengers": 0, "inbound_delay_ticks": 0}, true)
	var b: Dictionary = config.flights[1].duplicate(true)
	b.merge({"id": "FB", "flight_number": "AW 900", "aircraft_type": "737", "assigned_gate_id": gate, "scheduled_arrival": 3000,
		"scheduled_departure": departure, "load_permille": 17, "inbound_load_permille": 0, "late_passengers": 0, "inbound_delay_ticks": 0}, true)
	config.flights = [a, b]
	config.passenger_flow.connections = {"default_permille": 0, "demo_bank": [{"from": "FA", "to": "FB", "seats": ["20C"]}]}
	var s := AirportSimulation.new()
	s.setup(config)
	var p: Passenger = null
	for id in s.airport.flights.FA.inbound_passenger_ids:
		if s.airport.passengers[str(id)].journey_direction == "connecting": p = s.airport.passengers[str(id)]
	while s.airport.flights.FB.status != "departed" and s.clock.tick < departure + 20000: s.step()
	var route := s.passenger_flow.graph.route("A5", gate, true)
	return {"id": p.id, "route": " → ".join(route), "walk": s.passenger_flow.graph.route_ticks(route, p.walking_speed), "off": p.deplaned_airport_tick,
		"at_gate": p.gate_arrival_time, "close": s.airport.flights.FB.gate_close_tick, "status": p.connection_status}


func _connection_walk() -> void:
	var near := _connector_run("A6", 60000)
	var far := _connector_run("A10", 60000)
	# A departure whose gate closes between the two arrival times.
	var departure: int = (int(near.at_gate) + int(far.at_gate)) / 2 + 6000
	report.append("\nB · the same connecting passenger (P%04d), NS 900 at A5 → AW 900 departing %s:" % [near.id, AirportClock.display(departure)])
	for case in [["A6", _connector_run("A6", departure)], ["A10 (new pier)", _connector_run("A10", departure)]]:
		var r: Dictionary = case[1]
		report.append("    %-15s route %s · walk %.1f min · off %s · at gate %s · gate closed %s · margin %+.1f min → %s" % [case[0], r.route, int(r.walk) / 600.0,
			AirportClock.display(int(r.off)).left(8), AirportClock.display(int(r.at_gate)).left(8), AirportClock.display(int(r.close)).left(8),
			(int(r.close) - int(r.at_gate)) / 600.0, str(r.status).to_upper()])
	var a6 := _connector_run("A6", departure)
	var a10 := _connector_run("A10", departure)
	check(a6.status == "made" and a10.status == "missed", "B · the walk to the new pier decides the connection")


func _baggage_capacity() -> void:
	report.append("\nC · transfer-baggage crunch, with and without 4 more transfer sortation modules:")
	var nets := {}
	for extra in [0, 4]:
		var c := AirportCareer.new()
		c.new_career(CRUNCH)
		for i in extra: c.build("transfer_sorter", "baggage_transfer_sortation")
		c.start_day()
		var peak := 0
		while not c.day_complete():
			c.sim.step()
			peak = maxi(peak, c.sim.baggage.stages.transfer_sortation.queue.size())
		var bags := c.sim.baggage_metrics()
		c.settle_day()
		var r: Dictionary = c.reports[0]
		var passed := 0
		for a in r.contracts:
			if r.contracts[a].status == "PASSED": passed += 1
		nets[extra] = int(r.net_cents)
		report.append("    +%d modules (%d servers): peak queue %3d · transfer bags %d made / %d missed · contracts passed %d/4 · operating result %s · capital %s · ending cash %s" % [
			extra, 2 + extra, peak, bags.transfer_made, bags.transfer_missed, passed, AirportEconomy.money(int(r.net_cents), true), AirportEconomy.money(int(r.capital_cents)), AirportEconomy.money(int(r.closing_cents))])
	check(nets[4] > nets[0], "C · the capacity pays back in operations")


func _overbuild() -> void:
	report.append("\nD · overbuilding (nothing new to fly):")
	for built in [false, true]:
		var c := AirportCareer.new()
		c.new_career()
		if built:
			for step in [["east_pier", "east_pier"], ["gate_narrow", "pad_A9"], ["gate_wide", "pad_A10"], ["security_lane", "security_west"], ["security_lane", "security_east"], ["outbound_sorter", "baggage_outbound_sortation"]]:
				c.build(step[0], step[1])
		c.start_day()
		while not c.day_complete(): c.sim.step()
		c.settle_day()
		var r: Dictionary = c.reports[0]
		report.append("    %-13s gates %d · %d passengers · mean delay %.1f min · operating result %s · capital %s · ending cash %s" % [
			"overbuilt" if built else "as imported", c.layout.metrics().gates.narrow + c.layout.metrics().gates.wide, r.passengers, r.mean_delay_min,
			AirportEconomy.money(int(r.net_cents), true), AirportEconomy.money(int(r.capital_cents)), AirportEconomy.money(int(r.closing_cents))])
