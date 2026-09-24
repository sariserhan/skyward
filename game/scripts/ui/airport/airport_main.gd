extends Control
var sim := AirportSimulation.new()
var map: AirportMap
var terminal_view: TerminalView
var view_tabs: TabContainer
var operations_tabs: TabContainer
var passenger_list: ItemList
var passenger_list_ids: Array = []
var security_labels: Dictionary = {}
var security_buttons: Dictionary = {}
var staff_label: Label
var selected_passenger_id: int = -1
var board: Tree
var detail: RichTextLabel
var detail_heading: Label
var alerts: ItemList
var gate_choice: OptionButton
var warnings: Label
var status_label: Label
var clock_label: Label
var metrics_label: Label
var pause_button: Button
var debug_panel: VBoxContainer
var debug_label: Label
var assign_button: Button
var strategy_choice: OptionButton
var hold_button: Button
var close_gate_button: Button
var view_boarding_button: Button
var boarding_overlay: BoardingOverlay
var turnaround_tree: Tree
var selected_id: String = "F001"
var refresh_timer: float = 0
var rows: Dictionary = {}
var alert_ids: Array = []
var save_path: String = "user://riverdale_airport.json"

func _ready() -> void:
	sim.setup()
	_build()
	_refresh()

func _button(parent: Node, text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.pressed.connect(action)
	parent.add_child(button)
	return button

func _label(parent: Node, text: String, font_size: int = 16) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", font_size)
	parent.add_child(label)
	return label

func _build() -> void:
	var background := ColorRect.new()
	background.color = Color("0d1c26")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for edge in ["left", "right", "top", "bottom"]: margin.add_theme_constant_override("margin_" + edge, 18)
	add_child(margin)
	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 12)
	margin.add_child(layout)
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 12)
	layout.add_child(header)
	var title := _label(header, "RIVERDALE\nAirport operations", 22)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	clock_label = _label(header, "06:00:00", 25)
	pause_button = _button(header, "Pause", _toggle_pause)
	for speed in [1, 2, 4]:
		_button(header, "%d×" % speed, func(): sim.clock.set_speed(speed); _refresh())
	_button(header, "Save", _save)
	_button(header, "Load", _load_save)
	metrics_label = _label(layout, "", 15)
	metrics_label.modulate = Color("70dec0")
	var content := HBoxContainer.new()
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 18)
	layout.add_child(content)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 10)
	content.add_child(left)
	view_tabs = TabContainer.new()
	view_tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(view_tabs)
	map = AirportMap.new()
	map.name = "Airfield"
	map.sim = sim
	map.size_flags_vertical = Control.SIZE_EXPAND_FILL
	map.flight_selected.connect(_select)
	view_tabs.add_child(map)
	terminal_view = TerminalView.new()
	terminal_view.name = "Terminal"
	terminal_view.sim = sim
	terminal_view.passenger_selected.connect(_select_passenger)
	view_tabs.add_child(terminal_view)
	operations_tabs = TabContainer.new()
	operations_tabs.custom_minimum_size.y = 238
	left.add_child(operations_tabs)
	board = Tree.new()
	board.name = "Flights"
	board.custom_minimum_size.y = 220
	board.columns = 6
	board.hide_root = true
	board.column_titles_visible = true
	board.select_mode = Tree.SELECT_ROW
	for i in 6:
		board.set_column_title(i, ["Flight", "Route", "Gate", "Departure", "Estimated", "Status"][i])
		board.set_column_expand(i, i == 1 or i == 5)
		board.set_column_custom_minimum_width(i, [82, 160, 45, 80, 80, 125][i])
	board.item_selected.connect(func():
		var item := board.get_selected()
		if item != null: _select(item.get_metadata(0)))
	operations_tabs.add_child(board)
	_build_security_panel()
	turnaround_tree = Tree.new()
	turnaround_tree.name = "Turnaround"
	turnaround_tree.columns = 5
	turnaround_tree.hide_root = true
	turnaround_tree.column_titles_visible = true
	turnaround_tree.select_mode = Tree.SELECT_ROW
	# All seven tasks fit without scrolling.
	turnaround_tree.add_theme_constant_override("v_separation", 0)
	turnaround_tree.add_theme_font_size_override("font_size", 13)
	turnaround_tree.add_theme_font_size_override("title_button_font_size", 13)
	for i in 5:
		turnaround_tree.set_column_title(i, ["Task", "Status", "Start", "Done", "Waiting for / progress"][i])
		turnaround_tree.set_column_expand(i, i == 4)
		turnaround_tree.set_column_custom_minimum_width(i, [170, 95, 60, 60, 220][i])
	operations_tabs.add_child(turnaround_tree)
	passenger_list = ItemList.new()
	passenger_list.name = "Passengers"
	passenger_list.item_selected.connect(func(index): _select_passenger(passenger_list_ids[index]))
	operations_tabs.add_child(passenger_list)
	_rebuild_board()
	var right := VBoxContainer.new()
	right.custom_minimum_size.x = 320
	right.add_theme_constant_override("separation", 8)
	content.add_child(right)
	detail_heading = _label(right, "FLIGHT DETAILS", 16)
	detail = RichTextLabel.new()
	detail.bbcode_enabled = true
	detail.custom_minimum_size.y = 214
	detail.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(detail)
	var gate_row := HBoxContainer.new()
	right.add_child(gate_row)
	gate_choice = OptionButton.new()
	for key in sim.airport.gates: gate_choice.add_item(key)
	gate_choice.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gate_choice.item_selected.connect(func(_index): _refresh_warnings())
	gate_row.add_child(gate_choice)
	assign_button = _button(gate_row, "Assign gate", _assign)
	var boarding_row := HBoxContainer.new()
	right.add_child(boarding_row)
	strategy_choice = OptionButton.new()
	for id in BoardingStrategy.PRESET_IDS: strategy_choice.add_item(BoardingStrategy.PRESET_NAMES[id])
	strategy_choice.tooltip_text = "Boarding strategy (until boarding opens)"
	strategy_choice.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	strategy_choice.item_selected.connect(func(index):
		var ok := sim.set_boarding_strategy(selected_id, BoardingStrategy.PRESET_IDS[index])
		status_label.text = "Boarding strategy set" if ok else "Strategy locked once boarding opens"
		_refresh())
	boarding_row.add_child(strategy_choice)
	view_boarding_button = _button(boarding_row, "View boarding", _open_cabin)
	var gate_actions := HBoxContainer.new()
	right.add_child(gate_actions)
	hold_button = _button(gate_actions, "HOLD +5 MIN", func():
		status_label.text = "Flight held: gate stays open 5 more minutes" if sim.hold_flight(selected_id) else "Cannot hold: gate not open or maximum hold reached"
		_refresh())
	close_gate_button = _button(gate_actions, "CLOSE GATE", func():
		status_label.text = "Gate closed" if sim.close_gate(selected_id) else "Gate is not open"
		_refresh())
	for button in [hold_button, close_gate_button]: button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	warnings = _label(right, "", 12)
	warnings.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warnings.custom_minimum_size.y = 48
	warnings.modulate = Color("ffc078")
	_label(right, "OPERATIONS ALERTS", 15)
	alerts = ItemList.new()
	alerts.custom_minimum_size.y = 105
	alerts.item_selected.connect(func(index):
		if str(alert_ids[index]).begins_with("security:"):
			view_tabs.current_tab = 1
			operations_tabs.current_tab = 1
		else: _select(alert_ids[index]))
	right.add_child(alerts)
	debug_panel = VBoxContainer.new()
	debug_panel.visible = false
	right.add_child(debug_panel)
	debug_label = _label(debug_panel, "", 12)
	debug_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var debug_actions := HBoxContainer.new()
	debug_panel.add_child(debug_actions)
	_button(debug_actions, "+10 min", _skip)
	_button(debug_actions, "Arrival", func():
		status_label.text = "Arrival queued" if sim.force_arrival(selected_id) else "Select a scheduled flight"
		_refresh())
	_button(debug_actions, "+Delay", func():
		status_label.text = "10 minute hold added" if sim.force_delay(selected_id) else "Flight cannot be held now"
		_refresh())
	status_label = _label(layout, "Space: pause  ·  1 / 2 / 4: speed  ·  F3: debug   |   Select a flight or aircraft to inspect", 12)
	status_label.modulate = Color("a7becd")
	boarding_overlay = BoardingOverlay.new()
	boarding_overlay.visible = false
	boarding_overlay.closed.connect(func(): boarding_overlay.visible = false)
	add_child(boarding_overlay)

func _rebuild_board() -> void:
	board.clear()
	rows.clear()
	var root := board.create_item()
	for flight: AirportFlight in sim.airport.flights.values():
		var row := board.create_item(root)
		row.set_metadata(0, flight.id)
		rows[flight.id] = row

func _process(delta: float) -> void:
	sim.advance(sim.clock.frame_steps(delta))
	map.queue_redraw()
	if terminal_view.is_visible_in_tree(): terminal_view.queue_redraw()
	refresh_timer += delta
	if refresh_timer >= 0.25:
		refresh_timer = 0
		_refresh()

func _select(id: String) -> void:
	selected_id = id
	selected_passenger_id = -1
	terminal_view.selected_id = -1
	map.selected_id = id
	var f: AirportFlight = sim.airport.flights[id]
	gate_choice.select(sim.airport.gates.keys().find(f.assigned_gate_id))
	board.set_block_signals(true)
	rows[id].select(0)
	board.set_block_signals(false)
	board.scroll_to_item(rows[id])
	_refresh()

func _refresh() -> void:
	clock_label.text = AirportClock.display(sim.clock.tick)
	pause_button.text = "Resume" if sim.clock.paused else "Pause"
	var metrics := sim.metrics()
	var security_alert_count := 0
	for cp: SecurityCheckpoint in sim.airport.security_checkpoints.values():
		var stats := sim.passenger_flow.checkpoint_metrics(cp, sim.clock.tick)
		if stats.oldest_wait >= 6000 or (cp.capacity() == 0 and not cp.queue.is_empty()): security_alert_count += 1
	var punctuality := "—" if metrics.departed == 0 else "%d%%" % (100 * (metrics.departed - metrics.late) / metrics.departed)
	metrics_label.text = "MORNING RUSH    |    %d× %s    |    Gates %d / 8    |    Departed %d / %d    |    On time %s    |    Alerts %d" % [sim.clock.speed, "PAUSED" if sim.clock.paused else "LIVE", metrics.occupied, metrics.departed, sim.airport.flights.size(), punctuality, sim.conflicts.size() + security_alert_count]
	for f: AirportFlight in sim.airport.flights.values():
		var values := [f.flight_number, f.origin + " → " + f.destination, f.assigned_gate_id,
			AirportClock.display(f.scheduled_departure).left(5), AirportClock.display(f.estimated_departure).left(5), f.status.replace("_", " ").capitalize()]
		for i in 6: rows[f.id].set_text(i, values[i])
		rows[f.id].set_custom_color(4, Color("ffc078") if f.estimated_departure > f.scheduled_departure else Color("70dec0"))
	var flight: AirportFlight = sim.airport.flights[selected_id]
	var aircraft: AirportAircraft = sim.airport.aircraft[flight.aircraft_id]
	var text := "[font_size=23][b]%s[/b][/font_size]  ·  %s\n%s\n%s → %s\n\nGate %s  ·  %s\nArrival  %s  /  %s\nDeparture  %s\nEstimated  %s" % [flight.flight_number, aircraft.aircraft_type_id, sim.airport.airlines[flight.airline_id], flight.origin, flight.destination, flight.assigned_gate_id, flight.status.replace("_", " "), AirportClock.display(flight.scheduled_arrival), "pending" if flight.actual_arrival < 0 else AirportClock.display(flight.actual_arrival), AirportClock.display(flight.scheduled_departure), AirportClock.display(flight.estimated_departure)]
	text += _holding_text(flight) + _delay_text(flight) + _turnaround_text(flight) + _boarding_text(flight) + "\n"
	text += "\n\n[b]Passengers at gate[/b]  %d / %d" % [int(sim.passenger_flow.ready_by_flight.get(flight.id, 0)), flight.passenger_ids.size()]
	detail.text = text
	_refresh_turnaround_tree(flight)
	_refresh_terminal()
	_refresh_warnings()
	alerts.clear()
	alert_ids.clear()
	var ordered: Array = sim.conflicts.values()
	ordered.sort_custom(func(a, b): return a.severity == "critical" and b.severity != "critical")
	for conflict in ordered:
		var incoming: AirportFlight = sim.airport.flights[conflict.flight_id]
		var blocker: AirportFlight = sim.airport.flights[conflict.blocker_id]
		alerts.add_item("%s · %s needs gate" % [conflict.gate_id, incoming.flight_number])
		alerts.set_item_tooltip(alerts.item_count - 1, "Occupied by %s. Select to inspect and reassign %s." % [blocker.flight_number, incoming.flight_number])
		alert_ids.append(incoming.id)
	for cp: SecurityCheckpoint in sim.airport.security_checkpoints.values():
		var current := sim.passenger_flow.checkpoint_metrics(cp, sim.clock.tick)
		if current.oldest_wait >= 6000 or (cp.capacity() == 0 and not cp.queue.is_empty()):
			alerts.add_item("%s security · %d waiting" % [cp.id.capitalize(), cp.queue.size()])
			alert_ids.append("security:" + cp.id)
	for alert in sim.boarding_alerts():
		var held: AirportFlight = sim.airport.flights[alert.flight_id]
		alerts.add_item("%s · %d missing · gate closes in %d min" % [held.flight_number, alert.missing, ceili(alert.closes_in / 600.0)])
		alerts.set_item_tooltip(alerts.item_count - 1, "Select to hold the flight or close the gate. It closes automatically if you do nothing.")
		alert_ids.append(held.id)
	if alert_ids.is_empty():
		alerts.add_item("No active operations alerts")
		alerts.set_item_disabled(0, true)
	debug_label.text = "DEBUG · seed %d · tick %d\n%d active flights · %d runway queued\n%d events · %d FPS · last tick %d µs" % [sim.seed_value, sim.clock.tick, sim.airport.flights.size() - metrics.departed, sim.airport.runway.queue.size(), sim.events.history.size(), Engine.get_frames_per_second(), sim.last_tick_usec]

func _refresh_warnings() -> void:
	var gate_id := gate_choice.get_item_text(gate_choice.selected)
	var messages := sim.assignment_warnings(selected_id, gate_id)
	warnings.text = "Compatible gate · schedule clear" if messages.is_empty() else "\n".join(messages)
	var f: AirportFlight = sim.airport.flights[selected_id]
	assign_button.disabled = not f.status in ["scheduled", "approaching", "landed", "taxiing_in"]
	strategy_choice.set_block_signals(true)
	strategy_choice.select(BoardingStrategy.PRESET_IDS.find(f.boarding_strategy))
	strategy_choice.set_block_signals(false)
	strategy_choice.disabled = f.boarding_mode != "cabin" or not f.boarding_phase in ["", "scheduled"]
	hold_button.disabled = not sim.can_hold(selected_id)
	close_gate_button.disabled = f.boarding_phase != "open"
	var deboarding := _deboarding_running(f)
	view_boarding_button.text = "View deboarding" if deboarding else "View boarding"
	view_boarding_button.disabled = not deboarding and (f.boarding_mode != "cabin" or f.boarding_phase == "" or f.boarding_phase == "scheduled")

func _assign() -> void:
	var result := sim.assign_gate(selected_id, gate_choice.get_item_text(gate_choice.selected))
	status_label.text = "Gate assignment updated" if result.ok else "Assignment rejected: " + ", ".join(result.warnings)
	_refresh()

func _toggle_pause() -> void:
	sim.clock.paused = not sim.clock.paused
	_refresh()

func _skip() -> void:
	if OS.is_debug_build():
		sim.advance(6000)
		_refresh()

func _save() -> void:
	var error := sim.save_file(save_path)
	status_label.text = "Airport saved locally" if error == OK else "Save failed: " + error_string(error)

func _load_save() -> void:
	var loaded := AirportSimulation.load_file(save_path)
	if loaded == null:
		status_label.text = "No compatible local airport save found"
		return
	sim = loaded
	map.sim = sim
	terminal_view.sim = sim
	boarding_overlay.visible = false
	selected_passenger_id = -1
	_rebuild_board()
	_select(sim.airport.flights.keys()[0])
	status_label.text = "Airport restored"

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo: return
	match event.keycode:
		KEY_SPACE: _toggle_pause()
		KEY_1: sim.clock.set_speed(1)
		KEY_2: sim.clock.set_speed(2)
		KEY_4: sim.clock.set_speed(4)
		KEY_F3:
			if OS.is_debug_build(): debug_panel.visible = not debug_panel.visible
	_refresh()


func _build_security_panel() -> void:
	var panel := VBoxContainer.new()
	panel.name = "Security"
	panel.add_theme_constant_override("separation", 10)
	operations_tabs.add_child(panel)
	staff_label = _label(panel, "", 14)
	for checkpoint_id in sim.airport.security_checkpoints:
		var row := HBoxContainer.new()
		panel.add_child(row)
		var info := _label(row, "", 13)
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		security_labels[checkpoint_id] = info
		var buttons := []
		buttons.append(_button(row, "− lane", func(): _adjust_security(checkpoint_id, -1, 0)))
		buttons.append(_button(row, "+ lane", func(): _adjust_security(checkpoint_id, 1, 0)))
		buttons.append(_button(row, "− staff", func(): _adjust_security(checkpoint_id, 0, -1)))
		buttons.append(_button(row, "+ staff", func(): _adjust_security(checkpoint_id, 0, 1)))
		security_buttons[checkpoint_id] = buttons
	var help := _label(panel, "Each active lane needs one staff member. Closing lanes lets current screenings finish.\nOpen lanes and assign staff to reduce queues. Select Terminal to watch passenger movement.", 12)
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

func _adjust_security(id: String, lane_delta: int, staff_delta: int) -> void:
	var cp: SecurityCheckpoint = sim.airport.security_checkpoints[id]
	var changed := sim.set_security(id, cp.open_lanes + lane_delta, cp.staff + staff_delta)
	status_label.text = "Security capacity updated" if changed else "Cannot change capacity: check lane limits and available staff"
	_refresh()

func _select_passenger(id: int) -> void:
	var p: Passenger = sim.airport.passengers[str(id)]
	_select(p.current_flight_id)
	selected_passenger_id = id
	terminal_view.selected_id = id
	view_tabs.current_tab = 1
	_refresh()

func _refresh_terminal() -> void:
	var assigned := 0
	for cp: SecurityCheckpoint in sim.airport.security_checkpoints.values(): assigned += cp.staff
	var counts := sim.passenger_flow.counts
	staff_label.text = "SECURITY  ·  Staff %d / %d  ·  At gates %d  ·  Expected %d" % [assigned, int(sim.passenger_flow.config.get("staff_pool", 0)), int(counts.get("waiting_at_gate", 0)), int(counts.get("not_arrived", 0))]
	for id in security_labels:
		var cp: SecurityCheckpoint = sim.airport.security_checkpoints[id]
		var stats := sim.passenger_flow.checkpoint_metrics(cp, sim.clock.tick)
		security_labels[id].text = "%s  ·  Lanes %d/%d  ·  Staff %d\nQueue %d  ·  Oldest %.1fm  ·  Avg %.1fm" % [id.capitalize(), cp.open_lanes, cp.max_lanes, cp.staff, cp.queue.size(), stats.oldest_wait / 600.0, stats.average_wait / 600.0]
		var buttons: Array = security_buttons[id]
		buttons[0].disabled = cp.open_lanes <= 0
		buttons[1].disabled = cp.open_lanes >= cp.max_lanes
		buttons[2].disabled = cp.staff <= 0
		buttons[3].disabled = cp.staff >= cp.max_lanes or assigned >= int(sim.passenger_flow.config.staff_pool)
	var flight: AirportFlight = sim.airport.flights[selected_id]
	# Arriving passengers first (they are on the aircraft now), then departing.
	var ids: Array = flight.inbound_passenger_ids + flight.passenger_ids
	if passenger_list_ids != ids:
		passenger_list_ids = ids
		passenger_list.clear()
		for id in passenger_list_ids: passenger_list.add_item(str(id))
	for i in passenger_list_ids.size():
		var p: Passenger = sim.airport.passengers[str(passenger_list_ids[i])]
		passenger_list.set_item_text(i, "P%04d  ·  %s %s  ·  %s  ·  Gate %s" % [p.id, "IN" if p.journey_direction == "arriving" else "OUT", flight.flight_number, p.airport_state.replace("_", " ").capitalize(), flight.assigned_gate_id])
		if p.id == selected_passenger_id:
			passenger_list.select(i)
	detail_heading.text = "PASSENGER DETAILS" if selected_passenger_id >= 0 else "FLIGHT DETAILS"
	if selected_passenger_id >= 0 and sim.airport.passengers[str(selected_passenger_id)].journey_direction == "arriving":
		detail.text = _arrival_text(sim.airport.passengers[str(selected_passenger_id)], flight)
	elif selected_passenger_id >= 0:
		var p: Passenger = sim.airport.passengers[str(selected_passenger_id)]
		var state_text := p.airport_state.replace("_", " ").capitalize()
		var location := p.current_location if not p.current_location.is_empty() else "Outside airport"
		var wait := p.security_wait_ticks
		if p.airport_state == "security_queue": wait = sim.clock.tick - p.security_queue_enter_tick
		var gate_time := "Not yet at gate" if p.gate_arrival_time < 0 else AirportClock.display(p.gate_arrival_time)
		var risk := "Late to gate target" if "late_to_gate" in p.risk_flags else "En route"
		if p.airport_state == "waiting_at_gate" and p.risk_flags.is_empty(): risk = "At gate on time"
		if p.airport_state in ["boarding", "on_aircraft", "departed"]: risk = "Boarded %s" % AirportClock.display(p.seated_airport_tick) if p.seated_airport_tick >= 0 else "In the door queue / aisle"
		if not p.missed_flight_id.is_empty(): risk = "MISSED FLIGHT · was %s at gate close" % p.missed_reason.replace("_", " ")
		elif p.airport_state == "not_arrived": risk = "Expected at terminal"
		elif p.gate_arrival_time < 0 and sim.clock.tick > p.gate_target_tick: risk = "Past gate-arrival target"
		detail.text = "[font_size=23][b]Passenger %04d[/b][/font_size]\n%s\n\nFlight %s  ·  Gate %s\nDestination %s\n\nLocation: %s\nSecurity: %s  ·  %s\nQueue wait: %.1f min\n\nTerminal arrival: %s\nGate target: %s\nGate arrival: %s\n%s\n\n[color=#70dec0]%s[/color]" % [p.id, state_text, flight.flight_number, flight.assigned_gate_id, p.destination, location, p.security_checkpoint_id.capitalize(), "cleared" if p.security_cleared else "not cleared", wait / 600.0, AirportClock.display(p.arrival_time_at_airport), AirportClock.display(p.gate_target_tick), gate_time, _cabin_text(p, flight), risk]
	terminal_view.refresh_population()


func _boarding_text(f: AirportFlight) -> String:
	var mode := "Cabin simulation" if f.boarding_mode == "cabin" else "Widebody boarding abstraction"
	var text := "\n\n[b]Boarding[/b]  %s · %s\nLoad %d%% · %d booked" % [mode, BoardingStrategy.PRESET_NAMES.get(f.boarding_strategy, f.boarding_strategy) if f.boarding_mode == "cabin" else "no cabin model yet",
		f.load_permille / 10, f.passenger_ids.size()]
	match f.boarding_phase:
		"": return text + "\nOpens about 30 min before departure, once service is done"
		"scheduled": text += "\nOpens %s · gate closes %s" % [AirportClock.display(f.boarding_open_tick), AirportClock.display(f.gate_close_tick)]
		"open": text += "\n[color=#70dec0]OPEN[/color] · gate closes %s · %d still missing" % [AirportClock.display(f.gate_close_tick), sim.missing_passengers(f)]
		_: text += "\nGate closed %s · boarded %d · missed %d" % [AirportClock.display(f.gate_closed_tick), f.boarded_count, f.missed_count]
	if f.hold_ticks > 0: text += "\n[color=#ffc078]Held %d min[/color]" % (f.hold_ticks / 600)
	if not f.boarding_result.is_empty(): text += "\n" + BoardingOverlay.result_summary(f, sim.cabin_config.tick_rate)
	return text

func _cabin_text(p: Passenger, f: AirportFlight) -> String:
	if f.boarding_mode != "cabin": return "Seat: widebody boarding abstraction"
	var text := "Seat %s (%s) · %d bags" % [p.seat_key(), p.seat_type_name(), p.carry_on_count]
	if p.airport_state == "boarding": text += " · cabin: " + p.state_name()
	if p.caused_blocked_time > 0: text += " · blocked others %.0f s" % (float(p.caused_blocked_time) / sim.cabin_config.tick_rate)
	return text

## Additive departure-delay split once the flight has left; live causes before.
func _delay_text(f: AirportFlight) -> String:
	if f.status == "departed":
		var late := f.actual_departure - f.scheduled_departure
		if late <= 0: return "\n[color=#70dec0]Departed on time[/color]"
		var parts: Array = []
		for cause in f.departure_delay_breakdown:
			parts.append("%s %.1f" % [_cause_label(f, cause), int(f.departure_delay_breakdown[cause]) / 600.0])
		return "\n[color=#ffc078]Departed +%.1f min: %s[/color]" % [late / 600.0, " · ".join(parts)]
	var text := ""
	for reason in f.delay_reasons:
		if int(f.delay_reasons[reason]) > 0:
			text += "\n[color=#ffc078]%s: %.1f min[/color]" % [reason.replace("_", " ").capitalize(), int(f.delay_reasons[reason]) / 600.0]
	return text

func _cause_label(f: AirportFlight, cause: String) -> String:
	var t: TurnaroundTask = sim.turnaround.task(f, cause)
	if t != null: return t.label
	return {"late_inbound": "Late inbound", "passenger_hold": "Passenger hold", "runway_takeoff_queue": "Runway queue"}.get(cause, cause.capitalize())

## One line near the top: what is holding departure now.
func _holding_text(f: AirportFlight) -> String:
	var t: TurnaroundTask = sim.turnaround.holding(f)
	if t == null:
		if f.status == "ready_for_pushback": return "\n[color=#70dec0]Ready · pushback %s[/color]" % AirportClock.display(sim._pushback_floor(f)).left(5)
		return ""
	# Before boarding starts the turnaround itself is being held up.
	var what := "turnaround" if f.status == "turnaround" else "departure"
	return "\n[color=#ffc078]Holding %s: %s · %s[/color]" % [what, t.label, _task_state(f, t, false)]

## Compact summary in the details; the full table is the Turnaround tab.
func _turnaround_text(f: AirportFlight) -> String:
	var tasks: Array = sim.turnaround.tasks_of(f)
	if f.status in ["scheduled", "approaching", "landed", "taxiing_in"]:
		return "\n\n[b]Turnaround[/b]  %d tasks start at the gate" % tasks.size()
	var running: Array = []
	for t: TurnaroundTask in tasks:
		if t.status == TurnaroundTask.RUNNING and t.kind in ["timed", "deboarding"]: running.append(t.label)
	var text := "\n\n[b]Turnaround[/b]  %d / %d complete" % [sim.turnaround.completed_count(f), tasks.size()]
	if not running.is_empty(): text += " · running: " + ", ".join(running)
	return text

func _task_state(f: AirportFlight, t: TurnaroundTask, table: bool) -> String:
	match t.status:
		TurnaroundTask.COMPLETE:
			var overrun := (t.finish_tick - t.start_tick) - (t.planned_finish_tick - t.planned_start_tick)
			return "+%d min over plan" % (overrun / 600) if t.kind == "timed" and overrun >= 600 else "done"
		TurnaroundTask.RUNNING:
			if t.kind == "timed": return "%d%% · %d min left" % [int(t.progress(sim.clock.tick) * 100), ceili((t.start_tick + t.duration_ticks - sim.clock.tick) / 600.0)]
			if t.kind == "deboarding":
				var total := f.inbound_passenger_ids.size()
				if f.boarding_mode != "cabin": return "widebody deboarding abstraction · %d min left" % ceili((t.start_tick + t.duration_ticks - sim.clock.tick) / 600.0)
				return "%d%% · %d / %d off" % [100 * f.deplaned_count / maxi(1, total), f.deplaned_count, total]
			if f.boarding_phase == "open": return "boarding · gate closes %s" % AirportClock.display(f.gate_close_tick).left(5)
			return "doors closing · seating"
		TurnaroundTask.READY: return "opens %s" % AirportClock.display(f.boarding_open_tick).left(5)
		TurnaroundTask.BLOCKED: return t.blocked_reason
	return "starts at the gate" if table else "not started"

func _refresh_turnaround_tree(f: AirportFlight) -> void:
	turnaround_tree.clear()
	var root := turnaround_tree.create_item()
	var colors := {TurnaroundTask.COMPLETE: Color("70dec0"), TurnaroundTask.RUNNING: Color("ffc078"), TurnaroundTask.READY: Color("a7becd"), TurnaroundTask.BLOCKED: Color("a7becd"), TurnaroundTask.PENDING: Color("6b7684")}
	var holding: TurnaroundTask = sim.turnaround.holding(f)
	for t: TurnaroundTask in sim.turnaround.tasks_of(f):
		var row := turnaround_tree.create_item(root)
		var values := [t.label + ("  ◀" if t == holding else ""), t.status.capitalize(),
			"" if t.start_tick < 0 else AirportClock.display(t.start_tick).left(5),
			"" if t.finish_tick < 0 else AirportClock.display(t.finish_tick).left(5), _task_state(f, t, true)]
		for i in 5:
			row.set_text(i, values[i])
			row.set_custom_color(i, colors[t.status])


func _deboarding_running(f: AirportFlight) -> bool:
	var t: TurnaroundTask = sim.turnaround.task(f, Turnaround.DEBOARDING)
	return t != null and t.status == TurnaroundTask.RUNNING

## Deboarding while the doors are open, boarding otherwise. Follows the selected
## passenger into the cabin when they are in it.
func _open_cabin() -> void:
	var f: AirportFlight = sim.airport.flights[selected_id]
	boarding_overlay.show_flight(sim, selected_id, "deboarding" if _deboarding_running(f) else "boarding", selected_passenger_id)

## Follow an arriving passenger: seat → aisle → door → terminal → exit.
func _arrival_text(p: Passenger, f: AirportFlight) -> String:
	var where := ""
	match p.airport_state:
		"on_aircraft": where = "Seated in %s on the arriving aircraft" % p.seat_key() if f.boarding_mode == "cabin" else "On the arriving aircraft"
		"deboarding":
			if f.boarding_mode != "cabin": where = "Deboarding (widebody deboarding abstraction)"
			elif p.aisle_position >= 0: where = "In the aisle at row %d · %s" % [p.aisle_position, p.state_name()]
			else: where = "Seat %s · %s" % [p.seat_key(), p.state_name()]
		"walking_to_exit": where = "In the terminal, walking to the exit · at %s" % p.current_location.replace("_", " ")
		"left_airport": where = "Left the airport %s" % AirportClock.display(p.left_airport_tick)
	var off := "Still aboard" if p.deplaned_airport_tick < 0 else "Off the aircraft %s at gate %s" % [AirportClock.display(p.deplaned_airport_tick), f.assigned_gate_id]
	var cabin := "Seat %s (%s) · %d bags" % [p.seat_key(), p.seat_type_name(), p.carry_on_count] if f.boarding_mode == "cabin" else "Widebody: no seat model yet"
	if p.caused_blocked_time > 0: cabin += " · held up others %.0f s" % (float(p.caused_blocked_time) / sim.cabin_config.tick_rate)
	return "[font_size=23][b]Passenger %04d[/b][/font_size]\nArriving on %s from %s\n\n%s\n%s\n\n[color=#70dec0]%s[/color]" % [p.id, f.flight_number, p.origin, cabin, off, where]
