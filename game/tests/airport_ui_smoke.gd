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
			main.sim.advance(234000 - main.sim.clock.tick)  # 06:30
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
			main.debug_panel.visible = false
			# M3: advance the demo flight F002 into live boarding.
			var f: AirportFlight = main.sim.airport.flights.F002
			while not (f.boarding_phase == "open" and main.sim.boarding_sessions.F002.engine.seated_count > 40):
				main.sim.step()
			main._select("F002")
			check(main.gate_choice.disabled == false and main.assign_button.disabled, "gate locked during boarding")
			check(main.strategy_choice.disabled, "strategy locked once boarding opens")
			check(not main.view_boarding_button.disabled, "view boarding available")
			main.hold_button.pressed.emit()
			check(f.hold_ticks == 3000, "hold button holds the flight")
			main._save()
			check(main.status_label.text == "Saved", "saving works during boarding")
			main.view_boarding_button.pressed.emit()
			check(main.boarding_overlay.visible and main.boarding_overlay.view.sim == main.sim.boarding_sessions.F002.engine, "overlay observes the live engine")
		8:
			root.get_viewport().get_texture().get_image().save_png("/tmp/airport-boarding.png")
			var view: AircraftView = main.boarding_overlay.view
			check(not view._passenger_pos.is_empty(), "overlay draws passengers")
			var engine_tick: int = main.sim.boarding_sessions.F002.engine.tick
			main.sim.clock.paused = false
		10:
			check(main.sim.boarding_sessions.F002.engine.tick > 0, "airport keeps running under the overlay")
			main.sim.clock.paused = true
			main.boarding_overlay.closed.emit()
			check(not main.boarding_overlay.visible, "overlay closes")
			var f: AirportFlight = main.sim.airport.flights.F002
			while f.status != "taxiing_out": main.sim.step()
			main._refresh()
		11:
			root.get_viewport().get_texture().get_image().save_png("/tmp/airport-boarding-result.png")
			check(main.detail.text.contains("Last passenger seated"), "inspector shows boarding result")
			print("Airport UI smoke: %d failures" % failures)
			DirAccess.remove_absolute(main.save_path)
			quit(failures)
	return false
