class_name TowerFlightStrips
extends ItemList
## Reorders the controller's workspace only; runway FIFO remains authoritative.
var order: Array = []
func _get_drag_data(at: Vector2) -> Variant:
	var index:=get_item_at_position(at,true)
	if index<0: return null
	var label:=Label.new(); label.text=get_item_text(index); set_drag_preview(label)
	return {"source":get_instance_id(),"flight":get_item_metadata(index)}
func _can_drop_data(_at: Vector2,data: Variant) -> bool:
	return data is Dictionary and data.get("source")==get_instance_id()
func _drop_data(at: Vector2,data: Variant) -> void:
	var target:=get_item_at_position(at,true)
	if target<0: target=item_count-1
	order.clear()
	for i in item_count: order.append(get_item_metadata(i))
	order.erase(data.flight); order.insert(target,data.flight)
