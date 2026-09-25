extends SceneTree
## M12 demonstrations: airside construction, taxiways, runways and routing.
##   A (rendered): riverdale_single_taxiway.json. One two-way taxilane and a
##      single connector: arrivals and departures hold for each other. Between
##      days the player builds two one-way connectors in the Build tab's
##      airside tool and makes the apron lane one-way; then the same day
##      (headless, same seed) with and without the change.
##   B (headless): Riverdale with a second runway (R2, 3,200 m) north of R1.
##   C (headless): riverdale_short_runway.json. R1 is 2,400 m; Global Airways'
##      787 request cannot be served until a 2,800 m runway is built.
##   D (headless): a valid but poor design: the runway exit rerouted through a
##      long detour.
##   E (headless): the one-lane airport against Riverdale: one passenger's
##      connection through the taxi delay, then the airlines and the money.
## Writes /tmp/m12-demo-*.png.   tools/ui_tests.sh tests/m12_demo.gd

const SINGLE := "res://configs/airports/riverdale_single_taxiway.json"
const SHORT := "res://configs/airports/riverdale_short_runway.json"

var main: Control
var frame := 0
var failures := 0
var report: Array = []


func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.scenario_path = SINGLE
	main.save_path = "user://m12_demo.json"
	root.add_child(main)


func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)


func career() -> AirportCareer:
	return main.career


func shot(name: String) -> void:
	if main.day_panel == null or not main.day_panel.visible: main._refresh()
	root.get_viewport().get_texture().get_image().save_png("/tmp/m12-demo-%s.png" % name)


func play_until(predicate: Callable) -> void:
	for _i in 400000:
		if predicate.call(): return
		main.sim.step()
	check(false, "condition never reached")


## A taxiway through the Build tab, as a player would: Airside, Taxiway, two
## clicks on the map, direction, BUILD.
func taxiway_via_ui(from: String, to: String, direction_index: int, press := true) -> void:
	main.build_category.select(main.BUILD_CATEGORIES.find("airside"))
	main._refresh_build_tab()
	main.build_items.select(main.build_item_ids.find("taxiway"))
	main._refresh_build_sites()
	main.airside_map.picks = [from, to]
	main.airside_direction.select(direction_index)
	main._refresh_build_info()
	check(not main.build_button.disabled, "A · taxiway %s → %s can be built: %s" % [from, to, main.build_info.text])
	if press: main.build_button.pressed.emit()


## Select a built piece in the Build tab and press its toggle `times` times.
func toggle_via_ui(id: String, times: int) -> void:
	for _i in times:
		main._refresh_build_tab()
		main.built_list.select(main.built_ids.find(id))
		main._refresh_demolish()
		main.airside_toggle.pressed.emit()


## R2 north of R1 with one-way taxiways around R1's ends (as in test_airside).
static func build_north_runway(c: AirportCareer, length := 3200) -> Dictionary:
	var r := c.build_runway("G_300_-300", "E", length)
	if r.has("error"): return r
	for pair in [[r.id + "_B", "R1_EXIT"], ["R1_HOLD", r.id + "_A"]]:
		var t := c.build_taxiway(pair[0], pair[1], 1)
		if t.has("error"): return t
	return r


static func improve_single(c: AirportCareer) -> void:
	c.build_taxiway("R1_EXIT", "AP_8", 1)
	c.build_taxiway("AP_1", "R1_HOLD", 1)
	for i in range(1, 8): c.set_airside("AT-AP_%d_%d" % [i, i + 1], "direction", -1)


func _waiting() -> String:
	for f: AirportFlight in main.sim.flight_order:
		var t: Dictionary = main.sim.taxi_status(f)
		if not t.is_empty() and str(t.blocker).begins_with("opposing") and main.sim.flight_order.filter(func(g): return g.status in ["taxiing_in", "taxiing_out"]).size() >= 3:
			return f.id
	return ""


func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		2:
			main.sim.clock.paused = true
			play_until(func(): return not _waiting().is_empty())
			main._select(_waiting())
			main.map.overlay = true
			main.view_tabs.current_tab = 0
		3:
			check(main.detail.text.contains("HOLDING") or main.detail.text.contains("WAITING"), "A · the flight detail says why it is not moving")
			shot("01-one-lane-holding")
			var f: AirportFlight = main.sim.airport.flights[main.selected_id]
			report.append("A · %s %s: %s" % [AirportClock.display(main.sim.clock.tick).left(5), f.flight_number, main._taxi_text(f).replace("\n", " ").replace("[color=#70dec0]", "").replace("[color=#ffc078]", "").replace("[/color]", "").replace("[b]", "").replace("[/b]", "").strip_edges()])
			play_until(func(): return career().day_complete())
			main._process(0.0)
		4:
			check(main.day_panel.visible, "A · day 1 over")
			main.day_tabs.current_tab = 1
			taxiway_via_ui("R1_EXIT", "AP_8", 1)
			taxiway_via_ui("AP_1", "R1_HOLD", 1, false)
		5:
			shot("02-build-airside-preview")
			report.append("A · Build tab preview: " + main.build_info.text.replace("\n", " · "))
			main.build_button.pressed.emit()
			for i in range(1, 8): toggle_via_ui("AT-AP_%d_%d" % [i, i + 1], 2)
			check(career().start_errors().is_empty(), "A · the airport is valid after the change")
			report.append("A · built connectors %s and made the apron one-way westward · capital %s" % [", ".join(career().layout.objects.filter(func(o): return o.type == "taxiway").map(func(o): return "%s→%s" % [o.from, o.to])), AirportEconomy.money(career().capital_cents(2))])
			main._refresh_build_tab()
		6:
			shot("03-built-list")
			main.start_day_button.pressed.emit()
		7:
			var s: AirportSimulation = main.sim
			play_until(func(): return s.flight_order.filter(func(g): return g.status in ["taxiing_in", "taxiing_out"]).size() >= 3)
			for f: AirportFlight in s.flight_order:
				if f.status == "taxiing_in": main._select(f.id)
			main.map.overlay = true
		8:
			shot("04-day2-one-way-flow")
			main.map.debug = true
		9:
			shot("05-debug-ids")
			main.map.debug = false
			play_until(func(): return career().day_complete())
			main._process(0.0)
		10:
			shot("06-day2-report")
			_compare_single()
			_second_runway()
			_short_runway()
			_detour()
			_consequence()
			print("\nM12 demonstration · airside")
			for line in report: print(line)
			print("M12 demo: %d failures" % failures)
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	if main != null and (main.day_panel == null or not main.day_panel.visible): main._refresh()
	return false


# --- headless ---------------------------------------------------------------------------

var _days := {}

## Day 1 of a scenario with some construction first (settled; cached by label).
func day(label: String, path: String, build: Callable) -> Dictionary:
	if _days.has(label): return _days[label]
	var c := AirportCareer.new()
	c.new_career(path)
	build.call(c)
	check(c.start_errors().is_empty(), "%s · valid: %s" % [label, str(c.start_errors())])
	c.start_day()
	var s := c.sim
	while not c.day_complete(): s.step()
	c.settle_day()
	var queue := 0
	var congestion := 0
	for f: AirportFlight in s.flight_order:
		queue += int(f.delay_reasons.get("runway_takeoff_queue", 0)) + int(f.delay_reasons.get("runway_landing_queue", 0))
		congestion += int(f.departure_delay_breakdown.get("taxi_congestion", 0))
	_days[label] = {"career": c, "sim": s, "report": c.reports[0], "metrics": s.airside_metrics(), "queue": queue, "congestion": congestion}
	return _days[label]


func _line(label: String, d: Dictionary) -> String:
	var m: Dictionary = d.metrics
	var r: Dictionary = d.report
	var runways: Array = []
	for id in m.runways: runways.append("%s %d mvts %.0f%% peak q %d" % [id, m.runways[id].movements, 100.0 * float(m.runways[id].utilization), m.runways[id].peak_queue])
	return "    %-22s taxi in %.1f / out %.1f min · taxi waits %.1f min · runway queues %.1f min · %s · mean delay %.1f min · missed connections %d · operating %s · capital %s" % [
		label, int(m.mean_taxi_in_ticks) / 600.0, int(m.mean_taxi_out_ticks) / 600.0, int(m.taxi_wait_ticks) / 600.0, int(d.queue) / 600.0, " | ".join(runways),
		float(r.mean_delay_min), int(r.missed_connections), AirportEconomy.money(int(r.net_cents), true), AirportEconomy.money(int(r.capital_cents))]


func _compare_single() -> void:
	report.append("\nA · the one-lane airport, the same day 1 with and without the change:")
	var plain := day("one lane", SINGLE, func(_c): pass)
	var better := day("one-way flow", SINGLE, improve_single)
	report.append(_line("one lane", plain))
	report.append(_line("+ connectors, one-way", better))
	check(int(better.metrics.taxi_wait_ticks) < int(plain.metrics.taxi_wait_ticks), "A · taxi waits fall")
	check(float(better.report.mean_delay_min) < float(plain.report.mean_delay_min), "A · delay falls")


func _second_runway() -> void:
	report.append("\nB · Riverdale with a second runway:")
	var base := day("Riverdale", "", func(_c): pass)
	var two := day("+ R2 (3,200 m)", "", func(c): build_north_runway(c, 3200))
	report.append(_line("Riverdale", base))
	report.append(_line("+ R2 (3,200 m)", two))
	var on_r2: Array = two.sim.flight_order.filter(func(f): return f.runway_id == "R2").map(func(f): return f.flight_number)
	report.append("    flights whose last movement was on R2: " + ", ".join(on_r2))
	check(int(two.metrics.runways.R2.movements) > 0, "B · R2 carries traffic")
	check(int(two.queue) < int(base.queue), "B · runway queues fall")


func _short_runway() -> void:
	report.append("\nC · a 2,400 m runway and a 787 request:")
	var c := AirportCareer.new()
	c.new_career(SHORT)
	c.start_day()
	var offered := false
	var capacity: Array = []
	while not c.day_complete():
		c.sim.step()
		if c.sim.airlines.state.GA.request == "offered":
			offered = true
			capacity = c.tier_capacity(c.sim.airlines.request_of("GA"))
			c.sim.answer_airline_request("GA", true)
	c.settle_day()
	check(offered and not capacity.is_empty(), "C · the request needs a longer runway")
	report.append("    day 1: GA offers GA 901 (787) · capacity: %s · accepted" % " ".join(capacity))
	report.append("    planning day 2: " + " ".join(c.start_errors()))
	check(not c.can_start(), "C · day 2 cannot start without a runway for the 787")
	var built := build_north_runway(c, 2800)
	check(not built.has("error"), "C · R2 built: %s" % str(built.get("error", "")))
	report.append("    built R2 (2,800 m) + two connectors · capital %s · cash %s" % [AirportEconomy.money(c.capital_cents(2)), AirportEconomy.money(c.settled_cash_cents())])
	check(c.start_day(), "C · day 2 starts")
	var s := c.sim
	var f787: AirportFlight = s.airport.flights.GA901
	var route_in := ""
	while not c.day_complete():
		s.step()
		if f787.status == "taxiing_in" and route_in.is_empty(): route_in = " → ".join(s.taxi_status(f787).route)
	var earned := 0
	for tx in s.economy.transactions:
		if tx.flight_id == "GA901": earned += int(tx.amount_cents)
	report.append("    day 2: GA 901 landed on %s at %s, taxied via %s to %s, deplaned %d, boarded %d, departed %s, earned %s" % [f787.runway_id, AirportClock.display(f787.actual_arrival).left(5), route_in,
		f787.assigned_gate_id, f787.deplaned_count, f787.boarded_count, AirportClock.display(f787.actual_departure).left(5), AirportEconomy.money(earned)])
	check(f787.status == "departed" and f787.runway_id == "R2" and earned > 0, "C · the 787 flies from the new runway")


func _detour() -> void:
	report.append("\nD · a valid but poor design (the runway exit through a 1 km detour):")
	var detour := day("detour", "", func(c):
		c.build_taxiway("R1_EXIT", "G_3900_300", 1)
		c.build_taxiway("G_3900_300", "LI_E", 1)
		var gone: Dictionary = c.demolish("AT-EXIT_LANE")
		check(not gone.has("error"), "D · the direct exit lane can go once the detour exists"))
	report.append(_line("Riverdale", day("Riverdale", "", func(_c): pass)))
	report.append(_line("exit detour", detour))
	check(int(detour.metrics.mean_taxi_in_ticks) > 1800, "D · every arrival taxis longer")


func _consequence() -> void:
	report.append("\nE · from taxi design to money (the one-lane airport against Riverdale, same schedule and seed):")
	var good: Dictionary = day("Riverdale", "", func(_c): pass)
	var bad: Dictionary = day("one lane", SINGLE, func(_c): pass)
	var gs: AirportSimulation = good.sim
	var bs: AirportSimulation = bad.sim
	var traced := false
	for key in _sorted_keys(bs.airport.passengers):
		var p: Passenger = bs.airport.passengers[key]
		var q: Passenger = gs.airport.passengers.get(key)
		if q == null or p.journey_direction != "connecting" or p.connection_status != "missed" or q.connection_status != "made": continue
		var inbound: AirportFlight = bs.airport.flights[p.itinerary_legs[0]]
		var inbound_good: AirportFlight = gs.airport.flights[p.itinerary_legs[0]]
		if inbound.taxi_in_wait_ticks <= 0: continue
		var outbound: AirportFlight = bs.airport.flights[p.itinerary_legs[-1]]
		report.append("    P%04d, %s → %s:" % [p.id, inbound.flight_number, outbound.flight_number])
		report.append("      %s landed %s (Riverdale %s); taxi-in %.1f min incl. %.1f min held (Riverdale %.1f min)" % [inbound.flight_number, AirportClock.display(inbound.actual_arrival).left(5), AirportClock.display(inbound_good.actual_arrival).left(5),
			inbound.taxi_in_ticks_actual / 600.0, inbound.taxi_in_wait_ticks / 600.0, inbound_good.taxi_in_ticks_actual / 600.0])
		report.append("      off the aircraft %s (Riverdale %s) → connection %s (Riverdale %s)" % [AirportClock.display(p.deplaned_airport_tick).left(8), AirportClock.display(q.deplaned_airport_tick).left(8), p.connection_status.to_upper(), q.connection_status.to_upper()])
		traced = true
		break
	check(traced, "E · a connection lost to the taxi design is traced")
	var rg: Dictionary = good.report
	var rb: Dictionary = bad.report
	report.append("      day: missed connections %d → %d · missed bags %d → %d · mean delay %.1f → %.1f min" % [rg.missed_connections, rb.missed_connections, rg.missed_bags, rb.missed_bags, rg.mean_delay_min, rb.mean_delay_min])
	for airline in _sorted_keys(rg.contracts):
		report.append("      %s: relationship %d → %d · %s %s → %s" % [airline, rg.contracts[airline].relationship, rb.contracts[airline].relationship, rg.contracts[airline].contract, rg.contracts[airline].status, rb.contracts[airline].status])
	report.append("      operating result %s → %s" % [AirportEconomy.money(int(rg.net_cents), true), AirportEconomy.money(int(rb.net_cents), true)])
	check(int(rb.net_cents) < int(rg.net_cents), "E · the taxi design costs money")


static func _sorted_keys(d: Dictionary) -> Array:
	var keys := d.keys()
	keys.sort()
	return keys
