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
 page.goto(f.URL+'/#airport=TAS');page.wait_for_function("window.__viewer && __viewer.entities.values.filter(e=>e.id.startsWith('aircraft-skyward-')).length===20",timeout=60000)
 page.get_by_role('button',name='Search /',exact=True).click();page.get_by_label('Search airports, flights and controls').fill('THY111');page.get_by_role('button',name='Look up callsign · THY111',exact=True).click();page.get_by_role('button',name='✈ Flight view',exact=True).click();page.get_by_role('button',name='Pilot cockpit',exact=True).click();scope=page.get_by_role('region',name='Cockpit route map');expect(scope).to_be_visible();scope.get_by_label('Mini-map view').select_option('regional');scope.get_by_role('button',name='Zoom mini-map in',exact=True).click();expect(scope).to_contain_text('nm direct to LHR');page.screenshot(path=str(f.ARTIFACTS/'cockpit-map-improved.jpg'),type='jpeg')
 assert not missing,missing;assert not errors,errors
 print('PASS automatic TAS traffic, exact global search and cockpit map controls',flush=True)

if __name__=='__main__':f.serve(run)
