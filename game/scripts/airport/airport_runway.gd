class_name AirportRunway
extends AirportEntity
## One runway resource (M12: several may be built). Operations run in its
## heading: aircraft land from end `a` and leave at end `b`; departures enter at
## `a`. Occupancy stays the M1 timer model: one operation at a time plus the
## separation interval.

var id: String = "R1"
var label: String = "09 / 27"
var length_m: int = 0
var status: String = "open"
var a: String = ""
var b: String = ""
var occupied_until: int = 0
var queue: Array = []
var active_operation: Dictionary = {}
var busy_ticks: int = 0
var movements: int = 0
var peak_queue: int = 0
