class_name AirportEvents
extends RefCounted
signal emitted(event: Dictionary)
var history: Array = []

func record(tick: int, type: String, flight_id: String = "", details: Dictionary = {}) -> void:
	var event := {"sequence": history.size(), "tick": tick, "type": type,
		"flight_id": flight_id, "details": details.duplicate(true)}
	history.append(event)
	# Consumers cannot mutate canonical history through the signal.
	emitted.emit(event.duplicate(true))
