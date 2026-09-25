class_name AirportPlaytestLog
extends RefCounted
## M13 playtest logging for the airport game. Session events are appended to
## user://playtest/session.jsonl (one JSON object per line): menu choices,
## speed changes, selections, tab opens, decisions, tips shown and dismissed,
## day starts and ends, and a performance sample each minute. Nothing here
## touches the simulation.
##
## export_bundle() writes one zip for the tester to send back: the session
## log, the settings, the current (or latest) save, screenshots and a summary
## with the automatically derivable checklist flags (docs/PLAYTEST.md §M13).

const DIR := "user://playtest"
const LOG := "user://playtest/session.jsonl"
const SHOTS := "user://playtest/shots"

static var _session := ""
static var _started_msec := -1


static func log_event(event: String, data := {}) -> void:
	DirAccess.make_dir_recursive_absolute(DIR)
	if _session.is_empty():
		_session = "%d-%d" % [int(Time.get_unix_time_from_system()), randi() % 100000]
		_started_msec = Time.get_ticks_msec()
		_append({"event": "session_start", "os": OS.get_name(), "godot": Engine.get_version_info()["string"], "web": OS.has_feature("web")})
	var entry := {"event": event}
	entry.merge(data, true)
	_append(entry)


static func _append(entry: Dictionary) -> void:
	entry["session"] = _session
	entry["unix"] = Time.get_unix_time_from_system()
	entry["session_sec"] = snappedf((Time.get_ticks_msec() - _started_msec) / 1000.0, 0.1)
	var file := FileAccess.open(LOG, FileAccess.READ_WRITE) if FileAccess.file_exists(LOG) else FileAccess.open(LOG, FileAccess.WRITE)
	if file == null: return
	file.seek_end()
	file.store_line(JSON.stringify(entry))


static func screenshot(viewport: Viewport, name: String) -> String:
	if viewport == null: return ""
	DirAccess.make_dir_recursive_absolute(SHOTS)
	var path := SHOTS.path_join("%s-%s.png" % [_session if not _session.is_empty() else "nosession", name])
	var image := viewport.get_texture().get_image()
	if image == null: return ""
	image.save_png(path)
	log_event("screenshot", {"file": path.get_file()})
	return path


## Start a fresh playtest (testers press this before their first session).
static func reset() -> void:
	if FileAccess.file_exists(LOG): DirAccess.remove_absolute(LOG)
	if DirAccess.dir_exists_absolute(SHOTS):
		for file in DirAccess.get_files_at(SHOTS): DirAccess.remove_absolute(SHOTS.path_join(file))
	_session = ""


static func events() -> Array:
	var out: Array = []
	if not FileAccess.file_exists(LOG): return out
	for line in FileAccess.get_file_as_string(LOG).split("\n", false):
		var parsed = JSON.parse_string(line)
		if parsed is Dictionary: out.append(parsed)
	return out


## §35 flags that can be derived from the log (the rest are observer notes).
static func checklist(all: Array) -> Dictionary:
	var has := func(names: Array, pred := Callable()) -> bool:
		for e in all:
			if e.event in names and (not pred.is_valid() or pred.call(e)): return true
		return false
	var first := -1.0
	var last := 0.0
	for e in all:
		if first < 0: first = float(e.get("session_sec", 0))
		last = maxf(last, float(e.get("session_sec", 0)))
	return {
		"reached_first_flight": has.call(["first_landing"]),
		"found_time_controls": has.call(["speed", "pause"]),
		"opened_flight_details": has.call(["select_flight"]),
		"changed_security_staffing": has.call(["security_change"]),
		"noticed_resource_contention": has.call(["tab", "priority"], func(e): return e.event == "priority" or e.get("tab", "") == "Resources"),
		"used_hold_or_close": has.call(["hold", "close_gate"]),
		"completed_day_1": has.call(["day_end"], func(e): return int(e.get("day", 0)) == 1),
		"viewed_report": has.call(["report_viewed"]),
		"made_next_day_plan": has.call(["plan_change"]),
		"built_something": has.call(["build"]),
		"started_day_2": has.call(["day_start"], func(e): return int(e.get("day", 0)) >= 2),
		"opened_help": has.call(["help"]),
		"session_minutes": snappedf(maxf(0.0, last - maxf(0.0, first)) / 60.0, 0.1),
	}


## One zip with everything a tester sends back. Returns its user:// path
## (and downloads it in a web build).
static func export_bundle(career: AirportCareer, viewport: Viewport) -> String:
	DirAccess.make_dir_recursive_absolute(DIR)
	if viewport != null: screenshot(viewport, "export")
	log_event("bundle_export")
	var path := DIR.path_join("playtest-bundle-%d.zip" % int(Time.get_unix_time_from_system()))
	var zip := ZIPPacker.new()
	if zip.open(path) != OK: return ""
	var add := func(name: String, bytes: PackedByteArray) -> void:
		zip.start_file(name)
		zip.write_file(bytes)
		zip.close_file()
	var all := events()
	if FileAccess.file_exists(LOG): add.call("session.jsonl", FileAccess.get_file_as_bytes(LOG))
	if FileAccess.file_exists(GameSettings.PATH): add.call("settings.json", FileAccess.get_file_as_bytes(GameSettings.PATH))
	if career != null: add.call("save.json", JSON.stringify(career.snapshot()).to_utf8_buffer())
	elif not CareerSaves.latest().is_empty(): add.call("save.json", FileAccess.get_file_as_bytes(CareerSaves.latest()))
	if DirAccess.dir_exists_absolute(SHOTS):
		for file in DirAccess.get_files_at(SHOTS): add.call("shots/" + file, FileAccess.get_file_as_bytes(SHOTS.path_join(file)))
	var summary := {"checklist": checklist(all), "events": all.size(), "career": {}}
	if career != null:
		summary.career = {"name": career.airport_name, "seed": career.career_seed, "difficulty": career.difficulty, "mode": career.mode,
			"day": career.day, "phase": career.phase, "cash_cents": career.cash_cents(), "chapter": int(career.progress.get("chapter", 0)),
			"objectives_done": career.progress.get("done", {}).keys(), "reports": career.reports.map(func(r): return {"day": r.day, "net_cents": r.net_cents,
				"flights": r.flights, "mean_delay_min": r.mean_delay_min, "missed_connections": r.missed_connections})}
	add.call("summary.json", JSON.stringify(summary, "  ").to_utf8_buffer())
	zip.close()
	if OS.has_feature("web"):
		JavaScriptBridge.download_buffer(FileAccess.get_file_as_bytes(path), path.get_file(), "application/zip")
	return path
