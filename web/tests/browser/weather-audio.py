import time
import regression as f
from playwright.sync_api import expect
INIT="""window.__audio=[];const NativeAudio=window.AudioContext;window.AudioContext=new Proxy(NativeAudio,{construct(T,args){const c=Reflect.construct(T,args);c.testStarts=[];c.testStops=0;c.testTargets=[];const buffer=c.createBufferSource.bind(c),gain=c.createGain.bind(c);c.createBufferSource=()=>{const s=buffer(),start=s.start.bind(s),stop=s.stop.bind(s);s.start=(at=0,...rest)=>{c.testStarts.push({at,now:c.currentTime});return start(at,...rest)};s.stop=(...args)=>{c.testStops++;return stop(...args)};return s};c.createGain=()=>{const g=gain(),target=g.gain.setTargetAtTime.bind(g.gain);g.gain.setTargetAtTime=(value,...args)=>{c.testTargets.push(value);return target(value,...args)};return g};window.__audio.push(c);return c}});"""
def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT);page.add_init_script(INIT)
 for path in ['area?*','aircraft?*','route?*','status']:page.route('**/api/'+path,f.mock)
 report=dict(station='TEST',lat=38.95,lon=-77.8,elevationM=100,observedAt=int(time.time()*1000),distanceKm=0,raw='Fixture',clouds=[dict(cover='SCT',baseM=12000)],cloudsKnown=True,rain=.35,snow=0,hail=False,storm=False,fog=False,visibilityKm=10,temperatureC=10,windDirection=270,windKnots=12,gustKnots=15)
 page.route('**/api/local-weather?*',lambda r:r.fulfill(json={'status':'current','report':report}))
 def enter():
  page.goto(f.URL+'/?audioTest='+str(report['storm'])+'#airport=IAD');page.get_by_role('button',name='View THY111',exact=True).click(timeout=30000);page.get_by_role('button',name='✈ Flight view',exact=True).click();page.evaluate("__viewer.clock.currentTime=Cesium.JulianDate.fromIso8601('2026-09-29T17:00:00Z');__viewer.clock.shouldAnimate=false;__viewer.scene.requestRender()");page.wait_for_function('__audio.some(c=>c.testTargets.some(v=>Math.abs(v-.0315)<.001))',timeout=30000)
 enter();page.wait_for_timeout(1500)
 assert page.evaluate('__viewer.scene.skyAtmosphere.saturationShift>-.3')
 page.screenshot(path=str(f.ARTIFACTS/'light-rain-sky-audio.jpg'),type='jpeg',quality=65)
 assert page.evaluate('__audio.every(c=>c.testStarts.every(s=>s.at<=s.now+.1))')
 page.get_by_role('switch',name='Cabin audio',exact=True).click();page.wait_for_function('__audio.every(c=>c.state!=="running")')
 page.get_by_role('switch',name='Cabin audio',exact=True).click();page.wait_for_function('__audio.some(c=>c.state==="running")')
 report['storm']=True;enter()
 page.wait_for_function('__audio.some(c=>c.testStarts.some(s=>s.at>s.now+1))',timeout=25000)
 page.wait_for_function('__viewer.scene.skyAtmosphere.saturationShift<-.8')
 page.screenshot(path=str(f.ARTIFACTS/'storm-sky-audio.jpg'),type='jpeg',quality=65)
 before=page.evaluate('__audio.reduce((n,c)=>n+c.testStops,0)')
 page.get_by_role('switch',name='Cabin audio',exact=True).click();page.wait_for_function('__audio.every(c=>c.state!=="running")')
 assert page.evaluate('__audio.reduce((n,c)=>n+c.testStops,0)')>before
 page.get_by_role('button',name='Close flight view',exact=True).click();page.wait_for_function('__audio.every(c=>c.state==="closed")')
 assert not errors,errors
 print('PASS actual Web Audio rain-only mix, delayed storm thunder, mute/resume, pending-thunder cancellation and context disposal',flush=True)
if __name__=='__main__':f.serve(run)
