class_name AirportState
extends RefCounted

var id: String = "riverdale"
var name: String = "Riverdale International"
var money: int = 1800000
var reputation: int = 50
var gates: Dictionary = {}
var aircraft: Dictionary = {}
var flights: Dictionary = {}
# Passengers are the same canonical class used by the boarding engine.
var passengers: Dictionary = {}
var bags: Dictionary = {}
var security_checkpoints: Dictionary = {}
var airlines: Dictionary = {}
var resources: Dictionary = {}
## Runway id -> AirportRunway (M12: several may be built).
var runways: Dictionary = {}
var turnaround_tasks: Dictionary = {}

func to_dict() -> Dictionary:
	var result := {"id": id, "name": name, "money": money, "reputation": reputation,
		"airlines": airlines.duplicate(true), "resources": resources.duplicate(true),
		"runways": {}}
	for key in runways: result.runways[key] = runways[key].to_dict()
	for registry in ["gates", "aircraft", "flights", "passengers", "bags", "security_checkpoints", "turnaround_tasks"]:
		result[registry] = {}
		for key in get(registry):
			result[registry][key] = get(registry)[key].snapshot() if registry == "passengers" else get(registry)[key].to_dict()
	return result

func restore(data: Dictionary) -> void:
	id = data.id
	name = data.name
	money = int(data.money)
	reputation = int(data.reputation)
	airlines = data.airlines.duplicate(true)
	resources = data.resources.duplicate(true)
	runways.clear()
	for key in data.runways:
		var r := AirportRunway.new()
		r.restore(data.runways[key])
		runways[key] = r
	for registry in ["gates", "aircraft", "flights", "bags", "security_checkpoints", "turnaround_tasks"]:
		get(registry).clear()
		for key in data[registry]:
			var entity: AirportEntity
			match registry:
				"gates": entity = AirportGate.new()
				"aircraft": entity = AirportAircraft.new()
				"flights": entity = AirportFlight.new()
				"bags": entity = AirportBag.new()
				"security_checkpoints": entity = SecurityCheckpoint.new()
				"turnaround_tasks": entity = TurnaroundTask.new()
			entity.restore(data[registry][key])
			get(registry)[key] = entity

	passengers.clear()
	for key in data.passengers:
		var passenger := Passenger.new()
		passenger.restore_snapshot(data.passengers[key])
		passengers[str(passenger.id)] = passenger
