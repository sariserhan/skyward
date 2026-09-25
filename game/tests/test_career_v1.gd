extends TestCase
## M13: Career V1. The starter career, objectives from real metrics, tips that
## never repeat, growth earned by performance, autosave and continue,
## insolvency, sandbox isolation and determinism. See docs/m13-plan.md.

const STARTER := "res://configs/airports/career_starter.json"
const TEST_SAVES := "user://saves"


class FakeMain:
	extends RefCounted
	var career: AirportCareer
	var sim: AirportSimulation
	var day_panel = null
	var day_tabs = null


func starter(seed := 5313, difficulty := "standard") -> AirportCareer:
	var c := AirportCareer.new()
	c.new_career(STARTER, seed, {"mode": "career", "name": "Test Field", "difficulty": difficulty, "id": "test-%d-%s" % [seed, difficulty]})
	return c


## A day played by a simple policy: open the second security lane when a queue
## builds (as the first tip suggests), accept or decline requests.
func play_day(c: AirportCareer, open_lane := true, accept := true) -> Dictionary:
	assert_true(c.start_day(), "day %d starts: %s" % [c.day, str(c.start_errors())])
	var s := c.sim
	while not c.day_complete():
		s.step()
		if open_lane:
			var cp: SecurityCheckpoint = s.airport.security_checkpoints.main
			if cp.queue.size() >= 20 and cp.open_lanes < cp.max_lanes: s.set_security("main", cp.open_lanes + 1, cp.staff + 1)
		for airline in s.airlines.airline_ids:
			if s.airlines.state[airline].request == "offered": s.answer_airline_request(airline, accept)
	c.settle_day()
	return c.reports[-1]


# --- creation ---------------------------------------------------------------------------------

func test_new_career_is_the_small_deterministic_starter() -> void:
	var a := starter()
	var b := starter()
	assert_eq(JSON.stringify(a.day_config()), JSON.stringify(b.day_config()), "same seed and options → the same airport and day")
	var config := a.day_config()
	assert_eq(config.get("_errors", []), [])
	assert_eq(a.mode, "career")
	assert_eq(a.airport_name, "Test Field")
	assert_eq(config.gates.size(), 3, "three narrowbody gates")
	assert_true(config.gates.all(func(g): return g.type == "narrow"), "no widebody service at first")
	assert_eq(config.airside.runways.size(), 1)
	assert_eq(int(config.airside.runways[0].length_m), 2400, "a runway too short for the 787")
	assert_eq(config.passenger_flow.checkpoints.size(), 1, "one security checkpoint")
	assert_eq(config.flights.size(), 6, "six flights on day 1")
	assert_eq(config.airlines.size(), 3)
	# Built from real construction objects.
	assert_true(a.layout.count("gate_narrow") == 3 and a.layout.count("security_lane") == 2)
	assert_true(a.layout.sites.has("pad_B4") and a.layout.sites.has("pad_B6") and a.layout.sites.pad_B6.pad_class == "wide")


func test_difficulty_changes_economics_not_physics() -> void:
	var relaxed := starter(5313, "relaxed")
	var standard := starter(5313, "standard")
	var hard := starter(5313, "challenging")
	assert_lt(hard.starting_cash_cents, standard.starting_cash_cents)
	assert_lt(standard.starting_cash_cents, relaxed.starting_cash_cents)
	var term := func(c: AirportCareer) -> float: return float(c.base.airline_relations.contracts.starter_service.terms[1].max)
	assert_lt(term.call(hard), term.call(standard), "stricter contracts")
	assert_lt(term.call(standard), term.call(relaxed), "looser contracts")
	var threshold := func(c: AirportCareer) -> int: return int(c.base.airline_relations.profiles.NS.requests[0].min_relationship)
	assert_lt(threshold.call(relaxed), threshold.call(hard), "growth needs more on challenging")
	for key in ["turnaround", "boarding", "deboarding", "aircraft_types", "airside", "passenger_flow", "baggage", "flights"]:
		assert_eq(JSON.stringify(relaxed.base[key]), JSON.stringify(hard.base[key]), key + " is the same simulation on every difficulty")


# --- objectives ---------------------------------------------------------------------------------

func _report(fields := {}) -> Dictionary:
	var r := {"day": 1, "flights": 6, "passengers": 600, "mean_delay_min": 3.0, "net_cents": 100000, "missed_connections": 0,
		"contracts": {"NS": {"status": "PASSED", "relationship": 75}, "SJ": {"status": "PASSED", "relationship": 82}, "GA": {"status": "FAILED", "relationship": 55}},
		"story": {"widebody_departed": 0, "taxi_wait_ticks": 0}}
	r.merge(fields, true)
	return r


func test_objectives_are_judged_from_real_metrics() -> void:
	var c := starter()
	var chapter := CareerProgress.active(c)
	assert_eq(chapter.id, "operate")
	# A day with 7-minute mean delay: the primary is met, one optional is not, and why.
	var completed := CareerProgress.advance(c, _report({"mean_delay_min": 7.0}))
	assert_eq(completed, ["operate"], "handling the day completes chapter 1")
	var delay: Dictionary = c.progress.results.filter(func(r): return r.id == "op_delay")[0]
	assert_true(not delay.met and delay.value == "7.0 min" and delay.target == "≤ 5.0 min", "a missed objective says actual vs target")
	assert_true(c.progress.done.has("op_profit") and not c.progress.done.has("op_delay"))
	# Chapter 2: every contract must pass on one day.
	assert_eq(CareerProgress.active(c).id, "improve")
	CareerProgress.advance(c, _report({"day": 2}))
	assert_true(not c.progress.done.has("imp_contracts"), "GA failed: not every contract passed")
	assert_true(c.progress.done.has("imp_relationship"), "SJ at 82")
	var all_passed := _report({"day": 3})
	all_passed.contracts.GA.status = "PASSED"
	assert_eq(CareerProgress.advance(c, all_passed), ["improve"])
	# Chapter 3's gate objective is a state objective: building completes it at once.
	assert_eq(CareerProgress.active(c).id, "grow")
	c.starting_cash_cents += 100000000
	assert_true(not c.build("gate_narrow", "pad_B4").has("error"))
	assert_true(c.progress.done.has("grow_gate"), "the fourth gate counts when built")
	assert_eq(CareerProgress.active(c).id, "grow", "the primary (9 departures) still needs a day")


func test_the_milestone_needs_everything_at_once() -> void:
	var c := starter()
	var m := CareerProgress.milestone(c.base)
	var good := _report({"flights": 14})
	for airline in good.contracts: good.contracts[airline].relationship = 70
	assert_true(not CareerProgress.check(m, c, good).met, "no 787 served yet")
	good.story.widebody_departed = 1
	assert_true(CareerProgress.check(m, c, good).met)
	good.net_cents = -1
	assert_true(not CareerProgress.check(m, c, good).met, "not while losing money")


# --- tips -------------------------------------------------------------------------------------

func test_tips_do_not_repeat_even_after_loading() -> void:
	var c := starter()
	assert_true(c.start_day())
	GameSettings.set_value("tips", true)
	var fake := FakeMain.new()
	fake.career = c
	fake.sim = c.sim
	var tips := TutorialDirector.new()
	tips.setup(fake)
	tips.check()
	assert_eq(tips.current, "welcome")
	tips.dismiss()
	assert_true("welcome" in c.tutorial_done)
	tips.check()
	assert_true(tips.current != "welcome", "a dismissed tip does not come back")
	if not tips.current.is_empty(): tips.dismiss()
	var loaded := AirportCareer.from_snapshot(JSON.parse_string(JSON.stringify(c.snapshot())))
	assert_true(loaded != null)
	fake.career = loaded
	fake.sim = loaded.sim
	tips.check()
	assert_true(tips.current != "welcome", "nor after a save and load")
	# The sandbox shows no tips at all.
	var sandbox := AirportCareer.new()
	sandbox.new_career("", -1, {"mode": "sandbox"})
	sandbox.start_day()
	fake.career = sandbox
	fake.sim = sandbox.sim
	tips.current = ""
	tips.check()
	assert_eq(tips.current, "", "no tips in the sandbox")
	tips.free()


# --- days, growth, construction ----------------------------------------------------------------

func test_growth_is_earned_and_construction_persists() -> void:
	var good := starter()
	var r1 := play_day(good, true, true)
	var accepted: Array = good.request_status.keys().filter(func(id): return good.request_status[id] == "accepted")
	assert_true(not accepted.is_empty(), "a well-run day earns at least one request: %s" % str(good.request_status))
	# Accepted flights need a gate: the next day cannot start until one is built.
	assert_true(good.start_errors().any(func(e): return e.contains("no compatible available gate")), str(good.start_errors()))
	var cash := good.settled_cash_cents()
	assert_true(not good.build("gate_narrow", "pad_B4").has("error"))
	assert_eq(good.settled_cash_cents(), cash - 4500000, "the gate is paid once")
	assert_eq(good.start_errors(), [])
	var r2 := play_day(good, true, true)
	assert_true(int(r2.flights) > int(r1.flights), "more flights on day 2 (%d → %d)" % [r1.flights, r2.flights])
	assert_eq(good.layout.built_gate_ids().size(), 4, "the gate is still there on day 3")
	assert_true(good.day_config().gates.any(func(g): return g.id == "B4"))
	# Neglect: no second lane opened, requests declined. Growth does not come for free.
	var poor := starter()
	play_day(poor, false, false)
	assert_true(poor.request_status.values().all(func(s): return s == "declined"), "nothing accepted when requests are declined")
	assert_eq(poor.day_config().flights.size(), 6, "no growth")


func test_a_bad_day_is_not_the_end() -> void:
	var c := starter(5313, "challenging")
	# Minimum everything and no second lane: a bad day.
	for type in c.resource_plan: c.set_units(type, int(c.base.economy.resources[type].min))
	var r := play_day(c, false, false)
	assert_true(int(r.net_cents) < 0, "a losing day (%s)" % AirportEconomy.money(int(r.net_cents), true))
	assert_true(not c.insolvent() and c.can_start(), "the career goes on")
	assert_eq(c.phase, "planning")


func test_an_unkept_promise_can_be_withdrawn() -> void:
	var c := starter()
	c.request_status["NS_ROTATION"] = "accepted"
	assert_true(not c.start_errors().is_empty(), "the accepted rotation needs a gate")
	assert_eq(c.blocking_requests().map(func(r): return r.id), ["NS_ROTATION"])
	var before := int(c.base.airline_relations.profiles.NS.starting_relationship)
	assert_true(c.withdraw_request("NS_ROTATION"))
	assert_eq(c.start_errors(), [], "the day can start again")
	assert_eq(int(c.relationships.NS), before + AirportCareer.WITHDRAW_POINTS, "Northstar remembers")
	assert_eq(c.next_request("NS").id, "NS_ROTATION", "and may ask again later")


func test_construction_cannot_bankrupt_the_career() -> void:
	var c := starter()
	var reserve := c.committed_cost_cents(c.minimum_plan())
	c.starting_cash_cents = reserve + 4000000
	var refused := c.build("gate_narrow", "pad_B4")
	assert_true(refused.get("error", "").contains("minimum operation"), "a gate that would leave less than tomorrow's minimum plan is refused: %s" % str(refused))
	assert_true(not c.insolvent())
	c.starting_cash_cents = reserve + 4500000
	assert_true(not c.build("gate_narrow", "pad_B4").has("error"), "exactly enough is fine")
	assert_true(not c.insolvent() and c.can_start() == (c.settled_cash_cents() >= c.committed_cost_cents()))


func test_insolvency_is_the_only_hard_failure() -> void:
	var c := starter()
	c.starting_cash_cents = 1000
	assert_true(c.insolvent(), "even the minimum plan cannot be paid for")
	assert_true(not c.can_start())
	assert_true(not c.start_day())


# --- saves ------------------------------------------------------------------------------------

func test_autosaves_restore_and_rotate() -> void:
	var c := starter(7001)
	c.career_id = "test-autosave-%d" % Time.get_ticks_usec()
	assert_true(c.start_day())
	for _i in 3000: c.sim.step()
	assert_eq(CareerSaves.autosave(c, "test"), OK)
	var loaded := CareerSaves.load_path(CareerSaves.list().filter(func(m): return m.career_id == c.career_id)[0].path)
	assert_true(loaded != null)
	assert_eq(JSON.stringify(loaded.snapshot()), JSON.stringify(c.snapshot()), "the autosave restores exactly")
	for _i in 4: CareerSaves.autosave(c, "test")
	var files: Array = Array(DirAccess.get_files_at(CareerSaves.folder(c))).filter(func(f): return f.begins_with("auto_"))
	assert_eq(files.size(), CareerSaves.AUTOSAVE_KEEP, "only the newest autosaves are kept")
	_remove(CareerSaves.folder(c))


func test_continue_loads_the_newest_save() -> void:
	var older := starter(7002)
	older.career_id = "test-older-%d" % Time.get_ticks_usec()
	var newer := starter(7003)
	newer.career_id = "test-newer-%d" % Time.get_ticks_usec()
	assert_eq(CareerSaves.save_manual(older), OK)
	# Saves within one second are ordered by time, then id: make the newer one newer.
	var meta_path := CareerSaves.folder(older).path_join("meta.json")
	var meta = JSON.parse_string(FileAccess.get_file_as_string(meta_path))
	meta.saved_unix = float(meta.saved_unix) - 60.0
	FileAccess.open(meta_path, FileAccess.WRITE).store_string(JSON.stringify(meta))
	assert_eq(CareerSaves.save_manual(newer), OK)
	var latest := CareerSaves.load_path(CareerSaves.latest())
	assert_true(latest != null and latest.career_id == newer.career_id, "CONTINUE picks the newest")
	assert_eq(latest.career_seed, 7003)
	_remove(CareerSaves.folder(older))
	_remove(CareerSaves.folder(newer))


func test_saves_keep_career_state_and_reject_older_versions() -> void:
	var c := starter()
	c.tutorial_done = ["welcome", "security_queue"]
	CareerProgress.advance(c, _report())
	var data: Dictionary = JSON.parse_string(JSON.stringify(c.snapshot()))
	var loaded := AirportCareer.from_snapshot(data.duplicate(true))
	assert_true(loaded != null)
	for key in ["mode", "airport_name", "difficulty", "career_id"]: assert_eq(loaded.get(key), c.get(key))
	assert_eq(loaded.tutorial_done, c.tutorial_done)
	assert_eq(JSON.stringify(loaded.progress), JSON.stringify(AirportSimulation._integer_json(c.progress)))
	var bad: Dictionary = data.duplicate(true)
	bad.version = 12
	assert_true(AirportCareer.from_snapshot(bad) == null, "v12 is rejected")
	bad = data.duplicate(true)
	bad.career.progress.done["not_an_objective"] = 1
	assert_true(AirportCareer.from_snapshot(bad) == null, "unknown objectives are rejected")
	bad = data.duplicate(true)
	bad.career.difficulty = "impossible"
	assert_true(AirportCareer.from_snapshot(bad) == null, "unknown difficulty is rejected")


# --- isolation and determinism ------------------------------------------------------------------

func test_the_sandbox_is_riverdale_unchanged() -> void:
	var sandbox := AirportCareer.new()
	sandbox.new_career(AirportLaunch.SANDBOX, -1, {"mode": "sandbox", "name": "Riverdale International"})
	var plain := AirportCareer.new()
	plain.new_career()
	assert_eq(sandbox.mode, "sandbox")
	assert_eq(JSON.stringify(sandbox.day_config()), JSON.stringify(plain.day_config()), "the sandbox day is the regression day")
	assert_eq(CareerProgress.chapters(sandbox.base), [], "no objectives in the sandbox")
	assert_eq(sandbox.starting_cash_cents, int(AirportSimulation.load_config(AirportSimulation.CONFIG_PATH).economy.starting_cash_cents))


func test_same_seed_same_actions_same_results() -> void:
	var runs: Array = []
	for _i in 2:
		var c := starter(4242)
		c.set_units("fuel_unit", 2)
		play_day(c, true, true)
		c.build("gate_narrow", "pad_B4")
		runs.append(JSON.stringify(c.snapshot()))
	assert_eq(runs[0], runs[1], "identical careers")


func test_the_report_tells_the_story() -> void:
	var c := starter()
	var r := play_day(c, true, true)
	var story: Dictionary = r.story
	for key in ["late", "resources", "security", "baggage", "contracts", "taxiways", "worst_inbound"]: assert_true(story.has(key), key)
	for airline in story.contracts:
		for term in story.contracts[airline].terms: assert_true(not str(term.target).is_empty(), "each term has a target")
	for i in range(1, story.late.size()): assert_true(int(story.late[i - 1].late_ticks) >= int(story.late[i].late_ticks), "worst first")
	var text := CareerText.report_text(c, r)
	assert_true(text.contains("WHAT WENT WELL") and text.contains("WHAT HURT") and text.contains("OBJECTIVES"))
	assert_eq(r.objectives.size(), 4, "chapter 1: one primary, three optional")


func _remove(dir: String) -> void:
	for file in DirAccess.get_files_at(dir): DirAccess.remove_absolute(dir.path_join(file))
	DirAccess.remove_absolute(dir)
