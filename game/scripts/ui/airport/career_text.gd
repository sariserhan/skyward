class_name CareerText
extends RefCounted
## M13 player-facing text built from existing metrics: the objective line, the
## Today bottleneck summary, the end-of-day story and the alert list. Facts,
## never advice: the player decides what to do about them.

const MINT := "70dec0"
const AMBER := "ffc078"
const RED := "e5484d"
const INK := "a7becd"

const SEVERITY_ORDER := {"critical": 0, "important": 1, "info": 2}


static func minutes(ticks: int) -> String:
	return "%.1f min" % (ticks / 600.0)


# --- objective line -------------------------------------------------------------------

## One line for the top bar: the active chapter's primary goal and progress.
static func objective_line(career: AirportCareer, sim: AirportSimulation) -> String:
	if career.mode != "career": return ""
	var chapter := CareerProgress.active(career)
	if chapter.is_empty():
		return "ALL CHAPTERS COMPLETE · keep growing" + ("" if int(career.progress.milestone_day) > 0 else " · milestone: " + str(CareerProgress.milestone(career.base).get("text", "")))
	var primary: Dictionary = chapter.primary
	var progress := ""
	if sim != null and primary.get("kind", "") == "departures_min":
		var departed := sim.flight_order.filter(func(f): return f.status == "departed").size()
		progress = " (%d/%d today)" % [departed, int(primary.min)]
	var optional: Array = chapter.get("optional", [])
	var done := optional.filter(func(o): return career.progress.done.has(o.id)).size()
	return "%s · %s%s · optional %d/%d" % [str(chapter.title).to_upper(), primary.text, progress, done, optional.size()]


## The active chapter in full (the Objectives panel).
static func objectives_text(career: AirportCareer) -> String:
	if career.mode != "career": return "Sandbox: no objectives. Run Riverdale International as you like."
	var chapter := CareerProgress.active(career)
	var t := ""
	if chapter.is_empty(): t = "[b]Every chapter is complete.[/b] The airport is yours to grow."
	else:
		t = "[b]CHAPTER %d · %s[/b]\n%s\n\n" % [int(career.progress.chapter) + 1, str(chapter.title).to_upper(), chapter.get("intro", "")]
		t += "[b]PRIMARY[/b]\n" + _objective(career, chapter.primary)
		t += "\n\n[b]OPTIONAL[/b]"
		for o in chapter.get("optional", []): t += "\n" + _objective(career, o)
	var m := CareerProgress.milestone(career.base)
	if not m.is_empty():
		t += "\n\n[b]CAREER MILESTONE[/b]\n" + ("[color=#%s]✓ %s (day %d)[/color]" % [MINT, m.text, int(career.progress.milestone_day)] if int(career.progress.milestone_day) > 0 else "○ " + str(m.text))
	return t


static func _objective(career: AirportCareer, o: Dictionary) -> String:
	if career.progress.done.has(o.id): return "[color=#%s]✓ %s (day %d)[/color]" % [MINT, o.text, int(career.progress.done[o.id])]
	return "○ " + str(o.text)


# --- Today: the bottleneck summary --------------------------------------------------------

static func today_text(sim: AirportSimulation, story: Dictionary) -> String:
	var t := "[b]TODAY[/b] so far  ·  facts, worst first\n"
	var lines: Array = []
	for id in story.security:
		var s: Dictionary = story.security[id]
		lines.append([s.max_wait_ticks, "[b]Security[/b] %s · worst wait %s · average %s · peak queue %d · lanes %d open of %d" % [
			str(id).capitalize(), minutes(s.max_wait_ticks), minutes(s.average_wait_ticks), s.peak_queue, s.open_lanes, s.physical_lanes]])
	for type in story.resources:
		var r: Dictionary = story.resources[type]
		if r.flights_waited == 0 and r.utilization < 0.7: continue
		lines.append([r.wait_ticks, "[b]%s[/b] · %d%% busy · %d flights waited, %s in total" % [r.label, roundi(100.0 * r.utilization), r.flights_waited, minutes(r.wait_ticks)]])
	for id in story.baggage:
		var b: Dictionary = story.baggage[id]
		if b.peak_queue < 10: continue
		lines.append([b.peak_queue * 60, "[b]Baggage[/b] %s · peak queue %d bags · %d servers" % [str(id).replace("_", " "), b.peak_queue, b.servers]])
	for w in story.taxiways:
		lines.append([w.wait_ticks, "[b]Airside[/b] taxiway %s · %s of aircraft waiting" % [w.id, minutes(w.wait_ticks)]])
	if story.runway_queue_ticks > 0:
		lines.append([story.runway_queue_ticks, "[b]Runway[/b] queue · %s in total" % minutes(story.runway_queue_ticks)])
	lines.sort_custom(func(a, b): return a[0] > b[0])
	for line in lines: t += "\n" + line[1]
	var airlines: Array = story.contracts.keys()
	airlines.sort()
	for airline in airlines:
		var c: Dictionary = story.contracts[airline]
		if c.status in ["AT RISK", "FAILING"]:
			var bad: Array = c.terms.filter(func(term): return term.status in ["AT RISK", "FAILING"]).map(func(term): return "%s %s (target %s)" % [term.label, term.value, term.target])
			t += "\n[color=#%s][b]%s[/b] %s %s · %s[/color]" % [AMBER, sim.airport.airlines.get(airline, airline), c.label, c.status, "; ".join(bad)]
	if lines.is_empty(): t += "\nNothing is backing up so far."
	return t


# --- the end-of-day story -------------------------------------------------------------------

static func report_text(career: AirportCareer, r: Dictionary) -> String:
	var story: Dictionary = r.get("story", {})
	var names: Dictionary = career.base.get("airlines", {})
	var net := int(r.net_cents)
	var t := "[font_size=26][b]%s — DAY %d[/b][/font_size]\n" % [career.airport_name.to_upper(), int(r.day)]
	t += "[font_size=18]%d flights · %d passengers · [color=#%s]%s[/color][/font_size]\n" % [int(r.flights), int(r.passengers), MINT if net >= 0 else RED, AirportEconomy.money(net, true)]
	for chapter_id in r.get("chapters_completed", []):
		for chapter in CareerProgress.chapters(career.base):
			if chapter.id == chapter_id: t += "\n[color=#%s][b]CHAPTER COMPLETE: %s[/b][/color]" % [MINT, str(chapter.title).to_upper()]
	if int(career.progress.get("milestone_day", 0)) == int(r.day):
		t += "\n[color=#%s][b]MILESTONE: %s[/b][/color] · the career continues" % [MINT, CareerProgress.milestone(career.base).get("text", "")]
	# What went well / what hurt, as facts.
	var good: Array = []
	var bad: Array = []
	var airlines: Array = story.get("contracts", {}).keys()
	airlines.sort()
	for airline in airlines:
		var c: Dictionary = story.contracts[airline]
		var terms: String = "; ".join(c.terms.map(func(term): return "%s %s (target %s)" % [term.label, term.value, term.target]))
		if c.status == "PASSED": good.append("%s %s PASSED · %s" % [names.get(airline, airline), c.label, terms])
		elif c.status == "FAILED":
			var failing: Array = c.terms.filter(func(term): return term.status == "FAILING").map(func(term): return "%s: required %s, actual %s" % [term.label, term.target, term.value])
			bad.append("[color=#%s]%s %s FAILED[/color] · %s" % [RED, names.get(airline, airline), c.label, "; ".join(failing)])
	if int(story.get("on_time", 0)) > 0: good.append("%d of %d departures on time" % [int(story.on_time), int(r.flights)])
	if float(story.get("transfer_bag_rate", -1.0)) >= 0.98: good.append("%.1f%% of transfer bags made their connection" % (100.0 * float(story.transfer_bag_rate)))
	for type in story.get("resources", {}):
		var res: Dictionary = story.resources[type]
		if res.flights_waited > 0: bad.append("%d flights waited for %s · %s in total (%d in service, %d%% busy)" % [res.flights_waited, str(res.label).to_lower(), minutes(res.wait_ticks), res.units, roundi(100.0 * res.utilization)])
	if int(r.missed_connections) > 0:
		var cause := ""
		var w: Dictionary = story.get("worst_inbound", {})
		if not w.is_empty(): cause = " · largest cause: %s arrived %s late (%d of them)" % [w.flight, minutes(int(w.arrival_late_ticks)), int(w.count)]
		bad.append("%d passengers missed connections%s" % [int(r.missed_connections), cause])
	if int(r.missed_bags) > 0: bad.append("%d bags missed their flight" % int(r.missed_bags))
	for id in story.get("security", {}):
		var s: Dictionary = story.security[id]
		if s.max_wait_ticks >= 6000: bad.append("Security: worst wait %s, peak queue %d, %d of %d lanes open" % [minutes(s.max_wait_ticks), s.peak_queue, s.open_lanes, s.physical_lanes])
	for w in story.get("taxiways", []):
		if w.wait_ticks >= 1800: bad.append("Taxiway %s: %s of aircraft waiting" % [w.id, minutes(w.wait_ticks)])
	for late in story.get("late", []).slice(0, 3):
		bad.append("%s left %s late · biggest cause: %s (%s)" % [late.flight, minutes(late.late_ticks), late.cause_label, minutes(late.cause_ticks)])
	t += "\n\n[b][color=#%s]WHAT WENT WELL[/color][/b]" % MINT
	t += "\n" + ("\n".join(good.map(func(line): return "✓ " + line)) if not good.is_empty() else "—")
	t += "\n\n[b][color=#%s]WHAT HURT[/color][/b]" % AMBER
	t += "\n" + ("\n".join(bad.map(func(line): return "! " + line)) if not bad.is_empty() else "Nothing significant.")
	var objectives: Array = r.get("objectives", [])
	if not objectives.is_empty():
		t += "\n\n[b]OBJECTIVES[/b]"
		for o in objectives:
			var mark := "✓" if o.met else ("✓" if o.done else "✗")
			var color := MINT if o.met or o.done else INK
			t += "\n[color=#%s]%s %s%s[/color]%s" % [color, mark, "PRIMARY · " if o.primary else "", o.text, "" if o.target.is_empty() else " · %s (target %s)" % [o.value, o.target]]
	return t


# --- alerts ------------------------------------------------------------------------------

## Alerts with a severity, grouped by kind: [{severity, key, text, tooltip, target}].
static func alerts(sim: AirportSimulation) -> Array:
	var out: Array = []
	var conflicts: Array = sim.conflicts.values()
	conflicts.sort_custom(func(a, b): return a.flight_id < b.flight_id)
	for conflict in conflicts:
		var incoming: AirportFlight = sim.airport.flights[conflict.flight_id]
		var blocker: AirportFlight = sim.airport.flights[conflict.blocker_id]
		out.append({"severity": "critical" if conflict.severity == "critical" else "important", "key": "gate:" + incoming.id,
			"text": "%s needs gate %s · %s still there" % [incoming.flight_number, conflict.gate_id, blocker.flight_number],
			"tooltip": "Select to reassign %s to a free compatible gate, or wait." % incoming.flight_number, "target": incoming.id})
	for alert in sim.boarding_alerts():
		var held: AirportFlight = sim.airport.flights[alert.flight_id]
		out.append({"severity": "critical" if alert.connecting > 0 else "important", "key": "boarding:" + held.id,
			"text": "%s · %d missing%s · gate closes in %d min" % [held.flight_number, alert.missing, " (%d connecting)" % alert.connecting if alert.connecting > 0 else "", ceili(alert.closes_in / 600.0)],
			"tooltip": "Select to hold the flight or close the gate. It closes automatically if you do nothing.", "target": held.id})
	for cp: SecurityCheckpoint in sim.airport.security_checkpoints.values():
		var m := sim.passenger_flow.checkpoint_metrics(cp, sim.clock.tick)
		if m.oldest_wait >= 6000 or (cp.capacity() == 0 and not cp.queue.is_empty()):
			out.append({"severity": "important", "key": "security:" + cp.id, "text": "%s security · %d waiting · longest %s" % [cp.id.capitalize(), cp.queue.size(), minutes(m.oldest_wait)],
				"tooltip": "Open the Security tab to open a lane.", "target": "security:" + cp.id})
	for type in sim.resources.order:
		var queue: Array = sim.resource_queue(type)
		if queue.size() >= 2:
			out.append({"severity": "important", "key": "resources:" + type, "text": "%s · %d flights waiting" % [str(sim.resources.pools[type].label), queue.size()],
				"tooltip": "All %s are busy. Raise a flight's service priority to move it up; another flight waits instead." % str(sim.resources.pools[type].label).to_lower(), "target": "resources:" + type})
		var tugs := 0
		for t: TurnaroundTask in queue:
			if t.kind == "pushback" and sim.clock.tick - t.ready_tick >= 1200: tugs += 1
		if tugs > 0:
			out.append({"severity": "important", "key": "tugs", "text": "%d ready %s waiting for a tug" % [tugs, "aircraft" if tugs > 1 else "aircraft"], "tooltip": "Every pushback tug is busy.", "target": "resources:" + type})
	for stage_id in sim.baggage.stages:
		var queued: int = sim.baggage.stages[stage_id].queue.size()
		if queued >= int(sim.config.get("baggage", {}).get("backlog_alert_bags", 25)):
			out.append({"severity": "important", "key": "baggage:" + stage_id, "text": "%s · %d bags queued" % [stage_id.replace("_", " ").capitalize(), queued],
				"tooltip": "Bags not sorted by their flight's cutoff will miss it.", "target": "baggage:" + stage_id})
	for airline in sim.airlines.airline_ids:
		var e: Dictionary = sim.airlines.evaluations[airline]
		if e.contract.status in ["AT RISK", "FAILING"]:
			out.append({"severity": "important", "key": "contract:" + airline, "text": "%s · %s %s" % [sim.airport.airlines[airline], e.contract.label, e.contract.status],
				"tooltip": "Select to see which terms are at risk and why.", "target": "airline:" + airline})
		if sim.airlines.state[airline].request == "offered":
			out.append({"severity": "info", "key": "request:" + airline, "text": "%s requests +%d daily flights" % [sim.airport.airlines[airline], sim.airlines.request_of(airline).flights.size()],
				"tooltip": "Select to see the request and whether the airport can take it.", "target": "airline:" + airline})
	var holding := 0
	for f: AirportFlight in sim.flight_order:
		if f.status in ["taxiing_in", "taxiing_out"] and (f.taxi_blocker == "taxiway" or f.taxi_blocker.begins_with("opposing")): holding += 1
	if holding > 0:
		out.append({"severity": "info", "key": "taxi", "text": "%d aircraft waiting on taxiways" % holding, "tooltip": "Press O for the airside overlay.", "target": "taxi"})
	out.sort_custom(func(a, b): return SEVERITY_ORDER[a.severity] < SEVERITY_ORDER[b.severity] or (a.severity == b.severity and a.key < b.key))
	return out
