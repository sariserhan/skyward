"""Controlled frame-cadence regression, not a GPU/FPS benchmark."""
import json
import regression as f

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.clock.install();page.add_init_script(f.INIT);page.route('**/api/**',f.mock)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 page.get_by_role('button',name='View THY111',exact=True).click(timeout=45000)
 page.get_by_role('button',name='✈ Flight view',exact=True).click()
 page.evaluate('__viewer.resolutionScale=.2')
 panel=page.get_by_role('region',name='Passenger flight view')
 for view in ['orbit','Bird’s-eye','side','Pilot cockpit']:
  panel.get_by_role('button',name=view,exact=True).click();page.wait_for_timeout(2500)
  page.evaluate('''() => {
   window.__motionResult=null;
   const v=__viewer,C=Cesium,rows=[];let previous,previousCamera,priorTime;
   const remove=v.scene.postRender.addEventListener(()=>{
    const e=v.entities.getById('aircraft-abcdef'),p=e?.position?.getValue(v.clock.currentTime);if(!p)return;
    const now=performance.now();if(previous)rows.push({dt:now-priorTime,step:C.Cartesian3.distance(p,previous),cameraStep:C.Cartesian3.distance(v.camera.positionWC,previousCamera)});
    previous=C.Cartesian3.clone(p);previousCamera=C.Cartesian3.clone(v.camera.positionWC);priorTime=now;
   });setTimeout(()=>{remove();window.__motionResult={frames:rows.length,stalled:rows.filter(r=>r.step<.00001).length,cameraStalled:rows.filter(r=>r.cameraStep<.00001).length};},1000);
  }''')
  page.clock.run_for(1100)
  result=page.evaluate('window.__motionResult')
  print(view,json.dumps(result),flush=True)
  assert result['frames']>10 and result['stalled']/result['frames']<.05 and result['cameraStalled']/result['frames']<.05,result
 page.screenshot(path=str(f.ARTIFACTS/'flight-cadence.png'))
 assert not page.locator('vite-error-overlay,.cesium-widget-errorPanel').count()
 assert not errors,errors
 print('PASS no application errors',flush=True)
if __name__=='__main__':f.serve(run)
