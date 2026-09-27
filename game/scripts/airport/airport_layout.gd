class_name AirportLayout
extends RefCounted
## The airport as built (M11): persistent career state. Build objects sit on
## predefined sites (gate pads, terminal pieces, security lane rows, baggage
## module rows, the service yard); the day's simulation never sees them
## directly. apply() turns the layout into normalized infrastructure in the
## day's config (gates, terminal graph, lane and server counts, resource
## maxima), and validate() checks connectivity and the schedule before a day
## may start. Runway, taxiways and the terminal core stay fixed.
##
## Riverdale's original infrastructure is imported as the initial objects, and
## applying an unchanged layout reproduces the scenario's own arrays, so an
## unexpanded day is the pre-M11 day.

const KINDS := ["gate_pad", "terminal", "security", "baggage", "service", "airside"]
## M12 airside object types (no site slots: geometry of their own).
const AIRSIDE_TYPES := ["taxiway", "runway", "legacy_taxiway", "legacy_runway"]
const HEADINGS := {"E": Vector2(1, 0), "W": Vector2(-1, 0), "N": Vector2(0, -1), "S": Vector2(0, 1)}

var base: Dictionary = {}
var catalog: Dictionary = {}
## Site id -> site (configured expansion sites + pads imported from the base gates).
var sites: Dictionary = {}
## Build objects {id, type, site, slot}, in creation order (stable).
var objects: Array = []
var revision: int = 0
var next_id: int = 1
## Ids built in the current planning session (undo refunds in full).
var session_ids: Array = []


## Bind to a base scenario: catalog, configured sites, and one pad per base gate.
func bind(base_config: Dictionary) -> void:
	base = base_config
	var construction: Dictionary = base.get("construction", {})
	catalog = construction.get("catalog", {})
	sites = construction.get("sites", {}).duplicate(true)
	var graph: Dictionary = base.passenger_flow.graph
	for gate in base.gates:
		var edges: Array = []
		for edge in graph.edges:
			if edge.from == gate.id or edge.to == gate.id: edges.append(edge.duplicate())
		sites["pad_" + gate.id] = {"kind": "gate_pad", "pad_class": gate.type, "gate_id": gate.id, "base": true,
			"node": graph.nodes[gate.id].duplicate(), "edges": edges, "gate": gate.duplicate(true)}
	sites["airside"] = {"kind": "airside", "label": "Airside", "slots": 1}


## The scenario's own infrastructure as the first objects.
func import_initial() -> void:
	objects = []
	revision = 0
	next_id = 1
	session_ids = []
	for gate in base.gates: objects.append({"id": "G-" + gate.id, "type": "gate_wide" if gate.type == "wide" else "gate_narrow", "site": "pad_" + gate.id, "slot": 0})
	for cp in base.passenger_flow.checkpoints:
		for i in int(cp.max_lanes): objects.append({"id": "L-%s-%d" % [cp.id, i + 1], "type": "security_lane", "site": "security_" + cp.id, "slot": i})
	for stage in _sorted(base.get("baggage", {}).get("stages", {}).keys()):
		for i in int(base.baggage.stages[stage].servers): objects.append({"id": "M-%s-%d" % [stage, i + 1], "type": _module_type(stage), "site": "baggage_" + stage, "slot": i})
	# M12: the scenario's airside, taxiway by taxiway, and its runways.
	for e in base.get("airside", {}).get("edges", []): objects.append({"id": "AT-" + e.id, "type": "legacy_taxiway", "site": "airside", "slot": 0, "edge": e.id, "direction": 1 if bool(e.get("oneway", false)) else 0})
	for r in base.get("airside", {}).get("runways", []): objects.append({"id": "AR-" + r.id, "type": "legacy_runway", "site": "airside", "slot": 0, "runway": r.id, "status": str(r.get("status", "open"))})
	var slot := 0
	var initial: Dictionary = base.get("construction", {}).get("initial", {}).get("facilities", {})
	for type in _sorted(initial.keys()):
		for i in int(initial[type]):
			objects.append({"id": "F-%s-%d" % [type, i + 1], "type": type, "site": "service_yard", "slot": slot})
			slot += 1


func _module_type(stage: String) -> String:
	for type in _sorted(catalog.keys()):
		if catalog[type].get("stage", "") == stage: return type
	return ""


static func _sorted(keys: Array) -> Array:
	var out := keys.duplicate()
	out.sort()
	return out


# --- queries ------------------------------------------------------------------------

func objects_at(site: String) -> Array:
	return objects.filter(func(o): return o.site == site)


func find(id: String) -> Dictionary:
	for o in objects:
		if o.id == id: return o
	return {}


func count(type: String) -> int:
	return objects.filter(func(o): return o.type == type).size()


func built_gate_ids() -> Array:
	var out: Array = []
	for o in objects:
		if sites.get(o.site, {}).get("kind", "") == "gate_pad": out.append(sites[o.site].gate_id)
	return out


## Units of a resource the built facilities can support.
func resource_max(resource: String) -> int:
	var total := 0
	for o in objects:
		var item: Dictionary = catalog.get(o.type, {})
		if item.get("resource", "") == resource: total += int(item.get("units", 0))
	return total


## Free slots of a site for an item, or the reason it cannot go there.
func placement_error(type: String, site_id: String, slot: int) -> String:
	var item: Dictionary = catalog.get(type, {})
	var site: Dictionary = sites.get(site_id, {})
	if item.is_empty(): return "unknown item"
	if site.is_empty(): return "unknown site"
	if item.get("site_kind", "") != site.kind: return "%s cannot go on a %s site" % [item.label, site.kind.replace("_", " ")]
	if site.kind == "gate_pad" and item.has("pad_class") and site.pad_class != item.pad_class: return "needs a %s pad" % item.pad_class
	if site.kind == "terminal" and site.get("item", "") != type: return "this site is for another terminal piece"
	if site.kind == "baggage" and site.stage != item.get("stage", ""): return "this row is for %s modules" % site.stage.replace("_", " ")
	if slot < 0 or slot >= int(site.get("slots", 1)): return "no such position"
	for o in objects:
		if o.site == site_id and int(o.slot) == slot: return "occupied by " + o.id
	return ""


## The first free slot of a site for an item, or -1.
func free_slot(type: String, site_id: String) -> int:
	for slot in int(sites.get(site_id, {}).get("slots", 1)):
		if placement_error(type, site_id, slot).is_empty(): return slot
	return -1


## Sites an item could be placed on now (sorted).
func candidate_sites(type: String) -> Array:
	var out: Array = []
	for site_id in _sorted(sites.keys()):
		if free_slot(type, site_id) >= 0: out.append(site_id)
	return out


# --- editing ----------------------------------------------------------------------------

func place(type: String, site_id: String, slot: int) -> Dictionary:
	if not placement_error(type, site_id, slot).is_empty(): return {}
	var o := {"id": "B%04d" % next_id, "type": type, "site": site_id, "slot": slot}
	next_id += 1
	objects.append(o)
	session_ids.append(o.id)
	revision += 1
	return o


func remove(id: String) -> bool:
	for i in objects.size():
		if objects[i].id == id:
			objects.remove_at(i)
			session_ids.erase(id)
			revision += 1
			return true
	return false


# --- normalized infrastructure -------------------------------------------------------------

## The day's config with the built airport in place of the scenario's fixed
## infrastructure. Unchanged layout → the scenario's own arrays.
func apply(config: Dictionary) -> Dictionary:
	var c := config.duplicate(true)
	var built := built_gate_ids()
	var gates: Array = []
	for gate in c.gates:
		if gate.id in built: gates.append(gate)
	var nodes: Dictionary = {}
	var graph: Dictionary = c.passenger_flow.graph
	var base_gates: Array = c.gates.map(func(g): return g.id)
	for node in graph.nodes:
		if not node in base_gates or node in built: nodes[node] = graph.nodes[node]
	var extra_edges: Array = []
	# Terminal pieces, then new gates, in site order.
	for site_id in _sorted(sites.keys()):
		var site: Dictionary = sites[site_id]
		if site.kind != "terminal" or objects_at(site_id).is_empty(): continue
		for node in _sorted(site.get("nodes", {}).keys()): nodes[node] = site.nodes[node]
		extra_edges.append_array(site.get("edges", []))
	for site_id in _sorted(sites.keys()):
		var site: Dictionary = sites[site_id]
		if site.kind != "gate_pad" or site.get("base", false): continue
		var here := objects_at(site_id)
		if here.is_empty(): continue
		var item: Dictionary = catalog[here[0].type]
		gates.append({"id": site.gate_id, "type": item.gate.type, "supported_aircraft_classes": item.gate.supported_aircraft_classes.duplicate()})
		nodes[site.gate_id] = site.node
		extra_edges.append_array(site.get("edges", []))
	var edges: Array = []
	for edge in graph.edges + extra_edges:
		if nodes.has(edge.from) and nodes.has(edge.to): edges.append(edge)
	c.gates = gates
	graph.nodes = nodes
	graph.edges = edges
	graph["layout_revision"] = revision
	# Only changed values are written, so an unchanged layout is the scenario itself.
	for cp in c.passenger_flow.checkpoints:
		var lanes := objects_at("security_" + cp.id).size()
		if int(cp.max_lanes) != lanes: cp.max_lanes = lanes
		if int(cp.open_lanes) > lanes: cp.open_lanes = lanes
		if int(cp.staff) > lanes: cp.staff = lanes
	for stage in c.get("baggage", {}).get("stages", {}):
		var servers := objects_at("baggage_" + stage).size()
		if int(c.baggage.stages[stage].servers) != servers: c.baggage.stages[stage].servers = servers
	c["layout_revision"] = revision
	if c.has("airside"): c.airside = apply_airside(c.airside)
	return c


## The airside as built: legacy pieces still standing (with any direction
## change), pad stand links for built pads, built taxiways and runways.
func apply_airside(airside: Dictionary) -> Dictionary:
	var a := airside.duplicate(true)
	var legacy := {}
	for e in a.edges: legacy[e.id] = e
	var edges: Array = []
	var runways: Array = []
	for o in objects:
		match o.type:
			"legacy_taxiway":
				var e: Dictionary = legacy[o.edge].duplicate()
				_direct(e, int(o.get("direction", 0)))
				edges.append(e)
			"legacy_runway":
				for r in a.runways:
					if r.id == o.runway:
						var built: Dictionary = r.duplicate()
						built.status = str(o.get("status", "open"))
						runways.append(built)
	for site_id in _sorted(sites.keys()):
		var site: Dictionary = sites[site_id]
		if site.kind != "gate_pad" or site.get("base", false) or objects_at(site_id).is_empty() or not site.has("stand"): continue
		a.nodes[site.stand.node] = {"x": site.stand.x, "y": site.stand.y, "kind": "stand", "label": site.gate_id}
		a.stands[site.gate_id] = site.stand.node
		for spec in site.get("airside_edges", []):
			var e: Dictionary = spec.duplicate()
			e["length_m"] = maxi(1, roundi(_pos(a, e.from).distance_to(_pos(a, e.to))))
			if not e.has("classes"): e["classes"] = ["narrow", "wide"]
			edges.append(e)
	for o in objects:
		match o.type:
			"taxiway":
				for end in [o.from, o.to]: _ensure_anchor(a, end)
				var e := {"id": o.id, "from": o.from, "to": o.to, "length_m": maxi(1, roundi(_pos(a, o.from).distance_to(_pos(a, o.to)))),
					"oneway": false, "classes": ["narrow", "wide"], "kind": "taxiway"}
				_direct(e, int(o.get("direction", 0)))
				edges.append(e)
			"runway":
				var geometry := runway_geometry(o)
				a.nodes[o.id + "_A"] = {"x": geometry[0].x, "y": geometry[0].y, "kind": "runway_end", "label": o.id + " " + str(o.heading)}
				a.nodes[o.id + "_B"] = {"x": geometry[1].x, "y": geometry[1].y, "kind": "runway_end", "label": o.id}
				runways.append({"id": o.id, "label": "%s (%d m)" % [o.id, int(o.length_m)], "a": o.id + "_A", "b": o.id + "_B", "length_m": int(o.length_m), "status": str(o.get("status", "open"))})
	a.edges = edges
	a.runways = runways
	return a


## One-way from→to (1), to→from (-1), or two-way (0).
static func _direct(e: Dictionary, direction: int) -> void:
	if direction == 0:
		e.oneway = false
		return
	e.oneway = true
	if direction < 0:
		var from = e.from
		if e.has("points"):
			e.points = e.points.duplicate()
			e.points.reverse()
		e.from = e.to
		e.to = from


static func _pos(a: Dictionary, node: String) -> Vector2:
	if a.nodes.has(node): return Vector2(float(a.nodes[node].x), float(a.nodes[node].y))
	var anchor := anchor_position(node)
	return anchor


## Grid anchors are named "G_x_y" (metres).
static func anchor_position(id: String) -> Vector2:
	var parts := id.split("_")
	if parts.size() != 3 or parts[0] != "G": return Vector2(INF, INF)
	return Vector2(float(parts[1]), float(parts[2]))


static func anchor_id(p: Vector2) -> String:
	return "G_%d_%d" % [roundi(p.x), roundi(p.y)]


func _ensure_anchor(a: Dictionary, node: String) -> void:
	if a.nodes.has(node): return
	var p := anchor_position(node)
	a.nodes[node] = {"x": roundi(p.x), "y": roundi(p.y), "kind": "taxi"}


func runway_geometry(o: Dictionary) -> Array:
	var start := anchor_position(o.start)
	return [start, start + HEADINGS[o.heading] * float(o.length_m)]


# --- airside placement (M12) ------------------------------------------------------------

## The airside as it currently stands (applied to the base definition).
func current_airside() -> Dictionary:
	return apply_airside(base.airside)


func _in_zones(p: Vector2) -> bool:
	var airside: Dictionary = base.get("airside", {})
	var t: Dictionary = airside.get("terminal_zone", {})
	if not t.is_empty() and p.x >= float(t.x0) and p.x <= float(t.x1) and p.y >= float(t.y0) and p.y <= float(t.y1): return false
	for z in airside.get("zones", []):
		if p.x >= float(z.x0) and p.x <= float(z.x1) and p.y >= float(z.y0) and p.y <= float(z.y1): return true
	return false


## A point is usable as a taxiway end: an existing node, or a free grid anchor.
func _point_error(a: Dictionary, node: String) -> String:
	if a.nodes.has(node):
		if str(a.nodes[node].get("kind", "")) == "stand": return "stands are reached through their own links"
		return ""
	var p := anchor_position(node)
	if p.x == INF: return "not a valid point"
	var grid := float(base.airside.get("grid_m", 300))
	if fmod(p.x, grid) != 0.0 or fmod(p.y, grid) != 0.0: return "not on the construction grid"
	if not _in_zones(p): return "outside the airside construction area"
	for id in a.nodes:
		if _pos(a, id).distance_to(p) < 60.0: return "too close to %s: connect to it instead" % id
	return ""


static func _segments_cross(p1: Vector2, p2: Vector2, q1: Vector2, q2: Vector2) -> bool:
	var d := (p2 - p1).cross(q2 - q1)
	if absf(d) < 0.0001: return false
	var t := (q1 - p1).cross(q2 - q1) / d
	var u := (q1 - p1).cross(p2 - p1) / d
	return t > 0.0001 and t < 0.9999 and u > 0.0001 and u < 0.9999


static func _segment_hits_rect(p1: Vector2, p2: Vector2, t: Dictionary) -> bool:
	if t.is_empty(): return false
	var r := Rect2(Vector2(float(t.x0), float(t.y0)), Vector2(float(t.x1) - float(t.x0), float(t.y1) - float(t.y0)))
	for i in 21:
		if r.has_point(p1.lerp(p2, i / 20.0)): return true
	return false


## Why a taxiway between two points cannot be built ("" if it can).
func taxiway_error(from: String, to: String) -> String:
	if from == to: return "pick two different points"
	var a := current_airside()
	for end in [from, to]:
		var reason := _point_error(a, end)
		if not reason.is_empty(): return "%s: %s" % [end, reason]
	if not a.nodes.has(from) and not a.nodes.has(to): return "a taxiway must connect to the existing network"
	var p1 := _pos(a, from)
	var p2 := _pos(a, to)
	if _segment_hits_rect(p1, p2, base.airside.get("terminal_zone", {})): return "it would run through the terminal"
	for id in a.nodes:
		if id == from or id == to: continue
		var q := _pos(a, id)
		if Geometry2D.get_closest_point_to_segment(q, p1, p2).distance_to(q) < 1.0: return "it would pass through %s: end it there instead" % id
	for e in a.edges:
		if (e.from == from and e.to == to) or (e.from == to and e.to == from): return "already connected"
		if e.from in [from, to] or e.to in [from, to]: continue
		if _segments_cross(p1, p2, _pos(a, e.from), _pos(a, e.to)): return "it would cross %s without a junction" % e.id
	for r in a.runways:
		var ra := _pos(a, r.a)
		var rb := _pos(a, r.b)
		if from in [r.a, r.b] or to in [r.a, r.b]: continue
		if _segments_cross(p1, p2, ra, rb): return "taxiways may not cross runway %s (use its ends)" % r.id
	return ""


## Why a runway cannot be built ("" if it can).
func runway_error(start: String, heading: String, length_m: int) -> String:
	if not HEADINGS.has(heading): return "unknown heading"
	if not int(length_m) in runway_lengths(): return "choose one of the offered lengths"
	var a := current_airside()
	var p1 := anchor_position(start)
	if p1.x == INF or a.nodes.has(start): return "a runway starts on a free grid point"
	var p2: Vector2 = p1 + HEADINGS[heading] * float(length_m)
	for p in [p1, p2]:
		if not _in_zones(p): return "the runway would leave the construction area"
	for e in a.edges:
		if _segments_cross(p1, p2, _pos(a, e.from), _pos(a, e.to)): return "it would cross taxiway %s" % e.id
	for id in a.nodes:
		var q := _pos(a, id)
		if Geometry2D.get_closest_point_to_segment(q, p1, p2).distance_to(q) < 150.0: return "too close to %s" % id
	for r in a.runways:
		var ra := _pos(a, r.a)
		var rb := _pos(a, r.b)
		if _segments_cross(p1, p2, ra, rb): return "it would cross runway " + r.id
		for q in [ra, rb, (ra + rb) / 2.0]:
			if Geometry2D.get_closest_point_to_segment(q, p1, p2).distance_to(q) < 300.0: return "keep 300 m from runway " + r.id
	return ""


## Offered runway lengths as ints (JSON numbers load as floats).
func runway_lengths() -> Array:
	return catalog.get("runway", {}).get("lengths_m", []).map(func(m): return int(m))


func taxiway_cost(from: String, to: String) -> int:
	var a := current_airside()
	return roundi(_pos(a, from).distance_to(_pos(a, to))) * int(catalog.taxiway.get("cost_per_m_cents", 0))


func runway_cost(length_m: int) -> int:
	return int(length_m) * int(catalog.runway.get("cost_per_m_cents", 0))


## Capital value of any object (for refunds).
func object_cost(o: Dictionary) -> int:
	match o.type:
		"taxiway":
			var a := current_airside()
			return roundi(_pos(a, o.from).distance_to(_pos(a, o.to))) * int(catalog.taxiway.get("cost_per_m_cents", 0))
		"runway": return runway_cost(int(o.length_m))
		"legacy_taxiway", "legacy_runway": pass
		"legacy_taxiway":
			for e in base.airside.edges:
				if e.id == o.edge: return int(e.length_m) * int(catalog.legacy_taxiway.get("cost_per_m_cents", 0))
		"legacy_runway":
			for r in base.airside.runways:
				if r.id == o.runway: return int(r.length_m) * int(catalog.legacy_runway.get("cost_per_m_cents", 0))
	return int(catalog.get(o.type, {}).get("cost_cents", 0))


func next_runway_id() -> String:
	var used := {}
	for r in current_airside().runways: used[r.id] = true
	var n := 2
	while used.has("R%d" % n): n += 1
	return "R%d" % n


func place_airside(fields: Dictionary) -> Dictionary:
	var o := fields.duplicate()
	if o.type == "runway": o["id"] = next_runway_id()
	else:
		o["id"] = "B%04d" % next_id
		next_id += 1
	o["site"] = "airside"
	o["slot"] = 0
	objects.append(o)
	session_ids.append(o.id)
	revision += 1
	return o


## Change a built taxiway's direction or a runway's status (between days).
func set_field(id: String, field: String, value) -> bool:
	for o in objects:
		if o.id == id:
			o[field] = value
			revision += 1
			return true
	return false


## Everything that stops a day from starting, in plain words (never repaired).
## Also assigns gates: a flight keeps its gate if it is built, compatible and
## free for its window; otherwise it gets the first compatible free gate.
func validate(config: Dictionary) -> Array:
	var errors: Array = []
	var graph := TerminalGraph.new()
	graph.setup(config.passenger_flow.graph)
	var flow: Dictionary = config.passenger_flow
	var entrance := "entrance"
	var exit_node: String = flow.get("exit_node", "airport_exit")
	if graph.route(entrance, "check_in").is_empty(): errors.append("The entrance has no path to check-in.")
	var securities: Array = []
	for cp in flow.checkpoints:
		if int(cp.max_lanes) < 1: errors.append("%s security has no lanes." % str(cp.id).capitalize())
		elif graph.route("check_in", cp.node_id).is_empty(): errors.append("%s security cannot be reached from check-in." % str(cp.id).capitalize())
		else: securities.append(cp.node_id)
	for stage in config.get("baggage", {}).get("stages", {}):
		if int(config.baggage.stages[stage].servers) < 1: errors.append("No %s capacity is built." % stage.replace("_", " "))
	for gate in config.gates:
		var reachable := false
		for node in securities:
			if not graph.route(node, gate.id, true).is_empty(): reachable = true
		if not reachable: errors.append("Gate %s has no passenger path from security." % gate.id)
		elif graph.route(gate.id, flow.get("reclaim_node", "baggage_reclaim")).is_empty() or graph.route(gate.id, exit_node).is_empty():
			errors.append("Gate %s has no path for arriving passengers to reclaim and the exit." % gate.id)
	errors.append_array(assign_gates(config))
	if config.has("airside"): errors.append_array(validate_airside(config))
	return errors


## M12: every gate reaches an open runway and back, every open runway is
## connected, and every flight's aircraft has a long-enough runway it can use.
static func validate_airside(config: Dictionary) -> Array:
	var errors: Array = []
	var net := AirsideNetwork.new()
	net.setup(config.airside)
	var stands: Dictionary = config.airside.get("stands", {})
	var open: Array = net.runways().filter(func(r): return str(r.get("status", "open")) == "open")
	for r in open:
		var reached := false
		for gate in stands:
			if not net.route(r.b, stands[gate], "narrow").is_empty() or not net.route(stands[gate], r.a, "narrow").is_empty(): reached = true
		if not reached: errors.append("Runway %s is not connected to the taxi network." % r.id)
	for gate in config.gates:
		var stand := str(stands.get(gate.id, ""))
		if stand.is_empty() or not net.nodes.has(stand):
			errors.append("Gate %s has no airside stand." % gate.id)
			continue
		var klass: String = "wide" if "wide" in gate.supported_aircraft_classes else "narrow"
		var ok := false
		for r in open:
			if not net.route(r.b, stand, "narrow").is_empty() and not net.route(stand, r.a, "narrow").is_empty(): ok = true
		if not ok: errors.append("Gate %s has no taxi route to and from an operational runway." % gate.id)
	var types := {}
	for f in config.flights: types[f.aircraft_type] = true
	for f in config.flights:
		var stand := str(stands.get(str(f.get("assigned_gate_id", "")), ""))
		if stand.is_empty(): continue
		var klass: String = config.aircraft_types[f.aircraft_type].get("class", "narrow")
		var ok := false
		for r in open:
			if net.runway_serves(r, f.aircraft_type) and not net.route(r.b, stand, klass).is_empty() and not net.route(stand, r.a, klass).is_empty(): ok = true
		if not ok:
			errors.append("%s (%s) has no open runway long enough (needs %d m) that it can reach." % [f.flight_number, f.aircraft_type, int(config.airside.get("min_runway_length_m", {}).get(f.aircraft_type, 0))])
	return errors


## Deterministic gate assignment for the day's schedule (see validate()).
## A flight keeps its configured gate whenever that gate is built and
## compatible: that is the airport's plan, and a short wait behind a late
## predecessor is an operational matter (M1 gate conflicts). A flight without
## one (an open request slot, or a demolished gate) gets the first compatible
## gate, in gate order, whose scheduled use (with the gate buffer) doesn't
## overlap its own; otherwise it has no gate and the day cannot start.
static func assign_gates(config: Dictionary) -> Array:
	var errors: Array = []
	var taxi := int(config.taxi_in_ticks)
	var buffer := int(config.gate_buffer_ticks)
	var classes := {}
	for type in config.aircraft_types: classes[type] = config.aircraft_types[type].get("class", "")
	var gates: Array = config.gates
	var by_id := {}
	var busy := {}
	for gate in gates:
		by_id[gate.id] = gate
		busy[gate.id] = []
	var order: Array = config.flights.duplicate()
	order.sort_custom(func(a, b): return int(a.scheduled_arrival) < int(b.scheduled_arrival) or (int(a.scheduled_arrival) == int(b.scheduled_arrival) and a.id < b.id))
	var compatible := func(gate: Dictionary, f: Dictionary) -> bool: return classes.get(f.aircraft_type, "") in gate.supported_aircraft_classes
	var unplaced: Array = []
	for f in order:
		var gate_id := str(f.get("assigned_gate_id", ""))
		if by_id.has(gate_id) and compatible.call(by_id[gate_id], f):
			busy[gate_id].append([int(f.scheduled_arrival) + taxi, int(f.scheduled_departure)])
		else: unplaced.append(f)
	# M13: widebodies first (they have the fewest gates), and every flight takes
	# the least capable gate that fits, so narrowbodies do not use up the
	# widebody gates a 787 needs. Stable: then arrival, then id; gates in order.
	var is_wide := func(f: Dictionary) -> bool: return classes.get(f.aircraft_type, "") == "wide"
	unplaced.sort_custom(func(a, b):
		if is_wide.call(a) != is_wide.call(b): return is_wide.call(a)
		return int(a.scheduled_arrival) < int(b.scheduled_arrival) or (int(a.scheduled_arrival) == int(b.scheduled_arrival) and a.id < b.id))
	var by_capability: Array = gates.filter(func(g): return not "wide" in g.supported_aircraft_classes) + gates.filter(func(g): return "wide" in g.supported_aircraft_classes)
	for f in unplaced:
		var start := int(f.scheduled_arrival) + taxi
		var chosen := ""
		for gate in by_capability:
			if not compatible.call(gate, f): continue
			var clear := true
			for window in busy[gate.id]:
				if start < int(window[1]) + buffer and int(window[0]) - buffer < int(f.scheduled_departure): clear = false
			if clear:
				chosen = gate.id
				break
		if chosen.is_empty():
			errors.append("%s has no compatible available gate (%s)." % [f.flight_number, "widebody" if classes.get(f.aircraft_type, "") == "wide" else "narrowbody"])
			continue
		f.assigned_gate_id = chosen
		busy[chosen].append([start, int(f.scheduled_departure)])
	return errors


## Built capacity at a glance.
func metrics() -> Dictionary:
	var gates := {"narrow": 0, "wide": 0}
	var lanes := {}
	var modules := {}
	for o in objects:
		var site: Dictionary = sites[o.site]
		match site.kind:
			"gate_pad": gates[catalog[o.type].gate.type] += 1
			"security": lanes[site.checkpoint] = int(lanes.get(site.checkpoint, 0)) + 1
			"baggage": modules[site.stage] = int(modules.get(site.stage, 0)) + 1
	var maxima := {}
	for type in _sorted(base.get("resources", {}).keys()): maxima[type] = resource_max(type)
	return {"objects": objects.size(), "gates": gates, "lanes": lanes, "modules": modules, "resource_max": maxima,
		"terminal": objects.filter(func(o): return sites[o.site].kind == "terminal").map(func(o): return o.type)}


# --- persistence --------------------------------------------------------------------------

func snapshot() -> Dictionary:
	return {"objects": objects.duplicate(true), "revision": revision, "next_id": next_id, "session_ids": session_ids.duplicate()}


func restore(data: Dictionary) -> void:
	objects = data.objects.duplicate(true)
	revision = int(data.revision)
	next_id = int(data.next_id)
	session_ids = data.session_ids.duplicate()


## Structure: unique ids, known items on compatible sites and slots, one object
## per slot, ids consistent with the counter, a sane revision.
func valid_structure() -> bool:
	var ids := {}
	var taken := {}
	for o in objects:
		if not o is Dictionary or not o.get("id") is String or ids.has(o.id): return false
		if o.get("type", "") in AIRSIDE_TYPES:
			if o.get("site") != "airside" or not _valid_airside_object(o): return false
			ids[o.id] = true
			continue
		if not catalog.has(o.get("type", "")) or not sites.has(o.get("site", "")) or not o.get("slot") is int: return false
		var key := "%s#%d" % [o.site, o.slot]
		if taken.has(key): return false
		taken[key] = true
		ids[o.id] = true
		# Check the item/site rules without the slot-occupied rule.
		var reason := _rules_error(o.type, o.site, int(o.slot))
		if not reason.is_empty(): return false
		if o.id.begins_with("B") and int(o.id.substr(1)) >= next_id: return false
	for id in session_ids:
		if not ids.has(id): return false
	# M12: the airside these objects make is itself well formed.
	if base.has("airside") and not AirsideNetwork.valid_definition(current_airside()): return false
	return revision >= 0


func _rules_error(type: String, site_id: String, slot: int) -> String:
	var saved := objects
	objects = []
	var reason := placement_error(type, site_id, slot)
	objects = saved
	return reason



func _valid_airside_object(o: Dictionary) -> bool:
	match o.type:
		"legacy_taxiway":
			return base.airside.edges.any(func(e): return e.id == o.get("edge", "")) and int(o.get("direction", 0)) in [-1, 0, 1]
		"legacy_runway":
			return base.airside.runways.any(func(r): return r.id == o.get("runway", "")) and o.get("status", "") in ["open", "closed"]
		"taxiway":
			return o.get("from") is String and o.get("to") is String and o.from != o.to and int(o.get("direction", 0)) in [-1, 0, 1] and str(o.id).begins_with("B") and int(str(o.id).substr(1)) < next_id
		"runway":
			return str(o.id).begins_with("R") and HEADINGS.has(o.get("heading", "")) and int(o.get("length_m", 0)) in runway_lengths() \
				and anchor_position(str(o.get("start", ""))).x != INF and o.get("status", "") in ["open", "closed"]
	return false
