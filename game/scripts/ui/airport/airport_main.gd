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
var bag_metrics: Dictionary = {}
## M8: service priority buttons (low, normal, high) and the Resources tab.
var priority_buttons: Dictionary = {}
var resource_tree: Tree
var bag_metrics_second: int = -1
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

## Optional scenario file (M8 variants), set before the scene enters the tree
## or passed as --scenario=res://configs/airports/riverdale_shortage.json.
var scenario_path := ""

func _ready() -> void:
	for arg in OS.get_cmdline_user_args() + OS.get_cmdline_args():
		if arg.begins_with("--scenario="): scenario_path = arg.trim_prefix("--scenario=")
	sim.setup({} if scenario_path.is_empty() else AirportSimulation.load_config(scenario_path))
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
	resource_tree = Tree.new()
	resource_tree.name = "Resources"
	resource_tree.columns = 4
	resource_tree.hide_root = true
	resource_tree.column_titles_visible = true
	resource_tree.select_mode = Tree.SELECT_ROW
	resource_tree.add_theme_constant_override("v_separation", 0)
	resource_tree.add_theme_font_size_override("font_size", 13)
	resource_tree.add_theme_font_size_override("title_button_font_size", 13)
	for i in 4:
		resource_tree.set_column_title(i, ["Resource", "Busy", "Waiting", "Flights"][i])
		resource_tree.set_column_expand(i, i == 3)
		resource_tree.set_column_custom_minimum_width(i, [150, 120, 80, 250][i])
	resource_tree.item_selected.connect(func():
		var item := resource_tree.get_selected()
		if item != null and item.get_metadata(0) is String and not str(item.get_metadata(0)).is_empty(): _select(item.get_metadata(0)))
	operations_tabs.add_child(resource_tree)
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
	var priority_row := HBoxContainer.new()
	right.add_child(priority_row)
	var priority_label := _label(priority_row, "Service priority", 13)
	priority_label.tooltip_text = "Who goes first when crews, fuel units or tugs are scarce. Never adds capacity: another flight waits instead."
	var group := ButtonGroup.new()
	for level in ["low", "normal", "high"]:
		var button := _button(priority_row, level.to_upper(), func():
			if sim.set_service_priority(selected_id, level):
				status_label.text = "%s service priority %s" % [sim.airport.flights[selected_id].flight_number, level.to_upper()]
			_refresh())
		button.toggle_mode = true
		button.button_group = group
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.add_theme_font_size_override("font_size", 13)
		priority_buttons[level] = button
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
		elif str(alert_ids[index]).begins_with("baggage:"): return
		elif str(alert_ids[index]).begins_with("resources:"):
			view_tabs.current_tab = 0
			operations_tabs.current_tab = resource_tree.get_index()
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
	var connections := sim.connection_metrics()
	# Bag totals walk every bag: refresh once per simulated second.
	if bag_metrics.is_empty() or sim.clock.tick / 10 != bag_metrics_second:
		bag_metrics = sim.baggage_metrics()
		bag_metrics_second = sim.clock.tick / 10
	var bags := "" if bag_metrics.bags == 0 else "   |   Bags %d missed · %d at reclaim" % [bag_metrics.transfer_missed + bag_metrics.missed_flight, bag_metrics.at_reclaim]
	for type in sim.resources.order:
		if sim.resources.pools[type].queue.size() >= 2: security_alert_count += 1
	metrics_label.text = "MORNING RUSH   |   %d× %s   |   Gates %d / 8   |   Departed %d / %d   |   On time %s   |   Connections %d made · %d missed%s   |   Alerts %d" % [sim.clock.speed, "PAUSED" if sim.clock.paused else "LIVE", metrics.occupied, metrics.departed, sim.airport.flights.size(), punctuality, connections.made, connections.missed, bags, sim.conflicts.size() + security_alert_count]
	for f: AirportFlight in sim.airport.flights.values():
		var values := [f.flight_number, f.origin + " → " + f.destination, f.assigned_gate_id,
			AirportClock.display(f.scheduled_departure).left(5), AirportClock.display(f.estimated_departure).left(5), f.status.replace("_", " ").capitalize()]
		for i in 6: rows[f.id].set_text(i, values[i])
		rows[f.id].set_custom_color(4, Color("ffc078") if f.estimated_departure > f.scheduled_departure else Color("70dec0"))
	var flight: AirportFlight = sim.airport.flights[selected_id]
	var aircraft: AirportAircraft = sim.airport.aircraft[flight.aircraft_id]
	var text := "[font_size=23][b]%s[/b][/font_size]  ·  %s\n%s\n%s → %s\n\nGate %s  ·  %s\nArrival  %s  /  %s\nDeparture  %s\nEstimated  %s" % [flight.flight_number, aircraft.aircraft_type_id, sim.airport.airlines[flight.airline_id], flight.origin, flight.destination, flight.assigned_gate_id, flight.status.replace("_", " "), AirportClock.display(flight.scheduled_arrival), "pending" if flight.actual_arrival < 0 else AirportClock.display(flight.actual_arrival), AirportClock.display(flight.scheduled_departure), AirportClock.display(flight.estimated_departure)]
	text += _holding_text(flight) + _delay_text(flight) + _turnaround_text(flight) + _baggage_text(flight) + _boarding_text(flight) + "\n"
	text += "\n\n[b]Passengers at gate[/b]  %d / %d" % [int(sim.passenger_flow.ready_by_flight.get(flight.id, 0)), flight.passenger_ids.size()]
	detail.text = text
	_refresh_turnaround_tree(flight)
	_refresh_resources()
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
	for type in sim.resources.order:
		var queue: Array = sim.resource_queue(type)
		if queue.size() >= 2:
			alerts.add_item("%s · %d flights waiting" % [str(sim.resources.pools[type].label), queue.size()])
			alerts.set_item_tooltip(alerts.item_count - 1, "All %s are busy. Select to see the queue; raise a flight's service priority to move it up." % str(sim.resources.pools[type].label).to_lower())
			alert_ids.append("resources:" + type)
		for t: TurnaroundTask in queue:
			if t.kind == "pushback" and sim.clock.tick - t.ready_tick >= 1200:
				alerts.add_item("Pushback · %s waiting %d min for tug" % [sim.airport.flights[t.flight_id].flight_number, (sim.clock.tick - t.ready_tick) / 600])
				alert_ids.append(t.flight_id)
	for stage_id in sim.baggage.stages:
		var queued: int = sim.baggage.stages[stage_id].queue.size()
		if queued >= int(sim.config.get("baggage", {}).get("backlog_alert_bags", 25)):
			alerts.add_item("%s · %d bags queued" % [stage_id.capitalize(), queued])
			alerts.set_item_tooltip(alerts.item_count - 1, "A baggage backlog: bags that are not sorted by their flight's bag cutoff will miss it.")
			alert_ids.append("baggage:" + stage_id)
	for alert in sim.boarding_alerts():
		var held: AirportFlight = sim.airport.flights[alert.flight_id]
		var connecting := " (%d connecting)" % alert.connecting if alert.connecting > 0 else ""
		alerts.add_item("%s · %d missing%s · gate closes in %d min" % [held.flight_number, alert.missing, connecting, ceili(alert.closes_in / 600.0)])
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
	for level in priority_buttons:
		priority_buttons[level].set_pressed_no_signal(f.service_priority == level)
		priority_buttons[level].disabled = f.status == "departed" or not sim.resources.enabled()
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
		passenger_list.set_item_text(i, "P%04d  ·  %s %s  ·  %s  ·  Gate %s" % [p.id, {"arriving": "IN", "connecting": "CX"}.get(p.journey_direction, "OUT"), flight.flight_number, p.airport_state.replace("_", " ").capitalize(), flight.assigned_gate_id])
		if p.id == selected_passenger_id:
			passenger_list.select(i)
	detail_heading.text = "PASSENGER DETAILS" if selected_passenger_id >= 0 else "FLIGHT DETAILS"
	if selected_passenger_id >= 0 and sim.airport.passengers[str(selected_passenger_id)].journey_direction == "connecting":
		detail.text = _connection_text(sim.airport.passengers[str(selected_passenger_id)])
	elif selected_passenger_id >= 0 and sim.airport.passengers[str(selected_passenger_id)].journey_direction == "arriving":
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
		detail.text = "[font_size=23][b]Passenger %04d[/b][/font_size]\n%s\n\nFlight %s  ·  Gate %s\nDestination %s\n\nLocation: %s\nSecurity: %s  ·  %s\nQueue wait: %.1f min\n\nTerminal arrival: %s\nGate target: %s\nGate arrival: %s\n%s\n\n[color=#70dec0]%s[/color]" % [p.id, state_text, flight.flight_number, flight.assigned_gate_id, p.destination, location, p.security_checkpoint_id.capitalize(), "cleared" if p.security_cleared else "not cleared", wait / 600.0, AirportClock.display(p.arrival_time_at_airport), AirportClock.display(p.gate_target_tick), gate_time, _cabin_text(p, flight) + _bag_lines(p), risk]
	terminal_view.refresh_population()


func _boarding_text(f: AirportFlight) -> String:
	var mode := "Cabin simulation" if f.boarding_mode == "cabin" else "Widebody boarding abstraction"
	var connecting := 0
	for p in sim._manifest(f):
		if p.journey_direction == "connecting": connecting += 1
	var text := "\n\n[b]Boarding[/b]  %s · %s\nBooked %d (%d connecting) · at gate %d" % [mode, BoardingStrategy.PRESET_NAMES.get(f.boarding_strategy, f.boarding_strategy) if f.boarding_mode == "cabin" else "no cabin model yet",
		f.passenger_ids.size(), connecting, int(sim.passenger_flow.ready_by_flight.get(f.id, 0))]
	text += _missing_connectors_text(f)
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
	var text := "Seat %s (%s) · %d carry-on" % [p.seat_key(), p.seat_type_name(), p.carry_on_count]
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
	if cause.begins_with("wait:"): return "Waiting for " + sim.resources.unit_name(cause.substr(5))
	var t: TurnaroundTask = sim.turnaround.task(f, cause)
	if t != null: return t.label
	return {"late_inbound": "Late inbound", "passenger_hold": "Passenger hold", "runway_takeoff_queue": "Runway queue"}.get(cause, cause.capitalize())

## One line near the top: what is holding departure now.
func _holding_text(f: AirportFlight) -> String:
	var t: TurnaroundTask = sim.turnaround.holding(f)
	if t == null:
		var op: TurnaroundTask = sim.turnaround.task(f, Turnaround.PUSHBACK_OP)
		if f.status == "ready_for_pushback" and op != null and op.status == TurnaroundTask.WAITING:
			return "\n[color=#ffc078]Holding departure: Pushback · %s[/color]" % _task_state(f, op, false)
		if f.status == "ready_for_pushback": return "\n[color=#70dec0]Ready · pushback %s[/color]" % AirportClock.display(sim._pushback_floor(f)).left(5)
		return ""
	# Before boarding starts the turnaround itself is being held up.
	var what := "turnaround" if f.status == "turnaround" else "departure"
	return "\n[color=#ffc078]Holding %s: %s · %s[/color]%s" % [what, t.label, _task_state(f, t, false), _connectors_headline(f)]

## At the gate-close decision: who the flight would be holding for, in one line.
func _connectors_headline(f: AirportFlight) -> String:
	if f.boarding_phase != "open": return ""
	var missing: Array[Passenger] = sim.missing_connectors(f)
	if missing.is_empty(): return ""
	var from := {}
	var first := -1
	var last := -1
	for p in missing:
		from[sim.airport.flights[p.itinerary_legs[0]].flight_number] = true
		var eta := int(sim.connector_eta(p, f).eta)
		first = eta if first < 0 else mini(first, eta)
		last = maxi(last, eta)
	var after := " [color=#e5484d]after close[/color]" if last > f.gate_close_tick else ""
	return "\n[color=#ffc078]%d connecting inbound (%s) · next at gate %s · last %s%s[/color]" % [missing.size(), ", ".join(from.keys()),
		AirportClock.display(first).left(5), AirportClock.display(last).left(5), after]

## Compact summary in the details; the full table is the Turnaround tab.
func _turnaround_text(f: AirportFlight) -> String:
	var tasks: Array = sim.turnaround.tasks_of(f)
	if f.status in ["scheduled", "approaching", "landed", "taxiing_in"]:
		return "\n\n[b]Turnaround[/b]  %d tasks start at the gate" % tasks.size()
	var running: Array = []
	for t: TurnaroundTask in tasks:
		if t.status == TurnaroundTask.RUNNING and t.kind in ["timed", "deboarding", "baggage_unload", "baggage_load"]: running.append(t.label)
	var text := "\n\n[b]Turnaround[/b]  %d / %d complete" % [sim.turnaround.completed_count(f), tasks.size()]
	if not running.is_empty(): text += " · running: " + ", ".join(running)
	# M8: every task queued for a resource, whether or not it holds departure.
	for t: TurnaroundTask in tasks:
		if t.status == TurnaroundTask.WAITING:
			text += "\n[color=#e5484d]%s: %s[/color]\nPriority %s · position %d in the %s queue" % [t.label, _task_state(f, t, false),
				f.service_priority.to_upper(), sim.resources.position(t) + 1, sim.resources.unit_name(t.resource)]
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
			if t.kind in ["baggage_unload", "baggage_load"] and not sim.baggage.enabled():
				return "%d%% · %d min left" % [int(t.progress(sim.clock.tick) * 100), ceili((t.start_tick + t.duration_ticks - sim.clock.tick) / 600.0)]
			if t.kind == "baggage_unload":
				var bags := sim.flight_baggage(f)
				return "%d%% · %d / %d bags off" % [100 * bags.unloaded / maxi(1, bags.inbound), bags.unloaded, bags.inbound]
			if t.kind == "baggage_load":
				var bags := sim.flight_baggage(f)
				var pct: int = 100 * bags.loaded / maxi(1, bags.expected)
				if f.bag_load_finalized and not f.bag_loader_current.is_empty() and f.bag_loader_current.begins_with("-"): return "%d%% · offloading a no-show's bag" % pct
				return "%d%% · %d / %d loaded" % [pct, bags.loaded, bags.expected] + ("" if f.bag_load_finalized else " · final at gate close")
			if f.boarding_phase == "open": return "gate closes %s" % AirportClock.display(f.gate_close_tick).left(5)
			return "doors closing · seating"
		TurnaroundTask.READY: return "opens %s" % AirportClock.display(f.boarding_open_tick).left(5)
		TurnaroundTask.WAITING:
			var pool: Dictionary = sim.resources.pools[t.resource]
			var ahead := sim.resources.position(t)
			return "WAITING FOR %s · %s · %d / %d busy · waited %s" % [sim.resources.unit_name(t.resource).to_upper(),
				"next in line" if ahead == 0 else "%d ahead" % ahead, AirportResources.busy(pool), pool.units.size(), _mmss(sim.clock.tick - t.ready_tick)]
		TurnaroundTask.BLOCKED: return t.blocked_reason
	return "starts at the gate" if table else "not started"

func _refresh_turnaround_tree(f: AirportFlight) -> void:
	turnaround_tree.clear()
	var root := turnaround_tree.create_item()
	var colors := {TurnaroundTask.COMPLETE: Color("70dec0"), TurnaroundTask.RUNNING: Color("ffc078"), TurnaroundTask.WAITING: Color("e5484d"), TurnaroundTask.READY: Color("a7becd"), TurnaroundTask.BLOCKED: Color("a7becd"), TurnaroundTask.PENDING: Color("6b7684")}
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
		"walking_to_reclaim": where = "Walking to baggage reclaim · at %s" % p.current_location.replace("_", " ")
		"waiting_at_reclaim": where = "Waiting at baggage reclaim for %d bag(s) · %s" % [p.checked_bag_ids.size(), _mmss(sim.clock.tick - p.reclaim_arrival_tick)]
		"walking_to_exit": where = "In the terminal, walking to the exit · at %s" % p.current_location.replace("_", " ") + (" · collected bags %s" % AirportClock.display(p.bags_collected_tick).left(8) if p.bags_collected_tick >= 0 else "")
		"left_airport": where = "Left the airport %s" % AirportClock.display(p.left_airport_tick)
	var off := "Still aboard" if p.deplaned_airport_tick < 0 else "Off the aircraft %s at gate %s" % [AirportClock.display(p.deplaned_airport_tick), f.assigned_gate_id]
	var cabin := "Seat %s (%s) · %d carry-on" % [p.seat_key(), p.seat_type_name(), p.carry_on_count] if f.boarding_mode == "cabin" else "Widebody: no seat model yet"
	cabin += _bag_lines(p)
	if p.caused_blocked_time > 0: cabin += " · held up others %.0f s" % (float(p.caused_blocked_time) / sim.cabin_config.tick_rate)
	return "[font_size=23][b]Passenger %04d[/b][/font_size]\nArriving on %s from %s\n\n%s\n%s\n\n[color=#70dec0]%s[/color]" % [p.id, f.flight_number, p.origin, cabin, off, where]


## Who a closing gate is waiting for: up to three connectors still on their way.
func _missing_connectors_text(f: AirportFlight) -> String:
	if f.boarding_phase in ["closed", "complete"]: return ""
	var missing: Array[Passenger] = sim.missing_connectors(f)
	if missing.is_empty(): return ""
	var text := "\n[color=#ffc078]%d connecting still inbound[/color]" % missing.size()
	for i in mini(3, missing.size()):
		var p: Passenger = missing[i]
		var eta: Dictionary = sim.connector_eta(p, f)
		var late: bool = f.gate_close_tick >= 0 and int(eta.eta) > f.gate_close_tick
		text += "\n  P%04d · %s · ETA %s%s" % [p.id, eta.status, AirportClock.display(int(eta.eta)).left(5), " [color=#ffc078]after close[/color]" if late else ""]
	if missing.size() > 3: text += "\n  … and %d more" % (missing.size() - 3)
	return text

## Following a connecting passenger: where they are, and whether they will make it.
func _connection_text(p: Passenger) -> String:
	var a: AirportFlight = sim.airport.flights[p.itinerary_legs[0]]
	var b: AirportFlight = sim.airport.flights[p.itinerary_legs[1]]
	var r: Dictionary = sim.connection_report(p)
	var where := ""
	match p.airport_state:
		"on_aircraft": where = ("Seated in %s on %s" % [p.seat_key(), a.flight_number]) if p.leg_index == 0 else ("Seated in %s on %s" % [p.seat_key(), b.flight_number])
		"deboarding": where = "Leaving %s · %s" % [a.flight_number, p.state_name()]
		"walking_to_gate": where = "Walking to gate %s · at %s" % [b.assigned_gate_id, p.current_location.replace("_", " ")]
		"waiting_at_gate": where = "At gate %s" % b.assigned_gate_id
		"boarding": where = "Boarding %s · %s" % [b.flight_number, p.state_name()]
		"departed": where = "Departed on %s" % b.flight_number
		"missed_connection": where = "Stranded at the closed gate %s" % b.assigned_gate_id
		_: where = p.airport_state.replace("_", " ")
	var status := ""
	var passenger_status := ""
	match p.connection_status:
		"made": status = "[color=#70dec0]CONNECTION MADE[/color]"
		"missed":
			status = "[color=#e5484d]MISSED CONNECTION[/color]\n%s" % r.decisive
			status += "\nInbound late %.1f min · off the aircraft after %.1f min · walk %s · reached gate %s · gate closed %s" % [
				maxi(0, int(r.inbound_late)) / 600.0, maxi(0, int(r.deboarding)) / 600.0,
				"%.1f min" % (int(r.walk) / 600.0) if int(r.walk) >= 0 else "—",
				AirportClock.display(int(r.reached_gate)).left(5) if int(r.reached_gate) >= 0 else "not yet", AirportClock.display(int(r.gate_close)).left(5)]
		_:
			var close := b.gate_close_tick if b.gate_close_tick >= 0 else b.scheduled_departure - 6000
			var eta: Dictionary = sim.connector_eta(p, b) if p.airport_state != "waiting_at_gate" else {"eta": sim.clock.tick}
			var slack := close - int(eta.eta)
			passenger_status = "ON TRACK" if slack > 1800 else "AT RISK"
			status = ("[color=#70dec0]ON TRACK[/color]" if slack > 1800 else "[color=#ffc078]CONNECTION AT RISK[/color]") + \
				" · gate closes %s (in %s) · ETA %s" % [AirportClock.display(close).left(5), _mmss(close - sim.clock.tick), AirportClock.display(int(eta.eta)).left(5)]
	if passenger_status.is_empty(): passenger_status = {"made": "BOARDED" if p.airport_state in ["on_aircraft", "departed"] else "CONNECTION MADE", "missed": "MISSED CONNECTION"}.get(p.connection_status, "")
	return "[font_size=23][b]Passenger %04d[/b][/font_size]\nCONNECTING %s → %s\nFrom %s to %s · gate %s\n\n%s\n\n%s%s%s" % [
		p.id, a.flight_number, b.flight_number, a.origin, b.destination, b.assigned_gate_id, where, status, _bag_connection_text(p, passenger_status), _bag_lines(p)]

## Passenger vs bag, side by side: they make (or miss) the connection separately.
func _bag_connection_text(p: Passenger, passenger_status: String) -> String:
	if p.checked_bag_ids.is_empty(): return "\n\nPassenger: %s · no checked bags" % passenger_status
	var colors := {"ON TRACK": "70dec0", "LOADED": "70dec0", "READY": "70dec0", "CONNECTION MADE": "70dec0", "BOARDED": "70dec0", "AT RISK": "ffc078", "HELD": "ffc078", "MISSED CONNECTION": "e5484d"}
	var worst := {}
	for id in p.checked_bag_ids:
		var s := sim.bag_connection_status(sim.airport.bags[id])
		if worst.is_empty() or ["LOADED", "READY", "ON TRACK", "AT RISK", "HELD", "MISSED CONNECTION"].find(s.status) > ["LOADED", "READY", "ON TRACK", "AT RISK", "HELD", "MISSED CONNECTION"].find(worst.status): worst = s
	var detail := ""
	if worst.status in ["ON TRACK", "AT RISK"] and int(worst.ready) >= 0: detail = " · ready ~%s vs bag cutoff %s" % [AirportClock.display(int(worst.ready)).left(5), AirportClock.display(int(worst.cutoff)).left(5)]
	elif worst.status == "MISSED CONNECTION": detail = " · ready %s, bag cutoff was %s" % [AirportClock.display(int(worst.ready)).left(5) if int(worst.ready) >= 0 else "later", AirportClock.display(int(worst.cutoff)).left(5)]
	return "\n\n[b]Passenger: [color=#%s]%s[/color] / Bag: [color=#%s]%s[/color][/b]%s" % [colors.get(passenger_status, "a7becd"), passenger_status,
		colors.get(worst.status, "a7becd"), worst.status, detail]

## "Checked bag: BAG_000123 · Ready for AW 228", one line per bag.
func _bag_lines(p: Passenger) -> String:
	var text := ""
	if p.checked_bag_ids.is_empty(): return "\nNo checked bags" if sim.baggage.enabled() else ""
	for id in p.checked_bag_ids:
		var bag: AirportBag = sim.airport.bags[id]
		text += "\nChecked bag: %s · %s" % [bag.id, sim.baggage.describe(bag)]
	return text

## The flight's hold: loaded of expected, what is still coming, the bag cutoff.
func _baggage_text(f: AirportFlight) -> String:
	if not sim.baggage.enabled() or f.status == "departed" and f.bags_loaded == 0 and f.bags_missed == 0: return ""
	var b := sim.flight_baggage(f)
	var text := "\n\n[b]Baggage[/b]  Loaded %d / %d" % [b.loaded, b.expected]
	var parts: Array = []
	if b.ready > 0: parts.append("%d ready" % b.ready)
	if b.sorting > 0: parts.append("%d sorting" % b.sorting)
	if b.transfer_inbound > 0: parts.append("%d transfer inbound" % b.transfer_inbound)
	if b.not_checked > 0 and not f.bag_cutoff_passed: parts.append("%d not checked in" % b.not_checked)
	if not parts.is_empty(): text += " · " + " · ".join(parts)
	if f.status != "departed":
		if f.bag_cutoff_tick >= 0 and not f.bag_cutoff_passed: text += "\nBag cutoff in %s (%s)" % [_mmss(f.bag_cutoff_tick - sim.clock.tick), AirportClock.display(f.bag_cutoff_tick).left(5)]
		elif f.bag_cutoff_passed: text += "\nBag cutoff passed %s" % AirportClock.display(f.bag_cutoff_tick).left(5)
	if b.missed > 0 or b.held > 0:
		text += "\n[color=#ffc078]%d missed the bag cutoff · %d held (passenger not aboard)[/color]" % [b.missed, b.held]
	if b.inbound > 0 and f.status != "departed": text += "\nInbound bags off %d / %d" % [b.unloaded, b.inbound]
	return text

static func _mmss(ticks: int) -> String:
	var seconds := maxi(0, ticks) / 10
	return "%d:%02d" % [seconds / 60, seconds % 60]


## Resources tab: per type, units busy and flights waiting; expanded rows list
## the queue in allocation order, then who holds each unit.
func _refresh_resources() -> void:
	if not sim.resources.enabled() or operations_tabs.current_tab != resource_tree.get_index(): return
	resource_tree.clear()
	var root := resource_tree.create_item()
	for type in sim.resources.order:
		var pool: Dictionary = sim.resources.pools[type]
		var queue: Array = sim.resource_queue(type)
		var row := resource_tree.create_item(root)
		var busy := AirportResources.busy(pool)
		row.set_text(0, str(pool.label))
		row.set_text(1, "%d / %d" % [busy, pool.units.size()])
		row.set_text(2, "%d waiting" % queue.size() if not queue.is_empty() else "—")
		row.set_text(3, "ALL BUSY" if busy == pool.units.size() else "")
		row.set_metadata(0, "")
		var color := Color("ffc078") if not queue.is_empty() else (Color("a7becd") if busy < pool.units.size() else Color("70dec0"))
		# Pools nobody is waiting for stay folded, so shortages are on screen.
		row.collapsed = queue.is_empty()
		for i in 4: row.set_custom_color(i, color)
		for i in queue.size():
			var t: TurnaroundTask = queue[i]
			var f: AirportFlight = sim.airport.flights[t.flight_id]
			var item := resource_tree.create_item(row)
			item.set_text(0, "  #%d  %s" % [i + 1, f.flight_number])
			item.set_text(1, t.label)
			item.set_text(2, _mmss(sim.clock.tick - t.ready_tick))
			item.set_text(3, "%s priority · departs %s" % [f.service_priority.to_upper(), AirportClock.display(f.scheduled_departure).left(5)])
			item.set_metadata(0, f.id)
			for c in 4: item.set_custom_color(c, Color("ffc078"))
		for t in sim.resource_holders(type):
			if t == null: continue
			var f: AirportFlight = sim.airport.flights[t.flight_id]
			var item := resource_tree.create_item(row)
			item.set_text(0, "  %s  %s" % [t.unit_id.get_slice("#", 1).insert(0, "#"), f.flight_number])
			item.set_text(1, t.label)
			item.set_text(2, "in use")
			item.set_text(3, "since %s%s" % [AirportClock.display(t.start_tick).left(5), " · waited %s" % _mmss(t.resource_wait_ticks) if t.resource_wait_ticks > 0 else ""])
			item.set_metadata(0, f.id)
