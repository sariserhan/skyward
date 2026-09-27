from pathlib import Path
from datetime import datetime
import importlib.util
sp=importlib.util.spec_from_file_location('reg',str(Path(__file__).with_name('regression.py')));f=importlib.util.module_from_spec(sp);sp.loader.exec_module(f)
def run(page):
 errors=[];console=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
 when=datetime.fromisoformat('2026-09-28T04:00:00+00:00');f.anchor=int(when.timestamp()*1000);page.clock.set_fixed_time(when);page.add_init_script(f.INIT);page.route('**/api/**',f.mock)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded');page.get_by_role('button',name='View THY111',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click()
 page.wait_for_function("__viewer.scene.postProcessStages.getStageByName('skyward-night-readability')?.ready",timeout=30000)
 page.wait_for_function("__viewer.imageryLayers.length>=2",timeout=30000)
 page.evaluate("window.lightPoints=()=>{const v=__viewer;const all=[];for(let i=0;i<v.scene.primitives.length;i++){const p=v.scene.primitives.get(i);if(p instanceof Cesium.PointPrimitiveCollection)for(let j=0;j<p.length;j++)if(p.get(j).id?.id==='aircraft-abcdef')all.push(p.get(j));}return all;}")
 page.wait_for_function('lightPoints().length===6',timeout=20000)
 page.evaluate("()=>{window.blinkSamples=[];window.stopBlinkCapture=__viewer.scene.preRender.addEventListener(()=>{blinkSamples.push(lightPoints().map(p=>p.show));if(blinkSamples.length>500)blinkSamples.shift();});}")
 page.wait_for_function('blinkSamples.some(s=>s[3])&&blinkSamples.some(s=>!s[3])&&blinkSamples.some(s=>s[5])&&blinkSamples.some(s=>!s[5])',timeout=20000)
 page.evaluate('()=>{stopBlinkCapture();}')
 before=page.evaluate('lightPoints()[0].position.x');page.evaluate('window.__shift+=30000');page.wait_for_timeout(1600);assert page.evaluate('lightPoints()[0].position.x')!=before
 page.screenshot(path=str(f.ARTIFACTS/'plane-lights.png'))
 page.get_by_role('button',name='Cabin',exact=True).click();page.wait_for_timeout(1400);page.screenshot(path=str(f.ARTIFACTS/'cabin-lights.png'))
 page.get_by_role('button',name='Close flight view').click()
 # Frame the American night side close enough to see the NASA urban light distribution.
 page.evaluate("()=>{const C=Cesium;__viewer.camera.cancelFlight();__viewer.camera.setView({destination:C.Cartesian3.fromDegrees(-90,36,10000000)});__viewer.scene.requestRender();}");page.wait_for_timeout(1700)
 page.screenshot(path=str(f.ARTIFACTS/'night-countries-cities.png'))
 stage="__viewer.scene.postProcessStages.getStageByName('skyward-night-readability')"
 page.evaluate(stage+'.enabled=false');page.evaluate('__viewer.scene.requestRender()');page.wait_for_timeout(300);page.screenshot(path=str(f.ARTIFACTS/'without-readability.png'))
 page.evaluate(stage+'.enabled=true');page.evaluate('__viewer.scene.requestRender()');page.wait_for_timeout(300)
 # The dedicated city-light layer must remain last and invisible in daylight.
 assert page.evaluate('(()=>{const ls=__viewer.imageryLayers,l=ls.get(ls.length-1);return l.dayAlpha===0&&l.nightAlpha===.62;})()')
 assert not errors,errors;assert not page.locator('.cesium-widget-errorPanel').count();assert not console,console
 print('PASS readable night map, NASA overlay, navigation lights, independent blinking and moving anchors; no renderer errors',flush=True)
f.serve(run)
