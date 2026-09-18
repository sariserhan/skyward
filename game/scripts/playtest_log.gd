class_name PlaytestLog
extends RefCounted
## Local, append-only playtest event log (spec §33 metrics without a backend).
## One JSON object per line in user://playtest_log.jsonl. Testers send the
## file back; tools/playtest_report.py turns a folder of them into the
## spec's metrics.
##
## No personal data: the tester id is a random string generated once.

const LOG_PATH := "user://playtest_log.jsonl"
const ID_PATH := "user://playtester_id.txt"

var tester_id: String = ""
var session_id: String = ""
var enabled: bool = true
var _session_started_msec: int = 0


func _init() -> void:
	tester_id = _load_or_create_id()
	session_id = "%d-%04x" % [int(Time.get_unix_time_from_system()), randi() % 0xFFFF]
	_session_started_msec = Time.get_ticks_msec()


func log_event(event: String, fields: Dictionary = {}) -> void:
	if not enabled:
		return
	var record := {
		"t": Time.get_unix_time_from_system(),
		"session_ms": Time.get_ticks_msec() - _session_started_msec,
		"tester": tester_id,
		"session": session_id,
		"sim_version": Simulation.SIM_VERSION,
		"event": event,
	}
	record.merge(fields)
	var f := FileAccess.open(LOG_PATH, FileAccess.READ_WRITE if FileAccess.file_exists(LOG_PATH) else FileAccess.WRITE)
	if f == null:
		return
	f.seek_end()
	f.store_line(JSON.stringify(record))
	f.close()


static func absolute_log_path() -> String:
	return ProjectSettings.globalize_path(LOG_PATH)


func _load_or_create_id() -> String:
	if FileAccess.file_exists(ID_PATH):
		var f := FileAccess.open(ID_PATH, FileAccess.READ)
		var id := f.get_as_text().strip_edges()
		f.close()
		if id != "":
			return id
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var id := "%08x%08x" % [rng.randi(), rng.randi()]
	var f := FileAccess.open(ID_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(id)
		f.close()
	return id
