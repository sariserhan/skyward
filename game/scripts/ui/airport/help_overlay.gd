class_name HelpOverlay
extends PanelContainer
## M13 help: short pages the player can reopen any time (H or ?). A reminder of
## how things work, not a manual.

const PAGES := [
	["Flights", "Every flight lands, taxis to its gate, turns around (deboarding, cleaning, catering, fueling, baggage, boarding), pushes back, taxis to the runway and takes off.\n\nA flight is late when any part of that chain is late. Select a flight: its details show what it is doing, what it waits for, and after departure how its delay breaks down by cause.\n\nSPACE pauses; 1, 2, 4 set the speed; O shows airside congestion."],
	["Resources", "Cleaning and catering crews, fuel units, baggage crews and pushback tugs are shared. When all units of a kind are busy, flights queue for them.\n\nSERVICE PRIORITY (in a flight's details) decides who goes first. It never adds capacity: another flight waits instead.\n\nBetween days, the Plan tab sets how many units you pay for tomorrow (up to what your facilities allow). Unused units still cost the full day."],
	["Security", "Departing passengers queue at security. Each open lane needs one staff member; the Security tab opens and closes lanes.\n\nA long queue makes passengers late for boarding, and late passengers make flights late or miss them.\n\nMore physical lanes are built between days (Build → Security)."],
	["Connections", "Some arriving passengers connect to another flight. They deplane, walk to their next gate and board, as the same person.\n\nWhen a flight is about to close its gate with connectors still on their way, you choose: HOLD +5 MIN (the departure slips) or CLOSE GATE (they miss it). Airlines that sell connections care about the result."],
	["Baggage", "Checked bags are real objects: sorted, loaded and unloaded by crews, and transferred between flights. A bag can miss its connection even when its passenger makes it.\n\nSortation modules (Build → Baggage) add parallel sorters; baggage crews (Plan) load and unload aircraft."],
	["Airlines", "Each airline scores your airport from its own flights with its own priorities: punctuality, connections, baggage, turnaround, gates. Its relationship rises and falls with that score.\n\nEach has a contract. It is settled at the end of the day: PASSED earns a bonus, FAILED costs a penalty, and the report shows the actual against the target.\n\nGood relationships bring requests for more flights. Accepting commits them to tomorrow's schedule."],
	["Money", "Revenue comes from real operations: aircraft and gate fees, departed passengers, bags, and contract bonuses.\n\nCosts are what you commit to for the day (crews, fuel units, tugs, security staff, airport operations) plus penalties.\n\nConstruction is capital: paid once, from cash. If even the smallest valid plan can't be paid for, the career is insolvent."],
	["Building", "Between days, the Build tab adds gates on pads, the pier, security lanes, baggage modules, service facilities, taxiways and runways. Each item says exactly what it adds.\n\nA new gate lets more flights fly; more flights mean more passengers at security, more bags and more aircraft on the taxiways.\n\nA runway's length decides which aircraft can use it (the 787 needs 2,800 m). Taxiways may not cross each other or a runway except at shared points."],
]

var tabs: TabContainer


func _ready() -> void:
	visible = false
	set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	custom_minimum_size = Vector2(720, 460)
	var style := StyleBoxFlat.new()
	style.bg_color = Color("0f2230")
	style.border_color = Color("70dec0")
	style.set_border_width_all(2)
	style.set_corner_radius_all(10)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 16
	style.content_margin_bottom = 16
	add_theme_stylebox_override("panel", style)
	var box := VBoxContainer.new()
	add_child(box)
	var head := HBoxContainer.new()
	box.add_child(head)
	var title := Label.new()
	title.text = "HELP"
	title.add_theme_font_size_override("font_size", 20)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var close := Button.new()
	close.text = "CLOSE (H)"
	close.pressed.connect(func(): visible = false)
	head.add_child(close)
	tabs = TabContainer.new()
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(tabs)
	for page in PAGES:
		var text := RichTextLabel.new()
		text.name = page[0]
		text.text = page[1]
		text.add_theme_font_size_override("normal_font_size", 16)
		tabs.add_child(text)


func toggle() -> void:
	visible = not visible
	if visible:
		move_to_front()
		set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_KEEP_SIZE)
		AirportPlaytestLog.log_event("help")
