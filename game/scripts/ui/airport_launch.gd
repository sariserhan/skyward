class_name AirportLaunch
extends RefCounted
## Hand-off from the main menu to the airport scene (M13): the career to run.
## Empty when the airport scene is opened directly (tests, --scenario=).

const STARTER := "res://configs/airports/career_starter.json"
const SANDBOX := "res://configs/airports/riverdale.json"
const MENU_SCENE := "res://scenes/menu.tscn"
const AIRPORT_SCENE := "res://scenes/airport.tscn"

static var career: AirportCareer = null


## A new career (or sandbox) with its first day started, ready to hand over.
static func start_new(path: String, seed: int, options: Dictionary) -> AirportCareer:
	var c := AirportCareer.new()
	c.new_career(path, seed, options)
	CareerSaves.folder(c)
	c.start_day()
	CareerSaves.autosave(c, "day start")
	return c


static func open(tree: SceneTree, c: AirportCareer) -> void:
	career = c
	tree.change_scene_to_file(AIRPORT_SCENE)
