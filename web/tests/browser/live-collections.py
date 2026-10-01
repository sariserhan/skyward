"""Worldwide discovery -> dedicated route -> selected aircraft, plus off-globe announcements."""
import time,urllib.parse
import regression as f
from playwright.sync_api import expect

def run(page):
 errors=[];calls=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script(f.INIT)
 aircraft=dict(hex='750123',registration='9M-XXD',callsign='XAX123',aircraftType='',lat=3.1,lon=101.7,altitude=33000,ground=False,groundSpeed=450,heading=90,verticalRate=0,sourceType='fixture')
 def special(route):
  calls.append(route.request.url);stamp=int(time.time()*1000)
  route.fulfill(json=dict(state='ready',checkedAt=stamp,checkedAircraft=120,totalAircraft=120,rows=[dict(path='/ufc/9m-xxd/',aircraftId='notable-fixture',registration='9M-XXD',entityId='ufc',name='UFC',relationship='Team-branded airline aircraft',aircraft={**aircraft,'observedAt':stamp})]))
 def api(route):
  path=urllib.parse.urlparse(route.request.url).path
  if path=='/api/search':route.fulfill(json=dict(aircraft=[{**aircraft,'observedAt':int(time.time()*1000)}],source='fixture',fetchedAt=int(time.time()*1000)));return
  f.mock(route)
 page.route('**/api/**',api);page.route('**/api/special-flights',special)
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 menu=page.locator('.live-collections');watch=menu.get_by_role('link',name='Watch UFC aircraft live',exact=True)
 watch.wait_for(timeout=60000)
 assert '120/120 aircraft checked' in menu.inner_text()
 assert len(calls)==1
 assert page.locator('.special-flight-banner').count()==0
 assert '9M-XXD' in watch.inner_text()
 page.screenshot(path=str(f.ARTIFACTS/'special-worldwide-desktop.png'))
 watch.click()
 page.get_by_role('region',name='Passenger flight view').wait_for(timeout=60000)
 assert '/ufc/9m-xxd/' in page.url
 assert 'UFC' in page.title()
 page.wait_for_function("window.__viewer?.entities.getById('aircraft-750123')",timeout=60000)
 assert page.locator('.special-flight-banner').count()==0
 page.wait_for_function("window.__viewer.entities.getById('aircraft-750123').model.uri.getValue(__viewer.clock.currentTime).includes('a333')")
 page.get_by_text('Aircraft model & livery details',exact=True).click()
 expect(page.get_by_role('link',name='This aircraft’s appearance reference')).to_be_visible()
 page.reload();page.get_by_role('region',name='Passenger flight view').wait_for(timeout=60000)
 assert '/ufc/9m-xxd/' in page.url
 # Public reference pages have the same lightweight monitor without the globe engine.
 page.goto(f.URL+'/about/')
 banner=page.get_by_role('complementary',name='Special aircraft airborne')
 banner.wait_for()
 assert 'UFC aircraft is airborne' in banner.inner_text()
 assert banner.get_by_role('link',name='Watch flight →').get_attribute('href').startswith('/ufc/9m-xxd/')
 assert page.evaluate('window.__viewer===undefined')
 page.set_viewport_size({'width':390,'height':844})
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 box=banner.bounding_box();assert box['x']>=0 and box['x']+box['width']<=390
 page.screenshot(path=str(f.ARTIFACTS/'special-announcement-mobile.png'))
 banner.get_by_role('button',name='Dismiss aircraft announcement').click();expect(banner).to_have_count(0)
 page.reload();page.wait_for_timeout(700);expect(banner).to_have_count(0)
 # Expired fixes disappear without waiting for another successful API response.
 page.set_viewport_size({'width':1440,'height':1000});page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded');watch.wait_for(timeout=60000)
 page.evaluate('window.__shift+=121000');page.route('**/api/special-flights',lambda r:r.fulfill(json=dict(state='ready',checkedAt=0,checkedAircraft=120,totalAircraft=120,rows=[])))
 expect(watch).to_have_count(0,timeout=12000)
 assert not page.locator('vite-error-overlay,.cesium-widget-errorPanel').count()
 assert not errors,errors
 print('PASS worldwide sidebar outside camera area, dedicated route/reload, off-globe banner, dismissal, mobile bounds and stale removal',flush=True)
if __name__=='__main__':f.serve(run)
