class_name AirportClearance
extends RefCounted
## Conservative swept-disc clearance against mapped building footprints.
var buildings: Array = []
func setup(config: Dictionary) -> void:
	buildings.clear()
	for surface in config.get("surfaces",[]):
		if surface.kind=="apron": continue
		var polygon:=PackedVector2Array()
		for p in surface.points: polygon.append(Vector2(p[0],p[1]))
		if polygon.size()<3: continue
		var bounds:=Rect2(polygon[0],Vector2.ZERO)
		for p in polygon: bounds=bounds.expand(p)
		buildings.append({"polygon":polygon,"bounds":bounds,"height":Airport3D.mapped_building_height(surface)})
	if config.has("terminal_zone"):
		var z: Dictionary=config.terminal_zone
		var p:=PackedVector2Array([Vector2(z.x0,z.y0+25),Vector2(z.x1,z.y0+25),Vector2(z.x1,z.y0+125),Vector2(z.x0,z.y0+125)])
		buildings.append({"polygon":p,"bounds":Rect2(p[0],p[2]-p[0]),"height":24.0})
func clear(at: Vector3, radius: float) -> bool:
	var p:=Vector2(at.x,at.z)
	for building in buildings:
		if at.y>float(building.height)+3 or not building.bounds.grow(radius+.1).has_point(p): continue
		var polygon: PackedVector2Array=building.polygon
		if Geometry2D.is_point_in_polygon(p,polygon): return false
		for i in polygon.size():
			if p.distance_to(Geometry2D.get_closest_point_to_segment(p,polygon[i],polygon[(i+1)%polygon.size()]))<radius: return false
	return true
func safe_position(at: Vector3, radius: float) -> Dictionary:
	if clear(at,radius): return {"ok":true,"position":at}
	# Used for initial placement/parking only, never to teleport across a building.
	for distance in range(4,125,4):
		for step in 24:
			var angle:=TAU*step/24.0
			var candidate:=at+Vector3(cos(angle),0,sin(angle))*distance
			if clear(candidate,radius): return {"ok":true,"position":candidate}
	return {"ok":false,"position":at}
func sweep(start: Vector3, finish: Vector3, radius: float) -> Vector3:
	var steps:=maxi(1,ceili(start.distance_to(finish)/2.0))
	var safe:=start
	for i in range(1,steps+1):
		var point:=start.lerp(finish,float(i)/steps)
		if not clear(point,radius): return safe
		safe=point
	return safe
