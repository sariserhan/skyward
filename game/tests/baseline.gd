class_name Baseline
extends RefCounted
## M3 scenario baseline (D-022): gate timeliness relative to scheduled departure
## D, missed flights, security waits and departures for a finished morning.

static func measure(sim: AirportSimulation) -> Dictionary:
	var total := 0
	var by_d30 := 0
	var by_d10 := 0
	var missed := 0
	var waits: Array = []
	for f: AirportFlight in sim.flight_order:
		missed += f.missed_count
		for id in f.passenger_ids:
			var p: Passenger = sim.airport.passengers[str(id)]
			total += 1
			if p.gate_arrival_time >= 0 and p.gate_arrival_time <= f.scheduled_departure - 18000: by_d30 += 1
			if p.gate_arrival_time >= 0 and p.gate_arrival_time <= f.scheduled_departure - 6000: by_d10 += 1
			if p.security_cleared: waits.append(p.security_wait_ticks)
	waits.sort()
	var pct := func(n: int) -> float: return snappedf(100.0 * n / maxi(1, total), 0.1)
	var quantile := func(q: float) -> float: return 0.0 if waits.is_empty() else snappedf(waits[mini(waits.size() - 1, int(q * waits.size()))] / 600.0, 0.1)
	var metrics := sim.metrics()
	# Bookings (D-034): target = booked; boarded may fall below after misses.
	var target_load := 0.0
	var boarded_load := 0.0
	var originating := 0
	var connecting := 0
	var empty_seats := 0
	var loads: Array = []
	for f: AirportFlight in sim.flight_order:
		var capacity: int = sim.airport.aircraft[f.aircraft_id].seat_capacity
		target_load += 100.0 * f.target_bookings / capacity
		boarded_load += 100.0 * f.boarded_count / capacity
		loads.append(roundi(100.0 * f.passenger_ids.size() / capacity))
		originating += f.originating_bookings
		connecting += f.connecting_bookings
		empty_seats += capacity - f.boarded_count
	loads.sort()
	var flights_with_missed := 0
	var late_over_5 := 0
	var boarding_delayed := 0
	for f: AirportFlight in sim.flight_order:
		if f.missed_count > 0: flights_with_missed += 1
		if f.actual_departure - f.scheduled_departure > 3000: late_over_5 += 1
		if int(f.departure_delay_breakdown.get("boarding", 0)) > 0: boarding_delayed += 1
	return {"passengers": total, "at_gate_by_d30_pct": pct.call(by_d30), "at_gate_by_d10_pct": pct.call(by_d10),
		"missed_pct": pct.call(missed), "flights_with_missed": flights_with_missed,
		"security_wait_min": {"p50": quantile.call(0.5), "p90": quantile.call(0.9), "p99": quantile.call(0.99), "max": quantile.call(1.0)},
		"booked_load_pct": {"mean": snappedf(target_load / sim.flight_order.size(), 0.1), "min": loads[0], "max": loads[-1]},
		"boarded_load_pct": snappedf(boarded_load / sim.flight_order.size(), 0.1), "empty_seats_at_departure": empty_seats,
		"originating_bookings": originating, "connecting_bookings": connecting,
		"departed": metrics.departed, "late_departures": metrics.late, "late_over_5_min": late_over_5,
		"flights_delayed_by_boarding": boarding_delayed, "mean_delay_min": snappedf(metrics.delay_ticks / 600.0 / maxi(1, metrics.departed), 0.1)}
