extends SceneTree
## M13 cost (spec §47): the starter career's tick cost, a fully expanded
## starter day, the Riverdale sandbox day, the UI-side cost of the M13 layer
## (alerts, tips, the Today story) per refresh, and save sizes and times at day
## start, mid-day and between days.

const STARTER := "res://configs/airports/career_starter.json"


func career(path: String) -> AirportCareer:
	var c := AirportCareer.new()
	c.new_career(path, -1 if path != STARTER else 5313, {"mode": "career" if path == STARTER else "sandbox", "name": "bench"})
	return c


## Every request accepted, and the airport built to fly them all (incl. the 787).
func expanded() -> AirportCareer:
	var c := career(STARTER)
	c.starting_cash_cents = 100000000
	for step in [["gate_narrow", "pad_B4"], ["gate_narrow", "pad_B5"], ["south_pier", "south_pier"], ["gate_wide", "pad_B6"], ["gate_narrow", "pad_B7"], ["gate_narrow", "pad_B8"], ["security_lane", "security_main"],
			["transfer_sorter", "baggage_transfer_sortation"], ["fuel_bay", "service_yard"]]:
		var r := c.build(step[0], step[1])
		if r.has("error"): print("  build failed: ", step, " ", r.error)
	var runway := c.build_runway("G_300_-300", "E", 2800)
	c.build_taxiway(runway.id + "_B", "R1_EXIT", 1)
	c.build_taxiway("R1_HOLD", runway.id + "_A", 1)
	for type in c.resource_plan: c.set_units(type, c.maximum_units(type))
	# Accept every tier the built airport can take (the 787's first).
	var tiers: Array = []
	for airline in ["GA", "NS", "SJ"]: tiers.append_array(c.expansion_tiers(airline))
	tiers.sort_custom(func(a, b): return a.id == "GA_LONGHAUL" and b.id != "GA_LONGHAUL")
	for tier in tiers:
		c.request_status[tier.id] = "accepted"
		if not c.start_errors().is_empty(): c.request_status.erase(tier.id)
	return c


func day(label: String, c: AirportCareer) -> void:
	var t0 := Time.get_ticks_usec()
	if not c.start_day():
		print("%s cannot start: %s" % [label, c.start_errors()])
		return
	var generation := Time.get_ticks_usec() - t0
	var start_save := JSON.stringify(c.snapshot())
	var s := c.sim
	var ticks := 0
	var worst := 0
	var ui_usec := 0
	var ui_calls := 0
	var mid := ""
	var mid_tick := int(s.config.start_tick) + 36000
	t0 = Time.get_ticks_usec()
	var sim_usec := 0
	while not c.day_complete():
		var t1 := Time.get_ticks_usec()
		s.step()
		sim_usec += Time.get_ticks_usec() - t1
		ticks += 1
		worst = maxi(worst, s.last_tick_usec)
		# The UI refreshes 4 times a second: at 4× that is every 10 ticks.
		if ticks % 10 == 0:
			var u := Time.get_ticks_usec()
			CareerText.alerts(s)
			CareerText.objective_line(c, s)
			if ticks % 200 == 0: CareerText.today_text(s, CareerProgress.story(s))
			ui_usec += Time.get_ticks_usec() - u
			ui_calls += 1
		if s.clock.tick == mid_tick: mid = JSON.stringify(c.snapshot())
	var mean := float(sim_usec) / ticks
	t0 = Time.get_ticks_usec()
	var parsed = JSON.parse_string(mid)
	var loaded := AirportCareer.from_snapshot(parsed) if parsed is Dictionary else null
	var mid_load := Time.get_ticks_usec() - t0
	c.settle_day()
	var between := JSON.stringify(c.snapshot())
	print("%-28s %2d flights · generation %.0f ms · mean %.1f us/tick · worst %.1f ms · 4x frame %.1f ms · UI layer %.0f us/refresh (%.1f%% of 4x frame) · saves: day start %.2f MB, mid-day %.2f MB (load %.0f ms, ok %s), between days %.2f MB" % [
		label, s.flight_order.size(), generation / 1000.0, mean, worst / 1000.0, mean * 40 / 1000.0, float(ui_usec) / maxi(1, ui_calls),
		100.0 * float(ui_usec) / maxi(1, ui_calls) / (mean * 10.0), start_save.length() / 1048576.0, mid.length() / 1048576.0, mid_load / 1000.0, loaded != null, between.length() / 1048576.0])


func _initialize() -> void:
	var only := OS.get_cmdline_user_args()
	if only.is_empty() or "starter" in only: day("starter day 1", career(STARTER))
	if only.is_empty() or "expanded" in only: day("starter, expanded", expanded())
	if only.is_empty() or "sandbox" in only: day("Riverdale sandbox day 1", career(AirportLaunch.SANDBOX))
	quit()
