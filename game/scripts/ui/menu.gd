extends Control
## M13 main menu: CONTINUE, NEW CAREER, SANDBOX, LOAD GAME, SETTINGS, QUIT.
## Developer scenarios (the test and demo fixtures) only appear with --dev,
## the developer setting, or in the Developer page of a debug build.

const INK := Color("a7becd")
const MINT := Color("70dec0")
const AMBER := Color("ffc078")

var pages: Dictionary = {}
var status: Label
var name_edit: LineEdit
var seed_edit: LineEdit
var difficulty_choice: OptionButton
var saves_list: ItemList
var save_paths: Array = []
var continue_button: Button


func _ready() -> void:
	GameSettings.apply(get_tree())
	# Developer path: --scenario= skips the menu (M8–M12 demos and fixtures).
	for arg in OS.get_cmdline_user_args() + OS.get_cmdline_args():
		if arg.begins_with("--scenario="):
			get_tree().change_scene_to_file.call_deferred(AirportLaunch.AIRPORT_SCENE)
			return
	_build()
	_show("home")


func _button(parent: Node, text: String, action: Callable, size := 18) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", size)
	b.custom_minimum_size = Vector2(320, 46)
	b.pressed.connect(action)
	parent.add_child(b)
	return b


func _label(parent: Node, text: String, size := 16, color := INK) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.modulate = color
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	parent.add_child(l)
	return l


func _page(id: String) -> VBoxContainer:
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 12)
	v.visible = false
	pages[id] = v
	return v


func _build() -> void:
	var background := ColorRect.new()
	background.color = Color("0d1c26")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(center)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	column.custom_minimum_size.x = 520
	center.add_child(column)
	_label(column, "RIVERDALE / BOARDING", 34, Color.WHITE)
	_label(column, "Run a small airport. Grow it.", 16)
	for id in ["home", "new", "dulles", "load", "settings", "developer"]: column.add_child(_page(id))
	# Home
	var home: VBoxContainer = pages.home
	continue_button = _button(home, "CONTINUE", _continue)
	_button(home, "NEW CAREER", func(): _show("new"))
	_button(home, "SANDBOX · RIVERDALE INTERNATIONAL", func():
		AirportLaunch.open(get_tree(), AirportLaunch.start_new(AirportLaunch.SANDBOX, -1, {"mode": "sandbox", "name": "Riverdale International"})))
	_button(home, "WASHINGTON DULLES · IAD", func(): _show("dulles"))
	_button(home, "LOAD GAME", func(): _show("load"))
	_button(home, "SETTINGS", func(): _show("settings"))
	if GameSettings.developer() or OS.is_debug_build(): _button(home, "DEVELOPER SCENARIOS", func(): _show("developer"))
	if not OS.has_feature("web"): _button(home, "QUIT", func(): get_tree().quit())
	# Real airport sandbox, with the traffic provenance visible before starting.
	var dulles: VBoxContainer = pages.dulles
	_label(dulles, "WASHINGTON DULLES · IAD", 24, Color.WHITE)
	_label(dulles, "Four runways. The real terminal footprints and mapped taxiways. United, American, Delta and British Airways.", 16)
	_label(dulles, "SAMPLE TRAFFIC · OFFLINE", 16, AMBER)
	_label(dulles, "14 illustrative flights, 12 active gates. Flight numbers, times, aircraft assignments and airline policies are simulated. This is not today's schedule.", 14)
	_label(dulles, "North is up. Scroll to zoom; right-drag to pan. Buildings and gates become clearer as you zoom in.", 14)
	_label(dulles, "Geometry: FAA runway thresholds; © OpenStreetMap contributors (ODbL). Ground operations and terminal transfers are approximations.", 13)
	_button(dulles, "PLAY DULLES", func():
		AirportLaunch.open(get_tree(), AirportLaunch.start_new(AirportLaunch.DULLES, -1, {"mode": "sandbox", "name": "Washington Dulles · IAD"})))
	_button(dulles, "BACK", func(): _show("home"))
	# New career
	var new: VBoxContainer = pages.new
	_label(new, "NEW CAREER", 22, Color.WHITE)
	_label(new, "Harbor Field Regional: one runway, three gates, three airlines. Your first day starts at once.", 14)
	_label(new, "Airport name", 14)
	name_edit = LineEdit.new()
	name_edit.text = "Harbor Field Regional"
	new.add_child(name_edit)
	_label(new, "Career seed (same seed and same decisions → same airport)", 14)
	seed_edit = LineEdit.new()
	seed_edit.text = str(randi() % 90000 + 10000)
	new.add_child(seed_edit)
	_label(new, "Difficulty", 14)
	difficulty_choice = OptionButton.new()
	for label in ["Relaxed · more cash, looser contracts, faster growth", "Standard", "Challenging · less cash, stricter contracts, slower growth"]:
		difficulty_choice.add_item(label)
	difficulty_choice.select(1)
	new.add_child(difficulty_choice)
	_button(new, "START", _start_career)
	_button(new, "BACK", func(): _show("home"))
	# Load
	var load_page: VBoxContainer = pages.load
	_label(load_page, "LOAD GAME", 22, Color.WHITE)
	saves_list = ItemList.new()
	saves_list.custom_minimum_size = Vector2(520, 260)
	saves_list.item_activated.connect(func(_i): _load_selected())
	load_page.add_child(saves_list)
	_button(load_page, "LOAD", _load_selected)
	_button(load_page, "BACK", func(): _show("home"))
	# Settings
	var settings: VBoxContainer = pages.settings
	_label(settings, "SETTINGS", 22, Color.WHITE)
	for pair in [["tips", "Show tips as situations come up"], ["slow_on_critical", "Drop to 1× speed on a critical alert"], ["pause_on_critical", "Pause on a critical alert"]]:
		var check := CheckBox.new()
		check.text = pair[1]
		check.button_pressed = bool(GameSettings.get_value(pair[0]))
		check.toggled.connect(func(on): GameSettings.set_value(pair[0], on))
		settings.add_child(check)
	var scale_row := HBoxContainer.new()
	settings.add_child(scale_row)
	var scale_label := _label(scale_row, "Interface scale  ", 14)
	scale_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	var scale := OptionButton.new()
	for s in [0.85, 1.0, 1.15, 1.3]: scale.add_item("%d%%" % roundi(s * 100))
	scale.select([0.85, 1.0, 1.15, 1.3].find(snappedf(float(GameSettings.get_value("ui_scale")), 0.05)) if [0.85, 1.0, 1.15, 1.3].has(snappedf(float(GameSettings.get_value("ui_scale")), 0.05)) else 1)
	scale.item_selected.connect(func(i):
		GameSettings.set_value("ui_scale", [0.85, 1.0, 1.15, 1.3][i])
		GameSettings.apply(get_tree()))
	scale_row.add_child(scale)
	_button(settings, "EXPORT PLAYTEST BUNDLE", func():
		var path := AirportPlaytestLog.export_bundle(null, get_viewport())
		status.text = "Playtest bundle written: " + ProjectSettings.globalize_path(path) if not path.is_empty() else "Nothing to export yet")
	_button(settings, "RESET PLAYTEST DATA", func():
		AirportPlaytestLog.reset()
		status.text = "Playtest log cleared: a fresh session starts now.")
	_button(settings, "BACK", func(): _show("home"))
	# Developer
	var dev: VBoxContainer = pages.developer
	_label(dev, "DEVELOPER SCENARIOS", 22, Color.WHITE)
	for file in DirAccess.get_files_at("res://configs/airports"):
		if not file.ends_with(".json"): continue
		var path := "res://configs/airports/" + file
		_button(dev, file.trim_suffix(".json"), func():
			AirportLaunch.open(get_tree(), AirportLaunch.start_new(path, -1, {"name": file.trim_suffix(".json")})), 14)
	_button(dev, "BACK", func(): _show("home"))
	status = _label(column, "", 13, AMBER)


func _show(page: String) -> void:
	for id in pages: pages[id].visible = id == page
	status.text = ""
	if page == "home": continue_button.disabled = CareerSaves.latest().is_empty()
	if page == "load":
		saves_list.clear()
		save_paths = []
		for meta in CareerSaves.list():
			var when := Time.get_datetime_string_from_unix_time(int(meta.saved_unix)).replace("T", " ")
			saves_list.add_item("%s · %s · day %d (%s) · %s · %s" % [meta.name, "sandbox" if meta.mode == "sandbox" else meta.difficulty, int(meta.day),
				meta.phase, AirportEconomy.money(int(meta.cash_cents)), when])
			save_paths.append(meta.path)
		if save_paths.is_empty(): status.text = "No saves yet."


func _continue() -> void:
	var path := CareerSaves.latest()
	var c := CareerSaves.load_path(path) if not path.is_empty() else null
	if c == null:
		status.text = "The latest save could not be loaded (it may be from an older version)."
		return
	AirportPlaytestLog.log_event("menu_continue", {"day": c.day})
	AirportLaunch.open(get_tree(), c)


func _load_selected() -> void:
	var selected := saves_list.get_selected_items()
	if selected.is_empty(): return
	var c := CareerSaves.load_path(save_paths[selected[0]])
	if c == null:
		status.text = "That save could not be loaded (it may be from an older version)."
		return
	AirportPlaytestLog.log_event("menu_load", {"day": c.day})
	AirportLaunch.open(get_tree(), c)


func _start_career() -> void:
	var seed := int(seed_edit.text) if seed_edit.text.is_valid_int() else 5313
	var difficulty: String = AirportCareer.DIFFICULTIES[difficulty_choice.selected]
	var name := name_edit.text.strip_edges()
	if name.is_empty(): name = "Harbor Field Regional"
	AirportPlaytestLog.log_event("menu_new_career", {"seed": seed, "difficulty": difficulty})
	AirportLaunch.open(get_tree(), AirportLaunch.start_new(AirportLaunch.STARTER, seed, {"mode": "career", "name": name, "difficulty": difficulty}))
