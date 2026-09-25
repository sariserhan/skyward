class_name AirportEconomy
extends RefCounted
## One operating day's money (M10). An append-only list of transactions in
## integer cents, each with a stable id; posting an id twice is refused, so a
## movement can never happen twice (after a reload, a repeated settlement, a
## second call). Revenue comes from real operations at takeoff; costs are the
## day's committed capacity; contracts settle once at the day's end.

const CATEGORIES := ["aircraft", "passengers", "baggage", "contract_bonus", "resources", "security", "fixed", "contract_penalty", "capital"]
const REVENUE := ["aircraft", "passengers", "baggage", "contract_bonus"]
const LABELS := {"aircraft": "Aircraft and gate service", "passengers": "Passenger service", "baggage": "Baggage handling",
	"contract_bonus": "Contract bonuses", "resources": "Turnaround resources", "security": "Security staff",
	"fixed": "Airport operations", "contract_penalty": "Contract penalties", "capital": "Construction (capital)"}

var config: Dictionary = {}
var day: int = 1
var opening_cash_cents: int = 0
var transactions: Array = []
var _ids: Dictionary = {}


func bind(settings: Dictionary) -> void:
	config = settings.duplicate(true)
	day = int(config.get("day", 1))
	opening_cash_cents = int(config.get("opening_cash_cents", config.get("starting_cash_cents", 0)))
	transactions = []
	_ids = {}


func enabled() -> bool:
	return not config.is_empty()


## Record one movement. Refused (false) if its id already exists.
func post(id: String, tick: int, amount_cents: int, category: String, reason: String, airline := "", flight_id := "", ref := "") -> bool:
	if _ids.has(id) or not category in CATEGORIES: return false
	var tx := {"id": id, "day": day, "tick": tick, "amount_cents": amount_cents, "category": category,
		"airline": airline, "flight_id": flight_id, "ref": ref, "reason": reason}
	transactions.append(tx)
	_ids[id] = true
	return true


func has(id: String) -> bool:
	return _ids.has(id)


# --- sources ----------------------------------------------------------------------

## Revenue for one departed flight: aircraft and gate service by type, its
## departed passengers, and its bag handling (loaded out + unloaded in).
func flight_departed(f: AirportFlight, aircraft_type: String, passengers: int, bags_out: int, bags_in: int, now: int) -> void:
	if not enabled(): return
	var fees: Dictionary = config.get("fees", {})
	var prefix := "D%d:%s:" % [day, f.id]
	var service := int(fees.get("aircraft_cents", {}).get(aircraft_type, 0)) + int(fees.get("gate_cents", {}).get(aircraft_type, 0))
	post(prefix + "aircraft", now, service, "aircraft", "%s · %s aircraft and gate service" % [f.flight_number, aircraft_type], f.airline_id, f.id)
	post(prefix + "passengers", now, passengers * int(fees.get("passenger_cents", 0)), "passengers",
		"%s · %d departed passengers" % [f.flight_number, passengers], f.airline_id, f.id)
	var bags := bags_out + bags_in
	post(prefix + "baggage", now, bags * int(fees.get("bag_handling_cents", 0)), "baggage",
		"%s · %d bags handled (%d loaded, %d unloaded)" % [f.flight_number, bags, bags_out, bags_in], f.airline_id, f.id)


## The day's committed costs, charged when the day starts.
static func committed_costs(economy: Dictionary, plan: Dictionary, security_staff: int) -> Array:
	var out: Array = []
	var costs: Dictionary = economy.get("costs", {})
	var types: Array = plan.keys()
	types.sort()
	for type in types:
		var each := int(economy.get("resources", {}).get(type, {}).get("daily_cents", 0))
		out.append({"key": "COST:" + type, "category": "resources", "amount_cents": -each * int(plan[type]),
			"reason": "%s × %d" % [str(economy.get("resources", {}).get(type, {}).get("label", type)), int(plan[type])], "ref": type})
	out.append({"key": "COST:security", "category": "security", "amount_cents": -int(costs.get("security_staff_daily_cents", 0)) * security_staff,
		"reason": "Security staff × %d" % security_staff, "ref": "security"})
	out.append({"key": "COST:fixed", "category": "fixed", "amount_cents": -int(costs.get("fixed_daily_cents", 0)),
		"reason": "Airport operating overhead", "ref": "fixed"})
	return out


static func committed_total(economy: Dictionary, plan: Dictionary, security_staff: int) -> int:
	var total := 0
	for item in committed_costs(economy, plan, security_staff): total -= int(item.amount_cents)
	return total


func charge_day_start(plan: Dictionary, security_staff: int, now: int) -> void:
	for item in committed_costs(config, plan, security_staff):
		post("D%d:%s" % [day, item.key], now, int(item.amount_cents), item.category, "Day %d · %s" % [day, item.reason], "", "", str(item.ref))


## A contract settled at the day's end: its configured bonus or penalty.
func contract_settled(airline: String, airline_name: String, contract: Dictionary, passed: bool, now: int) -> void:
	if not enabled(): return
	var amount := int(contract.get("bonus_cents", 0)) if passed else -int(contract.get("penalty_cents", 0))
	if amount == 0: return
	post("D%d:CONTRACT:%s" % [day, airline], now, amount, "contract_bonus" if passed else "contract_penalty",
		"%s · %s %s" % [airline_name, str(contract.get("label", "")), "PASSED" if passed else "FAILED"], airline, "", str(contract.get("id", "")))


# --- queries ------------------------------------------------------------------------

func cash_cents() -> int:
	return opening_cash_cents + total(transactions)


static func total(list: Array) -> int:
	var sum := 0
	for tx in list: sum += int(tx.amount_cents)
	return sum


## Today's totals by category, revenue and costs, and revenue by airline.
func summary() -> Dictionary:
	var by_category := {}
	for c in CATEGORIES: by_category[c] = 0
	var by_airline := {}
	var revenue := 0
	var costs := 0
	for tx in transactions:
		by_category[tx.category] += int(tx.amount_cents)
		# Capital is not part of the operating result (M11).
		if tx.category == "capital": continue
		if tx.category in REVENUE and int(tx.amount_cents) > 0:
			revenue += int(tx.amount_cents)
			if not str(tx.airline).is_empty(): by_airline[tx.airline] = int(by_airline.get(tx.airline, 0)) + int(tx.amount_cents)
		else: costs -= int(tx.amount_cents)
	return {"by_category": by_category, "by_airline": by_airline, "revenue_cents": revenue, "cost_cents": costs,
		"net_cents": revenue - costs, "opening_cents": opening_cash_cents, "cash_cents": cash_cents()}


func in_category(category: String) -> Array:
	return transactions.filter(func(tx): return tx.category == category)


static func money(cents: int, signed := false) -> String:
	var negative := cents < 0
	var value := absi(cents)
	var whole := str(value / 100)
	var grouped := ""
	for i in whole.length():
		if i > 0 and (whole.length() - i) % 3 == 0: grouped += ","
		grouped += whole[i]
	var text := "$%s.%02d" % [grouped, value % 100] if value % 100 != 0 else "$" + grouped
	if negative: return "−" + text
	return ("+" + text) if signed and cents > 0 else text


# --- persistence ----------------------------------------------------------------------

func snapshot() -> Dictionary:
	return {"day": day, "opening_cash_cents": opening_cash_cents, "transactions": transactions.duplicate(true)}


func restore(data: Dictionary) -> void:
	day = int(data.day)
	opening_cash_cents = int(data.opening_cash_cents)
	transactions = data.transactions.duplicate(true)
	_ids = {}
	for tx in transactions: _ids[tx.id] = true


static func valid_transactions(list, day_limit := -1) -> bool:
	if not list is Array: return false
	var seen := {}
	for tx in list:
		if not tx is Dictionary or not tx.get("id") is String or seen.has(tx.id): return false
		if not tx.get("amount_cents") is int or not tx.get("day") is int or not tx.get("category") in CATEGORIES: return false
		if day_limit >= 0 and int(tx.day) > day_limit: return false
		seen[tx.id] = true
	return true


static func valid_snapshot(data: Dictionary) -> bool:
	var e = data.get("economy")
	if not e is Dictionary: return false
	if not e.get("day") is int or not e.get("opening_cash_cents") is int: return false
	if not valid_transactions(e.get("transactions")): return false
	for tx in e.transactions:
		if int(tx.day) != int(e.day): return false
	return true
