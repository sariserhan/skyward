class_name AirportAircraft
extends AirportEntity

var id: String = ""
var aircraft_type_id: String = ""
var seat_map: String = ""
var seat_capacity: int = 0
var carry_on_capacity: int = 0
var checked_bag_capacity: int = 0
var boarding_door_configuration: Array = ["front"]
var required_gate_type: String = "narrow"
var turnaround_requirements: Array = []
