class_name AirsideNetwork
extends RefCounted
## The aircraft movement network (M12): one graph, built once per day from
## `config.airside`, is the only thing aircraft move on. Nodes are points in
## metres; edges have a length, an optional one-way direction, the aircraft
## classes they carry and a kind (taxiway, stand, runway entry/exit). Runways
## are separate resources whose end nodes are the only way on or off them.
##
## Occupancy is deliberately small and deterministic:
##   same direction   FIFO per edge: an entry at least `headway` after the last
##                    entry, and an exit never before the leader's exit + headway
##                    (followers queue, nobody passes);
##   intersections    entering from a node reserves it for `node_ticks`;
##   opposing traffic an aircraft locks the direction of every two-way edge on
##                    its whole route before it moves (or waits where it is).
## Once moving, an aircraft only ever waits for same-direction leaders or a
## node crossing, both of which clear, so movement cannot deadlock.

var config: Dictionary = {}
var revision: int = 0
var nodes: Dictionary = {}
## Edge id -> {id, from, to, length_m, oneway, classes, kind, ticks}.
var edges: Dictionary = {}
## Node id -> [[edge id, +1/-1 direction, neighbour]] sorted (stable).
var _out: Dictionary = {}
var speed_mps: float = 10.0
var headway_ticks: int = 150
var node_ticks: int = 50
## Occupancy (saved): edge id -> {"last_entry", "last_exit", "lock_dir", "locks",
## "occupants" (front first), "last_who" (the last to enter, for "X ahead"),
## "wait_ticks" (aircraft-ticks spent waiting to use or leave it: M13 summary)};
## node id -> busy-until tick.
var edge_state: Dictionary = {}
var node_busy: Dictionary = {}
var _routes: Dictionary = {}
var _routes_revision: int = 0


func setup(data: Dictionary) -> void:
	config = data.duplicate(true)
	revision = int(config.get("layout_revision", 0))
	speed_mps = float(config.get("taxi_speed_mps", 10.0))
	headway_ticks = int(config.get("headway_ticks", 150))
	node_ticks = int(config.get("node_ticks", 50))
	nodes = config.get("nodes", {})
	edges = {}
	_out = {}
	for id in nodes: _out[id] = []
	for e in config.get("edges", []):
		var edge: Dictionary = e.duplicate()
		edge["ticks"] = maxi(1, ceili(float(edge.length_m) / speed_mps * 10.0))
		edges[edge.id] = edge
		_out[edge.from].append([edge.id, 1, edge.to])
		if not bool(edge.get("oneway", false)): _out[edge.to].append([edge.id, -1, edge.from])
	for id in _out: _out[id].sort_custom(func(a, b): return a[0] < b[0] or (a[0] == b[0] and a[1] > b[1]))
	edge_state = {}
	for id in edges: edge_state[id] = {"last_entry": -1073741824, "last_exit": -1073741824, "lock_dir": 0, "locks": 0, "occupants": [], "last_who": "", "wait_ticks": 0}
	node_busy = {}
	_routes = {}
	_routes_revision = revision


func enabled() -> bool:
	return not nodes.is_empty()


func runways() -> Array:
	return config.get("runways", [])


func runway(id: String) -> Dictionary:
	for r in runways():
		if r.id == id: return r
	return {}


## Aircraft class a runway can serve: its length against the type's minimum.
func runway_serves(r: Dictionary, aircraft_type: String) -> bool:
	return str(r.get("status", "open")) == "open" and float(r.length_m) >= float(config.get("min_runway_length_m", {}).get(aircraft_type, 0))


# --- routing ------------------------------------------------------------------------

## Deterministic shortest route (free-flow time) as legs "edge:+1" / "edge:-1".
## Empty when there is none. Cached for this layout revision only.
func route(from: String, to: String, aircraft_class: String) -> Array:
	if _routes_revision != revision:
		_routes = {}
		_routes_revision = revision
	var key := "%s>%s>%s" % [from, to, aircraft_class]
	if not _routes.has(key): _routes[key] = _find(from, to, aircraft_class)
	return _routes[key].duplicate()


func _find(from: String, to: String, aircraft_class: String) -> Array:
	if not nodes.has(from) or not nodes.has(to): return []
	var distance := {from: 0}
	var previous := {}
	var pending: Array = [from]
	while not pending.is_empty():
		pending.sort_custom(func(a, b): return distance[a] < distance[b] or (distance[a] == distance[b] and a < b))
		var current: String = pending.pop_front()
		if current == to:
			var legs: Array = []
			var node := to
			while node != from:
				var step: Array = previous[node]
				legs.push_front("%s:%d" % [step[0], step[1]])
				node = step[2]
			return legs
		# Stands are ends, never a way through (another aircraft may be parked there).
		if current != from and str(nodes[current].get("kind", "")) == "stand": continue
		for link in _out[current]:
			var edge: Dictionary = edges[link[0]]
			if not aircraft_class in edge.get("classes", ["narrow", "wide"]): continue
			var next: String = link[2]
			var candidate: int = int(distance[current]) + int(edge.ticks)
			if candidate < int(distance.get(next, 1 << 60)):
				distance[next] = candidate
				previous[next] = [link[0], link[1], current]
				if not next in pending: pending.append(next)
	return []


func free_ticks(legs: Array) -> int:
	var total := 0
	for leg in legs: total += int(edges[leg_edge(leg)].ticks)
	return total


static func leg_edge(leg: String) -> String:
	return leg.get_slice(":", 0)


static func leg_dir(leg: String) -> int:
	return int(leg.get_slice(":", 1))


func leg_from(leg: String) -> String:
	var e: Dictionary = edges[leg_edge(leg)]
	return e.from if leg_dir(leg) > 0 else e.to


func leg_to(leg: String) -> String:
	var e: Dictionary = edges[leg_edge(leg)]
	return e.to if leg_dir(leg) > 0 else e.from


# --- occupancy ------------------------------------------------------------------------

## Can an aircraft start this route now (every two-way edge free or already
## locked in its direction)? Locks them if so.
func try_start(legs: Array) -> bool:
	for leg in legs:
		var e: Dictionary = edges[leg_edge(leg)]
		if bool(e.get("oneway", false)): continue
		var s: Dictionary = edge_state[e.id]
		if int(s.locks) > 0 and int(s.lock_dir) != leg_dir(leg): return false
	for leg in legs:
		var e: Dictionary = edges[leg_edge(leg)]
		if bool(e.get("oneway", false)): continue
		var s: Dictionary = edge_state[e.id]
		s.lock_dir = leg_dir(leg)
		s.locks = int(s.locks) + 1
	return true


## Why the route cannot start (the first two-way edge locked the other way).
func start_blocker(legs: Array) -> String:
	for leg in legs:
		var e: Dictionary = edges[leg_edge(leg)]
		if bool(e.get("oneway", false)): continue
		var s: Dictionary = edge_state[e.id]
		if int(s.locks) > 0 and int(s.lock_dir) != leg_dir(leg): return e.id
	return ""


## Enter a leg at `now`: the exit tick, or -1 if the aircraft must wait (the
## node is being crossed, or the leader entered less than a headway ago).
func try_enter(leg: String, now: int, who := "") -> int:
	var e: Dictionary = edges[leg_edge(leg)]
	var s: Dictionary = edge_state[e.id]
	var node := leg_from(leg)
	if int(node_busy.get(node, -1)) > now: return -1
	if now < int(s.last_entry) + headway_ticks: return -1
	var exit_tick := maxi(now + int(e.ticks), int(s.last_exit) + headway_ticks)
	s.last_entry = now
	s.last_exit = exit_tick
	node_busy[node] = now + node_ticks
	if not who.is_empty():
		s.occupants.append(who)
		s.last_who = who
	return exit_tick


## Nobody passes: an aircraft may leave an edge only when it is at the front.
func is_front(leg: String, who: String) -> bool:
	var occupants: Array = edge_state[leg_edge(leg)].occupants
	return occupants.is_empty() or occupants[0] == who


func front(leg: String) -> String:
	var occupants: Array = edge_state[leg_edge(leg)].occupants
	return "" if occupants.is_empty() else str(occupants[0])


## Why entering waits: "intersection" or "taxiway".
func enter_blocker(leg: String, now: int) -> String:
	if int(node_busy.get(leg_from(leg), -1)) > now: return "intersection"
	return "taxiway"


## The aircraft has left a leg: its two-way lock is released.
func leave(leg: String, who := "") -> void:
	var e: Dictionary = edges[leg_edge(leg)]
	var s: Dictionary = edge_state[e.id]
	if not who.is_empty(): s.occupants.erase(who)
	if bool(e.get("oneway", false)): return
	s.locks = maxi(0, int(s.locks) - 1)
	if int(s.locks) == 0: s.lock_dir = 0


## Release the locks of legs never travelled (a route abandoned before starting).
func release_route(legs: Array) -> void:
	for leg in legs: leave(leg)


# --- geometry -----------------------------------------------------------------------

func node_position(id: String) -> Vector2:
	var n: Dictionary = nodes.get(id, {"x": 0, "y": 0})
	return Vector2(float(n.x), float(n.y))


## World position of an aircraft on a leg at `now` (entered at `enter`, leaves at `exit`).
func position_on(leg: String, enter: int, exit_tick: int, now: int) -> Vector2:
	var a := node_position(leg_from(leg))
	var b := node_position(leg_to(leg))
	var t := 1.0 if exit_tick <= enter else clampf(float(now - enter) / float(exit_tick - enter), 0.0, 1.0)
	return a.lerp(b, t)


# --- persistence ----------------------------------------------------------------------

func snapshot() -> Dictionary:
	return {"edge_state": edge_state.duplicate(true), "node_busy": node_busy.duplicate()}


func restore(data: Dictionary) -> void:
	for id in data.edge_state: edge_state[id] = data.edge_state[id].duplicate()
	node_busy = data.node_busy.duplicate()


## Structure of an airside definition: edges reference nodes, ids unique,
## runways reference nodes. (Occupancy is cross-checked by the simulation.)
static func valid_definition(airside: Dictionary) -> bool:
	if not airside.get("nodes") is Dictionary or not airside.get("edges") is Array or not airside.get("runways") is Array: return false
	var ids := {}
	for e in airside.edges:
		if not e is Dictionary or not e.get("id") is String or ids.has(e.id): return false
		if not airside.nodes.has(e.get("from", "")) or not airside.nodes.has(e.get("to", "")) or float(e.get("length_m", 0)) <= 0: return false
		ids[e.id] = true
	var runway_ids := {}
	for r in airside.runways:
		if not r is Dictionary or runway_ids.has(r.get("id", "")) or not airside.nodes.has(r.get("a", "")) or not airside.nodes.has(r.get("b", "")): return false
		runway_ids[r.id] = true
	return true
