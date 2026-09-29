class_name TowerOperations
extends RefCounted
## Controller planning uses the canonical graph, reservations and simulation clock.
const WEATHER := {
	"Clear": {"wind": 0.0, "knots": 0.0, "visibility": 30.0, "wet": false, "spacing": 1.0},
	"Rain": {"wind": 90.0, "knots": 12.0, "visibility": 8.0, "wet": true, "spacing": 1.3},
	"Low visibility": {"wind": 230.0, "knots": 18.0, "visibility": 1.5, "wet": true, "spacing": 1.8}}

static func weather(sim: AirportSimulation) -> Dictionary:
	return WEATHER.get(str(sim.config.get("tower_weather", "Clear")), WEATHER.Clear)

static func wind_components(sim: AirportSimulation, id: String) -> Vector2:
	var r: AirportRunway = sim.airport.runways[id]
	var d := sim.airside.node_position(r.b)-sim.airside.node_position(r.a)
	var heading := atan2(d.x,-d.y)
	var w := weather(sim)
	var difference := deg_to_rad(float(w.wind))-heading
	return Vector2(cos(difference)*float(w.knots),absf(sin(difference)*float(w.knots)))

static func runway_advice(sim: AirportSimulation, id: String) -> String:
	var wind := wind_components(sim,id)
	return "%s · %.0f kt %s · %.0f kt crosswind" % [sim.airport.runways[id].label,absf(wind.x),"headwind" if wind.x>=0 else "tailwind",wind.y]

static func preferred_runway(sim: AirportSimulation, flight_id: String, id: String) -> Dictionary:
	if not sim.airport.flights.has(flight_id) or not sim.airport.runways.has(id): return {"ok":false,"message":"Select a flight and runway."}
	var f: AirportFlight = sim.airport.flights[flight_id]
	if f.runway_requested or not f.status in ["scheduled","approaching","at_gate","turnaround","boarding","ready_for_pushback"]:
		return {"ok":false,"message":"Runway assignment is locked once taxi or a runway request starts."}
	var r: AirportRunway = sim.airport.runways[id]
	var direction := "in" if f.status in ["scheduled","approaching"] else "out"
	if not sim.airside.runway_serves(sim.airside.runway(id),sim._aircraft_type(f)) or sim._taxi_route(f,r,direction).is_empty():
		return {"ok":false,"message":"Runway length or the mapped taxi connection is unsuitable."}
	var assignments: Dictionary = sim.config.get("tower_runways",{})
	assignments[flight_id] = id
	sim.config["tower_runways"] = assignments
	sim.decisions.append({"tick":sim.clock.tick,"type":"tower","command":"runway","flight_id":flight_id,"runway":id})
	return {"ok":true,"message":"%s, expect runway %s." % [f.flight_number,r.label]}

static func preview_route(sim: AirportSimulation, flight_id: String, via: Array) -> Dictionary:
	if not sim.airport.flights.has(flight_id): return {"ok":false,"message":"Select a taxiing aircraft."}
	var f: AirportFlight = sim.airport.flights[flight_id]
	if not f.status in ["taxiing_in","taxiing_out"] or not f.taxi_state in ["starting","moving"] or f.taxi_route.is_empty():
		return {"ok":false,"message":"Route editing is available during taxi. Hold the aircraft before applying."}
	var from := sim.airside.leg_from(f.taxi_route[0]) if f.taxi_leg<0 else sim.airside.leg_to(f.taxi_route[f.taxi_leg])
	var destination: String = sim._stand(f) if f.status=="taxiing_in" else sim.airport.runways[f.runway_id].a
	var points := via.duplicate()
	points.append(destination)
	var legs: Array = []
	for node in points:
		if not node is String or not sim.airside.nodes.has(node): return {"ok":false,"message":"Choose a mapped taxi node."}
		if node == from: continue
		var part := sim.airside.route(from,node,sim._aircraft_class(f))
		if part.is_empty(): return {"ok":false,"message":"No legal connected taxi route through %s." % node}
		for leg in part:
			for existing in legs:
				if AirsideNetwork.leg_edge(existing)==AirsideNetwork.leg_edge(leg): return {"ok":false,"message":"Route loops or doubles back. Clear the preview and choose another path."}
			legs.append(leg)
		from = node
	if legs.is_empty(): return {"ok":false,"message":"Already at the route destination."}
	var blocker := sim.airside.start_blocker(legs)
	return {"ok":true,"legs":legs,"message":"%d legs · %.0f seconds%s" % [legs.size(),sim.airside.free_ticks(legs)/10.0," · traffic: "+blocker if not blocker.is_empty() else " · no opposing traffic"],"blocked":not blocker.is_empty()}

static func apply_route(sim: AirportSimulation, flight_id: String, via: Array) -> Dictionary:
	var plan := preview_route(sim,flight_id,via)
	if not plan.ok: return plan
	var f: AirportFlight = sim.airport.flights[flight_id]
	if not f.taxi_hold: return {"ok":false,"message":"Issue Hold at next node before applying a new route."}
	var kept := f.taxi_route.slice(0,f.taxi_leg+1)
	var rest := f.taxi_route.slice(f.taxi_leg+1)
	if f.taxi_state == "moving":
		sim.airside.release_route(rest)
		if not sim.airside.try_start(plan.legs):
			sim.airside.try_start(rest)
			return {"ok":false,"message":"Opposing traffic prevents this route; the original route is retained."}
	f.taxi_route = kept+plan.legs
	f.taxi_free_ticks = sim.airside.free_ticks(f.taxi_route)
	sim.decisions.append({"tick":sim.clock.tick,"type":"tower","command":"route","flight_id":flight_id})
	sim.events.record(sim.clock.tick,"TAXI_REROUTED",flight_id,{"via":via.duplicate(),"legs":plan.legs.duplicate()})
	return {"ok":true,"message":"%s, taxi via %s. Hold remains active; resume when ready." % [f.flight_number,", ".join(via) if not via.is_empty() else "the direct route"]}

static func score(sim: AirportSimulation) -> Dictionary:
	var cleared := 0
	var routed := 0
	var holds := 0
	for d in sim.decisions:
		if d.get("type","")=="tower":
			match d.get("command",""):
				"clear": cleared+=1
				"route": routed+=1
				"hold": holds+=1
	var departed := 0
	var late := 0
	for f: AirportFlight in sim.flight_order:
		if f.status=="departed":
			departed+=1
			late+=maxi(0,f.actual_departure-f.scheduled_departure)
	var rejects := int(sim.config.get("tower_rejections",0))
	return {"clearances":cleared,"routes":routed,"holds":holds,"departed":departed,"late_minutes":late/600.0,"score":maxi(0,100+departed*10-rejects*2-int(late/6000.0))}

static func valid_settings(config: Dictionary) -> bool:
	if config.has("tower_weather") and not config.tower_weather in WEATHER: return false
	if config.has("tower_difficulty") and (not config.tower_difficulty is int or not config.tower_difficulty in [0,1,2]): return false
	if config.has("tower_rejections") and (not config.tower_rejections is int or config.tower_rejections<0): return false
	if config.has("tower_runways"):
		if not config.tower_runways is Dictionary: return false
		for id in config.tower_runways:
			if not id is String or not config.tower_runways[id] is String: return false
	return true

static func route_points(sim: AirportSimulation,leg: String) -> Array[Vector2]:
	var edge: Dictionary=sim.airside.edges[AirsideNetwork.leg_edge(leg)]
	var result: Array[Vector2]=[]
	for p in edge.get("points",[]): result.append(Vector2(p[0],p[1]))
	if result.size()<2: result=[sim.airside.node_position(edge.from),sim.airside.node_position(edge.to)]
	if AirsideNetwork.leg_dir(leg)<0: result.reverse()
	return result
