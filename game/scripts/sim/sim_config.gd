class_name SimConfig
extends RefCounted
## All gameplay constants for the simulation. Every duration is an integer
## tick count (see docs/DECISIONS.md D-003). Loaded from
## res://configs/sim_config.json; scenarios may override individual fields.

const DEFAULT_PATH := "res://configs/sim_config.json"

var config_version: int = 1
var tick_rate: int = 30
var walk_ticks_per_cell: int = 20
var speed_min_permille: int = 900
var speed_max_permille: int = 1150
var entry_interval_ticks: int = 45
var bag_weights: Array[int] = [15, 65, 20]
var stow_base_ticks: int = 60
var stow_per_bag_ticks: int = 90
var stow_variation_ticks: int = 30
var seat_base_ticks: int = 30
var seat_variation_ticks: int = 15
var seat_per_obstructer_ticks: int = 150
## Reserved for a later milestone (D-004). 0 means unlimited.
var bin_capacity_per_row: int = 0

const INT_FIELDS := [
	"config_version", "tick_rate", "walk_ticks_per_cell",
	"speed_min_permille", "speed_max_permille", "entry_interval_ticks",
	"stow_base_ticks", "stow_per_bag_ticks", "stow_variation_ticks",
	"seat_base_ticks", "seat_variation_ticks", "seat_per_obstructer_ticks",
	"bin_capacity_per_row",
]


static func load_default() -> SimConfig:
	var c := SimConfig.new()
	c.apply_overrides(JsonUtil.load_file(DEFAULT_PATH))
	return c


static func from_dict(d: Dictionary) -> SimConfig:
	var c := SimConfig.new()
	c.apply_overrides(d)
	return c


func apply_overrides(d: Dictionary) -> void:
	for key in INT_FIELDS:
		if d.has(key):
			set(key, int(d[key]))
	if d.has("bag_weights"):
		var w: Array[int] = []
		for v in d["bag_weights"]:
			w.append(int(v))
		bag_weights = w


func duplicate_config() -> SimConfig:
	return SimConfig.from_dict(to_dict())


func to_dict() -> Dictionary:
	var d := {}
	for key in INT_FIELDS:
		d[key] = get(key)
	d["bag_weights"] = bag_weights.duplicate()
	return d


func ticks_to_seconds(ticks: int) -> float:
	return float(ticks) / float(tick_rate)
