"""Build offline controller scenarios from the globe's checked-in OSM geometry.
Run python3 tools/make_mapped_airports.py. No network or paid services.
Runway-to-taxi links are explicit approximations, checked against building footprints.
"""
import copy,json,math
from pathlib import Path
from dulles_geometry import compress_paths
ROOT=Path(__file__).resolve().parents[1]
AIRPORTS={'IST':('Istanbul Airport','LTFM','Europe/Istanbul','TK','Turkish Airlines'), 'LHR':('London Heathrow','EGLL','Europe/London','BA','British Airways'),'AMS':('Amsterdam Schiphol','EHAM','Europe/Amsterdam','KL','KLM')}
def nearest_on(p,a,b):
 d=(b[0]-a[0],b[1]-a[1]);n=d[0]**2+d[1]**2
 t=max(0,min(1,((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/n)) if n else 0
 return (a[0]+t*d[0],a[1]+t*d[1])
def inside(p,poly):
 result=False
 for a,b in zip(poly,poly[1:]+poly[:1]):
  if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:result=not result
 return result

def build(code,meta):
 source=ROOT/f'web/public/data/airports/{code}.json';g=json.loads(source.read_text())
 name,icao,zone,airline,airline_name=meta
 def project(p):return [round((p[0]-g['lon'])*111320*math.cos(math.radians(g['lat'])),2),round(-(p[1]-g['lat'])*111320,2)]
 s=json.loads((ROOT/'game/configs/airports/dulles.json').read_text());base=s['airside']
 a={k:copy.deepcopy(base[k]) for k in ['taxi_speed_mps','headway_ticks','node_ticks','min_runway_length_m','grid_m']}
 a.update(nodes={},edges=[],runways=[],stands={},surfaces=[],map_gates=[],map_paths=[],zones=[],geographic=True,attribution='Map data © OpenStreetMap contributors · ODbL / OurAirports',projection={'origin_lat':g['lat'],'origin_lon':g['lon']},source_timestamp=g['coverage']['retrievedAt'])
 buildings=[]
 for surface in g['surfaces']:
  points=[project(p) for p in surface['points']]
  if len(points)<3:continue
  if points[-1]==points[0]:points.pop()
  a['surfaces'].append({**surface,'points':points})
  if surface['kind']!='apron':buildings.append((points,(min(p[0] for p in points),min(p[1] for p in points),max(p[0] for p in points),max(p[1] for p in points))))
 def clear(p,r=34):
  for poly,(x0,y0,x1,y1) in buildings:
   if not x0-r<=p[0]<=x1+r or not y0-r<=p[1]<=y1+r:continue
   if inside(p,poly) or any(math.dist(p,nearest_on(p,x,y))<r for x,y in zip(poly,poly[1:]+poly[:1])):return False
  return True
 def link_clear(p,q,r=34):
  steps=max(1,math.ceil(math.dist(p,q)/8))
  return all(clear((p[0]+(q[0]-p[0])*i/steps,p[1]+(q[1]-p[1])*i/steps),r) for i in range(steps+1))
 coords={}; adjacency={};parking=set();rejected=0;edge_serial=0
 def node(p):
  key=tuple(p)
  if key not in coords:
   ident='N'+str(len(coords));coords[key]=ident;a['nodes'][ident]={'x':p[0],'y':p[1],'kind':'taxi'};adjacency[ident]=set()
  return coords[key]
 def edge(fr,to,kind='taxiway'):
  nonlocal edge_serial
  if fr==to:return
  p=a['nodes'][fr];q=a['nodes'][to]
  a['edges'].append({'id':'E'+str(edge_serial),'from':fr,'to':to,'length_m':round(math.hypot(p['x']-q['x'],p['y']-q['y']),2),'oneway':False,'classes':['narrow','wide'],'kind':kind})
  edge_serial+=1
  adjacency[fr].add(to);adjacency[to].add(fr)
 for path in g['paths']:
  if path['kind'] not in ['taxiway','taxilane','parking_position']:continue
  points=[project(p) for p in path['points']];a['map_paths'].append({**path,'points':points})
  for p,q in zip(points,points[1:]):
   if not link_clear(p,q):rejected+=1;continue
   fr,to=node(p),node(q);edge(fr,to,'stand' if path['kind']=='parking_position' else 'taxiway')
   if path['kind']=='parking_position':parking.update([fr,to])
 unseen=set(adjacency);components=[]
 while unseen:
  stack=[min(unseen)];part=set()
  while stack:
   n=stack.pop()
   if n in part:continue
   part.add(n);unseen.discard(n);stack.extend(adjacency[n]-part)
  components.append(part)
 connected=max(components,key=len)
 a['edges']=[e for e in a['edges'] if e['from'] in connected]
 a['nodes']={k:v for k,v in a['nodes'].items() if k in connected}
 def xy(n):return (a['nodes'][n]['x'],a['nodes'][n]['y'])
 # Gates use an existing connected parking path point, not a new straight line.
 a['map_gates']=[{'label':gate['label'],'position':project(gate['position'])} for gate in g['gates']]
 terminals=[x['points'] for x in a['surfaces'] if x['kind']=='terminal']
 def near_terminal(p):return any(any(math.dist(p,nearest_on(p,x,y))<=80 for x,y in zip(poly,poly[1:]+poly[:1])) for poly in terminals)
 chosen=[];used=set()
 for gate in sorted(g['gates'],key=lambda gate:gate['label']):
  p=project(gate['position'])
  candidates=sorted((n for n in parking&connected if len(adjacency[n])==1),key=lambda n:(math.dist(p,xy(n)),n))
  for n in candidates:
   if math.dist(p,xy(n))>140:break
   if n in used or not clear(xy(n),34) or not near_terminal(xy(n)) or any(math.dist(xy(n),xy(old[1]))<70 for old in chosen):continue
   if not gate['label'] or any(old[0]==gate['label'] for old in chosen):continue
   chosen.append((gate['label'],n));used.add(n);break
  if len(chosen)>=12:break
 if len(chosen)<4:raise ValueError(f'{code}: only {len(chosen)} connected clear stands')
 for label,n in chosen:a['stands'][label]=n;a['nodes'][n]['kind']='stand'
 taxi_nodes={n for e in a['edges'] if e['kind']=='taxiway' for n in [e['from'],e['to']]}-used
 links=[]
 for i,runway in enumerate(g['runways']):
  ends=[];connections=[]
  for suffix in ['a','b']:
   p=project(runway[suffix]);options=sorted(taxi_nodes,key=lambda n:(math.dist(p,xy(n)),n))
   near=next((n for n in options if math.dist(p,xy(n))<450 and link_clear(p,xy(n))),None)
   if near is None:break
   connections.append((p,near))
  if len(connections)!=2:continue
  rid='R'+str(i+1)
  for suffix,(p,near) in zip(['A','B'],connections):
   n=rid+'_'+suffix;a['nodes'][n]={'x':p[0],'y':p[1],'kind':'runway_end'};adjacency[n]=set();edge(n,near,'runway_entry' if suffix=='A' else 'runway_exit');ends.append(n)
   links.append({'runway':runway['id'],'endpoint':suffix,'length_m':round(math.dist(p,xy(near)),1)})
  a['runways'].append({'id':rid,'label':runway['id'],'a':ends[0],'b':ends[1],'length_m':runway['length'],'width_m':runway['width'],'status':'open','threshold_a':list(reversed(runway['a'])),'threshold_b':list(reversed(runway['b']))})
 if not a['runways']:raise ValueError(f'{code}: no safely connected runway')
 assert len({e['id'] for e in a['edges']})==len(a['edges'])
 a=compress_paths(a)
 old_gates=[v['id'] for v in s['gates']];gate_map={old:chosen[i%len(chosen)][0] for i,old in enumerate(old_gates)}
 def rename(v):
  if isinstance(v,str):return gate_map.get(v,v)
  if isinstance(v,list):return [rename(x) for x in v]
  if isinstance(v,dict):return {gate_map.get(k,k):rename(x) for k,x in v.items()}
  return v
 s=rename(s);s.update(id=code.lower()+'_sample',name=name,airside=a)
 s['gates']=[{'id':label,'type':'wide','supported_aircraft_classes':['narrow','wide']} for label,_ in chosen]
 s['airlines']={airline:airline_name}
 profile=copy.deepcopy(s['airline_relations']['profiles']['UA']);profile['preferred_gates']=[x[0] for x in chosen];s['airline_relations']['profiles']={airline:profile}
 s['passenger_flow']['airline_load_permille_ranges']={airline:[750,900]};s['passenger_flow']['connections']['airline_permille']={airline:120};s['baggage']['airline_checked_permille']={airline:500}
 destinations=[x for x in ['Istanbul IST','London LHR','Amsterdam AMS','Paris CDG','Frankfurt FRA','New York JFK','Washington IAD','Dubai DXB','Rome FCO','Madrid MAD'] if not x.endswith(code)]
 for i,f in enumerate(s['flights']):
  f.update(id=code+f'{i+1:03}',airline_id=airline,flight_number=airline+f' SIM{i+1:02}',aircraft_type=['737','A321','787'][i%3],assigned_gate_id=chosen[i%len(chosen)][0],origin=destinations[i%len(destinations)],destination=destinations[(i+3)%len(destinations)])
 s['real_world']={'iata':code,'icao':icao,'timezone':zone,'schedule_kind':'illustrative','label':code+' · SIMULATED OPERATIONS','description':'Mapped airport scenery; fictional schedule, aircraft assignments, and operating policies. Selected connected stands only. Runway access links are approximate. No live ATC.','sources':[{'url':g['coverage']['sourceUrl'],'purpose':'Runway geometry; local globe snapshot'},{'url':'https://www.openstreetmap.org/copyright','purpose':'Mapped airport footprints and taxi paths; ODbL'}]}
 # Preserve a functional schematic passenger network independently of the geographic scene.
 graph=s['passenger_flow']['graph'];hall='concourse_A'
 for label,_ in chosen:
  if label not in graph['nodes']:
   graph['nodes'][label]={'label':label,'x':650,'y':385,'airside':True};graph['edges'].append({'from':hall,'to':label,'walking_ticks':700})
 report={'airport':code,'source':str(source.relative_to(ROOT)),'source_timestamp':a['source_timestamp'],'active_runways':len(a['runways']),'source_runways':len(g['runways']),'active_gates':[x[0] for x in chosen],'source_gates':len(g['gates']),'building_clearance_rejected_segments':rejected,'surfaces':len(a['surfaces']),'edges':len(a['edges']),'approximate_runway_links':links}
 (ROOT/f'game/configs/airports/{code.lower()}.json').write_text(json.dumps(s,indent=2)+'\n')
 print(code,len(a['runways']),'runways',len(chosen),'stands',len(a['edges']),'edges',flush=True)
 return report
if __name__=='__main__':
 reports=[build(code,meta) for code,meta in AIRPORTS.items()]
 (ROOT/'docs/mapped-airports-import.json').write_text(json.dumps(reports,indent=2)+'\n')
