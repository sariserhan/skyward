class_name TestDeboardingFixtures
extends RefCounted
## Shared inbound-manifest builder for deboarding engine tests and sweeps.

static func manifest(cabin: AircraftDef, count: int, seed_value: int, settings := {}) -> Array[Passenger]:
	var rng := SimRng.new(seed_value, SimRng.STREAM_INBOUND)
	var seats := cabin.all_seats()
	rng.shuffle(seats)
	var out: Array[Passenger] = []
	for i in count:
		var p := Passenger.new()
		p.id = i + 1
		p.seat_row = seats[i][0]
		p.seat_letter = seats[i][1]
		p.side = cabin.side_of(p.seat_letter)
		p.walking_speed = rng.randi_range(800, 1200)
		p.carry_on_count = rng.randi_range(0, 2)
		DeboardingSimulation.apply_timing(p, settings, rng)
		out.append(p)
	return out
