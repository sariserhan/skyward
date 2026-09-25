class_name TutorialDirector
extends PanelContainer
## M13 contextual tips. Each tip appears once, right when its situation first
## happens (a queue building, an aircraft waiting for fuel, a tight
## connection...), says what the player can do about it and what it costs, and
## is recorded in the career when dismissed, so it never repeats, also after
## loading. Checked on the UI refresh from existing state (never per tick).
## Off in the sandbox and when the player turns tips off.

signal dismissed(id: String)

var main
var current := ""
var title_label: Label
var body_label: Label
var hint_label: Label


func setup(owner_main) -> void:
	main = owner_main
	visible = false
	mouse_filter = Control.MOUSE_FILTER_STOP
	var style := StyleBoxFlat.new()
	style.bg_color = Color("16384a")
	style.border_color = Color("70dec0")
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	add_theme_stylebox_override("panel", style)
	custom_minimum_size = Vector2(430, 0)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 6)
	add_child(box)
	title_label = Label.new()
	title_label.add_theme_font_size_override("font_size", 16)
	title_label.modulate = Color("70dec0")
	box.add_child(title_label)
	body_label = Label.new()
	body_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body_label.custom_minimum_size.x = 400
	body_label.add_theme_font_size_override("font_size", 14)
	box.add_child(body_label)
	var row := HBoxContainer.new()
	box.add_child(row)
	hint_label = Label.new()
	hint_label.add_theme_font_size_override("font_size", 11)
	hint_label.modulate = Color("a7becd")
	hint_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint_label.text = "Tips can be turned off in Settings"
	row.add_child(hint_label)
	var ok := Button.new()
	ok.text = "GOT IT"
	ok.pressed.connect(dismiss)
	row.add_child(ok)


func enabled() -> bool:
	return main.career.mode == "career" and bool(GameSettings.get_value("tips"))


## Show the first tip whose situation holds now (one at a time).
func check() -> void:
	if not enabled():
		visible = false
		return
	if not current.is_empty(): return
	for tip in tips():
		if tip.id in main.career.tutorial_done: continue
		var text: String = tip.when.call()
		if text.is_empty(): continue
		show_tip(tip.id, tip.title, text)
		return


func show_tip(id: String, title: String, text: String) -> void:
	current = id
	title_label.text = title
	body_label.text = text
	visible = true
	move_to_front()
	AirportPlaytestLog.log_event("tip_shown", {"tip": id})


func dismiss() -> void:
	if current.is_empty(): return
	if not current in main.career.tutorial_done: main.career.tutorial_done.append(current)
	AirportPlaytestLog.log_event("tip_dismissed", {"tip": current})
	var id := current
	current = ""
	visible = false
	dismissed.emit(id)


## The tips, in priority order. Each returns its text when its moment has come.
func tips() -> Array:
	var sim: AirportSimulation = main.sim
	var planning: bool = main.day_panel != null and main.day_panel.visible
	return [
		{"id": "welcome", "title": "WELCOME TO %s" % main.career.airport_name.to_upper(), "when": func() -> String:
			if planning or main.career.day != 1: return ""
			return "%d flights today, %d gates, one security hall. The top bar shows today's goal. SPACE pauses; 1, 2 and 4 set the speed; H opens help. Nothing needs you yet: watch passengers arrive, then speed up." % [sim.flight_order.size(), sim.airport.gates.size()]},
		{"id": "security_queue", "title": "A QUEUE AT SECURITY", "when": func() -> String:
			if planning: return ""
			for cp: SecurityCheckpoint in sim.airport.security_checkpoints.values():
				if cp.queue.size() >= 20:
					return "%d passengers are queuing at security with %d lane%s open. Open the Security tab below and press OPEN A LANE. Staff are paid every day, but a long queue makes passengers late for their flights." % [cp.queue.size(), cp.capacity(), "" if cp.capacity() == 1 else "s"]
			return ""},
		{"id": "first_aircraft", "title": "YOUR FIRST AIRCRAFT", "when": func() -> String:
			if planning: return ""
			for f: AirportFlight in sim.flight_order:
				if f.status in ["approaching", "landed", "taxiing_in"]:
					return "%s is arriving. Click it on the airfield or in the Flights list: its details show its gate, its times and, later, exactly what it is waiting for." % f.flight_number
			return ""},
		{"id": "resource_wait", "title": "SOMEONE HAS TO WAIT", "when": func() -> String:
			if planning: return ""
			for type in sim.resources.order:
				var queue: Array = sim.resource_queue(type)
				if not queue.is_empty():
					var t: TurnaroundTask = queue[0]
					return "All %s are busy, so %s waits for one. In a flight's details, SERVICE PRIORITY decides who is served first. It adds no capacity: another flight waits instead. More units can be planned for tomorrow." % [str(sim.resources.pools[type].label).to_lower(), sim.airport.flights[t.flight_id].flight_number]
			return ""},
		{"id": "tight_connection", "title": "HOLD OR CLOSE?", "when": func() -> String:
			if planning: return ""
			for alert in sim.boarding_alerts():
				if alert.connecting > 0:
					return "%s is boarding, but %d connecting passenger%s still on the way. HOLD +5 MIN keeps the gate open and the departure slips; CLOSE GATE leaves them behind. The airline notices either way." % [sim.airport.flights[alert.flight_id].flight_number, alert.connecting, " is" if alert.connecting == 1 else "s are"]
			return ""},
		{"id": "late_departure", "title": "WHY WAS IT LATE?", "when": func() -> String:
			if planning: return ""
			for f: AirportFlight in sim.flight_order:
				if f.status == "departed" and f.actual_departure - f.scheduled_departure >= 1800:
					return "%s left %s late. Select it: its details break the delay down by cause, such as waiting for a fuel unit, baggage, the runway queue or a late inbound aircraft. The biggest cause is where to look." % [f.flight_number, CareerText.minutes(f.actual_departure - f.scheduled_departure)]
			return ""},
		{"id": "request", "title": "AN AIRLINE WANTS TO GROW", "when": func() -> String:
			if planning: return ""
			for airline in sim.airlines.airline_ids:
				if sim.airlines.state[airline].request == "offered":
					return "%s wants more flights from tomorrow. More flights mean more revenue, and more congestion. Select it in the alerts or the Airlines tab: it says whether the airport can take them before you accept." % sim.airport.airlines[airline]
			return ""},
		{"id": "taxi", "title": "AIRCRAFT WAITING ON THE GROUND", "when": func() -> String:
			if planning: return ""
			for f: AirportFlight in sim.flight_order:
				if f.status in ["taxiing_in", "taxiing_out"] and (f.taxi_blocker == "taxiway" or f.taxi_blocker.begins_with("opposing")):
					return "%s is waiting for another aircraft on the same taxiway. Press O to see which taxiways are busy. Between days a second route (Build → Airside) can separate the traffic." % f.flight_number
			return ""},
		{"id": "day_end", "title": "THE DAY IS DONE", "when": func() -> String:
			if not planning or main.career.reports.is_empty(): return ""
			return "Revenue paid for today's operation, and the costs are what you committed to. Read WHAT HURT, then plan tomorrow on the right: every crew, fuel unit and tug you plan is paid for the whole day, busy or not."},
		{"id": "cannot_start", "title": "TOMORROW CANNOT START YET", "when": func() -> String:
			if not planning: return ""
			var errors: Array = main.career.start_errors()
			if errors.is_empty(): return ""
			return "%s Build what is missing in the Build tab. Accepted flights are a promise: the day starts once the airport can take them, or when you withdraw the request on the Plan tab (the airline will remember)." % str(errors[0])},
		{"id": "build", "title": "BUILDING", "when": func() -> String:
			if not planning or main.day_tabs == null or main.day_tabs.current_tab != 1: return ""
			return "Construction is permanent and paid once, from cash. Daily staffing (the Plan tab) is paid every day. Each item says exactly what it adds; the report tells you where the airport struggled."},
	]
