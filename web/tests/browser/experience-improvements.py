"""Optional synthetic traffic isolation and improved flight interaction checks."""
import time,urllib.parse
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];missing=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('response',lambda r:missing.append(r.url) if r.status>=400 and '/models/fleet/' in r.url else None)
 page.add_init_script(f.INIT);page.add_init_script("localStorage.setItem('skyward.guide.v1','done')")
 def empty(r):r.fulfill(json={'aircraft':[],'source':'test fixture','sourceAt':int(time.time()*1000),'fetchedAt':int(time.time()*1000)})
 for path in ['area?*','aircraft?*']:page.route('**/api/'+path,empty)
 page.route('**/api/route?*',f.mock);page.route('**/api/search?*',f.mock);page.route('**/api/status',f.mock)
 page.goto(f.URL+'/#airport=TAS');page.get_by_role('button',name='Try Skyward simulated traffic',exact=True).click(timeout=30000)
 demo=page.get_by_role('region',name='Skyward simulated traffic');expect(demo).to_be_visible();expect(demo).to_contain_text('Fictional flights at TAS');expect(demo.locator('li')).to_have_count(6)
 page.wait_for_function("__viewer.dataSources.getByName('skyward-fictional-traffic')[0]?.entities.values.length===6")
 assert page.evaluate("__viewer.entities.values.filter(e=>e.id.startsWith('aircraft-')).length")==0
 demo.locator('li button').first.click();page.wait_for_timeout(2000)
 page.wait_for_function("__viewer.trackedEntity?.id==='skyward-demo-0'")
 before=page.evaluate("(()=>{const e=__viewer.dataSources.getByName('skyward-fictional-traffic')[0].entities.values[0];return JSON.stringify(e.position.getValue(__viewer.clock.currentTime))})()")
 page.wait_for_timeout(600);after=page.evaluate("(()=>{const e=__viewer.dataSources.getByName('skyward-fictional-traffic')[0].entities.values[0];return JSON.stringify(e.position.getValue(__viewer.clock.currentTime))})()");assert before!=after
 page.screenshot(path=str(f.ARTIFACTS/'skyward-demo.jpg'),type='jpeg');page.set_viewport_size({'width':390,'height':844});expect(demo).to_be_visible();assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(f.ARTIFACTS/'skyward-demo-mobile.jpg'),type='jpeg')
 demo.get_by_role('button',name='Explore Premium',exact=True).click();expect(page.get_by_role('dialog',name='See more of every journey.')).to_be_visible();page.get_by_role('button',name='Close upgrade details',exact=True).click()
 page.get_by_role('button',name='Close simulated traffic',exact=True).click();page.wait_for_function("__viewer.dataSources.getByName('skyward-fictional-traffic').length===0");page.set_viewport_size({'width':1440,'height':1000})
 page.get_by_role('button',name='Search /',exact=True).click();page.get_by_label('Search airports, flights and controls').fill('THY111');page.get_by_role('button',name='Look up callsign · THY111',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click();page.get_by_role('button',name='Pilot cockpit',exact=True).click();scope=page.get_by_role('region',name='Cockpit route map');expect(scope).to_be_visible();scope.get_by_label('Mini-map view').select_option('regional');scope.get_by_role('button',name='Zoom mini-map in',exact=True).click();expect(scope).to_contain_text('nm direct to LHR');page.screenshot(path=str(f.ARTIFACTS/'cockpit-map-improved.jpg'),type='jpeg')
 assert not missing,missing;assert not errors,errors
 print('PASS optional TAS demo, six separate simulated models, movement, mobile layout, cleanup, exact global search and cockpit map controls',flush=True)

if __name__=='__main__':f.serve(run)
