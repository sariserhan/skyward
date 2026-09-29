class_name AirportSceneDetail
extends RefCounted
## Bounded scenery and animation helpers. Ground services reflect actual task state.
var view: Airport3D
var decorations: Array[Node3D] = []
var vehicles: Dictionary = {}
var rain: CPUParticles3D
var puddle_materials: Array[StandardMaterial3D] = []
var tick := 0.0
var last_tick := -1
var strobes: Array[Node3D]=[]

func setup(owner_view: Airport3D) -> void:
	view=owner_view
	decorations.clear(); vehicles.clear(); puddle_materials.clear(); strobes.clear(); rain=null
	var sim:=view.sim
	if not sim.airside.enabled(): return
	_mapped_terminals()
	# Match terminal detail to the scenario footprint, retaining mapped Dulles buildings.
	if sim.airside.config.has("terminal_zone"):
		var z: Dictionary=sim.airside.config.terminal_zone
		var width:=float(z.x1-z.x0)
		for x in range(int(z.x0)+20,int(z.x1)-10,60):
			for face in [z.y0+24,z.y0+126]:
				decorations.append(view._box(view.world,Vector3(x,13,face),Vector3(47,12,1.5),Color("426f80")))
			decorations.append(view._box(view.world,Vector3(x,25,z.y0+75),Vector3(20,2,18),Color("82969c")))
		var at:=Vector3(z.x1+90,0,z.y0-50)
		view._box(view.world,at+Vector3.UP*23,Vector3(10,46,10),Color("a5ada9"))
		view._box(view.world,at+Vector3.UP*48,Vector3(26,8,26),Color("314d59"))
		view._box(view.world,at+Vector3.UP*53,Vector3(30,2,30),Color("aeb8bd"))
		view._label("TOWER",at+Vector3.UP*65)
		view.tower_position=at+Vector3.UP*51
		# A hangar beside the terminal, with a contrasting sliding door.
		view._box(view.world,Vector3(z.x0-100,16,z.y0+70),Vector3(120,32,100),Color("6a7d86"))
		view._box(view.world,Vector3(z.x0-100,13,z.y0+19),Vector3(95,25,1),Color("304552"))
	for r in sim.airside.runways():
		var a:=view._point(r.a,.61); var b:=view._point(r.b,.61); var d:=(b-a).normalized(); var cross:=Vector3(-d.z,0,d.x)
		var green: Array[Vector3]=[]; var red: Array[Vector3]=[]
		for x in range(-20,21,5):
			green.append(a+cross*x+Vector3.UP*.3); red.append(b+cross*x+Vector3.UP*.3)
		view._add_lights(green,Color("6de4a5")); view._add_lights(red,Color("ff6458"))
		for i in 5:
			var flash:=view._box(view.world,a-d*(80+i*60)+Vector3.UP,Vector3(1.5,.3,1.5),Color.WHITE)
			flash.material_override=view._material(Color.WHITE,true); flash.set_meta("phase",i*.12); strobes.append(flash)
		for side in [-1,1]:
			# Rubber deposits concentrate around the touchdown zone.
			view._line(a+d*180+cross*side*3,a+d*440+cross*side*3,2.2,Color("242b30"),.03)
	for id in sim.airside.nodes:
		if sim.airside.nodes[id].get("kind","")!="hold": continue
		var at:=view._point(id,.4)
		for gap in [-1.5,1.5]: view._line(at+Vector3(-12,0,gap),at+Vector3(12,0,gap),.45,Color("eac44f"),.05)
	for child in view.world.get_children():
		if child is MeshInstance3D and child.mesh is BoxMesh and child.mesh.size.y<.6:
			puddle_materials.append(child.material_override)
	rain=CPUParticles3D.new(); rain.amount=500; rain.lifetime=1.2; rain.emission_shape=CPUParticles3D.EMISSION_SHAPE_BOX; rain.emission_box_extents=Vector3(45,20,45)
	rain.direction=Vector3(.2,-1,.1); rain.spread=4; rain.initial_velocity_min=28; rain.initial_velocity_max=38; rain.gravity=Vector3(0,-9,0)
	var drop:=BoxMesh.new(); drop.size=Vector3(.025,1.2,.025); drop.material=view._material(Color("9eb8ca")); rain.mesh=drop; rain.emitting=false; view.world.add_child(rain)

func apply_weather() -> void:
	var w:=TowerOperations.weather(view.sim)
	var sky_material:=view.environment.sky.sky_material as ProceduralSkyMaterial
	sky_material.sky_top_color=Color("132332") if view.night else Color("586e80") if w.wet else Color("3979b4")
	sky_material.sky_horizon_color=Color("263544") if view.night else Color("9aa6ab") if w.wet else Color("c8d8df")
	view.sun.light_energy=(.12 if view.night else .85)*(.65 if w.wet else 1.0)
	view.environment.fog_enabled=float(w.visibility)<10
	view.environment.fog_light_color=Color("293d4b") if view.night else Color("a1adb2")
	view.environment.fog_density=.00008 if float(w.visibility)>2 else .00035
	if view.apron_material != null: view.apron_material.set_shader_parameter("wetness", 1.0 if w.wet else 0.0)
	for material in puddle_materials: material.roughness=.32 if w.wet else .82
	if rain!=null: rain.emitting=w.wet

func _vehicle(color: Color,kind: String) -> Node3D:
	var root:=Node3D.new(); view.world.add_child(root)
	view._box(root,Vector3(0,1,0),Vector3(2.2,1.4,4.3),color)
	view._box(root,Vector3(0,2,-1),Vector3(2,1.2,1.5),Color("c5d3d5"))
	view._box(root,Vector3(0,2,-1.78),Vector3(1.7,.6,.06),Color("24414e"))
	if "fuel" in kind: view._box(root,Vector3(0,2.3,1),Vector3(1.8,1.3,2.5),Color("c5c9c1"))
	if "cater" in kind: view._box(root,Vector3(0,3,1),Vector3(2.4,3,3),Color("e5e2d6"))
	if "baggage" in kind:
		for z in [5.0,8.0]:
			view._box(root,Vector3(0,.6,z),Vector3(1.8,.4,2.4),Color("889aa0"))
			view._box(root,Vector3(0,1.3,z),Vector3(1.5,1.1,2),Color("b4b9ac"))
	for x in [-1.1,1.1]:
		for z in [-1.35,1.35]:
			var wheel:=MeshInstance3D.new(); var mesh:=CylinderMesh.new(); mesh.top_radius=.42; mesh.bottom_radius=.42; mesh.height=.28; mesh.radial_segments=12; wheel.mesh=mesh; wheel.material_override=view._material(Color("182128")); wheel.rotation.z=PI/2; wheel.position=Vector3(x,.45,z); root.add_child(wheel)
	return root

func update(delta: float) -> void:
	if view.sim==null: return
	var sim:=view.sim
	var moving:=not sim.clock.paused
	last_tick=sim.clock.tick
	if moving: tick+=delta
	for flash in strobes: flash.visible=view.night and fmod(tick+float(flash.get_meta("phase")),1.4)<.1
	if rain!=null:
		rain.position=view.camera.position+Vector3(0,12,0)
		rain.emitting=TowerOperations.weather(sim).wet and view.quality<2
	for node in decorations: node.visible=view.quality<2 and view.camera.position.distance_to(node.position)<5000
	var active: Dictionary={}
	for f: AirportFlight in sim.flight_order:
		if not view.models.has(f.id): continue
		var plane: Node3D=view.models[f.id]
		var lod:=plane.get_node_or_null("DistanceModel")
		if lod!=null:
			var far:=view.camera.position.distance_to(plane.position)>(900 if view.quality==2 else 1800 if view.quality==1 else 3500)
			lod.visible=far
			var detailed: Node3D=plane.get_meta("detailed_model")
			detailed.visible=not far
		for id in f.task_ids:
			var task: TurnaroundTask=sim.airport.turnaround_tasks[id]
			if task.status!=TurnaroundTask.RUNNING or not task.kind in ["timed","baggage_load","baggage_unload","pushback"]: continue
			active[id]=true
			if not vehicles.has(id): vehicles[id]=_vehicle(Color("d8a348") if task.kind=="pushback" else Color("5b9a9e"),task.type)
			var vehicle: Node3D=vehicles[id]
			vehicle.visible=plane.visible and (view.quality<2 or f.id==view.selected_id)
			var duration:=maxf(1,task.duration_ticks)
			var progress:=clampf(float(sim.clock.tick-task.start_tick)/duration,0,1)
			var travel:=clampf(progress/.12,0,1)*(1-clampf((progress-.88)/.12,0,1))
			var offset:=Vector3(10+posmod(id.hash(),3)*4,0,5+(1-travel)*35)
			if task.kind=="pushback": offset=Vector3(0,0,-15)
			vehicle.position=plane.position+plane.basis*offset; vehicle.position.y=0; vehicle.rotation.y=plane.rotation.y
		var beacon:=plane.get_node_or_null("Beacon")
		if beacon!=null: beacon.visible=fmod(tick,1.2)<.15 and not f.status in AirportSimulation.AT_GATE_STATES
		var previous: Vector3=plane.get_meta("last_ground_position",plane.position)
		var travel:=plane.position-previous
		plane.set_meta("last_ground_position",plane.position)
		var roll:=travel.length()/.65 if plane.position.y<3 else 0.0
		if travel.dot(plane.basis.z)>0: roll=-roll
		var gear:=plane.get_node_or_null("DisplayGear")
		if gear!=null:
			var nose:=gear.get_node_or_null("NoseSteer")
			if nose!=null: nose.rotation.y=lerpf(nose.rotation.y,0.0 if f.status in AirportSimulation.AT_GATE_STATES else float(plane.get_meta("steering",0.0)),1-exp(-delta*4))
			for wheel in gear.find_children("*","MeshInstance3D",true,false):
				if wheel is MeshInstance3D and wheel.mesh is CylinderMesh: wheel.rotate_object_local(Vector3.UP,roll)
		for fan in plane.get_meta("fans",[]):
			if moving and not f.status in AirportSimulation.AT_GATE_STATES: fan.rotate_object_local(fan.get_meta("axis",Vector3.BACK),delta*25)
	for id in vehicles.keys():
		if not active.has(id): vehicles[id].queue_free(); vehicles.erase(id)

func rig(body: Node3D,length: float) -> void:
	body.set_meta("detailed_model",body.get_child(0))
	var low:=Node3D.new(); low.name="DistanceModel"; body.add_child(low); low.visible=false
	var fuselage:=MeshInstance3D.new(); var hull:=CylinderMesh.new(); hull.height=length; hull.top_radius=.35; hull.bottom_radius=1.5; hull.radial_segments=8; fuselage.mesh=hull; fuselage.rotation.x=PI/2; fuselage.position.y=3; fuselage.material_override=view._material(Color("c5d3d8")); low.add_child(fuselage)
	view._box(low,Vector3(0,3,0),Vector3(length*.85,.25,3),Color("bdcbd1"))
	view._box(low,Vector3(0,5,length*.4),Vector3(.3,5,4),Color("82b7bf"))
	var flaps: Array[Node3D]=[]
	for side in [-1,1]:
		var flap:=view._box(body,Vector3(side*length*.2,2.0,length*.08),Vector3(length*.15,.15,1.4),Color("adb5b9"))
		flaps.append(flap)
	body.set_meta("flaps",flaps)
	var fans: Array[Node3D]=[]
	for node in body.find_children("*","MeshInstance3D",true,false):
		if str(node.name).to_lower().begins_with("fan"):
			var bounds: AABB=node.get_aabb()
			var pivot:=Node3D.new(); node.get_parent().add_child(pivot)
			pivot.transform=node.transform*Transform3D(Basis.IDENTITY,bounds.get_center())
			node.reparent(pivot,false); node.transform=Transform3D(Basis.IDENTITY,-bounds.get_center())
			var axis:=Vector3.RIGHT if bounds.size.x<=bounds.size.y and bounds.size.x<=bounds.size.z else Vector3.UP if bounds.size.y<=bounds.size.z else Vector3.BACK
			pivot.set_meta("axis",axis); fans.append(pivot)
	body.set_meta("fans",fans)
	var lights:=[[Vector3(-length*.42,2,2),Color.RED],[Vector3(length*.42,2,2),Color("5ed68e")],[Vector3(0,5,1),Color.RED]]
	for i in lights.size():
		var light:=MeshInstance3D.new(); var ball:=SphereMesh.new(); ball.radius=.22; ball.height=.44; ball.radial_segments=8; ball.rings=4; light.mesh=ball; light.material_override=view._material(lights[i][1],true); light.position=lights[i][0]
		if i==2: light.name="Beacon"
		body.add_child(light)

func touchdown(at: Vector3) -> void:
	if view.quality==2: return
	var smoke:=CPUParticles3D.new(); smoke.amount=24; smoke.lifetime=1.6; smoke.one_shot=true; smoke.explosiveness=.8; smoke.direction=Vector3.UP; smoke.spread=75; smoke.initial_velocity_min=1; smoke.initial_velocity_max=3; smoke.gravity=Vector3(0,.3,0)
	var mesh:=SphereMesh.new(); mesh.radius=.5; mesh.height=1; mesh.radial_segments=8; mesh.rings=4
	var material:=StandardMaterial3D.new(); material.transparency=BaseMaterial3D.TRANSPARENCY_ALPHA; material.albedo_color=Color(.8,.84,.85,.25); mesh.material=material; smoke.mesh=mesh; smoke.position=Vector3(at.x,.8,at.z)
	view.world.add_child(smoke); smoke.finished.connect(smoke.queue_free); smoke.emitting=true

## Facade treatment follows the source polygon; it is illustrative, not surveyed architecture.
func _mapped_terminals() -> void:
	for surface in view.sim.airside.config.get("surfaces", []):
		if surface.kind != "terminal": continue
		var height := Airport3D.mapped_building_height(surface)
		var points: Array = surface.points
		for i in points.size():
			var p: Array = points[i]
			var q: Array = points[(i+1)%points.size()]
			var a := Vector3(p[0], height*.6, p[1])
			var b := Vector3(q[0], height*.6, q[1])
			var length := a.distance_to(b)
			if length < 2: continue
			# Broad glazing and roof coping track every concourse bend.
			view._line(a,b,.5,Color("365765"),height*.35)
			view._line(Vector3(a.x,height+.2,a.z),Vector3(b.x,height+.2,b.z),.8,Color("d4d8d4"),.4)
			for bay in range(1,mini(60,int(length/6))):
				var at := a.lerp(b,float(bay)/float(mini(60,int(length/6))))
				decorations.append(view._box(view.world,at,Vector3(.45,height*.4,.45),Color("c0c8c9")))
