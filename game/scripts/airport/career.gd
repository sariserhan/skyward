class_name AirportCareer
extends RefCounted
## Multi-day operation (M10). The career is the persistent layer: cash and its
## ledger, day number, airline relationships, request decisions and activated
## growth, the resource plan, contract history and day reports. Each operating
## day is a fresh AirportSimulation built from the base scenario plus that
## state; nothing operational (passengers, bags, tasks, assignments) survives
## into the next day.
##
## Money: cash is always starting cash + every settled transaction (+ today's,
## while operating). Transactions have stable ids and a day is settled once, so
## a reload or a repeated call can never pay or charge twice.

const PHASES := ["planning", "operating"]

var scenario_path := ""
var base: Dictionary = {}
var career_seed: int = 0
var day: int = 1
var phase := "planning"
var starting_cash_cents: int = 0
var ledger: Array = []
var relationships: Dictionary = {}
## Request id -> "accepted" / "declined" / "activated".
var request_status: Dictionary = {}
var resource_plan: Dictionary = {}
var contract_history: Array = []
var reports: Array = []
var settled_days: Array = []
## The day being operated (null while planning), and the last finished one
## (for the report screen; not saved).
var sim: AirportSimulation
var finished: AirportSimulation
var _ledger_ids: Dictionary = {}


func new_career(path := "", seed := -1) -> void:
	scenario_path = path if not path.is_empty() else AirportSimulation.CONFIG_PATH
	base = AirportSimulation.load_config(scenario_path)
	career_seed = int(base.seed) if seed < 0 else seed
	day = 1
	phase = "planning"
	starting_cash_cents = int(base.get("economy", {}).get("starting_cash_cents", 0))
	ledger = []
	_ledger_ids = {}
	relationships = {}
	request_status = {}
	resource_plan = {}
	for type in base.get("resources", {}): resource_plan[type] = int(base.resources[type].units)
	contract_history = []
	reports = []
	settled_days = []
	sim = null
	finished = null


# --- money ------------------------------------------------------------------------

## Cash from the settled ledger (between days, and the opening cash of today).
func settled_cash_cents() -> int:
	return starting_cash_cents + AirportEconomy.total(ledger)


## Cash including today's transactions so far.
func cash_cents() -> int:
	return settled_cash_cents() + (AirportEconomy.total(sim.economy.transactions) if sim != null else 0)


func security_staff() -> int:
	return int(base.get("passenger_flow", {}).get("staff_pool", 0))


func committed_cost_cents(plan := {}) -> int:
	return AirportEconomy.committed_total(base.get("economy", {}), resource_plan if plan.is_empty() else plan, security_staff())


func minimum_plan() -> Dictionary:
	var out := {}
	for type in resource_plan: out[type] = int(base.economy.resources.get(type, {}).get("min", 0))
	return out


## Next-day capacity, only between days and within the configured range.
func set_units(type: String, units: int) -> bool:
	if phase != "planning" or not resource_plan.has(type): return false
	var limits: Dictionary = base.economy.resources.get(type, {})
	if units < int(limits.get("min", 0)) or units > int(limits.get("max", units)): return false
	resource_plan[type] = units
	return true


## The day's committed cost must be covered before it starts.
func can_start() -> bool:
	return phase == "planning" and settled_cash_cents() >= committed_cost_cents()


## Not even the minimum plan can be paid for: the career cannot continue.
func insolvent() -> bool:
	return phase == "planning" and settled_cash_cents() < committed_cost_cents(minimum_plan())


# --- days ---------------------------------------------------------------------------

## Day 1 runs on the scenario's own seed; later days on a fixed mix of the
## career seed and the day number (never on wall-clock time).
func day_seed(n: int) -> int:
	if n == 1: return career_seed
	return absi((career_seed * 1000003 + n * 7919 * 104729) % 2147483647)


func expansion_tiers(airline: String) -> Array:
	return base.get("airline_relations", {}).get("profiles", {}).get(airline, {}).get("requests", [])


## The request an airline may offer today: its first undecided tier, provided
## every earlier tier was accepted. A declined tier ends that airline's growth.
func next_request(airline: String) -> Dictionary:
	for tier in expansion_tiers(airline):
		var status: String = request_status.get(tier.id, "")
		if status == "": return tier
		if status == "declined": return {}
	return {}


## The base scenario plus everything the career has decided.
func day_config() -> Dictionary:
	var c: Dictionary = base.duplicate(true)
	c.seed = day_seed(day)
	for airline in c.get("airline_relations", {}).get("profiles", {}):
		for tier in expansion_tiers(airline):
			# Accepted tiers fly from the next day on (activated at its start).
			if request_status.get(tier.id, "") in ["accepted", "activated"]:
				for flight in tier.flights: c.flights.append(flight.duplicate(true))
	for type in resource_plan: c.resources[type].units = int(resource_plan[type])
	var profiles: Dictionary = c.get("airline_relations", {}).get("profiles", {})
	for airline in profiles:
		var profile: Dictionary = profiles[airline]
		if relationships.has(airline): profile.starting_relationship = int(relationships[airline])
		profile.erase("requests")
		profile.erase("request")
		var request := next_request(airline)
		if not request.is_empty(): profile.request = request.duplicate(true)
	c.economy.day = day
	c.economy.opening_cash_cents = settled_cash_cents()
	return c


func start_day() -> bool:
	if not can_start(): return false
	for id in request_status:
		if request_status[id] == "accepted": request_status[id] = "activated"
	sim = AirportSimulation.new()
	sim.setup(day_config())
	sim.economy.charge_day_start(resource_plan, security_staff(), sim.clock.tick)
	phase = "operating"
	finished = null
	return true


func day_complete() -> bool:
	if phase != "operating" or sim == null: return false
	for f: AirportFlight in sim.flight_order:
		if f.status != "departed": return false
	return true


## Close the day exactly once: let the last passengers leave and bags settle,
## move today's transactions into the ledger, keep relationships, request
## decisions, contract results and the report, and drop the day's entities.
func settle_day() -> bool:
	if not day_complete() or day in settled_days: return false
	_finish_flows()
	for tx in sim.economy.transactions:
		if _ledger_ids.has(tx.id): continue
		ledger.append(tx.duplicate(true))
		_ledger_ids[tx.id] = true
	for airline in sim.airlines.airline_ids:
		relationships[airline] = int(sim.airlines.evaluations[airline].relationship)
		var s: Dictionary = sim.airlines.state[airline]
		if s.request in ["accepted", "declined"] and not str(s.get("request_id", "")).is_empty():
			request_status[s.request_id] = s.request
		var c: Dictionary = sim.airlines.evaluations[airline].contract
		if not c.label.is_empty():
			var tx_id := "D%d:CONTRACT:%s" % [day, airline]
			var amount := 0
			for tx in ledger:
				if tx.id == tx_id: amount = int(tx.amount_cents)
			contract_history.append({"day": day, "airline": airline, "contract": c.id, "status": c.status, "amount_cents": amount})
	reports.append(_report())
	settled_days.append(day)
	finished = sim
	sim = null
	day += 1
	phase = "planning"
	return true


## After the last departure: arrivals finish reclaim and leave (bounded).
func _finish_flows() -> void:
	for _i in 36000:
		if sim.baggage.pending.is_empty() and sim.passenger_flow.pending.is_empty(): return
		sim.step()


## The settled day's money and the operations behind it.
func _report() -> Dictionary:
	var summary := sim.economy.summary()
	var passengers := 0
	var delay := 0
	for f: AirportFlight in sim.flight_order:
		delay += maxi(0, f.actual_departure - f.scheduled_departure)
		for id in f.passenger_ids:
			var p: Passenger = sim.airport.passengers[str(id)]
			if p.current_flight_id == f.id and p.airport_state == "departed": passengers += 1
	var bags := sim.baggage_metrics()
	var connections := sim.connection_metrics()
	var contracts := {}
	for airline in sim.airlines.airline_ids:
		var e: Dictionary = sim.airlines.evaluations[airline]
		contracts[airline] = {"contract": e.contract.label, "status": e.contract.status, "relationship": e.relationship}
	return {"day": day, "opening_cents": summary.opening_cents, "by_category": summary.by_category, "by_airline": summary.by_airline,
		"revenue_cents": summary.revenue_cents, "cost_cents": summary.cost_cents, "net_cents": summary.net_cents,
		"closing_cents": settled_cash_cents(), "flights": sim.flight_order.size(), "passengers": passengers,
		"mean_delay_min": snappedf(delay / 600.0 / maxi(1, sim.flight_order.size()), 0.1), "missed_connections": int(connections.missed),
		"missed_bags": int(bags.transfer_missed) + int(bags.missed_flight), "contracts": contracts}


## The flights tomorrow will operate (base schedule plus activated growth).
func expected_flights() -> int:
	return day_config().flights.size()


# --- persistence ----------------------------------------------------------------------

func snapshot() -> Dictionary:
	return AirportSimulation._integer_json({"version": AirportSimulation.SAVE_VERSION, "kind": "career",
		"career": {"scenario_path": scenario_path, "base": base.duplicate(true), "career_seed": career_seed, "day": day, "phase": phase,
			"starting_cash_cents": starting_cash_cents, "cash_cents": settled_cash_cents(), "ledger": ledger.duplicate(true),
			"relationships": relationships.duplicate(), "request_status": request_status.duplicate(), "resource_plan": resource_plan.duplicate(),
			"contract_history": contract_history.duplicate(true), "reports": reports.duplicate(true), "settled_days": settled_days.duplicate()},
		"day": sim.snapshot() if sim != null else null})


static func from_snapshot(data: Dictionary) -> AirportCareer:
	data = AirportSimulation._integer_json(data)
	if int(data.get("version", -1)) != AirportSimulation.SAVE_VERSION or data.get("kind") != "career": return null
	var c = data.get("career")
	if not c is Dictionary: return null
	for key in ["scenario_path", "base", "career_seed", "day", "phase", "starting_cash_cents", "cash_cents", "ledger", "relationships",
			"request_status", "resource_plan", "contract_history", "reports", "settled_days"]:
		if not c.has(key): return null
	if not c.phase in PHASES or not c.day is int or c.day < 1 or not c.settled_days is Array: return null
	# Settled days are exactly 1 .. day-1, and the ledger never runs ahead.
	if c.settled_days.size() != c.day - 1: return null
	for i in c.settled_days.size():
		if int(c.settled_days[i]) != i + 1: return null
	if not AirportEconomy.valid_transactions(c.ledger, c.day - 1): return null
	# Cash reconciles to the cent.
	if int(c.cash_cents) != int(c.starting_cash_cents) + AirportEconomy.total(c.ledger): return null
	for id in c.request_status:
		if not c.request_status[id] in ["accepted", "declined", "activated"]: return null
	var limits: Dictionary = c.base.get("economy", {}).get("resources", {})
	for type in c.resource_plan:
		if not limits.has(type) or int(c.resource_plan[type]) < int(limits[type].get("min", 0)) or int(c.resource_plan[type]) > int(limits[type].get("max", 1 << 30)): return null
	var career := AirportCareer.new()
	career.scenario_path = c.scenario_path
	career.base = c.base
	career.career_seed = c.career_seed
	career.day = c.day
	career.phase = c.phase
	career.starting_cash_cents = c.starting_cash_cents
	career.ledger = c.ledger
	for tx in career.ledger: career._ledger_ids[tx.id] = true
	career.relationships = c.relationships
	career.request_status = c.request_status
	career.resource_plan = c.resource_plan
	career.contract_history = c.contract_history
	career.reports = c.reports
	career.settled_days = c.settled_days
	if c.phase == "operating":
		if not data.get("day") is Dictionary: return null
		career.sim = AirportSimulation.from_snapshot(data.day)
		if career.sim == null or career.sim.economy.day != c.day: return null
		if career.sim.economy.opening_cash_cents != career.settled_cash_cents(): return null
		for tx in career.sim.economy.transactions:
			if career._ledger_ids.has(tx.id): return null
	elif data.get("day") != null: return null
	return career


func save_file(path: String) -> Error:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null: return FileAccess.get_open_error()
	file.store_string(JSON.stringify(snapshot()))
	return OK


static func load_file(path: String) -> AirportCareer:
	if not FileAccess.file_exists(path): return null
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	return from_snapshot(parsed) if parsed is Dictionary else null
