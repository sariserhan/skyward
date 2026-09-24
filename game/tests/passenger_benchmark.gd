extends SceneTree
## Full Riverdale morning with terminal flow and M3 boarding. Reports the
## baseline (default staffing) against every staff member on a lane, plus tick
## cost with concurrent cabin engines.

func _initialize() -> void:
	for upgraded in [false, true]:
		var sim := AirportSimulation.new()
		sim.setup()
		var pool := int(sim.passenger_flow.config.staff_pool)
		if upgraded:
			sim.set_security("west", 0, 0)
			sim.set_security("east", 0, 0)
			sim.set_security("west", mini(4, pool / 2), mini(4, pool / 2))
			sim.set_security("east", mini(4, pool - pool / 2), mini(4, pool - pool / 2))
		var ticks := int(sim.config.flights[-1].scheduled_departure) - sim.clock.tick + 30000
		var started := Time.get_ticks_usec()
		var worst := 0
		var sessions := 0
		var deboarding := 0
		var peak_active := 0
		for _i in ticks:
			sim.step()
			worst = maxi(worst, sim.last_tick_usec)
			sessions = maxi(sessions, sim.boarding_sessions.size())
			deboarding = maxi(deboarding, sim.deboarding_sessions.size())
			if sim.clock.tick % 600 == 0:
				# In the terminal or in a cabin at the gate (airborne and gone excluded).
				var active := 0
				for state in sim.passenger_flow.counts:
					if not state in ["not_arrived", "departed", "left_airport", "on_aircraft"]: active += int(sim.passenger_flow.counts[state])
				peak_active = maxi(peak_active, active)
		var elapsed := Time.get_ticks_usec() - started
		print("%s: %s" % ["all %d staff on lanes" % pool if upgraded else "default staffing", JSON.stringify(Baseline.measure(sim))])
		print("    %d ticks in %.3f s (%.2f us/tick mean, worst tick %d us), up to %d boarding + %d deboarding cabins, peak %d passengers active, %d total, %d events" % [ticks, elapsed / 1000000.0, float(elapsed) / ticks, worst, sessions, deboarding, peak_active, sim.airport.passengers.size(), sim.events.history.size()])
		for p: Passenger in sim.airport.passengers.values():
			if not p.airport_state in ["departed", "missed_flight", "left_airport"] and p.missed_flight_id.is_empty():
				push_error("Passenger %d ended in %s" % [p.id, p.airport_state])
				quit(1)
				return
		var restored := AirportSimulation.from_snapshot(JSON.parse_string(JSON.stringify(sim.snapshot())))
		if restored == null:
			push_error("Passenger benchmark failed save validation")
			quit(1)
			return
	quit(0)
