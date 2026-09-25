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
## M9: the Airlines tab and the airline shown in the details panel.
var airline_tree: Tree
var selected_airline := ""
## M10: the career (days, cash, plan), the Finance tab and the end-of-day screen.
var career := AirportCareer.new()
var finance_tree: Tree
var day_panel: PanelContainer
var day_report: RichTextLabel
var plan_rows: Dictionary = {}
var plan_total: Label
var start_day_button: Button
## M11: the Build tab (between days).
var build_category: OptionButton
var build_items: ItemList
var build_item_ids: Array = []
var build_sites: OptionButton
var build_site_ids: Array = []
var build_info: Label
var build_button: Button
var built_list: ItemList
var built_ids: Array = []
var day_tabs: TabContainer
var demolish_button: Button
const BUILD_CATEGORIES := ["gates", "terminal", "security", "baggage", "operations", "airside"]
## M12 airside tool: mini map, taxiway direction, runway heading and length.
var airside_box: VBoxContainer
var airside_map: AirsideBuildMap
var airside_direction: OptionButton
var airside_heading: OptionButton
var airside_length: OptionButton
var airside_toggle: Button
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
	career.new_career(scenario_path)
	career.start_day()
	sim = career.sim
	# Scenario variants may not include the default first flight.
	if not sim.airport.flights.has(selected_id): selected_id = sim.flight_order[0].id
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
	airline_tree = Tree.new()
	airline_tree.name = "Airlines"
	airline_tree.columns = 4
	airline_tree.hide_root = true
	airline_tree.column_titles_visible = true
	airline_tree.select_mode = Tree.SELECT_ROW
	airline_tree.add_theme_font_size_override("font_size", 14)
	airline_tree.add_theme_font_size_override("title_button_font_size", 13)
	for i in 4:
		airline_tree.set_column_title(i, ["Airline", "Relationship", "Contract", "Request"][i])
		airline_tree.set_column_expand(i, i == 2)
		airline_tree.set_column_custom_minimum_width(i, [160, 150, 280, 150][i])
	airline_tree.item_selected.connect(func():
		var item := airline_tree.get_selected()
		if item != null: _select_airline(item.get_metadata(0)))
	operations_tabs.add_child(airline_tree)
	finance_tree = Tree.new()
	finance_tree.name = "Finance"
	finance_tree.columns = 2
	finance_tree.hide_root = true
	finance_tree.add_theme_font_size_override("font_size", 13)
	finance_tree.set_column_expand(0, true)
	finance_tree.set_column_expand(1, false)
	finance_tree.set_column_custom_minimum_width(1, 140)
	operations_tabs.add_child(finance_tree)
	_rebuild_board()
	var right := VBoxContainer.new()
	right.custom_minimum_size.x = 320
	right.add_theme_constant_override("separation", 8)
	content.add_child(right)
	detail_heading = _label(right, "FLIGHT DETAILS", 16)
	detail = RichTextLabel.new()
	detail.bbcode_enabled = true
	# Airline request answers are links in the airline details.
	detail.meta_clicked.connect(func(meta):
		var parts := str(meta).split(":")
		if parts.size() == 2 and sim.answer_airline_request(parts[1], parts[0] == "accept"):
			status_label.text = "%s request %s" % [sim.airport.airlines[parts[1]], "accepted: flights added to tomorrow's schedule" if parts[0] == "accept" else "declined"]
		_refresh())
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
		elif str(alert_ids[index]).begins_with("airline:"): _select_airline(str(alert_ids[index]).substr(8))
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
	status_label = _label(layout, "Space: pause  ·  1 / 2 / 4: speed  ·  O: airside overlay  ·  F3: debug   |   Select a flight or aircraft to inspect", 12)
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
	if day_panel != null and day_panel.visible: return
	sim.advance(sim.clock.frame_steps(delta))
	# The last departure ends the day: settle once, then plan the next.
	if career.day_complete():
		career.settle_day()
		sim.clock.paused = true
		_show_day_panel()
	map.queue_redraw()
	if terminal_view.is_visible_in_tree(): terminal_view.queue_redraw()
	refresh_timer += delta
	if refresh_timer >= 0.25:
		refresh_timer = 0
		_refresh()

func _select(id: String) -> void:
	selected_id = id
	selected_airline = ""
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
	metrics_label.text = "DAY %d · %s   |" % [career.day if career.phase == "operating" else career.day - 1, AirportEconomy.money(career.cash_cents())] + "   %d× %s   |   Gates %d / %d   |   Departed %d / %d   |   On time %s   |   Connections %d made · %d missed%s   |   Alerts %d" % [sim.clock.speed, "PAUSED" if sim.clock.paused else "LIVE", metrics.occupied, sim.airport.gates.size(), metrics.departed, sim.airport.flights.size(), punctuality, connections.made, connections.missed, bags, sim.conflicts.size() + security_alert_count]
	for f: AirportFlight in sim.airport.flights.values():
		var values := [f.flight_number, f.origin + " → " + f.destination, f.assigned_gate_id,
			AirportClock.display(f.scheduled_departure).left(5), AirportClock.display(f.estimated_departure).left(5), f.status.replace("_", " ").capitalize()]
		for i in 6: rows[f.id].set_text(i, values[i])
		rows[f.id].set_custom_color(4, Color("ffc078") if f.estimated_departure > f.scheduled_departure else Color("70dec0"))
	var flight: AirportFlight = sim.airport.flights[selected_id]
	var aircraft: AirportAircraft = sim.airport.aircraft[flight.aircraft_id]
	var text := "[font_size=23][b]%s[/b][/font_size]  ·  %s\n%s\n%s → %s\n\nGate %s  ·  %s\nArrival  %s  /  %s\nDeparture  %s\nEstimated  %s" % [flight.flight_number, aircraft.aircraft_type_id, sim.airport.airlines[flight.airline_id], flight.origin, flight.destination, flight.assigned_gate_id, flight.status.replace("_", " "), AirportClock.display(flight.scheduled_arrival), "pending" if flight.actual_arrival < 0 else AirportClock.display(flight.actual_arrival), AirportClock.display(flight.scheduled_departure), AirportClock.display(flight.estimated_departure)]
	text += _taxi_text(flight) + _holding_text(flight) + _delay_text(flight) + _turnaround_text(flight) + _baggage_text(flight) + _boarding_text(flight) + "\n"
	text += "\n\n[b]Passengers at gate[/b]  %d / %d" % [int(sim.passenger_flow.ready_by_flight.get(flight.id, 0)), flight.passenger_ids.size()]
	detail.text = text
	_refresh_turnaround_tree(flight)
	_refresh_resources()
	_refresh_airlines()
	_refresh_finance()
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
	for airline in sim.airlines.airline_ids:
		var e: Dictionary = sim.airlines.evaluations[airline]
		if e.contract.status in ["AT RISK", "FAILING"]:
			alerts.add_item("%s · %s %s" % [airline, e.contract.label, e.contract.status])
			alerts.set_item_tooltip(alerts.item_count - 1, "Select to see which terms are at risk and why.")
			alert_ids.append("airline:" + airline)
		if sim.airlines.state[airline].request == "offered":
			alerts.add_item("%s requests +%d daily flights" % [sim.airport.airlines[airline], sim.airlines.request_of(airline).flights.size()])
			alert_ids.append("airline:" + airline)
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
	var queued := 0
	for r: AirportRunway in sim.airport.runways.values(): queued += r.queue.size()
	debug_label.text = "DEBUG · seed %d · tick %d\n%d active flights · %d runway queued · %d cached routes\n%d events · %d FPS · last tick %d µs" % [sim.seed_value, sim.clock.tick, sim.airport.flights.size() - metrics.departed, queued, sim.airside._routes.size(), sim.events.history.size(), Engine.get_frames_per_second(), sim.last_tick_usec]

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
	var error := career.save_file(save_path)
	status_label.text = "Airport saved locally" if error == OK else "Save failed: " + error_string(error)

func _load_save() -> void:
	var loaded := AirportCareer.load_file(save_path)
	if loaded == null:
		status_label.text = "No compatible local airport save found"
		return
	career = loaded
	if career.phase == "planning":
		# Between days: nothing is operating; plan the next day.
		_show_day_panel()
		status_label.text = "Airport restored · planning day %d" % career.day
		return
	if day_panel != null: day_panel.visible = false
	_adopt(career.sim)
	status_label.text = "Airport restored"

## Point every view at a (new) day's simulation.
func _adopt(day_sim: AirportSimulation) -> void:
	sim = day_sim
	map.sim = sim
	terminal_view.sim = sim
	boarding_overlay.visible = false
	selected_passenger_id = -1
	# The day's gates can differ from yesterday's (M11 construction).
	gate_choice.clear()
	for key in sim.airport.gates: gate_choice.add_item(key)
	_rebuild_board()
	_select(sim.flight_order[0].id)

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo: return
	match event.keycode:
		KEY_SPACE: _toggle_pause()
		KEY_1: sim.clock.set_speed(1)
		KEY_2: sim.clock.set_speed(2)
		KEY_4: sim.clock.set_speed(4)
		KEY_F3:
			if OS.is_debug_build():
				debug_panel.visible = not debug_panel.visible
				map.debug = debug_panel.visible
		KEY_O: map.overlay = not map.overlay
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
	selected_airline = ""
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
	if not selected_airline.is_empty():
		detail_heading.text = "AIRLINE DETAILS"
		detail.text = _airline_text(selected_airline)


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
## M12: where a taxiing aircraft is going and what it is waiting for.
func _taxi_text(f: AirportFlight) -> String:
	var t := sim.taxi_status(f)
	if t.is_empty(): return ""
	var where := ("TAXIING TO %s" % t.runway) if t.direction == "out" else ("TAXIING TO GATE %s" % f.assigned_gate_id)
	var line := "\n[color=#70dec0][b]%s[/b][/color]" % where
	if not t.route.is_empty(): line += "  ·  via " + " → ".join(t.route)
	match t.blocker:
		"": pass
		"taxiway": line += "\n[color=#ffc078]WAITING FOR TAXIWAY%s[/color]" % ("" if t.ahead.is_empty() else " · %s ahead" % t.ahead)
		"intersection": line += "\n[color=#ffc078]WAITING AT INTERSECTION[/color]"
		_: line += "\n[color=#ffc078]HOLDING · %s[/color]" % t.blocker
	var waited := f.taxi_in_wait_ticks if t.direction == "in" else f.taxi_out_wait_ticks
	if f.taxi_state == "done" and waited > 0: line += "  ·  waited %s" % _mmss(waited)
	return line

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
	return {"late_inbound": "Late inbound", "passenger_hold": "Passenger hold", "runway_takeoff_queue": "Runway queue", "taxi_congestion": "Taxi congestion"}.get(cause, cause.capitalize())

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


# --- airlines (M9) ------------------------------------------------------------------

func _select_airline(airline: String) -> void:
	selected_airline = airline
	selected_passenger_id = -1
	view_tabs.current_tab = 0
	operations_tabs.current_tab = airline_tree.get_index()
	_refresh()

const BAND_COLORS := {"EXCELLENT": "70dec0", "GOOD": "70dec0", "ACCEPTABLE": "ffc078", "POOR": "e5484d", "CRITICAL": "e5484d"}
const STATUS_COLORS := {"PASSING": "70dec0", "PASSED": "70dec0", "AT RISK": "ffc078", "FAILING": "e5484d", "FAILED": "e5484d", "PENDING": "a7becd", "NONE": "a7becd", "NO DATA": "a7becd"}

func _refresh_airlines() -> void:
	if not sim.airlines.enabled() or operations_tabs.current_tab != airline_tree.get_index(): return
	# Rebuilding re-selects the current row; that is not a new selection.
	airline_tree.set_block_signals(true)
	airline_tree.clear()
	var root := airline_tree.create_item()
	for airline in sim.airlines.airline_ids:
		var e: Dictionary = sim.airlines.evaluations[airline]
		var row := airline_tree.create_item(root)
		row.set_text(0, str(sim.airport.airlines[airline]))
		row.set_text(1, "%d  %s" % [e.relationship, e.band])
		row.set_text(2, "%s · %s" % [e.contract.label, e.contract.status] if not e.contract.label.is_empty() else "—")
		row.set_text(3, {"offered": "+%d flights?" % sim.airlines.request_of(airline).get("flights", []).size(), "accepted": "accepted", "declined": "declined"}.get(sim.airlines.state[airline].request, ""))
		row.set_metadata(0, airline)
		row.set_custom_color(1, Color(BAND_COLORS[e.band]))
		row.set_custom_color(2, Color(STATUS_COLORS.get(e.contract.status, "a7becd")))
		if airline == selected_airline: row.select(0)
	airline_tree.set_block_signals(false)

## Everything behind an airline's number: each weighted dimension with its
## real inputs, the contract terms, the flights that hurt most and why, and any
## request with the conditions for it.
func _airline_text(airline: String) -> String:
	var e: Dictionary = sim.airlines.evaluations[airline]
	var m: Dictionary = e.metrics
	var text := "[font_size=23][b]%s[/b][/font_size]  ·  [color=#%s]%d %s[/color]" % [sim.airport.airlines[airline], BAND_COLORS[e.band], e.relationship, e.band]
	if e.day_score == null: text += "\nStarting relationship %d · no flights operated yet" % e.start
	else: text += "\nStarting %d · today %.0f over %d of %d flights" % [e.start, e.day_score, m.flights, m.scheduled]
	for item in sim.airlines.state[airline].adjustments: text += " · %s %+d" % [item[0], item[1]]
	text += "\n\n[b]WHY[/b]"
	var weights := 0.0
	for dim in AirlineRelations.DIMENSIONS: weights += e.dimensions[dim].weight
	for dim in AirlineRelations.DIMENSIONS:
		var d: Dictionary = e.dimensions[dim]
		if d.weight <= 0: continue
		var share := roundi(100.0 * d.weight / maxf(1.0, weights))
		if d.score == null:
			text += "\n  · %s (%d%%): nothing to judge yet" % [dim.capitalize(), share]
			continue
		var good: bool = d.score >= 75.0
		text += "\n[color=#%s]%s %s %d[/color] (weight %d%%) · %s" % ["70dec0" if good else "ffc078", "+" if good else "−", dim.capitalize(), roundi(d.score), share, _dimension_inputs(dim, m)]
	var c: Dictionary = e.contract
	if not c.label.is_empty():
		text += "\n\n[b]CONTRACT[/b]  %s · [color=#%s]%s[/color]" % [c.label, STATUS_COLORS.get(c.status, "a7becd"), c.status]
		var terms: Dictionary = sim.config.get("airline_relations", {}).get("contracts", {}).get(c.id, {})
		if terms.has("bonus_cents") or terms.has("penalty_cents"):
			text += "\n  Settles at the day's end: passed %s · failed %s" % [AirportEconomy.money(int(terms.get("bonus_cents", 0)), true), AirportEconomy.money(-int(terms.get("penalty_cents", 0)))]
		for t in c.terms:
			text += "\n  [color=#%s]%s[/color] %s %s: %s" % [STATUS_COLORS.get(t.status, "a7becd"), {"PASSING": "✓", "AT RISK": "!", "FAILING": "✗"}.get(t.status, "·"),
				t.label, t.get("target", ""), "—" if t.value == null else AirlineRelations._fmt(t.metric, float(t.value))]
	var problems := _problem_flights(airline)
	if not problems.is_empty():
		text += "\n\n[b]PROBLEM FLIGHTS[/b]"
		for line in problems: text += "\n  " + line
	text += _request_text(airline, e)
	return text

func _dimension_inputs(dim: String, m: Dictionary) -> String:
	match dim:
		"punctuality": return "%d of %d on time · mean delay %.1f min · %d over 5 min" % [m.on_time, m.flights, m.mean_delay_min, m.late_over_5]
		"connections": return "%d made · %d missed (%.1f%%)" % [m.connections_made, m.connections_missed, 100.0 * m.connection_rate]
		"baggage":
			var bags := "transfer bags %d made · %d missed" % [m.transfer_bags_made, m.transfer_bags_missed]
			return bags + " · baggage delay %.1f min/flight%s" % [m.baggage_delay_min, "" if m.mean_reclaim_min == null else " · reclaim wait %.1f min" % m.mean_reclaim_min]
		"turnaround": return "turnaround-caused delay %.1f min/flight (resource waits %.1f)" % [m.turnaround_delay_min, m.resource_delay_min]
		"gates": return "%d of %d at preferred gates" % [m.preferred_gate, m.flights]
	return ""

## The airline's worst departures, each with its largest cause; a resource wait
## names who was served while it waited.
func _problem_flights(airline: String) -> Array:
	var ids: Array = sim.airlines.evaluations[airline].metrics.flight_ids.duplicate()
	ids.sort_custom(func(a, b): return int(sim.airlines.records[a].late_ticks) > int(sim.airlines.records[b].late_ticks))
	var out: Array = []
	for id in ids:
		var rec: Dictionary = sim.airlines.records[id]
		if int(rec.late_ticks) <= 1800 or out.size() >= 3: continue
		var f: AirportFlight = sim.airport.flights[id]
		var line := "%s +%.1f min · %s +%.1f" % [f.flight_number, int(rec.late_ticks) / 600.0, _cause_label(f, rec.cause), int(rec.cause_ticks) / 600.0]
		if not rec.served_first.is_empty(): line += " · served first: " + ", ".join(rec.served_first.slice(0, 3))
		if f.service_priority != "normal": line += " · priority " + f.service_priority.to_upper()
		if f.hold_ticks > 0: line += " · held %d min" % (f.hold_ticks / 600)
		out.append(line)
	return out

func _request_text(airline: String, e: Dictionary) -> String:
	var request: Dictionary = sim.airlines.request_of(airline)
	if request.is_empty(): return ""
	var names: Array = []
	for flight in request.flights: names.append(flight.flight_number)
	var text := "\n\n[b]REQUEST[/b]  +%d daily flights (%s)" % [names.size(), ", ".join(names)]
	# M11: can the airport as built take them?
	if sim.airlines.state[airline].request in ["", "offered"]:
		var missing := career.tier_capacity(request)
		text += "\n  Capacity (gates, runway): " + ("[color=#70dec0]SUFFICIENT[/color]" if missing.is_empty() else "[color=#e5484d]INSUFFICIENT[/color] · %s Build the capacity before starting the next day." % " ".join(missing))
	match sim.airlines.state[airline].request:
		"offered": return text + "\n  [url=accept:%s][color=#70dec0]ACCEPT[/color][/url]    [url=decline:%s][color=#ffc078]DECLINE[/color][/url]" % [airline, airline]
		"accepted": return text + "\n  Accepted: committed to tomorrow's schedule"
		"declined": return text + "\n  Declined"
	var why: Array = []
	if e.relationship < int(request.get("min_relationship", 0)): why.append("relationship %d, needs %d" % [e.relationship, request.min_relationship])
	if e.metrics.flights < int(request.get("min_flights_operated", 0)): why.append("%d of %d flights operated so far" % [e.metrics.flights, request.min_flights_operated])
	if e.contract.status in ["FAILING", "FAILED"]: why.append("contract " + e.contract.status.to_lower())
	if sim.airlines.state[airline].final: why.append("the day is over")
	return text + "\n  Not offered: " + ("; ".join(why) if not why.is_empty() else "no compatible gate free")


# --- economy and days (M10) -----------------------------------------------------------

## Finance tab: cash, today's money by category (each expands to its
## transactions), net, and revenue by airline.
func _refresh_finance() -> void:
	if operations_tabs.current_tab != finance_tree.get_index(): return
	var collapsed := {}
	var root_old := finance_tree.get_root()
	if root_old != null:
		for item in root_old.get_children(): collapsed[str(item.get_metadata(0))] = item.collapsed
	finance_tree.clear()
	var root := finance_tree.create_item()
	var summary := sim.economy.summary()
	var add := func(parent: TreeItem, label: String, cents: int, color := "") -> TreeItem:
		var item := finance_tree.create_item(parent)
		item.set_text(0, label)
		item.set_text(1, AirportEconomy.money(cents))
		item.set_text_alignment(1, HORIZONTAL_ALIGNMENT_RIGHT)
		if not color.is_empty():
			item.set_custom_color(0, Color(color))
			item.set_custom_color(1, Color(color))
		return item
	add.call(root, "Cash now (day %d)" % sim.economy.day, career.cash_cents(), "70dec0")
	add.call(root, "Opening cash", summary.opening_cents)
	for category in AirportEconomy.CATEGORIES:
		var txs := sim.economy.in_category(category)
		var item: TreeItem = add.call(root, "%s  (%d)" % [AirportEconomy.LABELS[category], txs.size()], int(summary.by_category[category]),
			"70dec0" if category in AirportEconomy.REVENUE else "ffc078")
		item.set_metadata(0, category)
		item.collapsed = collapsed.get(category, true)
		for tx in txs: add.call(item, tx.reason, int(tx.amount_cents))
	add.call(root, "Operating result: revenue %s · costs %s" % [AirportEconomy.money(summary.revenue_cents), AirportEconomy.money(summary.cost_cents)], summary.net_cents, "ffffff")
	# Capital spent before the day (M11): shown apart from operations.
	var capital: Array = career.ledger.filter(func(tx): return int(tx.day) == sim.economy.day and tx.category == "capital")
	if not capital.is_empty():
		var item: TreeItem = add.call(root, "Construction for this day (capital, %d)" % capital.size(), career.capital_cents(sim.economy.day), "ffc078")
		item.set_metadata(0, "capital")
		item.collapsed = collapsed.get("capital", true)
		for tx in capital: add.call(item, tx.reason, int(tx.amount_cents))
	var airlines: Array = summary.by_airline.keys()
	airlines.sort()
	var by := add.call(root, "Revenue by airline (shared costs stay shared)", 0) as TreeItem
	by.set_text(1, "")
	by.set_metadata(0, "by_airline")
	by.collapsed = collapsed.get("by_airline", false)
	for airline in airlines: add.call(by, str(sim.airport.airlines.get(airline, airline)), int(summary.by_airline[airline]))

func _build_day_panel() -> void:
	day_panel = PanelContainer.new()
	day_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("0d1c26")
	style.content_margin_left = 40
	style.content_margin_right = 40
	style.content_margin_top = 24
	style.content_margin_bottom = 24
	day_panel.add_theme_stylebox_override("panel", style)
	day_panel.visible = false
	add_child(day_panel)
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 40)
	day_panel.add_child(columns)
	day_report = RichTextLabel.new()
	day_report.bbcode_enabled = true
	day_report.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	day_report.add_theme_font_size_override("normal_font_size", 15)
	day_report.add_theme_font_size_override("bold_font_size", 15)
	day_report.add_theme_font_size_override("mono_font_size", 15)
	columns.add_child(day_report)
	var tabs := TabContainer.new()
	day_tabs = tabs
	tabs.custom_minimum_size.x = 470
	columns.add_child(tabs)
	var plan := VBoxContainer.new()
	plan.name = "Plan"
	plan.add_theme_constant_override("separation", 10)
	tabs.add_child(plan)
	_build_build_tab(tabs)
	_label(plan, "NEXT DAY OPERATIONS", 18)
	_label(plan, "Capacity is paid for by the day, whether it is busy or not.", 13).modulate = Color("a7becd")
	for type in career.resource_plan:
		var row := HBoxContainer.new()
		plan.add_child(row)
		var name_label := _label(row, str(career.base.economy.resources[type].label), 15)
		name_label.custom_minimum_size.x = 150
		_button(row, "−", func():
			career.set_units(type, int(career.resource_plan[type]) - 1)
			_show_day_panel())
		var count := _label(row, "", 15)
		count.custom_minimum_size.x = 36
		count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_button(row, "+", func():
			career.set_units(type, int(career.resource_plan[type]) + 1)
			_show_day_panel())
		var cost := _label(row, "", 15)
		cost.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cost.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		plan_rows[type] = [count, cost]
	plan_total = _label(plan, "", 15)
	start_day_button = _button(plan, "START DAY", func():
		if not career.start_day(): return
		day_panel.visible = false
		_adopt(career.sim)
		status_label.text = "Day %d started" % career.day)
	start_day_button.custom_minimum_size.y = 44

## The settled day's report and the next day's plan.
func _show_day_panel() -> void:
	if day_panel == null: _build_day_panel()
	day_panel.visible = true
	day_report.text = _day_report_text(career.reports[-1]) if not career.reports.is_empty() else "[font_size=26][b]RIVERDALE[/b][/font_size]\n\nNo day settled yet."
	var economy: Dictionary = career.base.economy
	for type in plan_rows:
		var units := int(career.resource_plan[type])
		var each := int(economy.resources[type].daily_cents)
		plan_rows[type][0].text = "%d/%d" % [units, career.maximum_units(type)]
		plan_rows[type][1].text = "%s each · %s" % [AirportEconomy.money(each), AirportEconomy.money(each * units)]
	var security := int(economy.costs.security_staff_daily_cents) * career.security_staff()
	var committed := career.committed_cost_cents()
	var text := "Security staff × %d   %s\nAirport operations   %s\n\nCommitted daily cost   %s\nCash available   %s\nExpected flights: %d" % [career.security_staff(),
		AirportEconomy.money(security), AirportEconomy.money(int(economy.costs.fixed_daily_cents)), AirportEconomy.money(committed),
		AirportEconomy.money(career.settled_cash_cents()), career.expected_flights()]
	var capital := career.capital_cents(career.day)
	if capital != 0: text += "\nCapital spent for day %d: %s (not a daily cost)" % [career.day, AirportEconomy.money(capital)]
	var errors := career.start_errors()
	if career.insolvent(): text += "\n\nINSOLVENT: even the minimum plan costs more than the cash available."
	elif not errors.is_empty(): text += "\n\nCANNOT START DAY %d\n" % career.day + "\n".join(errors.slice(0, 4))
	elif not career.can_start(): text += "\n\nThis plan costs more than the cash available: reduce capacity."
	plan_total.text = text
	_refresh_build_tab()
	start_day_button.text = "START DAY %d" % career.day
	start_day_button.disabled = not career.can_start()

func _day_report_text(r: Dictionary) -> String:
	# Two columns, amounts right-aligned.
	var row := func(label: String, amount: String, style := "") -> String:
		var open := "[%s]" % style if not style.is_empty() else ""
		var close := "[/%s]" % style.get_slice("=", 0) if not style.is_empty() else ""
		return "[cell]%s%s%s[/cell][cell][p align=right]%s%s%s[/p][/cell]" % [open, label, close, open, amount, close]
	var t := "[font_size=26][b]RIVERDALE — DAY %d[/b][/font_size]\n\n[table=2]" % int(r.day)
	# Construction is paid before the day starts: already out of the starting cash.
	if int(r.get("capital_cents", 0)) != 0:
		t += row.call("Cash after yesterday", AirportEconomy.money(int(r.opening_cents) - int(r.capital_cents)))
		t += row.call("Construction (capital)", AirportEconomy.money(int(r.capital_cents)))
	t += row.call("Starting cash", AirportEconomy.money(int(r.opening_cents)))
	t += row.call(" ", " ") + row.call("REVENUE", "", "b")
	for c in ["aircraft", "passengers", "baggage", "contract_bonus"]: t += row.call(AirportEconomy.LABELS[c], AirportEconomy.money(int(r.by_category[c])))
	t += row.call("Total revenue", AirportEconomy.money(int(r.revenue_cents)), "b")
	t += row.call(" ", " ") + row.call("COSTS", "", "b")
	for c in ["resources", "security", "fixed", "contract_penalty"]: t += row.call(AirportEconomy.LABELS[c], AirportEconomy.money(-int(r.by_category[c])))
	t += row.call("Total costs", AirportEconomy.money(int(r.cost_cents)), "b")
	t += row.call(" ", " ") + row.call("NET", AirportEconomy.money(int(r.net_cents), true), "color=#%s" % ("70dec0" if int(r.net_cents) >= 0 else "e5484d"))
	t += row.call("ENDING CASH", AirportEconomy.money(int(r.closing_cents)), "b") + "[/table]\n\n"
	t += "[b]OPERATIONS[/b]\n%d flights · %d passengers departed · mean delay %.1f min · %d missed connections · %d missed bags\n\n[b]AIRLINES[/b]" % [
		int(r.flights), int(r.passengers), float(r.mean_delay_min), int(r.missed_connections), int(r.missed_bags)]
	var airlines: Array = r.contracts.keys()
	airlines.sort()
	for airline in airlines:
		var c: Dictionary = r.contracts[airline]
		t += "\n%s · %d · %s [color=#%s]%s[/color] · revenue %s" % [career.base.airlines.get(airline, airline), int(c.relationship), c.contract,
			STATUS_COLORS.get(c.status, "a7becd"), c.status, AirportEconomy.money(int(r.by_airline.get(airline, 0)))]
	return t


# --- build mode (M11) -------------------------------------------------------------------

func _build_build_tab(tabs: TabContainer) -> void:
	var build := VBoxContainer.new()
	build.name = "Build"
	build.add_theme_constant_override("separation", 6)
	tabs.add_child(build)
	build_category = OptionButton.new()
	for c in BUILD_CATEGORIES: build_category.add_item(c.capitalize())
	build_category.item_selected.connect(func(_i): _refresh_build_tab())
	build.add_child(build_category)
	build_items = ItemList.new()
	build_items.custom_minimum_size.y = 110
	build_items.item_selected.connect(func(_i): _refresh_build_sites())
	build.add_child(build_items)
	build_sites = OptionButton.new()
	build_sites.item_selected.connect(func(_i): _refresh_build_info())
	build.add_child(build_sites)
	airside_box = VBoxContainer.new()
	airside_box.visible = false
	build.add_child(airside_box)
	airside_map = AirsideBuildMap.new()
	airside_map.layout = career.layout
	airside_map.picked.connect(_refresh_build_info)
	airside_box.add_child(airside_map)
	var options := HBoxContainer.new()
	airside_box.add_child(options)
	airside_direction = OptionButton.new()
	for label in ["Two-way", "One-way →", "One-way ←"]: airside_direction.add_item(label)
	airside_direction.item_selected.connect(func(_i): _refresh_build_info())
	options.add_child(airside_direction)
	airside_heading = OptionButton.new()
	for h in ["E", "W", "N", "S"]: airside_heading.add_item("Heading " + h)
	airside_heading.item_selected.connect(func(_i): _refresh_build_info())
	options.add_child(airside_heading)
	airside_length = OptionButton.new()
	for m in career.layout.catalog.get("runway", {}).get("lengths_m", []): airside_length.add_item("%d m" % int(m))
	airside_length.item_selected.connect(func(_i): _refresh_build_info())
	options.add_child(airside_length)
	build_info = _label(build, "", 13)
	build_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	build_info.custom_minimum_size.y = 74
	build_button = _button(build, "BUILD", func():
		var item: String = build_item_ids[build_items.get_selected_items()[0]]
		var result: Dictionary
		if item == "taxiway":
			result = career.build_taxiway(airside_map.picks[0], airside_map.picks[1], [0, 1, -1][airside_direction.selected])
		elif item == "runway":
			result = career.build_runway(airside_map.picks[0], _airside_heading(), _airside_length())
		else: result = career.build(item, build_site_ids[build_sites.selected])
		status_label.text = result.get("error", "Built %s (%s)" % [career.layout.catalog[item].label, result.get("id", "")])
		airside_map.reset()
		_show_day_panel())
	_label(build, "BUILT", 14)
	built_list = ItemList.new()
	built_list.custom_minimum_size.y = 120
	built_list.item_selected.connect(func(_i): _refresh_demolish())
	build.add_child(built_list)
	airside_toggle = _button(build, "", func():
		var o := career.layout.find(built_ids[built_list.get_selected_items()[0]])
		var result: Dictionary
		if o.type in ["runway", "legacy_runway"]: result = career.set_airside(o.id, "status", "closed" if o.status == "open" else "open")
		else: result = career.set_airside(o.id, "direction", {0: 1, 1: -1, -1: 0}[int(o.get("direction", 0))])
		status_label.text = result.get("error", "Changed " + career._object_label(career.layout.find(o.id)))
		_show_day_panel())
	airside_toggle.visible = false
	demolish_button = _button(build, "DEMOLISH", func():
		var result := career.demolish(built_ids[built_list.get_selected_items()[0]])
		status_label.text = result.get("error", "Demolished · refund %s" % AirportEconomy.money(int(result.get("refund_cents", 0))))
		_show_day_panel())

func _refresh_build_tab() -> void:
	if build_items == null: return
	var category: String = BUILD_CATEGORIES[maxi(0, build_category.selected)]
	var selected := build_items.get_selected_items()
	var keep: String = build_item_ids[selected[0]] if not selected.is_empty() and selected[0] < build_item_ids.size() else ""
	build_items.clear()
	build_item_ids = []
	for type in AirportLayout._sorted(career.layout.catalog.keys()):
		var item: Dictionary = career.layout.catalog[type]
		if item.category != category or item.site_kind == "legacy": continue
		var price := AirportEconomy.money(int(item.cost_cents)) if not item.has("cost_per_m_cents") else AirportEconomy.money(int(item.cost_per_m_cents)) + " per metre"
		build_items.add_item("%s · %s" % [item.label, price])
		build_item_ids.append(type)
		if type == keep: build_items.select(build_items.item_count - 1)
	if build_items.get_selected_items().is_empty() and build_items.item_count > 0: build_items.select(0)
	_refresh_build_sites()
	built_list.clear()
	built_ids = []
	for o in career.layout.objects:
		var item: Dictionary = career.layout.catalog[o.type]
		if (item.category == "airside") != (category == "airside"): continue
		var where: String = career._object_label(o) + _airside_state(o) if item.category == "airside" else "%s · %s" % [item.label, career.layout.sites[o.site].get("label", o.site.replace("_", " "))]
		built_list.add_item("%s%s" % [where, " (new)" if o.id in career.layout.session_ids else ""])
		built_ids.append(o.id)
	_refresh_demolish()

func _refresh_build_sites() -> void:
	build_sites.clear()
	build_site_ids = []
	var selected := build_items.get_selected_items()
	if selected.is_empty():
		_refresh_build_info()
		return
	var type: String = build_item_ids[selected[0]]
	var airside: bool = career.layout.catalog[type].category == "airside"
	build_sites.visible = not airside
	airside_box.visible = airside
	if airside:
		airside_map.mode = type
		airside_map.reset()
		airside_direction.visible = type == "taxiway"
		airside_heading.visible = type == "runway"
		airside_length.visible = type == "runway"
		_refresh_build_info()
		return
	for site_id in AirportLayout._sorted(career.layout.sites.keys()):
		var site: Dictionary = career.layout.sites[site_id]
		if site.kind != career.layout.catalog[type].site_kind: continue
		var slot := career.layout.free_slot(type, site_id)
		var reason := "full" if slot < 0 else ""
		if slot < 0 and site.kind in ["gate_pad", "terminal"]: reason = career.layout.placement_error(type, site_id, 0)
		build_sites.add_item("%s%s" % [site.get("label", site_id.replace("_", " ")), "" if reason.is_empty() else " · " + reason])
		build_site_ids.append(site_id)
		if not reason.is_empty(): build_sites.set_item_disabled(build_sites.item_count - 1, true)
	for i in build_sites.item_count:
		if not build_sites.is_item_disabled(i):
			build_sites.select(i)
			break
	_refresh_build_info()

## Cost and cash before committing; for a gate, its real walks from the
## terminal graph as it would be.
func _refresh_build_info() -> void:
	var selected := build_items.get_selected_items()
	build_button.disabled = true
	if not selected.is_empty() and career.layout.catalog[build_item_ids[selected[0]]].category == "airside":
		_refresh_airside_info(build_item_ids[selected[0]])
		return
	if selected.is_empty() or build_sites.item_count == 0 or build_sites.is_item_disabled(maxi(0, build_sites.selected)):
		build_info.text = "Nowhere free to build this."
		return
	var type: String = build_item_ids[selected[0]]
	var site: String = build_site_ids[build_sites.selected]
	var item: Dictionary = career.layout.catalog[type]
	var cost := int(item.cost_cents)
	var cash := career.settled_cash_cents()
	var text := "%s\nCash %s · cost %s · after %s" % [item.effect, AirportEconomy.money(cash), AirportEconomy.money(cost), AirportEconomy.money(cash - cost)]
	if item.site_kind == "gate_pad":
		var trial := AirportLayout.new()
		trial.bind(career.base)
		trial.restore(career.layout.snapshot())
		trial.place(type, site, 0)
		var config := trial.apply(career.day_config(false))
		var graph := TerminalGraph.new()
		graph.setup(config.passenger_flow.graph)
		var gate: String = career.layout.sites[site].gate_id
		var walk := -1
		for cp in config.passenger_flow.checkpoints:
			var path := graph.route(cp.node_id, gate, true)
			if not path.is_empty(): walk = graph.route_ticks(path) if walk < 0 else mini(walk, graph.route_ticks(path))
		text += "\n" + ("No passenger path yet: build the terminal piece that reaches this pad first." if walk < 0 else "Walk from security: %.1f min · to reclaim: %.1f min" % [walk / 600.0, graph.route_ticks(graph.route(gate, "baggage_reclaim")) / 600.0])
	build_info.text = text
	build_button.disabled = cash < cost

func _refresh_demolish() -> void:
	var selected := built_list.get_selected_items()
	demolish_button.disabled = selected.is_empty()
	airside_toggle.visible = false
	if selected.is_empty():
		demolish_button.text = "DEMOLISH"
		return
	var o := career.layout.find(built_ids[selected[0]])
	if o.type in AirportLayout.AIRSIDE_TYPES:
		airside_toggle.visible = true
		if o.type in ["runway", "legacy_runway"]: airside_toggle.text = "CLOSE RUNWAY" if o.status == "open" else "OPEN RUNWAY"
		else: airside_toggle.text = {0: "MAKE ONE-WAY →", 1: "MAKE ONE-WAY ←", -1: "MAKE TWO-WAY"}[int(o.get("direction", 0))]
	var cost := career.layout.object_cost(o) if o.type in AirportLayout.AIRSIDE_TYPES else int(career.layout.catalog[o.type].cost_cents)
	var refund := cost if o.id in career.layout.session_ids else cost * int(career.base.construction.get("refund_permille", 0)) / 1000
	demolish_button.text = "DEMOLISH · refund %s" % AirportEconomy.money(refund)


# --- airside tool (M12) ------------------------------------------------------------------

func _airside_heading() -> String:
	return ["E", "W", "N", "S"][maxi(0, airside_heading.selected)]

func _airside_length() -> int:
	var lengths: Array = career.layout.catalog.get("runway", {}).get("lengths_m", [3000])
	return int(lengths[clampi(airside_length.selected, 0, lengths.size() - 1)])

func _airside_state(o: Dictionary) -> String:
	match o.type:
		"runway", "legacy_runway": return "" if o.status == "open" else " · CLOSED"
		_:
			return {0: " · two-way", 1: " · one-way", -1: " · one-way (reversed)"}[int(o.get("direction", 0))]

## Preview: length, cost, validity, what it serves, and what the day would say.
func _refresh_airside_info(type: String) -> void:
	airside_map.heading = _airside_heading()
	airside_map.length_m = _airside_length()
	airside_map.queue_redraw()
	var picks: Array = airside_map.picks
	var cash := career.settled_cash_cents()
	var layout := career.layout
	var reason := ""
	var cost := 0
	var text := ""
	if type == "taxiway":
		if picks.size() < 2:
			build_info.text = "Click two points on the map: an existing taxiway node, runway end or hold, and another node or a free grid point. Taxiways may not cross each other or a runway except at shared points, nor enter the terminal."
			return
		reason = layout.taxiway_error(picks[0], picks[1])
		var a := layout.current_airside()
		var length := roundi(AirportLayout._pos(a, picks[0]).distance_to(AirportLayout._pos(a, picks[1])))
		cost = layout.taxiway_cost(picks[0], picks[1])
		text = "Taxiway %s → %s · %d m · %.0f s at taxi speed · narrow and wide" % [picks[0], picks[1], length, length / float(a.get("taxi_speed_mps", 10))]
	else:
		if picks.is_empty():
			build_info.text = "Click a free grid point for the runway's start, then pick its heading and length. Runways must keep 300 m from other runways and stay clear of taxiways; connect taxiways to its two ends afterwards."
			return
		reason = layout.runway_error(picks[0], _airside_heading(), _airside_length())
		cost = layout.runway_cost(_airside_length())
		var serves: Array = []
		var minimums: Dictionary = layout.base.airside.get("min_runway_length_m", {})
		for t in AirportLayout._sorted(minimums.keys()):
			if _airside_length() >= int(minimums[t]): serves.append(t)
		text = "Runway %s · %d m heading %s · serves %s" % [layout.next_runway_id(), _airside_length(), _airside_heading(), ", ".join(serves) if not serves.is_empty() else "nothing"]
	text += "\nCash %s · cost %s · after %s" % [AirportEconomy.money(cash), AirportEconomy.money(cost), AirportEconomy.money(cash - cost)]
	if not reason.is_empty():
		build_info.text = text + "\n[cannot build] " + reason
		return
	# What the next day would say with it in place (connectivity, gates, runways).
	var trial := AirportLayout.new()
	trial.bind(career.base)
	trial.restore(layout.snapshot())
	if type == "taxiway": trial.place_airside({"type": "taxiway", "from": picks[0], "to": picks[1], "direction": [0, 1, -1][airside_direction.selected]})
	else: trial.place_airside({"type": "runway", "start": picks[0], "heading": _airside_heading(), "length_m": _airside_length(), "status": "open"})
	var config := trial.apply(career.day_config(false))
	var errors := trial.validate(config)
	text += "\n" + ("Airport valid with it." if errors.is_empty() else "Next day would still need: " + str(errors[0]))
	build_info.text = text
	build_button.disabled = cash < cost
