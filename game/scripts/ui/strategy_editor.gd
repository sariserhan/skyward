class_name StrategyEditor
extends PanelContainer
## Overlay for building a custom boarding strategy (spec §19, Strategy E).
## Groups are rows with a row range, seat-type checkboxes and an in-group
## order. Groups can be reordered and removed. Apply emits the strategy.

signal applied(strategy: BoardingStrategy)
signal cancelled

var _rows_box: VBoxContainer
var _warning: Label
var _aircraft: AircraftDef
var _groups: Array = []  # working copy of BoardingStrategy.Group


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.6)
	add_theme_stylebox_override("panel", bg)
	visible = false

	var center := CenterContainer.new()
	add_child(center)
	var panel := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#1c2129")
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 16
	style.content_margin_bottom = 16
	panel.add_theme_stylebox_override("panel", style)
	panel.custom_minimum_size = Vector2(760, 0)
	center.add_child(panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)
	panel.add_child(vbox)

	var title := Label.new()
	title.text = "EDIT STRATEGY"
	title.add_theme_font_size_override("font_size", 20)
	vbox.add_child(title)

	var hint := Label.new()
	hint.text = "Passengers board group by group, top to bottom. A passenger joins the first group that matches their row and seat type."
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.modulate = Color("#aab4c0")
	vbox.add_child(hint)

	var header := HBoxContainer.new()
	vbox.add_child(header)
	for h in [["#", 28], ["Name", 140], ["Rows from", 90], ["to", 90], ["Window", 70], ["Middle", 70], ["Aisle", 70], ["Order in group", 150], ["", 100]]:
		var l := Label.new()
		l.text = h[0]
		l.custom_minimum_size.x = h[1]
		l.modulate = Color("#6b7684")
		header.add_child(l)

	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(0, 260)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	vbox.add_child(scroll)
	_rows_box = VBoxContainer.new()
	_rows_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_rows_box)

	_warning = Label.new()
	_warning.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_warning.modulate = Color("#f5a524")
	vbox.add_child(_warning)

	var buttons := HBoxContainer.new()
	buttons.add_theme_constant_override("separation", 8)
	vbox.add_child(buttons)
	var add := Button.new()
	add.text = "+ Add group"
	add.pressed.connect(_on_add_group)
	buttons.add_child(add)
	var preset_label := Label.new()
	preset_label.text = "   Start from:"
	buttons.add_child(preset_label)
	var preset := OptionButton.new()
	for id in BoardingStrategy.PRESET_IDS:
		preset.add_item(BoardingStrategy.PRESET_NAMES[id])
	preset.select(-1)
	preset.item_selected.connect(func(i):
		_load_groups(BoardingStrategy.preset(BoardingStrategy.PRESET_IDS[i], _aircraft).groups)
		preset.select(-1)
	)
	buttons.add_child(preset)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buttons.add_child(spacer)
	var cancel := Button.new()
	cancel.text = "Cancel"
	cancel.pressed.connect(func():
		visible = false
		cancelled.emit()
	)
	buttons.add_child(cancel)
	var apply := Button.new()
	apply.text = "Apply"
	apply.pressed.connect(_on_apply)
	buttons.add_child(apply)


func open(strategy: BoardingStrategy, aircraft: AircraftDef) -> void:
	_aircraft = aircraft
	var groups: Array = []
	for g in strategy.groups:
		if g.name != BoardingStrategy.UNASSIGNED_NAME:
			groups.append(g)
	_load_groups(groups)
	visible = true


func _load_groups(source: Array) -> void:
	_groups = []
	for g in source:
		var copy := BoardingStrategy.Group.from_dict(g.to_dict())
		copy.row_to = mini(copy.row_to, _aircraft.rows)
		_groups.append(copy)
	if _groups.is_empty():
		_on_add_group()
	else:
		_rebuild_rows()


func _on_add_group() -> void:
	var g := BoardingStrategy.Group.new()
	g.name = "Group %d" % (_groups.size() + 1)
	g.row_from = 1
	g.row_to = _aircraft.rows
	g.seat_types = []
	g.order = BoardingStrategy.Order.RANDOM
	_groups.append(g)
	_rebuild_rows()


func _rebuild_rows() -> void:
	for c in _rows_box.get_children():
		c.queue_free()
	for i in _groups.size():
		_rows_box.add_child(_make_row(i))
	_update_warning()


func _make_row(i: int) -> Control:
	var g: BoardingStrategy.Group = _groups[i]
	var row := HBoxContainer.new()

	var idx := Label.new()
	idx.text = str(i + 1)
	idx.custom_minimum_size.x = 28
	row.add_child(idx)

	var name_edit := LineEdit.new()
	name_edit.text = g.name
	name_edit.custom_minimum_size.x = 140
	name_edit.text_changed.connect(func(t): g.name = t)
	row.add_child(name_edit)

	var from := SpinBox.new()
	from.min_value = 1
	from.max_value = _aircraft.rows
	from.value = g.row_from
	from.custom_minimum_size.x = 90
	row.add_child(from)
	var to := SpinBox.new()
	to.min_value = 1
	to.max_value = _aircraft.rows
	to.value = g.row_to
	to.custom_minimum_size.x = 90
	row.add_child(to)
	from.value_changed.connect(func(v):
		g.row_from = int(v)
		if g.row_to < g.row_from:
			to.value = v
		_update_warning()
	)
	to.value_changed.connect(func(v):
		g.row_to = int(v)
		if g.row_from > g.row_to:
			from.value = v
		_update_warning()
	)

	for t in [Passenger.SeatType.WINDOW, Passenger.SeatType.MIDDLE, Passenger.SeatType.AISLE]:
		var cb := CheckBox.new()
		cb.button_pressed = t in g.seat_types
		cb.custom_minimum_size.x = 70
		cb.toggled.connect(func(on):
			if on and not (t in g.seat_types):
				g.seat_types.append(t)
			elif not on:
				g.seat_types.erase(t)
			_update_warning()
		)
		row.add_child(cb)

	var order := OptionButton.new()
	for o in [BoardingStrategy.Order.RANDOM, BoardingStrategy.Order.BACK_TO_FRONT, BoardingStrategy.Order.FRONT_TO_BACK]:
		order.add_item(BoardingStrategy.ORDER_NAMES[o], o)
	order.select(order.get_item_index(g.order))
	order.custom_minimum_size.x = 150
	order.item_selected.connect(func(idx2): g.order = order.get_item_id(idx2))
	row.add_child(order)

	var up := Button.new()
	up.text = "↑"
	up.disabled = i == 0
	up.pressed.connect(func():
		var tmp = _groups[i - 1]
		_groups[i - 1] = _groups[i]
		_groups[i] = tmp
		_rebuild_rows()
	)
	row.add_child(up)
	var down := Button.new()
	down.text = "↓"
	down.disabled = i == _groups.size() - 1
	down.pressed.connect(func():
		var tmp = _groups[i + 1]
		_groups[i + 1] = _groups[i]
		_groups[i] = tmp
		_rebuild_rows()
	)
	row.add_child(down)
	var del := Button.new()
	del.text = "✕"
	del.pressed.connect(func():
		_groups.remove_at(i)
		_rebuild_rows()
	)
	row.add_child(del)
	return row


## Count seats (not passengers) that no group covers, as an early warning.
func _update_warning() -> void:
	if _aircraft == null:
		return
	var uncovered := 0
	for row in range(1, _aircraft.rows + 1):
		for letter in _aircraft.letters():
			var st := _aircraft.seat_type_of(letter)
			var covered := false
			for g in _groups:
				if row >= g.row_from and row <= g.row_to and (g.seat_types.is_empty() or st in g.seat_types):
					covered = true
					break
			if not covered:
				uncovered += 1
	if _groups.is_empty():
		_warning.text = "Add at least one group."
	elif uncovered > 0:
		_warning.text = "%d seats match no group. Those passengers will board last in an UNASSIGNED group." % uncovered
	else:
		_warning.text = ""


func _on_apply() -> void:
	var groups: Array = []
	for g in _groups:
		groups.append(BoardingStrategy.Group.from_dict(g.to_dict()))
	var s := BoardingStrategy.make_custom(groups)
	visible = false
	applied.emit(s)
