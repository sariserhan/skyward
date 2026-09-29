class_name TowerDesk
extends PanelContainer
var view: Airport3D
var radar: TowerRadar
var strips: TowerFlightStrips
var detail: Label
var training: Label
var performance: Label
var route_note: Label
var gate_choice: OptionButton
var runway_choice: OptionButton
var weather_choice: OptionButton
var level: OptionButton
var via: Array = []
var route_flight := ""
var radio_on := false
var volume := 70
var timer := 0.0
var drag := false
var minimized := false
var contents: VBoxContainer
var frame_ms: Array[float] = []
var training_on := true

func _ready() -> void:
	set_as_top_level(true)
	var panel:=StyleBoxFlat.new(); panel.bg_color=Color("10232ff5"); panel.border_color=Color("50747b"); panel.set_border_width_all(1); panel.set_corner_radius_all(8); panel.content_margin_left=10; panel.content_margin_right=10; panel.content_margin_top=8; panel.content_margin_bottom=8
	add_theme_stylebox_override("panel",panel)
	custom_minimum_size.x=340
	var stack:=VBoxContainer.new(); add_child(stack)
	var header:=HBoxContainer.new(); stack.add_child(header)
	var grip:=Button.new(); grip.text="⋮⋮ Tower desk · drag"; grip.size_flags_horizontal=Control.SIZE_EXPAND_FILL; header.add_child(grip)
	grip.gui_input.connect(func(e):
		if e is InputEventMouseButton and e.button_index==MOUSE_BUTTON_LEFT: drag=e.pressed
		if e is InputEventMouseMotion and drag:
			global_position+=e.relative
			_clamp_position())
	var minimize:=Button.new(); minimize.text="−"; header.add_child(minimize)
	minimize.pressed.connect(func(): minimized=not minimized; contents.visible=not minimized; size=Vector2.ZERO)
	var close:=Button.new(); close.text="×"; header.add_child(close); close.pressed.connect(hide)
	contents=VBoxContainer.new(); stack.add_child(contents)
	var scroll:=ScrollContainer.new(); scroll.custom_minimum_size=Vector2(340,490); contents.add_child(scroll)
	var body:=VBoxContainer.new(); body.size_flags_horizontal=Control.SIZE_EXPAND_FILL; scroll.add_child(body)
	_label(body,"Surface radar · simulated traffic · drag flight strips to organize")
	radar=TowerRadar.new(); radar.view=view; body.add_child(radar)
	radar.aircraft_selected.connect(func(id): view.flight_selected.emit(id))
	radar.node_selected.connect(func(id):
		if route_flight!=view.selected_id: via.clear(); route_flight=view.selected_id
		via.append(id); _preview())
	strips=TowerFlightStrips.new(); strips.custom_minimum_size.y=100; body.add_child(strips)
	strips.item_selected.connect(func(i): view.flight_selected.emit(strips.get_item_metadata(i)))
	detail=_label(body,"")
	var routing:=HBoxContainer.new(); body.add_child(routing)
	_button(routing,"Draw route",func(): radar.edit_route=not radar.edit_route; route_note.text="Click mapped radar nodes in order, then Apply. Hold first." if radar.edit_route else "Route drawing off.")
	_button(routing,"Clear",func(): via.clear(); radar.route.clear(); view.show_route([]); route_note.text="Preview cleared.")
	_button(routing,"Apply",func():
		if route_flight!=view.selected_id: via.clear()
		view.report_command(TowerOperations.apply_route(view.sim,view.selected_id,via)))
	route_note=_label(body,"Hold → Draw route → click taxi nodes → Apply → Resume")
	var assignments:=HBoxContainer.new(); body.add_child(assignments)
	gate_choice=OptionButton.new(); assignments.add_child(gate_choice)
	_button(assignments,"Assign gate",func():
		if gate_choice.item_count>0: view.report_command(view.sim.assign_gate(view.selected_id,gate_choice.get_item_text(gate_choice.selected))))
	runway_choice=OptionButton.new(); body.add_child(runway_choice)
	_button(body,"Assign selected runway",func():
		if runway_choice.item_count>0: view.report_command(TowerOperations.preferred_runway(view.sim,view.selected_id,runway_choice.get_item_metadata(runway_choice.selected))))
	weather_choice=OptionButton.new(); body.add_child(weather_choice)
	for name in TowerOperations.WEATHER: weather_choice.add_item(name)
	weather_choice.item_selected.connect(func(i): view.sim.config["tower_weather"]=weather_choice.get_item_text(i); view.apply_weather())
	level=OptionButton.new(); body.add_child(level)
	for name in ["Training · coached","Standard · manual","Challenge · low visibility"]: level.add_item(name)
	level.item_selected.connect(func(i):
		training_on=i==0; view.manual.button_pressed=true
		if i==2: view.sim.config["tower_weather"]="Low visibility"; weather_choice.select(2); view.apply_weather()
		view.sim.config["tower_difficulty"]=i)
	_button(body,"Begin guided session",func():
		training_on=true; level.select(0); view.sim.config["tower_difficulty"]=0
		view.manual.button_pressed=true
		if not view.skip_idle.disabled: view.skip_idle.pressed.emit())
	training=_label(body,"")
	var audio:=HBoxContainer.new(); body.add_child(audio)
	var voice:=CheckButton.new(); voice.text="Radio speech"; voice.disabled=not OS.has_feature("web"); voice.tooltip_text="Browser speech synthesis; availability depends on installed voices."; audio.add_child(voice)
	voice.toggled.connect(func(on): radio_on=on; if not on: _stop_speech())
	var slider:=HSlider.new(); slider.min_value=0; slider.max_value=100; slider.value=70; slider.custom_minimum_size.x=100; audio.add_child(slider)
	slider.value_changed.connect(func(value): volume=int(value))
	var sounds:=CheckButton.new(); sounds.text="Airport sound"; body.add_child(sounds); sounds.toggled.connect(func(on): view.airport_sound.set_enabled(on))
	var quality:=OptionButton.new(); body.add_child(quality)
	for name in ["Detail: high","Detail: balanced","Detail: low"]: quality.add_item(name)
	quality.item_selected.connect(func(i):
		view.quality=i; view.sun.shadow_enabled=i<2; view.viewport.msaa_3d=Viewport.MSAA_DISABLED if i==2 else Viewport.MSAA_2X)
	performance=_label(body,"")
	visible=false

func _label(parent: Node,text: String) -> Label:
	var label:=Label.new(); label.text=text; label.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART; label.custom_minimum_size.x=300; label.add_theme_font_size_override("font_size",12); parent.add_child(label); return label
func _button(parent: Node,text: String,action: Callable) -> void:
	var button:=Button.new(); button.text=text; parent.add_child(button); button.pressed.connect(action)
func _clamp_position() -> void:
	global_position=global_position.clamp(Vector2.ZERO,(get_viewport_rect().size-Vector2(size.x,40)).max(Vector2.ZERO))
func open() -> void:
	show(); global_position=Vector2(get_viewport_rect().size.x-size.x-18,180); _clamp_position()
func _preview() -> void:
	var plan:=TowerOperations.preview_route(view.sim,view.selected_id,via)
	route_note.text=plan.message; radar.route=plan.get("legs",[]); view.show_route(radar.route)
func _process(delta: float) -> void:
	frame_ms.append(delta*1000)
	if frame_ms.size()>120: frame_ms.pop_front()
	if not is_visible_in_tree() or view.sim==null: return
	timer+=delta
	if timer<.5: return
	timer=0
	_clamp_position()
	var sim:=view.sim
	if route_flight!=view.selected_id: via.clear(); radar.route.clear(); view.show_route([]); route_flight=view.selected_id
	if get_viewport().gui_is_dragging(): return
	strips.clear()
	var flights:=sim.flight_order.duplicate()
	if not strips.order.is_empty(): flights.sort_custom(func(a,b): return strips.order.find(a.id)<strips.order.find(b.id))
	for f: AirportFlight in flights:
		strips.add_item("%s · %s · %s" % [f.flight_number,f.assigned_gate_id,f.status.replace("_"," ")])
		strips.set_item_metadata(strips.item_count-1,f.id)
		if f.id==view.selected_id: strips.select(strips.item_count-1)
	if gate_choice.item_count!=sim.airport.gates.size():
		gate_choice.clear()
		for id in sim.airport.gates: gate_choice.add_item(id)
	if runway_choice.item_count!=sim.airport.runways.size():
		runway_choice.clear()
		for id in sim.airport.runways: runway_choice.add_item(sim.airport.runways[id].label); runway_choice.set_item_metadata(runway_choice.item_count-1,id)
	for i in runway_choice.item_count: runway_choice.set_item_text(i,TowerOperations.runway_advice(sim,runway_choice.get_item_metadata(i)))
	var f: AirportFlight=sim.airport.flights.get(view.selected_id)
	if f!=null:
		var tasks: Array[String]=[]
		for id in f.task_ids:
			var t: TurnaroundTask=sim.airport.turnaround_tasks[id]
			if t.status==TurnaroundTask.RUNNING: tasks.append(t.label+(" %d%%" % int(t.progress(sim.clock.tick)*100) if t.kind=="timed" else " · active"))
		detail.text="%s → %s\n%s\nServices: %s" % [f.origin,f.destination,f.taxi_blocker if not f.taxi_blocker.is_empty() else "No taxi conflict reported",", ".join(tasks) if not tasks.is_empty() else "No active ground task"]
	var score:=TowerOperations.score(sim)
	training.text="Score %d · %d departures · %.1f delay minutes\n%s" % [score.score,score.departed,score.late_minutes,("Training: %s clearance · %s taxi hold · %s custom route · %s departure" % ["✓" if score.clearances>0 else "○","✓" if score.holds>0 else "○","✓" if score.routes>0 else "○","✓" if score.departed>0 else "○"]) if training_on else "Manual control: watch queues, occupancy, wind and taxi conflicts."]
	if training_on:
		training.text+="\n"+("Next: select the first runway queue entry and issue a clearance." if score.clearances==0 else "Next: hold a taxiing aircraft at its next node." if score.holds==0 else "Next: draw and apply a taxi route, then resume." if score.routes==0 else "Next: complete turnaround and clear the departure.")
	var samples:=frame_ms.duplicate(); samples.sort()
	performance.text="Frame time p95: %.1f ms · %d aircraft models\nWeather presets are simulated, not live observations." % [samples[int((samples.size()-1)*.95)] if not samples.is_empty() else 0,view.models.size()]
func speak(message: String) -> void:
	if not radio_on: return
	if OS.has_feature("web"):
		var script:="(()=>{if(!window.speechSynthesis)return;let s=window.speechSynthesis;s.cancel();let voices=s.getVoices().filter(v=>v.lang.startsWith('en'));%s.forEach((text,i)=>{let u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.volume=%f;u.rate=i===0?.94:1.02;if(voices.length)u.voice=voices[Math.min(i,voices.length-1)];s.speak(u);});})()" % [JSON.stringify([message,"Roger. "+message]),volume/100.0]
		JavaScriptBridge.eval(script)
func _stop_speech() -> void:
	if OS.has_feature("web"): JavaScriptBridge.eval("if(window.speechSynthesis)window.speechSynthesis.cancel()")
func _exit_tree() -> void: _stop_speech()
