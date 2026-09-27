"""Import a compact, source-tracked Natural Earth atlas. Run explicitly, not at build time."""
import json,urllib.request,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[1]
names=['ne_50m_admin_0_countries','ne_50m_lakes','ne_50m_rivers_lake_centerlines']
def bounds(rings):
 pts=[p for ring in rings for p in ring];return [min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts)]
def rounded(ring):return [[round(p[0],4),round(p[1],4)] for p in ring]
data={'land':[],'lakes':[],'rivers':[],'labels':[],'sources':[]}
for index,name in enumerate(names):
 url='https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'+name+'.geojson'
 with urllib.request.urlopen(url,timeout=60) as response:raw=response.read()
 data['sources'].append({'url':url,'sha256':hashlib.sha256(raw).hexdigest(),'license':'Public domain','retrieved':'2026-09-27'})
 for feature in json.loads(raw)['features']:
  geometry=feature['geometry'];props=feature['properties'];coords=geometry['coordinates'];kind=geometry['type']
  if index==0:
   label=props.get('NAME_EN') or props.get('NAME');lon=props.get('LABEL_X');lat=props.get('LABEL_Y')
   if isinstance(lon,(int,float)) and isinstance(lat,(int,float)):data['labels'].append({'name':label,'lon':lon,'lat':lat,'rank':props.get('LABELRANK',5)})
  parts=coords if kind in ('MultiPolygon','MultiLineString') else [coords]
  for rings in parts:
   if index==2:rings=[rings]
   rings=[rounded(r) for r in rings if len(r)>=2]
   if not rings:continue
   record={'rings':rings,'bounds':bounds(rings)}
   if index==0:record['shade']=int(props.get('MAPCOLOR7') or 1)%4
   if index==2:record['rank']=props.get('scalerank',4)
   data[['land','lakes','rivers'][index]].append(record)
(root/'public/data/atlas-v2.json').write_text(json.dumps(data,separators=(',',':')))
print({k:len(v) for k,v in data.items()})
