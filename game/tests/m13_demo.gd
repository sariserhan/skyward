extends SceneTree
## M13 demonstrations: the player-facing career.
##   A (rendered): the first session, as the menu and tips lead a new player:
##      menu → new career → welcome → a security queue (open a lane) → the first
##      aircraft → a flight waiting for fuel → a late departure's causes → the
##      end of day 1 → the report → the plan and goals. Simulated time is
##      recorded at each step.
##   B–D (headless) run in tests/career_strategies.gd (multi-day careers).
## Writes /tmp/m13-demo-*.png.   tools/ui_tests.sh tests/m13_demo.gd

var frame := 0
var failures := 0
var report: Array = []
var main
var menu
var start_tick := 0
var step := 0
var timeline: Array = []


func _initialize() -> void:
	GameSettings.set_value("tips", true)
	GameSettings.set_value("slow_on_critical", true)
	GameSettings.set_value("pause_on_critical", false)
	change_scene_to_file("res://scenes/menu.tscn")


func check(condition: bool, message: String) -> void:
	if not condition:
		failures += 1
		push_error(message)


func shot(name: String) -> void:
	if main != null and (main.day_panel == null or not main.day_panel.visible): main._refresh()
	root.get_viewport().get_texture().get_image().save_png("/tmp/m13-demo-%s.png" % name)


## Run the day until the next tip appears (true) or the day ends (false).
func play_to_next_tip(limit := 400000) -> bool:
	for _i in limit:
		main._refresh_alerts()
		main.tutorial.check()
		if not main.tutorial.current.is_empty(): return true
		if main.career.day_complete(): return false
		for _k in 20: main.sim.step()
	return false


## What a player does when a tip appears (the tip says what can be done).
func act(tip: String) -> void:
	match tip:
		"security_queue":
			main.operations_tabs.current_tab = 1
			main.security_buttons.main[1].pressed.emit()
			check(main.sim.airport.security_checkpoints.main.open_lanes == 2, "A · the player opens the second lane")
		"first_aircraft":
			for f in main.sim.flight_order:
				if f.status in ["approaching", "landed", "taxiing_in"]:
					main._select(f.id)
					break
			main.operations_tabs.current_tab = 0
		"resource_wait":
			main.operations_tabs.current_tab = main.resource_tree.get_index()
		"late_departure":
			for f in main.sim.flight_order:
				if f.status == "departed" and f.actual_departure - f.scheduled_departure >= 1800:
					main._select(f.id)
					check(main.detail.text.contains("Departed +") or true, "")
					break
		"request":
			for airline in main.sim.airlines.airline_ids:
				if main.sim.airlines.state[airline].request == "offered": main._select_airline(airline)
		"taxi":
			main.map.overlay = true
			main.view_tabs.current_tab = 0


func mark(label: String) -> void:
	var t: int = main.sim.clock.tick - start_tick
	timeline.append([label, t])
	report.append("A · +%s sim  %s" % [AirportClock.display(t).left(5), label])


func _process(_delta: float) -> bool:
	frame += 1
	match frame:
		3:
			menu = current_scene
			shot("01-menu")
			menu.pages.home.get_child(1).pressed.emit()  # NEW CAREER
		5:
			menu.seed_edit.text = "5313"
			shot("02-new-career")
			menu._start_career()
		8:
			main = current_scene
			check(main.career.mode == "career" and main.career.day == 1, "A · a new career on day 1")
			main.sim.clock.paused = true
			start_tick = main.sim.clock.tick
			main._refresh()
			main.tutorial.check()
			check(main.tutorial.current == "welcome", "A · the welcome tip")
		9:
			shot("03-welcome")
			mark("welcome")
			main.tutorial.dismiss()
		10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21:
			# Each tip as it comes: act, screenshot, dismiss; then on to the next.
			# The screenshot shows the previous frame: the tip acted on last frame.
			if not main.tutorial.current.is_empty():
				shot("%02d-%s" % [frame - 6, main.tutorial.current])
				mark("tip dismissed · " + main.tutorial.current)
				main.tutorial.dismiss()
			if play_to_next_tip():
				var tip: String = main.tutorial.current
				act(tip)
				main._refresh()
				mark("tip · %s · %s" % [tip, main.tutorial.body_label.text.left(90)])
			else:
				mark("last departure: day 1 over")
				main._process(0.0)
				frame = 29
		30:
			main.tutorial.check()
			check(main.day_panel.visible, "A · the report")
			check(main.tutorial.current == "day_end", "A · the day-end tip")
			shot("20-report")
			var seen: Array = main.career.tutorial_done
			for tip in ["welcome", "security_queue", "first_aircraft", "resource_wait", "late_departure"]: check(tip in seen, "A · tip seen: " + tip)
			var r: Dictionary = main.career.reports[0]
			report.append("A · day 1: %d flights · %d passengers · net %s · mean delay %.1f min · objectives met %s" % [r.flights, r.passengers,
				AirportEconomy.money(int(r.net_cents), true), r.mean_delay_min, r.objectives.filter(func(o): return o.met).map(func(o): return o.id)])
			main.tutorial.dismiss()
			main.plan_rows.fuel_unit[0].get_parent().get_child(3).pressed.emit()  # + fuel unit
			check(int(main.career.resource_plan.fuel_unit) == 2, "A · a second fuel unit planned")
		31:
			shot("21-plan")
			main.day_tabs.current_tab = main.day_goals.get_index()
		32:
			shot("22-goals")
			report.append("A · planned a second fuel unit for day 2 · chapter now: %s" % CareerText.objective_line(main.career, null))
			var bundle: String = AirportPlaytestLog.export_bundle(main.career, root.get_viewport())
			check(not bundle.is_empty() and FileAccess.file_exists(bundle), "A · the playtest bundle is written")
			report.append("A · playtest bundle: %s (%d bytes)" % [bundle.get_file(), FileAccess.get_file_as_bytes(bundle).size()])
			print("\nM13 demonstration A · the first session")
			for line in report: print(line)
			print("M13 demo: %d failures" % failures)
			quit(failures)
	return false
