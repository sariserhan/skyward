extends SceneTree
## M5 demonstrations, driven through the real airport scene.
##   A: AW 228 (F002) arrives; follow one inbound passenger from their seat,
##      down the aisle, off the aircraft, through the terminal to the exit.
##   B: SJ 235 (F003) has a slow jet-bridge door (scenario deboarding override):
##      deboarding holds cleaning and catering, then boarding and pushback, and
##      the departure delay is attributed to deboarding.
## Writes /tmp/m5-demo-*.png.   tools/ui_tests.sh tests/m5_demo.gd

var main: Control
var frame := 0
var failures := 0
var follow: Passenger
var timeline: Array = []


func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.save_path = "user://m5_demo.json"
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
	main.terminal_view.refresh_population()
	root.get_viewport().get_texture().get_image().save_png("/tmp/m5-demo-%s.png" % name)


func note(what: String) -> void:
	timeline.append("  %s  %s" % [AirportClock.display(sim().clock.tick), what])


func _process(_delta: float) -> bool:
	frame += 1
	var f: AirportFlight = sim().airport.flights.F002 if main != null else null
	match frame:
		2:
			sim().clock.paused = true
			# Follow a mid-cabin window passenger: they wait for their row, then the aisle.
			for p in sim()._inbound(f):
				if p.seat_row >= 14 and p.seat_type == Passenger.SeatType.WINDOW:
					follow = p
					break
			main._select_passenger(follow.id)
			check(follow.airport_state == "on_aircraft", "A2: seated on the arriving aircraft")
			until(func(): return f.status == "turnaround")
			note("1  AW 228 docks at %s; P%04d seated in %s" % [f.assigned_gate_id, follow.id, follow.seat_key()])
			until(func(): return f.deplaned_count >= 15)
			note("3  Deboarding under way: %d off" % f.deplaned_count)
			main._open_cabin()
		3:
			check(main.boarding_overlay.visible and main.boarding_overlay.mode == "deboarding", "cabin view in deboarding mode")
			check(main.boarding_overlay.view.selected_id == follow.id, "5: the cabin view follows the selected passenger")
			shot("01-deboarding-cabin")
			until(func(): return follow.aisle_position >= 0)
			note("4  P%04d steps into the aisle at row %d (%s)" % [follow.id, follow.aisle_position, follow.state_name()])
		4:
			shot("02-followed-passenger-in-aisle")
			until(func(): return follow.airport_state == "walking_to_exit")
			note("6-7  P%04d leaves the aircraft and enters the terminal at %s" % [follow.id, follow.current_location])
			main.boarding_overlay.closed.emit()
			main._select_passenger(follow.id)
			sim().advance(300)
		5:
			check(main.detail.text.contains("walking to the exit"), "inspector follows them into the terminal")
			shot("03-followed-passenger-in-terminal")
			note("8  P%04d walking to the exit, now at %s" % [follow.id, follow.current_location.replace("_", " ")])
			until(func(): return task("F002", Turnaround.DEBOARDING).status == TurnaroundTask.COMPLETE)
			note("9  Deboarding complete: %d passengers off" % f.deplaned_count)
			until(func(): return task("F002", "cleaning").status == TurnaroundTask.RUNNING)
			note("10 Cleaning and catering start")
			main._select("F002")
			main.view_tabs.current_tab = 0
			main.operations_tabs.current_tab = main.turnaround_tree.get_index()
		6:
			shot("04-cleaning-after-deboarding")
			# Demonstration B runs alongside: SJ 235 is still deboarding.
			main._select("F003")
			until(func(): return task("F003", Turnaround.DEBOARDING).status == TurnaroundTask.RUNNING and sim().clock.tick >= task("F003", Turnaround.DEBOARDING).start_tick + 6000)
		7:
			check(task("F003", "catering").blocked_reason == "waiting for deboarding", "B: catering waits for deboarding")
			check(main.detail.text.contains("Holding turnaround: Deboarding"), "B: headline names deboarding")
			shot("05-slow-deboarding-holding-turnaround")
			until(func(): return follow.airport_state == "left_airport")
			note("   P%04d leaves the airport" % follow.id)
			until(func(): return f.status == "departed")
			note("11 AW 228 departs (%s)" % _explain(f))
			until(func(): return sim().airport.flights.F003.status == "departed")
		8:
			shot("06-slow-deboarding-explained")
			_report()
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	return false


func _report() -> void:
	print("\nM5 demonstration A · AW 228 · following P%04d from seat %s" % [follow.id, follow.seat_key()])
	for line in timeline: print(line)
	check(follow.airport_state == "left_airport" and follow.deplaned_airport_tick > 0, "A: seat to airport exit")
	var f: AirportFlight = sim().airport.flights.F003
	var deb := task("F003", Turnaround.DEBOARDING)
	var cleaning := task("F003", "cleaning")
	print("\nM5 demonstration B · %s · %s · slow jet-bridge door" % [f.flight_number, sim().airport.aircraft[f.aircraft_id].aircraft_type_id])
	print("  Deboarding          %s → %s  (%.1f min, plan %.1f)" % [AirportClock.display(deb.start_tick), AirportClock.display(deb.finish_tick), (deb.finish_tick - deb.start_tick) / 600.0, deb.nominal_ticks / 600.0])
	print("  Cleaning            %s → %s  after %s" % [AirportClock.display(cleaning.start_tick), AirportClock.display(cleaning.finish_tick), cleaning.started_after])
	print("  Boarding opened     %s  (D-30 was %s)" % [AirportClock.display(f.boarding_open_tick), AirportClock.display(f.scheduled_departure - 18000)])
	print("  Pushback            %s  (scheduled %s)" % [AirportClock.display(f.gate_release_tick), AirportClock.display(sim()._scheduled_pushback(f))])
	print("  Departed            %s, +%.1f min: %s" % [AirportClock.display(f.actual_departure), (f.actual_departure - f.scheduled_departure) / 600.0, _explain(f)])
	check(cleaning.started_after == "deboarding" and cleaning.start_tick > deb.finish_tick, "B: deboarding delays cleaning")
	check(f.boarding_open_tick > f.scheduled_departure - 18000, "B: boarding opens late")
	check(f.gate_release_tick > sim()._scheduled_pushback(f), "B: pushback late")
	check(int(f.departure_delay_breakdown.get("deboarding", 0)) > 0, "B: delay attributed to deboarding")
	print("M5 demo: %d failures" % failures)


func _explain(f: AirportFlight) -> String:
	if f.departure_delay_breakdown.is_empty(): return "on time"
	var parts: Array = []
	for cause in f.departure_delay_breakdown: parts.append("%s +%.1f min" % [main._cause_label(f, cause), int(f.departure_delay_breakdown[cause]) / 600.0])
	return ", ".join(parts)
