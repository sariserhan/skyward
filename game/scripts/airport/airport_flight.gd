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
var gate_arrival_tick: int = -1
var gate_release_tick: int = -1
var forced_delay_ticks: int = 0
var runway_requested: bool = false

# Scenario overrides (optional in config): -1 / "" use the scenario defaults.
var load_permille: int = -1
var boarding_strategy: String = ""
## Demonstration aid: this many manifest passengers reach the airport too late.
var late_passengers: int = 0

# Boarding (M3). All times are airport ticks. "cabin" runs the preserved
# boarding engine; "placeholder" is the widebody boarding abstraction (D-022).
var boarding_mode: String = "placeholder"
## "" → scheduled → open → closed → complete
var boarding_phase: String = ""
var service_ready_tick: int = -1
var boarding_open_tick: int = -1
## Current gate-close time, moved by player holds.
var gate_close_tick: int = -1
var gate_closed_tick: int = -1
var boarding_complete_tick: int = -1
## When the last boarded passenger sat down (or boarded, widebody abstraction).
var last_seated_tick: int = -1
## Takeoff target for this departure: max(D, late service) plus holds.
var departure_target_tick: int = -1
var hold_ticks: int = 0
var boarded_count: int = 0
var missed_count: int = 0
## Simulation.result() of the cabin engine, in boarding ticks.
var boarding_result: Dictionary = {}

# Turnaround (M4). Task ids in AirportState.turnaround_tasks, in graph order.
var task_ids: Array = []
## Scenario override: extra airport ticks per task type (e.g. a deep clean).
var turnaround_overrides: Dictionary = {}
## Runway queue wait before the takeoff roll, airport ticks.
var takeoff_wait_ticks: int = 0
## Additive split of takeoff lateness by cause; sums exactly to the lateness.
var departure_delay_breakdown: Dictionary = {}
