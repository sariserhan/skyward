class_name Passenger
extends RefCounted
## Pure data plus per-passenger simulation state. No rendering here.

enum State {
	WAITING,
	QUEUED,
	ENTERING,
	WALKING,
	BLOCKED,
	STOWING,
	WAITING_FOR_SEAT,
	SEATING,
	SEATED,
	# Deboarding (M5). Appended so earlier values keep their integers.
	LEAVING_SEAT,
	RETRIEVING_BAGS,
	EXITED,
}

enum SeatType { WINDOW, MIDDLE, AISLE }

const STATE_NAMES := {
	State.WAITING: "Waiting",
	State.QUEUED: "In queue",
	State.ENTERING: "Entering",
	State.WALKING: "Walking",
	State.BLOCKED: "Blocked",
	State.STOWING: "Stowing luggage",
	State.WAITING_FOR_SEAT: "Waiting for seat access",
	State.SEATING: "Taking seat",
	State.SEATED: "Seated",
	State.LEAVING_SEAT: "Getting up",
	State.RETRIEVING_BAGS: "Retrieving bags",
	State.EXITED: "Left the aircraft",
}

const SEAT_TYPE_NAMES := {
	SeatType.WINDOW: "Window",
	SeatType.MIDDLE: "Middle",
	SeatType.AISLE: "Aisle",
}

# --- identity / manifest -------------------------------------------------
var id: int = 0
var seat_row: int = 0
var seat_letter: String = ""
var seat_type: int = SeatType.AISLE
var side: int = 0
## Normalised walking speed in permille (1000 = 1.0).
var walking_speed: int = 1000
## Derived: integer ticks to cross one aisle cell at this speed.
var walk_ticks_per_cell: int = 20
var carry_on_count: int = 0
## Ticks spent in STOWING (0 when no bags).
var luggage_stow_duration: int = 0
## Ticks spent in SEATING once the path to the seat is clear.
var seat_access_duration: int = 30

# --- strategy assignment -------------------------------------------------
var boarding_group: int = -1
var boarding_group_name: String = ""
var queue_position: int = -1

# --- live state ----------------------------------------------------------
var state: int = State.WAITING
## Aisle cell index; -1 when not in the aisle.
var aisle_position: int = -1
## Ticks accumulated toward crossing the current cell.
var progress: int = 0
## Remaining ticks in the current timed state.
var timer: int = 0
## Seated passengers that had to move for this passenger (set at seat access).
var obstruction_count: int = 0
var entered_tick: int = -1
var seated_tick: int = -1

# --- diagnostics ---------------------------------------------------------
var total_blocked_time: int = 0
var total_walk_time: int = 0
var total_stow_time: int = 0
var total_seat_wait_time: int = 0
## Ticks other passengers spent BLOCKED with this passenger as the nearest
## non-blocked passenger ahead of them (the head of the jam).
var caused_blocked_time: int = 0


func seat_key() -> String:
	return AircraftDef.seat_key(seat_row, seat_letter)


func state_name() -> String:
	return STATE_NAMES.get(state, "?")


func seat_type_name() -> String:
	return SEAT_TYPE_NAMES.get(seat_type, "?")


func is_in_aisle() -> bool:
	return aisle_position >= 0


func is_done() -> bool:
	return state == State.SEATED


func to_dict() -> Dictionary:
	return {
		"id": id,
		"seat": seat_key(),
		"seat_type": seat_type,
		"walking_speed": walking_speed,
		"carry_on_count": carry_on_count,
		"luggage_stow_duration": luggage_stow_duration,
		"seat_access_duration": seat_access_duration,
		"boarding_group": boarding_group,
		"queue_position": queue_position,
	}


# Airport identity lives on this same passenger. `state` above remains the
# boarding substate; airport_state describes the enclosing journey phase.
var current_flight_id: String = ""
var itinerary_id: String = ""
var origin: String = ""
var destination: String = ""
var checked_bag_ids: Array = []
var carry_on_size_class: String = "standard"
var mobility_profile: String = "standard"
var travel_party_id: String = ""
var connection_flight_id: String = ""
var arrival_time_at_airport: int = -1
var gate_arrival_time: int = -1
var current_location: String = ""
var airport_state: String = "not_arrived"
var satisfaction: int = 100
var risk_flags: Array = []


# Terminal journey timing uses AirportClock ticks; boarding timing above retains
# its original configuration. Both belong to this one passenger identity.
var security_checkpoint_id: String = ""
var security_queue_enter_tick: int = -1
var security_wait_ticks: int = 0
var security_lane: int = -1
var security_cleared: bool = false
var gate_target_tick: int = -1
var terminal_route: Array = []
var route_goal: String = ""
var walk_from: String = ""
var walk_to: String = ""
var walk_started_tick: int = -1
var flow_due_tick: int = -1

# Airport boarding (M3), in airport ticks. Cabin timing above stays in boarding
# ticks (D-015). A missed passenger keeps walking and settles at the closed gate.
var boarding_admit_tick: int = -1
var seated_airport_tick: int = -1
var missed_flight_id: String = ""
var missed_reason: String = ""

# Arrivals (M5). "departing" passengers start at the airport entrance;
# "arriving" ones start seated on current_flight_id and leave through the exit.
var journey_direction: String = "departing"
## Deboarding timings in boarding ticks (30 Hz), fixed at generation.
var deboard_seat_exit_ticks: int = 0
var deboard_retrieve_ticks: int = 0
var deboard_walk_ticks_per_cell: int = 0
## Boarding tick at which the passenger left the cabin; -1 while aboard.
var exited_tick: int = -1
## Airport ticks: left the aircraft, and left the airport.
var deplaned_airport_tick: int = -1
var left_airport_tick: int = -1

# Connections (M6). A "connecting" passenger flies itinerary_legs[0] in and
# itinerary_legs[1] out; current_flight_id is the leg they are on. One seat per
# leg ([row, letter], or [] without a cabin model); the seat fields above are
# switched to the next leg's seat when they leave the inbound aircraft.
var itinerary_legs: Array = []
var itinerary_seats: Array = []
var leg_index: int = 0
## "" (not connecting), "pending", "made" or "missed".
var connection_status: String = ""
# Reclaim (M7), airport ticks: reached the reclaim hall, collected every bag.
var reclaim_arrival_tick: int = -1
var bags_collected_tick: int = -1

## Full live state for airport saves; preserve to_dict()'s boarding record API.
func snapshot() -> Dictionary:
	var result := {}
	for property in get_property_list():
		if int(property.usage) & PROPERTY_USAGE_SCRIPT_VARIABLE:
			result[property.name] = get(property.name)
	return result.duplicate(true)

func restore_snapshot(data: Dictionary) -> void:
	for property in get_property_list():
		if int(property.usage) & PROPERTY_USAGE_SCRIPT_VARIABLE and data.has(property.name):
			var value = data[property.name]
			if int(property.type) == TYPE_INT: value = int(value)
			set(property.name, value)
