class_name TerminalGraph
extends RefCounted
## Weighted, directed navigation independent of rendered geometry.
var nodes: Dictionary = {}
var edges: Dictionary = {}

func setup(data: Dictionary) -> void:
	nodes = data.get("nodes", {}).duplicate(true)
	edges = {}
	for id in nodes: edges[id] = []
	for edge in data.get("edges", []):
		edges[edge.from].append({"to": edge.to, "ticks": int(edge.walking_ticks)})
		if edge.get("bidirectional", true):
			edges[edge.to].append({"to": edge.from, "ticks": int(edge.walking_ticks)})

func route(start: String, goal: String, airside_only: bool = false) -> Array:
	if not nodes.has(start) or not nodes.has(goal): return []
	var distance := {start: 0}
	var previous := {}
	var pending: Array = [start]
	while not pending.is_empty():
		# Stable lexical tie-break, independent of JSON dictionary insertion order.
		pending.sort_custom(func(a, b): return distance[a] < distance[b] or (distance[a] == distance[b] and a < b))
		var current: String = pending.pop_front()
		if current == goal:
			var result: Array = [goal]
			while result[0] != start: result.push_front(previous[result[0]])
			return result
		for edge in edges[current]:
			if airside_only and not nodes[edge.to].get("airside", false): continue
			var candidate: int = int(distance[current]) + int(edge.ticks)
			if candidate < int(distance.get(edge.to, 2147483647)):
				distance[edge.to] = candidate
				previous[edge.to] = current
				if not edge.to in pending: pending.append(edge.to)
	return []

func edge_ticks(from: String, to: String, speed: int = 1000) -> int:
	for edge in edges.get(from, []):
		if edge.to == to:
			return maxi(1, (int(edge.ticks) * 1000 + speed - 1) / speed)
	return -1

func route_ticks(path: Array, speed: int = 1000) -> int:
	var total := 0
	for i in range(1, path.size()): total += edge_ticks(path[i - 1], path[i], speed)
	return total
