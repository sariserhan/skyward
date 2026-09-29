class_name AirportGroundEquipment
extends RefCounted
## Shared, textured meshes converted from the retained FlightGear AC3D sources.
const ASSET := "res://assets/ground-services/"
static var meshes: Dictionary = {}

static func model(parent: Node3D, asset: String, length: float, along_x := false) -> MeshInstance3D:
	if not meshes.has(asset):
		var loaded: Mesh = load(ASSET+asset+".obj")
		meshes[asset]=loaded
		for i in loaded.get_surface_count():
			var material := loaded.surface_get_material(i) as StandardMaterial3D
			if material != null:
				material.roughness=.62
				material.texture_filter=BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	var node := MeshInstance3D.new()
	node.name=asset.replace("-","_")
	node.mesh=meshes[asset]
	var bounds := node.mesh.get_aabb()
	var factor := length/(bounds.size.x if along_x else bounds.size.z)
	node.scale=Vector3.ONE*factor
	if along_x: node.rotation.y=PI/2
	var center := Vector3(bounds.get_center().x,bounds.position.y,bounds.get_center().z)
	node.position=-(node.basis*center)+Vector3.UP*.025
	node.visibility_range_end=1600
	parent.add_child(node)
	return node

static func create(kind: String) -> Node3D:
	var root := Node3D.new()
	if "baggage" in kind:
		model(root,"luggage-truck-HD",3.2)
		# The carts include their own drawbars, axle assemblies and open metal rails.
		for z in [3.05,5.95]:
			var cart := model(root,"luggage-cart-HD",2.9)
			cart.rotation.y=PI
			cart.position.z=z
		root.set_meta("equipment","baggage_train")
	elif "fuel" in kind:
		model(root,"fuel-truck",9.2,true)
		root.set_meta("equipment","fuel_tanker")
	elif "pushback" in kind:
		model(root,"DFZ30",4.5,true)
		root.set_meta("equipment","tow_tractor")
	elif "belt" in kind:
		model(root,"belt_loader",7.5)
		root.set_meta("equipment","belt_loader")
	else:
		root.free()
		return null
	return root
