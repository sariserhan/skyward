class_name TowerRadar
extends Control
signal aircraft_selected(id: String)
signal node_selected(id: String)
var view: Airport3D
var edit_route := false
var route: Array = []
var sweep := 0.0
func _ready() -> void:
	custom_minimum_size = Vector2(300,190)
	mouse_filter = Control.MOUSE_FILTER_STOP
func project(p: Vector2) -> Vector2:
	return size*.5+(p-Vector2(view.center.x,view.center.z))*minf(size.x,size.y)/(view.radius*1.3)
func _process(delta: float) -> void:
	if not is_visible_in_tree(): return
	sweep=fmod(sweep+delta*.7,TAU)
	queue_redraw()
func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO,size),Color("091e25"))
	if view==null or view.sim==null or not view.sim.airside.enabled(): return
	for ring in [1,2,3]: draw_arc(size*.5,minf(size.x,size.y)*ring*.15,0,TAU,64,Color("284849"))
	draw_line(size*.5,size*.5+Vector2(cos(sweep),sin(sweep))*minf(size.x,size.y)*.45,Color("315c53"))
	for edge in view.sim.airside.edges.values():
		draw_line(project(view.sim.airside.node_position(edge.from)),project(view.sim.airside.node_position(edge.to)),Color("3c5861"),1)
	for r in view.sim.airside.runways(): draw_line(project(view.sim.airside.node_position(r.a)),project(view.sim.airside.node_position(r.b)),Color("e5dfb4"),3)
	for leg in route:
		var points:=TowerOperations.route_points(view.sim,leg)
		for i in range(1,points.size()): draw_line(project(points[i-1]),project(points[i]),Color("fbd477"),3)
	if edit_route:
		for id in view.sim.airside.nodes: draw_circle(project(view.sim.airside.node_position(id)),3,Color("fabd68"))
	for id in view.models:
		var body: Node3D=view.models[id]
		if not body.visible: continue
		var p:=project(Vector2(body.position.x,body.position.z))
		if not Rect2(Vector2.ZERO,size).has_point(p): continue
		var direction: Vector3=-body.basis.z
		draw_line(p,project(Vector2(body.position.x+direction.x*90,body.position.z+direction.z*90)),Color("8ce4d2"),1)
		draw_circle(p,4,Color("ffd77b") if id==view.selected_id else Color("8ce4d2"))
		draw_string(ThemeDB.fallback_font,p+Vector2(5,-5),view.sim.airport.flights[id].flight_number,HORIZONTAL_ALIGNMENT_LEFT,-1,11,Color.WHITE)
func _gui_input(event: InputEvent) -> void:
	if not event is InputEventMouseButton or not event.pressed or event.button_index!=MOUSE_BUTTON_LEFT or view==null: return
	var best:=15.0
	var found:=""
	if edit_route:
		for id in view.sim.airside.nodes:
			var d:=project(view.sim.airside.node_position(id)).distance_to(event.position)
			if d<best: best=d; found=id
		if not found.is_empty(): node_selected.emit(found)
	else:
		for id in view.models:
			var body: Node3D=view.models[id]
			if not body.visible: continue
			var d:=project(Vector2(body.position.x,body.position.z)).distance_to(event.position)
			if d<best: best=d; found=id
		if not found.is_empty(): aircraft_selected.emit(found)
