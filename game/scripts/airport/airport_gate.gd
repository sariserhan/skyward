class_name AirportGate
extends AirportEntity

var id: String = ""
var terminal: String = "A"
var type: String = "narrow"
var supported_aircraft_classes: Array = ["narrow"]
var occupied_by_flight_id: String = ""
var available_from: int = 0
var available_until: int = 864000
var boarding_capacity: int = 1
var jet_bridge_count: int = 1
