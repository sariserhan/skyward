class_name BoardingOverlay
extends Control
## Full inspection overlay for one flight's live cabin boarding. It embeds the
## standalone game's AircraftView bound to the airport's authoritative engine and
## only observes it: the airport keeps stepping underneath at the chosen speed.

signal closed

var sim: AirportSimulation
var flight_id: String = ""
var view: AircraftView
var header: Label
var detail: Label
var summary: Label

const INK := Color("a7becd")
const MINT := Color("70dec0")


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var shade := ColorRect.new()
	shade.color = Color(0.03, 0.07, 0.1, 0.94)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for edge in ["left", "right", "top", "bottom"]: margin.add_theme_constant_override("margin_" + edge, 28)
	add_child(margin)
	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 10)
	margin.add_child(layout)
	var top := HBoxContainer.new()
	layout.add_child(top)
	header = Label.new()
	header.add_theme_font_size_override("font_size", 20)
	header.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(header)
	var close := Button.new()
	close.text = "Close  (Esc)"
	close.pressed.connect(func(): closed.emit())
	top.add_child(close)
	detail = Label.new()
	detail.modulate = INK
	layout.add_child(detail)
	view = AircraftView.new()
	view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	layout.add_child(view)
	summary = Label.new()
	summary.modulate = MINT
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	layout.add_child(summary)


func show_flight(p_sim: AirportSimulation, id: String) -> void:
	sim = p_sim
	flight_id = id
	view.selected_id = -1
	visible = true
	refresh()


func _process(_delta: float) -> void:
	if visible: refresh()


func refresh() -> void:
	if sim == null or not sim.airport.flights.has(flight_id): return
	var f: AirportFlight = sim.airport.flights[flight_id]
	var session: FlightBoarding = sim.boarding_sessions.get(flight_id)
	view.sim = session.engine if session != null else null
	var boarding := 0
	var seated := 0
	for id in f.passenger_ids:
		match sim.airport.passengers[str(id)].airport_state:
			"boarding": boarding += 1
			"on_aircraft", "departed": seated += 1
	var missing := sim.missing_passengers(f) if f.boarding_phase == "open" else f.missed_count
	header.text = "%s  ·  %s  ·  Gate %s  ·  %s" % [f.flight_number, BoardingStrategy.PRESET_NAMES.get(f.boarding_strategy, f.boarding_strategy),
		f.assigned_gate_id, f.boarding_phase.to_upper() if not f.boarding_phase.is_empty() else "NOT OPEN"]
	var close_text := "Gate closes %s" % AirportClock.display(f.gate_close_tick) if f.boarding_phase == "open" else "Gate closed %s" % AirportClock.display(f.gate_closed_tick)
	detail.text = "Seated %d  ·  In door queue / aisle %d  ·  %s %d  ·  %s  ·  Hold %d min" % [seated, boarding,
		"Missing" if f.boarding_phase == "open" else "Missed", missing, close_text, f.hold_ticks / 600]
	summary.text = _passenger_text(session) if session != null else _result_text(f)


func _passenger_text(session: FlightBoarding) -> String:
	var rate := session.engine.config.tick_rate
	if view.selected_id < 0:
		return "Click a passenger to inspect them. Colours show cabin state: walking, blocked, stowing, waiting for seat access, taking seat."
	var p: Passenger = session.engine.passenger_by_id(view.selected_id)
	return "P%04d  ·  Seat %s (%s)  ·  %s  ·  Bags %d  ·  Blocked %.0f s  ·  Blocked others %.0f s" % [p.id, p.seat_key(), p.seat_type_name(),
		p.state_name(), p.carry_on_count, float(p.total_blocked_time) / rate, float(p.caused_blocked_time) / rate]


func _result_text(f: AirportFlight) -> String:
	if f.boarding_result.is_empty():
		return "No live cabin for this flight." if f.boarding_mode == "cabin" else "Widebody boarding abstraction: passengers at the gate board when it closes (no cabin simulation yet)."
	return "Boarding complete. " + BoardingOverlay.result_summary(f, sim.cabin_config.tick_rate)


## Shared by the overlay and the flight inspector: boarding-tick totals as
## seconds (D-015: never show bare ticks).
static func result_summary(f: AirportFlight, tick_rate: int) -> String:
	var r := f.boarding_result
	var rate := float(tick_rate)
	var text := "Last passenger seated after %.1f min. Aisle blocked %.0f s in total, stowing %.0f s, seat access waits %.0f s." % [
		(f.last_seated_tick - f.boarding_open_tick) / 600.0, int(r.blocked_ticks) / rate, int(r.stow_ticks) / rate, int(r.seat_wait_ticks) / rate]
	for b in r.get("top_blockers", []):
		text += "\n  Seat %s (P%04d, %d bags) held up the aisle for %.0f s" % [b.seat, int(b.id), int(b.carry_on_count), int(b.caused_blocked_ticks) / rate]
	return text


func _unhandled_key_input(event: InputEvent) -> void:
	if visible and event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		closed.emit()
		accept_event()
