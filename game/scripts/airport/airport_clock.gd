class_name AirportClock
extends RefCounted
## Absolute integer ticks from midnight. Real time exists only in this adapter.
const TICKS_PER_SECOND := 10
var tick: int = 216000
var paused: bool = false
var speed: int = 1
var remainder: float = 0.0

func frame_steps(delta: float) -> int:
	if paused:
		return 0
	remainder += maxf(0.0, delta) * TICKS_PER_SECOND * speed
	var steps := mini(int(remainder), 4000)
	# Preserve excess work after a slow frame instead of dropping sim time.
	remainder -= steps
	return steps

func set_speed(value: int) -> void:
	if value in [1, 2, 4]:
		speed = value

static func display(value: int) -> String:
	var seconds := value / TICKS_PER_SECOND
	return "%02d:%02d:%02d" % [seconds / 3600, (seconds / 60) % 60, seconds % 60]

func to_dict() -> Dictionary:
	return {"tick": tick, "paused": paused, "speed": speed, "remainder": remainder}

func restore(data: Dictionary) -> void:
	tick = int(data.tick)
	paused = bool(data.paused)
	set_speed(int(data.speed))
	remainder = float(data.remainder)
