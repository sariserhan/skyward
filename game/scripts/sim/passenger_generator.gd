class_name PassengerGenerator
extends RefCounted
## Procedurally generates a manifest from a scenario seed. Deterministic:
## same aircraft + count + seed + config always yields the same manifest.


static func generate(aircraft: AircraftDef, count: int, seed_value: int, config: SimConfig) -> Array[Passenger]:
	assert(count >= 0 and count <= aircraft.capacity(), "passenger_count exceeds aircraft capacity")
	var rng := SimRng.new(seed_value, SimRng.STREAM_PASSENGERS)

	# Choose which seats are occupied for this load factor.
	var seats := aircraft.all_seats()
	rng.shuffle(seats)
	var chosen := seats.slice(0, count)
	# Stable, readable ids: sort chosen seats by row then cabin position.
	var letter_index := {}
	var letters := aircraft.letters()
	for i in letters.size():
		letter_index[letters[i]] = i
	chosen.sort_custom(func(a, b):
		if a[0] != b[0]:
			return a[0] < b[0]
		return letter_index[a[1]] < letter_index[b[1]]
	)

	var out: Array[Passenger] = []
	for i in chosen.size():
		var p := Passenger.new()
		p.id = i + 1
		p.seat_row = chosen[i][0]
		p.seat_letter = chosen[i][1]
		p.seat_type = aircraft.seat_type_of(p.seat_letter)
		p.side = aircraft.side_of(p.seat_letter)

		p.walking_speed = rng.randi_range(config.speed_min_permille, config.speed_max_permille)
		p.carry_on_count = rng.weighted_index(config.bag_weights)
		apply_cabin_timing(p, config, rng)
		p.state = Passenger.State.WAITING
		out.append(p)
	return out


## Derive boarding-tick durations from a passenger's speed and carry-ons. Shared
## by the standalone generator and airport passengers so the formulas cannot
## drift. Always draws both variations, keeping the RNG stream stable.
static func apply_cabin_timing(p: Passenger, config: SimConfig, rng: SimRng) -> void:
	p.walk_ticks_per_cell = maxi(1, _div_round(config.walk_ticks_per_cell * 1000, p.walking_speed))
	var stow_var := rng.randi_range(-config.stow_variation_ticks, config.stow_variation_ticks)
	if p.carry_on_count > 0:
		p.luggage_stow_duration = maxi(1,
			config.stow_base_ticks + config.stow_per_bag_ticks * p.carry_on_count + stow_var)
	else:
		p.luggage_stow_duration = 0
	var seat_var := rng.randi_range(-config.seat_variation_ticks, config.seat_variation_ticks)
	p.seat_access_duration = maxi(1, config.seat_base_ticks + seat_var)


static func _div_round(num: int, den: int) -> int:
	return int((num + den / 2) / den)
