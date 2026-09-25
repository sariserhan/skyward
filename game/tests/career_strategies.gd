extends SceneTree
## M13 career baselines (spec §39) and demonstrations B–D, headless.
## Five automated "players" run the starter career for several days on the
## same seed. They are crude policies, not optimal play: the point is that the
## career responds to choices and no single policy obviously dominates.
##   conservative     opens a lane when security queues; grows only when the
##                    cash covers it twice
##   aggressive       accepts every request, builds whatever it needs at once,
##                    plans generous capacity
##   underprovisioned minimum capacity, never opens the second lane, declines
##   overbuilt        builds gates, lanes and sorters on day 1, no growth
##   growth           accepts everything and builds exactly what it needs,
##                    including the 787 path when affordable
##   recovery         two bad days on purpose (minimum capacity, no second
##                    lane, requests left unanswered), then plays conservative
## Also: B (progression), C (recovery after a bad day), D (construction
## creates the next problem) are read from these runs.
##   godot --headless --path game --script tests/career_strategies.gd [-- days=8]

const STARTER := "res://configs/airports/career_starter.json"

var days := 8


func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("days="): days = int(arg.trim_prefix("days="))
	var results := {}
	var only: Array = Array(OS.get_cmdline_user_args()).filter(func(a): return not a.begins_with("days="))
	for policy in ["conservative", "aggressive", "underprovisioned", "overbuilt", "growth", "recovery"]:
		if only.is_empty() or policy in only: results[policy] = run(policy)
	print("\n== summary (%d days, seed 5313, standard)" % days)
	print("%-17s %8s %10s %9s %10s %8s %7s %8s" % ["policy", "flights", "operating", "capital", "cash", "delay", "chapter", "787"])
	for policy in results:
		var r: Dictionary = results[policy]
		print("%-17s %8d %10s %9s %10s %7.1fm %7d %8s" % [policy, r.flights, AirportEconomy.money(r.operating, true), AirportEconomy.money(r.capital), AirportEconomy.money(r.cash), r.mean_delay, r.chapter, r.widebody_day])
	quit()


func run(policy: String) -> Dictionary:
	var c := AirportCareer.new()
	c.new_career(STARTER, 5313, {"mode": "career", "name": policy, "difficulty": "standard"})
	var operating := 0
	var capital := 0
	var flights := 0
	var delay_sum := 0.0
	var widebody_day := "—"
	print("\n== %s" % policy)
	for d in days:
		prepare(c, policy)
		if not c.can_start():
			print("  day %d cannot start: %s%s" % [c.day, " ".join(c.start_errors()), " (INSOLVENT)" if c.insolvent() else ""])
			if c.insolvent(): break
			# A plan the cash cannot cover: back to the minimum, as a player would.
			if c.start_errors().is_empty():
				for type in c.resource_plan: c.set_units(type, int(c.base.economy.resources[type].min))
			# Give up the promise that cannot be kept (it costs the relationship).
			for req in c.blocking_requests():
				c.withdraw_request(req.id)
				print("  day %d: withdrew %s" % [c.day, req.label])
			if not c.can_start(): break
		c.start_day()
		var s := c.sim
		while not c.day_complete():
			s.step()
			var cp: SecurityCheckpoint = s.airport.security_checkpoints.main
			var neglect: bool = policy == "underprovisioned" or (policy == "recovery" and c.day <= 2)
			if not neglect and cp.queue.size() >= 20 and cp.open_lanes < cp.max_lanes and cp.staff < int(s.passenger_flow.config.staff_pool):
				s.set_security("main", cp.open_lanes + 1, cp.staff + 1)
			for airline in s.airlines.airline_ids:
				if s.airlines.state[airline].request == "offered" and not (policy == "recovery" and c.day <= 2):
					s.answer_airline_request(airline, accepts(c, policy, s.airlines.request_of(airline)))
		c.settle_day()
		var r: Dictionary = c.reports[-1]
		operating += int(r.net_cents)
		capital += int(r.capital_cents)
		flights += int(r.flights)
		delay_sum += float(r.mean_delay_min)
		if int(r.story.widebody_departed) > 0 and widebody_day == "—": widebody_day = "day %d" % int(r.day)
		var hurt: Array = []
		for type in r.story.resources:
			if r.story.resources[type].flights_waited > 0: hurt.append("%s ×%d" % [type, r.story.resources[type].flights_waited])
		var sec: Dictionary = r.story.security.main
		var taxi: String = "" if r.story.taxiways.is_empty() else " · taxi %s %.1fm" % [r.story.taxiways[0].id, r.story.taxiways[0].wait_ticks / 600.0]
		var passed: int = r.contracts.values().filter(func(x): return x.status == "PASSED").size()
		print("  day %d: %2d flights · %4d pax · net %10s · capital %9s · cash %10s · delay %4.1fm · missed conn %2d · contracts %d/%d · security peak %3d/%.0fm · waits %s%s · chapter %d%s" % [
			int(r.day), int(r.flights), int(r.passengers), AirportEconomy.money(int(r.net_cents), true), AirportEconomy.money(int(r.capital_cents)),
			AirportEconomy.money(int(r.closing_cents)), float(r.mean_delay_min), int(r.missed_connections), passed, r.contracts.size(),
			sec.peak_queue, sec.max_wait_ticks / 600.0, ",".join(hurt), taxi, int(c.progress.chapter), " · MILESTONE" if int(c.progress.milestone_day) == int(r.day) else ""])
	return {"flights": flights, "operating": operating, "capital": capital, "cash": c.settled_cash_cents(), "mean_delay": delay_sum / maxi(1, c.reports.size()),
		"chapter": int(c.progress.chapter), "widebody_day": widebody_day}


func accepts(c: AirportCareer, policy: String, request: Dictionary) -> bool:
	match policy:
		"aggressive", "growth": return true
		"conservative", "recovery":
			var needs_widebody: bool = request.get("flights", []).any(func(f): return f.aircraft_type == "787")
			return not needs_widebody or c.settled_cash_cents() > 60000000
	return false


## Between days: build what the accepted flights need, then plan capacity.
func prepare(c: AirportCareer, policy: String) -> void:
	if c.day == 1 and policy == "overbuilt":
		for step in [["gate_narrow", "pad_B4"], ["gate_narrow", "pad_B5"], ["security_lane", "security_main"], ["transfer_sorter", "baggage_transfer_sortation"], ["fuel_bay", "service_yard"]]:
			c.build(step[0], step[1])
	if policy == "recovery" and c.day <= 2:
		for type in c.resource_plan: c.set_units(type, int(c.base.economy.resources[type].min))
	elif c.day >= 2:
		for type in c.resource_plan:
			var want := int(c.resource_plan[type])
			match policy:
				"underprovisioned": want = int(c.base.economy.resources[type].min)
				"aggressive": want = c.maximum_units(type)
				"conservative", "growth", "overbuilt", "recovery":
					# One more of whatever made flights wait yesterday.
					if int(c.reports[-1].story.resources.get(type, {}).get("flights_waited", 0)) >= 2: want += 1
			c.set_units(type, clampi(want, int(c.base.economy.resources[type].min), c.maximum_units(type)))
	if policy == "aggressive" and c.day >= 2:
		for step in [["security_lane", "security_main"], ["fuel_bay", "service_yard"]]:
			if c.settled_cash_cents() > 8000000: c.build(step[0], step[1])
	# Whatever tomorrow's accepted flights need.
	for _i in 6:
		var errors := c.start_errors()
		if errors.is_empty(): return
		var text := " ".join(errors)
		var built := false
		if text.contains("(narrowbody)"):
			for pad in ["pad_B4", "pad_B5", "pad_B7", "pad_B8"]:
				if pad in ["pad_B7", "pad_B8"] and c.layout.objects_at("south_pier").is_empty() and not built: c.build("south_pier", "south_pier")
				if not built and c.layout.objects_at(pad).is_empty() and not c.build("gate_narrow", pad).has("error"): built = true
		if not built and (text.contains("(widebody)") or text.contains("runway")):
			if c.layout.objects_at("south_pier").is_empty(): built = not c.build("south_pier", "south_pier").has("error")
			if c.layout.objects_at("pad_B6").is_empty(): built = not c.build("gate_wide", "pad_B6").has("error") or built
			if text.contains("runway") and c.layout.current_airside().runways.size() < 2:
				var r := c.build_runway("G_300_-300", "E", 2800)
				if not r.has("error"):
					c.build_taxiway(r.id + "_B", "R1_EXIT", 1)
					c.build_taxiway("R1_HOLD", r.id + "_A", 1)
					built = true
		if not built: return
