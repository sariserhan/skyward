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
## Controller instructions; default off preserves existing saves and automatic careers.
var runway_cleared: bool = false
var taxi_hold: bool = false

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

# Arrivals (M5). The inbound manifest: passengers seated on this aircraft when
# it lands, who deboard at the gate and leave through the terminal.
var inbound_passenger_ids: Array = []
var inbound_load_permille: int = -1
## Scenario override of the deboarding timings for this flight (demo aid).
var deboarding_overrides: Dictionary = {}
var deboarding_complete_tick: int = -1
var deplaned_count: int = 0
## DeboardingSimulation.result() for cabin flights, in boarding ticks.
var deboarding_result: Dictionary = {}

# Connections (M6), kept for later airline measures (M9).
var connections_made: int = 0
var connections_missed: int = 0
## Scenario aid (M6 demo): the aircraft is this late from its origin, so its
## approach and landing start later than scheduled.
var inbound_delay_ticks: int = 0
## Bookings (M6 closeout): target = capacity × load (total bookings),
## split into originating (local) and connecting passengers.
var target_bookings: int = 0
var originating_bookings: int = 0
var connecting_bookings: int = 0

# Baggage (M7). Airport ticks.
## Bags must be sorted and ready by this tick (departure target - cutoff).
var bag_cutoff_tick: int = -1
var bag_cutoff_passed: bool = false
## Gate closed and cutoff passed: not-boarded passengers' bags are held.
var bag_load_finalized: bool = false
var bag_finalized_tick: int = -1
## M12: movement on the airside graph. The runway used (landing, then
## takeoff), the current taxi route as legs "edge:+1/-1", the leg being
## travelled and its enter/exit ticks, when the route started, its free-flow
## time, and the waits (beyond free flow) of the taxi in and out.
var runway_id: String = ""
var taxi_route: Array = []
var taxi_leg: int = -1
var leg_enter_tick: int = -1
var leg_exit_tick: int = -1
var taxi_state: String = ""
var taxi_blocker: String = ""
var taxi_start_tick: int = -1
var taxi_free_ticks: int = 0
var taxi_in_wait_ticks: int = 0
## Held before starting because the gate was occupied (gate wait, not taxi wait).
var taxi_gate_hold_ticks: int = 0
var taxi_hold_tick: int = -1
var taxi_out_wait_ticks: int = 0
var taxi_in_ticks_actual: int = -1
var taxi_out_ticks_actual: int = -1
## M8: turnaround service priority when competing for resources: low, normal, high.
var service_priority: String = "normal"
var bag_unload_due_tick: int = -1
## Loader: ready bag ids waiting to be loaded (or offloaded, prefixed "-").
var bag_load_queue: Array = []
var bag_loader_current: String = ""
var bags_loaded: int = 0
var bags_missed: int = 0
var bags_held: int = 0
## Scenario override of the baggage load/unload rates for this flight (demo aid).
var baggage_overrides: Dictionary = {}
## The baggage_load task is running: newly sorted bags join the load queue.
var bag_loading_open: bool = false
