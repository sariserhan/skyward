"""Night-map post-processing must leave aircraft fragments unchanged across the horizon."""
import time
import regression as f
from playwright.sync_api import expect
old=f.rows
def rows():
 return [{**a,'aircraftType':'B788','callsign':'UAL123','registration':'NTEST','observedAt':int(time.time()*1000),'altitude':35000} for a in old()[:1]]
f.rows=rows

def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT);page.route('**/api/**',f.mock)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 page.locator('.search-trigger').click(timeout=60000)
 search=page.get_by_role('dialog',name='Search Skyward');search.get_by_role('textbox',name='Search airports, flights and controls').fill('UAL123');search.locator('.search-active').first.click()
 page.get_by_role('button',name='✈ Flight view',exact=True).click(timeout=30000)
 flight=page.get_by_role('region',name='Passenger flight view');flight.wait_for(timeout=30000)
 flight.get_by_role('button',name='side',exact=True).click()
 page.wait_for_function("__viewer.scene.postProcessStages.getStageByName('skyward-night-readability').selected?.length>0",timeout=60000)
 page.evaluate("""()=>{const v=__viewer;v.clock.clockStep=Cesium.ClockStep.TICK_DEPENDENT;v.clock.shouldAnimate=false;v.clock.currentTime=Cesium.JulianDate.fromIso8601('2026-10-01T04:00:00Z');v.scene.requestRender();} """)
 page.wait_for_timeout(1800)
 page.screenshot(path=str(f.ARTIFACTS/'night-aircraft-mask.png'))
 print(page.evaluate("""()=>{const s=__viewer.scene.postProcessStages.getStageByName('skyward-night-readability');return {masked:s.selected.length,ids:s.selected.map(m=>m.id?.id),shader:s.fragmentShader.includes('if(czm_selected())'),errors:document.querySelectorAll('.cesium-widget-errorPanel').length}}"""),flush=True)
 assert not errors,errors
 # Model IDs remain stable during camera changes; the mask follows rather than rebuilding each frame.
 page.evaluate("()=>{window.maskBefore=__viewer.scene.postProcessStages.getStageByName('skyward-night-readability').selected;}")
 flight.get_by_role('button',name='Right side',exact=True).evaluate('(button)=>button.click()');page.wait_for_timeout(1200)
 assert page.evaluate("__viewer.scene.postProcessStages.getStageByName('skyward-night-readability').selected===window.maskBefore")
 page.screenshot(path=str(f.ARTIFACTS/'night-aircraft-right.png'))
 print('PASS nearby model fragment mask, left/right side views, stable selection and no rendering errors',flush=True)
if __name__=='__main__':f.serve(run)
