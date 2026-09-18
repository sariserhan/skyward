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
