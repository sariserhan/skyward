extends SceneTree
## Dev helper: renders the main screen through its phases and saves PNGs.
## Usage: xvfb-run -s "-screen 0 1280x800x24" godot --path game --script tests/screenshot.gd -- /abs/out/dir

var main: Control
var frame := 0
var out_dir := "/tmp"


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		out_dir = args[0]
	main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)


func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		12:
			_save("01_planning")
		14:
			var sim: Simulation = main.runner.sim
			main._on_start()
			for _i in 2600:
				sim.step()
			main._set_speed(4.0)
			# Select the passenger stuck furthest back in the aisle for the info panel.
			if sim.active.size() > 0:
				main.view.selected_id = sim.active[sim.active.size() / 2].id
				main._on_passenger_clicked(sim.active[sim.active.size() / 2])
			main.debug_panel.visible = true
		16:
			_save("02_boarding")
		18:
			main.debug_panel.visible = false
			main.runner.run_to_completion()
		20:
			_save("03_results")
		22:
			main.results_panel.visible = false
			main._open_editor()
		24:
			_save("04_editor")
			return true
	return false


func _save(name: String) -> void:
	var img := root.get_viewport().get_texture().get_image()
	var path := out_dir.path_join(name + ".png")
	img.save_png(path)
	print("saved ", path)
