class_name SimRng
extends RefCounted
## Thin wrapper around Godot's seeded RandomNumberGenerator that only exposes
## integer operations, so the simulation never touches float randomness or
## the global RNG. Derived streams keep generation, strategy ordering and
## test fuzzing independent of one another.

const STREAM_PASSENGERS := 0x1001
const STREAM_STRATEGY := 0x2002
const STREAM_SCENARIO := 0x3003
## Airport seat and cabin-timing draws, separate so terminal flow (M2) is unchanged.
const STREAM_CABIN := 0x4004
## Per-flight airport load factors, one draw per flight in scenario order.
const STREAM_LOAD := 0x5005
## Inbound (arriving) manifests: loads, seats and passenger attributes.
const STREAM_INBOUND := 0x6006
## Connecting itineraries (M6): who connects, onto which flight, which seat.
const STREAM_CONNECTION := 0x7007
## Checked baggage (M7): who checks bags, and how many.
const STREAM_BAGGAGE := 0x8008

var _rng := RandomNumberGenerator.new()


func _init(seed_value: int, stream: int = 0) -> void:
	# Mix the stream into the seed so streams with the same base seed differ.
	_rng.seed = hash(str(seed_value) + ":" + str(stream))


func randi_range(lo: int, hi: int) -> int:
	return _rng.randi_range(lo, hi)


## In-place Fisher-Yates shuffle. Array.shuffle() uses the global RNG, so it
## must never be used inside the simulation.
func shuffle(arr: Array) -> void:
	for i in range(arr.size() - 1, 0, -1):
		var j := _rng.randi_range(0, i)
		var tmp = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp


## Pick an index according to integer weights.
func weighted_index(weights: Array[int]) -> int:
	var total := 0
	for w in weights:
		total += w
	assert(total > 0, "weights must sum to a positive number")
	var r := _rng.randi_range(0, total - 1)
	var acc := 0
	for i in weights.size():
		acc += weights[i]
		if r < acc:
			return i
	return weights.size() - 1


## Decimal strings avoid loss of 64-bit RNG state through JSON numbers.
func snapshot() -> Dictionary:
	return {"seed": str(_rng.seed), "state": str(_rng.state)}

func restore(data: Dictionary) -> void:
	_rng.seed = int(data.seed)
	_rng.state = int(data.state)
