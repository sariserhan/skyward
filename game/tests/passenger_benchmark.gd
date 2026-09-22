extends SceneTree

func _initialize() -> void:
	for upgraded in [false, true]:
		var sim := AirportSimulation.new()
		sim.setup()
		if upgraded:
			sim.set_security("west", 3, 3)
			sim.set_security("east", 3, 3)
		var started := Time.get_ticks_usec()
		sim.advance(216000)
		var elapsed := Time.get_ticks_usec() - started
		var ready: int = sim.passenger_flow.counts.get("waiting_at_gate", 0)
		var waits := 0
		var processed := 0
		var late := 0
		for cp: SecurityCheckpoint in sim.airport.security_checkpoints.values():
			waits += cp.total_wait_ticks
			processed += cp.processed
		for p: Passenger in sim.airport.passengers.values():
			if "late_to_gate" in p.risk_flags: late += 1
		print("%s: %d passengers, %d at gate, %d late to target, mean security wait %.2f min, 6h in %.3f s (%.2f us/tick), %d events" % ["6 staffed lanes" if upgraded else "3 staffed lanes", sim.airport.passengers.size(), ready, late, float(waits) / maxi(1, processed) / 600, elapsed / 1000000.0, float(elapsed) / 216000, sim.events.history.size()])
		if ready != sim.airport.passengers.size():
			push_error("Passengers did not finish terminal journey in six hours")
			quit(1)
			return
		var restored := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot())))
		if restored == null:
			push_error("Passenger benchmark failed save validation")
			quit(1)
			return
	quit(0)
