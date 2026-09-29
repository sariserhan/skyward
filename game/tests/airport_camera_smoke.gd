extends SceneTree
var main: Control
var frame := 0
var failures := 0
func _initialize() -> void:
	main = load("res://scenes/airport.tscn").instantiate()
	main.scenario_path = AirportLaunch.DULLES
	root.add_child(main)
func _process(_delta: float) -> bool:
	frame += 1
	if frame == 5: main.sim.clock.paused = true
	if frame == 90:
		var view: Airport3D = main.map3d
		if view.camera_mode != "Concourse": failures += 1
		var target := view.camera_target
		var before := view.camera.position.distance_to(target)
		var wheel := InputEventMouseButton.new()
		wheel.button_index = MOUSE_BUTTON_WHEEL_UP
		wheel.pressed = true
		view._input_view(wheel)
		if view.camera_mode != "Orbit" or not view.center.is_equal_approx(target): failures += 1
		if view.distance >= before: failures += 1
		view.panning = true
		var pan := InputEventMouseMotion.new()
		pan.relative = Vector2(45,20)
		view._input_view(pan)
		view.panning = false
		if view.center.distance_to(target) < 1: failures += 1
	if frame == 150:
		root.get_texture().get_image().save_png("/tmp/airport-camera-refined.png")
		print("Airport camera checks: %d failures" % failures)
		main.queue_free()
	if frame == 160: quit(failures)
	return false
