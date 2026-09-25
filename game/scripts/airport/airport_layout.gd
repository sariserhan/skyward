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

const KINDS := ["gate_pad", "terminal", "security", "baggage", "service"]

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
	return c


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
	for f in unplaced:
		var start := int(f.scheduled_arrival) + taxi
		var chosen := ""
		for gate in gates:
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
	return revision >= 0


func _rules_error(type: String, site_id: String, slot: int) -> String:
	var saved := objects
	objects = []
	var reason := placement_error(type, site_id, slot)
	objects = saved
	return reason
