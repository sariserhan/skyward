"""Validated OSM facility conversion; no network or publication side effects."""
import math
from collections import Counter
from shapely.geometry import Polygon, MultiPolygon, Point, LineString
from shapely.ops import polygonize, unary_union

VERSION = 2

def coordinate(p):
    try:
        x, y = float(p['lon']), float(p['lat'])
        if not math.isfinite(x+y) or not -180 <= x <= 180 or not -90 <= y <= 90:
            raise ValueError('coordinate out of range')
        return (x, y)
    except (KeyError, TypeError, OverflowError):
        raise ValueError('invalid coordinate')

def line(raw):
    points = [coordinate(p) for p in raw]
    points = [p for i, p in enumerate(points) if not i or p != points[i-1]]
    if len(points) < 2 or len(points) > 20000:
        raise ValueError('invalid vertex count')
    if any(abs(a[0]-b[0]) > 180 for a,b in zip(points,points[1:])):
        raise ValueError('antimeridian geometry requires review')
    return points

def polygons(e):
    """Assemble reversed/split members, preserve inner rings; never repair/fill holes."""
    if e['type'] == 'way':
        pts = line(e.get('geometry', []))
        if pts[0] != pts[-1] or len(pts) < 4:
            raise ValueError('open polygon')
        result = [Polygon(pts)]
    elif e['type'] == 'relation':
        rings = {}
        for role in ('outer', 'inner'):
            members = [m for m in e.get('members', []) if m.get('type') == 'way' and m.get('role','') in ((role,'') if role=='outer' else (role,))]
            segments = [LineString(line(m.get('geometry', []))) for m in members]
            if not segments:
                rings[role] = [];continue
            merged = unary_union(segments)
            parts = list(polygonize(merged))
            # Dangling/missing members must not silently manufacture a complete ring.
            if not parts or not merged.difference(unary_union([p.boundary for p in parts])).is_empty:
                raise ValueError('incomplete relation rings')
            rings[role] = parts
        if not rings['outer']:
            raise ValueError('relation has no outer ring')
        assigned = set();result=[]
        for outer in rings['outer']:
            holes = []
            for i,inner in enumerate(rings['inner']):
                if outer.contains(inner):
                    if i in assigned:raise ValueError('ambiguous inner ring')
                    holes.append(list(inner.exterior.coords));assigned.add(i)
            result.append(Polygon(outer.exterior.coords, holes))
        if len(assigned) != len(rings['inner']):raise ValueError('unassigned inner ring')
    else:
        raise ValueError('not a polygon')
    if any(not p.is_valid or p.is_empty or p.area < 1e-12 for p in result):
        raise ValueError('invalid polygon topology')
    if not MultiPolygon(result).is_valid:raise ValueError('overlapping polygon parts')
    return result

def boundary_for(a, elements):
    """Prefer exact ICAO/IATA; only use a unique untagged boundary covering the airport."""
    candidates=[]
    for e in elements:
        tags=e.get('tags',{})
        if tags.get('aeroway')!='aerodrome' or e['type'] not in ('way','relation'):continue
        icao=tags.get('icao','').upper();iata=tags.get('iata','').upper()
        if icao and a.get('icao') and icao != a['icao'].upper():continue
        if iata and a.get('iata') and iata != a['iata'].upper():continue
        try:
            shape=unary_union(polygons(e))
            center=Point(a['lon'],a['lat'])
            if shape.distance(center)>0.15 or shape.bounds[2]-shape.bounds[0]>1 or shape.bounds[3]-shape.bounds[1]>.5:continue
            icao=tags.get('icao','').upper();iata=tags.get('iata','').upper()
            if icao and a.get('icao') and icao != a['icao'].upper():continue
            if iata and a.get('iata') and iata != a['iata'].upper():continue
            match='icao' if icao and icao==a.get('icao','').upper() else 'iata' if iata and iata==a.get('iata','').upper() else 'boundary_contains_airport' if shape.covers(center) else None
            if match:candidates.append(({'icao':0,'iata':1,'boundary_contains_airport':2}[match],shape.area,e,shape,match))
        except ValueError:continue
    if not candidates:return None
    candidates.sort(key=lambda r:(r[0],r[1]))
    best=candidates[0]
    if best[0]==2 and len(candidates)>1:return None
    return {'shape':best[3],'method':best[4],'osmId':f"{best[2]['type']}/{best[2]['id']}"}

def fallback_boundary(a, geometry):
    """Small runway envelope, aviation-tagged features only; never all nearby buildings."""
    if abs(a['lat'])>80:return None
    pts=[(a['lon'],a['lat'])]
    for r in geometry.get('runways',[]):
        for p in (r['a'],r['b']):
            if abs(p[0]-a['lon'])<.12 and abs(p[1]-a['lat'])<.12:pts.append(tuple(p))
    from shapely.geometry import MultiPoint
    shape=MultiPoint(pts).convex_hull.buffer(.008)
    return {'shape':shape,'method':'bounded_aviation_fallback','osmId':None}

def query_polygon(shape):
    # Overpass polygon filter has no holes. Local validation retains the exact boundary.
    polys=list(shape.geoms) if shape.geom_type=='MultiPolygon' else [shape]
    result=[]
    for p in polys:
        simplified=p.simplify(.00004,preserve_topology=True)
        if len(simplified.exterior.coords)>1000:raise ValueError('boundary too complex')
        result.append(' '.join(f'{y:.7f} {x:.7f}' for x,y in simplified.exterior.coords))
    return result

def height(tags, kind):
    if kind=='apron':return 0
    try:
        if 'height' in tags:
            raw=tags['height'].strip().lower()
            value=float(raw.removesuffix(' ft').removesuffix(' m'))*(.3048 if raw.endswith(' ft') else 1)
        else:value=float(tags.get('building:levels',3))*4
        return round(max(3,min(150,value)),2) if math.isfinite(value) else 12
    except (ValueError,TypeError):return 12

def convert(elements, boundary):
    shape=boundary['shape'];fallback=boundary['method']=='bounded_aviation_fallback'
    surfaces=[];gates=[];paths=[];rejected=Counter();seen=set();members=set();duplicates=0
    ordered=sorted(elements,key=lambda e:(e['type']!='relation',e['type'],e['id']))
    for e in ordered:
        tags=e.get('tags',{});kind=tags.get('aeroway');key=f"{e['type']}/{e['id']}"
        if key in seen:duplicates+=1;continue
        seen.add(key)
        if key in members:duplicates+=1;continue
        if kind=='aerodrome':continue
        if fallback and kind not in ('terminal','hangar','apron','taxiway','parking_position','gate'):continue
        try:
            if e['type']=='node' and kind=='gate':
                pos=coordinate(e)
                if shape.covers(Point(pos)):gates.append({'label':tags.get('ref') or tags.get('name') or f"OSM {e['id']}",'position':list(pos),'osmId':key})
                continue
            if e['type']=='way' and kind in ('taxiway','parking_position'):
                pts=line(e.get('geometry',[]));route=LineString(pts)
                if not shape.covers(route):
                    if shape.intersects(route):rejected['path_crosses_airport_boundary']+=1
                    continue
                paths.append({'points':[list(p) for p in pts],'kind':kind,'osmId':key});continue
            if e['type'] not in ('way','relation') or ('building' not in tags and kind not in ('terminal','hangar','apron')):continue
            if tags.get('building')=='no':continue
            parts=polygons(e)
            if not all(shape.covers(p.representative_point()) for p in parts):continue
            # Airport boundaries can touch terminal edges; permit only a small tolerance.
            if not all(shape.buffer(.00015).covers(p) for p in parts):
                rejected['building_crosses_airport_boundary']+=1;continue
            k='terminal' if kind=='terminal' or tags.get('building')=='terminal' else 'apron' if kind=='apron' else 'hangar' if kind=='hangar' else 'building'
            for i,p in enumerate(parts):
                surface={'kind':k,'label':tags.get('name') or tags.get('ref') or '', 'points':[list(pt) for pt in p.exterior.coords], 'height':height(tags,k),'osmId':key,'part':i}
                if p.interiors:surface['holes']=[[list(pt) for pt in ring.coords] for ring in p.interiors]
                surfaces.append(surface)
            if e['type']=='relation':members.update(f"way/{m['ref']}" for m in e.get('members',[]) if m.get('type')=='way')
        except (ValueError,KeyError,TypeError) as err:
            rejected[str(err) if isinstance(err,ValueError) else 'malformed_element']+=1
    # Identical gate labels at distinct positions can be legitimate. Collapse only exact duplicates.
    unique={}
    for g in gates:
        key=(g['label'],*g['position'])
        if key in unique:duplicates+=1
        else:unique[key]=g
    # Connectivity is diagnostic, not a claim that every gate has a usable taxi route.
    endpoints=set();owners={}
    for i,path in enumerate(paths):
        endpoints.update((tuple(path['points'][0]),tuple(path['points'][-1])))
        for p in path['points']:owners.setdefault(tuple(p),set()).add(i)
    audit={'rejected':dict(rejected),'duplicatesOmitted':duplicates,'isolatedPathEndpoints':sum(len(owners[p])==1 for p in endpoints),'courtyards':sum(len(s.get('holes',[])) for s in surfaces),'polygonParts':len(surfaces)}
    return {'surfaces':surfaces,'gates':list(unique.values()),'paths':paths},audit
