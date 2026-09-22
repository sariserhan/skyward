class_name AirportFlight
extends AirportEntity

var id: String = ""
var airline_id: String = ""
var flight_number: String = ""
var origin: String = ""
var destination: String = ""
var aircraft_id: String = ""
var scheduled_arrival: int = 0
var actual_arrival: int = -1
var scheduled_departure: int = 0
var estimated_departure: int = 0
var actual_departure: int = -1
var assigned_gate_id: String = ""
var passenger_ids: Array = []
var bag_ids: Array = []
var status: String = "scheduled"
var delay_reasons: Dictionary = {}
var external_flight_reference: String = ""
var terminal: String = "A"
var state_since: int = 0
var due_tick: int = 0
var turnaround_ticks: int = 0
var gate_arrival_tick: int = -1
var gate_release_tick: int = -1
var forced_delay_ticks: int = 0
var runway_requested: bool = false
