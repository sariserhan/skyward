class_name AirportAircraftMaterials
extends RefCounted
## Preserve imported textures; share finish variants instead of cloning per aircraft.
static var finishes: Dictionary = {}
static func apply(node: Node) -> void:
	if node is MeshInstance3D and node.mesh != null:
		for i in node.mesh.get_surface_count():
			var original := node.get_active_material(i) as StandardMaterial3D
			if original == null: continue
			var key := original.get_instance_id()
			if not finishes.has(key):
				var finish := original.duplicate() as StandardMaterial3D
				var name := original.resource_name.to_lower()
				finish.texture_filter=BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
				if "chrome" in name:
					finish.roughness=.24; finish.metallic=.7
				elif "white" in name:
					finish.roughness=.42; finish.metallic=.05
				finishes[key]=finish
			node.set_surface_override_material(i,finishes[key])
	for child in node.get_children(): apply(child)
