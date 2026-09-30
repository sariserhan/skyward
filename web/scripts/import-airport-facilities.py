"""Resumable, paced facility import. See AIRPORT_FACILITIES.md for validation and limits."""
import argparse,gzip,hashlib,io,json,math,os,re,time,urllib.request,urllib.parse,urllib.error
from datetime import datetime,timezone
from pathlib import Path
from airport_facilities import VERSION,boundary_for,fallback_boundary,query_polygon,convert
ROOT=Path(__file__).resolve().parents[1]

def now():return datetime.now(timezone.utc).isoformat()
def atomic(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(path.suffix+'.tmp');temp.write_text(json.dumps(data,indent=2 if path.name.startswith('facility-import-') else None,separators=(',',':'),allow_nan=False));temp.replace(path)

def candidate_elements(elements,shape):
    x0,y0,x1,y1=shape.bounds
    result=[]
    for e in elements:
        pts=([e] if e['type']=='node' else e.get('geometry',[]) if e['type']=='way' else [p for m in e.get('members',[]) for p in m.get('geometry',[])])
        if any(p and x0-.001<=p.get('lon',999)<=x1+.001 and y0-.001<=p.get('lat',999)<=y1+.001 for p in pts):result.append(e)
    return result

class RateLimited(Exception):pass
class BudgetExceeded(Exception):pass
class Client:
    def __init__(self,args):self.args=args;self.last=0;self.requests=0;self.bytes=0
    def query(self,query):
        for attempt in range(self.args.retries+1):
            if self.requests>=self.args.max_requests:raise BudgetExceeded('request budget reached')
            if self.bytes>=self.args.max_mb*1024*1024:raise BudgetExceeded('download budget reached')
            time.sleep(max(0,self.args.delay-(time.monotonic()-self.last)))
            self.requests+=1
            try:
                req=urllib.request.Request(self.args.endpoint,data=urllib.parse.urlencode({'data':query}).encode(),headers={'User-Agent':'Skyward-Observatory/0.4 (cached airport facility imports)','Accept-Encoding':'gzip'})
                with urllib.request.urlopen(req,timeout=100) as r:
                    limit=min(32*1024*1024,int(self.args.max_mb*1024*1024-self.bytes))
                    raw=r.read(limit+1);self.bytes+=len(raw)
                    if len(raw)>limit:raise BudgetExceeded('response exceeded download budget')
                    if r.headers.get('Content-Encoding')=='gzip':
                        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:raw=stream.read(64*1024*1024+1)
                    if len(raw)>64*1024*1024:raise BudgetExceeded('decompressed response exceeds memory budget')
                data=json.loads(raw)
                if data.get('remark'):raise ValueError('Incomplete Overpass response: '+data['remark'])
                if not isinstance(data.get('elements'),list):raise ValueError('Missing elements')
                digest=hashlib.sha256(raw).hexdigest()
                response_path=ROOT/'data/osm/v2/responses'/f'{digest}.json';response_path.parent.mkdir(parents=True,exist_ok=True)
                temp=response_path.with_suffix('.tmp');temp.write_bytes(raw);temp.replace(response_path)
                return data,{'sourceUrl':self.args.endpoint,'query':query,'retrievedAt':now(),'sha256':digest,'license':'ODbL-1.0; OpenStreetMap contributors','osmBase':data.get('osm3s',{}).get('timestamp_osm_base')}
            except urllib.error.HTTPError as e:
                if e.code==429:raise RateLimited('HTTP 429; stopped; Retry-After='+str(e.headers.get('Retry-After'))) from e
                if e.code not in (502,503,504) or attempt==self.args.retries:raise
            except (TimeoutError,urllib.error.URLError,ValueError):
                if attempt==self.args.retries:raise
            finally:self.last=time.monotonic()
            time.sleep(min(60,5*2**attempt))

def boundary_query(codes,catalog):
    rows=[]
    for code in codes:
        a=catalog[code]
        rows.append(f'nwr(around:15000,{a["lat"]},{a["lon"]})["aeroway"="aerodrome"];')
    return '[out:json][timeout:45][maxsize:134217728];('+''.join(rows)+');out geom;'

def facility_query(boundaries,force_polygon=False):
    rows=[]
    for i,b in enumerate(boundaries.values()):
        if b['osmId'] and not force_polygon:
            kind,identifier=b['osmId'].split('/')
            rows.append(f'{kind}({identifier});map_to_area->.airport{i};')
            area=f'(area.airport{i})'
            rows.append(f'(wr{area}["building"];nwr{area}["aeroway"~"^(terminal|hangar|apron|taxiway|parking_position|gate)$"];)->.features{i};')
        else:
            filters=[]
            for poly in query_polygon(b['shape']):
                if b['method']!='bounded_aviation_fallback':filters.append(f'wr(poly:"{poly}")["building"];')
                filters.append(f'nwr(poly:"{poly}")["aeroway"~"^(terminal|hangar|apron|taxiway|parking_position|gate)$"];')
            rows.append('('+''.join(filters)+f')->.features{i};')
    return '[out:json][timeout:45][maxsize:134217728];'+''.join(rows)+'('+''.join(f'.features{i};' for i in range(len(boundaries)))+');out geom;'

def publish(code,elements,provenance,boundary,geometries,status,args):
    g=geometries[code];features,audit=convert(elements,boundary)
    old=[len(g.get(k,[])) for k in ('surfaces','gates','paths')]
    counts=[len(features[k]) for k in ('surfaces','gates','paths')]
    # Never silently erase existing maps because an upstream snapshot is sparse.
    regression=any(o and n<o*.7 for o,n in zip(old,counts))
    base={'recordedAt':now(),'importerVersion':VERSION,'matching':boundary['method'],'boundaryOsmId':boundary['osmId'],'audit':audit,'counts':dict(zip(('surfaces','gates','paths'),counts)),'retrievedAt':provenance['retrievedAt']}
    if regression:
        status[code]={**base,'status':'review_required','reason':'Snapshot would reduce an existing facility category by more than 30%; published map retained'}
        return
    if not any(counts):
        status[code]={**base,'status':'empty','reason':'No validated facilities observed; existing map retained'}
        return
    if sum(counts)>25000:raise ValueError('facility count exceeds publication budget')
    public_provenance={k:v for k,v in provenance.items() if k not in ('query','boundaryQuery')}
    public_provenance['querySha256']=hashlib.sha256(provenance.get('query','').encode()).hexdigest()
    g={**g,**features,'osm':{**public_provenance,'importerVersion':VERSION,'matching':boundary['method'],'boundaryOsmId':boundary['osmId'],'omittedComplexFeatures':sum(audit['rejected'].values()),'validation':audit}}
    g['coverage']={**g.get('coverage',{}),'buildings':'partial' if any(s['kind']!='apron' for s in features['surfaces']) else 'unavailable','gates':'partial' if features['gates'] else 'unavailable','paths':'partial' if features['paths'] else 'unavailable'}
    g['source']='OurAirports runway endpoints; OpenStreetMap contributors (ODbL-1.0), validated airport facilities including multipolygon footprints and courtyards. Coverage is partial; heights may be estimated; mapped gates are not live assignments.'
    if len(json.dumps(g))>8*1024*1024:raise ValueError('airport asset exceeds 8 MB budget')
    atomic(ROOT/'public/data/airports'/f'{code}.json',g)
    status[code]={**base,'status':'imported','buildings':sum(s['kind']!='apron' for s in features['surfaces']),'gates':len(features['gates'])}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('codes',nargs='*');p.add_argument('--all',action='store_true');p.add_argument('--refresh',action='store_true');p.add_argument('--cached-only',action='store_true')
    p.add_argument('--batch-size',type=int,default=8);p.add_argument('--delay',type=float,default=5);p.add_argument('--retries',type=int,default=1)
    p.add_argument('--max-requests',type=int,default=600);p.add_argument('--max-mb',type=float,default=500)
    p.add_argument('--endpoint',default=os.environ.get('SKYWARD_OVERPASS_URL','https://overpass-api.de/api/interpreter'))
    args=p.parse_args()
    if not 1<=args.batch_size<=32 or not math.isfinite(args.delay) or args.delay<5 or not 0<=args.retries<=3 or args.max_requests<1 or not math.isfinite(args.max_mb) or args.max_mb<=0:p.error('Use batch size 1–32, delay >=5, retries 0–3, positive budgets')
    catalog=json.loads((ROOT/'data/airport-catalog.json').read_text())
    codes=list(dict.fromkeys([c.upper() for c in args.codes]+(sorted(catalog) if args.all else []))) or ['BFS','ESB','TAS','VTE','IAD','IST']
    if any(c not in catalog for c in codes):p.error('Unknown airport code')
    status_path=ROOT/'data/facility-import-status.json';status=json.loads(status_path.read_text()) if status_path.exists() else {}
    cache=ROOT/'data/osm/v2';cache.mkdir(parents=True,exist_ok=True)
    geometries={c:json.loads((ROOT/'public/data/airports'/f'{c}.json').read_text()) for c in codes}
    client=Client(args);todo=[]
    for c in codes:
        s=status.get(c,{})
        if not args.refresh and not args.cached_only and s.get('importerVersion')==VERSION and s.get('status') in ('imported','empty','review_required'):
            continue
        snapshot=cache/f'{c}.json'
        if snapshot.exists() and (not args.refresh or args.cached_only):
            from shapely.geometry import shape
            try:
                saved=json.loads(snapshot.read_text());b={**saved['boundary'],'shape':shape(saved['boundary']['shape'])}
                publish(c,saved['elements'],saved['provenance'],b,geometries,status,args)
            except Exception as e:
                status[c]={'status':'validation_failed','recordedAt':now(),'reason':'Cached snapshot: '+str(e),'importerVersion':VERSION}
                if not args.cached_only:todo.append(c)
        elif not args.cached_only:todo.append(c)
    atomic(status_path,status)
    stopped=None;consecutive_failures=0
    boundary_catalog=None;boundary_catalog_proof=None
    catalog_path=cache/'boundary-catalog.json'
    if todo and args.all:
        try:
            if catalog_path.exists() and not args.refresh:
                saved=json.loads(catalog_path.read_text());boundary_catalog=saved['data'];boundary_catalog_proof=saved['provenance']
            else:
                identifiers='|'.join(re.escape(a['icao']) for a in catalog.values() if re.fullmatch(r'[A-Z0-9]{3,8}',a.get('icao','')))
                query='[out:json][timeout:45][maxsize:134217728];nwr["aeroway"="aerodrome"]["icao"~"^('+identifiers+')$"];out geom;'
                boundary_catalog,boundary_catalog_proof=client.query(query)
                atomic(catalog_path,{'data':boundary_catalog,'provenance':boundary_catalog_proof})
                print('Cached catalog boundaries:',len(boundary_catalog['elements']),flush=True)
        except (RateLimited,BudgetExceeded,KeyboardInterrupt) as e:stopped=str(e) or 'Interrupted; checkpoints preserved'
        except Exception as e:print('Catalog boundary cache unavailable; using per-batch lookups:',str(e),flush=True)
    for start in range(0,len(todo),args.batch_size):
        if stopped:break
        batch=todo[start:start+args.batch_size]
        try:
            boundaries={code:boundary_for(catalog[code],boundary_catalog['elements']) for code in batch} if boundary_catalog else {}
            cached_matches={code for code,b in boundaries.items() if b}
            missing=[code for code in batch if not boundaries.get(code)]
            data,boundary_provenance=client.query(boundary_query(missing,catalog)) if missing else (boundary_catalog,boundary_catalog_proof)
            for code in batch:
                b=boundaries.get(code) or boundary_for(catalog[code],data['elements']) or fallback_boundary(catalog[code],geometries[code])
                if b:boundaries[code]=b
                else:status[code]={'status':'review_required','importerVersion':VERSION,'recordedAt':now(),'reason':'No safe matching boundary'}
            if not boundaries:continue
            facilities,provenance=client.query(facility_query(boundaries))
            empty_areas={code:b for code,b in boundaries.items() if b['osmId'] and not candidate_elements(facilities['elements'],b['shape'])}
            supplements={};supplement_error=None
            if empty_areas:
                try:
                    extra,extra_provenance=client.query(facility_query(empty_areas,force_polygon=True))
                    supplements={code:(candidate_elements(extra['elements'],b['shape']),extra_provenance) for code,b in empty_areas.items()}
                except Exception as e:supplement_error=e
            consecutive_failures=0
            from shapely.geometry import mapping
            for code,b in boundaries.items():
                if code in empty_areas and supplement_error:
                    status[code]={'status':'unavailable','recordedAt':now(),'reason':'Polygon fallback: '+str(supplement_error),'importerVersion':VERSION}
                    continue
                elements=candidate_elements(facilities['elements'],b['shape'])
                code_provenance=provenance
                if code in supplements:elements,code_provenance=supplements[code]
                boundary_proof=boundary_catalog_proof if code in cached_matches else boundary_provenance
                proof={**code_provenance,'boundaryQuery':boundary_proof['query'],'boundarySha256':boundary_proof['sha256']}
                atomic(cache/f'{code}.json',{'elements':elements,'boundary':{**b,'shape':mapping(b['shape'])},'provenance':proof})
                try:publish(code,elements,proof,b,geometries,status,args)
                except Exception as e:status[code]={'status':'validation_failed','recordedAt':now(),'reason':str(e),'importerVersion':VERSION}
                print(code,status[code]['status'],status[code].get('counts',{}),flush=True)
            if isinstance(supplement_error,(RateLimited,BudgetExceeded)):raise supplement_error
        except KeyboardInterrupt:
            stopped='Interrupted; checkpoints preserved';break
        except (RateLimited,BudgetExceeded) as e:
            stopped=str(e);print('STOPPED:',stopped,flush=True);break
        except Exception as e:
            for code in batch:status[code]={'status':'unavailable','recordedAt':now(),'reason':str(e),'importerVersion':VERSION}
            print('FAILED',','.join(batch),str(e),flush=True)
            consecutive_failures+=1
            if consecutive_failures>=3:
                stopped='Three consecutive failed batches; provider may be unavailable; resume later'
                break
        finally:atomic(status_path,status)
    summary={'finishedAt':now(),'requested':len(codes),'requests':client.requests,'downloadBytes':client.bytes,'stopped':stopped,'outcomes':{}}
    for c in codes:
        state=status.get(c,{}).get('status','not_attempted');summary['outcomes'][state]=summary['outcomes'].get(state,0)+1
    atomic(ROOT/'data/facility-import-summary.json',summary)
    if not args.cached_only:atomic(ROOT/'data/facility-import-network-summary.json',summary)
    print(json.dumps(summary),flush=True)
    return 2 if stopped else 0
if __name__=='__main__':raise SystemExit(main())
