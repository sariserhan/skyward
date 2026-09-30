"""Fixed-angle aircraft visual regression capture, with optional approved baselines.
Run after npm run build. Outputs go to SKYWARD_QA_ARTIFACTS or a temp directory.
SKYWARD_MODEL_BASELINES=/path enables pixel comparison; UPDATE_MODEL_BASELINES=1
explicitly accepts new baselines. MODEL_GALLERY_ALL=1 covers all fallback profiles.
"""
import os,json,base64,shutil
from pathlib import Path
from playwright.sync_api import expect
import regression as f

def run(p):
 errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.add_init_script(f.INIT.replace("if(k==='Viewer')", "if(k==='CesiumWidget')return new Proxy(t[k],{construct(t,args){const w=Reflect.construct(t,args);window.__galleryWidget=w;return w;}});if(k==='Viewer')"))
 for path in ['area','aircraft','search','status','route']:p.route('**/api/'+path+'*',f.mock)
 p.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded');assert 'Skyward' in p.title()
 p.get_by_role('button',name='Explore tools',exact=True).click(timeout=60000)
 d=p.get_by_role('dialog',name='Explore tools');d.get_by_role('button',name='Model gallery',exact=True).click()
 d.get_by_label('Model representation').select_option('fallback');d.get_by_label('Gallery quality').select_option('close')
 d.get_by_label('Gallery distance').fill('0.75');p.evaluate('__viewer.useDefaultRenderLoop=false')
 labels=d.locator('.gallery-list button strong').all_text_contents()
 selected=labels if os.environ.get('MODEL_GALLERY_ALL')=='1' else [x for x in labels if x in ['Boeing 737','Boeing 777','Boeing 747','Business jet','Turboprop']]
 assert len(selected)>=4,selected
 baseline=Path(os.environ['SKYWARD_MODEL_BASELINES']) if os.environ.get('SKYWARD_MODEL_BASELINES') else None
 if baseline:baseline.mkdir(parents=True,exist_ok=True)
 for label in selected:
  d.locator('.gallery-list button').filter(has=p.get_by_text(label,exact=True)).click()
  expect(d.get_by_text('Loading model…',exact=True)).not_to_be_visible(timeout=30000)
  for angle in ['Front','Side','Rear','Underside']:
   button=d.get_by_role('button',name=angle,exact=True);button.click();expect(button).to_have_attribute('aria-pressed','true');p.wait_for_timeout(400)
   path=f.ARTIFACTS/(label.replace(' ','-')+'-'+angle+'.png');d.locator('.model-preview').screenshot(path=str(path),animations='disabled')
   if baseline:
    old=baseline/path.name
    if os.environ.get('UPDATE_MODEL_BASELINES')=='1':shutil.copyfile(path,old)
    else:
     assert old.exists(),f'Missing approved baseline: {old}'
     urls=['data:image/png;base64,'+base64.b64encode(x.read_bytes()).decode() for x in [old,path]]
     difference=p.evaluate('''async urls=>{const images=await Promise.all(urls.map(url=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url})));if(images[0].width!==images[1].width||images[0].height!==images[1].height)return 1;const c=document.createElement('canvas');c.width=images[0].width;c.height=images[0].height;const ctx=c.getContext('2d');const data=images.map(i=>{ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(i,0,0);return ctx.getImageData(0,0,c.width,c.height).data});let n=0;for(let i=0;i<data[0].length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(data[0][i+k]-data[1][i+k])))>48)n++;return n/(c.width*c.height)}''',urls)
     assert difference<.02,(path.name,difference)
  d.get_by_role('button',name='Preview control surfaces',exact=True).click();expect(d.get_by_role('button',name='Stop surface preview',exact=True)).to_be_visible();p.wait_for_timeout(250)
  matrix=lambda:p.evaluate("Array.from({length:16},(_,i)=>__galleryWidget.scene.primitives.get(0).getNode('FlapL').matrix[i])")
  before=matrix();p.wait_for_timeout(600);assert before!=matrix(),'flap node must actually move'
  d.get_by_role('button',name='Stop surface preview',exact=True).click()
  d.get_by_role('button',name='Preview gear & wheels',exact=True).click();expect(d.get_by_role('button',name='Stop gear preview',exact=True)).to_be_visible();d.get_by_role('button',name='Stop gear preview',exact=True).click()
  print('PASS',label,'four inspection angles and rig controls',flush=True)
 p.set_viewport_size({'width':390,'height':844});p.wait_for_timeout(400);assert p.evaluate('document.documentElement.scrollWidth<=innerWidth');d.get_by_role('button',name='Side',exact=True).click();d.locator('.model-preview').screenshot(path=str(f.ARTIFACTS/'mobile-gallery.png'))
 assert not p.locator('vite-error-overlay,.cesium-widget-errorPanel').count();assert not errors,errors
 print('PASS mobile gallery; no framework overlay or JavaScript errors',flush=True)
f.serve(run)
