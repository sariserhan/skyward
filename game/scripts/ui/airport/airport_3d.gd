class_name Airport3D
extends VBoxContainer
## A view/controller over the same deterministic airport simulation, never a second world.
signal flight_selected(flight_id: String)
var sim: AirportSimulation
var selected_id := ""
var world: Node3D
var viewport: SubViewport
var camera: Camera3D
var sun: DirectionalLight3D
var environment: Environment
var models: Dictionary = {}
var scenes: Dictionary = {}
var bridges: Dictionary = {}
var arrival_starts: Dictionary = {}
var center := Vector3.ZERO
var airport_center := Vector3.ZERO
var radius := 2000.0
var yaw := 0.0
var elevation := 0.9
var distance := 3000.0
var camera_mode := "Orbit"
var concourse_position := Vector3.ZERO
var dragging := false
var panning := false
var camera_target := Vector3.ZERO
var apron_material: ShaderMaterial
var building_material: ShaderMaterial
var night := false
var manual: CheckButton
var status: Label
var runway_status: Label
var radio: RichTextLabel
var command_buttons: Array[Button] = []
var refresh := 0.0
var bound_sim: AirportSimulation
var labels := true
var skip_idle: Button
var flight_choice: OptionButton
var desk: TowerDesk
var detail_scene := AirportSceneDetail.new()
var quality := 0
var tower_position := Vector3.ZERO
var airport_sound: AirportSound
var material_cache: Dictionary = {}
var pavement_cache: Dictionary = {}
var asphalt: NoiseTexture2D
var static_batch_stats := {}
var route_overlay: Node3D

func _ready() -> void:
	custom_minimum_size = Vector2(600, 290)
	var tools := HFlowContainer.new()
	add_child(tools)
	for mode in ["Orbit", "Concourse", "Tower", "Follow", "Top"]:
		var button := Button.new()
		button.text = mode
		button.pressed.connect(func():
			if mode == "Orbit" or mode == "Top": center = airport_center; distance = radius*1.1
			camera_mode = mode)
		tools.add_child(button)
	var gate_camera := Button.new()
	gate_camera.text = "Selected gate"
	gate_camera.tooltip_text = "Inspect the assigned stand of the selected flight."
	gate_camera.pressed.connect(func():
		if sim == null or not sim.airport.flights.has(selected_id): return
		var gate: String = sim.airport.flights[selected_id].assigned_gate_id
		if not sim.airside.config.get("stands", {}).has(gate): return
		concourse_position = _point(sim.airside.config.stands[gate])
		camera_mode = "Concourse")
	tools.add_child(gate_camera)
	skip_idle = Button.new()
	skip_idle.text = "Next arrival"
	skip_idle.tooltip_text = "Skip quiet time only when every flight is still scheduled."
	skip_idle.pressed.connect(func():
		if sim == null or sim.flight_order.any(func(f): return f.status != "scheduled"): return
		var first: AirportFlight = sim.flight_order[0]
		for f: AirportFlight in sim.flight_order:
			if f.scheduled_arrival+f.inbound_delay_ticks < first.scheduled_arrival+first.inbound_delay_ticks: first=f
		var at := first.scheduled_arrival+first.inbound_delay_ticks-int(sim.config.approach_ticks)+1
		sim.advance(maxi(0,at-sim.clock.tick))
		flight_selected.emit(first.id)
		camera_mode="Follow"
	)
	tools.add_child(skip_idle)
	var light := Button.new()
	light.text = "Day / night"
	light.pressed.connect(func(): night = not night; _lighting())
	tools.add_child(light)
	var names := CheckButton.new()
	names.text = "Labels"
	names.button_pressed = true
	names.toggled.connect(func(on: bool): labels = on)
	tools.add_child(names)
	manual = CheckButton.new()
	manual.text = "Manual tower"
	manual.tooltip_text = "Runway queues wait for your clearance. Automatic mode releases controller holds."
	manual.toggled.connect(func(on: bool):
		if sim != null: sim.set_tower_control(on)
		status.text = "Manual tower: select the first queued flight and clear it." if on else "Automatic tower: normal airport operations."
	)
	tools.add_child(manual)
	var container := SubViewportContainer.new()
	container.size_flags_vertical = Control.SIZE_EXPAND_FILL
	container.stretch = true
	container.custom_minimum_size.y = 170
	container.gui_input.connect(_input_view)
	add_child(container)
	viewport = SubViewport.new()
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_2X
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	container.add_child(viewport)
	world = Node3D.new()
	viewport.add_child(world)
	camera = Camera3D.new()
	camera.keep_aspect = Camera3D.KEEP_WIDTH
	camera.near = 0.5
	camera.far = 45000
	world.add_child(camera)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-35, -30, 0)
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 5000
	world.add_child(sun)
	environment = Environment.new()
	var sky := Sky.new()
	var material := ProceduralSkyMaterial.new()
	material.sky_top_color = Color("3979b4")
	material.sky_horizon_color = Color("c8d8df")
	material.ground_horizon_color = Color("afbbb8")
	material.ground_bottom_color = Color("586653")
	sky.sky_material = material
	environment.sky = sky
	environment.background_mode = Environment.BG_SKY
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.tonemap_mode = Environment.TONE_MAPPER_ACES
	var env := WorldEnvironment.new()
	env.environment = environment
	world.add_child(env)
	flight_choice = OptionButton.new()
	flight_choice.custom_minimum_size.x = 240
	flight_choice.item_selected.connect(func(index: int):
		if sim != null and index < sim.flight_order.size(): flight_selected.emit(sim.flight_order[index].id))
	tools.add_child(flight_choice)
	var actions := HFlowContainer.new()
	add_child(actions)
	for spec in [["Clear landing / takeoff", "clear"], ["Hold at next node", "hold"], ["Resume taxi", "resume"]]:
		var button := Button.new()
		button.text = spec[0]
		button.pressed.connect(func(): _command(spec[1]))
		actions.add_child(button)
		command_buttons.append(button)
	runway_status = Label.new()
	runway_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	runway_status.add_theme_font_size_override("font_size", 12)
	add_child(runway_status)
	status = Label.new()
	status.text = "Right-drag: orbit · middle-drag / Shift+right-drag: pan · wheel: zoom · click aircraft: select"
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.add_theme_font_size_override("font_size", 12)
	add_child(status)
	radio = RichTextLabel.new()
	radio.custom_minimum_size.y = 36
	radio.add_theme_font_size_override("normal_font_size", 12)
	radio.text = "Tower log · simulation commands, not live ATC."
	add_child(radio)
	airport_sound=AirportSound.new()
	add_child(airport_sound)
	desk = TowerDesk.new()
	desk.view = self
	add_child(desk)
	var desk_button := Button.new()
	desk_button.text = "Tower desk"
	desk_button.pressed.connect(func(): desk.hide() if desk.visible else desk.open())
	tools.add_child(desk_button)
	_lighting()

func apply_weather() -> void:
	if sim != null:
		detail_scene.apply_weather()
		airport_sound.update_weather(TowerOperations.weather(sim).wet)

func report_command(result: Dictionary) -> void:
	status.text = str(result.get("message", "; ".join(result.get("warnings",[])) if not result.get("warnings",[]).is_empty() else "Command completed."))
	if result.get("ok",false):
		radio.text = "TOWER: %s\nPILOT: Roger, %s" % [status.text,status.text]
		desk.speak(status.text)
	else:
		sim.config["tower_rejections"] = int(sim.config.get("tower_rejections",0))+1

func show_route(legs: Array) -> void:
	if is_instance_valid(route_overlay): route_overlay.queue_free()
	route_overlay=Node3D.new(); world.add_child(route_overlay)
	for leg in legs:
		var points:=TowerOperations.route_points(sim,leg)
		for i in range(1,points.size()):
			var a:=Vector3(points[i-1].x,1,points[i-1].y)
			var b:=Vector3(points[i].x,1,points[i].y)
			var line:=_box(route_overlay,(a+b)*.5,Vector3(2,.1,a.distance_to(b)),Color("eac261"))
			line.material_override=_material(Color("eac261"),true)
			if a.distance_to(b)>.1: line.look_at(b+Vector3.UP*.001)

func _material(color: Color, glow := false) -> StandardMaterial3D:
	var key:=color.to_html()+str(glow)
	if material_cache.has(key): return material_cache[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.82
	if glow:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.emission_enabled = true
		m.emission = color
	material_cache[key]=m
	return m

func _box(parent: Node3D, at: Vector3, dimensions: Vector3, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = dimensions
	node.mesh = mesh
	node.material_override = _material(color)
	if dimensions.y<.6 and dimensions.x>5:
		var key:=color.to_html()
		if not pavement_cache.has(key):
			if asphalt==null:
				asphalt=NoiseTexture2D.new(); asphalt.width=256; asphalt.height=256; asphalt.seamless=true
				var noise:=FastNoiseLite.new(); noise.frequency=.3; asphalt.noise=noise
				var gradient:=Gradient.new(); gradient.set_color(0,Color(.65,.65,.65)); gradient.set_color(1,Color.WHITE); asphalt.color_ramp=gradient
			var material:=_material(color).duplicate() as StandardMaterial3D
			material.albedo_texture=asphalt; material.uv1_triplanar=true; material.uv1_scale=Vector3(.2,.2,.2)
			pavement_cache[key]=material
		node.material_override=pavement_cache[key]
	node.position = at
	parent.add_child(node)
	return node

func _line(a: Vector3, b: Vector3, width: float, color: Color, height := 0.15) -> void:
	if a.distance_to(b) < 0.01: return
	var node := _box(world, (a + b) * 0.5, Vector3(width, height, a.distance_to(b)), color)
	node.look_at_from_position(node.position, b + Vector3.UP * 0.001)

func _point(id: String, height := 0.0) -> Vector3:
	var p := sim.airside.node_position(id)
	return Vector3(p.x, height, p.y)

func _label(text: String, at: Vector3, parent: Node3D = null) -> Label3D:
	var label := Label3D.new()
	label.text = text
	label.position = at
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.font_size = 26
	label.pixel_size = 0.35
	label.no_depth_test = false
	label.outline_size = 4
	(world if parent == null else parent).add_child(label)
	return label

func _surface(points: Array, height: float, color: Color) -> void:
	var polygon := PackedVector2Array()
	for p in points: polygon.append(Vector2(p[0], p[1]))
	var indices := Geometry2D.triangulate_polygon(polygon)
	if indices.is_empty(): return
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in indices:
		st.set_normal(Vector3.UP)
		st.add_vertex(Vector3(polygon[i].x, height, polygon[i].y))
	if height > 1:
		for i in polygon.size():
			var a := Vector3(polygon[i].x, 0, polygon[i].y)
			var b := Vector3(polygon[(i+1)%polygon.size()].x, 0, polygon[(i+1)%polygon.size()].y)
			for v in [a, b, b+Vector3.UP*height, a, b+Vector3.UP*height, a+Vector3.UP*height]:
				st.set_normal((b-a).cross(Vector3.UP).normalized())
				st.add_vertex(v)
	var node := MeshInstance3D.new()
	node.mesh = st.commit()
	var material := _material(color)
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	if height < 1:
		if apron_material == null:
			apron_material = ShaderMaterial.new()
			apron_material.shader = load("res://assets/shaders/airport_concrete.gdshader")
		node.material_override = apron_material
	else:
		if building_material == null:
			building_material=ShaderMaterial.new()
			building_material.shader=load("res://assets/shaders/airport_building.gdshader")
		node.material_override = building_material
	world.add_child(node)


static func mapped_building_height(surface: Dictionary) -> float:
	if surface.kind == "apron": return .18
	var explicit_height := str(surface.get("height", "")).trim_suffix(" m").to_float()
	if explicit_height > 0: return clampf(explicit_height, 3, 300)
	var levels := str(surface.get("levels", "")).to_float()
	if levels > 0: return clampf(levels*3.5, 3, 300)
	return 12.0 if surface.kind == "terminal" else 8.0

func _build_world() -> void:
	for child in world.get_children():
		if child not in [camera, sun] and not child is WorldEnvironment: child.queue_free()
	models.clear()
	bridges.clear()
	arrival_starts.clear()
	bound_sim = sim
	desk.gate_choice.clear(); desk.runway_choice.clear(); desk.strips.order.clear()
	desk.via.clear(); desk.radar.route.clear(); desk.route_flight=""
	desk._stop_speech()
	tower_position = Vector3.ZERO
	if not sim.airside.enabled():
		status.text = "This scenario has no mapped airside network. Use the 2D Airfield tab."
		return
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for id in sim.airside.nodes:
		lo = lo.min(sim.airside.node_position(id))
		hi = hi.max(sim.airside.node_position(id))
	if sim.airside.config.has("terminal_zone"):
		var zone: Dictionary=sim.airside.config.terminal_zone
		lo=lo.min(Vector2(zone.x0-180,zone.y0-100))
		hi=hi.max(Vector2(zone.x1+130,zone.y1))
	center = Vector3((lo.x+hi.x)/2, 0, (lo.y+hi.y)/2)
	airport_center = center
	radius = maxf(hi.x-lo.x, hi.y-lo.y)
	distance = radius * 1.1
	var ground := MeshInstance3D.new()
	var ground_mesh := PlaneMesh.new()
	ground_mesh.size = Vector2(radius*30,radius*30)
	ground_mesh.subdivide_width = 8
	ground_mesh.subdivide_depth = 8
	ground.mesh = ground_mesh
	ground.position = center-Vector3.UP*.5
	ground.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ground.material_override = _material(Color("46513b"))
	world.add_child(ground)
	var landscape := ShaderMaterial.new()
	landscape.shader=load("res://assets/shaders/airport_landscape.gdshader")
	ground.material_override=landscape
	for edge in sim.airside.edges.values():
		var path: Array = edge.get("points",[])
		if path.size()<2:
			var from := sim.airside.node_position(edge.from)
			var to := sim.airside.node_position(edge.to)
			path = [[from.x,from.y],[to.x,to.y]]
		for i in range(1,path.size()):
			var a := Vector3(path[i-1][0],.05,path[i-1][1])
			var b := Vector3(path[i][0],.05,path[i][1])
			_line(a, b, 24, Color("393f40"))
			_line(a+Vector3.UP*.2, b+Vector3.UP*.2, 0.5, Color("bda647"))
	for surface in sim.airside.config.get("surfaces", []):
		_surface(surface.points, mapped_building_height(surface), Color("707574") if surface.kind == "apron" else Color("929c9e"))
	concourse_position = center
	var stands: Dictionary = sim.airside.config.get("stands", {})
	if not stands.is_empty(): concourse_position = _point(stands.values()[0])
	if sim.airside.config.get("geographic", false): camera_mode = "Concourse"
	if sim.airside.config.has("terminal_zone"):
		var z: Dictionary = sim.airside.config.terminal_zone
		_box(world,Vector3((z.x0+z.x1)/2,0,z.y0-90),Vector3(z.x1-z.x0,.1,190),Color("757771"))
		_box(world, Vector3((z.x0+z.x1)/2, 12, z.y0+75), Vector3(z.x1-z.x0, 24, 100), Color("b4c1c7"))
		_box(world, Vector3((z.x0+z.x1)/2, 14, z.y0+23), Vector3(z.x1-z.x0, 8, 2), Color("4b7584"))
	var lights: Array[Vector3] = []
	for r in sim.airside.runways():
		var a := _point(r.a, 0.4)
		var b := _point(r.b, 0.4)
		var direction := (b-a).normalized()
		var across := Vector3(-direction.z, 0, direction.x)
		_line(a,b,45,Color("343b40"))
		for side in [-1,1]:
			_line(a+across*side*20+Vector3.UP*.15,b+across*side*20+Vector3.UP*.15,.6,Color("d9dddb"))
			for meter in range(0,int(a.distance_to(b)),60): lights.append(a+direction*meter+across*side*23+Vector3.UP*.8)
		for meter in range(50,int(a.distance_to(b))-40,60): _line(a+direction*meter+Vector3.UP*.2,a+direction*(meter+28)+Vector3.UP*.2,1.0,Color("e3e5e2"))
		for end in [a,b]:
			for offset in [-15,-11,-7,7,11,15]: _line(end+across*offset-direction*10+Vector3.UP*.2,end+across*offset+direction*10+Vector3.UP*.2,2.0,Color.WHITE)
		_label(str(r.get("label",r.id)), a+Vector3.UP*18)
	_add_lights(lights, Color("fff0c2"))
	var taxi_lights: Array[Vector3] = []
	for edge in sim.airside.edges.values():
		var a := _point(edge.from, 0.8)
		var b := _point(edge.to, 0.8)
		var d := (b-a).normalized()
		var cross := Vector3(-d.z,0,d.x)*13
		for meter in range(0,int(a.distance_to(b)),70):
			taxi_lights.append(a+d*meter+cross)
			taxi_lights.append(a+d*meter-cross)
	_add_lights(taxi_lights,Color("3984ff"))
	for gate in sim.airside.config.get("stands", {}):
		if not sim.airport.gates.has(gate): continue
		var at := _point(sim.airside.config.stands[gate])
		_label(gate, at+Vector3.UP*12)
		var anchor := _terminal_anchor(at)
		var towards := Vector3(anchor.x-at.x,0,anchor.z-at.z).normalized()
		if towards.length_squared()<.1: towards=Vector3.FORWARD
		var across := Vector3(-towards.z,0,towards.x)
		_line(at-towards*30+Vector3.UP*.32,at+towards*8+Vector3.UP*.32,.35,Color("ddbd5c"),.04)
		_line(at-across*5+Vector3.UP*.33,at+across*5+Vector3.UP*.33,.4,Color("ddbd5c"),.04)
		# Illustrative stand clearance lines, not surveyed parking limits.
		for side in [-1,1]:
			var a: Vector3 = at+across*side*24-towards*26+Vector3.UP*.32
			var b: Vector3 = at+across*side*24+towards*14+Vector3.UP*.32
			_line(a,b,.25,Color("c7c6ba"),.04)
		if sim.airside.config.has("terminal_zone"):
			var z: Dictionary = sim.airside.config.terminal_zone
			_line(at+Vector3(24,4,12),Vector3(at.x+24,4,z.y0+23),5,Color("9faeaf"),7)
		var base := Vector3(anchor.x,4,anchor.z)
		var direction := (Vector3(at.x,4,at.z)-base).normalized()
		var home := base+direction*9
		var bridge := _box(world,home,Vector3(18,3,4),Color("b8c1c1"))
		bridge.rotation.y=atan2(-direction.z,direction.x)
		_box(world,base-Vector3.UP*2,Vector3(1,4,1),Color("697b80"))
		for offset in [-6,-2,2,6]:
			_box(bridge,Vector3(offset,.25,-2.05),Vector3(2.8,1.2,.08),Color("426f80"))
		_box(bridge,Vector3(-6,-2,0),Vector3(.5,2,2.5),Color("657980"))
		bridges[gate] = {"node":bridge,"home":bridge.position,"base":base,"angle":bridge.rotation.y}
	detail_scene.setup(self)
	static_batch_stats = AirportStaticScenery.batch(world, detail_scene.decorations)
	apply_weather()
	desk.weather_choice.select(TowerOperations.WEATHER.keys().find(str(sim.config.get("tower_weather","Clear"))))
	desk.level.select(int(sim.config.get("tower_difficulty",0)))
	desk.training_on=desk.level.selected==0
	manual.set_pressed_no_signal(sim.airport.runways.values().any(func(r): return r.manual_control))

func _add_lights(points: Array[Vector3], color: Color) -> void:
	if points.is_empty(): return
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	var mesh := SphereMesh.new()
	mesh.radius = 0.45
	mesh.height = 0.9
	mesh.radial_segments = 6
	mesh.rings = 3
	mesh.material = _material(color,true).duplicate()
	mesh.material.albedo_color = color if night else color*.18
	mesh.material.emission_enabled = night
	multi.mesh = mesh
	multi.instance_count = points.size()
	for i in points.size(): multi.set_instance_transform(i,Transform3D(Basis.IDENTITY,points[i]))
	var node := MultiMeshInstance3D.new()
	node.multimesh = multi
	node.set_meta("lamp_color",color)
	world.add_child(node)

func _lighting() -> void:
	sun.light_energy = 0.12 if night else 0.85
	environment.ambient_light_color = Color("879bad") if night else Color("cbd7e2")
	environment.ambient_light_energy = 0.35 if night else 0.3
	var sky := environment.sky.sky_material as ProceduralSkyMaterial
	sky.sky_top_color = Color("071322") if night else Color("3979b4")
	sky.sky_horizon_color = Color("23394c") if night else Color("c8d8df")
	for child in world.get_children():
		if child is MultiMeshInstance3D and child.has_meta("lamp_color"):
			var material: StandardMaterial3D=child.multimesh.mesh.material
			var color: Color=child.get_meta("lamp_color")
			material.albedo_color=color if night else color*.18
			material.emission_enabled=night
	if bound_sim!=null: detail_scene.apply_weather()

func _bounds(node: Node3D, root: Node3D) -> AABB:
	var bounds := AABB()
	if node is MeshInstance3D:
		bounds = (root.global_transform.affine_inverse()*node.global_transform) * node.get_aabb()
	for child in node.get_children():
		if child is Node3D: bounds = bounds.merge(_bounds(child,root))
	return bounds

func _aircraft(f: AirportFlight) -> Node3D:
	var type: String = sim.airport.aircraft[f.aircraft_id].aircraft_type_id
	var name := "b789" if type == "787" else "a321" if type == "A321" else "cs300" if type == "A220" else "b738"
	if not scenes.has(name): scenes[name] = load("res://assets/aircraft/%s-v1.gltf" % name)
	var body := Node3D.new()
	world.add_child(body)
	var plane: Node3D = scenes[name].instantiate()
	body.add_child(plane)
	var bounds := _bounds(plane,plane)
	var length := 63.0 if type == "787" else 44.5 if type == "A321" else 35.0 if type == "A220" else 39.5
	body.set_meta("length",length)
	var k := length/maxf(1,maxf(bounds.size.x,bounds.size.z))
	plane.scale *= k
	plane.position = -bounds.get_center()*k
	plane.position.y = -bounds.position.y*k+1.9
	if bounds.size.x>bounds.size.z: plane.rotation.y = PI/2
	var gear := Node3D.new()
	gear.name = "DisplayGear"
	body.add_child(gear)
	for at in [Vector3(0,0,-length*.3),Vector3(-length*.075,0,length*.08),Vector3(length*.075,0,length*.08)]:
		var bogie:=Node3D.new(); gear.add_child(bogie); bogie.position=at
		if at.z<0: bogie.name="NoseSteer"
		_box(bogie,Vector3(0,1.5,0),Vector3(.22,1.7,.22),Color("a6b0b5"))
		for side in [-1,1]:
			var wheel := MeshInstance3D.new()
			var tire := CylinderMesh.new()
			tire.top_radius=.65
			tire.bottom_radius=.65
			tire.height=.45
			tire.radial_segments=16
			wheel.mesh=tire
			wheel.material_override=_material(Color("171b20"))
			wheel.rotation.z=PI/2
			wheel.position=Vector3(side*.35,.65,0)
			bogie.add_child(wheel)
	detail_scene.rig(body,length)
	_label(f.flight_number,Vector3(0,17,0),body)
	return body

func _pose(f: AirportFlight) -> Vector3:
	for r: AirportRunway in sim.airport.runways.values():
		var op := r.active_operation
		if op.get("flight_id", "") != f.id: continue
		var t := clampf(float(sim.clock.tick-int(op.started_at))/maxf(1,int(op.end_tick)-int(op.started_at)),0,1)
		var a := _point(r.a)
		var b := _point(r.b)
		var direction := (b-a).normalized()
		if op.operation == "landing":
			var key := f.id+":"+str(op.started_at)
			if not arrival_starts.has(key):
				arrival_starts[key] = models[f.id].position if models.has(f.id) and models[f.id].has_meta("placed") and t<.1 else a-direction*450+Vector3.UP*35
			var start: Vector3 = arrival_starts[key]
			var touchdown := a.lerp(b,.18)
			if t<.35:
				return start.bezier_interpolate(start+direction*250,touchdown-direction*300,touchdown,t/.35)
			return touchdown.lerp(b,(t-.35)/.65)
		var p := a.lerp(b,t*t)
		p.y = maxf(0,(t-.7)/.3)*100
		return p
	var at := sim.aircraft_position(f)
	if not at.is_empty():
		if f.taxi_leg>=0 and f.leg_exit_tick>f.leg_enter_tick:
			var fraction:=clampf(float(sim.clock.tick-f.leg_enter_tick)/(f.leg_exit_tick-f.leg_enter_tick),0,1)
			if f.taxi_leg==0 or f.taxi_leg==f.taxi_route.size()-1:
				var eased:=smoothstep(0.0,1.0,fraction)
				var p:=sim.airside.position_on(f.taxi_route[f.taxi_leg],f.leg_enter_tick,f.leg_exit_tick,f.leg_enter_tick+int(eased*(f.leg_exit_tick-f.leg_enter_tick)))
				return Vector3(p.x,0,p.y)
		return Vector3(at.pos.x,0,at.pos.y)
	if f.status == "approaching":
		var r: Dictionary = sim.airside.runways()[0]
		var a := _point(r.a)
		var d := (_point(r.b)-a).normalized()
		var angle := float(sim.clock.tick-f.state_since)/600.0
		return a-d*1100+Vector3(cos(angle)*650,180,sin(angle)*650)
	if f.status == "landed" and sim.airport.runways.has(f.runway_id): return _point(sim.airport.runways[f.runway_id].b)
	var stand: String = sim.airside.config.get("stands",{}).get(f.assigned_gate_id,"")
	return _point(stand) if sim.airside.nodes.has(stand) else center

func _process(delta: float) -> void:
	if viewport == null: return
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS if is_visible_in_tree() else SubViewport.UPDATE_DISABLED
	if not is_visible_in_tree() or sim == null: return
	if sim != bound_sim: _build_world()
	if not sim.airside.enabled(): return
	for f: AirportFlight in sim.flight_order:
		if f.status == "scheduled": continue
		if f.status == "departed":
			if models.has(f.id):
				var departing: Node3D=models[f.id]
				if not departing.has_meta("depart_tick"): departing.set_meta("depart_tick",sim.clock.tick)
				if sim.clock.tick-int(departing.get_meta("depart_tick"))>150:
					departing.queue_free(); models.erase(f.id)
				elif not sim.clock.paused:
					departing.position+=(-departing.basis.z*65+Vector3.UP*8)*delta*sim.clock.speed
			continue
		var fresh := not models.has(f.id)
		if fresh: models[f.id] = _aircraft(f)
		var body: Node3D = models[f.id]
		body.visible = true
		var target := _pose(f)
		var motion := target-body.position
		if f.status in ["approaching","landed"] and body.position.y>1 and target.y<=.2 and not body.has_meta("touchdown"):
			body.set_meta("touchdown",true)
			detail_scene.touchdown(body.position)
			if f.id==selected_id: airport_sound.touch_down()
		body.set_meta("placed",true)
		var gear := body.get_node("DisplayGear") as Node3D
		var retract := f.status == "taxiing_out" and target.y>30
		gear.scale.y = lerpf(gear.scale.y,.02 if retract else 1.0,1-exp(-delta*2))
		gear.visible = gear.scale.y>.04
		if fresh: body.position = target
		else: body.position = body.position.lerp(target,1-exp(-delta*5))
		if Vector2(motion.x,motion.z).length()>.2:
			var heading:=atan2(-motion.x,-motion.z)
			var pushback:=sim.turnaround.task(f,Turnaround.PUSHBACK_OP)
			if pushback!=null and pushback.status==TurnaroundTask.RUNNING: heading+=PI
			body.set_meta("steering",clampf(angle_difference(body.rotation.y,heading),-.45,.45))
			body.rotation.y = lerp_angle(body.rotation.y,heading,1-exp(-delta*2))
		body.rotation.x=lerpf(body.rotation.x,clampf(atan2(motion.y,maxf(.1,Vector2(motion.x,motion.z).length())),-.09,.12) if target.y>2 else 0.0,1-exp(-delta*2))
		var flap_angle:=.3 if f.status in ["approaching","landed","taxiing_in","taxiing_out"] else 0.0
		for flap in body.get_meta("flaps",[]): flap.rotation.x=lerpf(flap.rotation.x,flap_angle,1-exp(-delta*2))
		for child in body.get_children():
			if child is Label3D:
				child.visible = (labels or f.id == selected_id) and not (camera_mode == "Follow" and f.id == selected_id)
				child.pixel_size = clampf(camera.global_position.distance_to(body.global_position)*.0008,.03,2.0)
				child.modulate = Color("ffda8c") if f.id == selected_id else Color.WHITE
	for gate in bridges:
		var record: Dictionary = bridges[gate]
		var occupant: String=sim.airport.gates[gate].occupied_by_flight_id
		var goal: Vector3=record.home
		var extension:=1.0
		var angle: float=record.angle
		if models.has(occupant) and sim.airport.flights[occupant].status in AirportSimulation.AT_GATE_STATES:
			var aircraft: Node3D=models[occupant]
			var base: Vector3=record.base
			var door:=aircraft.position+aircraft.basis*Vector3(-2,4,-float(aircraft.get_meta("length",40))*.28)
			goal=(base+door)*.5
			extension=clampf(base.distance_to(door)/18.0,.3,4.0)
			angle=atan2(-(door-base).z,(door-base).x)
		record.node.position=record.node.position.lerp(goal,1-exp(-delta))
		record.node.scale.x=lerpf(record.node.scale.x,extension,1-exp(-delta))
		record.node.rotation.y=lerp_angle(record.node.rotation.y,angle,1-exp(-delta))
	var target := center
	if camera_mode in ["Follow","Tower"] and models.has(selected_id) and models[selected_id].visible: target = models[selected_id].position
	var desired: Vector3
	if camera_mode == "Concourse": target = concourse_position
	match camera_mode:
		"Concourse": desired = concourse_position+Vector3(145,65,165)
		"Tower": desired = tower_position if tower_position != Vector3.ZERO else center+Vector3(radius*.12,85,radius*.18)
		"Follow": desired = target+Vector3(60,24,70)
		"Top": desired = center+Vector3(0,distance,.1)
		_: desired = center+Vector3(sin(yaw)*cos(elevation),sin(elevation),cos(yaw)*cos(elevation))*distance
	camera_target = target
	camera.near = clampf(desired.distance_to(target)/100.0,.5,30.0)
	camera.position = camera.position.lerp(desired,1-exp(-delta*4))
	if camera.position.distance_to(target)>.1: camera.look_at(target)
	for child in world.get_children():
		if child is Label3D:
			child.visible = labels
			child.pixel_size = clampf(camera.global_position.distance_to(child.global_position)*.0008,.03,2.0)
	detail_scene.update(delta)
	refresh += delta
	if refresh>.3:
		refresh=0
		skip_idle.disabled = sim.flight_order.any(func(f): return f.status != "scheduled")
		if flight_choice.item_count != sim.flight_order.size():
			flight_choice.clear()
			for f: AirportFlight in sim.flight_order: flight_choice.add_item(f.flight_number)
		for i in sim.flight_order.size():
			var f: AirportFlight = sim.flight_order[i]
			flight_choice.set_item_text(i,"%s · %s · %s" % [f.flight_number,f.assigned_gate_id,f.status.replace("_"," ")])
			if f.id == selected_id: flight_choice.select(i)
		var rows: Array[String] = []
		for r: AirportRunway in sim.airport.runways.values():
			var state := "OCCUPIED" if not r.active_operation.is_empty() else "SEPARATION" if sim.clock.tick<r.occupied_until else "AVAILABLE"
			var next: String = " · next "+sim.airport.flights[r.queue[0].flight_id].flight_number if not r.queue.is_empty() else ""
			rows.append("%s: %s · %d queued%s" % [r.label,state,r.queue.size(),next])
		runway_status.text = " | ".join(rows)

func _command(command: String) -> void:
	if sim == null: return
	report_command(sim.tower_command(selected_id,command))

func _input_view(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_RIGHT:
			dragging = event.pressed and not event.shift_pressed
			panning = event.pressed and event.shift_pressed
		if event.button_index == MOUSE_BUTTON_MIDDLE: panning = event.pressed
		if event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
			_free_camera()
			distance = clampf(distance*(.85 if event.button_index == MOUSE_BUTTON_WHEEL_UP else 1.18),35,18000)
		if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
			if desk.radar.edit_route:
				var nearest:=""
				var separation:=30.0
				for node in sim.airside.nodes:
					var location:=_point(node)
					if camera.is_position_behind(location): continue
					var pixels:=camera.unproject_position(location).distance_to(event.position)
					if pixels<separation: nearest=node; separation=pixels
				if not nearest.is_empty(): desk.radar.node_selected.emit(nearest)
				return
			var best := 35.0
			var id := ""
			for key in models:
				var body: Node3D = models[key]
				if not body.visible or camera.is_position_behind(body.position): continue
				var gap := camera.unproject_position(body.position).distance_to(event.position)
				if gap<best: best=gap; id=key
			if not id.is_empty(): flight_selected.emit(id)
	if event is InputEventMouseMotion and panning:
		_free_camera()
		var right := camera.global_basis.x
		var forward := Vector3(-right.z,0,right.x)
		center += (-right*event.relative.x-forward*event.relative.y)*distance*.0015
	if event is InputEventMouseMotion and dragging:
		_free_camera()
		yaw -= event.relative.x*.006
		elevation = clampf(elevation+event.relative.y*.004,.1,1.5)
	if event is InputEventScreenDrag:
		_free_camera()
		yaw -= event.relative.x*.006
		elevation = clampf(elevation+event.relative.y*.004,.1,1.5)

func _free_camera() -> void:
	if camera_mode == "Orbit": return
	center = camera_target
	var offset := camera.position-center
	distance = maxf(35,offset.length())
	yaw = atan2(offset.x,offset.z)
	elevation = clampf(asin(clampf(offset.y/distance,-1,1)),.1,1.5)
	camera_mode = "Orbit"

func _terminal_anchor(at: Vector3) -> Vector3:
	var nearest := at+Vector3(21,0,10)
	var best := INF
	for surface in sim.airside.config.get("surfaces", []):
		if surface.kind != "terminal": continue
		var points: Array = surface.points
		for i in points.size():
			var a := Vector2(points[i][0],points[i][1])
			var b := Vector2(points[(i+1)%points.size()][0],points[(i+1)%points.size()][1])
			var hit := Geometry2D.get_closest_point_to_segment(Vector2(at.x,at.z),a,b)
			var gap := hit.distance_to(Vector2(at.x,at.z))
			if gap<best:
				best=gap
				nearest=Vector3(hit.x,0,hit.y)
	return nearest if best<100 else at+Vector3(21,0,10)
