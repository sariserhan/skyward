"""Original Skyward demonstration livery on existing illustrative, rigged profiles."""
import json,struct,math
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public'
svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="256" viewBox="0 0 1024 256"><circle cx="122" cy="128" r="100" fill="none" stroke="#aaf4d4" stroke-width="8"/><path d="M135 43 168 175 124 147 78 207Z" fill="white"/><path d="M135 43 124 147 78 207 97 86Z" fill="#84dec1"/><text x="255" y="169" fill="white" font-family="DejaVu Sans,sans-serif" font-size="110">SKYWARD</text></svg>'
(root/'airlines/SKYWARD.svg').write_text(svg)
# Playwright is only needed to regenerate the checked-in PNG texture.
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
 browser=pw.chromium.launch(headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1024,'height':256});page.set_content('<style>body{margin:0;background:transparent}</style>'+svg)
 page.screenshot(path=str(root/'airlines/SKYWARD.png'),omit_background=True);browser.close()
profiles={'b737':(40,3.8),'a320':(38,4),'b787':(63,5.8),'regional':(32,3),'bizjet':(22,2.5),'turboprop':(23,2.8)}
for name,(length,diameter) in profiles.items():
 p=root/'models/fleet'/f'{name}-THY-v4.gltf';g=json.loads(p.read_text());g['asset']['generator']='Skyward original fictional demonstration airline';g['images'][0]['uri']='../../airlines/SKYWARD.png'
 for idx in (2,7):g['materials'][idx]['pbrMetallicRoughness']['baseColorFactor']=[.035,.23,.23,1]
 g['materials'][0]['pbrMetallicRoughness']['baseColorFactor']=[.035,.12,.16,1]
 # Wordmark panels conform approximately to the upper fuselage sides.
 blob=bytearray();positions=[];normals=[];uvs=[]
 for sign in [-1,1]:
  radius=diameter/2;y0=radius*.2;y1=radius*.65;x0=sign*math.sqrt(radius**2-y0**2)*1.01;x1=sign*math.sqrt(radius**2-y1**2)*1.01
  corners=[(x0,y0,-length*.12),(x0,y0,length*.24),(x1,y1,length*.24),(x1,y1,-length*.12)]
  uv=[(0,1),(1,1),(1,0),(0,0)] if sign<0 else [(1,1),(0,1),(0,0),(1,0)]
  for i in [0,1,2,0,2,3]:positions.append(corners[i]);normals.append((sign,0,0));uvs.append(uv[i])
 attrs={};buffer=len(g['buffers'])
 for key,rows in [('POSITION',positions),('NORMAL',normals),('TEXCOORD_0',uvs)]:
  raw=b''.join(struct.pack('<'+'f'*len(row),*row) for row in rows);view=len(g['bufferViews']);g['bufferViews'].append({'buffer':buffer,'byteOffset':len(blob),'byteLength':len(raw),'target':34962});blob.extend(raw)
  acc={'bufferView':view,'componentType':5126,'count':len(rows),'type':'VEC'+str(len(rows[0]))}
  if key=='POSITION':acc.update(min=[min(r[i] for r in rows) for i in range(3)],max=[max(r[i] for r in rows) for i in range(3)])
  attrs[key]=len(g['accessors']);g['accessors'].append(acc)
 filename=f'{name}-SKYWARD-decal.bin';(p.parent/filename).write_bytes(blob);g['buffers'].append({'uri':filename,'byteLength':len(blob)});g['meshes'][0]['primitives'].append({'attributes':attrs,'material':5})
 (p.parent/f'{name}-SKYWARD-v1.gltf').write_text(json.dumps(g,separators=(',',':')))
print('Generated six Skyward demo liveries and original compass wordmark')
