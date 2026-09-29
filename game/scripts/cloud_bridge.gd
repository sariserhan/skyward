extends Node
## Same-origin account wrapper bridge. No code or URLs come from saved games.
var elapsed := 0.0

func _ready() -> void:
	if not OS.has_feature("web"):
		set_process(false)
		return
	JavaScriptBridge.eval("""
window.__skywardCommand = null;
window.addEventListener('message', event => {
 if (event.origin === location.origin && event.source === parent &&
     event.data && event.data.type === 'skyward-game-command') {
  window.__skywardCommand = event.data;
 }
});
parent.postMessage(JSON.stringify({type:'skyward-game-ready'}), location.origin);
""")

func _reply(id: String, ok: bool, value: Variant) -> void:
	var window = JavaScriptBridge.get_interface("window")
	window.parent.postMessage(JSON.stringify({"type":"skyward-game-result","id":id,"ok":ok,"value":value}), window.location.origin)

func _process(delta: float) -> void:
	elapsed += delta
	if elapsed < 0.25: return
	elapsed = 0.0
	var raw = JavaScriptBridge.eval("JSON.stringify(window.__skywardCommand)")
	if raw == null or raw == "null": return
	JavaScriptBridge.eval("window.__skywardCommand = null")
	var command = JSON.parse_string(str(raw))
	if not command is Dictionary: return
	var id := str(command.get("id", ""))
	match command.get("action"):
		"snapshot":
			var scene := get_tree().current_scene
			var career: AirportCareer = null
			for property in scene.get_property_list():
				if property.name == "career": career = scene.get("career")
			if career == null:
				_reply(id, false, "Start or load an airport career first.")
			else:
				_reply(id, true, career.snapshot())
		"restore":
			var snapshot = command.get("value")
			if not snapshot is Dictionary:
				_reply(id, false, "Invalid career backup.")
				return
			var career := AirportCareer.from_snapshot(snapshot)
			if career == null:
				_reply(id, false, "This save is invalid or belongs to another game version.")
				return
			# Uploaded ids must never become filesystem paths.
			career.career_id = CareerSaves.new_id(career.airport_name, career.career_seed)
			if CareerSaves.save_manual(career) != OK:
				_reply(id, false, "Unable to save the restored career on this device.")
				return
			AirportLaunch.open(get_tree(), career)
			_reply(id, true, "Career restored.")
		"scenario":
			var scenarios := {
				"starter": AirportLaunch.STARTER, "dulles": AirportLaunch.DULLES,
				"istanbul": "res://configs/airports/ist.json", "heathrow": "res://configs/airports/lhr.json", "schiphol": "res://configs/airports/ams.json",
				"sandbox": AirportLaunch.SANDBOX,
				"taxiway": "res://configs/airports/riverdale_single_taxiway.json",
				"baggage": "res://configs/airports/riverdale_baggage_crunch.json",
				"shortage": "res://configs/airports/riverdale_shortage.json"}
			var key := str(command.get("value", ""))
			if not scenarios.has(key):
				_reply(id, false, "Choose a supported scenario.")
				return
			var career := AirportLaunch.start_new(scenarios[key], 42, {"mode":"sandbox" if key != "starter" else "career"})
			AirportLaunch.open(get_tree(), career)
			_reply(id, true, "Scenario started.")
