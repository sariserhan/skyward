class_name AirportEntity
extends RefCounted
## Primitive domain fields only. No Nodes or rendering dependencies.

func to_dict() -> Dictionary:
	var result := {}
	for property in get_property_list():
		if int(property.usage) & PROPERTY_USAGE_SCRIPT_VARIABLE:
			result[property.name] = get(property.name)
	return result.duplicate(true)

func restore(data: Dictionary) -> void:
	for property in get_property_list():
		if int(property.usage) & PROPERTY_USAGE_SCRIPT_VARIABLE and data.has(property.name):
			var value = data[property.name]
			if int(property.type) == TYPE_INT:
				value = int(value)
			set(property.name, value)
