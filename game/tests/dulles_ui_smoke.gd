extends SceneTree
var frame := 0
var main
var failures := 0

func _initialize() -> void:
	change_scene_to_file("res://scenes/menu.tscn")

func check(ok: bool, message: String) -> void:
	if not ok:
		failures += 1
		push_error(message)

func find_button(node: Node, text: String) -> Button:
	if node is Button and node.text == text: return node
	for child in node.get_children():
		var found := find_button(child, text)
		if found != null: return found
	return null

func _process(_delta: float) -> bool:
	frame += 1
	if frame == 8:
		root.get_texture().get_image().save_png("/tmp/dulles-menu.png")
		var button := find_button(current_scene, "WASHINGTON DULLES · IAD")
		check(button != null, "Dulles is accessible from home")
		if button == null: quit(1); return false
		button.pressed.emit()
	if frame == 12:
		root.get_texture().get_image().save_png("/tmp/dulles-brief.png")
		find_button(current_scene, "PLAY DULLES").pressed.emit()
	if frame == 20:
		main = current_scene
		check(main.career.scenario_path == AirportLaunch.DULLES, "menu launches Dulles")
		check(main.sim.airport.runways.size() == 4, "four runways in play")
		main.sim.clock.paused = true
		main._refresh()
	if frame == 24:
		root.get_texture().get_image().save_png("/tmp/dulles-airfield.png")
		find_button(main, "Map").pressed.emit()
		check(not main.operations_tabs.visible, "full map hides operation panels")
		var map := find_map(main)
		check(map != null, "airport map exists")
		if map != null:
			map.zoom = 2.0
			map.queue_redraw()
	if frame == 28:
		root.get_texture().get_image().save_png("/tmp/dulles-zoom.png")
		find_button(main, "Map").pressed.emit()
		check(main.operations_tabs.visible, "operation panels restore")
		AirportLaunch.career = null
		main.queue_free()
		main = null
		print("Dulles UI: %d failures" % failures)
		quit(failures)
	return false

func find_map(node: Node) -> AirportMap:
	if node is AirportMap: return node
	for child in node.get_children():
		var found := find_map(child)
		if found != null: return found
	return null
