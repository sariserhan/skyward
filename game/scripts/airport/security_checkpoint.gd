class_name SecurityCheckpoint
extends AirportEntity
var id: String = ""
var node_id: String = ""
var max_lanes: int = 4
var open_lanes: int = 2
var staff: int = 2
var service_ticks: int = 120
var queue: Array = []
# Lane indices are strings so JSON preserves their identity.
var active: Dictionary = {}
var processed: int = 0
var total_wait_ticks: int = 0
var max_wait_ticks: int = 0
## M13: the longest the queue got today (bottleneck summary and report).
var peak_queue: int = 0

func capacity() -> int:
	return mini(open_lanes, staff)
