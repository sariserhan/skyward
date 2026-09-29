extends TestCase

func scenario() -> AirportSimulation:
	var config := AirportSimulation.load_config("res://configs/airports/riverdale.json")
	for key in ["passenger_flow", "baggage", "resources"]: config.erase(key)
	var s := AirportSimulation.new()
	s.setup(config)
	return s

func test_clearance_respects_queue_and_separation() -> void:
	var s := scenario()
	s.set_tower_control(true)
	var a: AirportFlight = s.flight_order[0]
	var b: AirportFlight = s.flight_order[1]
	s._request_runway(a,"landing")
	s._request_runway(b,"landing")
	var runway: AirportRunway = s.airport.runways[a.runway_id]
	s._start_runway()
	assert_true(runway.active_operation.is_empty(),"manual queue waits")
	assert_true(not s.tower_command(b.id,"clear").ok,"cannot clear out of sequence")
	assert_true(s.tower_command(a.id,"clear").ok)
	s._start_runway()
	assert_eq(runway.active_operation.flight_id,a.id)
	assert_true(not s.tower_command(b.id,"clear").ok,"cannot clear occupied runway")
	s.clock.tick = int(runway.active_operation.end_tick)
	s._complete_runway()
	assert_true(not s.tower_command(b.id,"clear").ok,"separation remains enforced")
	s.clock.tick = runway.occupied_until
	assert_true(s.tower_command(b.id,"clear").ok)

func test_taxi_hold_waits_at_node_then_resumes() -> void:
	var s := scenario()
	var f: AirportFlight = s.flight_order[0]
	f.runway_id = s.airport.runways.keys()[0]
	s._begin_taxi(f,"in")
	assert_true(s.tower_command(f.id,"hold").ok)
	var leg: int = f.taxi_leg
	s.clock.tick = f.leg_exit_tick+1
	assert_true(not s._advance_taxi(f))
	assert_eq(f.taxi_leg,leg,"does not enter another edge while held")
	assert_true(s.tower_command(f.id,"resume").ok)
	s._advance_taxi(f)
	assert_true(f.taxi_leg>leg or f.taxi_state=="done")
	s.tower_command(f.id,"hold")
	s.set_tower_control(false)
	assert_true(not f.taxi_hold,"auto releases controller holds")

func test_controller_fields_survive_save_and_old_defaults() -> void:
	var flight := AirportFlight.new()
	flight.taxi_hold = true
	flight.runway_cleared = true
	var copy := AirportFlight.new()
	copy.restore(flight.to_dict())
	assert_true(copy.taxi_hold and copy.runway_cleared)
	var old := AirportFlight.new()
	old.restore({"id":"old"})
	assert_true(not old.taxi_hold and not old.runway_cleared)
	var runway := AirportRunway.new()
	runway.manual_control = true
	var other := AirportRunway.new()
	other.restore(runway.to_dict())
	assert_true(other.manual_control)

func test_legacy_v13_snapshot_migrates_and_invalid_flags_fail() -> void:
	var s := scenario()
	var data := s.snapshot()
	for f in data.airport.flights.values():
		f.erase("taxi_hold")
		f.erase("runway_cleared")
	for r in data.airport.runways.values(): r.erase("manual_control")
	var restored := AirportSimulation.from_snapshot(data)
	assert_true(restored != null,"existing careers remain loadable")
	data.airport.flights.values()[0]["taxi_hold"] = "yes"
	assert_true(AirportSimulation.from_snapshot(data) == null,"invalid new values still rejected")

func test_route_editor_requires_hold_and_preserves_current_leg() -> void:
	var s:=scenario()
	var f: AirportFlight=s.flight_order[0]
	f.runway_id=s.airport.runways.keys()[0]
	s._begin_taxi(f,"in")
	var before:=f.taxi_route.duplicate()
	assert_true(not TowerOperations.apply_route(s,f.id,[]).ok,"hold required")
	assert_true(not TowerOperations.preview_route(s,f.id,["unknown"]).ok,"invalid node rejected")
	s.tower_command(f.id,"hold")
	var result:=TowerOperations.apply_route(s,f.id,[])
	assert_true(result.ok,"direct valid route accepted")
	assert_eq(f.taxi_route[0],before[0],"occupied leg preserved")
	assert_true(f.taxi_hold,"applying cannot release hold")
	assert_true(s.tower_command(f.id,"resume").ok)

func test_weather_changes_spacing_and_survives_snapshot() -> void:
	var s:=scenario()
	s.config["tower_weather"]="Low visibility"
	var f: AirportFlight=s.flight_order[0]
	s._request_runway(f,"landing")
	s._start_runway()
	var r: AirportRunway=s.airport.runways[f.runway_id]
	assert_true(int(r.active_operation.end_tick)-s.clock.tick>int(s.config.landing_ticks))
	assert_eq(r.occupied_until-int(r.active_operation.end_tick),ceili(int(s.config.separation_ticks)*1.8))
	var saved:=scenario()
	saved.config["tower_weather"]="Rain"
	var restored:=AirportSimulation.from_snapshot(saved.snapshot())
	assert_true(restored!=null)
	assert_true(TowerOperations.weather(restored).wet)

func test_runway_assignment_and_controller_score() -> void:
	var s:=scenario()
	var f: AirportFlight=s.flight_order[0]
	var runway: String=s.airport.runways.keys()[0]
	assert_true(TowerOperations.preferred_runway(s,f.id,runway).ok)
	assert_eq(s._choose_runway(f,"landing"),runway)
	s.set_tower_control(true)
	s._request_runway(f,"landing")
	assert_true(not TowerOperations.preferred_runway(s,f.id,runway).ok,"cannot change queued operation")
	s.tower_command(f.id,"clear")
	assert_eq(TowerOperations.score(s).clearances,1)

func test_completed_simulation_releases_flow_and_baggage() -> void:
	var s:=scenario()
	var flow: WeakRef=weakref(s.passenger_flow)
	var baggage: WeakRef=weakref(s.baggage)
	s=null
	assert_true(flow.get_ref()==null,"passenger flow must release")
	assert_true(baggage.get_ref()==null,"baggage backlink cannot retain career")

func test_invalid_saved_controller_settings_rejected() -> void:
	var s:=scenario()
	var data:=s.snapshot()
	data.scenario["tower_runways"]="not a map"
	assert_true(AirportSimulation.from_snapshot(data)==null)
	data.scenario.erase("tower_runways")
	data.scenario["tower_weather"]="unknown"
	assert_true(AirportSimulation.from_snapshot(data)==null)

func test_conflicting_route_keeps_original_reservations() -> void:
	var s:=scenario()
	var f: AirportFlight=s.flight_order[0]
	var graph:={"nodes":{"A":{"x":0,"y":0},"B":{"x":100,"y":0},"X":{"x":200,"y":-100},"Y":{"x":200,"y":100},"D":{"x":300,"y":0}},"edges":[],"runways":[],"stands":{f.assigned_gate_id:"D"}}
	for pair in [["A","B"],["B","X"],["X","D"],["B","Y"],["Y","D"]]:
		graph.edges.append({"id":pair[0]+pair[1],"from":pair[0],"to":pair[1],"length_m":100,"oneway":false,"classes":["narrow","wide"]})
	s.config.airside=graph
	s.airside.setup(graph)
	f.runway_id=s.airport.runways.keys()[0]
	s.airport.runways[f.runway_id].b="A"
	s._begin_taxi(f,"in")
	s.tower_command(f.id,"hold")
	var route:=f.taxi_route.duplicate()
	s.airside.try_start(["YD:-1"])
	var before:=s.airside.edge_state.duplicate(true)
	assert_true(TowerOperations.preview_route(s,f.id,["Y"]).blocked,"preview detects opposing traffic")
	assert_true(not TowerOperations.apply_route(s,f.id,["Y"]).ok)
	assert_eq(f.taxi_route,route,"route retained on rejection")
	assert_eq(s.airside.edge_state,before,"all original locks restored")
	s.airside.release_route(["YD:-1"])
	assert_true(TowerOperations.apply_route(s,f.id,["Y"]).ok,"route works after conflict clears")
	assert_true(f.taxi_route.any(func(leg): return AirsideNetwork.leg_edge(leg)=="BY" and AirsideNetwork.leg_dir(leg)==1),"replacement uses alternative branch")
	assert_eq(int(s.airside.edge_state.BX.locks),0,"unused reservation released")

func test_curve_preview_respects_leg_direction() -> void:
	var s:=scenario()
	var edge: Dictionary=s.airside.edges.values()[0]
	edge["points"]=[[1,2],[3,4],[5,6]]
	var points:=TowerOperations.route_points(s,edge.id+":-1")
	assert_eq(points[0],Vector2(5,6))
	assert_eq(points[1],Vector2(3,4))
