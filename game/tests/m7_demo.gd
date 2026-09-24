extends SceneTree
## M7 demonstrations: checked baggage, driven through the real airport scene.
##   A: a local arrival reaches reclaim before their bag, waits, collects it,
##      and leaves.
##   B: a connector and their bag both make the connection.
##   C: NS 249 (F005) is 18 minutes late. The 1A passenger makes AW 228 (F002),
##      but their bag misses the D-15 bag cutoff: "Your passenger made the
##      connection. Their suitcase didn't."
##   D: AW 256 (F006) has a slow baggage loader (scenario override); baggage
##      loading holds its departure, and the delay is blamed on it.
## Writes /tmp/m7-demo-*.png.   tools/ui_tests.sh tests/m7_demo.gd

var main: Control
var frame := 0
var failures := 0
var timeline: Array = []
var local: Passenger
var local_bag: AirportBag
var cx: Passenger
var cx_bag: AirportBag
var late: Passenger
var late_bag: AirportBag
var candidates := {}


func _initialize() -> void:
	candidates = _pick_candidates()
	main = load("res://scenes/airport.tscn").instantiate()
	main.save_path = "user://m7_demo.json"
	root.add_child(main)


## A headless preview of the same morning picks who to follow: an early local
## with a long reclaim wait, and a connector (who flew on with their bag)
## walking to their next gate before NS 249's passengers are.
static func _pick_candidates() -> Dictionary:
	var preview := AirportSimulation.new()
	preview.setup()
	while preview.clock.tick < 330000: preview.step()
	var out := {"local": -1, "connector": -1}
	# A: the longest reclaim wait among locals who have left by 06:22.
	var best_wait := 0
	var left := 0
	for p: Passenger in preview.airport.passengers.values():
		if p.journey_direction != "arriving" or p.bags_collected_tick < 0 or p.left_airport_tick > 229200: continue
		if p.bags_collected_tick - p.reclaim_arrival_tick > best_wait:
			best_wait = p.bags_collected_tick - p.reclaim_arrival_tick
			out.local = p.id
			left = p.left_airport_tick
	# B: the first connector off their aircraft after that, who flew on with
	# their bag, and who is walking before NS 249's passengers are (06:36).
	var best := 1 << 40
	for p: Passenger in preview.airport.passengers.values():
		if p.journey_direction != "connecting" or p.checked_bag_ids.is_empty() or p.connection_status != "made": continue
		if p.deplaned_airport_tick <= left or p.deplaned_airport_tick >= 234000: continue
		if preview.airport.bags[p.checked_bag_ids[0]].state != "departed": continue
		if p.deplaned_airport_tick < best:
			best = p.deplaned_airport_tick
			out.connector = p.id
	return out


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
	root.get_viewport().get_texture().get_image().save_png("/tmp/m7-demo-%s.png" % name)


func note(what: String) -> void:
	timeline.append("  %s  %s" % [AirportClock.display(sim().clock.tick), what])


func flight(id: String) -> AirportFlight:
	return sim().airport.flights[id]


func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		2:
			sim().clock.paused = true
			check(candidates.local >= 0 and candidates.connector >= 0, "preview found both passengers to follow")
			local = sim().airport.passengers[str(candidates.local)]
			local_bag = sim().airport.bags[local.checked_bag_ids[0]]
			cx = sim().airport.passengers[str(candidates.connector)]
			cx_bag = sim().airport.bags[cx.checked_bag_ids[0]]
			for id in flight("F005").inbound_passenger_ids:
				var p: Passenger = sim().airport.passengers[str(id)]
				if p.journey_direction == "connecting" and AircraftDef.seat_key(int(p.itinerary_seats[0][0]), str(p.itinerary_seats[0][1])) == "1A": late = p
			late_bag = sim().airport.bags[late.checked_bag_ids[0]]
			# Demo A: the local waits at reclaim for their own bag.
			var a: AirportFlight = flight(local.current_flight_id)
			note("A · P%04d arriving on %s with %s" % [local.id, a.flight_number, local_bag.id])
			until(func(): return local.airport_state == "waiting_at_reclaim")
			note("A · P%04d at reclaim; %s is %s" % [local.id, local_bag.id, sim().baggage.describe(local_bag)])
			until(func(): return sim().clock.tick >= local.reclaim_arrival_tick + 300)
			main._select_passenger(local.id)
		3:
			check(main.detail.text.contains("Waiting at baggage reclaim"), "A · follow view shows the wait")
			check(main.detail.text.contains("Checked bag: " + local_bag.id), "A · the bag line names the passenger's own bag")
			shot("01-local-waiting-at-reclaim")
			until(func(): return local.airport_state == "left_airport")
			note("A · bag on the belt %s; collected after %s; left %s" % [AirportClock.display(local_bag.at_reclaim_tick), main._mmss(local.bags_collected_tick - local.reclaim_arrival_tick), AirportClock.display(local.left_airport_tick)])
			var last_bag := 0
			for id in local.checked_bag_ids: last_bag = maxi(last_bag, sim().airport.bags[id].at_reclaim_tick)
			check(local_bag.state == "collected" and local.bags_collected_tick == last_bag, "A · collected the moment the last bag arrived")
			# Demo B: a connector and their bag, both on their way.
			var b: AirportFlight = flight(cx.itinerary_legs[1])
			note("B · P%04d %s → %s with %s" % [cx.id, flight(cx.itinerary_legs[0]).flight_number, b.flight_number, cx_bag.id])
			until(func(): return cx.airport_state == "walking_to_gate")
			main._select_passenger(cx.id)
		4:
			check(main.detail.text.contains("Passenger: ") and main.detail.text.contains("/ Bag: "), "B · passenger and bag shown side by side")
			shot("02-connector-and-bag-on-track")
			note("B · walking to %s; bag %s" % [flight(cx.itinerary_legs[1]).assigned_gate_id, sim().baggage.describe(cx_bag)])
			# Demo C: NS 249 is late; follow 1A and their bag.
			until(func(): return late.airport_state == "walking_to_gate")
			main._select_passenger(late.id)
		5:
			check(main.detail.text.contains("Passenger: [color=#70dec0]ON TRACK") and main.detail.text.contains("Bag: [color=#ffc078]AT RISK"), "C · Passenger ON TRACK / Bag AT RISK")
			shot("03-passenger-on-track-bag-at-risk")
			note("C · P%04d off NS 249, walking to A2; %s %s" % [late.id, late_bag.id, sim().baggage.describe(late_bag)])
			until(func(): return flight("F002").bag_cutoff_passed)
			note("C · AW 228 bag cutoff %s: %s" % [AirportClock.display(flight("F002").bag_cutoff_tick), sim().baggage.describe(late_bag)])
			until(func(): return late.airport_state == "on_aircraft")
			note("C · P%04d seated on AW 228 (connection made); the bag is not" % late.id)
			main._select_passenger(late.id)
		6:
			check(main.detail.text.contains("Passenger: [color=#70dec0]BOARDED") and main.detail.text.contains("Bag: [color=#e5484d]MISSED CONNECTION"), "C · Passenger BOARDED / Bag MISSED CONNECTION")
			shot("04-passenger-made-it-bag-did-not")
			main._select("F002")
		7:
			check(main.detail.text.contains("missed the bag cutoff"), "C · flight shows the missed bag")
			shot("05-aw228-bag-missed")
			# Demo D: AW 256's slow loader holds departure.
			var d: AirportFlight = flight("F006")
			until(func(): return d.boarding_phase in ["closed", "complete"] and sim().turnaround.holding(d) != null and sim().turnaround.holding(d).type == Turnaround.BAGGAGE_LOAD)
			note("D · AW 256 gate closed %s; baggage still loading" % AirportClock.display(d.gate_closed_tick))
			main._select("F006")
			main.view_tabs.current_tab = 0
			main.operations_tabs.current_tab = main.turnaround_tree.get_index()
		8:
			check(main.detail.text.contains("Holding departure: Baggage load"), "D · holding departure: baggage load")
			shot("06-baggage-load-holding-departure")
			var d: AirportFlight = flight("F006")
			until(func(): return d.status == "departed")
			note("D · AW 256 departed %s · %s" % [AirportClock.display(d.actual_departure), _explain(d)])
			check(int(d.departure_delay_breakdown.get("baggage_load", 0)) > 0, "D · delay blamed on baggage loading")
			main._select("F006")
		9:
			shot("07-baggage-delay-attributed")
			_report()
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	# Refresh now so the next frame's capture shows this frame's state.
	if main != null:
		main._refresh()
		main.terminal_view.refresh_population()
	return false


func _report() -> void:
	print("\nM7 demonstration · checked baggage")
	for line in timeline: print(line)
	until(func(): return flight(cx.itinerary_legs[1]).status == "departed")
	print("  B · outcome: bag %s loaded %s (bag cutoff %s); P%04d seated %s" % [cx_bag.id, AirportClock.display(cx_bag.loaded_tick), AirportClock.display(flight(cx.itinerary_legs[1]).bag_cutoff_tick), cx.id, AirportClock.display(cx.seated_airport_tick)])
	check(cx.connection_status == "made" and cx_bag.state in ["on_aircraft", "departed"], "B · both made it")
	check(late.connection_status == "made" and late_bag.state == "missed_connection", "C · passenger made it, bag missed")
	var m := sim().baggage_metrics()
	print("\n  So far: %d bags · transfer %d made / %d missed · %d held · %d at reclaim · mean reclaim wait %.1f min" % [m.bags, m.transfer_made, m.transfer_missed, m.held, m.at_reclaim, m.mean_reclaim_wait_ticks / 600.0])
	print("M7 demo: %d failures" % failures)


func _explain(f: AirportFlight) -> String:
	if f.departure_delay_breakdown.is_empty(): return "on time"
	var parts: Array = []
	for cause in f.departure_delay_breakdown: parts.append("%s +%.1f min" % [main._cause_label(f, cause), int(f.departure_delay_breakdown[cause]) / 600.0])
	return ", ".join(parts)
