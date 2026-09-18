class_name JsonUtil
extends RefCounted
## Small helpers for loading JSON config files. Works headless.


static func load_file(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("JsonUtil: file not found: %s" % path)
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	var text := f.get_as_text()
	f.close()
	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("JsonUtil: %s did not parse to a dictionary" % path)
		return {}
	return parsed


static func list_json_files(dir_path: String) -> Array[String]:
	var out: Array[String] = []
	var dir := DirAccess.open(dir_path)
	if dir == null:
		push_error("JsonUtil: cannot open dir %s" % dir_path)
		return out
	dir.list_dir_begin()
	var name := dir.get_next()
	while name != "":
		if not dir.current_is_dir() and name.ends_with(".json"):
			out.append(dir_path.path_join(name))
		name = dir.get_next()
	dir.list_dir_end()
	out.sort()
	return out
