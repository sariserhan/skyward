"""Add non-destructive rotor nodes and generate local-axis animation metadata.
Existing mesh buffers, source credit and licenses are retained.
"""
import json,struct
from pathlib import Path
root=Path(__file__).resolve().parents[1];source=root/'public/models/sourced';fleet=root/'public/models/fleet';rigs={}
def bounds(g,names):
 vals=[]
 for n in g['nodes']:
  if n.get('name') in names and 'mesh' in n:
   vals += [g['accessors'][p['attributes']['POSITION']] for p in g['meshes'][n['mesh']]['primitives']]
 return ([min(a['min'][i] for a in vals) for i in range(3)],[max(a['max'][i] for a in vals) for i in range(3)])
def group(g,names,axis=None,center=None,kind='propeller'):
 lo,hi=bounds(g,names);axis=axis if axis is not None else min(range(3),key=lambda i:hi[i]-lo[i]);return dict(nodes=names,axis=axis,pivot=center or [(lo[i]+hi[i])/2 for i in range(3)],kind=kind)
for id in ['pa18','pa28','pa32','sr22','dr40','pc12','c208','c182','q400','atr42','atr72','ec35','b407']:
 path=source/f'{id}-v1.gltf';g=json.loads(path.read_text());names=[n.get('name','') for n in g['nodes']];groups=[];hide=[]
 if id=='b407':
  for file in [path,*sorted((source/'branded').glob('b407-*-v1.gltf'))]:
   model=json.loads(file.read_text())
   if not any(n.get('name')=='SkywardMainRotor' for n in model['nodes']):
    n=next(n for n in model['nodes'] if n.get('name')=='tailrotor');mesh=model['meshes'][n['mesh']];original=list(mesh['primitives']);mesh['primitives']=[p for i,p in enumerate(original) if i not in [5,7]]
    for index,name in [(7,'SkywardMainRotor'),(5,'SkywardTailRotor')]:
     mi=len(model['meshes']);model['meshes'].append({'primitives':[original[index]]});ni=len(model['nodes']);model['nodes'].append({'name':name,'mesh':mi});n.setdefault('children',[]).append(ni)
    model['asset'].setdefault('extras',{})['rotorRig']='Skyward: separate existing main/tail rotor primitives; source licenses retained.';file.write_text(json.dumps(model,separators=(',',':')))
  g=json.loads(path.read_text());groups=[group(g,['SkywardMainRotor'],1,kind='main'),group(g,['SkywardTailRotor'],0,kind='tail')]
 elif id=='ec35':
  lo,hi=bounds(g,['Flexbeam']);center=[(lo[i]+hi[i])/2 for i in range(3)]
  groups=[group(g,[n for n in names if n.startswith('blade') and n!='blade1.002']+['Flexbeam','rotorcap'],1,center,'main'),group(g,['Tblade'],0,kind='tail')];hide=[n for n in names if n.startswith('blurred')]+['rotor_disc_T']
 elif id=='atr72':
  for side in ['l','r']:
   lo,hi=bounds(g,[side+'propblur']);groups.append(group(g,[side+'prop'+str(i) for i in range(1,7)],2,[(lo[i]+hi[i])/2 for i in range(3)]));hide.append(side+'propblur')
 elif id in ['q400','atr42']:
  groups=[group(g,[n]) for n in (['propL','propR'] if id=='q400' else ['Prop1','Prop2'])]
 elif id=='c182':
  lo,hi=bounds(g,['FastProp']);groups=[group(g,['SlowProp'],2,[(lo[i]+hi[i])/2 for i in range(3)])];hide=['FastProp']
 else:
  lo,hi=bounds(g,['propdisc']);groups=[group(g,['helice'],2,[(lo[i]+hi[i])/2 for i in range(3)])];hide=['propblur','propdisc']
 rigs[id]={'groups':groups,'hide':hide}
# Fallback props share a material with static windows/engines: split by their
# known generated blade planes, retaining all original vertex attributes.
for profile in ['turboprop','light','pc12']:
 canonical=json.loads((fleet/(profile+'-neutral-v4.gltf')).read_text());length=next(n for n in canonical['nodes'] if n.get('name')=='WheelN')['translation'][2]/.29
 hubs=[[-26*.19,1.4*.3,.0675*length],[26*.19,1.4*.3,.0675*length]] if profile=='turboprop' else [[0,0,.52*length]]
 files=sorted(fleet.glob(profile+'-*-v4.gltf'))+list(fleet.glob(profile+'-SKYWARD-v1.gltf'))
 for file in files:
  g=json.loads(file.read_text())
  if any(n.get('name','').startswith('SkywardProp') for n in g['nodes']):continue
  wheel=next((n for n in g['nodes'] if n.get('name')=='WheelN'),None)
  if not wheel:continue
  length=wheel['translation'][2]/.29
  hubs=[[-26*.19,1.4*.3,.0675*length],[26*.19,1.4*.3,.0675*length]] if profile=='turboprop' else [[0,0,.52*length]]
  raw=bytearray();meshes=[[] for _ in hubs]
  def indexed(primitive,indices):
   view=len(g['bufferViews']);offset=len(raw);raw.extend(struct.pack('<'+'I'*len(indices),*indices));g['bufferViews'].append({'buffer':len(g['buffers']),'byteOffset':offset,'byteLength':len(indices)*4,'target':34963});acc=len(g['accessors']);g['accessors'].append({'bufferView':view,'componentType':5125,'count':len(indices),'type':'SCALAR'});return {**primitive,'indices':acc}
  for mesh in list(g['meshes']):
   updated=[]
   for prim in mesh['primitives']:
    if prim.get('material')!=3 or 'indices' in prim:updated.append(prim);continue
    acc=g['accessors'][prim['attributes']['POSITION']];view=g['bufferViews'][acc['bufferView']];blob=(fleet/g['buffers'][view['buffer']]['uri'].split('?')[0]).read_bytes();base=view.get('byteOffset',0)+acc.get('byteOffset',0);stride=view.get('byteStride',12);keep=[];parts=[[] for _ in hubs]
    for i in range(0,acc['count'],3):
     pts=[struct.unpack_from('<fff',blob,base+j*stride) for j in [i,i+1,i+2]];hit=None
     for k,(x,y,z) in enumerate(hubs):
      if all(abs(p[2]-z)<length*.008 and abs(p[0]-x)<2.8 for p in pts):hit=k;break
     (keep if hit is None else parts[hit]).extend([i,i+1,i+2])
    if all(not p for p in parts):updated.append(prim);continue
    if keep:updated.append(indexed(prim,keep))
    for k,part in enumerate(parts):
     if part:meshes[k].append(indexed(prim,part))
   mesh['primitives']=updated
  if not any(meshes):continue
  for k,prims in enumerate(meshes):
   if not prims:continue
   mi=len(g['meshes']);g['meshes'].append({'primitives':prims});ni=len(g['nodes']);g['nodes'].append({'name':f'SkywardProp{k}','mesh':mi});g['scenes'][g.get('scene',0)]['nodes'].append(ni)
  filename=f'{profile}-rotor-indices.bin';(fleet/filename).write_bytes(raw);g['buffers'].append({'uri':filename,'byteLength':len(raw)});file.write_text(json.dumps(g,separators=(',',':')))
 rigs['fleet:'+profile]={'groups':[{'nodes':[f'SkywardProp{k}'],'axis':2,'pivot':hub,'kind':'propeller'} for k,hub in enumerate(hubs)],'hide':[]}
(root/'src/lib/rotorRigs.json').write_text(json.dumps(rigs,indent=2)+'\n')
print('Prepared rotor/propeller rigs for',len(rigs),'model families')
