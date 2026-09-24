extends SceneTree
## M8 demonstrations in the resource-shortage morning (2 fuel units, 4 baggage
## crews, 1 tug), driven through the real airport scene.
##   A: automatic contention. Fuel units 2/2 busy with flights waiting; when a
##      unit frees, the next flight in the deterministic order starts.
##   B: player agency. SJ 263 and GA 270 compete for the next fuel unit. A
##      headless replay from the same moment shows the default outcome; the
##      rendered run sets GA 270 HIGH. GA 270 improves, SJ 263 gets worse.
##   C: cascade. A shortage-delayed turnaround holds its gate; the next arrival
##      waits for that gate (found by a preview of this same morning).
## Writes /tmp/m8-demo-*.png.   tools/ui_tests.sh tests/m8_demo.gd

const SHORTAGE := "res://configs/airports/riverdale_shortage.json"

var main: Control
var frame := 0
var failures := 0
var timeline: Array = []
var predicted := ""
var decision_save := ""
var cascade := {}


func _initialize() -> void:
	cascade = _preview_cascade()
	main = load("res://scenes/airport.tscn").instantiate()
	main.scenario_path = SHORTAGE
	main.save_path = "user://m8_demo.json"
	root.add_child(main)


static func _find(s: AirportSimulation, number: String) -> AirportFlight:
	for f: AirportFlight in s.flight_order:
		if f.flight_number == number: return f
	return null


static func _decision_moment(s: AirportSimulation) -> bool:
	var q := s.resource_queue("fuel_unit")
	return q.size() >= 2 and q[0].flight_id == _find(s, "SJ 263").id and q[1].flight_id == _find(s, "GA 270").id


## The same morning with the same decision, headless: a flight delayed by a
## resource wait whose gate the next arrival had to wait for.
static func _preview_cascade() -> Dictionary:
	var s := AirportSimulation.new()
	s.setup(AirportSimulation.load_config(SHORTAGE))
	while not _decision_moment(s): s.step()
	s.set_service_priority(_find(s, "GA 270").id, "high")
	while s.clock.tick < 330000: s.step()
	for next: AirportFlight in s.flight_order:
		if int(next.delay_reasons.get("gate_wait", 0)) < 600: continue
		for prev: AirportFlight in s.flight_order:
			if prev.assigned_gate_id != next.assigned_gate_id or prev.gate_release_tick < 0 or prev.gate_release_tick > next.gate_arrival_tick: continue
			if prev.gate_release_tick < next.gate_arrival_tick - 50: continue
			for cause in prev.departure_delay_breakdown:
				if str(cause).begins_with("wait:"): return {"prev": prev.id, "next": next.id, "gate": prev.assigned_gate_id}
	return {}


func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)


func sim() -> AirportSimulation:
	return main.sim


func until(predicate: Callable) -> void:
	for _i in 200000:
		if predicate.call(): return
		sim().step()
	check(false, "demo condition never reached")


func shot(name: String) -> void:
	main._refresh()
	main.terminal_view.refresh_population()
	root.get_viewport().get_texture().get_image().save_png("/tmp/m8-demo-%s.png" % name)


func note(what: String) -> void:
	timeline.append("  %s  %s" % [AirportClock.display(sim().clock.tick), what])


func queue_names() -> String:
	var names: Array = []
	for t in sim().resource_queue("fuel_unit"): names.append(sim().airport.flights[t.flight_id].flight_number)
	return ", ".join(names)


func show_resources() -> void:
	main.view_tabs.current_tab = 0
	main.operations_tabs.current_tab = main.resource_tree.get_index()


func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		2:
			sim().clock.paused = true
			check(sim().config.id == "riverdale_shortage", "the shortage scenario is loaded")
			check(not cascade.is_empty(), "preview found a cascade")
			# Demo A: both fuel units busy, flights queued.
			until(func(): return sim().resource_queue("fuel_unit").size() >= 2 and AirportResources.busy(sim().resources.pools.fuel_unit) == 2)
			var waiting: TurnaroundTask = sim().resource_queue("fuel_unit")[0]
			predicted = waiting.flight_id
			note("A · fuel units 2/2 busy · waiting: %s" % queue_names())
			main._select(waiting.flight_id)
			show_resources()
		3:
			check(main.detail.text.contains("WAITING FOR FUEL UNIT"), "A · the flight says why it is waiting")
			check(main.resource_tree.get_root().get_child(3).get_text(1) == "2 / 2", "A · Resources shows fuel 2 / 2 busy")
			shot("01-fuel-units-all-busy")
			var before: int = sim().resources.pools.fuel_unit.stats.allocations
			until(func(): return sim().resources.pools.fuel_unit.stats.allocations > before)
			var started: TurnaroundTask = sim().turnaround.task(sim().airport.flights[predicted], "fueling")
			check(started.status == TurnaroundTask.RUNNING, "A · the unit went to the head of the queue")
			note("A · a fuel unit freed: %s starts fueling after %s (next in line, as shown)" % [sim().airport.flights[predicted].flight_number, main._mmss(started.resource_wait_ticks)])
			# Demo B: SJ 263 first in line, GA 270 second.
			until(func(): return _decision_moment(sim()))
			decision_save = JSON.stringify(sim().snapshot())
			note("B · fuel queue: %s" % queue_names())
			main._select(_find(sim(), "GA 270").id)
			show_resources()
		4:
			check(main.detail.text.contains("WAITING FOR FUEL UNIT"), "B · GA 270 waits")
			shot("02-before-priority")
			main.priority_buttons["high"].pressed.emit()
			check(_find(sim(), "GA 270").service_priority == "high", "B · the HIGH button sets priority")
			note("B · player sets GA 270 HIGH · queue now: %s" % queue_names())
			check(sim().resource_queue("fuel_unit")[0].flight_id == _find(sim(), "GA 270").id, "B · GA 270 is next in line")
		5:
			shot("03-after-priority")
			# Demo C: the delayed flight holds its gate while the next one waits.
			var prev: AirportFlight = sim().airport.flights[cascade.prev]
			var next: AirportFlight = sim().airport.flights[cascade.next]
			until(func(): return next.status == "taxiing_in" and sim().clock.tick >= next.due_tick and sim().airport.gates[cascade.gate].occupied_by_flight_id == prev.id)
			note("C · %s lands; gate %s still held by %s (%s)" % [next.flight_number, cascade.gate, prev.flight_number, prev.status.replace("_", " ")])
			main._select(prev.id)
			main.operations_tabs.current_tab = main.turnaround_tree.get_index()
		6:
			shot("04-gate-held-next-arrival-waits")
			var prev: AirportFlight = sim().airport.flights[cascade.prev]
			var next: AirportFlight = sim().airport.flights[cascade.next]
			until(func(): return prev.status == "departed" and next.status in ["turnaround", "boarding", "ready_for_pushback", "taxiing_out", "departed"])
			note("C · %s departed %s: %s" % [prev.flight_number, AirportClock.display(prev.actual_departure), _explain(prev)])
			note("C · %s reached gate %s after waiting %s for it" % [next.flight_number, AirportClock.display(next.gate_arrival_tick), main._mmss(int(next.delay_reasons.get("gate_wait", 0)))])
			until(func(): return _find(sim(), "GA 270").status == "departed" and _find(sim(), "SJ 263").status == "departed")
			main._select(_find(sim(), "GA 270").id)
		7:
			shot("05-priority-outcome")
			_report()
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	if main != null:
		main._refresh()
		main.terminal_view.refresh_population()
	return false


func _report() -> void:
	print("\nM8 demonstration · resource shortage (2 fuel units, 4 baggage crews, 1 tug)")
	for line in timeline: print(line)
	# The same moment without the decision, headless.
	var replay := AirportSimulation.from_snapshot(JSON.parse_string(decision_save))
	var sj: AirportFlight = _find(replay, "SJ 263")
	var ga: AirportFlight = _find(replay, "GA 270")
	while sj.status != "departed" or ga.status != "departed": replay.step()
	var live_sj: AirportFlight = _find(sim(), "SJ 263")
	var live_ga: AirportFlight = _find(sim(), "GA 270")
	print("\n  B · who fuels next when a unit frees:")
	print("    Default order (SJ 263 first): SJ 263 %s · GA 270 %s" % [_late(sj), _late(ga)])
	print("      SJ 263: %s\n      GA 270: %s" % [_explain(sj), _explain(ga)])
	print("    GA 270 HIGH:                  SJ 263 %s · GA 270 %s" % [_late(live_sj), _late(live_ga)])
	print("      SJ 263: %s\n      GA 270: %s" % [_explain(live_sj), _explain(live_ga)])
	check(live_ga.actual_departure < ga.actual_departure, "B · GA 270 improves")
	check(live_sj.actual_departure > sj.actual_departure, "B · SJ 263 gets worse")
	var m := sim().resource_metrics()
	print("\n  So far: %d flights delayed by shortages, %.1f min of departure delay blamed on waiting for resources" % [m.flights_delayed, m.delay_ticks / 600.0])
	for type in m.pools:
		var p: Dictionary = m.pools[type]
		print("    %-15s %d units · %d%% used · %d of %d tasks waited · mean %.1f / max %.1f min · peak queue %d" % [p.label, p.units, roundi(p.utilization * 100), p.waited, p.requests, p.mean_wait_ticks / 600.0, p.max_wait_ticks / 600.0, p.peak_queue])
	print("M8 demo: %d failures" % failures)


func _late(f: AirportFlight) -> String:
	return "+%.1f min" % ((f.actual_departure - f.scheduled_departure) / 600.0)


func _explain(f: AirportFlight) -> String:
	if f.departure_delay_breakdown.is_empty(): return "on time"
	var parts: Array = []
	for cause in f.departure_delay_breakdown: parts.append("%s +%.1f" % [main._cause_label(f, cause), int(f.departure_delay_breakdown[cause]) / 600.0])
	return ", ".join(parts)
