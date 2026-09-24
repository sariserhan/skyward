class_name AirportBag
extends AirportEntity
## A checked bag (M7): one persistent object from creation to its end state,
## linked to one passenger. Times are airport ticks; -1 when not yet reached.

const STATES := ["created", "in_transit", "queued", "sorting", "ready_for_flight", "loading", "on_aircraft",
	"departed", "unloading", "at_reclaim", "collected", "missed_flight", "missed_connection", "held"]

var id: String = ""
var passenger_id: int = 0
## "originating" (checked here), "local" (ends here), "transfer" (connects).
var kind: String = "originating"
## Flights the bag must fly, in order, and the one it is on or waiting for.
var legs: Array = []
var leg_index: int = 0
var current_flight_id: String = ""
var state: String = "created"
## Processing stage it is in or heading to (in_transit / queued / sorting).
var stage: String = ""
var checked_tick: int = -1
var unloaded_tick: int = -1
var ready_tick: int = -1
var loaded_tick: int = -1
var at_reclaim_tick: int = -1
var collected_tick: int = -1
## Set at the bag cutoff or load finalization; the bag ends missed or held.
var missed_flight_id: String = ""
var missed_reason: String = ""
