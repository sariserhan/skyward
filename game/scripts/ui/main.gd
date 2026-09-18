extends Control
## Main game screen (spec §20). Owns the UI and the game loop:
## Choose strategy → Start → Watch → Results → Retry.
## All simulation logic lives in scripts/sim; this file only wires it up.

enum Phase { PLANNING, RUNNING, COMPLETE }

const SPEEDS := [0.0, 1.0, 2.0, 4.0, 8.0]
const SPEED_LABELS := ["Pause", "1x", "2x", "4x", "8x"]

var scenarios: Array[Scenario] = []
var scenario: Scenario
var aircraft: AircraftDef
var config: SimConfig
var strategy: BoardingStrategy
var records: Records
var phase: int = Phase.PLANNING
var seed_override: int = -1
var selected_passenger: Passenger

var runner: SimRunner
var view: AircraftView
var editor: StrategyEditor

var time_label: Label
var scenario_select: OptionButton
var strategy_select: OptionButton
var group_list: VBoxContainer
var warning_label: Label
var best_label: Label
var start_button: Button
var edit_button: Button
var restart_button: Button
var speed_buttons: Array[Button] = []
var passenger_info: Label
var results_panel: PanelContainer
var results_grid: GridContainer
var results_title: Label
var debug_panel: PanelContainer
var debug_label: Label

var _suppress_strategy_signal := false


func _ready() -> void:
	records = Records.load_records()
	scenarios = Scenario.load_all()
	_build_ui()
	var default_index := 0
	for i in scenarios.size():
		if scenarios[i].scenario_id == "prototype_full_001":
			default_index = i
	scenario_select.select(default_index)
	_select_scenario(default_index)


# --- UI construction ------------------------------------------------------

func _panel_style(color: Color = Color("#1c2129"), radius: int = 6, margin: int = 12) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.corner_radius_top_left = radius
	s.corner_radius_top_right = radius
	s.corner_radius_bottom_left = radius
	s.corner_radius_bottom_right = radius
	s.content_margin_left = margin
	s.content_margin_right = margin
	s.content_margin_top = margin
	s.content_margin_bottom = margin
	return s


func _build_ui() -> void:
	var bg := ColorRect.new()
	bg.color = Color("#12151a")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var root := VBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 6)
	var root_margin := MarginContainer.new()
	root_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		root_margin.add_theme_constant_override("margin_" + side, 10)
	add_child(root_margin)
	root_margin.add_child(root)

	# Top bar
	var top := HBoxContainer.new()
	root.add_child(top)
	var title := Label.new()
	title.text = "BOARDING"
	title.add_theme_font_size_override("font_size", 24)
	top.add_child(title)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(spacer)
	time_label = Label.new()
	time_label.text = "TIME  00:00"
	time_label.add_theme_font_size_override("font_size", 24)
	top.add_child(time_label)

	# Middle: left panel + aircraft view
	var middle := HBoxContainer.new()
	middle.size_flags_vertical = Control.SIZE_EXPAND_FILL
	middle.add_theme_constant_override("separation", 10)
	root.add_child(middle)

	var left := PanelContainer.new()
	left.add_theme_stylebox_override("panel", _panel_style())
	left.custom_minimum_size.x = 300
	middle.add_child(left)
	var left_box := VBoxContainer.new()
	left_box.add_theme_constant_override("separation", 8)
	left.add_child(left_box)

	left_box.add_child(_section_label("SCENARIO"))
	scenario_select = OptionButton.new()
	for sc in scenarios:
		scenario_select.add_item("%s  ·  %d pax" % [sc.display_name, sc.passenger_count])
	scenario_select.item_selected.connect(_select_scenario)
	left_box.add_child(scenario_select)

	left_box.add_child(_section_label("BOARDING PLAN"))
	strategy_select = OptionButton.new()
	for id in BoardingStrategy.PRESET_IDS:
		strategy_select.add_item(BoardingStrategy.PRESET_NAMES[id])
	strategy_select.add_item(BoardingStrategy.PRESET_NAMES["custom"])
	strategy_select.item_selected.connect(_on_strategy_selected)
	left_box.add_child(strategy_select)

	group_list = VBoxContainer.new()
	group_list.add_theme_constant_override("separation", 2)
	left_box.add_child(group_list)

	warning_label = Label.new()
	warning_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warning_label.modulate = Color("#f5a524")
	left_box.add_child(warning_label)

	edit_button = Button.new()
	edit_button.text = "Edit Strategy"
	edit_button.pressed.connect(_open_editor)
	left_box.add_child(edit_button)

	start_button = Button.new()
	start_button.text = "START BOARDING"
	start_button.custom_minimum_size.y = 40
	start_button.add_theme_font_size_override("font_size", 16)
	start_button.pressed.connect(_on_start)
	left_box.add_child(start_button)

	best_label = Label.new()
	best_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	best_label.modulate = Color("#aab4c0")
	left_box.add_child(best_label)

	var flex := Control.new()
	flex.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_box.add_child(flex)

	left_box.add_child(_section_label("PASSENGER"))
	passenger_info = Label.new()
	passenger_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	passenger_info.text = "Click a passenger to inspect."
	passenger_info.modulate = Color("#aab4c0")
	passenger_info.custom_minimum_size.y = 120
	left_box.add_child(passenger_info)

	view = AircraftView.new()
	view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	view.passenger_clicked.connect(_on_passenger_clicked)
	view.background_clicked.connect(func():
		selected_passenger = null
		_update_passenger_info()
	)
	middle.add_child(view)

	# Bottom bar
	var bottom := HBoxContainer.new()
	bottom.add_theme_constant_override("separation", 6)
	root.add_child(bottom)
	for i in SPEEDS.size():
		var b := Button.new()
		b.text = SPEED_LABELS[i]
		b.toggle_mode = true
		b.custom_minimum_size.x = 64
		var speed: float = SPEEDS[i]
		b.pressed.connect(func(): _set_speed(speed))
		bottom.add_child(b)
		speed_buttons.append(b)
	var bspacer := Control.new()
	bspacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom.add_child(bspacer)
	var debug_hint := Label.new()
	debug_hint.text = "F3 debug"
	debug_hint.modulate = Color("#6b7684")
	bottom.add_child(debug_hint)
	restart_button = Button.new()
	restart_button.text = "Restart"
	restart_button.custom_minimum_size.x = 100
	restart_button.pressed.connect(_rebuild_sim)
	bottom.add_child(restart_button)

	# Runner
	runner = SimRunner.new()
	runner.completed.connect(_on_completed)
	add_child(runner)

	# Overlays
	editor = StrategyEditor.new()
	editor.applied.connect(_on_custom_applied)
	editor.cancelled.connect(_sync_strategy_select)
	add_child(editor)
	_build_results_panel()
	_build_debug_panel()


func _section_label(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", 12)
	l.modulate = Color("#6b7684")
	return l


func _build_results_panel() -> void:
	results_panel = PanelContainer.new()
	results_panel.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var dim := StyleBoxFlat.new()
	dim.bg_color = Color(0, 0, 0, 0.6)
	results_panel.add_theme_stylebox_override("panel", dim)
	results_panel.visible = false
	add_child(results_panel)
	var center := CenterContainer.new()
	results_panel.add_child(center)
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", _panel_style(Color("#1c2129"), 8, 24))
	card.custom_minimum_size = Vector2(420, 0)
	center.add_child(card)
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)
	card.add_child(vbox)
	results_title = Label.new()
	results_title.text = "BOARDING COMPLETE"
	results_title.add_theme_font_size_override("font_size", 22)
	vbox.add_child(results_title)
	results_grid = GridContainer.new()
	results_grid.columns = 2
	results_grid.add_theme_constant_override("h_separation", 32)
	results_grid.add_theme_constant_override("v_separation", 4)
	vbox.add_child(results_grid)
	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 8)
	vbox.add_child(buttons)
	var again := Button.new()
	again.text = "TRY AGAIN"
	again.pressed.connect(func():
		results_panel.visible = false
		_rebuild_sim()
	)
	buttons.add_child(again)
	var edit := Button.new()
	edit.text = "EDIT STRATEGY"
	edit.pressed.connect(func():
		results_panel.visible = false
		_rebuild_sim()
		_open_editor()
	)
	buttons.add_child(edit)
	var fresh := Button.new()
	fresh.text = "NEW PASSENGERS"
	fresh.pressed.connect(func():
		results_panel.visible = false
		_new_passengers()
	)
	buttons.add_child(fresh)


func _build_debug_panel() -> void:
	debug_panel = PanelContainer.new()
	debug_panel.add_theme_stylebox_override("panel", _panel_style(Color("#0f1216"), 6, 10))
	debug_panel.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	debug_panel.position = Vector2(-330, 50)
	debug_panel.custom_minimum_size = Vector2(320, 0)
	debug_panel.visible = false
	add_child(debug_panel)
	var vbox := VBoxContainer.new()
	debug_panel.add_child(vbox)
	debug_label = Label.new()
	debug_label.add_theme_font_size_override("font_size", 12)
	vbox.add_child(debug_label)
	var run := Button.new()
	run.text = "RUN TO COMPLETION"
	run.pressed.connect(func():
		if phase == Phase.PLANNING:
			_on_start()
		runner.run_to_completion()
	)
	vbox.add_child(run)


# --- scenario / strategy --------------------------------------------------

func _select_scenario(index: int) -> void:
	scenario = scenarios[index]
	seed_override = -1
	aircraft = scenario.load_aircraft()
	config = scenario.build_config()
	if strategy == null:
		strategy = BoardingStrategy.preset("random", aircraft)
		_sync_strategy_select()
	elif strategy.preset_id != "custom":
		strategy = BoardingStrategy.preset(strategy.preset_id, aircraft)
	_rebuild_sim()


func _on_strategy_selected(index: int) -> void:
	if _suppress_strategy_signal:
		return
	if index < BoardingStrategy.PRESET_IDS.size():
		strategy = BoardingStrategy.preset(BoardingStrategy.PRESET_IDS[index], aircraft)
		_rebuild_sim()
	else:
		_open_editor()


func _sync_strategy_select() -> void:
	_suppress_strategy_signal = true
	var idx := BoardingStrategy.PRESET_IDS.find(strategy.preset_id)
	strategy_select.select(idx if idx >= 0 else BoardingStrategy.PRESET_IDS.size())
	_suppress_strategy_signal = false


func _open_editor() -> void:
	editor.open(strategy, aircraft)


func _on_custom_applied(s: BoardingStrategy) -> void:
	strategy = s
	_sync_strategy_select()
	_rebuild_sim()


func _new_passengers() -> void:
	# A fresh seed means a fresh manifest with its own personal best.
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	seed_override = rng.randi_range(1, 2_000_000_000)
	_rebuild_sim()


# --- simulation lifecycle -------------------------------------------------

func _rebuild_sim() -> void:
	var sim := scenario.build_simulation(strategy, seed_override)
	runner.load_sim(sim)
	runner.speed = 1.0
	view.sim = sim
	view.selected_id = -1
	selected_passenger = null
	phase = Phase.PLANNING
	results_panel.visible = false
	_refresh_group_list()
	warning_label.text = "\n".join(sim.warnings)
	_update_best_label()
	_update_passenger_info()
	_update_speed_buttons()
	start_button.disabled = false
	start_button.text = "START BOARDING"


func _on_start() -> void:
	if phase != Phase.PLANNING:
		return
	phase = Phase.RUNNING
	start_button.disabled = true
	start_button.text = "BOARDING…"
	if runner.speed <= 0.0:
		runner.speed = 1.0
	runner.start()
	_update_speed_buttons()


func _set_speed(speed: float) -> void:
	runner.speed = speed
	if phase == Phase.RUNNING:
		runner.running = speed > 0.0
	_update_speed_buttons()


func _update_speed_buttons() -> void:
	for i in SPEEDS.size():
		speed_buttons[i].button_pressed = is_equal_approx(SPEEDS[i], runner.speed)


func _on_completed(result: Dictionary) -> void:
	phase = Phase.COMPLETE
	start_button.text = "COMPLETE"
	var prev_entry := records.entry_for(scenario)
	var prev_best := records.best_ticks(scenario, config)
	var prev_last := int(prev_entry.get("last_ticks", -1)) if records.is_current(prev_entry, config) else -1
	var is_best := records.record_attempt(scenario, config, result)
	_show_results(result, prev_best, prev_last, is_best)
	_update_best_label()


func _show_results(result: Dictionary, prev_best: int, prev_last: int, is_best: bool) -> void:
	var tr: int = config.tick_rate
	var total: int = result["total_ticks"]
	for c in results_grid.get_children():
		c.queue_free()
	_result_row("Total Time", Simulation.format_ticks(total, tr), true)
	if prev_best >= 0:
		_result_row("Previous Best", Simulation.format_ticks(prev_best, tr))
		_result_row("Improvement", _signed(total - prev_best, tr))
	else:
		_result_row("Previous Best", "—")
	if prev_last >= 0 and prev_last != prev_best:
		_result_row("Previous Attempt", "%s  (%s)" % [Simulation.format_ticks(prev_last, tr), _signed(total - prev_last, tr)])
	if scenario.target_time_seconds > 0:
		var target_ticks := scenario.target_time_seconds * tr
		_result_row("Target", "%s  %s" % [Simulation.format_ticks(target_ticks, tr), "✓ beaten" if total <= target_ticks else "✗ missed"])
	_result_row("", "")
	_result_row("Passengers", str(result["passengers"]))
	_result_row("Strategy", strategy.name)
	_result_row("", "")
	_result_row("Total Blocked Time", Simulation.format_ticks(result["blocked_ticks"], tr))
	_result_row("Luggage Delay", Simulation.format_ticks(result["stow_ticks"], tr))
	_result_row("Seat Interference", Simulation.format_ticks(result["seat_wait_ticks"], tr))
	results_title.text = "BOARDING COMPLETE" + ("  ·  NEW BEST" if is_best else "")
	results_panel.visible = true


func _result_row(label: String, value: String, emphasis: bool = false) -> void:
	var l := Label.new()
	l.text = label
	l.modulate = Color("#aab4c0")
	var v := Label.new()
	v.text = value
	if emphasis:
		l.add_theme_font_size_override("font_size", 18)
		v.add_theme_font_size_override("font_size", 18)
		l.modulate = Color("#ffffff")
	results_grid.add_child(l)
	results_grid.add_child(v)


func _signed(delta_ticks: int, tr: int) -> String:
	var sign_txt := "-" if delta_ticks < 0 else "+"
	return sign_txt + Simulation.format_ticks(absi(delta_ticks), tr)


# --- labels ---------------------------------------------------------------

func _refresh_group_list() -> void:
	for c in group_list.get_children():
		c.queue_free()
	for i in strategy.groups.size():
		var g = strategy.groups[i]
		var row := HBoxContainer.new()
		var swatch := ColorRect.new()
		swatch.color = AircraftView.group_color(i)
		swatch.custom_minimum_size = Vector2(10, 10)
		swatch.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(swatch)
		var l := Label.new()
		l.text = " %d. %s — %s" % [i + 1, g.name, g.describe()]
		l.add_theme_font_size_override("font_size", 12)
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(l)
		group_list.add_child(row)


func _update_best_label() -> void:
	var best := records.best_ticks(scenario, config)
	var attempts := records.attempt_count(scenario)
	var txt := "Seed %d" % (scenario.seed_value if seed_override < 0 else seed_override)
	if best >= 0:
		var e := records.entry_for(scenario)
		var sname: String = str(e.get("strategy", {}).get("name", "?"))
		txt += "\nPersonal best %s (%s)" % [Simulation.format_ticks(best, config.tick_rate), sname]
	else:
		txt += "\nNo personal best yet"
	txt += "\nAttempts: %d" % attempts
	if scenario.target_time_seconds > 0:
		txt += "   Target: %s" % Simulation.format_ticks(scenario.target_time_seconds * config.tick_rate, config.tick_rate)
	best_label.text = txt


func _on_passenger_clicked(p: Passenger) -> void:
	selected_passenger = p
	_update_passenger_info()


func _update_passenger_info() -> void:
	var p := selected_passenger
	if p == null:
		passenger_info.text = "Click a passenger to inspect."
		return
	var tr: int = config.tick_rate
	var lines: Array[String] = []
	lines.append("Passenger #%d" % p.id)
	lines.append("Seat: %s (%s)" % [p.seat_key(), p.seat_type_name()])
	lines.append("Group: %d · %s" % [p.boarding_group + 1, p.boarding_group_name])
	lines.append("Carry-ons: %d" % p.carry_on_count)
	lines.append("State: %s" % p.state_name())
	lines.append("Blocked time: %.1f s" % (float(p.total_blocked_time) / tr))
	if p.state == Passenger.State.WAITING_FOR_SEAT:
		lines.append("Waiting for %d seated passenger%s" % [p.obstruction_count, "" if p.obstruction_count == 1 else "s"])
	if p.is_in_aisle() and p.state != Passenger.State.WALKING and p.state != Passenger.State.ENTERING:
		var sim := runner.sim
		lines.append("Passengers delayed: %d" % sim.passengers_delayed_behind(p.aisle_position))
	passenger_info.text = "\n".join(lines)


func _process(_delta: float) -> void:
	var sim := runner.sim
	if sim == null:
		return
	time_label.text = "TIME  %s" % Simulation.format_ticks(sim.tick, config.tick_rate)
	if selected_passenger != null:
		_update_passenger_info()
	if debug_panel.visible:
		_update_debug()


func _update_debug() -> void:
	var sim := runner.sim
	var counts := sim.state_counts()
	var lines: Array[String] = []
	lines.append("seed        %d" % sim.seed_value)
	lines.append("tick        %d" % sim.tick)
	lines.append("sim ticks/s %d   fps %d" % [runner.sim_tps, Engine.get_frames_per_second()])
	lines.append("aisle occ   %d / %d" % [sim.aisle_occupancy(), sim.aisle.size()])
	lines.append("queue       %d" % sim.queue_remaining())
	lines.append("boarded     %d / %d" % [sim.seated_count, sim.total_passengers()])
	lines.append("")
	for s in Passenger.State.values():
		lines.append("%-18s %d" % [Passenger.STATE_NAMES[s], counts[s]])
	debug_label.text = "\n".join(lines)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_F3:
				debug_panel.visible = not debug_panel.visible
			KEY_SPACE:
				if phase == Phase.PLANNING:
					_on_start()
				elif phase == Phase.RUNNING:
					_set_speed(0.0 if runner.speed > 0.0 else 1.0)
			KEY_1:
				_set_speed(1.0)
			KEY_2:
				_set_speed(2.0)
			KEY_4:
				_set_speed(4.0)
			KEY_8:
				_set_speed(8.0)
			KEY_R:
				_rebuild_sim()
