#!/usr/bin/env python3
"""Rebuild the bundled static AC3D ground equipment as textured Wavefront meshes.
No runtime downloads. Upstream AC3D files and GPL license are retained alongside outputs.
This deliberately rejects rotations and unsupported surface types instead of silently
producing corrupt geometry. Selected source assets only use translations.
"""
import pathlib, shlex, urllib.request, json, hashlib, zipfile
ROOT = pathlib.Path(__file__).resolve().parents[1] / 'game/assets/ground-services'
BASE = 'https://raw.githubusercontent.com/mherweg/d-laser-fgtools/'
MODELS = ['luggage-truck-HD', 'luggage-cart-HD', 'fuel-truck', 'belt_loader', 'DFZ30']

def convert(name):
    lines = iter((ROOT/'source'/f'{name}.ac').read_text().splitlines())
    materials = []; objects = []
    def obj():
        item = {'verts': [], 'faces': [], 'loc': [0.,0.,0.], 'texture': '', 'name': name}
        for line in lines:
            t=shlex.split(line)
            if not t: continue
            k=t[0]
            if k=='name': item['name']=t[1]
            elif k=='texture': item['texture']=t[1]
            elif k=='loc': item['loc']=list(map(float,t[1:]))
            elif k=='rot': raise ValueError('Unsupported AC3D rotation')
            elif k=='numvert': item['verts']=[list(map(float,next(lines).split())) for _ in range(int(t[1]))]
            elif k=='numsurf':
                for _ in range(int(t[1])):
                    flags=int(next(lines).split()[1],0)
                    if flags & 15: raise ValueError('Non-polygon surface')
                    mat=int(next(lines).split()[1]); count=int(next(lines).split()[1])
                    refs=[next(lines).split() for _ in range(count)]
                    item['faces'].append((mat,refs))
            elif k=='kids':
                objects.append(item)
                for _ in range(int(t[1])):
                    assert next(lines).startswith('OBJECT ')
                    child=obj()
                    for j in range(3): child['loc'][j]+=item['loc'][j]
                return item
        return item
    for line in lines:
        t=shlex.split(line)
        if not t: continue
        if t[0]=='MATERIAL':
            rgb=list(map(float,t[t.index('rgb')+1:t.index('rgb')+4])); alpha=1-float(t[t.index('trans')+1]);materials.append((rgb,alpha))
        elif t[0]=='OBJECT': obj()
    out=[f'mtllib {name}.mtl']; mtl=[]; slots={}; vi=1; ti=1
    for ob in objects:
        if not ob['verts']: continue
        out.append('o '+ob['name']); current_slot=None
        for v in ob['verts']: out.append('v '+' '.join(str(v[j]+ob['loc'][j]) for j in range(3)))
        for mat,refs in ob['faces']:
            key=(mat,ob['texture'])
            if key not in slots:
                slot=f'mat{len(slots)}';slots[key]=slot;rgb,alpha=materials[mat]
                mtl.extend([f'newmtl {slot}','Kd '+' '.join(map(str,rgb)),f'd {alpha}','Ns 45'])
                if key[1]:mtl.append('map_Kd '+key[1])
            # Emit usemtl only when it changes; Godot treats it as a surface boundary.
            if not out or current_slot != slots[key]:
                out.append('usemtl '+slots[key]); current_slot=slots[key]
            face=[]
            for ref in refs:
                out.append(f'vt {ref[1]} {ref[2]}');face.append(f'{vi+int(ref[0])}/{ti}');ti+=1
            out.append('f '+' '.join(face))
        vi+=len(ob['verts'])
    (ROOT/f'{name}.obj').write_text('\n'.join(out)+'\n')
    (ROOT/f'{name}.mtl').write_text('\n'.join(mtl)+'\n')
    return {ob['texture'] for ob in objects if ob['texture']}

if __name__=='__main__':
    # Pin source revision; conversion remains reproducible offline on subsequent runs.
    manifest_path=ROOT/'sources.json'
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'repository':BASE,'revision':json.load(urllib.request.urlopen('https://api.github.com/repos/mherweg/d-laser-fgtools/commits/master'))['sha']}
    revision=manifest['revision'];textures=set()
    for name in MODELS:
        path=ROOT/'source'/f'{name}.ac'
        if not path.exists():path.write_bytes(urllib.request.urlopen(BASE+revision+'/Models/lib/'+name+'.ac').read())
        textures.update(convert(name))
    for texture in sorted(textures):
        path=ROOT/texture
        if not path.exists():path.write_bytes(urllib.request.urlopen(BASE+revision+'/Models/lib/'+texture).read())
    manifest['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ROOT.glob('*.png'))}
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    print('Converted',len(MODELS),'vehicles/equipment;',len(textures),'textures')

    # Publish editable sources with the web distribution as well as the repository.
    archive=ROOT.parents[2]/'web/public/assets/ground-services-source.zip'
    archive.parent.mkdir(parents=True,exist_ok=True)
    files=[p for p in ROOT.rglob('*') if p.is_file() and p.suffix not in ['.import','.uid']]
    files.append(pathlib.Path(__file__).resolve())
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as out:
        for path in sorted(files):
            name=str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else 'tools/import_ground_services.py'
            info=zipfile.ZipInfo(name,(2026,9,29,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            out.writestr(info,path.read_bytes())
