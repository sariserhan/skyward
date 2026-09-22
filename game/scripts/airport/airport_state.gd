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
var runway := AirportRunway.new()

func to_dict() -> Dictionary:
	var result := {"id": id, "name": name, "money": money, "reputation": reputation,
		"airlines": airlines.duplicate(true), "resources": resources.duplicate(true),
		"runway": runway.to_dict()}
	for registry in ["gates", "aircraft", "flights", "passengers", "bags", "security_checkpoints"]:
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
	runway.restore(data.runway)
	for registry in ["gates", "aircraft", "flights", "bags", "security_checkpoints"]:
		get(registry).clear()
		for key in data[registry]:
			var entity: AirportEntity
			match registry:
				"gates": entity = AirportGate.new()
				"aircraft": entity = AirportAircraft.new()
				"flights": entity = AirportFlight.new()
				"bags": entity = AirportBag.new()
				"security_checkpoints": entity = SecurityCheckpoint.new()
			entity.restore(data[registry][key])
			get(registry)[key] = entity

	passengers.clear()
	for key in data.passengers:
		var passenger := Passenger.new()
		passenger.restore_snapshot(data.passengers[key])
		passengers[str(passenger.id)] = passenger
