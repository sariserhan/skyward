import json,struct,math,copy
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public/models/fleet'
for name,(length,diameter) in {'b737':(40,3.8),'a320':(38,4),'b787':(63,5.8),'regional':(32,3),'bizjet':(22,2.5),'turboprop':(23,2.8)}.items():
 g=json.loads((root/f'{name}-SKYWARD-v1.gltf').read_text());g['images'][0]['uri']='../../airlines/SKYWARD-tail-v2.png'
 texture=len(g['textures']);g['images'].append({'uri':'../../airlines/SKYWARD-body-v2.png'});g['textures'].append({'source':len(g['images'])-1,'sampler':g['textures'][0].get('sampler',0)})
 mat=copy.deepcopy(g['materials'][5]);mat['name']='SkyWard fuselage title';mat['pbrMetallicRoughness']['baseColorTexture']={'index':texture};mat['emissiveTexture']={'index':texture};material=len(g['materials']);g['materials'].append(mat)
 # Remove the old flat wordmark panels, retaining the aircraft and its animation rig.
 g['meshes'][0]['primitives']=[p for p in g['meshes'][0]['primitives'] if not g['buffers'][g['bufferViews'][g['accessors'][p['attributes']['POSITION']]['bufferView']]['buffer']]['uri'].endswith('SKYWARD-decal.bin')]
 rows=[];r=diameter/2;width=diameter*2.2;height=width/4;z=length*.15
 for side in [-1,1]:
  for j in range(16):
   y0=-height/2+j*height/16;y1=y0+height/16
   corners=[(side*(math.sqrt(r*r-y0*y0)+.03),y0,z-width/2),(side*(math.sqrt(r*r-y0*y0)+.03),y0,z+width/2),(side*(math.sqrt(r*r-y1*y1)+.03),y1,z+width/2),(side*(math.sqrt(r*r-y1*y1)+.03),y1,z-width/2)]
   for i in [0,1,2,0,2,3]:
    p=corners[i];u=(p[2]-z+width/2)/width;rows.append({'p':p,'n':(side,0,0),'uv':(1-u if side>0 else u,1-(p[1]+height/2)/height)})
 blob=bytearray();attrs={}
 for key,field in [('POSITION','p'),('NORMAL','n'),('TEXCOORD_0','uv')]:
  values=[row[field] for row in rows];raw=b''.join(struct.pack('<'+'f'*len(v),*v) for v in values);g['bufferViews'].append({'buffer':len(g['buffers']),'byteOffset':len(blob),'byteLength':len(raw),'target':34962});blob.extend(raw);attrs[key]=len(g['accessors']);acc={'bufferView':len(g['bufferViews'])-1,'componentType':5126,'count':len(rows),'type':'VEC'+str(len(values[0]))}
  if key=='POSITION':acc.update(min=[min(v[i] for v in values) for i in range(3)],max=[max(v[i] for v in values) for i in range(3)])
  g['accessors'].append(acc)
 file=f'{name}-SKYWARD-body-v2.bin';(root/file).write_bytes(blob);g['buffers'].append({'uri':file,'byteLength':len(blob)});g['meshes'][0]['primitives'].append({'attributes':attrs,'material':material});(root/f'{name}-SKYWARD-v2.gltf').write_text(json.dumps(g,separators=(',',':')))
