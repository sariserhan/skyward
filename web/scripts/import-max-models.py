"""Reproduce GPL-2.0 MAX exterior conversions, with upstream sources and hashes.
No geometry is generated or stretched. AC3D export is triangulated, smoothed
at its authored crease angle and rigidly oriented nose +Z / up +Y. Gear and
cabin interior are omitted for the airborne display; branding is separate.
"""
from pathlib import Path
import json, urllib.request, hashlib, shlex, math, struct
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/models/sourced'
REPO='REXO-77/737-MAX'; COMMIT='fc4316a01c1ec488789725bb54ed2f454f931ac6'
RAW=f'https://raw.githubusercontent.com/{REPO}/{COMMIT}/'
TREE=json.load(urllib.request.urlopen(f'https://api.github.com/repos/{REPO}/git/trees/{COMMIT}?recursive=1'))
BLOBS={x['path']:x for x in TREE['tree'] if x['type']=='blob'}; files=[]
def download(remote):
    target=OUT/'source/max'/remote; target.parent.mkdir(parents=True,exist_ok=True)
    data=target.read_bytes() if target.exists() else urllib.request.urlopen(RAW+remote,timeout=60).read()
    info=BLOBS[remote]
    assert len(data)==info['size'] and hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==info['sha'], remote
    target.write_bytes(data); files.append({'path':str(target.relative_to(OUT)),'sourceUrl':RAW+remote,'sha256':hashlib.sha256(data).hexdigest()})
    return data

def triangulate(refs,vertices):
    if len(refs)<3:return []
    if len(refs)==3:return [refs]
    pts=[vertices[int(r[0])] for r in refs]
    # Newell normal chooses the most stable projection for arbitrary polygons.
    n=[sum((a[(i+1)%3]-b[(i+1)%3])*(a[(i+2)%3]+b[(i+2)%3]) for a,b in zip(pts,pts[1:]+pts[:1])) for i in range(3)]
    axes=[i for i in range(3) if i!=max(range(3),key=lambda i:abs(n[i]))]
    p=[[v[i] for i in axes] for v in pts]
    def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]));sign=1 if area>0 else -1
    if abs(area)<1e-12:return []
    remaining=list(range(len(p)));result=[]
    while len(remaining)>3:
        for k,b in enumerate(remaining):
            a=remaining[k-1];c=remaining[(k+1)%len(remaining)]
            if sign*cross(p[a],p[b],p[c])<=1e-12:continue
            if any(all(sign*cross(p[x],p[y],p[t])>1e-12 for x,y in [(a,b),(b,c),(c,a)]) for t in remaining if t not in (a,b,c)):continue
            result.append([refs[a],refs[b],refs[c]]);remaining.pop(k);break
        else:
            # Remove authored collinear/repeated points, never fan across a concavity.
            k=next((k for k,b in enumerate(remaining) if abs(cross(p[remaining[k-1]],p[b],p[remaining[(k+1)%len(remaining)]]))<1e-10),None)
            if k is None:raise ValueError('Non-simple polygon requires source review')
            remaining.pop(k)
    if len(remaining)==3:result.append([refs[i] for i in remaining])
    return result

def parse(data):
    lines=iter(data.decode().splitlines()); objects=[]; o=None
    for line in lines:
        t=shlex.split(line)
        if not t:continue
        k=t[0]
        if k=='OBJECT':
            o={'name':'','vertices':[],'faces':[],'texture':None,'crease':30}; objects.append(o)
        elif k=='name':o['name']=t[1]
        elif k=='data':next(lines)
        elif k=='texture':o['texture']=t[1]
        elif k=='crease':o['crease']=float(t[1])
        elif k in ('loc','rot'):raise ValueError('Unexpected transform; converter must be extended')
        elif k=='numvert':o['vertices']=[list(map(float,next(lines).split())) for _ in range(int(t[1]))]
        elif k=='SURF':flags=int(t[1],0)
        elif k=='refs':
            refs=[list(map(float,next(lines).split())) for _ in range(int(t[1]))]
            if flags&15:continue
            o['faces'].extend(triangulate(refs,o['vertices']))
    return objects

def normal(a,b,c):
    u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
    n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];d=math.sqrt(sum(x*x for x in n)) or 1
    return [x/d for x in n]

def convert(variant,code):
    id=code.lower(); remote=f'Models/737-{variant}.ac'; objects=parse(download(remote));download(f'src/{code}.blend')
    # Static flight pose: exclude deployed gear and hidden cabin geometry.
    objects=[o for o in objects if o['faces'] and not o['name'].startswith(('mlg.','nlg.','interior.','cargo.'))]
    points=[p for o in objects for p in o['vertices']]; lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    print(code,'authored bounds',lo,hi,flush=True)
    # FlightGear AC exports use longitudinal X, vertical Y and lateral Z.
    fin=next(o for o in objects if o['name']=='v-stab'); tail=sum(p[0] for p in fin['vertices'])/len(fin['vertices']);cx=(lo[0]+hi[0])/2;cz=(lo[2]+hi[2])/2
    sign=-1 if tail>cx else 1
    def orient(p):return [-sign*(p[2]-cz),p[1],sign*(p[0]-cx)]
    g={'asset':{'version':'2.0','copyright':'737-MAX FlightGear contributors, original model by omri_ha_muglob; GPL-2.0. See source/max/README.md and LICENSE.'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'buffers':[],'bufferViews':[],'accessors':[]}
    binary=bytearray(); mats={};textures={}
    def attr(values,n):
        offset=len(binary);flat=[v for row in values for v in row];binary.extend(struct.pack('<'+'f'*len(flat),*flat));vi=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(flat)*4,'target':34962});a={'bufferView':vi,'componentType':5126,'count':len(values),'type':f'VEC{n}'}
        if n==3:a.update(min=[min(v[i] for v in values) for i in range(n)],max=[max(v[i] for v in values) for i in range(n)])
        g['accessors'].append(a);return len(g['accessors'])-1
    for o in objects:
        tex=o['texture'];key=(tex,o['name']=='windshield')
        if key not in mats:
            pbr={'metallicFactor':.08,'roughnessFactor':.65}
            if tex:
                if tex not in textures:
                    data=download('Models/'+tex);vi=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});binary.extend(data);binary.extend(b'\0'*((-len(binary))%4));im=len(g['images']);g['images'].append({'bufferView':vi,'mimeType':'image/png'});textures[tex]=len(g['textures']);g['textures'].append({'sampler':0,'source':im})
                pbr['baseColorTexture']={'index':textures[tex]}
            if o['name']=='windshield':pbr['baseColorFactor']=[.08,.14,.18,1]
            mat={'name':tex or o['name'],'doubleSided':True,'pbrMetallicRoughness':pbr}
            if tex and ('overlay' in tex or 'light' in tex):mat.update(alphaMode='MASK',alphaCutoff=.3)
            mats[key]=len(g['materials']);g['materials'].append(mat)
        verts=[orient(p) for p in o['vertices']]; norms=[];adj={}
        for f in o['faces']:
            n=normal(*(verts[int(r[0])] for r in f));norms.append(n)
            for r in f:adj.setdefault(int(r[0]),[]).append(n)
        positions=[];normals=[];uv=[];threshold=math.cos(math.radians(o['crease']))
        for f,n in zip(o['faces'],norms):
            for r in f:
                idx=int(r[0]);positions.append(verts[idx]);ns=[v for v in adj[idx] if sum(v[i]*n[i] for i in range(3))>=threshold-1e-6];total=[sum(v[i] for v in ns) for i in range(3)];d=math.sqrt(sum(x*x for x in total)) or 1;normals.append([x/d for x in total]);uv.append([r[1],1-r[2]])
        primitive={'attributes':{'POSITION':attr(positions,3),'NORMAL':attr(normals,3),'TEXCOORD_0':attr(uv,2)},'material':mats[key]}
        g['scenes'][0]['nodes'].append(len(g['nodes']));g['nodes'].append({'name':o['name'],'mesh':len(g['meshes'])});g['meshes'].append({'name':o['name'],'primitives':[primitive]})
    name=f'{id}-v1.bin';(OUT/name).write_bytes(binary);g['buffers']=[{'uri':name,'byteLength':len(binary)}]
    g['extras']={'skyward':{'source':f'https://github.com/{REPO}','commit':COMMIT,'license':'GPL-2.0','changes':'Triangulated AC3D exterior, authored crease normals, rigid nose +Z rotation; deployed landing gear and hidden cabin omitted for airborne display. Original meshes and texture coordinates retained. No dimensional stretching.','sourceFiles':[f'source/max/{remote}',f'source/max/src/{code}.blend']}}
    (OUT/f'{id}-v1.gltf').write_text(json.dumps(g,separators=(',',':')))
    return {'id':id,'label':f'Boeing 737 MAX {variant}','types':[code],'variantVerified':False,'fidelityNote':'Community MAX exterior; exact variant and registration-specific details are unverified. MAX 7/8 use this MAX-family model; the upstream MAX 8 geometry is unfinished.','uri':f'models/sourced/{id}-v1.gltf','length':round(hi[0]-lo[0],3),'sourceUrl':RAW+remote,'commit':COMMIT,'license':'GPL-2.0','editableSources':[f'models/sourced/source/max/src/{code}.blend',f'models/sourced/source/max/{remote}']}

if __name__=='__main__':
    download('LICENSE');download('README.md')
    models=[convert(v,c) for v,c in [(9,'B39M'),(10,'B3XM')]]
    manifest=json.loads((OUT/'manifest.json').read_text());ids={'b37m','b38m','b39m','b3xm'};manifest['models']=[m for m in manifest['models'] if m['id'] not in ids]+models
    manifest['files']=[f for f in manifest['files'] if not f.get('path','').startswith(('source/max/','models/sourced/source/max/'))]+list({f['path']:f for f in files}.values())
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    cat=ROOT/'src/lib/sourcedAircraft.json';catalog=json.loads(cat.read_text());catalog=[m for m in catalog if m['id'] not in ids]+[{k:m[k] for k in ['id','label','types','uri','length','variantVerified','fidelityNote']} for m in models];cat.write_text(json.dumps(catalog,indent=2)+'\n')
    (OUT/'source/max/import-max-models.py').write_text(Path(__file__).read_text())
