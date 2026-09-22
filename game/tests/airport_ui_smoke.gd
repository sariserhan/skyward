extends SceneTree
var main: Control
var frame: int = 0
var failures: int = 0

func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.save_path = "user://airport_ui_test.json"
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
			main.sim.advance(18000)
			main._refresh()
			main._select("F009")
			check(main.map.selected_id == "F009", "flight board selection focuses aircraft")
			main.gate_choice.select(5)
			main.assign_button.pressed.emit()
			check(main.sim.airport.flights.F009.assigned_gate_id == "A6", "assign button changes gate")
			main.pause_button.pressed.emit()
			check(not main.sim.clock.paused, "pause button resumes")
			main.pause_button.pressed.emit()
			main._save()
			var saved_tick: int = main.sim.clock.tick
			main.sim.advance(50)
			main._load_save()
			check(main.sim.clock.tick == saved_tick, "load restores exact saved tick")
			main._select("F010")
		4:
			root.get_viewport().get_texture().get_image().save_png("/tmp/airport-operations.png")
			var click := InputEventMouseButton.new()
			click.button_index = MOUSE_BUTTON_LEFT
			click.pressed = true
			click.position = main.map.hits["F001"]
			main.map._gui_input(click)
			check(main.selected_id == "F001", "clicking an aircraft opens its flight")
			main.debug_panel.visible = true
			main._refresh()
		6:
			root.get_viewport().get_texture().get_image().save_png("/tmp/airport-debug.png")
			print("Airport UI smoke: %d failures" % failures)
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	return false
