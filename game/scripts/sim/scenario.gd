class_name Scenario
extends RefCounted
## A scenario ties an aircraft, a passenger count, a seed and config
## overrides together. It knows how to build a fresh Simulation.

const SCENARIO_DIR := "res://configs/scenarios"

var scenario_id: String = ""
var display_name: String = ""
var aircraft_id: String = ""
var passenger_count: int = 0
var seed_value: int = 0
var config_overrides: Dictionary = {}
var target_time_seconds: int = 0


static func from_dict(d: Dictionary) -> Scenario:
	var s := Scenario.new()
	s.scenario_id = str(d.get("scenario_id", ""))
	s.display_name = str(d.get("display_name", s.scenario_id))
	s.aircraft_id = str(d.get("aircraft_id", ""))
	s.passenger_count = int(d.get("passenger_count", 0))
	s.seed_value = int(d.get("seed", 0))
	s.config_overrides = d.get("config_overrides", {})
	s.target_time_seconds = int(d.get("target_time_seconds", 0))
	return s


static func load_from_file(path: String) -> Scenario:
	return Scenario.from_dict(JsonUtil.load_file(path))


static func load_all() -> Array[Scenario]:
	var out: Array[Scenario] = []
	for path in JsonUtil.list_json_files(SCENARIO_DIR):
		out.append(load_from_file(path))
	# Present in ascending passenger count, then by id, so Tutorial comes first.
	out.sort_custom(func(a, b):
		if a.passenger_count != b.passenger_count:
			return a.passenger_count < b.passenger_count
		return a.scenario_id < b.scenario_id
	)
	return out


## Build a config with this scenario's overrides applied to the defaults.
func build_config() -> SimConfig:
	var c := SimConfig.load_default()
	c.apply_overrides(config_overrides)
	return c


func load_aircraft() -> AircraftDef:
	return AircraftDef.load_by_id(aircraft_id)


## Build a fresh simulation for this scenario and strategy. Each call
## regenerates the manifest from the seed, so passengers are identical
## between attempts.
func build_simulation(strategy: BoardingStrategy, seed_override: int = -1) -> Simulation:
	var use_seed := seed_value if seed_override < 0 else seed_override
	var aircraft := load_aircraft()
	var config := build_config()
	var passengers := PassengerGenerator.generate(aircraft, passenger_count, use_seed, config)
	var sim := Simulation.new()
	sim.setup(aircraft, passengers, strategy, config, use_seed)
	return sim


func to_dict() -> Dictionary:
	return {
		"scenario_id": scenario_id,
		"display_name": display_name,
		"aircraft_id": aircraft_id,
		"passenger_count": passenger_count,
		"seed": seed_value,
		"config_overrides": config_overrides.duplicate(true),
		"target_time_seconds": target_time_seconds,
	}
