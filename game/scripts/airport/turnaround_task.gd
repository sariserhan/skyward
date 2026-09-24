class_name TurnaroundTask
extends AirportEntity
## One unit of aircraft turnaround work (M4). Rules live in Turnaround; this is
## primitive, serializable state. All times are airport ticks.

const PENDING := "PENDING"
const BLOCKED := "BLOCKED"
const READY := "READY"
const RUNNING := "RUNNING"
const COMPLETE := "COMPLETE"
const STATUSES := [PENDING, BLOCKED, READY, RUNNING, COMPLETE]
## timed: fixed duration once started. boarding: driven by the M3 boarding
## window. deboarding: driven by the M5 cabin engine (or widebody abstraction),
## planned at its nominal duration. milestone: completes as soon as its
## prerequisites are complete.
const KINDS := ["timed", "boarding", "deboarding", "milestone"]

var id: String = ""
var flight_id: String = ""
var type: String = ""
var label: String = ""
var kind: String = "timed"
## Needed before pushback (directly or through the pushback milestone).
var required: bool = true
## Task types that must be COMPLETE before this one starts.
var after: Array = []
## Task types that may not overlap with this one (kept symmetric).
var exclusive_with: Array = []
var status: String = PENDING
var blocked_reason: String = ""
var nominal_ticks: int = 0
## Actual duration: nominal + seeded variation + scenario overrides + holds.
var duration_ticks: int = 0
var planned_start_tick: int = -1
var planned_finish_tick: int = -1
var start_tick: int = -1
var finish_tick: int = -1
## What released this task: a task type, or "gate" for the aircraft docking.
var started_after: String = ""


func progress(now: int) -> float:
	if status == COMPLETE: return 1.0
	if status != RUNNING or kind != "timed" or duration_ticks <= 0: return 0.0
	return clampf(float(now - start_tick) / duration_ticks, 0.0, 1.0)
