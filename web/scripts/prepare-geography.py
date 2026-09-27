"""Derive local geospatial assets from the checked-in airport source snapshots."""
import json, math
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=json.loads((root/'game/configs/airports/dulles.json').read_text())['airside']
def inverse(xy):
    return [round(-77.46+xy[0]/(111320*math.cos(math.radians(38.94))),7), round(38.94-xy[1]/111320,7)]
iad={'id':'IAD','name':'Washington Dulles','lat':38.947,'lon':-77.46,'runways':[], 'surfaces':[],'paths':[],'gates':[], 'source':'FAA thresholds; OpenStreetMap footprints (ODbL), snapshot 2026-09-26. Building heights are illustrative.'}
for r in source['runways']:
    iad['runways'].append({'id':r['label'],'a':list(reversed(r['threshold_a'])),'b':list(reversed(r['threshold_b'])),'width':r['width_m'],'length':r['length_m']})
for s in source['surfaces']:
    try:height=int(s['levels'])*4
    except (ValueError,KeyError):height=10
    iad['surfaces'].append({'kind':s['kind'],'label':s['label'],'points':[inverse(p) for p in s['points']],'height':0 if s['kind']=='apron' else height})
iad['paths']=[{'kind':p['kind'],'points':[inverse(x) for x in p['points']]} for p in source['map_paths']]
iad['gates']=[{'label':g['label'],'position':inverse(g['position'])} for g in source['map_gates']]
ist={'id':'IST','name':'Istanbul','lat':41.274874,'lon':28.732136,'runways':[],'surfaces':[],'paths':[],'gates':[],'source':'OurAirports public-domain runway endpoints, downloaded 2026-09-26. Detailed terminal geometry is not included.'}
path=root/'web/public/data/istanbul-runways.json'
if path.exists():
    for r in json.loads(path.read_text()):
        if r['closed']=='1':continue
        try:
            ist['runways'].append({'id':r['le_ident']+'/'+r['he_ident'],'a':[float(r['le_longitude_deg']),float(r['le_latitude_deg'])],'b':[float(r['he_longitude_deg']),float(r['he_latitude_deg'])],'width':float(r['width_ft'])*.3048,'length':float(r['length_ft'])*.3048})
        except (KeyError,ValueError):continue
osm_path=root/'web/public/data/istanbul-osm.json'
if osm_path.exists():
    osm=json.loads(osm_path.read_text())
    for e in osm['elements']:
        t=e.get('tags',{});kind=t.get('aeroway')
        if e['type']=='node' and kind=='gate':
            ist['gates'].append({'label':t.get('ref') or t.get('name') or str(e['id']),'position':[e['lon'],e['lat']]})
            continue
        points=[[pt['lon'],pt['lat']] for pt in e.get('geometry',[])]
        if kind in ('taxiway','parking_position') and len(points)>=2:
            ist['paths'].append({'kind':kind,'points':points})
        elif len(points)>=4 and points[0]==points[-1] and (kind in ('terminal','apron','hangar') or 'building' in t):
            surface_kind='terminal' if kind=='terminal' or t.get('building')=='terminal' else 'apron' if kind=='apron' else 'hangar' if kind=='hangar' else 'building'
            try:height=max(3,min(70,float(t.get('building:levels',3))*4))
            except ValueError:height=12
            ist['surfaces'].append({'kind':surface_kind,'label':t.get('name') or t.get('ref') or '', 'points':points,'height':0 if surface_kind=='apron' else height})
    ist['source']='OurAirports runway endpoints; OpenStreetMap contributors, ODbL-1.0 airport-area snapshot 2026-09-26. Mapped gate/terminal coverage may be incomplete. Building heights are illustrative.'
if not ist['runways']:raise RuntimeError('Istanbul runway endpoints not available')
(root/'web/public/data/airports.json').write_text(json.dumps({'airports':[iad,ist]},separators=(',',':')))
print('Prepared IAD and IST runways',len(iad['runways']),len(ist['runways']))
