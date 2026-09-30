"""Add original typographic operator titles to illustrative fallback liveries.
Requires the existing development Playwright environment; no downloaded artwork.
Run after make-aircraft.py and before branding demo/ground rigs.
"""
import json,math,struct,html
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'public/models/fleet'
names={'THY':'TURKISH AIRLINES','UAL':'UNITED','AAL':'AMERICAN','DAL':'DELTA','BAW':'BRITISH AIRWAYS','DLH':'LUFTHANSA','AFR':'AIR FRANCE','KLM':'KLM','QTR':'QATAR','UAE':'EMIRATES','PGT':'PEGASUS','SWA':'SOUTHWEST','JBU':'JETBLUE','ETH':'ETHIOPIAN','SAS':'SAS','RYR':'RYANAIR','EZY':'EASYJET','WZZ':'WIZZ AIR','SIA':'SINGAPORE AIRLINES','CPA':'CATHAY PACIFIC','ANA':'ANA','JAL':'JAPAN AIRLINES','QFA':'QANTAS','ACA':'AIR CANADA'}
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True,args=['--no-sandbox']);page=browser.new_page(viewport={'width':1024,'height':128})
    for operator,title in names.items():
        svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="128"><text x="512" y="93" text-anchor="middle" fill="white" font-family="DejaVu Sans,sans-serif" font-weight="bold" font-size="{min(100,1450/len(title))}">{html.escape(title)}</text></svg>'
        page.set_content('<style>body{margin:0;background:transparent}</style>'+svg);page.screenshot(path=str(root/f'title-{operator}.png'),omit_background=True)
    browser.close()
for path in root.glob('*-v4.gltf'):
    operator=path.stem.split('-')[-2]
    if operator not in names:continue
    g=json.loads(path.read_text())
    if any(m.get('name')=='Operator title' for m in g['materials']):continue
    body=next(p for p in g['meshes'][0]['primitives'] if p['material']==0);a=g['accessors'][body['attributes']['POSITION']];L=a['max'][2]-a['min'][2];r=a['max'][0]
    if L<20:continue
    name=path.stem.split('-')[0];positions=[];normals=[];uvs=[]
    for side in [-1,1]:
        for i in range(16):
            for j in range(3):
                corners=[]
                for u,v in [(i/16,j/3),((i+1)/16,j/3),((i+1)/16,(j+1)/3),(i/16,(j+1)/3)]:
                    z=r*(.36+v*.25);y=side*(math.sqrt(max(.01,r*r-z*z))+.028);x=L*(-.12+u*.37)
                    corners.append(((y,z*(1.18 if name=='a380' else 1),x),(side*.9,.35,0),(u if side<0 else 1-u,1-v)))
                for k in [0,1,2,0,2,3]:
                    pos,n,uv=corners[k];positions.append(pos);normals.append(n);uvs.append(uv)
    blob=bytearray();attrs={};buffer=len(g['buffers'])
    for key,rows in [('POSITION',positions),('NORMAL',normals),('TEXCOORD_0',uvs)]:
        raw=b''.join(struct.pack('<'+'f'*len(v),*v) for v in rows);view=len(g['bufferViews']);g['bufferViews'].append({'buffer':buffer,'byteOffset':len(blob),'byteLength':len(raw),'target':34962});blob.extend(raw)
        acc={'bufferView':view,'componentType':5126,'count':len(rows),'type':'VEC'+str(len(rows[0]))}
        if key=='POSITION':acc.update(min=[min(v[i] for v in rows) for i in range(3)],max=[max(v[i] for v in rows) for i in range(3)])
        attrs[key]=len(g['accessors']);g['accessors'].append(acc)
    filename=f'{name}-title.bin';(root/filename).write_bytes(blob);g['buffers'].append({'uri':filename+'?detail=6','byteLength':len(blob)})
    texture=len(g['textures']);g['textures'].append({'source':len(g['images']),'sampler':0});g['images'].append({'uri':f'title-{operator}.png'})
    color=[1,1,1,1] if operator=='SWA' else g['materials'][2]['pbrMetallicRoughness']['baseColorFactor']
    material=len(g['materials']);g['materials'].append({'name':'Operator title','doubleSided':True,'alphaMode':'MASK','alphaCutoff':.15,'pbrMetallicRoughness':{'baseColorTexture':{'index':texture},'baseColorFactor':color,'roughnessFactor':.6,'metallicFactor':0}})
    g['meshes'][0]['primitives'].append({'attributes':attrs,'material':material});path.write_text(json.dumps(g,separators=(',',':')))
print('Added original operator typography to fallback liveries')
