extends SceneTree
## M9 demonstrations, through the real airport scene.
##   A: airlines care about different things. The default morning's airlines,
##      then the same outcomes perturbed (+3 missed connections, +10 min on one
##      flight) and read with each airline's weights.
##   B: the player makes a winner and a loser. Global Airways vs SunJet with one
##      fuel unit (riverdale_airline_conflict.json): the rendered run makes every
##      GA flight HIGH; a headless run from the same start makes SunJet HIGH.
##   C: the hold. NS 305 lands 25 min late with connectors for GA 298
##      (riverdale_ga_hold.json): HOLD +5 in the rendered run, no hold headless.
## Writes /tmp/m9-demo-*.png.   tools/ui_tests.sh tests/m9_demo.gd

const CONFLICT := "res://configs/airports/riverdale_airline_conflict.json"
const HOLD := "res://configs/airports/riverdale_ga_hold.json"

var main: Control
var frame := 0
var failures := 0
var report: Array = []


func _initialize() -> void:
	_open("")


func _open(scenario: String) -> void:
	if main != null:
		root.remove_child(main)
		main.queue_free()
	main = load("res://scenes/airport.tscn").instantiate()
	main.scenario_path = scenario
	main.save_path = "user://m9_demo.json"
	root.add_child(main)


func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)


func sim() -> AirportSimulation:
	return main.sim


func shot(name: String) -> void:
	main._refresh()
	root.get_viewport().get_texture().get_image().save_png("/tmp/m9-demo-%s.png" % name)


func finish(s: AirportSimulation) -> void:
	while s.clock.tick < 360000: s.step()


func line(e: Dictionary) -> String:
	return "%d %s · %s %s" % [e.relationship, e.band, e.contract.label, e.contract.status]


func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		2:
			# Demo A: the default morning.
			sim().clock.paused = true
			finish(sim())
			main._select_airline("GA")
		3:
			check(main.detail.text.contains("WHY") and main.detail.text.contains("CONTRACT"), "A · airline detail explains the score")
			shot("01-airlines-default-morning")
			report.append("A · default morning:")
			for id in sim().airlines.airline_ids: report.append("    %-15s %s" % [sim().airport.airlines[id], line(sim().airlines.evaluations[id])])
			_sensitivity()
			main._select_airline("AW")
		4:
			shot("02-airline-weakness")
			# Demo B: GA HIGH everywhere, rendered.
			_open(CONFLICT)
		6:
			sim().clock.paused = true
			for f: AirportFlight in sim().flight_order:
				if f.airline_id == "GA":
					main._select(f.id)
					main.priority_buttons["high"].pressed.emit()
			finish(sim())
			main._select_airline("SJ")
		7:
			check(main.detail.text.contains("Waiting for fuel unit"), "B · SunJet's problem flights name the fuel wait")
			shot("03-ga-priority-sunjet-suffers")
			_conflict_report()
			_open(HOLD)
		9:
			# Demo C: hold GA 298 at its gate-close alert.
			sim().clock.paused = true
			var ga: AirportFlight = sim().airport.flights.F012
			while not (ga.boarding_phase == "open" and sim().clock.tick >= ga.gate_close_tick - 1200): sim().step()
			main._select("F012")
			main.hold_button.pressed.emit()
			check(ga.hold_ticks == 3000, "C · HOLD +5 MIN pressed")
			finish(sim())
			main._select_airline("GA")
		10:
			check(main.detail.text.contains("held 5 min") or main.detail.text.contains("Connections"), "C · GA detail shows the result")
			shot("04-ga-after-hold")
			_hold_report()
			print("\nM9 demonstration · airlines, expectations and contracts")
			for l in report: print(l)
			print("M9 demo: %d failures" % failures)
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	if main != null and main.is_inside_tree(): main._refresh()
	return false


## Demo A: identical operational changes, read by each airline's weights.
func _sensitivity() -> void:
	var r: AirlineRelations = sim().airlines
	var base: Dictionary = r.evaluations.GA.metrics.duplicate(true)
	var missed := base.duplicate(true)
	missed.connections_missed += 3
	missed.connection_rate = float(missed.connections_made) / (missed.connections_made + missed.connections_missed)
	var late := base.duplicate(true)
	late.delay_ticks += 6000
	late.on_time -= 1
	late.on_time_rate = float(late.on_time) / late.flights
	late.mean_delay_min = late.delay_ticks / 600.0 / late.flights
	report.append("\nA · one set of outcomes (Global Airways' day), read by each airline's weights:")
	report.append("    %-15s %8s %22s %22s" % ["weights of", "as run", "+3 missed connections", "+10 min on one flight"])
	for id in r.airline_ids:
		var w: Dictionary = r.profile(id).weights
		var s0 := _weighted(base, w)
		report.append("    %-15s %8.1f %22s %22s" % [sim().airport.airlines[id], s0, "%+.1f" % (_weighted(missed, w) - s0), "%+.1f" % (_weighted(late, w) - s0)])
	var ga: Dictionary = r.profile("GA").weights
	var sj: Dictionary = r.profile("SJ").weights
	check(_weighted(base, ga) - _weighted(missed, ga) > _weighted(base, sj) - _weighted(missed, sj), "A · Global Airways minds missed connections more")
	check(_weighted(base, sj) - _weighted(late, sj) > _weighted(base, ga) - _weighted(late, ga), "A · SunJet minds lateness more")


static func _weighted(m: Dictionary, weights: Dictionary) -> float:
	var total := 0.0
	var sum := 0.0
	for dim in AirlineRelations.DIMENSIONS:
		var v = AirlineRelations._dimension(dim, m)
		if v == null or float(weights.get(dim, 0)) <= 0: continue
		total += float(v) * float(weights[dim])
		sum += float(weights[dim])
	return 0.0 if sum == 0 else total / sum


func _conflict_report() -> void:
	var other := AirportSimulation.new()
	other.setup(AirportSimulation.load_config(CONFLICT))
	for f: AirportFlight in other.flight_order:
		if f.airline_id == "SJ": other.set_service_priority(f.id, "high")
	finish(other)
	report.append("\nB · one fuel unit, Global Airways vs SunJet (same start, different priority):")
	for case in [["Global Airways HIGH", sim()], ["SunJet HIGH", other]]:
		var s: AirportSimulation = case[1]
		report.append("    %s:" % case[0])
		for id in ["GA", "SJ"]:
			var e: Dictionary = s.airlines.evaluations[id]
			report.append("      %-15s %s · mean delay %.1f min · resource-wait delay %.1f min/flight" % [s.airport.airlines[id], line(e), e.metrics.mean_delay_min, e.metrics.resource_delay_min])
	var ga_first: Dictionary = sim().airlines.evaluations
	var sj_first: Dictionary = other.airlines.evaluations
	check(ga_first.GA.relationship > sj_first.GA.relationship, "B · GA is better off when prioritized")
	check(sj_first.SJ.relationship > ga_first.SJ.relationship, "B · SJ is better off when prioritized")
	check(ga_first.SJ.contract.status != sj_first.SJ.contract.status, "B · SunJet's contract outcome depends on the choice")


func _hold_report() -> void:
	var other := AirportSimulation.new()
	other.setup(AirportSimulation.load_config(HOLD))
	finish(other)
	report.append("\nC · NS 305 +25 min feeding GA 298 at A4:")
	var sj_weights: Dictionary = sim().airlines.profile("SJ").weights
	for case in [["No hold", other], ["HOLD +5 MIN", sim()]]:
		var s: AirportSimulation = case[1]
		var f: AirportFlight = s.airport.flights.F012
		var made := 0
		var missed := 0
		for id in f.passenger_ids:
			var p: Passenger = s.airport.passengers[str(id)]
			if p.journey_direction == "connecting" and p.itinerary_legs[0] == "F013":
				if p.connection_status == "made": made += 1
				else: missed += 1
		var e: Dictionary = s.airlines.evaluations.GA
		report.append("    %-12s GA 298 +%.1f min · NS 305 connectors %d made / %d missed · GA punctuality %d · connections %d · GA day %.1f (read with SunJet's weights: %.1f) · %s" % [
			case[0], (f.actual_departure - f.scheduled_departure) / 600.0, made, missed, roundi(e.dimensions.punctuality.score), roundi(e.dimensions.connections.score),
			e.day_score, _weighted(e.metrics, sj_weights), line(e)])
	var held: Dictionary = sim().airlines.evaluations.GA
	var not_held: Dictionary = other.airlines.evaluations.GA
	check(held.dimensions.connections.score > not_held.dimensions.connections.score and held.dimensions.punctuality.score < not_held.dimensions.punctuality.score, "C · the hold trades punctuality for connections")
	check(held.day_score > not_held.day_score, "C · Global Airways' weights favour the hold")
	check(_weighted(held.metrics, sj_weights) < _weighted(not_held.metrics, sj_weights), "C · SunJet's weights would not")
