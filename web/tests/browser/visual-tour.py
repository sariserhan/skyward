"""Repeatable scenery fixtures + an existing end-to-end watched landing/taxi flow."""
import time,json,os
import regression as f
import landing

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT)
 for path in ['area?*','aircraft?*','route?*','status']:page.route('**/api/'+path,f.mock)
 report=dict(station='TEST',lat=38.95,lon=-77.8,elevationM=100,observedAt=int(time.time()*1000),distanceKm=0,raw='Visual test fixture',clouds=[dict(cover='BKN',baseM=9000)],cloudsKnown=True,rain=0,snow=0,hail=False,storm=False,fog=False,visibilityKm=20,temperatureC=10,windDirection=270,windKnots=10,gustKnots=12)
 page.route('**/api/local-weather?*',lambda r:r.fulfill(json={'status':'current','report':report}))
 page.route('**/models/**/*.gltf',lambda r:(time.sleep(.35),r.continue_()))
 metrics=[]
 for name,date,rain in [('daylight','2026-09-29T17:00:00Z',0),('sunset','2026-09-29T22:45:00Z',0),('rain','2026-09-29T17:00:00Z',.8)]:
  report.update(rain=rain,storm=rain>0,observedAt=int(time.time()*1000))
  page.goto(f.URL+'/?visual='+name+'#airport=IAD');page.get_by_role('button',name='View THY111',exact=True).click(timeout=30000);page.get_by_role('button',name='✈ Flight view',exact=True).click()
  page.evaluate('(d)=>{const v=__viewer,C=Cesium;v.clock.clockStep=C.ClockStep.TICK_DEPENDENT;v.clock.currentTime=C.JulianDate.fromIso8601(d);v.clock.shouldAnimate=false;v.scene.requestRender()}',date)
  page.wait_for_function("__viewer.entities.getById('aircraft-abcdef')?.model?.customShader")
  page.wait_for_function("__viewer.scene.primitives._primitives.some(p=>p instanceof Cesium.PrimitiveCollection&&p.length>0)")
  page.wait_for_timeout(2500)
  result=page.evaluate('''()=>new Promise(resolve=>{const samples=[];let last=performance.now(),start=last;const tick=now=>{samples.push(now-last);last=now;if(now-start<1500){requestAnimationFrame(tick);return;}samples.sort((a,b)=>a-b);resolve({frames:samples.length,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],entities:__viewer.entities.values.length});};requestAnimationFrame(tick);})''')
  metrics.append({'scene':name,**result});assert not page.locator('.recovery-screen,.cesium-widget-errorPanel').count()
  page.screenshot(path=str(f.ARTIFACTS/(name+'.jpg')),type='jpeg',quality=75)
 assert not errors,errors
 (f.ARTIFACTS/'visual-frame-times.json').write_text(json.dumps({'browser':os.environ.get('SKYWARD_QA_BROWSER','chromium'),'note':'Headless fixture timings; not a real-device GPU benchmark.','scenes':metrics},indent=2))
 print('PASS daylight, sunset and rain scenes with frame-time evidence',flush=True)
if __name__=='__main__':
 f.serve(run)
 os.environ['SKYWARD_VISUAL_NIGHT']='1'
 f.serve(landing.run)
