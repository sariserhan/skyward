class_name AirportStaticScenery
extends RefCounted
## Merge immutable boxes by material and 400 m cell. Preserve local culling,
## animated bridges, strobes and detail nodes with independent visibility.
static func batch(world: Node3D, excluded: Array[Node3D]) -> Dictionary:
	var groups: Dictionary = {}
	var sources := 0
	for child in world.get_children():
		if not child is MeshInstance3D or not child.mesh is BoxMesh: continue
		if child.is_queued_for_deletion() or child.get_child_count()>0 or child.has_meta("phase") or child in excluded: continue
		var material: Material = child.material_override
		if material == null: continue
		var cell := Vector2i(floori(child.position.x/400),floori(child.position.z/400))
		var key := str(material.get_instance_id())+":"+str(cell)
		if not groups.has(key): groups[key]={"nodes":[],"material":material}
		groups[key].nodes.append(child)
	var batches := 0
	for group in groups.values():
		if group.nodes.size()<2: continue
		var builder := SurfaceTool.new()
		builder.begin(Mesh.PRIMITIVE_TRIANGLES)
		for node: MeshInstance3D in group.nodes:
			builder.append_from(node.mesh,0,node.transform)
			node.hide()
			node.queue_free()
			sources+=1
		var mesh := MeshInstance3D.new()
		mesh.name="StaticSceneryBatch"
		mesh.mesh=builder.commit()
		mesh.material_override=group.material
		world.add_child(mesh)
		batches+=1
	return {"source_meshes":sources,"batches":batches}
