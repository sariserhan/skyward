extends SceneTree
var failures:=0
func check(value: bool, message: String) -> void:
	if not value:
		failures+=1
		push_error(message)
func _initialize() -> void:
	var guard:=AirportClearance.new()
	guard.setup({"surfaces":[{"kind":"terminal","height":12,"points":[[0,0],[20,0],[20,20],[0,20]]}]})
	check(not guard.clear(Vector3(10,0,10),1),"Interior blocked")
	check(not guard.clear(Vector3(-2,0,10),3),"Vehicle radius protects edge")
	check(guard.clear(Vector3(-4,0,10),3),"Exterior clear")
	check(guard.clear(Vector3(10,20,10),3),"Aircraft above roof clear")
	var stopped:=guard.sweep(Vector3(-30,0,10),Vector3(40,0,10),3)
	check(stopped.x<=-3 and guard.clear(stopped,3),"Long update must not tunnel through terminal")
	var placement:=guard.safe_position(Vector3(10,0,10),5)
	check(placement.ok and guard.clear(placement.position,5),"Initial safe placement outside wall")
	check(guard.sweep(Vector3(-30,0,-10),Vector3(40,0,-10),3).is_equal_approx(Vector3(40,0,-10)),"Clear taxi motion continues")
	print("Airport building clearance checks: %d failures" % failures)
	quit(failures)
