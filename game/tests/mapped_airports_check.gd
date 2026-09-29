extends SceneTree
var failures:=0
func check(value: bool, message: String) -> void:
	if not value:
		failures+=1
		push_error(message)
func _initialize() -> void:
	for code in ["ist","lhr","ams"]:
		var career:=AirportCareer.new()
		career.new_career("res://configs/airports/"+code+".json",42,{"mode":"sandbox"})
		var errors:=career.start_errors()
		check(errors.is_empty(),code+": "+str(errors))
		if not errors.is_empty():continue
		check(career.start_day(),code+" starts")
		if career.sim==null:continue
		var net:=career.sim.airside
		for runway in net.runways():
			for stand in net.config.stands.values():
				check(not net.route(runway.b,stand,"wide").is_empty(),code+" connected arrival")
				check(not net.route(stand,runway.a,"wide").is_empty(),code+" connected departure")
		print(code," validated: ",net.runways().size()," runways / ",net.config.stands.size()," stands / ",career.sim.flight_order.size()," flights")
	print("Mapped airport validation: %d failures" % failures)
	quit(failures)
