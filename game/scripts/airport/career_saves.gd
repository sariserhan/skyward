class_name CareerSaves
extends RefCounted
## M13 save slots. Each career has a folder under user://saves/<career id>/:
##   manual.json            the player's own save (mid-day allowed)
##   auto_<n>.json          boundary autosaves; the newest AUTOSAVE_KEEP remain
##   meta.json              name, day, cash, mode and the newest file, so the
##                          menu can list saves without parsing whole careers
## CONTINUE loads the newest save of any career.

const ROOT := "user://saves"
const AUTOSAVE_KEEP := 3


static func folder(career: AirportCareer) -> String:
	if career.career_id.is_empty(): career.career_id = new_id(career.airport_name, career.career_seed)
	return ROOT.path_join(career.career_id)


## A folder-safe id: the airport name, the seed and the creation time.
static func new_id(name: String, seed: int) -> String:
	var slug := ""
	for ch in name.to_lower():
		slug += ch if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") else "-"
	return "%s-%d-%d" % [slug.strip_edges().left(24), seed, int(Time.get_unix_time_from_system())]


static func save_manual(career: AirportCareer) -> Error:
	return _write(career, "manual.json", "manual")


## A boundary autosave (day start, day end, after planning changes).
static func autosave(career: AirportCareer, reason: String) -> Error:
	var dir := folder(career)
	DirAccess.make_dir_recursive_absolute(dir)
	var numbers := _autosave_numbers(dir)
	var next: int = 1 if numbers.is_empty() else int(numbers[-1]) + 1
	var error := _write(career, "auto_%d.json" % next, reason)
	numbers.append(next)
	while numbers.size() > AUTOSAVE_KEEP:
		DirAccess.remove_absolute(dir.path_join("auto_%d.json" % int(numbers.pop_front())))
	return error


static func _autosave_numbers(dir: String) -> Array:
	var out: Array = []
	for file in DirAccess.get_files_at(dir):
		if file.begins_with("auto_") and file.ends_with(".json"): out.append(int(file.trim_prefix("auto_").trim_suffix(".json")))
	out.sort()
	return out


static func _write(career: AirportCareer, file: String, reason: String) -> Error:
	var dir := folder(career)
	DirAccess.make_dir_recursive_absolute(dir)
	var error := career.save_file(dir.path_join(file))
	if error != OK: return error
	var meta := {"career_id": career.career_id, "name": career.airport_name, "mode": career.mode, "difficulty": career.difficulty,
		"day": career.day, "phase": career.phase, "cash_cents": career.cash_cents(), "latest": file, "reason": reason,
		"saved_unix": Time.get_unix_time_from_system(), "saved_msec": Time.get_ticks_msec()}
	var handle := FileAccess.open(dir.path_join("meta.json"), FileAccess.WRITE)
	if handle == null: return FileAccess.get_open_error()
	handle.store_string(JSON.stringify(meta))
	return OK


## Every career's meta, newest first.
static func list() -> Array:
	var out: Array = []
	if not DirAccess.dir_exists_absolute(ROOT): return out
	for dir in DirAccess.get_directories_at(ROOT):
		var path := ROOT.path_join(dir).path_join("meta.json")
		if not FileAccess.file_exists(path): continue
		var meta = JSON.parse_string(FileAccess.get_file_as_string(path))
		if not meta is Dictionary: continue
		meta["path"] = ROOT.path_join(dir).path_join(str(meta.get("latest", "")))
		if FileAccess.file_exists(meta.path): out.append(meta)
	out.sort_custom(func(a, b): return float(a.saved_unix) > float(b.saved_unix) or (float(a.saved_unix) == float(b.saved_unix) and str(a.career_id) < str(b.career_id)))
	return out


## The newest save of any career, or "".
static func latest() -> String:
	var all := list()
	return "" if all.is_empty() else str(all[0].path)


## Load a save; the career keeps its id so later saves go to the same folder.
static func load_path(path: String) -> AirportCareer:
	var career := AirportCareer.load_file(path)
	if career != null and career.career_id.is_empty(): career.career_id = path.get_base_dir().get_file()
	return career
