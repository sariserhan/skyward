"""Refresh the free major-airport catalog and runway snapshots. No runtime API keys."""
import csv, hashlib, io, json, math, urllib.request
from datetime import datetime, timezone
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://davidmegginson.github.io/ourairports-data/'
stamp = datetime.now(timezone.utc).isoformat()
manifest = {'retrievedAt':stamp, 'selection':'type=large_airport AND scheduled_service=yes; plus existing IAD and IST', 'license':'Public domain', 'sources':{}}
def rows(name):
    raw = urllib.request.urlopen(BASE+name+'.csv', timeout=60).read()
    manifest['sources'][name] = {'url':BASE+name+'.csv','sha256':hashlib.sha256(raw).hexdigest()}
    return list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
airports, runways, countries = rows('airports'), rows('runways'), rows('countries')
country_names = {r['code']:r['name'] for r in countries}
catalog = {}
by_ident = {}
for r in airports:
    if not (r['type']=='large_airport' and r['scheduled_service']=='yes') and r['ident'] not in ('KIAD','LTFM'):continue
    lat, lon = float(r['latitude_deg']), float(r['longitude_deg'])
    if not math.isfinite(lat+lon) or abs(lat)>90 or abs(lon)>180:continue
    key = r['iata_code'] or r['ident']
    if key in catalog:raise ValueError('Duplicate airport ID: '+key)
    catalog[key] = {'name':r['name'],'country':country_names.get(r['iso_country'],r['iso_country']),'countryCode':r['iso_country'],'city':r['municipality'],'icao':r['ident'],'iata':r['iata_code'],'lat':lat,'lon':lon,'sourceUrl':'https://ourairports.com/airports/'+r['ident']+'/','retrievedAt':stamp}
    by_ident[r['ident']] = key
legacy={a['id']:a for a in json.loads((ROOT/'public/data/airports.json').read_text())['airports']}
manifest['airports']={}
for code,a in sorted(catalog.items()):
    path=ROOT/'public/data/airports'/f'{code}.json'
    # Preserve fetched OSM features on catalog refresh, and keep original detailed airports.
    old=json.loads(path.read_text()) if path.exists() else {}
    g=legacy.get(code,{'id':code,'name':a['name'],'lat':a['lat'],'lon':a['lon'],'runways':[],'surfaces':old.get('surfaces',[]),'paths':old.get('paths',[]),'gates':old.get('gates',[]),'source':f'OurAirports public-domain runway endpoints, retrieved {stamp[:10]}. Gate and building coverage unavailable unless separately mapped.'})
    missing=0
    if code not in legacy:
        for r in runways:
            if r['airport_ident']!=a['icao'] or r['closed']=='1':continue
            try:
                vals=[float(r[k]) for k in ['le_longitude_deg','le_latitude_deg','he_longitude_deg','he_latitude_deg','width_ft','length_ft']]
                if not all(math.isfinite(v) for v in vals) or any(abs(vals[i])>180 for i in (0,2)) or any(abs(vals[i])>90 for i in (1,3)) or min(vals[4:])<=0:raise ValueError()
                g['runways'].append({'id':r['le_ident']+'/'+r['he_ident'],'a':vals[:2],'b':vals[2:4],'width':round(vals[4]*.3048,2),'length':round(vals[5]*.3048,2)})
            except (ValueError,KeyError):missing+=1
    g['coverage']={'runways':'partial' if missing else 'mapped' if g['runways'] else 'unavailable','omittedRunways':missing,'buildings':'partial' if g['surfaces'] else 'unavailable','gates':'partial' if g['gates'] else 'unavailable','retrievedAt':stamp,'sourceUrl':a['sourceUrl']}
    if old.get('osm'):
        g['osm']=old['osm'];g['source']=old['source']
    path.write_text(json.dumps(g,separators=(',',':')))
    manifest['airports'][code]={'runways':len(g['runways']),'omittedRunways':missing}
(ROOT/'data/airport-catalog.json').write_text(json.dumps(catalog,separators=(',',':'),sort_keys=True))
(ROOT/'data/airport-import.json').write_text(json.dumps(manifest,indent=2))
print(f'Imported {len(catalog)} major airports, {sum(v["runways"] for v in manifest["airports"].values())} mapped runways',flush=True)
