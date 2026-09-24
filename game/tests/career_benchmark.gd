extends SceneTree
## M10: a three-day Riverdale career accepting every request (growth), plus
## the day-transition cost, the economy's own cost, and save size/time mid-day
## and between days.

func _initialize() -> void:
	var c := AirportCareer.new()
	c.new_career()
	for day in 3:
		var t0 := Time.get_ticks_usec()
		c.start_day()
		var generation := Time.get_ticks_usec() - t0
		var ticks := 0
		var worst := 0
		t0 = Time.get_ticks_usec()
		var mid_save := ""
		while not c.day_complete():
			c.sim.step()
			ticks += 1
			worst = maxi(worst, c.sim.last_tick_usec)
			for airline in c.sim.airlines.airline_ids:
				if c.sim.airlines.state[airline].request == "offered": c.sim.answer_airline_request(airline, true)
			if ticks == 60000 and day == 0: mid_save = _save_stats(c, "mid-day 1")
		var elapsed := Time.get_ticks_usec() - t0
		var flights := c.sim.flight_order.size()
		var economy := c.sim.economy_usec
		var s0 := Time.get_ticks_usec()
		c.settle_day()
		var settle := Time.get_ticks_usec() - s0
		var r: Dictionary = c.reports[-1]
		print("day %d: %d flights · generation %.0f ms · mean %.1f us/tick · worst %.1f ms · 4x frame %.1f ms · economy %.1f ms total (%.2f us/tick) · settlement %.0f ms · net %s" % [
			r.day, flights, generation / 1000.0, float(elapsed) / ticks, worst / 1000.0, float(elapsed) / ticks * 40 / 1000.0,
			economy / 1000.0, float(economy) / ticks, settle / 1000.0, AirportEconomy.money(int(r.net_cents), true)])
		if day == 0: print("  ", mid_save)
	print("  ", _save_stats(c, "between days 3 and 4"))
	print("ledger %d transactions · cash %s · reconciles %s" % [c.ledger.size(), AirportEconomy.money(c.settled_cash_cents()), c.settled_cash_cents() == c.starting_cash_cents + AirportEconomy.total(c.ledger)])
	quit(0)


func _save_stats(c: AirportCareer, label: String) -> String:
	var t0 := Time.get_ticks_usec()
	var text := JSON.stringify(c.snapshot())
	var saved := Time.get_ticks_usec() - t0
	t0 = Time.get_ticks_usec()
	var restored := AirportCareer.from_snapshot(JSON.parse_string(text))
	var loaded := Time.get_ticks_usec() - t0
	return "%s save: %.1f MB · serialize %.0f ms · parse+validate+restore %.0f ms · ok %s" % [label, text.length() / 1048576.0, saved / 1000.0, loaded / 1000.0, restored != null]
