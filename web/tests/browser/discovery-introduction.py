"""First-visit messaging, collection discovery, shared favorites and flight sharing."""
import time,json
from pathlib import Path
from playwright.sync_api import expect
import regression as f
CAT=json.loads((f.ROOT/'data/airframe-catalog.json').read_text())
A=next(a for a in CAT['aircraft'] if any(r['value']=='9M-XXD' for r in a['registrations']))
def run(page):
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.add_init_script(f.INIT)
 page.route('**/api/**',f.mock)
 def special(route):
  stamp=int(time.time()*1000)
  route.fulfill(json={'state':'ready','checkedAt':stamp,'checkedAircraft':120,'totalAircraft':120,'rows':[{'path':'/ufc/9m-xxd/','aircraftId':A['id'],'registration':'9M-XXD','entityId':'ufc','name':'UFC','relationship':'Branded aircraft','aircraft':{'hex':'750123','registration':'9M-XXD','callsign':'XAX123','aircraftType':'A333','lat':3.1,'lon':101.7,'altitude':33000,'ground':False,'groundSpeed':450,'observedAt':stamp}}]})
 page.route('**/api/special-flights',special)
 page.goto(f.URL+'/',wait_until='domcontentloaded')
 guide=page.get_by_role('complementary',name='Getting started');guide.wait_for(timeout=60000)
 expect(guide).to_contain_text('Watch real aircraft')
 page.screenshot(path=str(f.ARTIFACTS/'introduction-desktop.png'))
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(300)
 box=guide.bounding_box();assert box['x']>=0 and box['x']+box['width']<=391 and box['y']>=0 and box['y']+box['height']<=845,box
 page.screenshot(path=str(f.ARTIFACTS/'introduction-mobile.png'))
 guide.get_by_role('button',name='Find a flight').click();expect(guide).not_to_be_visible()
 assert page.evaluate("localStorage.getItem('skyward.guide.v2')")=='done'
 page.goto(f.URL+'/collections/sports/',wait_until='domcontentloaded')
 expect(page.get_by_role('heading',name='Sports-team aircraft',exact=True)).to_be_visible(timeout=30000)
 expect(page.get_by_role('navigation',name='Aircraft collections')).to_be_visible()
 assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 page.screenshot(path=str(f.ARTIFACTS/'sports-mobile.png'))
 page.evaluate('(id)=>localStorage.setItem("skyward.airframe-follows.v1",JSON.stringify([id]))',A['id'])
 page.goto(f.URL+'/following/',wait_until='domcontentloaded')
 panel=page.get_by_role('region',name='Followed aircraft airborne')
 expect(panel.get_by_role('link',name='Watch 9M-XXD')).to_be_visible(timeout=30000)
 assert panel.get_by_role('link').get_attribute('href').endswith('#scene=flight&view=side')
 page.set_viewport_size({'width':1440,'height':1000})
 page.goto(f.URL+'/#airport=IAD',wait_until='domcontentloaded')
 page.locator('.search-trigger').click(timeout=60000)
 search=page.get_by_role('dialog',name='Search Skyward');search.get_by_role('textbox',name='Search airports, flights and controls').fill('THY111')
 search.locator('.search-active').first.click()
 page.get_by_role('button',name='✈ Flight view',exact=True).click(timeout=30000)
 flight=page.get_by_role('region',name='Passenger flight view');flight.wait_for(timeout=60000)
 flight.get_by_role('button',name='Share view',exact=True).click()
 share=flight.get_by_role('region',name='Share current view');expect(share).to_be_visible()
 assert 'scene=flight' in share.get_by_role('textbox',name='Shareable view link').input_value()
 page.screenshot(path=str(f.ARTIFACTS/'flight-sharing.png'))
 assert not errors,errors
 assert not page.locator('vite-error-overlay,.cesium-widget-errorPanel').count()
 print('PASS desktop/mobile introduction, search CTA, sports collection, shared favorites, flight-view sharing, no runtime errors',flush=True)
if __name__=='__main__':f.serve(run)
