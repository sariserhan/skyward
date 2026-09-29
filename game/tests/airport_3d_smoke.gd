extends SceneTree
var main: Control
var frame := 0
var failures := 0
func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.scenario_path = OS.get_environment("SKYWARD_AIRPORT_QA_SCENARIO")
	root.add_child(main)
func _process(_delta: float) -> bool:
	frame += 1
	if frame == 3:
		main.sim.clock.paused = true
		main.map3d.manual.button_pressed = true
		var first: AirportFlight = main.sim.flight_order[0]
		main.sim.advance(first.scheduled_arrival-int(main.sim.config.landing_ticks)-main.sim.clock.tick+1)
		main._select(first.id)
		if not main.sim.airport.runways[first.runway_id].active_operation.is_empty(): failures += 1
		main.map3d.command_buttons[0].pressed.emit()
		main.sim.step()
		if main.sim.airport.runways[first.runway_id].active_operation.is_empty(): failures += 1
		if not "cleared" in main.map3d.radio.text: failures += 1
		main.map3d.manual.button_pressed = false
		main.sim.advance(first.scheduled_arrival+6000-main.sim.clock.tick)
		main._refresh()
		main._select(first.id)
		main.operations_tabs.visible = false
		main.detail_heading.get_parent().visible = false
		main.map3d.camera_mode = "Follow"
	if frame == 160:
		root.get_texture().get_image().save_png("/tmp/skyward-airport-3d-day.png")
		if main.map3d.models.is_empty(): failures += 1
		main.map3d.night = true
		main.map3d._lighting()
		main.map3d.camera_mode = "Tower"
	if frame == 240:
		root.get_texture().get_image().save_png("/tmp/skyward-airport-3d-night.png")
		print("3D airport rendered checks: %d failures; %d aircraft" % [failures,main.map3d.models.size()])
		main.queue_free()
	if frame == 242: quit(failures)
	return false
