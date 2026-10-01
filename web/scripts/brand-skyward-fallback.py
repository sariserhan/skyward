import json,struct,math,copy
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public/models/fleet'
for name,(length,diameter) in {'b737':(40,3.8),'a320':(38,4),'b787':(63,5.8),'regional':(32,3),'bizjet':(22,2.5),'turboprop':(23,2.8)}.items():
 g=json.loads((root/f'{name}-SKYWARD-v1.gltf').read_text());g['images'][0]['uri']='../../airlines/SKYWARD-tail-v2.png'
 texture=len(g['textures']);g['images'].append({'uri':'../../airlines/SKYWARD-body-v3.png'});g['textures'].append({'source':len(g['images'])-1,'sampler':g['textures'][0].get('sampler',0)})
 mat=copy.deepcopy(g['materials'][5]);mat['name']='skyVVard fuselage title';mat['pbrMetallicRoughness']['baseColorTexture']={'index':texture};mat['emissiveTexture']={'index':texture};mat['emissiveFactor']=[.25,.25,.25];material=len(g['materials']);g['materials'].append(mat)
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
 # The inherited airline-logo primitive includes nose badges as well as the fin.
 # Keep only tail triangles so the body title cannot be obscured by an orbit badge.
 def read_accessor(index):
  acc=g['accessors'][index];view=g['bufferViews'][acc['bufferView']];data=(root/g['buffers'][view['buffer']]['uri'].split('?')[0]).read_bytes()
  dim={'SCALAR':1,'VEC3':3}[acc['type']];fmt={5123:'H',5125:'I',5126:'f'}[acc['componentType']];size=struct.calcsize('<'+fmt)*dim
  start=view.get('byteOffset',0)+acc.get('byteOffset',0)
  return [struct.unpack_from('<'+fmt*dim,data,start+i*view.get('byteStride',size)) for i in range(acc['count'])]
 for primitive in g['meshes'][0]['primitives']:
  if primitive.get('material')!=5:continue
  points=read_accessor(primitive['attributes']['POSITION']);indices=[v[0] for v in read_accessor(primitive['indices'])]
  kept=[idx for offset in range(0,len(indices),3) if all(points[idx][2]<-length*.2 for idx in indices[offset:offset+3]) for idx in indices[offset:offset+3]]
  if not kept:raise ValueError('Missing tail logo triangles: '+name)
  while len(blob)%4:blob.append(0)
  raw=struct.pack('<'+'I'*len(kept),*kept);view=len(g['bufferViews']);g['bufferViews'].append({'buffer':len(g['buffers']),'byteOffset':len(blob),'byteLength':len(raw),'target':34963});blob.extend(raw)
  primitive['indices']=len(g['accessors']);g['accessors'].append({'bufferView':view,'componentType':5125,'count':len(kept),'type':'SCALAR'})
 file=f'{name}-SKYWARD-body-v3.bin';(root/file).write_bytes(blob);g['buffers'].append({'uri':file,'byteLength':len(blob)});g['meshes'][0]['primitives'].append({'attributes':attrs,'material':material});(root/f'{name}-SKYWARD-v2.gltf').write_text(json.dumps(g,separators=(',',':')))
