extends SceneTree
var main: Control
var frame: int = 0
var failures: int = 0

func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.save_path = "user://terminal_ui_test.json"
	root.add_child(main)

func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)

func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		2:
			main.sim.clock.paused = true
			main.sim.advance(228000 - main.sim.clock.tick)  # 06:20
			var east: SecurityCheckpoint = main.sim.airport.security_checkpoints.east
			var before := [east.staff, east.open_lanes]
			main.view_tabs.current_tab = 1
			main.operations_tabs.current_tab = 1
			main._refresh()
			# M13: one press opens a lane with its staff member.
			main.security_buttons.east[1].pressed.emit()
			check(east.staff == before[0] + 1, "opening a lane assigns staff")
			check(east.open_lanes == before[1] + 1, "opening a lane opens it")
			for _i in main.sim.airport.security_checkpoints.west.max_lanes:
				main.security_buttons.west[0].pressed.emit()
			check(main.sim.airport.security_checkpoints.west.open_lanes == 0, "lane controls can close checkpoint")
			main.sim.advance(main.sim.airport.security_checkpoints.west.service_ticks + 10)
			check(main.sim.airport.security_checkpoints.west.active.is_empty(), "closed checkpoint drains screening")
			main._refresh()
		4:
			check(not main.terminal_view.hits.is_empty(), "terminal draws clickable passengers")
			if not main.terminal_view.hits.is_empty():
				var id: int = main.terminal_view.hits.keys()[0]
				var click := InputEventMouseButton.new()
				click.button_index = MOUSE_BUTTON_LEFT
				click.pressed = true
				click.position = main.terminal_view.hits[id]
				main.terminal_view._gui_input(click)
				check(main.selected_passenger_id >= 0, "passenger click opens inspector")
		5:
			root.get_viewport().get_texture().get_image().save_png("/tmp/terminal-security.png")
			main._save()
			var saved: String = JSON.stringify(main.sim.snapshot())
			main.sim.advance(100)
			main._load_save()
			check(JSON.stringify(main.sim.snapshot()) == saved, "populated UI save restores all state")
			main._select("F009")
			main.operations_tabs.current_tab = main.passenger_list.get_index()
			check(main.passenger_list.item_count > 0, "selected flight has manifest")
			main.passenger_list.item_selected.emit(0)
			check(main.selected_passenger_id == main.passenger_list_ids[0], "manifest opens canonical passenger")
			main.gate_choice.select(7)
			main.assign_button.pressed.emit()
			check(main.sim.airport.flights.F009.assigned_gate_id == "A8", "passenger flight can be reassigned")
		7:
			root.get_viewport().get_texture().get_image().save_png("/tmp/terminal-passenger.png")
			check(main.get_viewport_rect().encloses(main.status_label.get_global_rect()), "layout fits 1280x800")
			print("Terminal UI smoke: %d failures" % failures)
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	return false
