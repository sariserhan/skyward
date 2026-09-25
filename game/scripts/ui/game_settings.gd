class_name GameSettings
extends RefCounted
## Player settings (M13), kept in user://settings.json. Not part of any save:
## they belong to the player, not the airport.

const PATH := "user://settings.json"
const DEFAULTS := {"tips": true, "pause_on_critical": false, "slow_on_critical": true, "ui_scale": 1.0, "developer": false}

static var _values: Dictionary = {}


static func get_value(key: String):
	if _values.is_empty(): load_settings()
	return _values.get(key, DEFAULTS.get(key))


static func set_value(key: String, value) -> void:
	if _values.is_empty(): load_settings()
	_values[key] = value
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	if file != null: file.store_string(JSON.stringify(_values))


static func load_settings() -> void:
	_values = DEFAULTS.duplicate()
	if FileAccess.file_exists(PATH):
		var saved = JSON.parse_string(FileAccess.get_file_as_string(PATH))
		if saved is Dictionary:
			for key in saved:
				if DEFAULTS.has(key): _values[key] = saved[key]


static var _fallback_added := false


## Apply what the window needs (UI scale), and a fallback font for symbols
## (→ ✓ ✗ ≤ ≥) that the default font lacks: a browser has no system fonts.
static func apply(tree: SceneTree) -> void:
	tree.root.content_scale_factor = clampf(float(get_value("ui_scale")), 0.75, 1.5)
	if not _fallback_added and ResourceLoader.exists("res://assets/fonts/FreeSans.ttf"):
		var fallbacks: Array[Font] = ThemeDB.fallback_font.fallbacks
		fallbacks.append(load("res://assets/fonts/FreeSans.ttf"))
		ThemeDB.fallback_font.fallbacks = fallbacks
		_fallback_added = true


## Developer scenarios are shown with --dev, in debug builds, or by setting.
static func developer() -> bool:
	return bool(get_value("developer")) or "--dev" in OS.get_cmdline_user_args() or "--dev" in OS.get_cmdline_args()
