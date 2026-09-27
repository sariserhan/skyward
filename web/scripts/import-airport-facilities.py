"""Fetch a bounded, cached set of OSM airport-area facilities. No paid services.
Run with airport codes to refresh only chosen hubs; --refresh bypasses snapshots.
Simple closed building ways are imported. Complex relations are counted as omitted.
"""
import hashlib,json,sys,time,urllib.request,urllib.parse,urllib.error,os
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
catalog=json.loads((ROOT/'data/airport-catalog.json').read_text())
DEFAULT='JFK LAX ORD ATL DFW LHR CDG AMS FRA MAD DXB DOH HND SIN HKG ICN SYD GRU'.split()
codes=[s.upper() for s in sys.argv[1:] if not s.startswith('--')] or DEFAULT
cache=ROOT/'data/osm';cache.mkdir(exist_ok=True)
endpoint=os.environ.get('SKYWARD_OVERPASS_URL','https://overpass-api.de/api/interpreter')
status_path=ROOT/'data/facility-import-status.json'
status=json.loads(status_path.read_text()) if status_path.exists() else {}
def record(code,state,**details):
    status[code]={'status':state,'recordedAt':datetime.now(timezone.utc).isoformat(),**details}
    status_path.write_text(json.dumps(status,indent=2,sort_keys=True))
for code in codes:
    if code not in catalog:raise ValueError('Unknown airport '+code)
    a=catalog[code]; snapshot=cache/f'{code}.json';meta=cache/f'{code}.meta.json'
    query=f'''[out:json][timeout:35];area["aeroway"="aerodrome"]["icao"="{a['icao']}"]->.airport;(way(area.airport)["building"];way(area.airport)["aeroway"~"^(terminal|hangar|apron|taxiway|parking_position)$"];node(area.airport)["aeroway"="gate"];relation(area.airport)["building"];relation(area.airport)["aeroway"="terminal"];);out geom;'''
    try:
        if snapshot.exists() and '--refresh' not in sys.argv:
            raw=snapshot.read_bytes();provenance=json.loads(meta.read_text())
        else:
            req=urllib.request.Request(endpoint,data=urllib.parse.urlencode({'data':query}).encode(),headers={'User-Agent':'Skyward-Observatory/0.3 (airport map snapshot)'})
            raw=urllib.request.urlopen(req,timeout=50).read();parsed=json.loads(raw)
            if parsed.get('remark'):raise ValueError(parsed['remark'])
            provenance={'sourceUrl':endpoint,'query':query,'retrievedAt':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'license':'ODbL-1.0; OpenStreetMap contributors','osmBase':parsed.get('osm3s',{}).get('timestamp_osm_base')}
            snapshot.write_bytes(raw);meta.write_text(json.dumps(provenance,indent=2))
        data=json.loads(raw)
        path=ROOT/'public/data/airports'/f'{code}.json';g=json.loads(path.read_text())
        surfaces=[];gates=[];paths=[];omitted=0
        for e in sorted(data.get('elements',[]),key=lambda e:(e['type'],e['id'])):
            t=e.get('tags',{});kind=t.get('aeroway')
            if e['type']=='node' and kind=='gate':
                gates.append({'label':t.get('ref') or t.get('name') or f"OSM {e['id']}",'position':[e['lon'],e['lat']],'osmId':f"node/{e['id']}"});continue
            pts=[[p['lon'],p['lat']] for p in e.get('geometry',[])]
            if kind in ('taxiway','parking_position') and len(pts)>=2:
                paths.append({'points':pts,'kind':kind});continue
            if len(pts)<4 or pts[0]!=pts[-1]:omitted+=1;continue
            if 'building' not in t and kind not in ('terminal','hangar','apron'):continue
            k='terminal' if kind=='terminal' or t.get('building')=='terminal' else 'apron' if kind=='apron' else 'hangar' if kind=='hangar' else 'building'
            try:h=max(3,min(70,float(t.get('building:levels',3))*4))
            except ValueError:h=12
            surfaces.append({'kind':k,'label':t.get('name') or t.get('ref') or '', 'points':pts,'height':0 if k=='apron' else h,'osmId':f"way/{e['id']}"})
        g.update({'surfaces':surfaces,'gates':gates,'paths':paths,'osm':{**provenance,'omittedComplexFeatures':omitted}})
        g['coverage'].update({'buildings':'partial' if any(s['kind']!='apron' for s in surfaces) else 'unavailable','gates':'partial' if gates else 'unavailable'})
        g['source']='OurAirports public-domain runway endpoints; OpenStreetMap contributors (ODbL-1.0), airport-area mapped facilities. Simple building footprints only; complex relations omitted. Building heights are illustrative.'
        path.write_text(json.dumps(g,separators=(',',':')))
        record(code,'imported',buildings=sum(s['kind']!='apron' for s in surfaces),gates=len(gates),omittedComplexFeatures=omitted)
        print(code,'buildings',sum(s['kind']!='apron' for s in surfaces),'gates',len(gates),'omitted complex/open',omitted,flush=True)
    except urllib.error.HTTPError as e:
        record(code,'unavailable',reason=str(e),retryAfter=e.headers.get('Retry-After'))
        print(code,'UNAVAILABLE:',str(e),flush=True)
        if e.code==429:
            print('Provider rate limit: stopped. Re-run later; cached successes are reused.',flush=True)
            break
    except Exception as e:
        record(code,'unavailable',reason=str(e))
        print(code,'UNAVAILABLE:',str(e),flush=True)
    time.sleep(5)
