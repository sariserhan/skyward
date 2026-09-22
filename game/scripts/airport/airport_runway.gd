class_name AirportRunway
extends AirportEntity

var id: String = "09 / 27"
var occupied_until: int = 0
var queue: Array = []
var active_operation: Dictionary = {}
var busy_ticks: int = 0
