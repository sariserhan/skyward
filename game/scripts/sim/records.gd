class_name Records
extends RefCounted
## Local personal-best persistence (spec §24). Keyed by scenario id and seed.
## Records carry the simulation and config version (D-007); a record from a
## different version is kept for display but does not count as current best.

const SAVE_PATH := "user://records.json"

var data: Dictionary = {}


static func load_records() -> Records:
	var r := Records.new()
	if FileAccess.file_exists(SAVE_PATH):
		var f := FileAccess.open(SAVE_PATH, FileAccess.READ)
		var parsed = JSON.parse_string(f.get_as_text())
		f.close()
		if typeof(parsed) == TYPE_DICTIONARY:
			r.data = parsed
	return r


func save() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_error("Records: cannot write %s" % SAVE_PATH)
		return
	f.store_string(JSON.stringify(data, "  "))
	f.close()


static func key_for(scenario: Scenario) -> String:
	return "%s@%d" % [scenario.scenario_id, scenario.seed_value]


func entry_for(scenario: Scenario) -> Dictionary:
	return data.get(key_for(scenario), {})


func is_current(entry: Dictionary, config: SimConfig) -> bool:
	return not entry.is_empty() \
		and str(entry.get("sim_version", "")) == Simulation.SIM_VERSION \
		and int(entry.get("config_version", -1)) == config.config_version


## Best ticks for the current sim version, or -1 if none.
func best_ticks(scenario: Scenario, config: SimConfig) -> int:
	var e := entry_for(scenario)
	if not is_current(e, config):
		return -1
	return int(e.get("best_ticks", -1))


func attempt_count(scenario: Scenario) -> int:
	return int(entry_for(scenario).get("attempt_count", 0))


## Record a finished attempt. Returns true when it is a new personal best.
func record_attempt(scenario: Scenario, config: SimConfig, result: Dictionary) -> bool:
	var k := key_for(scenario)
	var e: Dictionary = data.get(k, {})
	var was_current := is_current(e, config)
	var ticks := int(result["total_ticks"])
	var prev := int(e.get("best_ticks", -1)) if was_current else -1
	var is_best := prev < 0 or ticks < prev

	var attempts := int(e.get("attempt_count", 0)) + 1
	if is_best:
		e = {
			"best_ticks": ticks,
			"strategy": result["strategy"],
			"sim_version": Simulation.SIM_VERSION,
			"config_version": config.config_version,
		}
	e["attempt_count"] = attempts
	e["last_ticks"] = ticks
	data[k] = e
	save()
	return is_best
