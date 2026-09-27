#!/usr/bin/env python3
"""Package local IANA reference locations; these are not timezone polygons."""
import hashlib,json,re
from pathlib import Path
source=Path('/usr/share/zoneinfo/zone.tab')
rows=[]
for line in source.read_text().splitlines():
    if not line or line.startswith('#'):continue
    country,coord,zone,*_=line.split('\t')
    m=re.fullmatch(r'([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?',coord)
    if not m:continue
    g=m.groups()
    lat=(int(g[1])+int(g[2])/60+int(g[3] or 0)/3600)*(-1 if g[0]=='-' else 1)
    lon=(int(g[5])+int(g[6])/60+int(g[7] or 0)/3600)*(-1 if g[4]=='-' else 1)
    rows.append(dict(country=country,zone=zone,lat=round(lat,5),lon=round(lon,5)))
version=Path('/usr/share/zoneinfo/tzdata.zi')
output=Path(__file__).resolve().parents[1]/'public/data/timezone-references.json'
output.write_text(json.dumps(dict(source='IANA tz database zone.tab reference locations; not timezone boundaries',sourceUrl='https://data.iana.org/time-zones/tzdb/zone.tab',license='Public domain',version=version.read_text().splitlines()[0] if version.exists() else 'System tzdata',sha256=hashlib.sha256(source.read_bytes()).hexdigest(),zones=rows),separators=(',',':')))
print(f'Prepared {len(rows)} timezone reference locations')
