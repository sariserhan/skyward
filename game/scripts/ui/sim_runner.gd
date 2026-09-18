class_name SimRunner
extends Node
## Advances a Simulation on a fixed timestep, decoupled from rendering.
## Playback speed only changes how many integer ticks are stepped per frame,
## so it can never alter the outcome (spec §8).

signal ticked
signal completed(result: Dictionary)

const MAX_STEPS_PER_FRAME := 4000

var sim: Simulation
var speed: float = 1.0
var running: bool = false
var _accumulator: float = 0.0
## Simulation ticks executed during the last second of wall time.
var sim_tps: int = 0
var _tps_counter: int = 0
var _tps_timer: float = 0.0


func load_sim(s: Simulation) -> void:
	sim = s
	running = false
	_accumulator = 0.0
	sim_tps = 0


func start() -> void:
	if sim == null or sim.is_complete():
		return
	running = true
	if speed <= 0.0:
		speed = 1.0


func stop() -> void:
	running = false


func _process(delta: float) -> void:
	_tps_timer += delta
	if _tps_timer >= 1.0:
		sim_tps = _tps_counter
		_tps_counter = 0
		_tps_timer = 0.0
	if sim == null or not running or sim.is_complete() or speed <= 0.0:
		return
	_accumulator += delta * float(sim.config.tick_rate) * speed
	var steps := int(_accumulator)
	if steps <= 0:
		return
	_accumulator -= float(steps)
	steps = mini(steps, MAX_STEPS_PER_FRAME)
	for _i in steps:
		sim.step()
		_tps_counter += 1
		if sim.is_complete():
			_finish()
			break
	ticked.emit()


## Debug helper: execute without rendering delays (spec §29).
func run_to_completion() -> void:
	if sim == null or sim.is_complete():
		return
	sim.run_to_completion()
	_finish()
	ticked.emit()


func _finish() -> void:
	running = false
	completed.emit(sim.result())
