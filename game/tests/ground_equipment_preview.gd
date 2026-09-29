extends SceneTree
var frames := 0
func _initialize() -> void:
	call_deferred("setup")
func setup() -> void:
	var world := Node3D.new(); root.add_child(world)
	var env := WorldEnvironment.new(); var e := Environment.new(); env.environment=e
	e.background_mode=Environment.BG_COLOR; e.background_color=Color("8296a6"); e.ambient_light_source=Environment.AMBIENT_SOURCE_COLOR; e.ambient_light_color=Color.WHITE; e.ambient_light_energy=.7; world.add_child(env)
	var sun := DirectionalLight3D.new(); sun.rotation_degrees=Vector3(-50,-25,0); sun.light_energy=1.5; sun.shadow_enabled=true; world.add_child(sun)
	var ground := MeshInstance3D.new(); var g:=PlaneMesh.new(); g.size=Vector2(80,50); ground.mesh=g; world.add_child(ground)
	var kinds := ["baggage_load","pushback","fuel","belt"]
	for i in kinds.size():
		var vehicle := AirportGroundEquipment.create(kinds[i])
		assert(vehicle != null)
		vehicle.position.x=i*12
		world.add_child(vehicle)
		for mesh: MeshInstance3D in vehicle.get_children():
			assert(mesh.mesh.get_aabb().size.y>.6, "Equipment import lost its body")
			assert(mesh.mesh.get_surface_count()>0)
		assert(vehicle.get_child_count()==(3 if i==0 else 1))
	var camera := Camera3D.new(); world.add_child(camera); camera.position=Vector3(7,6,-8); camera.look_at(Vector3(0,0,2)); camera.current=true

func _process(_delta:float) -> bool:
	frames+=1
	if frames==80:
		root.get_texture().get_image().save_png("/tmp/ground-equipment-preview.png"); quit()
	return false
