extends SceneTree
## M3 demonstration (airport_tycoon.md §51): follow demo flight F002 (737, 90%
## load, one deliberately late passenger) through the live Riverdale scene.
## Asserts the twelve steps happen in order and writes screenshots to
## /tmp/m3-demo-*.png. Run under a virtual display:
##   xvfb-run -a -s "-screen 0 1280x800x24" godot --path game --audio-driver Dummy --script tests/m3_demo.gd

var main: Control
var frame := 0
var failures := 0
var late: Passenger


func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.save_path = "user://m3_demo.json"
	root.add_child(main)


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
	root.get_viewport().get_texture().get_image().save_png("/tmp/m3-demo-%s.png" % name)


func _process(_delta: float) -> bool:
	frame += 1
	var f: AirportFlight = sim().airport.flights.F002 if main != null and main.sim != null else null
	match frame:
		2:
			sim().clock.paused = true
			for id in f.passenger_ids:
				var p: Passenger = sim().airport.passengers[str(id)]
				if p.arrival_time_at_airport >= f.scheduled_departure - 6000: late = p
			check(late != null, "demo flight has a deliberately late passenger")
			main._select("F002")
			until(func(): return f.status == "at_gate")
			main.view_tabs.current_tab = 0
		3:
			shot("01-aircraft-at-gate")
			main.view_tabs.current_tab = 1
			main.operations_tabs.current_tab = 1
			until(func(): return int(sim().passenger_flow.ready_by_flight.F002) > 100)
		4:
			shot("02-passengers-security-and-gate")
			until(func(): return f.boarding_phase == "open" and sim().boarding_sessions.F002.engine.seated_count > 30)
			main.boarding_overlay.show_flight(sim(), "F002")
		5:
			shot("03-cabin-boarding")
			until(func(): return sim().clock.tick >= f.gate_close_tick - 1200)
			main.boarding_overlay.visible = false
			main._select_passenger(late.id)
		6:
			shot("04-late-passenger-en-route")
			until(func(): return late.airport_state == "missed_flight")
			main._select_passenger(late.id)
		7:
			shot("05-late-passenger-missed")
			main.view_tabs.current_tab = 0
			main._select("F002")
			until(func(): return f.status == "taxiing_out")
		8:
			shot("06-pushback-taxi")
			until(func(): return f.status == "departed")
		9:
			shot("07-departed")
			_report(f)
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	return false


## §51 steps, taken from the authoritative event history.
func _report(f: AirportFlight) -> void:
	var first := {}
	for event in sim().events.history:
		if event.flight_id != "F002": continue
		var key: String = event.type
		if event.type == "FLIGHT_STATE_CHANGED": key = "STATE_" + event.details.to
		if event.type == "PASSENGER_SECURITY_EXIT" and event.details.passenger_id == late.id: key = "LATE_SECURITY_EXIT"
		if event.type == "PASSENGER_MISSED_FLIGHT" and event.details.passenger_id == late.id: key = "LATE_MISSED"
		if event.type == "PASSENGER_GATE_ARRIVE" and event.details.passenger_id == late.id: key = "LATE_AT_CLOSED_GATE"
		if event.type == "RUNWAY_STARTED" and event.details.operation == "takeoff": key = "TAKEOFF_ROLL"
		if not first.has(key): first[key] = int(event.tick)
	var last_seated := f.last_seated_tick
	var steps := [
		["1  Aircraft arrives at gate", "FLIGHT_GATE_ARRIVAL"],
		["2  Passengers pass security", "PASSENGER_SECURITY_EXIT"],
		["3  Passengers walk to gate", "PASSENGER_GATE_ARRIVE"],
		["4  Boarding opens", "BOARDING_OPENED"],
		["5  Passengers queue at the door", "PASSENGER_BOARDING"],
		["6  Cabin simulation seats passengers", "PASSENGER_ON_AIRCRAFT"],
		["8  Last passenger seated", ""],
		["   Gate closes (late passenger missing)", "GATE_CLOSED"],
		["   Late passenger missed", "LATE_MISSED"],
		["9  Boarding complete", "BOARDING_COMPLETE"],
		["10 Pushback", "FLIGHT_PUSHBACK"],
		["11 Taxi", "STATE_taxiing_out"],
		["12 Takeoff / departed", "FLIGHT_DEPARTED"],
		["   Late passenger reaches closed gate", "LATE_AT_CLOSED_GATE"],
	]
	# Passengers reach the gate independently of the aircraft; both chains must
	# be ordered and meet at boarding open.
	var chains := [["2  ", "3  ", "4  "], ["1  ", "4  ", "5  ", "6  ", "8  ", "9  ", "10 ", "11 ", "12 "]]
	var at := {}
	print("\nM3 demonstration · %s · %s · %d passengers · strategy %s" % [f.flight_number, sim().airport.aircraft[f.aircraft_id].aircraft_type_id, f.passenger_ids.size(), f.boarding_strategy])
	for step in steps:
		var tick: int = last_seated if step[1].is_empty() else int(first.get(step[1], -1))
		check(tick >= 0, "missing step: " + step[0])
		at[step[0].left(3)] = tick
		print("  %-40s %s" % [step[0], AirportClock.display(tick) if tick >= 0 else "—"])
	for chain in chains:
		for i in range(1, chain.size()):
			check(at[chain[i]] >= at[chain[i - 1]], "out of order: step %s before %s" % [chain[i], chain[i - 1]])
	var r := f.boarding_result
	# Step 7: carry-ons and seat interference visibly affect boarding.
	check(int(r.stow_ticks) > 0 and int(r.seat_wait_ticks) > 0 and int(r.blocked_ticks) > 0, "carry-ons and seat interference had an effect")
	check(late.airport_state == "missed_flight" and late.boarding_admit_tick < 0, "late passenger never boarded")
	check(f.missed_count == 1 and f.boarded_count == f.passenger_ids.size() - 1, "exactly the late passenger missed")
	print("  7  Carry-ons / seat interference: aisle blocked %.0f s, stowing %.0f s, seat-access waits %.0f s" % [int(r.blocked_ticks) / 30.0, int(r.stow_ticks) / 30.0, int(r.seat_wait_ticks) / 30.0])
	for b in r.top_blockers:
		print("     seat %s (%d bags, %d obstructing) held up the aisle %.0f s" % [b.seat, int(b.carry_on_count), int(b.obstruction_count), int(b.caused_blocked_ticks) / 30.0])
	print("  Late passenger P%04d: reached airport %s, missed (%s at close), stands at gate %s" % [late.id, AirportClock.display(late.arrival_time_at_airport), late.missed_reason.replace("_", " "), late.current_location])
	print("  Scheduled %s · departed %s · delay causes %s" % [AirportClock.display(f.scheduled_departure), AirportClock.display(f.actual_departure), JSON.stringify(f.delay_reasons)])
	print("M3 demo: %d failures" % failures)
