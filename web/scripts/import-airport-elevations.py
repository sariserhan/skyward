from pathlib import Path
import urllib.request,csv,io,json,hashlib,datetime,math
root=Path(__file__).resolve().parents[1];url='https://davidmegginson.github.io/ourairports-data/airports.csv';raw=urllib.request.urlopen(url,timeout=30).read();rows={r['ident']:r for r in csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))};catalog=json.loads((root/'data/airport-catalog.json').read_text());out={}
for code,a in catalog.items():
 try:
  v=float(rows[a['icao']]['elevation_ft'])
  if math.isfinite(v):out[code]=v
 except (KeyError,ValueError):pass
(root/'data/airport-elevations.json').write_text(json.dumps(out,separators=(',',':'),sort_keys=True))
(root/'data/airport-elevations-source.json').write_text(json.dumps({'url':url,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sha256':hashlib.sha256(raw).hexdigest(),'license':'OurAirports public domain','count':len(out)},indent=2)+'\n');print('Airport elevations:',len(out))
