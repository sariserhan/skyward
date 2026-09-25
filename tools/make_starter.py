#!/usr/bin/env python3
"""Generate game/configs/airports/career_starter.json (M13 starter career).

The starter airport is its own scenario, but it shares Riverdale's aircraft
types, turnaround tasks, boarding/deboarding timings, fee tables, scoring and
baggage handling times: they are copied from riverdale.json here so the two
cannot drift apart silently. Re-run after changing either:

    python3 tools/make_starter.py
"""
import copy
import json
import math
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AIRPORTS = os.path.join(ROOT, "game", "configs", "airports")
R = json.load(open(os.path.join(AIRPORTS, "riverdale.json")))


def hm(h, m):
    """Simulation tick of a clock time (10 ticks per second)."""
    return (h * 3600 + m * 60) * 10


def flight(fid, airline, number, origin, dest, typ, arr, dep, gate):
    return {"id": fid, "airline_id": airline, "flight_number": number, "origin": origin, "destination": dest,
            "aircraft_type": typ, "scheduled_arrival": hm(*arr), "scheduled_departure": hm(*dep), "assigned_gate_id": gate}


ROUTES = {"NS": ("Pinehaven", "Ashford"), "SJ": ("Westbridge", "Fairview"), "GA": ("Seabrook", "Eastmere")}


def f(fid, airline, num, typ, arr, dep, gate=""):
    o, d = ROUTES[airline]
    return flight(fid, airline, "%s %d" % (airline, num), o, d, typ, arr, dep, gate)


# --- day 1: six flights in two short waves ---------------------------------------------------
FLIGHTS = [
    f("NS101", "NS", 101, "A220", (6, 6), (6, 54), "B1"),
    f("SJ201", "SJ", 201, "737", (6, 12), (7, 4), "B2"),
    f("GA301", "GA", 301, "A321", (6, 20), (7, 14), "B3"),
    f("NS103", "NS", 103, "A220", (7, 6), (7, 54), "B1"),
    f("SJ203", "SJ", 203, "737", (7, 16), (8, 6), "B2"),
    f("GA303", "GA", 303, "A321", (7, 26), (8, 18), "B3"),
]

# --- growth: request tiers, earned by performance (never day-scheduled) -----------------------
REQUESTS = {
    "NS": [
        {"id": "NS_ROTATION", "label": "Northstar second morning rotation", "min_relationship": 72, "min_flights_operated": 2, "check_gates": False,
         "flights": [f("NS105", "NS", 105, "A220", (6, 36), (7, 22))]},
        {"id": "NS_LATE", "label": "Northstar late rotation", "min_relationship": 78, "min_flights_operated": 3, "check_gates": False,
         "flights": [f("NS107", "NS", 107, "737", (7, 46), (8, 36))]},
    ],
    "SJ": [
        {"id": "SJ_ROTATION", "label": "SunJet extra A321", "min_relationship": 72, "min_flights_operated": 2, "check_gates": False,
         "flights": [f("SJ205", "SJ", 205, "A321", (6, 44), (7, 38))]},
        {"id": "SJ_BANK", "label": "SunJet late bank", "min_relationship": 80, "min_flights_operated": 3, "check_gates": False,
         "flights": [f("SJ207", "SJ", 207, "737", (7, 56), (8, 44)), f("SJ209", "SJ", 209, "A321", (8, 4), (8, 56))]},
    ],
    "GA": [
        {"id": "GA_CONNECT", "label": "Global Airways connection bank", "min_relationship": 70, "min_flights_operated": 2, "check_gates": False,
         "flights": [f("GA305", "GA", 305, "A321", (6, 50), (7, 44)), f("GA307", "GA", 307, "A220", (7, 36), (8, 26))]},
        {"id": "GA_LONGHAUL", "label": "Global Airways 787 long-haul", "min_relationship": 76, "min_flights_operated": 3, "check_gates": False,
         "flights": [f("GA901", "GA", 901, "787", (7, 0), (8, 10))]},
    ],
}

# --- terminal ---------------------------------------------------------------------------------
NODES = {
    "entrance": {"label": "ENTRANCE", "x": 500, "y": 920, "airside": False},
    "check_in": {"label": "CHECK-IN", "x": 500, "y": 740, "airside": False},
    "security_main": {"label": "SECURITY", "x": 500, "y": 530, "airside": True},
    "concourse": {"label": "CONCOURSE", "x": 500, "y": 310, "airside": True},
    "B1": {"label": "B1", "x": 260, "y": 100, "airside": True},
    "B2": {"label": "B2", "x": 380, "y": 100, "airside": True},
    "B3": {"label": "B3", "x": 500, "y": 100, "airside": True},
    "arrivals_hall": {"label": "ARRIVALS", "x": 150, "y": 310, "airside": False},
    "baggage_reclaim": {"label": "RECLAIM", "x": 150, "y": 615, "airside": False},
    "airport_exit": {"label": "EXIT", "x": 150, "y": 920, "airside": False},
}
EDGES = [
    {"from": "entrance", "to": "check_in", "walking_ticks": 300},
    {"from": "check_in", "to": "security_main", "walking_ticks": 500},
    {"from": "security_main", "to": "concourse", "walking_ticks": 300},
    {"from": "concourse", "to": "B1", "walking_ticks": 600},
    {"from": "concourse", "to": "B2", "walking_ticks": 450},
    {"from": "concourse", "to": "B3", "walking_ticks": 400},
    {"from": "concourse", "to": "arrivals_hall", "walking_ticks": 900, "bidirectional": False},
    {"from": "arrivals_hall", "to": "baggage_reclaim", "walking_ticks": 400, "bidirectional": False},
    {"from": "baggage_reclaim", "to": "airport_exit", "walking_ticks": 400, "bidirectional": False},
]

# --- airside (geometric: metres, 10 m/s) --------------------------------------------------------
XS = {"B1": 700, "B2": 1000, "B3": 1300, "B4": 1600, "B5": 1900, "B6": 2200, "B7": 2500, "B8": 2800}
GATES = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"]
AIR_NODES = {
    "R1_A": {"x": 400, "y": 150, "kind": "runway_end", "label": "R1 09"},
    "R1_B": {"x": 2800, "y": 150, "kind": "runway_end", "label": "R1 27"},
    "R1_EXIT": {"x": 2800, "y": 300, "kind": "exit", "label": "R1 exit"},
    "R1_HOLD": {"x": 400, "y": 300, "kind": "hold", "label": "R1 hold"},
    "P_MID": {"x": 1300, "y": 300, "kind": "taxi", "label": "Taxiway P"},
}
for i, g in enumerate(GATES):
    AIR_NODES["AP_%d" % (i + 1)] = {"x": XS[g], "y": 450, "kind": "taxi"}
for g in ["B1", "B2", "B3"]:
    AIR_NODES["STAND_" + g] = {"x": XS[g], "y": 600, "kind": "stand", "label": g}


def dist(a, b):
    na, nb = AIR_NODES[a], AIR_NODES[b]
    return round(math.dist((na["x"], na["y"]), (nb["x"], nb["y"])))


BOTH = ["narrow", "wide"]


def edge(eid, a, b, oneway, kind="taxiway"):
    return {"id": eid, "from": a, "to": b, "length_m": dist(a, b), "oneway": oneway, "classes": BOTH, "kind": kind}


AIR_EDGES = [
    edge("R1_OUT", "R1_B", "R1_EXIT", True, "runway_exit"),
    edge("P_EAST", "P_MID", "R1_EXIT", False),
    edge("P_WEST", "R1_HOLD", "P_MID", False),
    edge("CONNECTOR", "P_MID", "AP_3", False),
] + [edge("AP_%d_%d" % (i, i + 1), "AP_%d" % i, "AP_%d" % (i + 1), False) for i in range(1, 8)] + [
    edge("STUB_" + g, "AP_%d" % (i + 1), "STAND_" + g, False, "stand") for i, g in enumerate(["B1", "B2", "B3"])
] + [edge("R1_IN", "R1_HOLD", "R1_A", True, "runway_entry")]

AIRSIDE = {
    "taxi_speed_mps": 10, "headway_ticks": 150, "node_ticks": 50,
    "min_runway_length_m": copy.deepcopy(R["airside"]["min_runway_length_m"]),
    "terminal_zone": {"x0": 0, "y0": 700, "x1": 3300, "y1": 1100},
    "zones": [{"x0": 0, "y0": -700, "x1": 3300, "y1": 650}],
    "grid_m": 300,
    "nodes": AIR_NODES, "edges": AIR_EDGES,
    "runways": [{"id": "R1", "label": "09/27", "a": "R1_A", "b": "R1_B", "length_m": 2400, "status": "open"}],
    "stands": {g: "STAND_" + g for g in ["B1", "B2", "B3"]},
}


def pad(gate, klass, label, x, walk_from, walk):
    ap = "AP_%d" % (GATES.index(gate) + 1)
    site = {"kind": "gate_pad", "pad_class": klass, "gate_id": gate, "label": label,
            "node": {"label": gate, "x": x, "y": 100, "airside": True},
            "edges": [{"from": walk_from, "to": gate, "walking_ticks": walk}],
            "stand": {"node": "STAND_" + gate, "x": XS[gate], "y": 600},
            "airside_edges": [{"id": "STUB_" + gate, "from": ap, "to": "STAND_" + gate, "oneway": False, "kind": "stand"}]}
    return site


catalog = copy.deepcopy(R["construction"]["catalog"])
for k in ["east_pier", "central_connector"]: catalog.pop(k)
catalog["south_pier"] = {"label": "East pier", "category": "terminal", "site_kind": "terminal", "cost_cents": 3000000,
                         "effect": "A walkway from the concourse to pads B6 (widebody), B7 and B8, with a path to arrivals"}
EFFECTS = {
    "gate_narrow": "Adds one contact gate and stand for A220, 737 and A321",
    "gate_wide": "Adds one contact gate and stand for any aircraft, including the 787 (widebody pads only)",
    "security_lane": "Adds one physical screening lane; it opens when staff are assigned",
    "outbound_sorter": "Adds one parallel outbound-bag sortation server",
    "transfer_sorter": "Adds one parallel transfer-bag sortation server",
    "reclaim_belt": "Adds one parallel reclaim delivery server",
    "cleaning_base": "Room for 2 more cleaning crews (you still pay per crew per day)",
    "catering_base": "Room for 2 more catering crews (you still pay per crew per day)",
    "fuel_bay": "Room for 2 more fuel units (you still pay per unit per day)",
    "baggage_equipment": "Room for 5 more baggage crews (you still pay per crew per day)",
    "tug_bay": "Room for 1 more pushback tug (you still pay per tug per day)",
    "taxiway": "Adds an aircraft movement route between two points; its length sets cost and taxi time",
    "runway": "Adds a runway; its length decides which aircraft it can serve",
}
for k, text in EFFECTS.items(): catalog[k]["effect"] = text
# A regional airport's runway is a big but reachable investment (Riverdale: $60/m).
catalog["runway"]["cost_per_m_cents"] = 3000
catalog.pop("legacy_taxiway")
catalog.pop("legacy_runway")
catalog["legacy_taxiway"] = copy.deepcopy(R["construction"]["catalog"]["legacy_taxiway"])
catalog["legacy_runway"] = copy.deepcopy(R["construction"]["catalog"]["legacy_runway"])
catalog["legacy_taxiway"]["label"] = "Taxiway"
catalog["legacy_runway"]["label"] = "Runway"

SITES = {
    "south_pier": {"kind": "terminal", "item": "south_pier", "label": "East pier",
                   "nodes": {"south_pier": {"label": "EAST PIER", "x": 800, "y": 310, "airside": True}},
                   "edges": [{"from": "concourse", "to": "south_pier", "walking_ticks": 900},
                             {"from": "south_pier", "to": "arrivals_hall", "walking_ticks": 1500, "bidirectional": False}]},
    "pad_B4": pad("B4", "narrow", "Pad B4", 620, "concourse", 500),
    "pad_B5": pad("B5", "narrow", "Pad B5", 740, "concourse", 650),
    "pad_B6": pad("B6", "wide", "Pad B6 (east pier, widebody)", 900, "south_pier", 500),
    "pad_B7": pad("B7", "narrow", "Pad B7 (east pier)", 1020, "south_pier", 650),
    "pad_B8": pad("B8", "narrow", "Pad B8 (east pier)", 1140, "south_pier", 800),
    "security_main": {"kind": "security", "checkpoint": "main", "label": "Security hall", "slots": 5},
    "baggage_outbound_sortation": {"kind": "baggage", "stage": "outbound_sortation", "label": "Outbound sortation hall", "slots": 4},
    "baggage_transfer_sortation": {"kind": "baggage", "stage": "transfer_sortation", "label": "Transfer sortation hall", "slots": 4},
    "baggage_reclaim": {"kind": "baggage", "stage": "reclaim", "label": "Reclaim hall", "slots": 4},
    "service_yard": {"kind": "service", "label": "Service yard", "slots": 12},
}

CONTRACTS = {
    "starter_service": {"label": "Service Agreement", "terms": [
        {"metric": "on_time_rate", "label": "On-time departures", "min": 0.5, "risk": 0.1},
        {"metric": "mean_delay_min", "label": "Mean departure delay", "max": 8, "risk": 2}],
        "bonus_cents": 150000, "penalty_cents": 150000},
    "starter_turnaround": {"label": "Turnaround Agreement", "terms": [
        {"metric": "turnaround_delay_min", "label": "Turnaround-caused delay per flight", "max": 5, "risk": 1.5},
        {"metric": "mean_delay_min", "label": "Mean departure delay", "max": 8, "risk": 2}],
        "bonus_cents": 150000, "penalty_cents": 150000},
    "starter_connections": {"label": "Connection Agreement", "terms": [
        {"metric": "connection_rate", "label": "Connection success", "min": 0.9, "risk": 0.05},
        {"metric": "transfer_bag_rate", "label": "Transfer baggage success", "min": 0.9, "risk": 0.05},
        {"metric": "mean_delay_min", "label": "Mean departure delay", "max": 10, "risk": 2}],
        "bonus_cents": 200000, "penalty_cents": 200000},
}

profiles = {}
for airline, contract, prefs in [("NS", "starter_service", ["B1"]), ("SJ", "starter_turnaround", []), ("GA", "starter_connections", ["B3"])]:
    p = copy.deepcopy(R["airline_relations"]["profiles"][airline])
    p.pop("request", None)
    p["starting_relationship"] = 70
    p["preferred_gates"] = prefs
    p["contract"] = contract
    p["requests"] = REQUESTS[airline]
    profiles[airline] = p

pf = copy.deepcopy(R["passenger_flow"])
pf.update({
    "arrival_lead_min_ticks": 15000, "arrival_lead_max_ticks": 36000, "gate_target_buffer_ticks": 12000,
    "load_permille": 700, "load_permille_range": [600, 800],
    "staff_pool": 2,
    "graph": {"nodes": NODES, "edges": EDGES},
    "checkpoints": [{"id": "main", "node_id": "security_main", "max_lanes": 2, "open_lanes": 1, "staff": 1, "service_ticks": 120}],
    "connections": {"default_permille": 30, "airline_permille": {"GA": 90, "NS": 30, "SJ": 20}, "max_connection_ticks": 60000},
    "airline_load_permille_ranges": {"NS": [600, 780], "SJ": [660, 820], "GA": [600, 780]},
})

baggage = copy.deepcopy(R["baggage"])
baggage["airline_checked_permille"] = {k: v for k, v in baggage["airline_checked_permille"].items() if k in ROUTES}
baggage["stages"] = {"outbound_sortation": {"servers": 1, "service_ticks": 100, "transit_ticks": 1200},
                     "transfer_sortation": {"servers": 1, "service_ticks": 150, "transit_ticks": 1800},
                     "reclaim": {"servers": 1, "service_ticks": 50, "transit_ticks": 1800}}
baggage.pop("demo_bags", None)

economy = copy.deepcopy(R["economy"])
economy["starting_cash_cents"] = 15000000
economy["costs"] = {"security_staff_daily_cents": 90000, "fixed_daily_cents": 300000}

# --- career: chapters of objectives (real metrics) and difficulty presets ---------------------
CAREER = {
    "difficulty": {
        "relaxed": {"starting_cash_permille": 1500, "resource_cost_permille": 850, "contract_slack": 1, "request_offset": -4},
        "standard": {"starting_cash_permille": 1000, "resource_cost_permille": 1000, "contract_slack": 0, "request_offset": 0},
        "challenging": {"starting_cash_permille": 700, "resource_cost_permille": 1150, "contract_slack": -1, "request_offset": 4},
    },
    "chapters": [
        {"id": "operate", "title": "Operate", "intro": "Six flights, three gates, one security hall. Keep them moving.",
         "primary": {"id": "op_flights", "text": "Handle a full day of flights", "kind": "departures_min", "min": 6},
         "optional": [
             {"id": "op_delay", "text": "Mean departure delay under 5 minutes", "kind": "mean_delay_max", "max": 5},
             {"id": "op_profit", "text": "Finish a day with a profit", "kind": "net_min", "min": 0},
             {"id": "op_connections", "text": "No missed connections in a day", "kind": "missed_connections_max", "max": 0}]},
        {"id": "improve", "title": "Improve", "intro": "The airlines are watching: each has a contract and its own priorities.",
         "primary": {"id": "imp_contracts", "text": "Pass every airline's contract in one day", "kind": "all_contracts_passed"},
         "optional": [
             {"id": "imp_relationship", "text": "Reach a relationship of 80 with an airline", "kind": "relationship_min_any", "min": 80},
             {"id": "imp_request", "text": "Accept an airline's request for more flights", "kind": "request_accepted"}]},
        {"id": "grow", "title": "Grow", "intro": "More flights need more gates, and more passengers need more screening.",
         "primary": {"id": "grow_departures", "text": "Operate 9 departures in one day", "kind": "departures_min", "min": 9},
         "optional": [
             {"id": "grow_gate", "text": "Build a fourth gate", "kind": "gates_min", "min": 4},
             {"id": "grow_lanes", "text": "Build a third security lane", "kind": "lanes_min", "min": 3},
             {"id": "grow_profit", "text": "Earn $5,000 in one day", "kind": "net_min", "min": 500000}]},
        {"id": "airside", "title": "Expand airside", "intro": "Widebody service needs a widebody gate and a runway of 2,800 m or more.",
         "primary": {"id": "air_widebody", "text": "Serve your first 787", "kind": "widebody_departed"},
         "optional": [
             {"id": "air_runway", "text": "Build a runway of 2,800 m or longer", "kind": "runway_length_min", "min": 2800},
             {"id": "air_wide_gate", "text": "Build a widebody gate", "kind": "wide_gates_min", "min": 1},
             {"id": "air_taxi", "text": "Keep taxi waits under 10 minutes in a day", "kind": "taxi_wait_max", "max": 10}]},
    ],
    "milestone": {"id": "regional_hub", "text": "Regional hub: 14 departures in a day, profitable, every airline at 60 or better, and a 787 served",
                  "kind": "all", "of": [{"kind": "departures_min", "min": 14}, {"kind": "net_min", "min": 0},
                                        {"kind": "relationship_min_all", "min": 60}, {"kind": "widebody_departed"}]},
}

C = {
    "id": "career_starter",
    "name": "Harbor Field Regional",
    "seed": 5313,
    "start_tick": hm(5, 50),
    "landing_ticks": R["landing_ticks"], "takeoff_ticks": R["takeoff_ticks"], "separation_ticks": R["separation_ticks"],
    "taxi_in_ticks": 1800, "taxi_out_ticks": 1800, "approach_ticks": R["approach_ticks"], "gate_buffer_ticks": R["gate_buffer_ticks"],
    "aircraft_types": copy.deepcopy(R["aircraft_types"]),
    "boarding": copy.deepcopy(R["boarding"]),
    "deboarding": copy.deepcopy(R["deboarding"]),
    "turnaround": copy.deepcopy(R["turnaround"]),
    "resources": {"cleaning_crew": {"label": "Cleaning crews", "units": 1}, "catering_crew": {"label": "Catering crews", "units": 1},
                  "fuel_unit": {"label": "Fuel units", "units": 1}, "baggage_crew": {"label": "Baggage crews", "units": 3},
                  "pushback_tug": {"label": "Pushback tugs", "units": 1}},
    "airline_relations": {"scoring": copy.deepcopy(R["airline_relations"]["scoring"]), "contracts": CONTRACTS, "profiles": profiles},
    "economy": economy,
    "airlines": {k: R["airlines"][k] for k in ROUTES},
    "gates": [{"id": g, "type": "narrow", "supported_aircraft_classes": ["narrow"]} for g in ["B1", "B2", "B3"]],
    "airside": AIRSIDE,
    "flights": FLIGHTS,
    "passenger_flow": pf,
    "baggage": baggage,
    "career": CAREER,
    "construction": {"refund_permille": R["construction"]["refund_permille"], "catalog": catalog, "sites": SITES,
                     "initial": {"facilities": {"cleaning_base": 1, "catering_base": 1, "fuel_bay": 1, "baggage_equipment": 1, "tug_bay": 1}}},
}

out = os.path.join(AIRPORTS, "career_starter.json")
json.dump(C, open(out, "w"), indent=2)
print("wrote", out, len(FLIGHTS), "flights")
