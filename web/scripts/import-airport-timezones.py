"""Import coordinate-checked IANA timezone references from OpenFlights (ODbL)."""
import csv,hashlib,io,json,urllib.request,math
from pathlib import Path
from datetime import datetime,timezone
root=Path(__file__).resolve().parents[1]
url='https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat'
raw=urllib.request.urlopen(url,timeout=30).read()
rows={r[5]:r for r in csv.reader(io.StringIO(raw.decode())) if len(r)>11 and '/' in r[11]}
catalog=json.loads((root/'data/airport-catalog.json').read_text());zones={}
for ident,a in catalog.items():
 r=rows.get(a['icao'])
 if not r:continue
 dy=(a['lat']-float(r[6]))*111.32;dx=(a['lon']-float(r[7]))*111.32*math.cos(math.radians(a['lat']))
 if math.hypot(dx,dy)>20:continue
 zones[ident]=r[11]
(root/'data/airport-timezones.json').write_text(json.dumps(zones,indent=2,sort_keys=True)+'\n')
meta={'source':url,'publisher':'OpenFlights','license':'ODbL-1.0','licenseUrl':'https://github.com/jpatokal/openflights/blob/master/data/LICENSE','retrievedAt':datetime.now(timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'matched':len(zones),'catalog':len(catalog),'match':'Exact ICAO and within 20 km; unknown zones omitted. Historical reference; offsets and DST from browser IANA database.'}
(root/'data/airport-timezones-source.json').write_text(json.dumps(meta,indent=2)+'\n')
print('Timezone references:',len(zones),'/',len(catalog))
