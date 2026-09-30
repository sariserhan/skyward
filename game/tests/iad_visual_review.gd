extends SceneTree
## Reproducible IAD review shots, with real simulated turnaround state.
var main: Control
var frame := 0
var failures := 0
func _initialize() -> void:
	main=load("res://scenes/airport.tscn").instantiate()
	main.scenario_path="res://configs/airports/dulles.json"
	root.add_child(main)
func _process(_delta: float) -> bool:
	frame+=1
	if frame==5:
		main.sim.clock.paused=true
		var first: AirportFlight=main.sim.flight_order[0]
		main.sim.advance(first.scheduled_arrival+6000-main.sim.clock.tick)
		main._select(first.id)
		main.operations_tabs.visible=false
		main.detail_heading.get_parent().visible=false
		main.map3d.concourse_position=main.map3d._point(main.sim.airside.config.stands[first.assigned_gate_id])
		main.map3d.camera_mode="Concourse"
	if frame==90:
		root.get_texture().get_image().save_png("/tmp/iad-concourse-day.png")
		main.map3d.camera_mode="Apron"
	if frame==150:
		root.get_texture().get_image().save_png("/tmp/iad-apron-day.png")
		if main.map3d.camera.position.y>12 or main.map3d.camera.position.y<1: failures+=1
		if not main.map3d.clearance.clear(main.map3d._apron_camera_position(),1.5): failures+=1
		main.sim.config["tower_weather"]="Rain"
		main.map3d.apply_weather()
	if frame==210:
		root.get_texture().get_image().save_png("/tmp/iad-apron-rain.png")
		main.map3d.night=true
		main.map3d._lighting()
	if frame==270:
		root.get_texture().get_image().save_png("/tmp/iad-apron-night.png")
		if main.map3d.glazing_material.get_shader_parameter("night")!=1.0: failures+=1
		if main.map3d.asphalt_material.get_shader_parameter("wetness")!=1.0: failures+=1
		if main.map3d.detail_scene.floodlights.size()>6: failures+=1
		print("IAD visual review: ",failures," failures; static batching: ",main.map3d.static_batch_stats)
		main.queue_free()
	if frame==275: quit(failures)
	return false
