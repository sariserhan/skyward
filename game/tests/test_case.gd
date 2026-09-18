class_name TestCase
extends RefCounted
## Minimal assertion helper for the headless harness. Each test file extends
## this and defines methods starting with "test_".

var failures: Array[String] = []
var current_test: String = ""
var checks: int = 0


func assert_true(cond: bool, msg: String = "") -> void:
	checks += 1
	if not cond:
		failures.append("%s: %s" % [current_test, msg if msg != "" else "expected true"])


func assert_eq(a, b, msg: String = "") -> void:
	checks += 1
	if a != b:
		failures.append("%s: expected %s == %s%s" % [current_test, str(a), str(b), (" (" + msg + ")") if msg != "" else ""])


func assert_ne(a, b, msg: String = "") -> void:
	checks += 1
	if a == b:
		failures.append("%s: expected %s != %s%s" % [current_test, str(a), str(b), (" (" + msg + ")") if msg != "" else ""])


func assert_lt(a, b, msg: String = "") -> void:
	checks += 1
	if not (a < b):
		failures.append("%s: expected %s < %s%s" % [current_test, str(a), str(b), (" (" + msg + ")") if msg != "" else ""])


func list_tests() -> Array[String]:
	var out: Array[String] = []
	for m in get_method_list():
		if str(m["name"]).begins_with("test_"):
			out.append(m["name"])
	out.sort()
	return out


## Shared fixture helpers -------------------------------------------------

static func full_flight() -> Scenario:
	return Scenario.load_from_file("res://configs/scenarios/full_flight.json")


static func strategy(id: String) -> BoardingStrategy:
	return BoardingStrategy.preset(id, AircraftDef.load_by_id("narrowbody_30"))
