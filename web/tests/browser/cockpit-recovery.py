"""Cockpit loading and error isolation regression with deterministic aircraft data."""
from playwright.sync_api import expect
import regression as f

def run(page):
 page.add_init_script(f.INIT)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.route('**/CockpitView-*.js',lambda r:r.abort())
 for path in ['area?*','aircraft?*','route?*','status']:page.route('**/api/'+path,f.mock)
 page.route('**/api/local-weather?*',lambda r:r.fulfill(json={'status':'unavailable','report':None}));page.route('**/api/weather-overview',lambda r:r.fulfill(json={'reports':[]}))
 page.goto(f.URL+'/#airport=IAD');page.get_by_role('button',name='View THY111',exact=True).wait_for(timeout=30000);page.get_by_role('button',name='View THY111',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click();page.get_by_role('button',name='Pilot cockpit',exact=True).click();expect(page.get_by_role('region',name='Pilot cockpit')).to_be_visible();assert not errors,errors
 print('PASS cockpit opens with former lazy-download path blocked',flush=True)
 page.get_by_role('button',name='Side view',exact=True).click();page.evaluate("(()=>{window.__failCockpitAudio=true;const original=AudioParam.prototype.setTargetAtTime;AudioParam.prototype.setTargetAtTime=function(...args){if(window.__failCockpitAudio)throw new Error('Injected cockpit audio failure');return original.apply(this,args)}})()")
 page.get_by_role('button',name='Pilot cockpit',exact=True).click();expect(page.get_by_role('alert',name='Cockpit recovery')).to_be_visible();assert page.locator('.recovery-screen').count()==0;assert page.evaluate('!__viewer.isDestroyed()')
 page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(f.ARTIFACTS/'pilot-recovery-mobile.jpg'),type='jpeg',quality=75);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.evaluate('window.__failCockpitAudio=false');page.get_by_role('button',name='Retry pilot view',exact=True).click();expect(page.get_by_role('region',name='Pilot cockpit')).to_be_visible();page.set_viewport_size({'width':1440,'height':1000})
 page.get_by_role('button',name='Side view',exact=True).click();page.evaluate('window.__failCockpitAudio=true');page.get_by_role('button',name='Pilot cockpit',exact=True).click();expect(page.get_by_role('alert',name='Cockpit recovery')).to_be_visible();page.evaluate('window.__failCockpitAudio=false');page.get_by_role('button',name='Return to side view',exact=True).click();expect(page.get_by_role('region',name='Passenger flight view')).to_be_visible();assert page.locator('.recovery-screen,.cockpit-recovery').count()==0
 print('PASS cockpit effect failure isolated, mobile fallback, retry and side-view recovery',flush=True)

if __name__=='__main__':f.serve(run)
