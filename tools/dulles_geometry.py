"""Dulles source geometry in local metres (east/right, north/up).

OSM snapshot: ODbL, see configs/geodata/README.md. FAA endpoints override OSM
runway length tags. Stand links and runway exit connections are approximations.
"""
import json
import math
from pathlib import Path

ORIGIN = (38.94, -77.46)
FAA_URL = 'https://www.faa.gov/air_traffic/publications/atpubs/aip_html/part3_ad_2.0_district_of_columbia.html'

def project(lat, lon):
    return [round((lon-ORIGIN[1])*111320*math.cos(math.radians(ORIGIN[0])), 2), round(-(lat-ORIGIN[0])*111320, 2)]

def dms(d, m, sec):
    return d+m/60+sec/3600

# FAA AIP runway thresholds, decimal degrees converted from published DMS.
RUNWAYS = [
    ('01L/19R', (dms(38,56,41.8795),-dms(77,28,29.3169)), (dms(38,58,14.784),-dms(77,28,27.984)),9400),
    ('01C/19C', (dms(38,56,20.6385),-dms(77,27,35.199)), (dms(38,58,14.3073),-dms(77,27,33.5451)),11500),
    ('01R/19L', (dms(38,55,25.5244),-dms(77,26,11.2132)), (dms(38,57,19.1867),-dms(77,26,9.5086)),11500),
    ('12/30', (dms(38,56,37.5897),-dms(77,29,25.5882)), (dms(38,56,0.9996),-dms(77,27,21.2257)),10501),
]

def join_rings(members):
    parts=[m['geometry'][:] for m in members if m.get('role')=='outer' and m.get('geometry')]
    rings=[]
    while parts:
        ring=parts.pop(0)
        while ring[0]!=ring[-1]:
            for i,p in enumerate(parts):
                if ring[-1]==p[0]: ring.extend(p[1:]);parts.pop(i);break
                if ring[-1]==p[-1]: ring.extend(list(reversed(p))[1:]);parts.pop(i);break
                if ring[0]==p[-1]: ring=p[:-1]+ring;parts.pop(i);break
                if ring[0]==p[0]: ring=list(reversed(p))[:-1]+ring;parts.pop(i);break
            else: raise ValueError('Unclosed terminal footprint')
        rings.append(ring)
    return rings

def build_airside(base, groups):
    source=json.loads((Path(__file__).resolve().parents[1]/'game/configs/geodata/dulles-osm.json').read_text())
    a={k:v for k,v in base.items() if k in ['taxi_speed_mps','headway_ticks','node_ticks','min_runway_length_m','grid_m']}
    a.update(nodes={},edges=[],runways=[],stands={},surfaces=[],map_gates=[],map_paths=[],zones=[],geographic=True,
             attribution='Map data © OpenStreetMap contributors · ODbL',projection={'origin_lat':ORIGIN[0],'origin_lon':ORIGIN[1]},source_timestamp=source['osm3s']['timestamp_osm_base'])
    def node(key, xy, kind='taxi'):
        a['nodes'][key]={'x':xy[0],'y':xy[1],'kind':kind}
    def edge(key, fr, to, kind='taxiway', label=''):
        f=a['nodes'][fr];t=a['nodes'][to]
        dist=math.hypot(f['x']-t['x'],f['y']-t['y'])
        if dist<0.1:return
        a['edges'].append({'id':key,'from':fr,'to':to,'length_m':round(dist,2),'oneway':False,'classes':['narrow','wide'],'kind':kind,'label':label})
    taxi=[];parking={};gates={};runway_ways={}
    for el in source['elements']:
        tags=el.get('tags',{});kind=tags.get('aeroway','building')
        if el['type']=='node':
            if kind=='gate' and tags.get('ref'):
                gates[tags['ref']]=project(el['lat'],el['lon'])
                a['map_gates'].append({'label':tags['ref'],'position':gates[tags['ref']]})
            continue
        if kind=='runway':runway_ways[tags['ref']]=el;continue
        if kind in ['taxiway','taxilane','parking_position']:
            a['map_paths'].append({'kind':kind,'label':tags.get('ref',''),'points':[project(pt['lat'],pt['lon']) for pt in el['geometry']]})
            for ident,pt in zip(el['nodes'],el['geometry']): node('OSM'+str(ident),project(pt['lat'],pt['lon']))
            for i,(fr,to) in enumerate(zip(el['nodes'],el['nodes'][1:])):
                edge('W%d_%d'%(el['id'],i),'OSM'+str(fr),'OSM'+str(to),'stand' if kind=='parking_position' else 'taxiway',tags.get('ref',''))
            if kind=='parking_position' and tags.get('ref'):parking[tags['ref']]=el
            else:taxi.extend('OSM'+str(i) for i in el['nodes'])
            continue
        rings=join_rings(el['members']) if el['type']=='relation' else [el.get('geometry',[])]
        for ring in rings:
            if len(ring)<4 or ring[0]!=ring[-1]:continue
            a['surfaces'].append({'osm_id':el['id'],'kind':kind,'label':tags.get('name',''), 'points':[project(pt['lat'],pt['lon']) for pt in ring[:-1]],'levels':tags.get('building:levels',''),'height':tags.get('height','')})
    # Only retain the connected main taxi network for routing. Remote features
    # remain source data; no invented straight-line taxiways join components.
    adjacency={}
    for e in a['edges']:
        adjacency.setdefault(e['from'],set()).add(e['to']);adjacency.setdefault(e['to'],set()).add(e['from'])
    unseen=set(adjacency);components=[]
    while unseen:
        stack=[min(unseen)];part=set()
        while stack:
            key=stack.pop()
            if key in part:continue
            part.add(key);unseen.discard(key);stack.extend(adjacency[key]-part)
        components.append(part)
    connected=max(components,key=len)
    a['edges']=[e for e in a['edges'] if e['from'] in connected]
    a['nodes']={k:v for k,v in a['nodes'].items() if k in connected}
    taxi=sorted(set(taxi)&connected)
    def nearest(xy, candidates):
        return min(candidates,key=lambda k:(math.hypot(a['nodes'][k]['x']-xy[0],a['nodes'][k]['y']-xy[1]),k))
    for label,start,end,feet in RUNWAYS:
        rid=label.split('/')[0];way=runway_ways[label]
        junctions=['OSM'+str(i) for i in way['nodes'] if 'OSM'+str(i) in connected]
        if not junctions:raise ValueError('Runway has no taxi junction: '+label)
        for suffix,pos in [('A',start),('B',end)]:
            xy=project(*pos);key=rid+'_'+suffix;node(key,xy,'runway_end')
            edge(rid+'_'+suffix+'_access',key,nearest(xy,junctions),'runway_entry' if suffix=='A' else 'runway_exit')
        a['runways'].append({'id':rid,'label':label,'a':rid+'_A','b':rid+'_B','length_m':round(feet*.3048,2),'width_m':45.72,'status':'open','threshold_a':list(start),'threshold_b':list(end)})
    for gs in groups.values():
        for gate in gs:
            xy=gates[gate];pos=parking.get(gate)
            candidates=['OSM'+str(i) for i in pos['nodes'] if 'OSM'+str(i) in connected] if pos else []
            if candidates:
                stand=nearest(xy,candidates);a['nodes'][stand]['kind']='stand'
            else:
                stand='STAND_'+gate;near=nearest(xy,taxi);node(stand,xy,'stand');edge('APRON_'+gate,near,stand,'stand')
            a['stands'][gate]=stand
    return compress_paths(a)

def compress_paths(a):
    """Keep junctions and stands; preserve bends as a polyline on each edge."""
    adjacency={k:[] for k in a['nodes']}
    by_id={e['id']:e for e in a['edges']}
    for e in a['edges']:
        adjacency[e['from']].append(e['id']);adjacency[e['to']].append(e['id'])
    keep={k for k,links in adjacency.items() if len(links)!=2 or a['nodes'][k]['kind']!='taxi'}
    # Preserve boundaries between apron links, taxiways and runway access.
    keep.update(k for k,links in adjacency.items() if len({by_id[i]['kind'] for i in links})>1)
    used=set();out=[]
    for start in sorted(keep):
        for ident in sorted(adjacency[start]):
            if ident in used:continue
            here=start;chain=[];length=0;points=[[a['nodes'][here]['x'],a['nodes'][here]['y']]]
            while True:
                used.add(ident);e=by_id[ident];chain.append(e);length+=e['length_m']
                here=e['to'] if e['from']==here else e['from']
                points.append([a['nodes'][here]['x'],a['nodes'][here]['y']])
                if here in keep:break
                ident=next(i for i in adjacency[here] if i!=ident)
            out.append(dict(chain[0],id='PATH%04d'%len(out),**{'from':start,'to':here,'length_m':round(length,2),'points':points}))
    if len(used)!=len(by_id):raise ValueError('Unvisited taxi edges')
    a['nodes']={k:v for k,v in a['nodes'].items() if k in keep}
    a['edges']=out
    return a
