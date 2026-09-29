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
		if view.static_batch_stats.get("source_meshes",0) <= view.static_batch_stats.get("batches",0): failures += 1
		for gate in view.bridges:
			var bridge: Dictionary = view.bridges[gate]
			if not is_instance_valid(bridge.node) or bridge.node.is_queued_for_deletion(): failures += 1
			var stand := view._point(view.sim.airside.config.stands[gate])
			if bridge.base.distance_to(stand)>101: failures += 1
		print("Static scenery batching: ",view.static_batch_stats)
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
		if main.map3d.detail_scene.roof_units<=0 or main.map3d.detail_scene.floodlights.size()!=6: failures+=1
		main.map3d.night=true
		main.map3d._lighting()
		for light in main.map3d.detail_scene.floodlights:
			if not light.visible: failures+=1
	if frame == 210:
		root.get_texture().get_image().save_png("/tmp/airport-camera-refined.png")
		print("Airport camera checks: %d failures" % failures)
		main.queue_free()
	if frame == 220: quit(failures)
	return false
