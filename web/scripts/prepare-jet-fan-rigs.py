"""Build fan-only animation metadata. No source geometry or liveries are rewritten."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
names={
'b738':['fan','fan2'],'b39m':['n1.fan','n2.fan'],'b3xm':['n1.fan','n2.fan'],
**{k:['blades','blades_001','fanWheel','fanWheel_001'] for k in ['a318','a319','a320','a321']},
**{k:['fan_l','fan_r'] for k in ['e170','e190']},'beluga':['eng1Fan','eng2Fan'],
'a332':['fan0','fan1'],'a343':['Blades','Blades_001','Blades_002','Blades_003'],
'crj2':['eng1fan','eng2fan'],**{k:['Blades','Blades_001'] for k in ['crj700','crj900']},
'citation':['LEngine_fanSlow','REngine_fanSlow'],
'b773':['Lfan','Lfan_001','Rfan','Rfan_001'],'b772':['Lfan','Rfan'],
'b788':['eng1fan','eng1fanb','eng2fan','eng2fanb'],'b744':['Blades','Blades_001','Blades_002','Blades_003'],
'a359':['fan_eng1','fan_eng2','fan2_eng1','fan2_eng2'],
'cs100':['fanL','fanR'],'cs300':['fanL','fanR'],'c750':['LHfan','RHfan'],'b752':['turbofan_1','turbofan_2']}
# A380 contains individual fan meshes for multiple engine variants, not casings.
a380=json.loads((root/'public/models/sourced/a380-v1.gltf').read_text())
names['a380']=[n['name'] for n in a380['nodes'] if re.fullmatch(r'fan(?:_\d+)?',n.get('name',''))]
rigs={}
for id,selected in names.items():
 g=json.loads((root/f'public/models/sourced/{id}-v1.gltf').read_text());groups=[]
 for name in selected:
  n=next(n for n in g['nodes'] if n.get('name')==name)
  if 'mesh' not in n:raise ValueError((id,name,n))
  values=[g['accessors'][p['attributes']['POSITION']] for p in g['meshes'][n['mesh']]['primitives']]
  lo=[min(a['min'][i] for a in values) for i in range(3)];hi=[max(a['max'][i] for a in values) for i in range(3)];extent=[hi[i]-lo[i] for i in range(3)];axis=min(range(3),key=lambda i:extent[i]);radii=[extent[i] for i in range(3) if i!=axis]
  # Catch accidental casing / fuselage selection and implausible fan geometry.
  if min(radii)<=0 or max(radii)/min(radii)>1.5 or extent[axis]>min(radii)*.65:raise ValueError((id,name,extent))
  groups.append(dict(nodes=[name],axis=axis,pivot=[(lo[i]+hi[i])/2 for i in range(3)],kind='fan'))
 hide=['LEngine_fanFast','LEngine_fanMedium','REngine_fanFast','REngine_fanMedium'] if id=='citation' else [f'fanspin{i}' for i in range(1,5)] if id=='a346' else []
 rigs[id]=dict(groups=groups,hide=hide)
(root/'src/lib/jetFanRigs.json').write_text(json.dumps(rigs,indent=2)+'\n')
print(f'Prepared fan rigs for {len(rigs)} jet model families; source meshes unchanged.')
