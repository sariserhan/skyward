extends SceneTree
## M4 demonstration: follow GA flight F004 (A220, gate A4), whose scenario gives
## it a 25-minute deep clean, and AW 228 (F002), whose service tasks all finish
## in time. Asserts the ten steps from the task records and event history and
## writes /tmp/m4-demo-*.png of the flight inspector.
##   tools/ui_tests.sh tests/m4_demo.gd

var main: Control
var frame := 0
var failures := 0


func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.save_path = "user://m4_demo.json"
	root.add_child(main)


func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)


func sim() -> AirportSimulation:
	return main.sim


func task(id: String, type: String) -> TurnaroundTask:
	return sim().turnaround.task(sim().airport.flights[id], type)


func until(predicate: Callable) -> void:
	for _i in 200000:
		if predicate.call(): return
		sim().step()
	check(false, "demo condition never reached")


func shot(name: String) -> void:
	main._refresh()
	root.get_viewport().get_texture().get_image().save_png("/tmp/m4-demo-%s.png" % name)


func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		2:
			sim().clock.paused = true
			main._select("F004")
			main.view_tabs.current_tab = 0
			main.operations_tabs.current_tab = main.turnaround_tree.get_index()
			until(func(): return task("F004", "cleaning").status == TurnaroundTask.RUNNING and sim().clock.tick >= task("F004", "cleaning").start_tick + 1800)
		3:
			shot("01-tasks-running-concurrently")
			until(func(): return task("F004", "catering").status == TurnaroundTask.COMPLETE and task("F004", "fueling").status == TurnaroundTask.COMPLETE)
		4:
			shot("02-boarding-blocked-by-cleaning")
			check(task("F004", "boarding").blocked_reason == "waiting for cleaning", "boarding visibly blocked by cleaning")
			check(main.detail.text.contains("Holding turnaround: Cleaning"), "headline names the task holding the turnaround")
			until(func(): return task("F004", "boarding").status == TurnaroundTask.RUNNING)
		5:
			shot("03-boarding-after-cleaning")
			until(func(): return sim().airport.flights.F004.status == "departed")
		6:
			shot("04-departed-with-explanation")
			check(main.detail.text.contains("Cleaning"), "inspector names the cleaning delay")
			main._select("F002")
			until(func(): return sim().airport.flights.F002.status == "departed")
		7:
			shot("05-on-time-service")
			_report()
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	return false


func _report() -> void:
	var f: AirportFlight = sim().airport.flights.F004
	var tasks: Array = sim().turnaround.tasks_of(f)
	print("\nM4 demonstration · %s · %s · gate %s · scheduled %s" % [f.flight_number, sim().airport.aircraft[f.aircraft_id].aircraft_type_id, f.assigned_gate_id, AirportClock.display(f.scheduled_departure)])
	print("  1  Aircraft docks                         %s" % AirportClock.display(f.gate_arrival_tick))
	for t: TurnaroundTask in tasks:
		var overrun := (t.finish_tick - t.start_tick) - (t.planned_finish_tick - t.planned_start_tick)
		print("     %-28s %s → %s  after %-22s %s" % [t.label, AirportClock.display(t.start_tick), AirportClock.display(t.finish_tick), t.started_after,
			"(+%.1f min over plan)" % (overrun / 600.0) if overrun > 0 and t.kind == "timed" else ""])
	var concurrent := 0
	for t: TurnaroundTask in tasks:
		if t.kind != "milestone" and t.start_tick == task("F004", "arrival_secured").finish_tick: concurrent += 1
	check(concurrent >= 3, "2-3: several tasks start together and run concurrently")
	var cleaning := task("F004", "cleaning")
	var boarding := task("F004", "boarding")
	check(cleaning.finish_tick - cleaning.start_tick > cleaning.planned_finish_tick - cleaning.planned_start_tick + 9000, "4: cleaning runs long")
	check(cleaning.finish_tick > f.scheduled_departure - 18000, "5: cleaning still running at D-30, so boarding waits")
	check(boarding.started_after == "cleaning" and f.boarding_open_tick == cleaning.finish_tick, "6-7: boarding opens as cleaning completes")
	check(task("F004", "pushback_ready").finish_tick == f.gate_release_tick, "8: pushback once ready")
	var late := f.actual_departure - f.scheduled_departure
	check(late > 0, "9: departs late")
	var total := 0
	for cause in f.departure_delay_breakdown: total += int(f.departure_delay_breakdown[cause])
	check(total == late and int(f.departure_delay_breakdown.get("cleaning", 0)) > 0, "10: the explanation adds up and names cleaning")
	print("  9  Departed %s, +%.1f min" % [AirportClock.display(f.actual_departure), late / 600.0])
	print("  10 Explanation: %s" % _explain(f))
	var on_time: AirportFlight = sim().airport.flights.F002
	var task_delay := 0
	for cause in on_time.departure_delay_breakdown:
		if sim().turnaround.task(on_time, cause) != null: task_delay += int(on_time.departure_delay_breakdown[cause])
	check(task_delay == 0, "second flight: turnaround tasks cause zero delay")
	var service_done := 0
	for t: TurnaroundTask in sim().turnaround.tasks_of(on_time):
		if t.kind == "timed": service_done = maxi(service_done, t.finish_tick)
	print("\n  Second flight %s: service tasks all done by %s, boarding opened %s (D-30), departed %s (%s)" % [on_time.flight_number,
		AirportClock.display(service_done), AirportClock.display(on_time.boarding_open_tick), AirportClock.display(on_time.actual_departure), _explain(on_time)])
	print("M4 demo: %d failures" % failures)


func _explain(f: AirportFlight) -> String:
	if f.departure_delay_breakdown.is_empty(): return "on time"
	var parts: Array = []
	for cause in f.departure_delay_breakdown: parts.append("%s +%.1f min" % [main._cause_label(f, cause), int(f.departure_delay_breakdown[cause]) / 600.0])
	return ", ".join(parts)
