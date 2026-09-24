extends SceneTree
## M6 demonstration: the connection bank. NS 249 (F005) arrives 18 minutes late
## at A5; four of its passengers (seats 1A, 28C, 19D, 26E) connect to AW 228
## (F002) at A2, which closes at 06:47.
##   1. Follow 1A from the inbound seat, off the aircraft, across the terminal,
##      into AW 228's cabin and a new seat.
##   2. At AW 228's gate-close alert, the inspector shows who is still inbound.
##      The rendered run does nothing (default auto close): 19D and 26E miss and
##      are stranded, with the cause explained.
##   3. A headless replay with HOLD +5 MIN shows the trade-off.
## Writes /tmp/m6-demo-*.png.   tools/ui_tests.sh tests/m6_demo.gd

var main: Control
var frame := 0
var failures := 0
var bank := {}
var follow: Passenger
var timeline: Array = []


func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.save_path = "user://m6_demo.json"
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
	root.get_viewport().get_texture().get_image().save_png("/tmp/m6-demo-%s.png" % name)


func note(what: String) -> void:
	timeline.append("  %s  %s" % [AirportClock.display(sim().clock.tick), what])


static func banked(s: AirportSimulation) -> Dictionary:
	var out := {}
	for id in s.airport.flights.F002.passenger_ids:
		var p: Passenger = s.airport.passengers[str(id)]
		if p.journey_direction == "connecting" and p.itinerary_legs[0] == "F005":
			var seat: String = AircraftDef.seat_key(int(p.itinerary_seats[0][0]), str(p.itinerary_seats[0][1]))
			if seat in ["1A", "28C", "19D", "26E"]: out[seat] = p
	return out


func _process(_delta: float) -> bool:
	frame += 1
	var b: AirportFlight = sim().airport.flights.F002
	match frame:
		2:
			sim().clock.paused = true
			bank = banked(sim())
			check(bank.size() == 4, "the demo bank is on AW 228's manifest")
			follow = bank["1A"]
			main._select_passenger(follow.id)
			check(main.detail.text.contains("CONNECTING NS 249 → AW 228"), "follow view shows the connection")
			note("P%04d seated in 1A on NS 249, booked on AW 228" % follow.id)
			until(func(): return follow.airport_state == "deboarding" and follow.aisle_position >= 0)
			note("NS 249 docked %s (18 min late); P%04d in the aisle" % [AirportClock.display(sim().airport.flights.F005.gate_arrival_tick), follow.id])
			main._open_cabin()
		3:
			check(main.boarding_overlay.mode == "deboarding" and main.boarding_overlay.view.selected_id == follow.id, "followed in the inbound cabin")
			shot("01-connector-deboarding-inbound")
			until(func(): return follow.airport_state == "walking_to_gate")
			note("Off NS 249 at A5; walking airside to A2 (seat switched to %s)" % follow.seat_key())
			main.boarding_overlay.closed.emit()
			main._select_passenger(follow.id)
			sim().advance(600)
		4:
			check(main.detail.text.contains("ON TRACK") or main.detail.text.contains("AT RISK"), "urgency shown while walking")
			shot("02-connector-walking-to-next-gate")
			until(func(): return follow.airport_state == "boarding")
			note("At A2 %s; admitted to AW 228's door queue" % AirportClock.display(follow.gate_arrival_time))
			# The decision point: 2 minutes before AW 228's gate closes.
			until(func(): return b.boarding_phase == "open" and sim().clock.tick >= b.gate_close_tick - 1200)
			main._open_cabin()
		5:
			check(main.boarding_overlay.mode == "boarding" and main.boarding_overlay.view.selected_id == follow.id, "followed in the outbound cabin")
			shot("03-connector-boarding-outbound")
			main.boarding_overlay.closed.emit()
			main._select("F002")
		6:
			var alert_text := ""
			for i in main.alerts.item_count: alert_text += main.alerts.get_item_text(i) + " / "
			check(alert_text.contains("AW 228") and alert_text.contains("connecting"), "grouped alert names the connectors: " + alert_text)
			check(main.detail.text.contains("connecting still inbound"), "inspector lists who is still inbound")
			check(sim().can_hold("F002"), "HOLD +5 MIN is available")
			note("Alert: " + alert_text.trim_suffix(" / "))
			shot("04-gate-close-decision")
			until(func(): return b.boarding_phase in ["closed", "complete"])
			note("AW 228 gate closed %s (no hold)" % AirportClock.display(b.gate_closed_tick))
			until(func(): return follow.airport_state == "on_aircraft")
			note("P%04d seated in %s on AW 228 (connection made)" % [follow.id, follow.seat_key()])
			main._select_passenger(bank["26E"].id)
			until(func(): return bank["26E"].airport_state == "missed_connection")
		7:
			check(main.detail.text.contains("MISSED CONNECTION"), "missed connection explained")
			shot("05-missed-connection-explained")
			until(func(): return b.status == "departed")
			_report()
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	# Refresh now so the next frame's capture shows this frame's state.
	if main != null:
		main._refresh()
		main.terminal_view.refresh_population()
	return false


func _report() -> void:
	var b: AirportFlight = sim().airport.flights.F002
	print("\nM6 demonstration · NS 249 (18 min late) → AW 228 · following P%04d" % follow.id)
	for line in timeline: print(line)
	check(follow.connection_status == "made" and follow.airport_state == "departed" and follow.current_flight_id == "F002", "followed passenger flew on")
	print("\n  Without a hold (AW 228 departed %s, %s):" % [AirportClock.display(b.actual_departure), _explain(b)])
	_print_bank(sim(), bank)
	check(bank["1A"].connection_status == "made" and bank["28C"].connection_status == "made", "1A and 28C make it")
	check(bank["19D"].connection_status == "missed" and bank["26E"].connection_status == "missed", "19D and 26E miss without a hold")
	# The same morning, holding AW 228 once at its alert.
	var held := AirportSimulation.new()
	held.setup()
	var hb: AirportFlight = held.airport.flights.F002
	while not (hb.boarding_phase == "open" and held.clock.tick >= hb.gate_close_tick - 600): held.step()
	held.hold_flight("F002")
	while hb.status != "departed": held.step()
	var held_bank := banked(held)
	print("\n  With HOLD +5 MIN (AW 228 departed %s, %s):" % [AirportClock.display(hb.actual_departure), _explain(hb)])
	_print_bank(held, held_bank)
	for seat in held_bank: check(held_bank[seat].connection_status == "made", seat + " makes it with the hold")
	check(hb.actual_departure > b.actual_departure, "the hold costs departure time")
	var m := sim().connection_metrics()
	print("\n  Airport connections (no hold run, so far): %d made, %d missed, %d pending; min margin %.1f min" % [m.made, m.missed, m.pending, m.min_margin_ticks / 600.0])
	print("M6 demo: %d failures" % failures)


func _print_bank(s: AirportSimulation, passengers: Dictionary) -> void:
	for seat in ["1A", "28C", "19D", "26E"]:
		var p: Passenger = passengers[seat]
		var r := s.connection_report(p)
		print("    %-4s P%04d  off %s  at A2 %s  vs close %s  → %s%s" % [seat, p.id, AirportClock.display(p.deplaned_airport_tick).left(8),
			AirportClock.display(p.gate_arrival_time).left(8), AirportClock.display(int(r.gate_close)).left(8), p.connection_status.to_upper(),
			"  (" + str(r.decisive) + ")" if p.connection_status == "missed" else ""])


func _explain(f: AirportFlight) -> String:
	if f.departure_delay_breakdown.is_empty(): return "on time"
	var parts: Array = []
	for cause in f.departure_delay_breakdown: parts.append("%s +%.1f min" % [main._cause_label(f, cause), int(f.departure_delay_breakdown[cause]) / 600.0])
	return ", ".join(parts)
