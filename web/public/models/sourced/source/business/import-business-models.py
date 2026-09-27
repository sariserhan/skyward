"""Reproduce GPL-2.0 business-jet exterior conversions with pinned source hashes.
No geometry is generated or stretched. AC3D export is triangulated, smoothed
at its authored crease angle and rigidly oriented nose +Z / up +Y. Gear and
cabin interior are omitted for the airborne display; branding is separate.
"""
from pathlib import Path
import json, urllib.request, hashlib, shlex, math, struct
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/models/sourced'
REPO=''; COMMIT=''; RAW=''; BLOBS={}; files=[]; source_id=''
def download(remote):
    target=OUT/'source/business'/source_id/remote; target.parent.mkdir(parents=True,exist_ok=True)
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
    lines=iter(data.decode().splitlines()); objects=[]; o=None; materials=[]; material=0
    for line in lines:
        t=shlex.split(line)
        if not t:continue
        k=t[0]
        if k=='MATERIAL':
            materials.append({'rgb':list(map(float,t[t.index('rgb')+1:t.index('rgb')+4])),'alpha':1-float(t[t.index('trans')+1])})
        elif k=='mat':material=int(t[1])
        elif k=='OBJECT':
            o={'name':'','vertices':[],'faces':[],'texture':None,'crease':30}; objects.append(o)
        elif k=='name':o['name']=t[1]
        elif k=='data':next(lines)
        elif k=='texture':o['texture']=t[1]
        elif k=='crease':o['crease']=float(t[1])
        elif k=='loc':
            if any(float(v)!=0 for v in t[1:]):raise ValueError('Nonidentity translation requires hierarchy conversion')
        elif k=='rot':
            if list(map(float,t[1:]))!=[1,0,0,0,1,0,0,0,1]:raise ValueError('Nonidentity rotation requires hierarchy conversion')
        elif k=='texrep':
            if list(map(float,t[1:]))!=[1,1]:raise ValueError('Unexpected texture repeat')
        elif k=='texoff':
            if any(float(v)!=0 for v in t[1:]):raise ValueError('Unexpected texture offset')
        elif k=='numvert':o['vertices']=[list(map(float,next(lines).split())) for _ in range(int(t[1]))]
        elif k=='SURF':flags=int(t[1],0)
        elif k=='refs':
            refs=[list(map(float,next(lines).split())) for _ in range(int(t[1]))]
            if flags&15:continue
            o['faces'].extend((material,face) for face in triangulate(refs,o['vertices']))
    split=[]
    for o in objects:
        for mi in sorted(set(m for m,f in o['faces'])):
            split.append({**o,'material':materials[mi],'faces':[f for m,f in o['faces'] if m==mi]})
    return split

def normal(a,b,c):
    u=[b[i]-a[i] for i in range(3)];v=[c[i]-a[i] for i in range(3)]
    n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];d=math.sqrt(sum(x*x for x in n)) or 1
    return [x/d for x in n]

def convert(id,label,code,remote,tail_name,omit):
    objects=parse(download(remote));download('COPYING')
    objects=[o for o in objects if o['faces'] and not any(token.lower() in o['name'].lower() for token in omit)]
    points=[p for o in objects for p in o['vertices']]; lo=[min(p[i] for p in points) for i in range(3)];hi=[max(p[i] for p in points) for i in range(3)]
    fin=[p for o in objects if o['name'].lower()==tail_name.lower() for p in o['vertices']]
    assert fin, 'No authored fin found'
    center=[(a+b)/2 for a,b in zip(lo,hi)];tail=[sum(p[i] for p in fin)/len(fin) for i in range(3)]
    axis=0 if abs(tail[0]-center[0])>abs(tail[2]-center[2]) else 2
    sign=-1 if tail[axis]>center[axis] else 1
    def orient(p):
        return [-sign*(p[2]-center[2]),p[1],sign*(p[0]-center[0])] if axis==0 else [sign*(p[0]-center[0]),p[1],sign*(p[2]-center[2])]
    length=hi[axis]-lo[axis];assert 15<length<25, (id,lo,hi)
    print(id,'length',length,'axis',axis,'bounds',lo,hi,flush=True)
    g={'asset':{'version':'2.0','copyright':f'{label}: original FlightGear / FGMEMBERS model authors; GPL-2.0. Original source and license in source/business/{id}.'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'images':[],'textures':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'buffers':[],'bufferViews':[],'accessors':[]}
    binary=bytearray(); mats={};textures={}
    def attr(values,n):
        offset=len(binary);flat=[v for row in values for v in row];binary.extend(struct.pack('<'+'f'*len(flat),*flat));vi=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(flat)*4,'target':34962});a={'bufferView':vi,'componentType':5126,'count':len(values),'type':f'VEC{n}'}
        if n==3:a.update(min=[min(v[i] for v in values) for i in range(n)],max=[max(v[i] for v in values) for i in range(n)])
        g['accessors'].append(a);return len(g['accessors'])-1
    for o in objects:
        tex=o['texture'];key=(tex,tuple(o['material']['rgb']),o['material']['alpha'])
        if key not in mats:
            pbr={'metallicFactor':.08,'roughnessFactor':.65,'baseColorFactor':[*o['material']['rgb'],o['material']['alpha']]}
            if tex:
                if tex not in textures:
                    data=download('Models/'+tex);vi=len(g['bufferViews']);g['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)});binary.extend(data);binary.extend(b'\0'*((-len(binary))%4));im=len(g['images']);g['images'].append({'bufferView':vi,'mimeType':'image/png'});textures[tex]=len(g['textures']);g['textures'].append({'sampler':0,'source':im})
                pbr['baseColorTexture']={'index':textures[tex]}
            
            mat={'name':tex or o['name'],'doubleSided':True,'pbrMetallicRoughness':pbr}
            if o['material']['alpha']<1:mat.update(alphaMode='BLEND')
            elif tex and 'light' in tex:mat.update(alphaMode='MASK',alphaCutoff=.3)
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
    g['extras']={'skyward':{'source':f'https://github.com/{REPO}','commit':COMMIT,'license':'GPL-2.0','changes':'Triangulated AC3D exterior, authored crease normals, rigid nose +Z rotation; deployed landing gear and hidden cabin omitted for airborne display. Original meshes and texture coordinates retained. No dimensional stretching.','sourceFiles':[f'source/business/{id}/{remote}']}}
    (OUT/f'{id}-v1.gltf').write_text(json.dumps(g,separators=(',',':')))
    return {'id':id,'label':label,'types':[code],'uri':f'models/sourced/{id}-v1.gltf','length':round(length,3),'sourceUrl':RAW+remote,'sourceRepository':f'https://github.com/{REPO}','commit':COMMIT,'license':'GPL-2.0','editableSources':[f'models/sourced/source/business/{id}/{remote}',f'models/sourced/source/business/{id}/COPYING']}

if __name__=='__main__':
    models=[]
    for id,label,code,repo,commit,remote,tail,omit in [
        ('c750','Cessna Citation X','C750','CitationX','e497ad98591fa8d441eba188517b7238d6b1f85d','Models/CitationX.ac','Rudder_1',['wheel','shock','damper','strut','tarm','geardoor','Wlwell','step']),
        ('fa50','Dassault Falcon 50','FA50','Falcon-50','6f8fa21836bd6013601958327b6a1339e20da8c6','Models/falcon50.ac','direction',['axe','roue']),
    ]:
        source_id=id;REPO='FGMEMBERS/'+repo;COMMIT=commit;RAW=f'https://raw.githubusercontent.com/{REPO}/{COMMIT}/'
        tree=json.load(urllib.request.urlopen(f'https://api.github.com/repos/{REPO}/git/trees/{COMMIT}?recursive=1'));assert not tree.get('truncated')
        BLOBS={x['path']:x for x in tree['tree'] if x['type']=='blob'}
        models.append(convert(id,label,code,remote,tail,omit))
        for name in BLOBS:
            if '/' not in name and name.lower().startswith(('readme','author','license')):download(name)
    manifest=json.loads((OUT/'manifest.json').read_text());ids={m['id'] for m in models}
    manifest['models']=[m for m in manifest['models'] if m['id'] not in ids]+models
    manifest['files']=[f for f in manifest['files'] if not f.get('path','').startswith('source/business/')]+list({f['path']:f for f in files}.values())
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    cat=ROOT/'src/lib/sourcedAircraft.json';catalog=json.loads(cat.read_text());catalog=[m for m in catalog if m['id'] not in ids]+[{k:m[k] for k in ['id','label','types','uri','length','sourceRepository']} for m in models];cat.write_text(json.dumps(catalog,indent=2)+'\n')
    (OUT/'source/business/import-business-models.py').write_text(Path(__file__).read_text())
