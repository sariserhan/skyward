"""Rebuild the offline Dulles scenario; run python3 tools/make_dulles.py."""
import json
from dulles_geometry import build_airside
from pathlib import Path
root=Path(__file__).resolve().parents[1]
s=json.loads((root/'game/configs/airports/riverdale.json').read_text())
s.update(id='dulles_sample',name='Washington Dulles International',seed=260926,start_tick=504000)
s['real_world']={'iata':'IAD','icao':'KIAD','timezone':'America/New_York','schedule_kind':'illustrative','label':'IAD · SAMPLE SCHEDULE · LOCAL TIME','description':'Real airport and airline names; illustrative flights, times, gate assignments and operating policies. Geographic runway and building footprints; approximate ground operations. No live feed.', 'sources':[{'url':'https://www.flydulles.com/airport-overview','purpose':'Airport identity and concourses','checked':'2026-09-26'},{'url':'https://www.flydulles.com/travel-information/airport-and-terminal-maps','purpose':'Concourse organization','checked':'2026-09-26'},{'url':'https://www.flydulles.com/flight-information/airlines-serving-dulles-international','purpose':'Airline names and codes','checked':'2026-09-26'}]}
s['airlines']={'UA':'United Airlines','AA':'American Airlines','DL':'Delta Air Lines','BA':'British Airways'}
groups={'A':['A14','A16'],'B':['B40','B44','B64','B66'],'C':['C2','C4','C6'],'D':['D2','D4','D6']}
wide=['A14','A16','B64','B66','C6','D6']
s['gates']=[{'id':g,'type':'wide' if g in wide else 'narrow','supported_aircraft_classes':['narrow','wide'] if g in wide else ['narrow']} for gs in groups.values() for g in gs]
profile={'starting_relationship':70,'weights':{'punctuality':30,'connections':20,'baggage':20,'turnaround':20,'gates':10},'preferred_gates':[],'contract':'basic_service'}
s['airline_relations']['profiles']={a:dict(profile,preferred_gates=groups['C']+groups['D'] if a=='UA' else groups['B']) for a in s['airlines']}
p=s['passenger_flow'];p['airline_load_permille_ranges']={a:[750,900] for a in s['airlines']}
p['connections']={'default_permille':120,'airline_permille':{'UA':250,'AA':50,'DL':50,'BA':120},'max_connection_ticks':90000}
s['baggage'].pop('demo_bags',None);s['baggage']['airline_checked_permille']={a:500 for a in s['airlines']}
# Compact functional passenger diagram; transfer edges abstract transport.
nodes={k:v for k,v in p['graph']['nodes'].items() if k not in ['west_hall','east_hall'] and not k.startswith('A')}
nodes['security_west'].update(x=250,y=740);nodes['security_east'].update(x=650,y=740)
nodes['check_in'].update(x=450,y=830);nodes['entrance'].update(x=450,y=950)
positions={'B':(220,480),'A':(650,480),'D':(220,210),'C':(650,210)}
edges=[{'from':'entrance','to':'check_in','walking_ticks':300}]
for side in ['west','east']: edges.append({'from':'check_in','to':'security_'+side,'walking_ticks':600})
for letter,(x,y) in positions.items():
 hall='concourse_'+letter;nodes[hall]={'label':'CONCOURSE '+letter,'x':x,'y':y,'airside':True}
 for i,g in enumerate(groups[letter]):
  nodes[g]={'label':g,'x':round(x+(i-(len(groups[letter])-1)/2)*95),'y':y-95,'airside':True}
  edges.append({'from':hall,'to':g,'walking_ticks':600+i*100})
 edges.append({'from':hall,'to':'arrivals_hall','walking_ticks':3000,'bidirectional':False})
for a,b,t in [('security_west','concourse_B',1800),('security_east','concourse_A',1800),('security_east','concourse_C',3600),('security_west','concourse_D',3600),('concourse_A','concourse_B',1800),('concourse_C','concourse_D',1800),('concourse_A','concourse_C',3000),('arrivals_hall','baggage_reclaim',450),('baggage_reclaim','airport_exit',450)]:
 edges.append({'from':a,'to':b,'walking_ticks':t,**({'bidirectional':False} if a in ['arrivals_hall','baggage_reclaim'] else {})})
p['graph']={'nodes':nodes,'edges':edges}
s['construction']['sites']={k:v for k,v in s['construction']['sites'].items() if v['kind'] in ['security','baggage','service']}
for key in ['east_pier','central_connector']: s['construction']['catalog'].pop(key,None)
# Geographic airfield comes from the checked-in OSM snapshot and FAA endpoints.
s['airside'] = build_airside(s['airside'], groups)
# Fictional rotations for play; no scraped or invented claims of actual flight status.
rotations=[('UA','737','C2','Chicago ORD','Denver DEN'),('UA','737','C4','Denver DEN','Chicago ORD'),('UA','787','C6','Frankfurt FRA','London LHR'),('UA','737','D2','Houston IAH','Newark EWR'),('UA','737','D4','San Francisco SFO','Los Angeles LAX'),('UA','787','D6','London LHR','Frankfurt FRA'),('AA','737','B40','Charlotte CLT','Dallas DFW'),('DL','A220','B44','Atlanta ATL','Minneapolis MSP'),('BA','787','B64','London LHR','London LHR'),('UA','787','A14','Paris CDG','Brussels BRU'),('UA','737','C2','Boston BOS','Chicago ORD'),('AA','737','B40','Dallas DFW','Charlotte CLT'),('DL','A220','B44','Minneapolis MSP','Atlanta ATL'),('UA','737','D2','Newark EWR','Houston IAH')]
s['flights']=[]
for i,(airline,typ,gate,origin,dest) in enumerate(rotations):
 arrival=516000+i*2400 if i<10 else 588000+(i-10)*3000
 s['flights'].append({'id':'IAD%03d'%(i+1),'airline_id':airline,'flight_number':airline+' SIM%02d'%(i+1),'origin':origin,'destination':dest,'aircraft_type':typ,'scheduled_arrival':arrival,'scheduled_departure':arrival+(60000 if typ=='787' else 42000),'assigned_gate_id':gate})
(root/'game/configs/airports/dulles.json').write_text(json.dumps(s,indent=2)+'\n')
