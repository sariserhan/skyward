extends SceneTree
var main: Control
var frame:=0
var failures:=0
func _initialize() -> void:
	main=load("res://scenes/airport.tscn").instantiate()
	main.scenario_path=OS.get_environment("SKYWARD_AIRPORT_QA_SCENARIO")
	if main.scenario_path.is_empty(): main.scenario_path="res://configs/airports/career_starter.json"
	root.add_child(main)
func check(ok: bool,label: String) -> void:
	if not ok: failures+=1; push_error(label)
func _process(_delta: float) -> bool:
	frame+=1
	if frame==3:
		main.sim.clock.paused=true
		var f: AirportFlight=main.sim.flight_order[0]
		main.map3d.manual.button_pressed=true
		main.sim.advance(f.scheduled_arrival-int(main.sim.config.landing_ticks)-main.sim.clock.tick+1)
		main._select(f.id)
		main.map3d.command_buttons[0].pressed.emit()
		main.sim.advance(int(main.sim.config.landing_ticks)+5)
		for i in 1000:
			if f.status=="taxiing_in": break
			main.sim.step()
		check(f.status=="taxiing_in","arrival reaches taxi")
		main.map3d.command_buttons[1].pressed.emit()
		var result:=TowerOperations.apply_route(main.sim,f.id,[])
		check(result.ok,"held route applies")
		main.map3d.report_command(result)
		main.map3d.desk.route_flight=f.id
		main.map3d.desk._preview()
		check(not main.map3d.desk.radar.route.is_empty(),"radar route preview")
		main.map3d.desk.open()
		main.map3d.desk.weather_choice.item_selected.emit(1)
		check(TowerOperations.weather(main.sim).wet,"weather changes through control")
		check(main.map3d.detail_scene.rain.emitting,"rain emitter starts")
		main.map3d.airport_sound.set_enabled(true)
		main.map3d.airport_sound.touch_down()
		main.map3d.command_buttons[2].pressed.emit()
		check(not f.taxi_hold,"resume through button")
		main.map3d.camera_mode="Orbit"
	if frame==30:
		var desk: TowerDesk=main.map3d.desk
		var header:=desk.get_child(0).get_child(0)
		var grip:=header.get_child(0)
		var initial:=desk.global_position
		var press:=InputEventMouseButton.new(); press.button_index=MOUSE_BUTTON_LEFT; press.pressed=true; grip.gui_input.emit(press)
		var motion:=InputEventMouseMotion.new(); motion.relative=Vector2(-100,20); grip.gui_input.emit(motion)
		press.pressed=false; grip.gui_input.emit(press)
		check(desk.global_position!=initial,"drag handle moves desk")
		header.get_child(1).pressed.emit(); check(not desk.contents.visible,"minimize collapses content")
		header.get_child(1).pressed.emit(); check(desk.contents.visible,"restore expands content")
		desk.open()
	if frame==60:
		root.get_texture().get_image().save_png("/tmp/airport-controller-rain.png")
		main.map3d.manual.button_pressed=false
		main.sim.advance(5000)
		main.map3d.night=true; main.map3d._lighting()
		main.map3d.camera_mode="Follow"
	if frame==100:
		check(not main.map3d.detail_scene.vehicles.is_empty(),"active tasks create service vehicles")
		main.map3d.desk.global_position=Vector2(-50,-50)
		main.map3d.desk._clamp_position()
		check(main.map3d.desk.global_position.x>=0,"dragged desk stays reachable")
		main.map3d.desk.open()
		root.get_texture().get_image().save_png("/tmp/airport-controller-night.png")
		print("Controller rendered checks: %d failures; %d service vehicles" % [failures,main.map3d.detail_scene.vehicles.size()])
		main.queue_free()
		# Audio playbacks release on the mixer thread, not on this render frame.
		# Allow a real mixer interval before terminating the engine itself.
		create_timer(.25).timeout.connect(func(): quit(failures))
	return false
